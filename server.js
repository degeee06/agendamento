import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { GoogleSpreadsheet } from "google-spreadsheet";

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors({
  origin: [
    'https://frontrender.netlify.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let creds;
try {
  creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
} catch (e) {
  console.error("Erro ao parsear GOOGLE_SERVICE_ACCOUNT:", e);
  process.exit(1);
}

// ---------------- GOOGLE SHEETS POR USUÁRIO ----------------
async function accessUserSpreadsheet(userEmail, userMetadata) {
  try {
    // 🔥 CORREÇÃO: Pega spreadsheet_id do metadata passado como parâmetro
    const spreadsheetId = userMetadata?.spreadsheet_id;
    
    if (!spreadsheetId) {
      console.log(`📝 Usuário ${userEmail} não configurou Sheets`);
      return null;
    }
    
    const doc = new GoogleSpreadsheet(spreadsheetId);
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
    
    console.log(`✅ Acessando planilha do usuário: ${userEmail}`);
    return doc;
  } catch (error) {
    console.error(`❌ Erro ao acessar planilha do usuário ${userEmail}:`, error.message);
    return null;
  }
}

// 🔥 CORREÇÃO: Função createSpreadsheetForUser atualizada
async function createSpreadsheetForUser(userEmail, userName) {
  try {
    console.log('🔧 Iniciando criação de planilha para:', userEmail);
    
    const doc = new GoogleSpreadsheet();
    await doc.useServiceAccountAuth(creds);
    
    // Cria a planilha
    await doc.createNewSpreadsheetDocument({
      title: `Agendamentos - ${userName || userEmail}`.substring(0, 100), // Limita tamanho do título
    });
    
    console.log('📊 Planilha criada, ID:', doc.spreadsheetId);
    
    // Configura cabeçalhos padrão
    const sheet = doc.sheetsByIndex[0];
    await sheet.setHeaderRow([
      'id', 'nome', 'email', 'telefone', 'data', 'horario', 'status', 'confirmado', 'criado_em'
    ]);
    
    // 🔥 ADICIONE: Compartilha a planilha com o email do usuário (se disponível)
    try {
      await doc.shareWithEmail(userEmail, {
        role: 'writer',
        emailMessage: 'Planilha de agendamentos compartilhada com você!'
      });
      console.log('✅ Planilha compartilhada com:', userEmail);
    } catch (shareError) {
      console.warn('⚠️ Não foi possível compartilhar a planilha:', shareError.message);
    }
    
    console.log(`📊 Nova planilha criada para ${userEmail}: ${doc.spreadsheetId}`);
    return doc.spreadsheetId;
    
  } catch (error) {
    console.error("❌ Erro ao criar planilha:", error);
    throw new Error(`Falha ao criar planilha: ${error.message}`);
  }
}

async function ensureDynamicHeaders(sheet, newKeys) {
  await sheet.loadHeaderRow().catch(async () => await sheet.setHeaderRow(newKeys));
  const currentHeaders = sheet.headerValues || [];
  const headersToAdd = newKeys.filter((k) => !currentHeaders.includes(k));
  if (headersToAdd.length > 0) {
    await sheet.setHeaderRow([...currentHeaders, ...headersToAdd]);
  }
}

async function updateRowInSheet(sheet, rowId, updatedData) {
  if (!sheet) return;
  
  await sheet.loadHeaderRow();
  const rows = await sheet.getRows();
  const row = rows.find(r => r.id === rowId);
  if (row) {
    Object.keys(updatedData).forEach(key => {
      if (sheet.headerValues.includes(key)) row[key] = updatedData[key];
    });
    await row.save();
  } else {
    await ensureDynamicHeaders(sheet, Object.keys(updatedData));
    await sheet.addRow(updatedData);
  }
}

// ---------------- MIDDLEWARE AUTH ----------------
async function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ msg: "Token não enviado" });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ msg: "Token inválido" });

  req.user = data.user;
  next();
}

// ---------------- HEALTH CHECK ----------------
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "Backend rodando com Sheets por usuário",
    timestamp: new Date().toISOString()
  });
});

// 🔥 CORREÇÃO: Rota configurar-sheets com melhor tratamento de erro
app.post("/configurar-sheets", authMiddleware, async (req, res) => {
  try {
    const { spreadsheetId, criarAutomatico } = req.body;
    const userEmail = req.user.email;
    
    console.log('🔧 Configurando Sheets para:', userEmail, { spreadsheetId, criarAutomatico });
    
    let finalSpreadsheetId = spreadsheetId;

    // 🔥 SE USUÁRIO QUISER CRIAR PLANILHA AUTOMÁTICA
    if (criarAutomatico) {
      console.log('🔧 Criando planilha automática para:', userEmail);
      finalSpreadsheetId = await createSpreadsheetForUser(userEmail, req.user.user_metadata?.name);
      console.log('✅ Planilha criada com ID:', finalSpreadsheetId);
    }

    if (!finalSpreadsheetId) {
      return res.status(400).json({ msg: "Spreadsheet ID é obrigatório" });
    }

    // 🔥 VERIFICA SE A PLANILHA É ACESSÍVEL ANTES DE SALVAR
    try {
      console.log('🔧 Verificando acesso à planilha:', finalSpreadsheetId);
      const doc = new GoogleSpreadsheet(finalSpreadsheetId);
      await doc.useServiceAccountAuth(creds);
      await doc.loadInfo();
      console.log('✅ Planilha acessível:', doc.title);
    } catch (accessError) {
      console.error('❌ Erro ao acessar planilha:', accessError.message);
      return res.status(400).json({ 
        msg: "Não foi possível acessar a planilha. Verifique o ID e as permissões." 
      });
    }

    // 🔥 SALVA NO METADATA DO USUÁRIO
   // 🔥 CORREÇÃO: Use a Admin API para atualizar o usuário sem sessão
console.log('🔧 Salvando spreadsheet_id no metadata:', finalSpreadsheetId);

// Use o user ID do req.user para atualizar via Admin API
const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
  req.user.id,
  { 
    user_metadata: { 
      ...req.user.user_metadata, // Mantém os metadata existentes
      spreadsheet_id: finalSpreadsheetId 
    } 
  }
);

if (updateError) {
  console.error('❌ Erro ao atualizar usuário:', updateError);
  throw updateError;
}

console.log('✅ Usuário atualizado com sucesso:', updatedUser.user.email);
    console.log('✅ Sheets configurado com sucesso para:', userEmail);
    
    res.json({ 
      msg: criarAutomatico ? "✅ Planilha criada e configurada com sucesso!" : "✅ Spreadsheet configurado com sucesso!",
      spreadsheetId: finalSpreadsheetId
    });

  } catch (err) {
    console.error("❌ Erro ao configurar sheets:", err);
    res.status(500).json({ 
      msg: "Erro interno do servidor",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 🔥 CORREÇÃO: Rota configuracao-sheets
app.get("/configuracao-sheets", authMiddleware, async (req, res) => {
  try {
    const config = {
      temSheetsConfigurado: !!req.user.user_metadata?.spreadsheet_id,
      spreadsheetId: req.user.user_metadata?.spreadsheet_id
    };
    
    console.log(`📊 Configuração do usuário ${req.user.email}:`, config);
    res.json(config);
    
  } catch (err) {
    console.error("Erro ao verificar configuração:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});
// ---------------- ROTAS DE AGENDAMENTOS (ATUALIZADAS) ----------------
app.get("/agendamentos", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    
    const { data, error } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("email", userEmail)
      .order("data", { ascending: true })
      .order("horario", { ascending: true });

    if (error) throw error;
    res.json({ agendamentos: data });
  } catch (err) {
    console.error("Erro ao listar agendamentos:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- AGENDAR ----------------
app.post("/agendar", authMiddleware, async (req, res) => {
  try {
    const { Nome, Email, Telefone, Data, Horario } = req.body;
    if (!Nome || !Email || !Telefone || !Data || !Horario)
      return res.status(400).json({ msg: "Todos os campos obrigatórios" });

    const userEmail = req.user.email;
    const emailNormalizado = Email.toLowerCase().trim();
    const dataNormalizada = new Date(Data).toISOString().split("T")[0];

    const { data: novoAgendamento, error } = await supabase
      .from("agendamentos")
      .insert([{
        cliente: userEmail,
        nome: Nome,
        email: userEmail,
        telefone: Telefone,
        data: dataNormalizada,
        horario: Horario,
        status: "pendente",
        confirmado: false,
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ 
          msg: "Você já possui um agendamento para esta data e horário" 
        });
      }
      throw error;
    }

    // 🔥 CORREÇÃO: Use accessUserSpreadsheet() em vez de accessSpreadsheet()
   try {
      const doc = await accessUserSpreadsheet(userEmail, req.user.user_metadata);
      if (doc) {
        const sheet = doc.sheetsByIndex[0];
        await ensureDynamicHeaders(sheet, Object.keys(novoAgendamento));
        await sheet.addRow(novoAgendamento);
        console.log(`✅ Agendamento salvo na planilha do usuário ${userEmail}`);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    res.json({ msg: "Agendamento realizado com sucesso!", agendamento: novoAgendamento });

  } catch (err) {
    console.error("Erro no /agendar:", err);
    res.status(500).json({ msg: "Erro interno no servidor" });
  }
});



// 🔥 CORREÇÃO: Rota confirmar - passe userMetadata
app.post("/agendamentos/:email/confirmar/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user.email;
    
    const { data, error } = await supabase.from("agendamentos")
      .update({ confirmado: true, status: "confirmado" })
      .eq("id", id)
      .eq("email", userEmail)
      .select()
      .single();
    
    if (error) throw error;
    if (!data) return res.status(404).json({ msg: "Agendamento não encontrado" });

    try {
      // 🔥 CORREÇÃO: Adicione req.user.user_metadata
      const doc = await accessUserSpreadsheet(userEmail, req.user.user_metadata);
      if (doc) {
        await updateRowInSheet(doc.sheetsByIndex[0], id, data);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    res.json({ msg: "Agendamento confirmado", agendamento: data });
  } catch (err) {
    console.error("Erro ao confirmar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// 🔥 CORREÇÃO: Rota cancelar - passe userMetadata
app.post("/agendamentos/:email/cancelar/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user.email;
    
    const { data, error } = await supabase.from("agendamentos")
      .update({ status: "cancelado", confirmado: false })
      .eq("id", id)
      .eq("email", userEmail)
      .select()
      .single();
    
    if (error) throw error;
    if (!data) return res.status(404).json({ msg: "Agendamento não encontrado" });

    try {
      // 🔥 CORREÇÃO: Adicione req.user.user_metadata
      const doc = await accessUserSpreadsheet(userEmail, req.user.user_metadata);
      if (doc) {
        await updateRowInSheet(doc.sheetsByIndex[0], id, data);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    res.json({ msg: "Agendamento cancelado", agendamento: data });
  } catch (err) {
    console.error("Erro ao cancelar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// 🔥 CORREÇÃO: Rota reagendar - passe userMetadata
app.post("/agendamentos/:email/reagendar/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { novaData, novoHorario } = req.body;
    const userEmail = req.user.email;
    
    if (!novaData || !novoHorario) return res.status(400).json({ msg: "Data e horário obrigatórios" });
    
    const { data, error } = await supabase.from("agendamentos")
      .update({ 
        data: novaData, 
        horario: novoHorario,
        status: "pendente",
        confirmado: false
      })
      .eq("id", id)
      .eq("email", userEmail)
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ 
          msg: "Você já possui um agendamento para esta nova data e horário" 
        });
      }
      throw error;
    }
    if (!data) return res.status(404).json({ msg: "Agendamento não encontrado" });

    try {
      // 🔥 CORREÇÃO: Adicione req.user.user_metadata
      const doc = await accessUserSpreadsheet(userEmail, req.user.user_metadata);
      if (doc) {
        await updateRowInSheet(doc.sheetsByIndex[0], id, data);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    res.json({ msg: "Agendamento reagendado com sucesso", agendamento: data });
  } catch (err) {
    console.error("Erro ao reagendar:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- Error Handling ----------------
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ msg: "Algo deu errado!" });
});

app.use("*", (req, res) => {
  res.status(404).json({ msg: "Endpoint não encontrado" });
});

app.listen(PORT, () => console.log(`🚀 Backend rodando na porta ${PORT} - Sheets por usuário`));





