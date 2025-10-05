import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { GoogleSpreadsheet } from "google-spreadsheet";

const PORT = process.env.PORT || 3000;
const app = express();

// ==================== CORS CONFIGURADO CORRETAMENTE ====================
app.use(cors({
  origin: [
    'https://frontrender-iota.vercel.app',
    'https://frontrender.netlify.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'https://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Allow-Headers'
  ],
  exposedHeaders: ['Content-Length', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400 // 24 hours
}));

app.options('*', cors());
app.use(express.json());

// ==================== SISTEMA DE CACHE INTELIGENTE ====================
const cache = new Map();
const pendingActions = new Map();

const cacheManager = {
  set(key, value, ttl = 2 * 60 * 1000) {
    cache.set(key, {
      value,
      expiry: Date.now() + ttl,
      timestamp: Date.now()
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
    console.log('🗑️ Cache deleted:', key);
    return cache.delete(key);
  },

  deletePattern(pattern) {
    let deletedCount = 0;
    for (const key of cache.keys()) {
      if (key.includes(pattern)) {
        cache.delete(key);
        deletedCount++;
      }
    }
    console.log(`🗑️ Cache pattern deleted: ${pattern} (${deletedCount} items)`);
    return deletedCount;
  },

  clear() {
    cache.clear();
  }
};

// ==================== SISTEMA OFFLINE + AÇÕES PENDENTES ====================
const offlineManager = {
  addAction(userEmail, action) {
    if (!pendingActions.has(userEmail)) {
      pendingActions.set(userEmail, []);
    }
    
    const actionWithId = {
      id: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...action,
      retryCount: 0
    };
    
    const userQueue = pendingActions.get(userEmail);
    userQueue.push(actionWithId);
    
    console.log(`📝 Action queued for ${userEmail}:`, action.type, actionWithId.id);
    return actionWithId.id;
  },

  getActions(userEmail) {
    return pendingActions.get(userEmail) || [];
  },

  removeAction(userEmail, actionId) {
    const userQueue = pendingActions.get(userEmail);
    if (userQueue) {
      const filteredQueue = userQueue.filter(action => action.id !== actionId);
      pendingActions.set(userEmail, filteredQueue);
    }
  },

  async retryPendingActions(userEmail) {
    const userQueue = this.getActions(userEmail);
    if (userQueue.length === 0) return [];

    console.log(`🔄 Retrying ${userQueue.length} pending actions for ${userEmail}`);
    
    const results = [];
    for (const action of userQueue) {
      try {
        let result;
        switch (action.type) {
          case 'CREATE_AGENDAMENTO':
            result = await handleAgendar(action.data, userEmail, true);
            break;
          case 'UPDATE_AGENDAMENTO':
            result = await handleAtualizarAgendamento(action.agendamentoId, action.data, userEmail, true);
            break;
          case 'DELETE_AGENDAMENTO':
            result = await handleCancelarAgendamento(action.agendamentoId, userEmail, true);
            break;
        }
        
        if (result.success) {
          this.removeAction(userEmail, action.id);
          results.push({ actionId: action.id, success: true });
        }
      } catch (error) {
        console.error(`❌ Error retrying action ${action.id}:`, error.message);
        results.push({ actionId: action.id, success: false, error: error.message });
      }
    }
    
    return results;
  }
};

// ==================== CONFIGURAÇÃO SUPABASE ====================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==================== SUPABASE REALTIME PARA CACHE AUTOMÁTICO ====================
function setupSupabaseRealtime() {
  try {
    const subscription = supabase
      .channel('agendamentos-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agendamentos'
        },
        (payload) => {
          console.log('🔔 Realtime update received:', payload.eventType);
          
          // Invalida cache baseado no email do usuário afetado
          if (payload.new?.email) {
            const userEmail = payload.new.email;
            cacheManager.deletePattern(`agendamentos_${userEmail}`);
            cacheManager.deletePattern(`estatisticas_${userEmail}`);
            cacheManager.deletePattern(`sugestoes_${userEmail}`);
          } else if (payload.old?.email) {
            const userEmail = payload.old.email;
            cacheManager.deletePattern(`agendamentos_${userEmail}`);
            cacheManager.deletePattern(`estatisticas_${userEmail}`);
            cacheManager.deletePattern(`sugestoes_${userEmail}`);
          }
          
          // Invalida cache global se necessário
          if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
            cacheManager.deletePattern('sugestoes_');
            cacheManager.deletePattern('estatisticas_');
          }
        }
      )
      .subscribe();

    console.log('✅ Supabase Realtime connected for cache invalidation');
  } catch (error) {
    console.error('❌ Failed to setup Supabase Realtime:', error.message);
  }
}

// Inicializar Realtime
setupSupabaseRealtime();

// ==================== CONFIGURAÇÃO DEEPSEEK IA ====================
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

const MODELOS_IA = {
  PADRAO: "deepseek-chat",
  RACIOCINIO: "deepseek-reasoner",
  ECONOMICO: "deepseek-chat"
};

async function chamarDeepSeekIA(mensagem, contexto = "", tipo = "PADRAO") {
  try {
    if (!DEEPSEEK_API_KEY) {
      throw new Error("Chave da API DeepSeek não configurada");
    }

    const modelo = MODELOS_IA[tipo] || MODELOS_IA.PADRAO;
    const prompt = contexto ? `${contexto}\n\nPergunta do usuário: ${mensagem}` : mensagem;

    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: modelo,
        messages: [
          {
            role: "system",
            content: contexto || "Você é um assistente de agenda inteligente. Ajude os usuários a gerenciarem seus compromissos de forma eficiente. Seja útil, amigável e direto ao ponto."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na API DeepSeek: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("Erro ao chamar DeepSeek IA:", error);
    throw error;
  }
}

// ==================== FUNÇÕES IA (MANTIDAS ORIGINAIS) ====================
async function analisarDescricaoNatural(descricao, userEmail) {
  try {
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);

    function calcularDataValida(data) {
      const dataObj = new Date(data);
      return dataObj.toISOString().split('T')[0];
    }

    const prompt = `
Analise a seguinte descrição de agendamento e extraia as informações no formato JSON:

DESCRIÇÃO: "${descricao}"

USUÁRIO: ${userEmail}
DATA ATUAL: ${hoje.toISOString().split('T')[0]}

Extraia as seguintes informações:
- nome (string): Nome da pessoa ou evento
- data (string no formato YYYY-MM-DD): Data do compromisso
- horario (string no formato HH:MM): Horário do compromisso
- descricao (string): Descrição detalhada do compromisso

🔔 REGRAS IMPORTANTES:
- Se não mencionar data específica, use "${calcularDataValida(amanha.toISOString().split('T')[0])}"
- Se não mencionar horário, use "09:00" (horário padrão)
- Para datas relativas: "hoje" = data atual, "amanhã" = data atual + 1 dia
- Para dias da semana: converta para a próxima ocorrência
- ✅ DOMINGOS SÃO PERMITIDOS: Agende normalmente para domingos
- Use o ano atual para todas as datas

Exemplo de resposta:
{"nome": "Reunião com João", "data": "2024-01-14", "horario": "14:00", "descricao": "Reunião dominical"}

Responda APENAS com o JSON válido, sem nenhum texto adicional.
`;

    const resposta = await chamarDeepSeekIA(prompt, "", "RACIOCINIO");
    
    const jsonMatch = resposta.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const dados = JSON.parse(jsonMatch[0]);
      console.log('✅ Agendamento processado (domingos permitidos):', dados.data);
      return dados;
    }
    
    throw new Error("Não foi possível extrair dados estruturados da descrição");
  } catch (error) {
    console.error("Erro ao analisar descrição natural:", error);
    throw error;
  }
}

async function analisarEstatisticasPessoais(agendamentos, userEmail) {
  try {
    const estatisticas = {
      total: agendamentos.length,
      este_mes: agendamentos.filter(a => {
        const dataAgendamento = new Date(a.data);
        const agora = new Date();
        return dataAgendamento.getMonth() === agora.getMonth() && 
               dataAgendamento.getFullYear() === agora.getFullYear();
      }).length,
      confirmados: agendamentos.filter(a => a.status === 'confirmado').length,
      pendentes: agendamentos.filter(a => a.status === 'pendente').length,
      cancelados: agendamentos.filter(a => a.status === 'cancelado').length,
      via_ia: agendamentos.filter(a => a.criado_via_ia).length
    };

    const contexto = `
Estatísticas dos agendamentos do usuário ${userEmail}:

- Total de agendamentos: ${estatisticas.total}
- Agendamentos este mês: ${estatisticas.este_mes}
- Confirmados: ${estatisticas.confirmados}
- Pendentes: ${estatisticas.pendentes}
- Cancelados: ${estatisticas.cancelados}
- Criados via IA: ${estatisticas.via_ia}

Forneça uma análise inteligente sobre:
1. Comportamento de agendamento do usuário
2. Taxa de comparecimento (confirmados vs total)
3. Distribuição ao longo do tempo
4. Recomendações personalizadas

Seja encorajador e prático. Máximo de 200 palavras.
`;

    const analise = await chamarDeepSeekIA("Analise essas estatísticas de agendamentos:", contexto);
    
    return {
      estatisticas,
      analise_ia: analise
    };
  } catch (error) {
    console.error("Erro ao analisar estatísticas:", error);
    throw error;
  }
}

// ==================== CONFIGURAÇÃO GOOGLE SHEETS ====================
let creds;
try {
  creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
} catch (e) {
  console.error("Erro ao parsear GOOGLE_SERVICE_ACCOUNT:", e);
  process.exit(1);
}

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
      'id', 'nome', 'email', 'telefone', 'data', 'horario', 'status', 'confirmado', 'criado_em', 'criado_via_ia', 'descricao'
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

// ==================== MIDDLEWARE AUTH ====================
async function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ msg: "Token não enviado" });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ msg: "Token inválido" });

  req.user = data.user;
  next();
}

// ==================== HANDLERS COM CACHE INTELIGENTE ====================
async function handleAgendar(dados, userEmail, isRetry = false) {
  try {
    // 1️⃣ Backup no Google Sheets primeiro
    const userMetadata = (await supabase.auth.admin.getUserById(req.user.id)).data.user?.user_metadata;
    const doc = await accessUserSpreadsheet(userEmail, userMetadata);
    
    if (doc) {
      const sheet = doc.sheetsByIndex[0];
      await sheet.addRow({
        ...dados,
        id: `temp_${Date.now()}`,
        email: userEmail,
        criado_em: new Date().toISOString(),
        status: 'pendente'
      });
    }

    // 2️⃣ Insert no Supabase
    const { data, error } = await supabase
      .from("agendamentos")
      .insert([{ ...dados, email: userEmail }])
      .select()
      .single();

    if (error) throw error;

    // 3️⃣ Invalidar cache
    cacheManager.deletePattern(`agendamentos_${userEmail}`);
    cacheManager.deletePattern(`estatisticas_${userEmail}`);
    cacheManager.deletePattern(`sugestoes_${userEmail}`);

    console.log('✅ Agendamento criado com cache invalidation');

    return { success: true, data };

  } catch (error) {
    console.error('❌ Erro ao agendar:', error);
    
    if (!isRetry) {
      // Adiciona à fila de ações pendentes
      offlineManager.addAction(userEmail, {
        type: 'CREATE_AGENDAMENTO',
        data: dados
      });
      console.log('📝 Agendamento adicionado à fila offline');
    }
    
    return { success: false, error: error.message };
  }
}

async function handleAtualizarAgendamento(agendamentoId, dados, userEmail, isRetry = false) {
  try {
    // 1️⃣ Atualizar no Supabase
    const { data, error } = await supabase
      .from("agendamentos")
      .update(dados)
      .eq("id", agendamentoId)
      .eq("email", userEmail)
      .select()
      .single();

    if (error) throw error;

    // 2️⃣ Invalidar cache
    cacheManager.deletePattern(`agendamentos_${userEmail}`);
    cacheManager.deletePattern(`estatisticas_${userEmail}`);
    cacheManager.deletePattern(`sugestoes_${userEmail}`);

    console.log('✅ Agendamento atualizado com cache invalidation');

    return { success: true, data };

  } catch (error) {
    console.error('❌ Erro ao atualizar agendamento:', error);
    
    if (!isRetry) {
      offlineManager.addAction(userEmail, {
        type: 'UPDATE_AGENDAMENTO',
        agendamentoId,
        data: dados
      });
    }
    
    return { success: false, error: error.message };
  }
}

async function handleCancelarAgendamento(agendamentoId, userEmail, isRetry = false) {
  try {
    // 1️⃣ Buscar dados antes de deletar para backup
    const { data: agendamento } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("id", agendamentoId)
      .eq("email", userEmail)
      .single();

    // 2️⃣ Backup no Sheets antes de deletar
    if (agendamento) {
      const userMetadata = (await supabase.auth.admin.getUserById(req.user.id)).data.user?.user_metadata;
      const doc = await accessUserSpreadsheet(userEmail, userMetadata);
      
      if (doc) {
        const sheet = doc.sheetsByIndex[0];
        await sheet.addRow({
          ...agendamento,
          status: 'cancelado',
          canceled_at: new Date().toISOString()
        });
      }
    }

    // 3️⃣ Delete do Supabase
    const { error } = await supabase
      .from("agendamentos")
      .delete()
      .eq("id", agendamentoId)
      .eq("email", userEmail);

    if (error) throw error;

    // 4️⃣ Invalidar cache
    cacheManager.deletePattern(`agendamentos_${userEmail}`);
    cacheManager.deletePattern(`estatisticas_${userEmail}`);
    cacheManager.deletePattern(`sugestoes_${userEmail}`);

    console.log('✅ Agendamento cancelado com cache invalidation');

    return { success: true };

  } catch (error) {
    console.error('❌ Erro ao cancelar agendamento:', error);
    
    if (!isRetry) {
      offlineManager.addAction(userEmail, {
        type: 'DELETE_AGENDAMENTO',
        agendamentoId
      });
    }
    
    return { success: false, error: error.message };
  }
}

// ==================== ROTAS ATUALIZADAS COM CACHE ====================

// 🔥 HEALTH CHECKS
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "Backend rodando com CACHE INTELIGENTE",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    cache_size: cache.size,
    pending_actions: pendingActions.size
  });
});

app.get("/warmup", async (req, res) => {
  try {
    const { data, error } = await supabase.from('agendamentos').select('count').limit(1);
    
    res.json({ 
      status: "WARM", 
      timestamp: new Date().toISOString(),
      supabase: error ? "offline" : "online",
      cache: "active"
    });
  } catch (error) {
    res.json({ 
      status: "COLD", 
      timestamp: new Date().toISOString(),
      error: error.message 
    });
  }
});

// 🔥 LISTAR AGENDAMENTOS COM CACHE HÍBRIDO
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
    }, 2 * 60 * 1000); // 2 minutos cache

    res.json({ agendamentos });
  } catch (err) {
    console.error("Erro ao listar agendamentos:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// 🔥 CRIAR AGENDAMENTO COM ATUALIZAÇÃO OTIMISTA
app.post("/agendamentos", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const dados = req.body;

    const resultado = await handleAgendar(dados, userEmail);

    if (resultado.success) {
      res.json({ 
        success: true, 
        agendamento: resultado.data,
        pending: offlineManager.getActions(userEmail).length > 0
      });
    } else {
      res.status(500).json({ 
        success: false, 
        msg: "Erro ao criar agendamento",
        pending: true // Indica que foi para fila offline
      });
    }
  } catch (err) {
    console.error("Erro ao criar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// 🔥 ATUALIZAR AGENDAMENTO COM SYNC EM BACKGROUND
app.put("/agendamentos/:id", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const agendamentoId = req.params.id;
    const dados = req.body;

    const resultado = await handleAtualizarAgendamento(agendamentoId, dados, userEmail);

    if (resultado.success) {
      res.json({ 
        success: true, 
        agendamento: resultado.data 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        msg: "Erro ao atualizar agendamento",
        pending: true
      });
    }
  } catch (err) {
    console.error("Erro ao atualizar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// 🔥 CANCELAR AGENDAMENTO COM DELETE OTIMISTA
app.delete("/agendamentos/:id", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const agendamentoId = req.params.id;

    const resultado = await handleCancelarAgendamento(agendamentoId, userEmail);

    if (resultado.success) {
      res.json({ 
        success: true, 
        msg: "Agendamento cancelado com sucesso" 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        msg: "Erro ao cancelar agendamento",
        pending: true
      });
    }
  } catch (err) {
    console.error("Erro ao cancelar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// 🔥 OFFLINE SYNC - RETRY PENDING ACTIONS
app.post("/offline/sync", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    
    const results = await offlineManager.retryPendingActions(userEmail);
    
    res.json({
      success: true,
      results,
      pending_remaining: offlineManager.getActions(userEmail).length
    });
  } catch (error) {
    console.error("Erro no sync offline:", error);
    res.status(500).json({ 
      success: false, 
      msg: "Erro ao sincronizar ações pendentes" 
    });
  }
});

// 🔥 CHECK PENDING ACTIONS
app.get("/offline/pending", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const pending = offlineManager.getActions(userEmail);
    
    res.json({
      success: true,
      pending_actions: pending,
      count: pending.length
    });
  } catch (error) {
    console.error("Erro ao verificar ações pendentes:", error);
    res.status(500).json({ 
      success: false, 
      msg: "Erro ao verificar ações pendentes" 
    });
  }
});

// ==================== ROTAS IA (MANTIDAS ORIGINAIS COM CACHE) ====================

app.post("/api/assistente-ia", authMiddleware, async (req, res) => {
  try {
    const { mensagem } = req.body;
    const userEmail = req.user.email;

    if (!mensagem) {
      return res.status(400).json({ success: false, msg: "Mensagem é obrigatória" });
    }

    const { data: agendamentos, error } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("email", userEmail)
      .order("data", { ascending: false })
      .limit(5);

    if (error) throw error;

    const contexto = agendamentos && agendamentos.length > 0 
      ? `Aqui estão os últimos agendamentos do usuário para contexto:\n${agendamentos.map(a => `- ${a.data} ${a.horario}: ${a.nome} (${a.status})`).join('\n')}`
      : "O usuário ainda não tem agendamentos.";

    const resposta = await chamarDeepSeekIA(mensagem, contexto, "ECONOMICO");

    res.json({
      success: true,
      resposta,
      agendamentos_referenciados: agendamentos?.length || 0
    });

  } catch (error) {
    console.error("Erro no assistente IA:", error);
    res.status(500).json({ 
      success: false, 
      msg: "Erro ao processar pergunta com IA",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 🔥 SUGERIR HORÁRIOS COM CACHE
app.get("/api/sugerir-horarios", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const cacheKey = `sugerir_horarios_${userEmail}`;

    const sugestoes = await cacheManager.getOrSet(cacheKey, async () => {
      const { data: agendamentos, error } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("email", userEmail)
        .gte("data", new Date().toISOString().split('T')[0])
        .order("data", { ascending: true })
        .order("horario", { ascending: true });

      if (error) throw error;

      // Sua lógica original de análise de horários
      const contexto = `
ANÁLISE DE AGENDA - SUGERIR HORÁRIOS LIVRES
Dados da agenda do usuário ${userEmail}:
AGENDAMENTOS EXISTENTES:
${agendamentos.length > 0 ? 
  agendamentos.map(a => `- ${a.data} ${a.horario}: ${a.nome}`).join('\n') 
  : 'Nenhum agendamento futuro encontrado.'
}
DATA ATUAL: ${new Date().toISOString().split('T')[0]}
`;

      return await chamarDeepSeekIA("Analise esta agenda e sugira os melhores horários livres:", contexto, "ECONOMICO");
    }, 10 * 60 * 1000); // 10 minutos cache

    res.json({
      success: true,
      sugestoes: sugestoes,
      total_agendamentos: 0 // Pode ajustar conforme necessário
    });

  } catch (error) {
    console.error("Erro ao sugerir horários:", error);
    res.status(500).json({ 
      success: false, 
      msg: "Erro ao analisar horários livres" 
    });
  }
});

// 🔥 ESTATÍSTICAS COM CACHE
app.get("/api/estatisticas-pessoais", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const cacheKey = `estatisticas_${userEmail}`;

    const resultado = await cacheManager.getOrSet(cacheKey, async () => {
      const { data: agendamentos, error } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("email", userEmail);

      if (error) throw error;
      return await analisarEstatisticasPessoais(agendamentos || [], userEmail);
    }, 5 * 60 * 1000); // 5 minutos cache

    res.json({
      success: true,
      ...resultado
    });

  } catch (error) {
    console.error("Erro nas estatísticas pessoais:", error);
    res.status(500).json({ 
      success: false, 
      msg: "Erro ao gerar estatísticas pessoais" 
    });
  }
});

// 🔥 SUGESTÕES INTELIGENTES COM CACHE  
app.get("/api/sugestoes-inteligentes", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const cacheKey = `sugestoes_${userEmail}`;

    const resultado = await cacheManager.getOrSet(cacheKey, async () => {
      const { data: agendamentos, error } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("email", userEmail)
        .order("data", { ascending: true });

      if (error) throw error;

      if (!agendamentos || agendamentos.length === 0) {
        return {
          sugestoes: "📝 Você ainda não tem agendamentos. Que tal agendar seu primeiro compromisso? Use o agendamento por IA para facilitar!",
          total_agendamentos: 0
        };
      }

      // Sua lógica original para gerar sugestões
      const contexto = `
Agendamentos do usuário ${userEmail}:
${agendamentos.map(a => `- ${a.data} ${a.horario}: ${a.nome} (${a.status})`).join('\n')}

Forneça sugestões inteligentes baseadas nos padrões de agendamento.
`;

      const sugestoes = await chamarDeepSeekIA("Analise esses agendamentos e forneça sugestões úteis:", contexto, "ECONOMICO");

      return {
        sugestoes,
        total_agendamentos: agendamentos.length
      };
    }, 10 * 60 * 1000); // 10 minutos cache

    res.json({
      success: true,
      ...resultado
    });

  } catch (error) {
    console.error("Erro nas sugestões inteligentes:", error);
    res.status(500).json({ 
      success: false, 
      msg: "Erro ao gerar sugestões inteligentes" 
    });
  }
});

// ==================== CONFIGURAÇÃO SHEETS (MANTIDA ORIGINAL) ====================

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
    console.error("Erro ao buscar configuração:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

app.post("/configurar-sheets", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const { userName } = req.body;

    const spreadsheetId = await createSpreadsheetForUser(userEmail, userName);

    const { error } = await supabase.auth.admin.updateUserById(
      req.user.id,
      { user_metadata: { spreadsheet_id: spreadsheetId } }
    );

    if (error) throw error;

    // Invalidar cache de configuração
    cacheManager.delete(`config_${userEmail}`);

    res.json({ 
      success: true, 
      spreadsheetId,
      msg: "Planilha configurada com sucesso!" 
    });

  } catch (err) {
    console.error("Erro ao configurar sheets:", err);
    res.status(500).json({ msg: err.message });
  }
});

// ==================== INICIALIZAR SERVER ====================

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📦 Cache inteligente: ATIVO`);
  console.log(`🔔 Supabase Realtime: CONECTADO`);
  console.log(`📱 Sistema offline: PRONTO`);
  console.log(`🤖 IA DeepSeek: ${DEEPSEEK_API_KEY ? 'CONFIGURADA' : 'NÃO CONFIGURADA'}`);
});

