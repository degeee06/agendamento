noimport express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { GoogleSpreadsheet } from "google-spreadsheet";

const PORT = process.env.PORT || 3000;
const app = express();
// ==================== CORS CONFIGURADO CORRETAMENTE ====================
app.use(cors({
  origin: [
    'https://frontrender-iota.vercel.app',
    'https://oubook.vercel.app',
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

// Handle preflight requests for ALL routes
app.options('*', cors());

// 🔥🔥🔥 AGORA SIM, O RESTO DO CÓDIGO 🔥🔥🔥
app.use(express.json());

// ROTA PÚBLICA para agendamento via link
app.post("/agendamento-publico", async (req, res) => {
  try {
    const { nome, email, telefone, data, horario, user_id, t } = req.body; // 🆕 Recebe timestamp
    
    if (!nome || !telefone || !data || !horario || !user_id || !t) { // 🆕 Verifica timestamp
      return res.status(400).json({ msg: "Link inválido ou expirado" });
    }

      const validacaoHorario = await validarHorarioFuncionamento(user_id, data, horario);
    if (!validacaoHorario.valido) {
      return res.status(400).json({ 
        msg: `Horário indisponível: ${validacaoHorario.motivo}` 
      });
    }
  // 🆕 VERIFICAÇÃO DE USO ÚNICO (ADICIONE ESTA PARTE ANTES!)
    const { data: linkUsado } = await supabase
      .from('links_uso')
      .select('*')
      .eq('token', t)
      .eq('user_id', user_id)
      .single();

    if (linkUsado) {
      return res.status(400).json({ msg: "Este link já foi utilizado. Solicite um novo link de agendamento." });
    }

    
    // 🆕 VERIFICA EXPIRAÇÃO (24 horas)
    const agora = Date.now();
    const diferenca = agora - parseInt(t);
    const horas = diferenca / (1000 * 60 * 60);
    
    if (horas > 24) {
      return res.status(400).json({ msg: "Link expirado. Gere um novo link de agendamento." });
    }

    // Verifica se o user_id existe
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(user_id);
    if (userError || !user) {
      return res.status(400).json({ msg: "Link inválido" });
    }
    // Verifica conflitos
    const { data: conflito } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("user_id", user_id)
      .eq("data", data)
      .eq("horario", horario)
      .neq("status", "cancelado"); // Ignora agendamentos cancelados
    
    if (conflito && conflito.length > 0) {
      return res.status(400).json({ msg: "Horário indisponível" });
    }

    // Cria agendamento
    const { data: novoAgendamento, error } = await supabase
      .from("agendamentos")
      .insert([{
        cliente: user_id,
        user_id: user_id,
        nome: nome,
        email: email || 'Não informado',
        telefone: telefone,
        data: data,
        horario: horario,
        status: "pendente",
        confirmado: false,
      }])
      .select()
      .single();

    if (error) throw error;

// 🆕 MARCA LINK COMO USADO (APÓS AGENDAMENTO BEM-SUCEDIDO)
    await supabase
      .from('links_uso')
      .insert([{
        user_id: user_id,
        token: t,
        usado_em: new Date(),
        agendamento_id: novoAgendamento.id
      }]);
    // Atualiza Google Sheets
   try {
  const doc = await accessUserSpreadsheet(user.user.email, user.user.user_metadata);
  if (doc) {
    const sheet = doc.sheetsByIndex[0];
    
    // 🆕 DADOS FILTRADOS PARA SHEETS
    const dadosSheets = {
      nome: novoAgendamento.nome,
      email: email || 'Não informado',
      telefone: novoAgendamento.telefone,
      data: novoAgendamento.data,
      horario: novoAgendamento.horario,
      status: novoAgendamento.status
    };
    
    await ensureDynamicHeaders(sheet, Object.keys(dadosSheets));
    await sheet.addRow(dadosSheets);
    console.log('✅ Dados filtrados salvos no Sheets');
  }
} catch (sheetError) {
  console.error("Erro ao atualizar Google Sheets:", sheetError);
}

    res.json({ 
      success: true, 
      msg: "Agendamento realizado com sucesso!", 
      agendamento: novoAgendamento 
    });

  } catch (err) {
    console.error("Erro no agendamento público:", err);
    res.status(500).json({ msg: "Erro interno no servidor" });
  }
});

app.get("/gerar-link/:user_id", authMiddleware, async (req, res) => {
  try {
    const user_id = req.params.user_id;
    
    // Verifica se é o próprio usuário
    if (req.userId !== user_id) {
      return res.status(403).json({ msg: "Não autorizado" });
    }

    // 🆕 ADICIONE TIMESTAMP AO LINK (expira em 24h)
    const timestamp = Date.now();
    const link = `https://oubook.vercel.app/agendar.html?user_id=${user_id}&t=${timestamp}`;
    
    res.json({ 
      success: true, 
      link: link,
      qr_code: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}`,
      expira_em: "24 horas" // 🆕 Informa quando expira
    });

  } catch (error) {
    console.error("Erro ao gerar link:", error);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ==================== CACHE SIMPLES E FUNCIONAL ====================
const cache = new Map(); // 🔥🔥🔥 ESTA LINHA ESTAVA FALTANDO!


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

// ==================== CONFIGURAÇÃO DEEPSEEK IA ====================
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

// Configuração dos modelos
const MODELOS_IA = {
  PADRAO: "deepseek-chat",           // ✅ Balanceado (atual)
  RACIOCINIO: "deepseek-reasoner",   // 🎯 MELHOR para agendamentos
  ECONOMICO: "deepseek-chat"         // 💰 Mais econômico
};


// Função para chamar a API da DeepSeek
async function chamarDeepSeekIA(mensagem, contexto = "", tipo = "PADRAO") {
  try {
    if (!DEEPSEEK_API_KEY) {
      throw new Error("Chave da API DeepSeek não configurada");
    }

    const modelo = MODELOS_IA[tipo] || MODELOS_IA.PADRAO;
    const prompt = contexto ? `${contexto}\n\nPergunta do usuário: ${mensagem}` : mensagem;

    console.log(`🤖 Usando modelo: ${modelo} para: ${tipo}`);

    // 🔥 NOVO SYSTEM PROMPT COM LIMITES CLAROS
    const systemPrompt = contexto || `
Você é um assistente de agenda INTELIGENTE mas com LIMITES CLAROS.

📍 SUAS FUNÇÕES:
- Analisar agendamentos existentes
- Sugerir horários livres baseado na agenda
- Explicar estatísticas e padrões
- Responder perguntas sobre compromissos

🚫 SUAS LIMITAÇÕES (NÃO PODE):
- Confirmar, cancelar ou reagendar agendamentos
- Criar novos agendamentos diretamente
- Acessar funções do sistema
- Executar ações no banco de dados

💡 COMO AJUDAR:
- "Vejo que tem horário livre às 14:00 na quarta-feira"
- "Sugiro verificar o formulário de agendamento para esse horário"
- "Posso analisar sua agenda, mas você precisa usar o sistema para ações"

Seja útil mas SEMPRE claro sobre suas limitações. Não ofereça funcionalidades que não existem.
`;

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
            content: systemPrompt  // 🔥 USA O NOVO PROMPT
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

// Função para analisar estatísticas pessoais
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
    };

    const contexto = `
Estatísticas dos agendamentos do usuário ${userEmail}

- Total de agendamentos: ${estatisticas.total}
- Agendamentos este mês: ${estatisticas.este_mes}
- Confirmados: ${estatisticas.confirmados}
- Pendentes: ${estatisticas.pendentes}
- Cancelados: ${estatisticas.cancelados}


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

// ==================== ROTAS IA ====================

// Rota do assistente de IA - USE ECONÔMICO
app.post("/api/assistente-ia", authMiddleware, async (req, res) => {
  try {
    const { mensagem } = req.body;
    const userEmail = req.user.email;

    if (!mensagem) {
      return res.status(400).json({ success: false, msg: "Mensagem é obrigatória" });
    }

    // Busca agendamentos recentes para contexto
    const { data: agendamentos, error } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", req.userId)
      .order("data", { ascending: false })
      .limit(5);

    if (error) throw error;

    const contexto = agendamentos && agendamentos.length > 0 
      ? `Aqui estão os últimos agendamentos do usuário para contexto:\n${agendamentos.map(a => `- ${a.data} ${a.horario}: ${a.nome} (${a.status})`).join('\n')}`
      : "O usuário ainda não tem agendamentos.";

    const resposta = await chamarDeepSeekIA(mensagem, contexto, "ECONOMICO"); // 💰 USANDO ECONÔMICO

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


// Função para validar se o horário está dentro do funcionamento
async function validarHorarioFuncionamento(userId, data, horario) {
  try {
    const perfil = await obterHorariosPerfil(userId);
    
    if (!perfil) {
      return { valido: true }; // Sem perfil, aceita qualquer horário
    }

    // Converte data para dia da semana
    const dataObj = new Date(data);
    const diasSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const diaSemana = diasSemana[dataObj.getDay()];

    // Verifica se o dia está nos dias de funcionamento
    if (!perfil.dias_funcionamento.includes(diaSemana)) {
      return { 
        valido: false, 
        motivo: `Não atendemos aos ${diaSemana}s` 
      };
    }

    // Verifica se o horário está dentro do funcionamento
    const horarioFuncionamento = perfil.horarios_funcionamento[diaSemana];
    if (!horarioFuncionamento) {
      return { valido: true }; // Dia sem configuração específica
    }

    if (horario < horarioFuncionamento.inicio || horario > horarioFuncionamento.fim) {
      return { 
        valido: false, 
        motivo: `Horário fora do funcionamento (${horarioFuncionamento.inicio} - ${horarioFuncionamento.fim})` 
      };
    }

    return { valido: true };
  } catch (error) {
    console.error("Erro ao validar horário:", error);
    return { valido: true }; // Em caso de erro, permite o agendamento
  }
}
// ==================== ROTA SUGERIR HORÁRIOS ====================

// Substitua a rota /api/sugerir-horarios por esta versão atualizada
app.get("/api/sugerir-horarios", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;

    const { data: agendamentos, error } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", req.userId)
      .gte("data", new Date().toISOString().split('T')[0])
      .order("data", { ascending: true })
      .order("horario", { ascending: true });

    if (error) throw error;

    // 🆕 USA A NOVA FUNÇÃO COM PERFIL
    const sugestoes = await analisarHorariosLivresComPerfil(agendamentos || [], userEmail, req.userId);

    res.json({
      success: true,
      sugestoes: sugestoes,
      total_agendamentos: agendamentos?.length || 0
    });

  } catch (error) {
    console.error("Erro ao sugerir horários:", error);
    res.status(500).json({ 
      success: false, 
      msg: "Erro ao analisar horários livres"
    });
  }
});

async function analisarHorariosLivresComPerfil(agendamentos, userEmail, userId) {
  try {
    const perfil = await obterHorariosPerfil(userId);
    
    let contexto = `
ANÁLISE DE AGENDA - SUGERIR HORÁRIOS LIVRES

Dados da agenda do usuário ${userEmail}:

AGENDAMENTOS EXISTENTES (próximos 7 dias):
${agendamentos.length > 0 ? 
    agendamentos.map(a => `- ${a.data} ${a.horario}: ${a.nome}`).join('\n') 
    : 'Nenhum agendamento futuro encontrado.'
}
`;

    // Adiciona informações do perfil se existir
    if (perfil) {
      contexto += `

CONFIGURAÇÃO DO NEGÓCIO:
- Horários de funcionamento: ${JSON.stringify(perfil.horarios_funcionamento)}
- Dias de funcionamento: ${perfil.dias_funcionamento.join(', ')}

IMPORTANTE: Sugira apenas horários dentro do funcionamento do negócio!
`;
    } else {
      contexto += `

OBSERVAÇÃO: Negócio não configurado. Use horários comerciais padrão (9h-18h).
`;
    }

    contexto += `

DATA ATUAL: ${new Date().toISOString().split('T')[0]}

INSTRUÇÕES:
Analise a agenda acima e sugira os MELHORES horários livres para os próximos 7 dias.
${perfil ? 'RESPEITE os horários de funcionamento configurados!' : 'Use horários comerciais padrão (9h-18h).'}

FORMATO DA RESPOSTA:
Forneça uma lista de 3-5 sugestões de horários no formato:
"📅 [DIA] às [HORÁRIO] - [CONTEXTO/SUGESTÃO]"

Seja prático, útil e use emojis. Máximo de 150 palavras.
`;

    return await chamarDeepSeekIA("Analise esta agenda e sugira os melhores horários livres:", contexto, "ECONOMICO");
  } catch (error) {
    console.error("Erro na análise de horários com perfil:", error);
    return "📅 **Sugestões de Horários:**\n\nConsidere configurar seu horário de funcionamento para sugestões personalizadas.";
  }
}

// Rota de sugestões inteligentes
app.get("/api/sugestoes-inteligentes", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const cacheKey = `sugestoes_${req.userId}`;

    const resultado = await cacheManager.getOrSet(cacheKey, async () => {
      // Busca todos os agendamentos
      const { data: agendamentos, error } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("cliente", req.userId)
        .order("data", { ascending: true });


      if (error) throw error;

      if (!agendamentos || agendamentos.length === 0) {
        return {
          sugestoes: "📝 Você ainda não tem agendamentos. Que tal agendar seu primeiro compromisso? Use o agendamento por IA para facilitar!",
          total_agendamentos: 0
        };
      }

      const sugestoes = await gerarSugestoesInteligentes(agendamentos, userEmail);

      return {
        sugestoes,
        total_agendamentos: agendamentos.length
      };
    }, 10 * 60 * 1000); // Cache de 10 minutos para sugestões

    res.json({
      success: true,
      ...resultado
    });

  } catch (error) {
    console.error("Erro nas sugestões inteligentes:", error);
    res.status(500).json({ 
      success: false, 
      msg: "Erro ao gerar sugestões inteligentes",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Rota de estatísticas pessoais com IA
app.get("/api/estatisticas-pessoais", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const cacheKey = `estatisticas_${req.userId}`;

    const resultado = await cacheManager.getOrSet(cacheKey, async () => {
      // Busca todos os agendamentos
      const { data: agendamentos, error } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("cliente", req.userId);

      if (error) throw error;

      return await analisarEstatisticasPessoais(agendamentos || [], userEmail);
    }, 5 * 60 * 1000); // Cache de 5 minutos para estatísticas

    res.json({
      success: true,
      ...resultado
    });

  } catch (error) {
    console.error("Erro nas estatísticas pessoais:", error);
    res.status(500).json({ 
      success: false, 
      msg: "Erro ao gerar estatísticas pessoais",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});


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
// ADICIONE ESTA FUNÇÃO ANTES DAS ROTAS IA:
async function gerarSugestoesInteligentes(agendamentos, userEmail) {
  try {
    const contexto = `
ANÁLISE DE AGENDA PARA SUGESTÕES INTELIGENTES

Agendamentos do usuário: 
${agendamentos.map(a => `- ${a.data} ${a.horario}: ${a.nome} (${a.status})`).join('\n')}

Forneça insights úteis sobre:
- Padrões de agendamento
- Sugestões de melhor organização
- Lembretes importantes
- Otimizações de tempo

Seja prático e use emojis. Máximo 150 palavras.
`;

    return await chamarDeepSeekIA("Analise esta agenda e forneça sugestões úteis:", contexto, "ECONOMICO");
  } catch (error) {
    console.error("Erro ao gerar sugestões:", error);
    return "💡 **Sugestões Inteligentes:**\n\n- Considere agendar compromissos importantes no período da manhã\n- Mantenha intervalos de 15-30 minutos entre reuniões\n- Revise sua agenda semanalmente para ajustes\n\n📊 Dica: Use o agendamento por IA para otimizar seu tempo!";
  }
}
async function accessUserSpreadsheet(userEmail, userMetadata) {
  try {
    const spreadsheetId = userMetadata?.spreadsheet_id;
    
    if (!spreadsheetId) {
      console.log(`📝 Usuário ${userEmail} não configurou Sheets`); // ✅ Use userEmail
      return null;
    }
    
    const doc = new GoogleSpreadsheet(spreadsheetId);
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
    
    console.log(`✅ Acessando planilha do usuário: ${userEmail}`); // ✅ Use userEmail
    return doc;
  } catch (error) {
    console.error(`❌ Erro ao acessar planilha do usuário ${userEmail}:`, error.message); // ✅ Use userEmail
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
      'id', 'nome', 'email', 'telefone', 'data', 'horario', 'status', 'confirmado', 'created_at', 'descricao'
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
    
    console.log(`📊 Nova planilha criada para ${userEmail}: ${doc.spreadsheetId}`); // ✅ Use userEmail
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
  
  // 🆕 FILTRA APENAS OS CAMPOS DESEJADOS
  const dadosFiltrados = {
    nome: updatedData.nome,
    email: updatedData.email || '',
    telefone: updatedData.telefone,
    data: updatedData.data,
    horario: updatedData.horario,
    status: updatedData.status
  };
  
  if (row) {
    Object.keys(dadosFiltrados).forEach(key => {
      if (sheet.headerValues.includes(key)) row[key] = dadosFiltrados[key];
    });
    await row.save();
  } else {
    await ensureDynamicHeaders(sheet, Object.keys(dadosFiltrados));
    await sheet.addRow(dadosFiltrados);
  }
}

// ---------------- MIDDLEWARE AUTH ----------------
async function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ msg: "Token não enviado" });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ msg: "Token inválido" });

  req.user = data.user;
  req.userId = data.user.id;
  next();
}

// ==================== HEALTH CHECKS OTIMIZADOS ====================
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "Backend rodando com otimizações e IA",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    ia_configurada: !!DEEPSEEK_API_KEY
  });
});

// Novo endpoint para warm-up (para o teu ping)
app.get("/warmup", async (req, res) => {
  try {
    const { data, error } = await supabase.from('agendamentos').select('count').limit(1);
    
    res.json({ 
      status: "WARM", 
      timestamp: new Date().toISOString(),
      supabase: error ? "offline" : "online",
      ia: DEEPSEEK_API_KEY ? "configurada" : "não configurada"
    });
  } catch (error) {
    res.json({ 
      status: "COLD", 
      timestamp: new Date().toISOString(),
      error: error.message 
    });
  }
});

// ==================== ROTAS COM CACHE CORRIGIDAS ====================

// 🔥 AGENDAMENTOS COM CACHE
app.get("/agendamentos", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const cacheKey = `agendamentos_${req.userId}`;
    
    const agendamentos = await cacheManager.getOrSet(cacheKey, async () => {
      console.log('🔄 Buscando agendamentos do DB para:', userEmail);
      const { data, error } = await supabase
        .from("agendamentos")
        .select("*")
       .eq("cliente", req.userId)
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
    const cacheKey = `config_${req.userId}`;
    
    const config = await cacheManager.getOrSet(cacheKey, async () => {
      return {
        temSheetsConfigurado: !!req.user.user_metadata?.spreadsheet_id,
        spreadsheetId: req.user.user_metadata?.spreadsheet_id
      };
    }, 5 * 60 * 1000);
    
    console.log(`📊 Configuração do usuário ${req.userId}:`, config);
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
    cacheManager.delete(`config_${req.userId}`);
    cacheManager.delete(`agendamentos_${req.userId}`);
    
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
// 🔥 FUNÇÃO AUXILIAR: Verifica se usuário pode gerenciar agendamento
function usuarioPodeGerenciarAgendamento(agendamento, userId) {
  // ✅ Pode gerenciar se:
  // 1. É o dono do agendamento (cliente) OU
  // 2. É o dono do link que criou o agendamento (user_id) OU  
  // 3. É um administrador (se quiser implementar depois)
  return agendamento.cliente === userId || 
         agendamento.user_id === userId;
}
// 🔥 AGENDAR COM CACHE E INVALIDAÇÃO
app.post("/agendar", authMiddleware, async (req, res) => {
  try {
    const { Nome, Email, Telefone, Data, Horario } = req.body;
    // 👇 removido o Email da validação obrigatória
    if (!Nome || !Telefone || !Data || !Horario)
      return res.status(400).json({ msg: "Todos os campos obrigatórios" });

    const userEmail = req.user?.email || Email || null; // ✅ usa email do usuário logado, do corpo, ou null
    const cacheKey = `agendamentos_${req.userId}`;
    
     // 🆕 VALIDA HORÁRIO DE FUNCIONAMENTO
    const validacaoHorario = await validarHorarioFuncionamento(req.userId, Data, Horario);
    if (!validacaoHorario.valido) {
      return res.status(400).json({ 
        msg: `Horário indisponível: ${validacaoHorario.motivo}` 
      });
    }
    
    // ✅ PRIMEIRO VERIFICA CONFLITOS USANDO CACHE
    const agendamentosExistentes = await cacheManager.getOrSet(cacheKey, async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("cliente", req.userId)
        .order("data", { ascending: true })
        .order("horario", { ascending: true });

      if (error) throw error;
      return data || [];
    });

    // Verifica conflito usando dados em cache
    const conflito = agendamentosExistentes.find(a => 
      a.data === Data && a.horario === Horario
    );
    
    if (conflito) {
      return res.status(400).json({ 
        msg: "Você já possui um agendamento para esta data e horário" 
      });
    }

    // Se não há conflito, cria o agendamento
    const { data: novoAgendamento, error } = await supabase
      .from("agendamentos")
      .insert([{
        cliente: req.userId,
        user_id: req.userId,
        nome: Nome,
        email: Email || null, // ✅ agora pode ser null ou opcional
        telefone: Telefone,
        data: Data,
        horario: Horario,
        status: "pendente",
        confirmado: false,
      }])
      .select()
      .single();

    if (error) throw error;

    try {
      const doc = await accessUserSpreadsheet(userEmail, req.user.user_metadata);
      if (doc) {
        const sheet = doc.sheetsByIndex[0];
        
        // 🆕 USA DADOS FILTRADOS (igual ao agendamento público)
        const dadosSheets = {
          nome: novoAgendamento.nome,
          email: Email || '',
          telefone: novoAgendamento.telefone,
          data: novoAgendamento.data,
          horario: novoAgendamento.horario,
          status: novoAgendamento.status
        };
        
        await ensureDynamicHeaders(sheet, Object.keys(dadosSheets));
        await sheet.addRow(dadosSheets);
        console.log(`✅ Agendamento salvo na planilha do usuário ${req.userId}`);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    // 🔥 INVALIDA CACHE PARA FORÇAR ATUALIZAÇÃO
    cacheManager.delete(cacheKey);
    
    res.json({ msg: "Agendamento realizado com sucesso!", agendamento: novoAgendamento });

  } catch (err) {
    console.error("Erro no /agendar:", err);
    res.status(500).json({ msg: "Erro interno no servidor" });
  }
});

// 🔥 CONFIRMAR AGENDAMENTO CORRIGIDO
app.post("/agendamentos/:email/confirmar/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user.email;
    
    console.log('✅ Confirmando agendamento ID:', id, 'por usuário:', userEmail, 'userId:', req.userId);

    // ✅ BUSCA O AGENDAMENTO SEM FILTRAR POR CLIENTE
    const { data: agendamento, error: fetchError } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !agendamento) {
      return res.status(404).json({ msg: "Agendamento não encontrado" });
    }

    console.log('📋 Agendamento encontrado:', {
      id: agendamento.id,
      cliente: agendamento.cliente,
      user_id: agendamento.user_id,
      nome: agendamento.nome
    });

    // ✅ VERIFICA SE USUÁRIO TEM PERMISSÃO
    if (!usuarioPodeGerenciarAgendamento(agendamento, req.userId)) {
      return res.status(403).json({ 
        msg: "Você não tem permissão para confirmar este agendamento" 
      });
    }

    // ✅ ATUALIZA SEM FILTRAR POR CLIENTE (já verificamos permissão)
    const { data, error } = await supabase.from("agendamentos")
      .update({ 
        confirmado: true, 
        status: "confirmado",
      })
      .eq("id", id)
      .select()
      .single();
    
    if (error) throw error;
    if (!data) return res.status(404).json({ msg: "Agendamento não encontrado" });

    // Atualiza Google Sheets
    try {
      const doc = await accessUserSpreadsheet(userEmail, req.user.user_metadata);
      if (doc) {
        const dadosFiltrados = {
  nome: data.nome,
  email: data.email || '',
  telefone: data.telefone,
  data: data.data,
  horario: data.horario,
  status: data.status
};
await updateRowInSheet(doc.sheetsByIndex[0], id, dadosFiltrados);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    // 🔥 INVALIDA CACHE DE AMBOS OS USUÁRIOS
    cacheManager.delete(`agendamentos_${req.userId}`);
    if (agendamento.cliente && agendamento.cliente !== req.userId) {
      cacheManager.delete(`agendamentos_${agendamento.cliente}`);
    }
    
    res.json({ 
      msg: "Agendamento confirmado com sucesso!", 
      agendamento: data 
    });
  } catch (err) {
    console.error("Erro ao confirmar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});


// 🔥 CANCELAR AGENDAMENTO CORRIGIDO
app.post("/agendamentos/:email/cancelar/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user.email;
    
    console.log('❌ Cancelando agendamento ID:', id, 'por usuário:', userEmail, 'userId:', req.userId);

    // ✅ BUSCA O AGENDAMENTO SEM FILTRAR POR CLIENTE
    const { data: agendamento, error: fetchError } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !agendamento) {
      return res.status(404).json({ msg: "Agendamento não encontrado" });
    }

    console.log('📋 Agendamento encontrado:', {
      id: agendamento.id,
      cliente: agendamento.cliente,
      user_id: agendamento.user_id,
      nome: agendamento.nome
    });

    // ✅ VERIFICA SE USUÁRIO TEM PERMISSÃO
    if (!usuarioPodeGerenciarAgendamento(agendamento, req.userId)) {
      return res.status(403).json({ 
        msg: "Você não tem permissão para cancelar este agendamento" 
      });
    }

    // ✅ ATUALIZA SEM FILTRAR POR CLIENTE (já verificamos permissão)
    const { data, error } = await supabase.from("agendamentos")
      .update({ 
        status: "cancelado", 
        confirmado: false,
      })
      .eq("id", id)
      .select()
      .single();
    
    if (error) throw error;
    if (!data) return res.status(404).json({ msg: "Agendamento não encontrado" });

    // Atualiza Google Sheets
    try {
      const doc = await accessUserSpreadsheet(userEmail, req.user.user_metadata);
      if (doc) {
       const dadosFiltrados = {
  nome: data.nome,
  email: data.email || '',
  telefone: data.telefone,
  data: data.data,
  horario: data.horario,
  status: data.status
};
await updateRowInSheet(doc.sheetsByIndex[0], id, dadosFiltrados);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    // 🔥 INVALIDA CACHE DE AMBOS OS USUÁRIOS
    cacheManager.delete(`agendamentos_${req.userId}`);
    if (agendamento.cliente && agendamento.cliente !== req.userId) {
      cacheManager.delete(`agendamentos_${agendamento.cliente}`);
    }
    
    res.json({ 
      msg: "Agendamento cancelado com sucesso!", 
      agendamento: data 
    });
  } catch (err) {
    console.error("Erro ao cancelar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});


// 🔥 REAGENDAR AGENDAMENTO CORRIGIDO
app.post("/agendamentos/:email/reagendar/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { novaData, novoHorario } = req.body;
    const userEmail = req.user.email;
    
    if (!novaData || !novoHorario) return res.status(400).json({ msg: "Data e horário obrigatórios" });

    console.log('🔄 Reagendando agendamento ID:', id, 'por usuário:', userEmail, 'userId:', req.userId);

    // ✅ BUSCA O AGENDAMENTO SEM FILTRAR POR CLIENTE (igual aos outros endpoints)
    const { data: agendamento, error: fetchError } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !agendamento) {
      return res.status(404).json({ msg: "Agendamento não encontrado" });
    }

    console.log('📋 Agendamento encontrado:', {
      id: agendamento.id,
      cliente: agendamento.cliente,
      user_id: agendamento.user_id,
      nome: agendamento.nome
    });

    // ✅ VERIFICA SE USUÁRIO TEM PERMISSÃO (igual aos outros endpoints)
    if (!usuarioPodeGerenciarAgendamento(agendamento, req.userId)) {
      return res.status(403).json({ 
        msg: "Você não tem permissão para reagendar este agendamento" 
      });
    }

    // ✅ VERIFICA CONFLITO DIRETAMENTE NO BANCO (corrigido)
    const { data: conflito, error: conflitoError } = await supabase
      .from("agendamentos")
      .select("id")
      .eq("data", novaData)
      .eq("horario", novoHorario)
      .neq("id", id)
      .single();

    if (conflito && !conflitoError) {
      return res.status(400).json({ 
        msg: "Já existe um agendamento para esta nova data e horário" 
      });
    }

    // ✅ ATUALIZA SEM FILTRAR POR CLIENTE (já verificamos permissão)
    const { data, error } = await supabase.from("agendamentos")
      .update({ 
        data: novaData,
        horario: novoHorario,
        status: "pendente",
        confirmado: false
      })
      .eq("id", id)
      .select()
      .single();
    
    if (error) throw error;
    if (!data) return res.status(404).json({ msg: "Agendamento não encontrado" });

    // Atualiza Google Sheets
    try {
      const doc = await accessUserSpreadsheet(userEmail, req.user.user_metadata);
      if (doc) {
        const dadosFiltrados = {
  nome: data.nome,
  email: data.email || '',
  telefone: data.telefone,
  data: data.data,
  horario: data.horario,
  status: data.status
};
await updateRowInSheet(doc.sheetsByIndex[0], id, dadosFiltrados);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    // 🔥 INVALIDA CACHE DE AMBOS OS USUÁRIOS (igual aos outros endpoints)
    cacheManager.delete(`agendamentos_${req.userId}`);
    if (agendamento.cliente && agendamento.cliente !== req.userId) {
      cacheManager.delete(`agendamentos_${agendamento.cliente}`);
    }
    
    res.json({ 
      msg: "Agendamento reagendado com sucesso!", 
      agendamento: data 
    });
  } catch (err) {
    console.error("Erro ao reagendar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// Rota para criar/atualizar perfil
app.post("/api/criar-perfil", authMiddleware, async (req, res) => {
  try {
    const { nome_negocio, tipo_negocio, horarios_funcionamento, dias_funcionamento } = req.body;
    
    if (!nome_negocio || !tipo_negocio || !horarios_funcionamento || !dias_funcionamento) {
      return res.status(400).json({ msg: "Todos os campos são obrigatórios" });
    }

    // Verifica se já existe perfil
    const { data: perfilExistente } = await supabase
      .from("perfis_negocio")
      .select("*")
      .eq("user_id", req.userId)
      .single();

    let resultado;
    
    if (perfilExistente) {
      // Atualiza perfil existente
      const { data, error } = await supabase
        .from("perfis_negocio")
        .update({
          nome_negocio,
          tipo_negocio,
          horarios_funcionamento,
          dias_funcionamento,
          updated_at: new Date()
        })
        .eq("user_id", req.userId)
        .select()
        .single();
      
      if (error) throw error;
      resultado = data;
    } else {
      // Cria novo perfil
      const { data, error } = await supabase
        .from("perfis_negocio")
        .insert([{
          user_id: req.userId,
          nome_negocio,
          tipo_negocio,
          horarios_funcionamento,
          dias_funcionamento
        }])
        .select()
        .single();
      
      if (error) throw error;
      resultado = data;
    }

    // Invalida cache
    cacheManager.delete(`perfil_${req.userId}`);
    
    res.json({
      success: true,
      msg: perfilExistente ? "Perfil atualizado com sucesso!" : "Perfil criado com sucesso!",
      perfil: resultado
    });

  } catch (error) {
    console.error("Erro ao criar perfil:", error);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// Rota para obter perfil
app.get("/api/meu-perfil", authMiddleware, async (req, res) => {
  try {
    const cacheKey = `perfil_${req.userId}`;
    
    const perfil = await cacheManager.getOrSet(cacheKey, async () => {
      const { data, error } = await supabase
        .from("perfis_negocio")
        .select("*")
        .eq("user_id", req.userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = não encontrado
      return data || null;
    }, 10 * 60 * 1000); // 10 minutos cache

    res.json({
      success: true,
      perfil: perfil
    });

  } catch (error) {
    console.error("Erro ao buscar perfil:", error);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ==================== FUNÇÃO AUXILIAR: Obter horários do perfil ====================

async function obterHorariosPerfil(userId) {
  try {
    const cacheKey = `perfil_${userId}`;
    
    const perfil = await cacheManager.getOrSet(cacheKey, async () => {
      const { data, error } = await supabase
        .from("perfis_negocio")
        .select("horarios_funcionamento, dias_funcionamento")
        .eq("user_id", userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }, 10 * 60 * 1000);

    return perfil;
  } catch (error) {
    console.error("Erro ao obter horários do perfil:", error);
    return null;
  }
}

// ---------------- Error Handling ----------------
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ msg: "Algo deu errado!" });
});

app.use("*", (req, res) => {
  res.status(404).json({ msg: "Endpoint não encontrado" });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend otimizado rodando na porta ${PORT}`);
  console.log('✅ Cache em memória ativo');
  console.log('✅ Health checks otimizados');
  console.log('🤖 DeepSeek IA: ' + (DEEPSEEK_API_KEY ? 'CONFIGURADA' : 'NÃO CONFIGURADA'));
  console.log('📊 Use /health para status completo');
  console.log('🔥 Use /warmup para manter instância ativa');
});


































