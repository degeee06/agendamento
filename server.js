import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { GoogleSpreadsheet } from "google-spreadsheet";
import crypto from 'crypto';


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

// Rota para verificar perfil
app.get("/api/meu-perfil", authMiddleware, async (req, res) => {
    try {
        const { data: perfil, error } = await supabase
            .from('perfis_usuarios')
            .select('*')
            .eq('user_id', req.user.id)
            .single();

        if (error || !perfil) {
            return res.json({ 
                success: false, 
                temPerfil: false 
            });
        }

        res.json({ 
            success: true, 
            temPerfil: true,
            perfil 
        });

    } catch (error) {
        console.error("Erro ao verificar perfil:", error);
        res.status(500).json({ success: false, msg: "Erro interno" });
    }
});

// Rota para criar perfil (já existe, só garantir que está funcionando)
app.post("/api/criar-perfil", authMiddleware, async (req, res) => {
    try {
        const { username, nome_empresa } = req.body;
        
        const { data: perfil, error } = await supabase
            .from('perfis_usuarios')
            .insert({
                user_id: req.user.id,
                username: username.toLowerCase(),
                nome_empresa
            })
            .select()
            .single();
        
        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ 
                    success: false, 
                    msg: "Username já está em uso" 
                });
            }
            throw error;
        }
        
        res.json({ success: true, perfil });
        
    } catch (error) {
        console.error("Erro ao criar perfil:", error);
        res.status(500).json({ success: false, msg: "Erro interno" });
    }
});

app.post("/gerar-link-agendamento", authMiddleware, async (req, res) => {
    try {
        console.log('🔧 [DEBUG] Iniciando gerar-link-agendamento');
        console.log('🔧 [DEBUG] Usuário:', req.user?.email);
        console.log('🔧 [DEBUG] Body:', req.body);
        
        const { data, horario, nome, email, telefone } = req.body;
        
        // Buscar perfil do usuário
        const { data: perfis, error: perfilError } = await supabase
            .from('perfis_usuarios')
            .select('username')
            .eq('user_id', req.user.id);
        
        console.log('🔧 [DEBUG] Perfis encontrados:', perfis);

        if (perfilError) {
            console.log('❌ Erro ao buscar perfil:', perfilError);
            throw perfilError;
        }

        if (!perfis || perfis.length === 0) {
            console.log('🔧 [DEBUG] Nenhum perfil encontrado para o usuário');
            return res.status(400).json({ 
                success: false, 
                msg: "Configure seu perfil primeiro" 
            });
        }

        const perfil = perfis[0];
        console.log('🔧 [DEBUG] Usando perfil:', perfil);
        
        // 🔥 CORREÇÃO: Use crypto.randomBytes diretamente
        const token = crypto.randomBytes(32).toString('hex');
        
        console.log('🔧 [DEBUG] Token gerado:', token);
        console.log('🔧 [DEBUG] Inserindo link no banco...');
        
        const { data: link, error: linkError } = await supabase
            .from('links_agendamento')
            .insert({
                token: token,
                criador_id: req.user.id,
                username: perfil.username,
                nome_cliente: nome,
                email_cliente: email || null,
                telefone_cliente: telefone,
                data: data,
                horario: horario,
                expira_em: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
            })
            .select();

        console.log('🔧 [DEBUG] Link inserido:', link);
        console.log('🔧 [DEBUG] Erro no insert:', linkError);

        if (linkError) {
            console.log('❌ Erro ao inserir link:', linkError);
            throw linkError;
        }

        if (!link || link.length === 0) {
            throw new Error('Nenhum link foi retornado após inserção');
        }

        const linkPersonalizado = `https://oubook.vercel.app/agendar/${perfil.username}/${token}`;
        
        console.log('🔧 [DEBUG] Link gerado com sucesso:', linkPersonalizado);
        
        res.json({ 
            success: true,
            link: linkPersonalizado,
            expira_em: '24h'
        });
        
    } catch (error) {
        console.error('❌ [DEBUG] Erro completo no backend:', error);
        res.status(500).json({ 
            success: false, 
            msg: "Erro interno no servidor",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Rota pública para agendamento por link
app.get("/api/agendar-convidado/:token", async (req, res) => {
  try {
    const { token } = req.params;
    
    // Verificar token válido
    const { data: link, error } = await supabase
      .from('links_agendamento')
      .select('*')
      .eq('token', token)
      .gt('expira_em', new Date())
      .eq('utilizado', false)
      .single();
    
    if (error || !link) {
      return res.status(404).json({ 
        success: false, 
        msg: "Link inválido, expirado ou já utilizado" 
      });
    }
    
    res.json({
      success: true,
      dados_predefinidos: {
        nome: link.nome_cliente,
        email: link.email_cliente,
        telefone: link.telefone_cliente,
        data: link.data,
        horario: link.horario
      },
      token: token
    });
    
  } catch (error) {
    console.error("Erro no link de agendamento:", error);
    res.status(500).json({ success: false, msg: "Erro interno" });
  }
});
app.post("/api/confirmar-agendamento-link", async (req, res) => {
  try {
    const { token, nome, email, telefone } = req.body;
    
    // Validar token
    const { data: link, error: linkError } = await supabase
      .from('links_agendamento')
      .select('*')
      .eq('token', token)
      .gt('expira_em', new Date())
      .eq('utilizado', false)
      .single();
    
    if (linkError || !link) {
      return res.status(400).json({ 
        success: false, 
        msg: "Link inválido ou expirado" 
      });
    }
    
    // Criar agendamento
    const { data: agendamento, error: agendamentoError } = await supabase
      .from('agendamentos')
      .insert({
        cliente: link.criador_id.toString(), // 🔥 Converter UUID para text para compatibilidade
        nome: nome || link.nome_cliente,
        email: email || link.email_cliente,
        telefone: telefone || link.telefone_cliente,
        data: link.data,
        horario: link.horario,
        status: 'confirmado',
        criado_via_link: true
      })
      .select()
      .single();
    
    if (agendamentoError) throw agendamentoError;
    
    // Marcar link como utilizado
    await supabase
      .from('links_agendamento')
      .update({ utilizado: true })
      .eq('token', token);
    
    res.json({ 
      success: true, 
      msg: "Agendamento confirmado com sucesso!",
      agendamento 
    });
    
  } catch (error) {
    console.error("Erro ao confirmar agendamento:", error);
    res.status(500).json({ success: false, msg: "Erro interno" });
  }
});



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

    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: modelo,  // 🔥 AGORA VARIÁVEL
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
async function analisarDescricaoNatural(descricao, userEmail) {
  try {
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);

    // ✅ AGORA DOMINGOS SÃO PERMITIDOS (não há mais bloqueio)
    function calcularDataValida(data) {
      const dataObj = new Date(data);
      // ⚠️ REMOVIDO: A lógica que pulava domingos foi retirada
      // Agora domingos são tratados como dias normais da semana
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
    
    // Tenta extrair JSON da resposta
    const jsonMatch = resposta.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const dados = JSON.parse(jsonMatch[0]);
      
      // ✅ REMOVIDO: A validação que corrigia domingos
      // Agora domingos são aceitos normalmente
      
      console.log('✅ Agendamento processado (domingos permitidos):', dados.data);
      return dados;
    }
    
    throw new Error("Não foi possível extrair dados estruturados da descrição");
  } catch (error) {
    console.error("Erro ao analisar descrição natural:", error);
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
      .eq("cliente", userEmail)
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

// ==================== ROTA SUGERIR HORÁRIOS ====================

// Rota para sugerir horários livres
app.get("/api/sugerir-horarios", authMiddleware, async (req, res) => {
    try {
        const userEmail = req.user.email;

        // Busca todos os agendamentos
        const { data: agendamentos, error } = await supabase
            .from("agendamentos")
            .select("*")
            .eq("cliente", userEmail)
            .gte("data", new Date().toISOString().split('T')[0]) // Só futuros
            .order("data", { ascending: true })
            .order("horario", { ascending: true });

        if (error) throw error;

        // Análise inteligente com IA
        const sugestoes = await analisarHorariosLivres(agendamentos || [], userEmail);

        res.json({
            success: true,
            sugestoes: sugestoes,
            total_agendamentos: agendamentos?.length || 0
        });

    } catch (error) {
        console.error("Erro ao sugerir horários:", error);
        res.status(500).json({ 
            success: false, 
            msg: "Erro ao analisar horários livres",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Função para analisar horários livres
async function analisarHorariosLivres(agendamentos, userEmail) {
    try {
        const contexto = `
ANÁLISE DE AGENDA - SUGERIR HORÁRIOS LIVRES

Dados da agenda do usuário ${userEmail}:

AGENDAMENTOS EXISTENTES (próximos 7 dias):
${agendamentos.length > 0 ? 
    agendamentos.map(a => `- ${a.data} ${a.horario}: ${a.nome}`).join('\n') 
    : 'Nenhum agendamento futuro encontrado.'
}

DATA ATUAL: ${new Date().toISOString().split('T')[0]}

INSTRUÇÕES:
Analise a agenda acima e sugira os MELHORES horários livres para os próximos 7 dias.
Considere:
- Horários comerciais (9h-18h)
- Evitar início/fim de dia
- Espaçamento entre compromissos
- Balancear dias da semana

FORMATO DA RESPOSTA:
Forneça uma lista de 3-5 sugestões de horários no formato:
"📅 [DIA] às [HORÁRIO] - [CONTEXTO/SUGESTÃO]"

Exemplo:
"📅 Segunda-feira às 14:00 - Período da tarde, bom para reuniões
📅 Quarta-feira às 10:30 - Horário produtivo para trabalho focado"

Seja prático, útil e use emojis. Máximo de 150 palavras.
`;

        // No backend, na função analisarHorariosLivres:
return await chamarDeepSeekIA("Analise esta agenda e sugira os melhores horários livres:", contexto, "ECONOMICO");
    } catch (error) {
        console.error("Erro na análise de horários:", error);
        return "📅 **Sugestões de Horários:**\n\n- Segunda-feira: 14h-16h (tarde)\n- Quarta-feira: 10h-12h (manhã)\n- Sexta-feira: 15h-17h (final de semana próximo)\n\n💡 **Dica:** Estes são horários typically produtivos com boa disponibilidade.";
    }
}

// Rota de sugestões inteligentes
app.get("/api/sugestoes-inteligentes", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const cacheKey = `sugestoes_${userEmail}`;

    const resultado = await cacheManager.getOrSet(cacheKey, async () => {
      // Busca todos os agendamentos
      const { data: agendamentos, error } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("cliente", userEmail)
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
    const cacheKey = `estatisticas_${userEmail}`;

    const resultado = await cacheManager.getOrSet(cacheKey, async () => {
      // Busca todos os agendamentos
      const { data: agendamentos, error } = await supabase
        .from("agendamentos")
        .select("*")
       .eq("cliente", userEmail);

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

// Rota principal
app.get("/agendamentos", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const cacheKey = `agendamentos_${userEmail}`;
    
    const agendamentos = await cacheManager.getOrSet(cacheKey, async () => {
      console.log('🔄 Buscando agendamentos do DB para:', userEmail);
      const { data, error } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("cliente", userEmail) // 🔥 MUDANÇA: Busca por 'cliente'
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

// 🔥 AGENDAR COM CACHE E INVALIDAÇÃO
app.post("/agendar", authMiddleware, async (req, res) => {
  try {
    const { Nome, Email, Telefone, Data, Horario } = req.body;
   if (!Nome || !Telefone || !Data || !Horario)
      return res.status(400).json({ msg: "Todos os campos obrigatórios" });

    const userEmail = req.user.email;
    const cacheKey = `agendamentos_${userEmail}`;
    
    // ✅ PRIMEIRO VERIFICA CONFLITOS USANDO CACHE
    const agendamentosExistentes = await cacheManager.getOrSet(cacheKey, async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("cliente", userEmail)
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
        cliente: userEmail,           // 🔥 SEMPRE o email do usuário logado (PARA BUSCA)
        nome: Nome,
        email: Email || null,         // 🔥 Email do cliente (pode ser null)
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
        await ensureDynamicHeaders(sheet, Object.keys(novoAgendamento));
        await sheet.addRow(novoAgendamento);
        console.log(`✅ Agendamento salvo na planilha do usuário ${userEmail}`);
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

// Atualize também as outras rotas (confirmar, cancelar, reagendar):
app.post("/agendamentos/:email/confirmar/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user.email;
    const cacheKey = `agendamentos_${userEmail}`;
    
    // ✅ BUSCA POR CLIENTE
    const agendamentos = await cacheManager.getOrSet(cacheKey, async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("cliente", userEmail) // 🔥 MUDANÇA
        .order("data", { ascending: true })
        .order("horario", { ascending: true });

      if (error) throw error;
      return data || [];
    });

    // Verifica se o agendamento existe nos dados em cache
    const agendamentoExistente = agendamentos.find(a => a.id == id);
    if (!agendamentoExistente) {
      return res.status(404).json({ msg: "Agendamento não encontrado" });
    }

     // ... resto do código
    const { data, error } = await supabase.from("agendamentos")
      .update({ confirmado: true, status: "confirmado" })
      .eq("id", id)
      .eq("cliente", userEmail) // 🔥 MUDANÇA
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

    // 🔥 INVALIDA CACHE PARA FORÇAR ATUALIZAÇÃO
    cacheManager.delete(cacheKey);
    
    res.json({ msg: "Agendamento confirmado", agendamento: data });
  } catch (err) {
    console.error("Erro ao confirmar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});
// 🔥 CANCELAR COM CACHE E INVALIDAÇÃO
app.post("/agendamentos/:email/cancelar/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user.email;
    const cacheKey = `agendamentos_${userEmail}`;
    
    // ✅ PRIMEIRO BUSCA O AGENDAMENTO USANDO CACHE
    const agendamentos = await cacheManager.getOrSet(cacheKey, async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("cliente", userEmail)
        .order("data", { ascending: true })
        .order("horario", { ascending: true });

      if (error) throw error;
      return data || [];
    });

    // Verifica se o agendamento existe nos dados em cache
    const agendamentoExistente = agendamentos.find(a => a.id == id);
    if (!agendamentoExistente) {
      return res.status(404).json({ msg: "Agendamento não encontrado" });
    }

    // Atualiza no banco
    const { data, error } = await supabase.from("agendamentos")
      .update({ status: "cancelado", confirmado: false })
      .eq("id", id)
     .eq("cliente", userEmail)
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

    // 🔥 INVALIDA CACHE PARA FORÇAR ATUALIZAÇÃO
    cacheManager.delete(cacheKey);
    
    res.json({ msg: "Agendamento cancelado", agendamento: data });
  } catch (err) {
    console.error("Erro ao cancelar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// 🔥 REAGENDAR COM CACHE E INVALIDAÇÃO
app.post("/agendamentos/:email/reagendar/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { novaData, novoHorario } = req.body;
    const userEmail = req.user.email;
    const cacheKey = `agendamentos_${userEmail}`;
    
    if (!novaData || !novoHorario) return res.status(400).json({ msg: "Data e horário obrigatórios" });
    
    // ✅ PRIMEIRO BUSCA AGENDAMENTOS USANDO CACHE PARA VERIFICAR CONFLITOS
    const agendamentos = await cacheManager.getOrSet(cacheKey, async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("cliente", userEmail)
        .order("data", { ascending: true })
        .order("horario", { ascending: true });

      if (error) throw error;
      return data || [];
    });

    // Verifica se o agendamento a ser reagendado existe
    const agendamentoExistente = agendamentos.find(a => a.id == id);
    if (!agendamentoExistente) {
      return res.status(404).json({ msg: "Agendamento não encontrado" });
    }

    // Verifica conflito com novo horário (excluindo o próprio agendamento)
    const conflito = agendamentos.find(a => 
      a.id != id && a.data === novaData && a.horario === novoHorario
    );
    
    if (conflito) {
      return res.status(400).json({ 
        msg: "Você já possui um agendamento para esta nova data e horário" 
      });
    }

    // Se não há conflito, atualiza no banco
    const { data, error } = await supabase.from("agendamentos")
      .update({ 
        data: novaData, 
        horario: novoHorario,
        status: "pendente",
        confirmado: false
      })
      .eq("id", id)
      .eq("cliente", userEmail)
      .select()
      .single();
    
    if (error) throw error;

    try {
      const doc = await accessUserSpreadsheet(userEmail, req.user.user_metadata);
      if (doc) {
        await updateRowInSheet(doc.sheetsByIndex[0], id, data);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    // 🔥 INVALIDA CACHE PARA FORÇAR ATUALIZAÇÃO
    cacheManager.delete(cacheKey);
    
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
  console.log(`🚀 Backend otimizado rodando na porta ${PORT}`);
  console.log('✅ Cache em memória ativo');
  console.log('✅ Health checks otimizados');
  console.log('🤖 DeepSeek IA: ' + (DEEPSEEK_API_KEY ? 'CONFIGURADA' : 'NÃO CONFIGURADA'));
  console.log('📊 Use /health para status completo');
  console.log('🔥 Use /warmup para manter instância ativa');
});
























