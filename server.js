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

app.post("/agendamento-publico", async (req, res) => {
  try {
    const { nome, email, telefone, data, horario, user_id, t } = req.body;
    
    if (!nome || !telefone || !data || !horario || !user_id || !t) {
      return res.status(400).json({ 
        success: false,
        msg: "Link inválido ou expirado" 
      });
    }

    // 🆕 🔥 VALIDAÇÃO DE HORA CHEIA APENAS PARA PÚBLICO
    const minutos = horario.split(':')[1];
    if (minutos !== '00') {
        return res.status(400).json({ 
            success: false,
            msg: "Apenas horários de hora em hora são permitidos (ex: 09:00, 10:00, 11:00)" 
        });
    }

    // ✅ 1. PRIMEIRO VALIDA TUDO (sem incrementar uso)
    const validacaoHorario = await validarHorarioFuncionamento(user_id, data, horario);
    if (!validacaoHorario.valido) {
        return res.status(400).json({ 
            success: false,
            msg: `Horário indisponível: ${validacaoHorario.motivo}` 
        });
    }

    // 🆕 VERIFICAÇÃO DE USO ÚNICO (ANTES de incrementar)
    const { data: linkUsado } = await supabase
      .from('links_uso')
      .select('*')
      .eq('token', t)
      .eq('user_id', user_id)
      .single();

    if (linkUsado) {
      return res.status(400).json({ 
        success: false,
        msg: "Este link já foi utilizado. Solicite um novo link de agendamento." 
      });
    }

    // 🆕 VERIFICA EXPIRAÇÃO (24 horas) - ANTES de incrementar
    const agora = Date.now();
    const diferenca = agora - parseInt(t);
    const horas = diferenca / (1000 * 60 * 60);
    
    if (horas > 24) {
      return res.status(400).json({ 
        success: false,
        msg: "Link expirado. Gere um novo link de agendamento." 
      });
    }

    // Verifica se o user_id existe
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(user_id);
    if (userError || !user) {
      return res.status(400).json({ 
        success: false,
        msg: "Link inválido" 
      });
    }

    // Verifica conflitos
    const { data: conflito } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("user_id", user_id)
      .eq("data", data)
      .eq("horario", horario)
      .neq("status", "cancelado");
    
    if (conflito && conflito.length > 0) {
      return res.status(400).json({ 
        success: false,
        msg: "Horário indisponível" 
      });
    }

// ✅ INCREMENTO CORRETO - USA APENAS daily_usage_count  
const trial = await getUserTrialBackend(user_id);
if (trial && trial.status === 'active') {
    const today = new Date().toISOString().split('T')[0];
    const lastUsageDate = trial.last_usage_date ? 
        new Date(trial.last_usage_date).toISOString().split('T')[0] : null;
    
    let dailyUsageCount = trial.daily_usage_count || 0;
    
    if (lastUsageDate !== today) {
        dailyUsageCount = 0;
    }
    
    const dailyLimit = trial.max_usages || 5;
    
    if (dailyUsageCount >= dailyLimit) {
        return res.status(400).json({ 
            success: false,
            msg: `Limite diário atingido (${dailyLimit} usos).` 
        });
    }
    
    // ✅ INCREMENTA APENAS daily_usage_count (COLUNA CORRETA)
    await supabase
        .from('user_trials')
        .update({
            daily_usage_count: dailyUsageCount + 1,
            last_usage_date: new Date().toISOString()
        })
        .eq('user_id', user_id);
        
    console.log(`✅ daily_usage_count atualizado: ${dailyUsageCount} → ${dailyUsageCount + 1}`);
}
    
    // ✅ 3. CRIA O AGENDAMENTO (se chegou até aqui, tudo validado)
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
    res.status(500).json({ 
      success: false,
      msg: "Erro interno no servidor" 
    });
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



// 🔥 SUBSTITUIR: Nova função com bloqueios RECORRENTES + DATA ESPECÍFICA
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

    // 🎯 1. VERIFICA SE O DIA ESTÁ NOS DIAS DE FUNCIONAMENTO
    if (!perfil.dias_funcionamento.includes(diaSemana)) {
      return { 
        valido: false, 
        motivo: `Não atendemos aos ${diaSemana}s` 
      };
    }

    // 🎯 2. VERIFICA SE O HORÁRIO ESTÁ DENTRO DO FUNCIONAMENTO
    const horarioFuncionamento = perfil.horarios_funcionamento[diaSemana];
    if (!horarioFuncionamento) {
      return { valido: true }; // Dia sem configuração específica
    }

    if (horario < horarioFuncionamento.inicio || horario >= horarioFuncionamento.fim) {
      return { 
        valido: false, 
        motivo: `Horário fora do funcionamento (${horarioFuncionamento.inicio} - ${horarioFuncionamento.fim})` 
      };
    }

    // 🎯 3. 🔥 ATUALIZADO: VERIFICA BLOQUEIOS MISTOS (RECORRENTES + DATA ESPECÍFICA)
    if (perfil.horarios_bloqueados && perfil.horarios_bloqueados.length > 0) {
      const horarioCompleto = `${data}T${horario}`;
      const dataHorarioAgendamento = new Date(horarioCompleto);
      
      for (const periodo of perfil.horarios_bloqueados) {
        // 🆕 VERIFICA TIPO DE BLOQUEIO
        let estaBloqueado = false;
        let motivo = '';
        
        if (periodo.tipo === 'recorrente') {
          // ✅ BLOQUEIO RECORRENTE: Aplica para TODOS os dias
          const inicioPeriodo = new Date(`${data}T${periodo.inicio}`);
          const fimPeriodo = new Date(`${data}T${periodo.fim}`);
          
          if (dataHorarioAgendamento >= inicioPeriodo && dataHorarioAgendamento < fimPeriodo) {
            estaBloqueado = true;
            motivo = `Horário dentro do período bloqueado recorrente (${periodo.inicio} - ${periodo.fim})`;
          }
        } 
        else if (periodo.tipo === 'data_especifica' && periodo.data === data) {
          // ✅ BLOQUEIO POR DATA: Aplica apenas para data específica
          const inicioPeriodo = new Date(`${data}T${periodo.inicio}`);
          const fimPeriodo = new Date(`${data}T${periodo.fim}`);
          
          if (dataHorarioAgendamento >= inicioPeriodo && dataHorarioAgendamento < fimPeriodo) {
            estaBloqueado = true;
            motivo = `Horário dentro do período bloqueado (${periodo.inicio} - ${periodo.fim})`;
          }
        }
        // ✅ SE NÃO TEM TIPO (COMPATIBILIDADE): Assume data_especifica
        else if (!periodo.tipo && periodo.data === data) {
          const inicioPeriodo = new Date(`${data}T${periodo.inicio}`);
          const fimPeriodo = new Date(`${data}T${periodo.fim}`);
          
          if (dataHorarioAgendamento >= inicioPeriodo && dataHorarioAgendamento < fimPeriodo) {
            estaBloqueado = true;
            motivo = `Horário dentro do período bloqueado (${periodo.inicio} - ${periodo.fim})`;
          }
        }
        
        if (estaBloqueado) {
          return { valido: false, motivo };
        }
      }
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



// 🎯 FUNÇÃO CORRIGIDA: Usa dados REAIS sem precisar do userId
async function gerarSugestoesInteligentes(agendamentos, perfilInfo) {
  const hoje = new Date();
  const diasAnalise = 7;
  
  // 🎯 AGRUPA AGENDAMENTOS POR DATA (REAIS)
  const agendamentosPorData = {};
  agendamentos.forEach(ag => {
    if (!agendamentosPorData[ag.data]) {
      agendamentosPorData[ag.data] = [];
    }
    agendamentosPorData[ag.data].push(ag.horario);
  });

  // 🎯 ANALISA CADA DIA COM DADOS REAIS
  const diasAnalisados = [];

  for (let i = 0; i < diasAnalise; i++) {
    const data = new Date(hoje);
    data.setDate(hoje.getDate() + i);
    const dataStr = data.toISOString().split('T')[0];
    
    // 🎯 CONVERTE PARA DIA DA SEMANA
    const diasSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const diaSemanaPortugues = diasSemana[data.getDay()];
    
    // 🔥 VERIFICA SE O DIA É DE FUNCIONAMENTO
    const diaFuncionamento = perfilInfo?.dias_funcionamento?.includes(diaSemanaPortugues);
    
    if (!diaFuncionamento) {
      continue; // Pula dias sem atendimento
    }

    const agendamentosDoDia = agendamentosPorData[dataStr] || [];
    
    // 🎯 CALCULA DISPONIBILIDADE REAL BASEADA NOS AGENDAMENTOS EXISTENTES
    const horarioFuncionamento = perfilInfo.horarios_funcionamento[diaSemanaPortugues];
    let horariosDisponiveisReais = [];
    
    if (horarioFuncionamento) {
      // 🎯 GERA HORÁRIOS POSSÍVEIS BASEADO NO PERFIL (sem buscar do Supabase)
      horariosDisponiveisReais = gerarHorariosIntervaloBackend(
        horarioFuncionamento.inicio, 
        horarioFuncionamento.fim, 
        60 // Horas cheias apenas
      ).filter(horario => {
        // Remove horários já agendados
        return !agendamentosDoDia.includes(horario);
      });
    }

    const diaInfo = {
      data: dataStr,
      dataFormatada: data.toLocaleDateString('pt-BR'),
      diaSemana: data.toLocaleDateString('pt-BR', { weekday: 'long' }),
      agendamentosOcupados: agendamentosDoDia.length,
      horariosDisponiveis: horariosDisponiveisReais.length,
      horariosDisponiveisLista: horariosDisponiveisReais.slice(0, 3), // Primeiros 3 horários
      ocupacao: horariosDisponiveisReais.length === 0 ? 100 : Math.round((agendamentosDoDia.length / (agendamentosDoDia.length + horariosDisponiveisReais.length)) * 100)
    };

    diasAnalisados.push(diaInfo);
  }

  // 🎯 ORDENA POR DISPONIBILIDADE (mais horários livres primeiro)
  diasAnalisados.sort((a, b) => b.horariosDisponiveis - a.horariosDisponiveis);

  // 🎯 GERA SUGESTÕES BASEADAS NA REALIDADE
  return gerarTextoRecomendacoesReais(diasAnalisados, perfilInfo);
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


app.post("/agendar", authMiddleware, async (req, res) => {
  try {
    const { Nome, Email, Telefone, Data, Horario } = req.body;
    
    if (!Nome || !Telefone || !Data || !Horario)
      return res.status(400).json({ msg: "Todos os campos obrigatórios" });

    // ✅ 1. PRIMEIRO VALIDA TUDO (sem incrementar uso)
    
    // Valida data no passado
    const dataAgendamento = new Date(`${Data}T${Horario}`);
    const agora = new Date();
    if (dataAgendamento < agora) {
      return res.status(400).json({ 
        success: false,
        msg: "Não é possível agendar no passado" 
      });
    }
    
    // Valida horário de funcionamento
    const validacaoHorario = await validarHorarioFuncionamento(req.userId, Data, Horario);
    if (!validacaoHorario.valido) {
      return res.status(400).json({ 
        msg: `Horário indisponível: ${validacaoHorario.motivo}` 
      });
    }
    
    // Verifica conflitos
    const cacheKey = `agendamentos_${req.userId}`;
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

    const conflito = agendamentosExistentes.find(a => 
      a.data === Data && a.horario === Horario && a.status !== "cancelado"
    );
    
    if (conflito) {
      return res.status(400).json({ 
        msg: "Você já possui um agendamento para esta data e horário" 
      });
    }

// ✅ INCREMENTO CORRETO - USA APENAS daily_usage_count
const trial = await getUserTrialBackend(req.userId);
if (trial && trial.status === 'active') {
    const today = new Date().toISOString().split('T')[0];
    const lastUsageDate = trial.last_usage_date ? 
        new Date(trial.last_usage_date).toISOString().split('T')[0] : null;
    
    let dailyUsageCount = trial.daily_usage_count || 0;
    
    if (lastUsageDate !== today) {
        dailyUsageCount = 0;
    }
    
    const dailyLimit = trial.max_usages || 5;
    
    if (dailyUsageCount >= dailyLimit) {
        return res.status(400).json({ 
            success: false,
            msg: `Limite diário atingido (${dailyLimit} usos).` 
        });
    }
    
    // ✅ INCREMENTA APENAS daily_usage_count (COLUNA CORRETA)
    await supabase
        .from('user_trials')
        .update({
            daily_usage_count: dailyUsageCount + 1,
            last_usage_date: new Date().toISOString()
        })
        .eq('user_id', req.userId);
        
    console.log(`✅ daily_usage_count atualizado: ${dailyUsageCount} → ${dailyUsageCount + 1}`);
}

    // ✅ 3. CRIA O AGENDAMENTO (se chegou até aqui, tudo validado)
    const userEmail = req.user?.email || Email || null;
    
    const { data: novoAgendamento, error } = await supabase
      .from("agendamentos")
      .insert([{
        cliente: req.userId,
        user_id: req.userId,
        nome: Nome,
        email: Email || null,
        telefone: Telefone,
        data: Data,
        horario: Horario,
        status: "pendente",
        confirmado: false,
      }])
      .select()
      .single();

    if (error) throw error;

    // Atualiza Google Sheets
    try {
      const doc = await accessUserSpreadsheet(userEmail, req.user.user_metadata);
      if (doc) {
        const sheet = doc.sheetsByIndex[0];
        
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
    
    res.json({ 
      success: true,
      msg: "Agendamento realizado com sucesso!", 
      agendamento: novoAgendamento 
    });

  } catch (err) {
    console.error("Erro no /agendar:", err);
    res.status(500).json({ 
      success: false,
      msg: "Erro interno no servidor" 
    });
  }
});



// 🆕 FUNÇÃO: Buscar trial do usuário (BACKEND)
async function getUserTrialBackend(userId) {
    try {
        const { data, error } = await supabase
            .from('user_trials')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
            
        if (error) {
            if (error.code === 'PGRST116') return null;
            throw error;
        }
        
        return data;
    } catch (error) {
        console.error('❌ Erro ao buscar trial (backend):', error);
        return null;
    }
}

// 🆕 FUNÇÃO: Verificar uso diário (BACKEND)  
async function getDailyUsageBackend(trial, dailyLimit) {
    if (!trial) return { dailyUsageCount: 0, dailyUsagesLeft: 0, lastUsageDate: null };
    
    const today = new Date().toISOString().split('T')[0];
    const lastUsageDate = trial.last_usage_date ? new Date(trial.last_usage_date).toISOString().split('T')[0] : null;
    
    let dailyUsageCount = trial.daily_usage_count || 0;
    
    // Reset diário se for um novo dia
    if (lastUsageDate !== today) {
        dailyUsageCount = 0;
    }
    
    const dailyUsagesLeft = Math.max(0, dailyLimit - dailyUsageCount);
    
    return {
        dailyUsageCount: dailyUsageCount,
        dailyUsagesLeft: dailyUsagesLeft,
        lastUsageDate: lastUsageDate
    };
}

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
// 🔥 ATUALIZAR: Rota para criar/atualizar perfil com horários_bloqueados
app.post("/api/criar-perfil", authMiddleware, async (req, res) => {
  try {
    const { 
      nome_negocio, 
      tipo_negocio, 
      horarios_funcionamento, 
      dias_funcionamento,
      horarios_bloqueados = [] // 🆕 Campo novo para períodos bloqueados
    } = req.body;
    
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
          horarios_bloqueados, // 🆕 Inclui períodos bloqueados
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
          dias_funcionamento,
          horarios_bloqueados // 🆕 Inclui períodos bloqueados
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

// 🎯 ROTA INTELIGENTE - CACHE APENAS QUANDO TEM PERFIL
app.get("/api/meu-perfil", authMiddleware, async (req, res) => {
  try {
    const { forcado } = req.query;
    const cacheKey = `perfil_${req.userId}`;
    
    // Se forçado, limpa cache
    if (forcado) {
      cacheManager.delete(cacheKey);
    }
    
    // 🆕 CONSULTA DIRETA SEM CACHE MANAGER
    console.log('📡 Consulta DIRETA ao banco (cache ignorado)');
    const { data, error } = await supabase
      .from("perfis_negocio")
      .select("*")
      .eq("user_id", req.userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    const perfil = data || null;
    
    console.log('📊 Resultado REAL:', perfil ? `Perfil ${perfil.id}` : 'SEM PERFIL');
    
    res.json({
      success: true,
      perfil: perfil,
      cache: false, // 🆕 Sempre false agora
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Erro ao buscar perfil:", error);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ==================== FUNÇÃO AUXILIAR: Obter horários do perfil ====================

// 🔥 ATUALIZAR: Função para obter horários do perfil incluindo bloqueados
async function obterHorariosPerfil(userId) {
  try {
    const cacheKey = `perfil_${userId}`;
    
    const perfil = await cacheManager.getOrSet(cacheKey, async () => {
      const { data, error } = await supabase
        .from("perfis_negocio")
        .select("horarios_funcionamento, dias_funcionamento, horarios_bloqueados") // 🆕 Inclui bloqueados
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

// 🔥 ADICIONE ESTA ROTA NO SEU BACKEND (app.js)
app.get("/api/perfil-publico/:user_id", async (req, res) => {
    try {
        const { user_id } = req.params;
        
        // Busca perfil REAL da tabela perfis_negocio
        const { data: perfil, error } = await supabase
            .from("perfis_negocio")
            .select("*")
            .eq("user_id", user_id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        
        res.json({ 
            success: true, 
            perfil: perfil || null 
        });
        
    } catch (error) {
        console.error("Erro no perfil público:", error);
        res.json({ success: true, perfil: null });
    }
});
// 🔥 SUBSTITUIR: Rota para horários disponíveis com BLOQUEIOS MISTOS
app.get("/api/horarios-disponiveis/:user_id", async (req, res) => {
    try {
        const { user_id } = req.params;
        const { data } = req.query; // Data no formato YYYY-MM-DD
        
        if (!user_id || !data) {
            return res.status(400).json({ 
                success: false, 
                msg: "user_id e data são obrigatórios" 
            });
        }

        // 🎯 1. BUSCA PERFIL DO NEGÓCIO
        const { data: perfil, error: perfilError } = await supabase
            .from("perfis_negocio")
            .select("horarios_funcionamento, dias_funcionamento, horarios_bloqueados")
            .eq("user_id", user_id)
            .single();

        if (perfilError && perfilError.code !== 'PGRST116') {
            console.error("Erro ao buscar perfil:", perfilError);
        }

        // Se não tem perfil, retorna vazio
        if (!perfil) {
            return res.json({ 
                success: true, 
                horariosDisponiveis: [],
                motivo: "Perfil não configurado"
            });
        }

        // 🎯 2. VERIFICA SE É DIA DE FUNCIONAMENTO
        const dataObj = new Date(data);
        const diasSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
        const diaSemana = diasSemana[dataObj.getDay()];

        if (!perfil.dias_funcionamento.includes(diaSemana)) {
            return res.json({ 
                success: true, 
                horariosDisponiveis: [],
                motivo: `Não atendemos aos ${diaSemana}s`
            });
        }

        // 🎯 3. BUSCA HORÁRIOS JÁ AGENDADOS NESTA DATA
        const { data: agendamentos, error: agendamentosError } = await supabase
            .from("agendamentos")
            .select("horario")
            .eq("user_id", user_id)
            .eq("data", data)
            .neq("status", "cancelado");

        if (agendamentosError) {
            console.error("Erro ao buscar agendamentos:", agendamentosError);
            return res.status(500).json({ 
                success: false, 
                msg: "Erro ao verificar agendamentos" 
            });
        }

        const horariosOcupados = agendamentos?.map(a => a.horario) || [];

        // 🎯 4. GERA HORÁRIOS DISPONÍVEIS BASEADO NO PERFIL
        const horarioDia = perfil.horarios_funcionamento[diaSemana];
        if (!horarioDia) {
            return res.json({ 
                success: true, 
                horariosDisponiveis: [],
                motivo: "Horário não configurado para este dia"
            });
        }

        // Gera todos horários possíveis do dia
        const todosHorarios = gerarHorariosIntervalo(
            horarioDia.inicio, 
            horarioDia.fim, 
            30
        );

        // 🎯 5. 🔥 ATUALIZADO: FILTRA HORÁRIOS BLOQUEADOS MISTOS
        let horariosDisponiveis = todosHorarios.filter(horario => {
            // Remove horários ocupados
            if (horariosOcupados.includes(horario)) {
                return false;
            }
            
            // 🔥 VERIFICA BLOQUEIOS MISTOS
            if (perfil.horarios_bloqueados && perfil.horarios_bloqueados.length > 0) {
                const horarioCompleto = `${data}T${horario}`;
                const dataHorario = new Date(horarioCompleto);
                
                for (const periodo of perfil.horarios_bloqueados) {
                    let estaBloqueado = false;
                    
                    // 🆕 BLOQUEIO RECORRENTE (aplica para TODOS os dias)
                    if (periodo.tipo === 'recorrente') {
                        const inicioPeriodo = new Date(`${data}T${periodo.inicio}`);
                        const fimPeriodo = new Date(`${data}T${periodo.fim}`);
                        
                        if (dataHorario >= inicioPeriodo && dataHorario < fimPeriodo) {
                            estaBloqueado = true;
                        }
                    } 
                    // 🆕 BLOQUEIO POR DATA (aplica apenas para data específica)
                    else if (periodo.tipo === 'data_especifica' && periodo.data === data) {
                        const inicioPeriodo = new Date(`${data}T${periodo.inicio}`);
                        const fimPeriodo = new Date(`${data}T${periodo.fim}`);
                        
                        if (dataHorario >= inicioPeriodo && dataHorario < fimPeriodo) {
                            estaBloqueado = true;
                        }
                    }
                    // ✅ COMPATIBILIDADE: Bloqueios antigos sem tipo (assume data_especifica)
                    else if (!periodo.tipo && periodo.data === data) {
                        const inicioPeriodo = new Date(`${data}T${periodo.inicio}`);
                        const fimPeriodo = new Date(`${data}T${periodo.fim}`);
                        
                        if (dataHorario >= inicioPeriodo && dataHorario < fimPeriodo) {
                            estaBloqueado = true;
                        }
                    }
                    
                    if (estaBloqueado) {
                        return false; // Horário bloqueado
                    }
                }
            }
            
            return true; // Horário disponível
        });

        // 🆕 SEPARA BLOQUEIOS POR TIPO PARA O FRONTEND
        const periodosBloqueadosEstaData = {
            recorrentes: [],
            data_especifica: []
        };

        if (perfil.horarios_bloqueados) {
            perfil.horarios_bloqueados.forEach(periodo => {
                if (periodo.tipo === 'recorrente') {
                    periodosBloqueadosEstaData.recorrentes.push(periodo);
                } 
                else if ((periodo.tipo === 'data_especifica' || !periodo.tipo) && periodo.data === data) {
                    periodosBloqueadosEstaData.data_especifica.push(periodo);
                }
            });
        }

        res.json({
            success: true,
            horariosDisponiveis: horariosDisponiveis,
            horariosOcupados: horariosOcupados,
            totalDisponiveis: horariosDisponiveis.length,
            totalOcupados: horariosOcupados.length,
            horarioFuncionamento: horarioDia,
            periodosBloqueados: periodosBloqueadosEstaData // 🆕 Estrutura organizada
        });

    } catch (error) {
        console.error("Erro na rota horários-disponiveis:", error);
        res.status(500).json({ 
            success: false, 
            msg: "Erro interno ao verificar horários" 
        });
    }
});


// 🆕 NOVA ROTA: Gerenciar horários bloqueados
app.post("/api/horarios-bloqueados", authMiddleware, async (req, res) => {
  try {
    const { horarios_bloqueados } = req.body;
    
    if (!Array.isArray(horarios_bloqueados)) {
      return res.status(400).json({ 
        success: false, 
        msg: "horarios_bloqueados deve ser um array" 
      });
    }

    // Verifica se já existe perfil
    const { data: perfilExistente } = await supabase
      .from("perfis_negocio")
      .select("id")
      .eq("user_id", req.userId)
      .single();

    if (!perfilExistente) {
      return res.status(400).json({ 
        success: false, 
        msg: "Crie um perfil do negócio primeiro" 
      });
    }

    // Atualiza apenas os horários bloqueados
    const { data, error } = await supabase
      .from("perfis_negocio")
      .update({
        horarios_bloqueados,
        updated_at: new Date()
      })
      .eq("user_id", req.userId)
      .select()
      .single();

    if (error) throw error;

    // Invalida cache
    cacheManager.delete(`perfil_${req.userId}`);
    
    res.json({
      success: true,
      msg: "Horários bloqueados atualizados com sucesso!",
      horarios_bloqueados: data.horarios_bloqueados
    });

  } catch (error) {
    console.error("Erro ao atualizar horários bloqueados:", error);
    res.status(500).json({ 
      success: false, 
      msg: "Erro interno" 
    });
  }
});


// 🔥 FUNÇÃO AUXILIAR - GERA HORÁRIOS EM INTERVALO (JÁ EXISTE NO FRONT, ADICIONE NO BACKEND TAMBÉM)
function gerarHorariosIntervalo(inicio, fim, intervaloMinutos) {
    const horarios = [];
    const [horaInicio, minutoInicio] = inicio.split(':').map(Number);
    const [horaFim, minutoFim] = fim.split(':').map(Number);
    
    let horaAtual = horaInicio;
    let minutoAtual = minutoInicio;
    
    while (horaAtual < horaFim || (horaAtual === horaFim && minutoAtual < minutoFim)) {
        const horario = `${horaAtual.toString().padStart(2, '0')}:${minutoAtual.toString().padStart(2, '0')}`;
        horarios.push(horario);
        
        // Adiciona intervalo
        minutoAtual += intervaloMinutos;
        if (minutoAtual >= 60) {
            horaAtual += Math.floor(minutoAtual / 60);
            minutoAtual = minutoAtual % 60;
        }
    }
    
    return horarios;
}

// ✅ WEBHOOK HOTMART CORRETO
app.post('/api/webhooks/hotmart', async (req, res) => {
    try {
        console.log('🔔 Webhook Hotmart recebido:', req.body);
        
        const { event, data } = req.body;
        
        // ⭐⭐ VALIDAÇÃO DE SEGURANÇA (IMPORTANTE!)
        // Verificar se vem da Hotmart (opcional mas recomendado)
        // Você pode validar IPs ou usar assinatura
        
        console.log('📦 Evento:', event);
        console.log('📊 Dados:', JSON.stringify(data, null, 2));
        
        if (event === 'PURCHASE_APPROVED' || event === 'SUBSCRIPTION_ACTIVATED') {
            const buyer = data.buyer || data.subscriber;
            const subscription = data.subscription || data.plan;
            
            if (!buyer || !buyer.email) {
                console.log('❌ Email do comprador não encontrado');
                return res.status(400).json({ error: 'Email do comprador não encontrado' });
            }
            
            console.log('🎯 Ativando assinatura para:', buyer.email);
            
            // Criar/atualizar assinatura
            const { error } = await supabase
                .from('user_subscriptions')
                .upsert({
                    user_email: buyer.email,
                    hotmart_subscription_id: subscription?.subscription_code || `hotmart_${Date.now()}`,
                    plan_type: 'pro',
                    status: 'active',
                    max_daily_schedules: 999, // Ilimitado
                    starts_at: new Date().toISOString(),
                    ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 dias
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_email'
                });
                
            if (error) {
                console.error('❌ Erro ao salvar no Supabase:', error);
                return res.status(500).json({ error: 'Erro ao salvar assinatura' });
            }
            
            console.log('✅ Assinatura ativada/atualizada para:', buyer.email);
        }
        
        else if (event === 'SUBSCRIPTION_CANCELLED' || event === 'PURCHASE_REFUNDED') {
            const subscriber = data.subscriber || data.buyer;
            
            if (!subscriber || !subscriber.email) {
                console.log('❌ Email do assinante não encontrado');
                return res.status(400).json({ error: 'Email do assinante não encontrado' });
            }
            
            console.log('🛑 Cancelando assinatura para:', subscriber.email);
            
            // Marcar assinatura como cancelada
            const { error } = await supabase
                .from('user_subscriptions')
                .update({
                    status: 'canceled',
                    ends_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('user_email', subscriber.email);
                
            if (error) {
                console.error('❌ Erro ao cancelar no Supabase:', error);
                return res.status(500).json({ error: 'Erro ao cancelar assinatura' });
            }
            
            console.log('✅ Assinatura cancelada para:', subscriber.email);
        }
        
        else if (event === 'SUBSCRIPTION_EXPIRED') {
            const subscriber = data.subscriber;
            
            if (subscriber && subscriber.email) {
                console.log('📅 Assinatura expirada para:', subscriber.email);
                
                const { error } = await supabase
                    .from('user_subscriptions')
                    .update({
                        status: 'expired',
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_email', subscriber.email);
                    
                if (error) console.error('Erro ao expirar assinatura:', error);
            }
        }
        
        else {
            console.log('ℹ️ Evento não tratado:', event);
        }
        
        // ⭐⭐ SEMPRE RESPONDA 200 PARA A HOTMART
        res.status(200).json({ 
            success: true, 
            message: 'Webhook processado com sucesso',
            event: event
        });
        
    } catch (error) {
        console.error('❌ Erro no webhook Hotmart:', error);
        // ⭐⭐ IMPORTANTE: Mesmo com erro, responda 200 para a Hotmart
        res.status(200).json({ 
            success: false, 
            error: 'Erro interno mas webhook recebido' 
        });
    }
});

app.get("/gerar-link/:user_id", authMiddleware, async (req, res) => {
  try {
    const user_id = req.params.user_id;
    
    // Verifica se é o próprio usuário
    if (req.userId !== user_id) {
      return res.status(403).json({ msg: "Não autorizado" });
    }

    // ✅ ADICIONE ESTA VERIFICAÇÃO DE LIMITE (ANTES de gerar o link)
    const trial = await getUserTrialBackend(user_id);
    if (trial && trial.status === 'active') {
      const dailyLimit = trial.max_usages || 5;
      const dailyUsage = await getDailyUsageBackend(trial, dailyLimit);
      
      // 🚫 BLOQUEIA se não tem usos disponíveis
      if (dailyUsage.dailyUsagesLeft <= 0) {
        return res.status(400).json({ 
          success: false,
          msg: `Limite diário atingido (${dailyLimit} usos). Os usos resetam à meia-noite.` 
        });
      }
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

// 🔥 NOVA FUNÇÃO: Atualizar estrutura da tabela perfis_negocio
async function atualizarEstruturaPerfis() {
  try {
    console.log('🔧 Verificando estrutura da tabela perfis_negocio...');
    
    // Verifica se a coluna horarios_bloqueados existe
    const { data, error } = await supabase
      .from('perfis_negocio')
      .select('*')
      .limit(1);
    
    if (error) throw error;
    
    console.log('✅ Estrutura atual da tabela:', Object.keys(data[0] || {}));
    
  } catch (error) {
    console.log('ℹ️ Estrutura da tabela:', error.message);
  }
}

// Chame esta função no startup
atualizarEstruturaPerfis();
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

















































