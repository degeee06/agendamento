import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { GoogleSpreadsheet } from "google-spreadsheet";
import OpenAI from "openai";

const PORT = process.env.PORT || 3000;
const app = express();

// ==================== CONFIGURAÇÃO IA ====================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ==================== CACHE SIMPLES E FUNCIONAL ====================
const cache = new Map();

const cacheManager = {
  set(key, value, ttl = 2 * 60 * 1000) {
    cache.set(key, {
      value,
      expiry: Date.now() + ttl
    });
  },

  get(key) {
    const item = cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      cache.delete(key);
      return null;
    }
    
    return item.value;
  },

  async getOrSet(key, fetchFn, ttl = 2 * 60 * 1000) {
    const cached = this.get(key);
    if (cached) {
      console.log('📦 Cache hit:', key);
      return cached;
    }

    console.log('🔄 Cache miss:', key);
    const value = await fetchFn();
    this.set(key, value, ttl);
    return value;
  },

  delete(key) {
    return cache.delete(key);
  },

  clear() {
    cache.clear();
  }
};

// ==================== CONFIGURAÇÃO INICIAL ====================
app.use(cors({
  origin: [
    'https://frontrender-iota.vercel.app',   // Vercel
    'http://localhost:3000',                 // Dev local
    'http://localhost:5173'                  // Dev Vite
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

async function createSpreadsheetForUser(userEmail, userName) {
  try {
    console.log('🔧 Iniciando criação de planilha para:', userEmail);
    
    const doc = new GoogleSpreadsheet();
    await doc.useServiceAccountAuth(creds);
    
    await doc.createNewSpreadsheetDocument({
      title: `Agendamentos - ${userName || userEmail}`.substring(0, 100),
    });
    
    console.log('📊 Planilha criada, ID:', doc.spreadsheetId);
    
    const sheet = doc.sheetsByIndex[0];
    await sheet.setHeaderRow([
      'id', 'nome', 'email', 'telefone', 'data', 'horario', 'status', 'confirmado', 'criado_em'
    ]);
    
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

// ==================== FUNÇÕES IA ====================

// Função para analisar descrição natural e extrair dados
async function analisarDescricaoNatural(descricao, userEmail) {
  try {
    const prompt = `
Analise esta descrição de agendamento e extraia as informações estruturadas:

DESCRIÇÃO: "${descricao}"

USUÁRIO: ${userEmail}

Extraia as seguintes informações:
- NOME: Nome da pessoa ou evento
- DATA: Data no formato YYYY-MM-DD (use datas futuras)
- HORARIO: Horário no formato HH:MM
- DESCRICAO: Breve descrição do compromisso

Se a data não for especificada, use amanhã.
Se o horário não for especificado, use 14:00.

Responda APENAS com JSON:
{
  "nome": "string",
  "data": "YYYY-MM-DD", 
  "horario": "HH:MM",
  "descricao": "string"
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 500
    });

    const resposta = completion.choices[0].message.content;
    return JSON.parse(resposta);
  } catch (error) {
    console.error("Erro ao analisar descrição:", error);
    throw new Error("Falha ao processar descrição natural");
  }
}

// Função para gerar sugestões inteligentes
async function gerarSugestoesInteligentes(agendamentos, userEmail) {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const agendamentosTexto = agendamentos.map(a => 
      `${a.data} ${a.horario} - ${a.nome} (${a.status})`
    ).join('\n');

    const prompt = `
Com base nos agendamentos do usuário ${userEmail}, gere sugestões úteis:

AGENDAMENTOS ATUAIS:
${agendamentosTexto}

DATA DE HOJE: ${hoje}

Analise e forneça:
1. Sugestões de otimização de agenda
2. Lembretes importantes
3. Padrões identificados
4. Recomendações para melhor organização

Seja conciso e prático. Responda em português.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 800
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error("Erro ao gerar sugestões:", error);
    return "Não foi possível gerar sugestões no momento.";
  }
}

// Função para conversar com assistente IA
async function conversarComAssistente(mensagem, agendamentos, userEmail) {
  try {
    const agendamentosTexto = agendamentos.slice(0, 10).map(a => 
      `${a.data} ${a.horario} - ${a.nome} (${a.status})`
    ).join('\n');

    const prompt = `
Você é um assistente de agenda inteligente. Ajude o usuário ${userEmail} com suas perguntas sobre agendamentos.

AGENDAMENTOS RECENTES:
${agendamentosTexto}

PERGUNTA DO USUÁRIO: "${mensagem}"

Responda de forma útil e amigável, focando em:
- Consultar agendamentos
- Sugerir horários
- Ajudar com organização
- Explicar funcionalidades

Mantenha a resposta concisa e prática. Use emojis quando apropriado.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
      max_tokens: 600
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error("Erro no assistente IA:", error);
    return "Desculpe, estou com dificuldades técnicas no momento. Tente novamente mais tarde.";
  }
}

// Função para gerar estatísticas e análise
async function gerarAnaliseEstatisticas(agendamentos, userEmail) {
  try {
    const total = agendamentos.length;
    const confirmados = agendamentos.filter(a => a.status === 'confirmado').length;
    const pendentes = agendamentos.filter(a => a.status === 'pendente').length;
    const esteMes = agendamentos.filter(a => a.data.startsWith(new Date().toISOString().slice(0, 7))).length;

    const prompt = `
Analise estas estatísticas de agendamentos e forneça insights úteis:

ESTATÍSTICAS:
- Total de agendamentos: ${total}
- Confirmados: ${confirmados}
- Pendentes: ${pendentes}
- Este mês: ${esteMes}
- Usuário: ${userEmail}

Forneça:
1. Análise breve dos dados
2. Sugestões de melhoria
3. Padrões identificados
4. Dicas de produtividade

Seja positivo e encorajador. Responda em português.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 600
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error("Erro ao gerar análise:", error);
    return "Análise indisponível no momento.";
  }
}

// ==================== ROTAS IA (NOVAS) ====================

// 🤖 ASSISTENTE IA - CHAT
app.post("/api/assistente-ia", authMiddleware, async (req, res) => {
  try {
    const { mensagem } = req.body;
    const userEmail = req.user.email;

    if (!mensagem) {
      return res.status(400).json({ success: false, msg: "Mensagem é obrigatória" });
    }

    // Busca agendamentos para contexto
    const { data: agendamentos, error } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("email", userEmail)
      .order("data", { ascending: true })
      .limit(20);

    if (error) throw error;

    const resposta = await conversarComAssistente(mensagem, agendamentos || [], userEmail);

    res.json({
      success: true,
      resposta,
      agendamentos_count: agendamentos?.length || 0
    });

  } catch (err) {
    console.error("Erro no assistente IA:", err);
    res.status(500).json({ 
      success: false, 
      msg: "Erro interno no assistente IA" 
    });
  }
});

// 🎯 AGENDAMENTO INTELIGENTE
app.post("/api/agendar-inteligente", authMiddleware, async (req, res) => {
  try {
    const { descricaoNatural } = req.body;
    const userEmail = req.user.email;

    if (!descricaoNatural) {
      return res.status(400).json({ success: false, msg: "Descrição é obrigatória" });
    }

    // Analisa a descrição natural
    const dadosAgendamento = await analisarDescricaoNatural(descricaoNatural, userEmail);

    // Cria o agendamento
    const { data: novoAgendamento, error } = await supabase
      .from("agendamentos")
      .insert([{
        cliente: userEmail,
        nome: dadosAgendamento.nome,
        email: userEmail,
        telefone: "(IA) Não informado",
        data: dadosAgendamento.data,
        horario: dadosAgendamento.horario,
        status: "pendente",
        confirmado: false,
        descricao: dadosAgendamento.descricao,
        criado_via_ia: true
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ 
          success: false,
          msg: "Já existe um agendamento para esta data e horário" 
        });
      }
      throw error;
    }

    // Atualiza Google Sheets se configurado
    try {
      const doc = await accessUserSpreadsheet(userEmail, req.user.user_metadata);
      if (doc) {
        const sheet = doc.sheetsByIndex[0];
        await ensureDynamicHeaders(sheet, Object.keys(novoAgendamento));
        await sheet.addRow(novoAgendamento);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    // Invalida cache
    cacheManager.delete(`agendamentos_${userEmail}`);

    res.json({
      success: true,
      msg: "Agendamento criado com IA!",
      agendamento: novoAgendamento
    });

  } catch (err) {
    console.error("Erro no agendamento inteligente:", err);
    res.status(500).json({ 
      success: false, 
      msg: "Erro ao processar agendamento inteligente" 
    });
  }
});

// 💡 SUGESTÕES INTELIGENTES
app.get("/api/sugestoes-inteligentes", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const cacheKey = `sugestoes_${userEmail}`;

    const sugestoes = await cacheManager.getOrSet(cacheKey, async () => {
      console.log('🔄 Gerando sugestões IA para:', userEmail);
      
      const { data: agendamentos, error } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("email", userEmail)
        .order("data", { ascending: true });

      if (error) throw error;

      const sugestoesTexto = await gerarSugestoesInteligentes(agendamentos || [], userEmail);
      
      return {
        sugestoes: sugestoesTexto,
        total_agendamentos: agendamentos?.length || 0
      };
    }, 10 * 60 * 1000); // Cache de 10 minutos

    res.json({
      success: true,
      ...sugestoes
    });

  } catch (err) {
    console.error("Erro nas sugestões IA:", err);
    res.status(500).json({ 
      success: false, 
      msg: "Erro ao gerar sugestões inteligentes" 
    });
  }
});

// 📊 ESTATÍSTICAS PESSOAIS COM IA
app.get("/api/estatisticas-pessoais", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const cacheKey = `estatisticas_${userEmail}`;

    const estatisticas = await cacheManager.getOrSet(cacheKey, async () => {
      console.log('🔄 Calculando estatísticas para:', userEmail);
      
      const { data: agendamentos, error } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("email", userEmail);

      if (error) throw error;

      const agendamentosList = agendamentos || [];
      const total = agendamentosList.length;
      const confirmados = agendamentosList.filter(a => a.status === 'confirmado').length;
      const pendentes = agendamentosList.filter(a => a.status === 'pendente').length;
      const cancelados = agendamentosList.filter(a => a.status === 'cancelado').length;
      
      const hoje = new Date();
      const esteMes = agendamentosList.filter(a => 
        a.data.startsWith(hoje.toISOString().slice(0, 7))
      ).length;

      const viaIA = agendamentosList.filter(a => a.criado_via_ia).length;

      const analiseIA = await gerarAnaliseEstatisticas(agendamentosList, userEmail);

      return {
        estatisticas: {
          total,
          confirmados,
          pendentes,
          cancelados,
          este_mes: esteMes,
          via_ia: viaIA
        },
        analise_ia: analiseIA
      };
    }, 5 * 60 * 1000); // Cache de 5 minutos

    res.json({
      success: true,
      ...estatisticas
    });

  } catch (err) {
    console.error("Erro nas estatísticas:", err);
    res.status(500).json({ 
      success: false, 
      msg: "Erro ao gerar estatísticas" 
    });
  }
});

// ==================== HEALTH CHECKS OTIMIZADOS ====================
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "Backend rodando com IA integrada",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    features: {
      ia: true,
      cache: true,
      sheets: true,
      agendamentos: true
    }
  });
});

app.get("/warmup", async (req, res) => {
  try {
    const { data, error } = await supabase.from('agendamentos').select('count').limit(1);
    
    res.json({ 
      status: "WARM", 
      timestamp: new Date().toISOString(),
      supabase: error ? "offline" : "online",
      ia: !!process.env.OPENAI_API_KEY
    });
  } catch (error) {
    res.json({ 
      status: "COLD", 
      timestamp: new Date().toISOString(),
      error: error.message 
    });
  }
});

// ==================== ROTAS EXISTENTES (MANTIDAS) ====================

// 🔥 AGENDAMENTOS COM CACHE
app.get("/agendamentos", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const cacheKey = `agendamentos_${userEmail}`;
    
    const agendamentos = await cacheManager.getOrSet(cacheKey, async () => {
      console.log('🔄 Buscando agendamentos do DB para:', userEmail);
      const { data, error } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("email", userEmail)
        .order("data", { ascending: true })
        .order("horario", { ascending: true });

      if (error) throw error;
      return data;
    });

    res.json({ agendamentos });
  } catch (err) {
    console.error("Erro ao listar agendamentos:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// 🔥 CONFIGURAÇÃO SHEETS COM CACHE
app.get("/configuracao-sheets", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const cacheKey = `config_${userEmail}`;
    
    const config = await cacheManager.getOrSet(cacheKey, async () => {
      return {
        temSheetsConfigurado: !!req.user.user_metadata?.spreadsheet_id,
        spreadsheetId: req.user.user_metadata?.spreadsheet_id
      };
    }, 5 * 60 * 1000);
    
    console.log(`📊 Configuração do usuário ${userEmail}:`, config);
    res.json(config);
    
  } catch (err) {
    console.error("Erro ao verificar configuração:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// 🔥 CONFIGURAR SHEETS COM INVALIDAÇÃO DE CACHE
app.post("/configurar-sheets", authMiddleware, async (req, res) => {
  try {
    const { spreadsheetId, criarAutomatico } = req.body;
    const userEmail = req.user.email;
    
    console.log('🔧 Configurando Sheets para:', userEmail, { spreadsheetId, criarAutomatico });
    
    let finalSpreadsheetId = spreadsheetId;

    if (criarAutomatico) {
      console.log('🔧 Criando planilha automática para:', userEmail);
      finalSpreadsheetId = await createSpreadsheetForUser(userEmail, req.user.user_metadata?.name);
      console.log('✅ Planilha criada com ID:', finalSpreadsheetId);
    }

    if (!finalSpreadsheetId) {
      return res.status(400).json({ msg: "Spreadsheet ID é obrigatório" });
    }

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

    const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
      req.user.id,
      { 
        user_metadata: { 
          ...req.user.user_metadata,
          spreadsheet_id: finalSpreadsheetId 
        } 
      }
    );

    if (updateError) {
      console.error('❌ Erro ao atualizar usuário:', updateError);
      throw updateError;
    }

    console.log('✅ Usuário atualizado com sucesso:', updatedUser.user.email);
    
    // 🔥 INVALIDA CACHE CORRETAMENTE
    cacheManager.delete(`config_${userEmail}`);
    cacheManager.delete(`agendamentos_${userEmail}`);
    
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

// 🔥 AGENDAR COM INVALIDAÇÃO DE CACHE
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

    // 🔥 INVALIDA CACHE CORRETAMENTE
    cacheManager.delete(`agendamentos_${userEmail}`);
    
    res.json({ msg: "Agendamento realizado com sucesso!", agendamento: novoAgendamento });

  } catch (err) {
    console.error("Erro no /agendar:", err);
    res.status(500).json({ msg: "Erro interno no servidor" });
  }
});

// ==================== ROTAS CORRIGIDAS (SEM PARÂMETRO :email) ====================

// 🔥 CONFIRMAR COM INVALIDAÇÃO DE CACHE - ROTA CORRIGIDA
app.post("/agendamentos/confirmar/:id", authMiddleware, async (req, res) => {
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
      const doc = await accessUserSpreadsheet(userEmail, req.user.user_metadata);
      if (doc) {
        await updateRowInSheet(doc.sheetsByIndex[0], id, data);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    // 🔥 INVALIDA CACHE CORRETAMENTE
    cacheManager.delete(`agendamentos_${userEmail}`);
    
    res.json({ msg: "Agendamento confirmado", agendamento: data });
  } catch (err) {
    console.error("Erro ao confirmar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// 🔥 CANCELAR COM INVALIDAÇÃO DE CACHE - ROTA CORRIGIDA
app.post("/agendamentos/cancelar/:id", authMiddleware, async (req, res) => {
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
      const doc = await accessUserSpreadsheet(userEmail, req.user.user_metadata);
      if (doc) {
        await updateRowInSheet(doc.sheetsByIndex[0], id, data);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    // 🔥 INVALIDA CACHE CORRETAMENTE
    cacheManager.delete(`agendamentos_${userEmail}`);
    
    res.json({ msg: "Agendamento cancelado", agendamento: data });
  } catch (err) {
    console.error("Erro ao cancelar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// 🔥 REAGENDAR COM INVALIDAÇÃO DE CACHE - ROTA CORRIGIDA
app.post("/agendamentos/reagendar/:id", authMiddleware, async (req, res) => {
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
      const doc = await accessUserSpreadsheet(userEmail, req.user.user_metadata);
      if (doc) {
        await updateRowInSheet(doc.sheetsByIndex[0], id, data);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    // 🔥 INVALIDA CACHE CORRETAMENTE
    cacheManager.delete(`agendamentos_${userEmail}`);
    
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

app.listen(PORT, () => {
  console.log(`🚀 Backend COM IA rodando na porta ${PORT}`);
  console.log('✅ Cache em memória ativo');
  console.log('✅ IA integrada (OpenAI)');
  console.log('✅ Health checks otimizados');
  console.log('✅ Rotas IA disponíveis');
  console.log('📊 Use /health para status completo');
  console.log('🔥 Use /warmup para manter instância ativa');
});
