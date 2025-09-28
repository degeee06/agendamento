import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { createClient } from "@supabase/supabase-js";



const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;



// ---------------- Supabase ----------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------- Clientes e planilhas ----------------
const planilhasClientes = {
  cliente1: process.env.ID_PLANILHA_CLIENTE1,
  cliente2: process.env.ID_PLANILHA_CLIENTE2
};
const clientesValidos = Object.keys(planilhasClientes);

// ---------------- Google Service Account ----------------
let creds;
try {
  creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
} catch (e) {
  console.error("Erro ao parsear GOOGLE_SERVICE_ACCOUNT:", e);
  process.exit(1);
}

// ---------------- App ----------------
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ---------------- Middleware Auth ----------------
async function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ msg: "Token não enviado" });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ msg: "Token inválido" });

  req.user = data.user;
  req.clienteId = data.user.user_metadata.cliente_id;
  if (!req.clienteId) return res.status(403).json({ msg: "Usuário sem cliente_id" });
  next();
}

// ---------------- Google Sheets Corrigido ----------------
async function accessSpreadsheet(cliente) {
  try {
    const SPREADSHEET_ID = planilhasClientes[cliente];
    
    if (!SPREADSHEET_ID) {
      throw new Error(`ID da planilha não encontrado para o cliente: ${cliente}`);
    }

    console.log('📊 Acessando planilha:', { cliente, SPREADSHEET_ID });
    
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    
    // Método correto de autenticação para a versão mais recente
    await doc.useServiceAccountAuth({
      client_email: creds.client_email,
      private_key: creds.private_key,
    });
    
    await doc.loadInfo(); // Carrega informações da planilha
    
    console.log('✅ Planilha carregada:', doc.title);
    return doc;
  } catch (error) {
    console.error('❌ Erro ao acessar planilha:', error);
    throw new Error(`Falha ao acessar Google Sheets: ${error.message}`);
  }
}

async function ensureDynamicHeaders(sheet, newKeys) {
  try {
    // Tenta carregar os headers existentes
    await sheet.loadHeaderRow().catch(async () => {
      // Se não existir header, cria um novo
      console.log('📋 Criando novo header row:', newKeys);
      await sheet.setHeaderRow(newKeys);
    });
    
    const currentHeaders = sheet.headerValues || [];
    const headersToAdd = newKeys.filter((k) => !currentHeaders.includes(k));
    
    if (headersToAdd.length > 0) {
      console.log('📋 Adicionando novos headers:', headersToAdd);
      await sheet.setHeaderRow([...currentHeaders, ...headersToAdd]);
    }
    
    console.log('✅ Headers verificados/atualizados');
  } catch (error) {
    console.error('❌ Erro ao garantir headers:', error);
    throw error;
  }
}

// ---------------- Funções Auxiliares Melhoradas ----------------
function normalizarData(data) {
  // Garante que a data está no formato YYYY-MM-DD
  return new Date(data).toISOString().split('T')[0];
}

function normalizarHorario(horario) {
  // Garante que o horário está no formato HH:MM:SS
  if (horario.includes(':')) {
    const parts = horario.split(':');
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`;
  }
  return horario;
}

// ---------------- Disponibilidade Corrigida ----------------
async function horarioDisponivel(cliente, data, horario, ignoreId = null) {
  try {
    const dataNormalizada = normalizarData(data);
    const horarioNormalizado = normalizarHorario(horario);

    console.log('🔍 Verificando disponibilidade:', { 
      cliente, 
      data: dataNormalizada, 
      horario: horarioNormalizado, 
      ignoreId 
    });

    // Query mais específica para agendamentos ativos
    let query = supabase
      .from("agendamentos")
      .select("id, status, nome, email")
      .eq("cliente", cliente)
      .eq("data", dataNormalizada)
      .eq("horario", horarioNormalizado)
      .in("status", ["pendente", "confirmado"]); // Apenas status ativos

    if (ignoreId) {
      query = query.neq("id", ignoreId);
    }

    const { data: agendamentos, error } = await query;
    
    if (error) {
      console.error('❌ Erro ao verificar disponibilidade:', error);
      throw error;
    }

    const disponivel = agendamentos.length === 0;
    
    console.log('📊 Resultado disponibilidade:', { 
      disponivel, 
      agendamentosEncontrados: agendamentos.length,
      agendamentos: agendamentos 
    });
    
    return disponivel;
  } catch (error) {
    console.error('💥 Erro na função horarioDisponivel:', error);
    throw error;
  }
}

// ---------------- Transação Segura Corrigida ----------------
async function executarAgendamentoSeguro(cliente, dadosAgendamento) {
  try {
    console.log('💾 Tentando inserir agendamento:', { cliente, ...dadosAgendamento });

    const { data, error } = await supabase
      .from("agendamentos")
      .insert([{
        ...dadosAgendamento,
        cliente,
        status: "confirmado",
        confirmado: true,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao inserir agendamento:', error);
      
      // Se for erro de duplicação, verifica qual agendamento está causando o conflito
      if (error.code === '23505') {
        const { data: conflito } = await supabase
          .from("agendamentos")
          .select("id, status, nome, created_at")
          .eq("cliente", cliente)
          .eq("data", dadosAgendamento.data)
          .eq("horario", dadosAgendamento.horario)
          .neq("status", "cancelado")
          .single();

        if (conflito) {
          throw new Error(`Horário ocupado por: ${conflito.nome} (Status: ${conflito.status})`);
        }
      }
      throw new Error(`Erro no banco de dados: ${error.message}`);
    }

    console.log('✅ Agendamento inserido com sucesso:', data.id);
    return data;
  } catch (error) {
    console.error('💥 Erro na função executarAgendamentoSeguro:', error);
    throw error;
  }
}

// ---------------- Rotas ----------------
app.get("/", (req, res) => res.send("Servidor rodando"));

app.get("/:cliente", (req, res) => {
  const cliente = req.params.cliente;
  if (!clientesValidos.includes(cliente)) return res.status(404).send("Cliente não encontrado");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});



// ---------------- Agendar Corrigido ----------------
app.post("/agendar/:cliente", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { Nome, Email, Telefone, Data, Horario } = req.body;
    if (!Nome || !Email || !Telefone || !Data || !Horario)
      return res.status(400).json({ msg: "Todos os campos obrigatórios" });

    // Normaliza dados
    const dataNormalizada = normalizarData(Data);
    const horarioNormalizado = normalizarHorario(Horario);

    console.log('📅 Novo agendamento solicitado:', {
      cliente,
      Nome, 
      Email, 
      Data: dataNormalizada, 
      Horario: horarioNormalizado
    });

    // Verifica se a data não é no passado
    const dataAgendamento = new Date(`${dataNormalizada}T${horarioNormalizado}`);
    const agora = new Date();
    if (dataAgendamento < agora) {
      console.log('❌ Tentativa de agendar no passado:', dataAgendamento);
      return res.status(400).json({ msg: "Não é possível agendar para datas/horários passados" });
    }

    // Verifica limite de agendamentos por dia
    const { data: agendamentosHoje, error: errorLimite } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("email", Email)
      .eq("data", dataNormalizada)
      .neq("status", "cancelado");

    if (errorLimite) {
      console.error('❌ Erro ao verificar limite:', errorLimite);
      return res.status(500).json({ msg: "Erro ao verificar limite de agendamentos" });
    }

    if (agendamentosHoje && agendamentosHoje.length >= 3) {
      console.log('❌ Limite atingido para:', Email, 'Agendamentos hoje:', agendamentosHoje.length);
      return res.status(400).json({ msg: "Limite de 3 agendamentos por dia atingido" });
    }

    // Checa disponibilidade do horário
    const livre = await horarioDisponivel(cliente, dataNormalizada, horarioNormalizado);
    
    if (!livre) {
      console.log('❌ Horário indisponível:', { dataNormalizada, horarioNormalizado });
      return res.status(400).json({ msg: "Horário indisponível. Por favor, escolha outro horário." });
    }

    // Remove agendamento cancelado no mesmo horário (se existir)
    try {
      const { error: deleteError } = await supabase
        .from("agendamentos")
        .delete()
        .eq("cliente", cliente)
        .eq("data", dataNormalizada)
        .eq("horario", horarioNormalizado)
        .eq("status", "cancelado");

      if (deleteError) {
        console.log('⚠️ Não foi possível limpar agendamentos cancelados:', deleteError);
      }
    } catch (cleanupError) {
      console.log('⚠️ Erro na limpeza de cancelados (pode ignorar):', cleanupError);
    }

    // Insere novo agendamento
    const dadosAgendamento = {
      nome: Nome,
      email: Email,
      telefone: Telefone,
      data: dataNormalizada,
      horario: horarioNormalizado
    };

    const agendamento = await executarAgendamentoSeguro(cliente, dadosAgendamento);

    // Salva no Google Sheets (opcional - não quebra se falhar)
    try {
      const doc = await accessSpreadsheet(cliente);
      const sheet = doc.sheetsByIndex[0] || await doc.addSheet({ headerValues: Object.keys(agendamento) });
      
      await ensureDynamicHeaders(sheet, Object.keys(agendamento));
      
      // Prepara os dados para a planilha
      const rowData = {};
      Object.keys(agendamento).forEach(key => {
        const value = agendamento[key];
        rowData[key] = (value && typeof value === 'object') ? JSON.stringify(value) : value;
      });
      
      await sheet.addRow(rowData);
      console.log('✅ Agendamento salvo no Google Sheets');
    } catch (sheetsError) {
      console.error('⚠️ Erro ao salvar no Google Sheets (agendamento foi criado no Supabase):', sheetsError.message);
      // Não quebra o fluxo - apenas loga o erro
    }

    console.log('✅ Agendamento criado com sucesso ID:', agendamento.id);
    
    res.json({ 
      msg: "Agendamento realizado com sucesso!", 
      agendamento: agendamento
    });
  } catch (err) {
    console.error("💥 Erro no agendamento:", err);
    
    if (err.message.includes("Horário ocupado por:")) {
      return res.status(400).json({ msg: err.message });
    }
    
    if (err.message.includes("Erro no banco de dados")) {
      return res.status(500).json({ msg: "Erro interno no banco de dados" });
    }
    
    res.status(500).json({ msg: "Erro interno no servidor" });
  }
});

// ---------------- Debug: Ver Agendamentos ----------------
app.get("/debug/agendamentos/:cliente", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    const { data, horario } = req.query;

    let query = supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente);

    if (data) {
      query = query.eq("data", normalizarData(data));
    }
    if (horario) {
      query = query.eq("horario", normalizarHorario(horario));
    }

    const { data: agendamentos, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ 
      cliente, 
      data, 
      horario, 
      total: agendamentos.length, 
      agendamentos 
    });
  } catch (err) {
    console.error("Erro no debug:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- Reagendar Corrigido ----------------
app.post("/reagendar/:cliente/:id", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { id } = req.params;
    const { novaData, novoHorario } = req.body;
    if (!novaData || !novoHorario) return res.status(400).json({ msg: "Nova data e horário obrigatórios" });

    // Normaliza dados
    const dataNormalizada = normalizarData(novaData);
    const horarioNormalizado = normalizarHorario(novoHorario);

    // Verifica se a nova data não é no passado
    const dataAgendamento = new Date(`${dataNormalizada}T${horarioNormalizado}`);
    if (dataAgendamento < new Date()) {
      return res.status(400).json({ msg: "Não é possível reagendar para datas/horários passados" });
    }

    const { data: agendamento, error: errorGet } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("id", id)
      .eq("cliente", cliente)
      .single();

    if (errorGet || !agendamento) return res.status(404).json({ msg: "Agendamento não encontrado" });

    // Checa se novo horário está livre, ignorando o próprio ID
    const livre = await horarioDisponivel(cliente, dataNormalizada, horarioNormalizado, id);
    if (!livre) return res.status(400).json({ msg: "Horário indisponível" });

    // Atualiza o agendamento existente com verificação de constraint
    const { data: novo, error: errorUpdate } = await supabase
      .from("agendamentos")
      .update({
        data: dataNormalizada,
        horario: horarioNormalizado,
        status: "pendente",
        confirmado: false,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (errorUpdate) {
      if (errorUpdate.code === '23505') {
        return res.status(400).json({ msg: "Horário já ocupado por outro agendamento" });
      }
      return res.status(500).json({ msg: "Erro ao reagendar" });
    }

    // Atualiza Google Sheets
    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(novo));
    const rows = await sheet.getRows();
    const row = rows.find(r => r.id === novo.id);
    if (row) {
      row.data = novo.data;
      row.horario = novo.horario;
      row.status = novo.status;
      row.confirmado = novo.confirmado;
      await row.save();
    } else {
      await sheet.addRow(novo);
    }

    res.json({ msg: "Reagendamento realizado com sucesso!", agendamento: novo });
  } catch (err) {
    console.error("Erro no reagendamento:", err);
    res.status(500).json({ msg: "Erro interno no servidor" });
  }
});

// ---------------- Confirmar ----------------
app.post("/confirmar/:cliente/:id", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { id } = req.params;
    const { data, error } = await supabase
      .from("agendamentos")
      .update({ status: "confirmado", confirmado: true })
      .eq("id", id)
      .eq("cliente", cliente)
      .select()
      .single();

    if (error) return res.status(500).json({ msg: "Erro ao confirmar agendamento" });
    if (!data) return res.status(404).json({ msg: "Agendamento não encontrado" });

    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(data));
    const rows = await sheet.getRows();
    const row = rows.find(r => r.id === data.id);
    if (row) {
      row.status = "confirmado";
      row.confirmado = true;
      await row.save();
    } else {
      await sheet.addRow(data);
    }

    res.json({ msg: "Agendamento confirmado!", agendamento: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- Cancelar ----------------
app.post("/cancelar/:cliente/:id", authMiddleware, async (req, res) => {
  try {
    const { cliente, id } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { data, error } = await supabase
      .from("agendamentos")
      .update({ status: "cancelado", confirmado: false })
      .eq("id", id)
      .eq("cliente", cliente)
      .select()
      .single();

    if (error) return res.status(500).json({ msg: "Erro ao cancelar agendamento" });
    if (!data) return res.status(404).json({ msg: "Agendamento não encontrado" });

    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(data));
    const rows = await sheet.getRows();
    const row = rows.find(r => r.id == data.id);
    if (row) {
      row.status = "cancelado";
      row.confirmado = false;
      await row.save();
    } else {
      await sheet.addRow(data);
    }

    res.json({ msg: "Agendamento cancelado!", agendamento: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno ao cancelar" });
  }
});

// ---------------- Listar ----------------
app.get("/meus-agendamentos/:cliente", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { data, error } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente)
      .order("data", { ascending: true })
      .order("horario", { ascending: true });

    if (error) return res.status(500).json({ msg: "Erro Supabase" });

    res.json({ agendamentos: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- Verificar Disponibilidade ----------------
app.get("/disponibilidade/:cliente", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    const { data, horario } = req.query;

    if (!data || !horario) {
      return res.status(400).json({ msg: "Data e horário são obrigatórios" });
    }

    const dataNormalizada = normalizarData(data);
    const horarioNormalizado = normalizarHorario(horario);

    const disponivel = await horarioDisponivel(cliente, dataNormalizada, horarioNormalizado);

    res.json({ disponivel });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro ao verificar disponibilidade" });
  }
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));



