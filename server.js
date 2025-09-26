import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { GoogleSpreadsheet } from "google-spreadsheet";

// ---------------- Config ----------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Verifica variáveis de ambiente críticas
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Variáveis de ambiente do Supabase não configuradas");
  process.exit(1);
}

if (!process.env.MP_ACCESS_TOKEN) {
  console.error("❌ Token de acesso do Mercado Pago não configurado");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Inicializa Mercado Pago apenas se o token existir
let mpClient, payment;
if (process.env.MP_ACCESS_TOKEN) {
  mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  payment = new Payment(mpClient);
} else {
  console.warn("⚠️ Mercado Pago não inicializado - MP_ACCESS_TOKEN não encontrado");
}

let creds;
try {
  if (process.env.GOOGLE_SERVICE_ACCOUNT) {
    creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  }
} catch (e) {
  console.error("❌ Erro ao parsear GOOGLE_SERVICE_ACCOUNT:", e);
}

// ---------------- Google Sheets ----------------
async function accessSpreadsheet(clienteId) {
  if (!creds) {
    throw new Error("Credenciais do Google Sheets não configuradas");
  }

  const { data, error } = await supabase
    .from("clientes")
    .select("spreadsheet_id")
    .eq("id", clienteId)
    .single();
    
  if (error || !data) throw new Error(`Cliente ${clienteId} não encontrado`);
  if (!data.spreadsheet_id) throw new Error(`Cliente ${clienteId} sem spreadsheet_id`);

  const doc = new GoogleSpreadsheet(data.spreadsheet_id);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  return doc;
}

async function ensureDynamicHeaders(sheet, newKeys) {
  try {
    await sheet.loadHeaderRow();
  } catch (error) {
    // Se não tem header, cria com as novas keys
    await sheet.setHeaderRow(newKeys);
    return;
  }
  
  const currentHeaders = sheet.headerValues || [];
  const headersToAdd = newKeys.filter((k) => !currentHeaders.includes(k));
  
  if (headersToAdd.length > 0) {
    await sheet.setHeaderRow([...currentHeaders, ...headersToAdd]);
  }
}

async function updateRowInSheet(sheet, rowId, updatedData) {
  await sheet.loadHeaderRow();
  const rows = await sheet.getRows();
  const row = rows.find(r => r.id === rowId);
  
  if (row) {
    Object.keys(updatedData).forEach(key => {
      if (sheet.headerValues.includes(key)) {
        row[key] = updatedData[key];
      }
    });
    await row.save();
  } else {
    await ensureDynamicHeaders(sheet, Object.keys(updatedData));
    await sheet.addRow({ id: rowId, ...updatedData });
  }
}

// ---------------- ROTA PARA CLIENTE BUSCAR CONFIGURAÇÕES ----------------
app.get("/config/:cliente", async (req, res) => {
    try {
        const { cliente } = req.params;
        
        console.log(`🔧 Buscando configurações para cliente: ${cliente}`);
        
        // Buscar configurações gerais
        const configHorarios = await getConfigHorarios(cliente);
        
        // Buscar configurações específicas de datas (próximos 30 dias)
        const trintaDiasFrente = new Date();
        trintaDiasFrente.setDate(trintaDiasFrente.getDate() + 30);
        
        const { data: configDatas, error } = await supabase
            .from("config_datas_especificas")
            .select("*")
            .eq("cliente_id", cliente)
            .gte("data", new Date().toISOString().split('T')[0])
            .lte("data", trintaDiasFrente.toISOString().split('T')[0])
            .order("data", { ascending: true });

        res.json({
            config_geral: configHorarios,
            config_datas_especificas: configDatas || []
        });
        
    } catch (err) {
        console.error("Erro ao buscar configurações para cliente:", err);
        res.status(500).json({ error: "Erro interno ao carregar configurações" });
    }
});

// ---------------- VERIFICAR SE HORÁRIO ESTÁ DISPONÍVEL ----------------
async function horarioDisponivel(clienteId, data, horario, ignoreId = null) {
    try {
        let query = supabase
            .from("agendamentos")
            .select("id")
            .eq("cliente", clienteId)
            .eq("data", data)
            .eq("horario", horario)
            .neq("status", "cancelado");

        if (ignoreId) {
            query = query.neq("id", ignoreId);
        }

        const { data: agendamentos, error } = await query;

        if (error) {
            console.error("Erro ao verificar horário:", error);
            return false;
        }

        return agendamentos.length === 0;
    } catch (error) {
        console.error("Erro na verificação de horário:", error);
        return false;
    }
}


// ---------------- ROTA DEBUG TOKEN ----------------
app.post("/debug-token", async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({ 
                error: "Token não fornecido",
                action: "provide_token" 
            });
        }

        console.log('🔍 Debug token recebido:', token.substring(0, 20) + '...');

        // 🔧 Usa a mesma lógica do seu middleware de auth
        const { data, error } = await supabase.auth.getUser(token);
        
        if (error) {
            console.log('❌ Token inválido:', error.message);
            
            // Tenta decodificar o token mesmo expirado (apenas para debug)
            try {
                const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
                
                return res.json({
                    valid: false,
                    error: error.message,
                    decoded: {
                        email: payload.email,
                        user_id: payload.sub,
                        cliente_id: payload.user_metadata?.cliente_id,
                        isAdmin: payload.user_metadata?.isAdmin || payload.user_metadata?.role === 'admin',
                        exp: payload.exp,
                        expiracao: new Date(payload.exp * 1000).toLocaleString('pt-BR'),
                        expirado: Date.now() >= payload.exp * 1000
                    },
                    message: "Token inválido ou expirado",
                    action: "refresh_login"
                });
            } catch (parseError) {
                return res.status(401).json({
                    valid: false,
                    error: "Token malformado",
                    message: "Não foi possível decodificar o token"
                });
            }
        }

        // Token válido
        const user = data.user;
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        
        res.json({
            valid: true,
            user: {
                id: user.id,
                email: user.email,
                cliente_id: user.user_metadata?.cliente_id,
                isAdmin: user.user_metadata?.isAdmin || user.user_metadata?.role === 'admin',
                email_verified: user.email_confirmed_at !== null
            },
            token_info: {
                exp: payload.exp,
                expiracao: new Date(payload.exp * 1000).toLocaleString('pt-BR'),
                expirado: Date.now() >= payload.exp * 1000,
                issued_at: new Date(payload.iat * 1000).toLocaleString('pt-BR')
            },
            message: "Token válido"
        });

    } catch (error) {
        console.error("❌ Erro no debug-token:", error);
        res.status(500).json({ 
            error: "Erro interno no servidor",
            details: error.message 
        });
    }
});

// ---------------- Middleware Auth ATUALIZADO ----------------
// ---------------- Middleware Auth SEGURO ----------------
async function authMiddleware(req, res, next) {
    const token = req.headers["authorization"]?.split("Bearer ")[1];
    
    if (!token) {
        return res.status(401).json({ msg: "Token não enviado" });
    }

    try {
        const { data, error } = await supabase.auth.getUser(token);
        
        if (error) {
            console.log('❌ Token inválido/Expirado:', error.message);
            return res.status(401).json({ 
                msg: "Token inválido", 
                error: error.message,
                action: "refresh_login" 
            });
        }

        // Token válido - procedimento normal
        req.user = data.user;
        req.clienteId = data.user.user_metadata?.cliente_id;
        req.isAdmin = data.user.user_metadata?.isAdmin || data.user.user_metadata?.role === "admin";

        console.log('✅ Token válido - User:', data.user.email);
        next();
        
    } catch (error) {
        console.error("❌ Erro no middleware de auth:", error);
        res.status(500).json({ msg: "Erro interno no servidor" });
    }
}


// ==== FUNÇÃO PARA LIMPAR AGENDAMENTOS EXPIRADOS ====
async function limparAgendamentosExpirados() {
  try {
    const quinzeMinutosAtras = new Date(Date.now() - 15 * 60 * 1000);
    
    console.log("🔄 Verificando agendamentos expirados...");
    
    const { data: agendamentosExpirados, error } = await supabase
      .from("agendamentos")
      .select("id, cliente, email, data, horario, created_at")
      .eq("status", "pendente")
      .lt("created_at", quinzeMinutosAtras.toISOString());

    if (error) {
      console.error("Erro ao buscar agendamentos expirados:", error);
      return;
    }

    if (agendamentosExpirados && agendamentosExpirados.length > 0) {
      console.log(`📋 Encontrados ${agendamentosExpirados.length} agendamentos expirados`);
      
      for (const agendamento of agendamentosExpirados) {
        // Cancela agendamento não pago
        const { error: updateError } = await supabase
          .from("agendamentos")
          .update({ status: "cancelado", confirmado: false })
          .eq("id", agendamento.id);
        
        if (updateError) {
          console.error(`❌ Erro ao cancelar agendamento ${agendamento.id}:`, updateError);
        } else {
          console.log(`✅ Agendamento ${agendamento.id} cancelado por falta de pagamento`);
          
          // Atualiza Google Sheet
          try {
            const doc = await accessSpreadsheet(agendamento.cliente);
            await updateRowInSheet(doc.sheetsByIndex[0], agendamento.id, {
              status: "cancelado",
              confirmado: false
            });
          } catch (sheetError) {
            console.error("Erro ao atualizar Google Sheets:", sheetError);
          }
        }
      }
    } else {
      console.log("✅ Nenhum agendamento expirado encontrado");
    }
  } catch (err) {
    console.error("Erro na limpeza de agendamentos expirados:", err);
  }
}

// ---------------- CONFIGURAÇÃO DE DIAS DA SEMANA ----------------
const DIAS_SEMANA = [
  { id: 0, nome: "Domingo", abreviacao: "Dom" },
  { id: 1, nome: "Segunda-feira", abreviacao: "Seg" },
  { id: 2, nome: "Terça-feira", abreviacao: "Ter" },
  { id: 3, nome: "Quarta-feira", abreviacao: "Qua" },
  { id: 4, nome: "Quinta-feira", abreviacao: "Qui" },
  { id: 5, nome: "Sexta-feira", abreviacao: "Sex" },
  { id: 6, nome: "Sábado", abreviacao: "Sáb" }
];

// ---------------- FUNÇÕES PARA CONFIGURAÇÃO ----------------

// ---------------- Obter configurações de horários CORRIGIDA ----------------
async function getConfigHorarios(clienteId) {
  try {
    const { data, error } = await supabase
      .from("config_horarios")
      .select("*")
      .eq("cliente_id", clienteId)
      .single();

    if (error || !data) {
      console.log('ℹ️ Configuração não encontrada, usando padrão');
      return {
        dias_semana: [1, 2, 3, 4, 5],
        horarios_disponiveis: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"],
        intervalo_minutos: 60,
        max_agendamentos_dia: 10,
        datas_bloqueadas: [],
        dias_semana_info: DIAS_SEMANA.filter(dia => [1, 2, 3, 4, 5].includes(dia.id))
      };
    }

    // 🔧 CORREÇÃO CRÍTICA: Converter strings para números
    let dias_semana = data.dias_semana;
    if (Array.isArray(dias_semana) && dias_semana.length > 0 && typeof dias_semana[0] === 'string') {
      dias_semana = dias_semana.map(dia => parseInt(dia));
      console.log('🔧 Dias da semana convertidos:', dias_semana);
    }

    // 🔧 CORREÇÃO: Formatar horários (remover segundos se existirem)
    let horarios_disponiveis = data.horarios_disponiveis || [];
    if (Array.isArray(horarios_disponiveis) && horarios_disponiveis.length > 0) {
      horarios_disponiveis = horarios_disponiveis.map(horario => {
        if (horario.includes(':')) {
          // Se tem segundos (09:00:00), remove os segundos
          const parts = horario.split(':');
          return parts.slice(0, 2).join(':');
        }
        return horario;
      });
    }

    // 🔧 CORREÇÃO: Garantir que datas_bloqueadas seja um array válido
    let datas_bloqueadas = data.datas_bloqueadas || [];
    if (!Array.isArray(datas_bloqueadas)) {
      datas_bloqueadas = [];
    }

    console.log('📦 Configuração FINAL carregada:', {
      dias_semana: dias_semana,
      horarios_disponiveis: horarios_disponiveis,
      datas_bloqueadas: datas_bloqueadas,
      quantidade_datas_bloqueadas: datas_bloqueadas.length
    });

    const config = {
      dias_semana: dias_semana,
      horarios_disponiveis: horarios_disponiveis,
      intervalo_minutos: data.intervalo_minutos || 60,
      max_agendamentos_dia: data.max_agendamentos_dia || 10,
      datas_bloqueadas: datas_bloqueadas,
      dias_semana_info: DIAS_SEMANA.filter(dia => dias_semana.includes(dia.id))
    };

    return config;

  } catch (error) {
    console.error("Erro ao obter configurações de horários:", error);
    return {
      dias_semana: [1, 2, 3, 4, 5],
      horarios_disponiveis: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"],
      intervalo_minutos: 60,
      max_agendamentos_dia: 10,
      datas_bloqueadas: [],
      dias_semana_info: DIAS_SEMANA.filter(dia => [1, 2, 3, 4, 5].includes(dia.id))
    };
  }
}
// Obter configurações específicas por data
async function getConfigDataEspecifica(clienteId, data) {
  try {
    const { data: configData, error } = await supabase
      .from("config_datas_especificas")
      .select("*")
      .eq("cliente_id", clienteId)
      .eq("data", data)
      .single();

    if (error) return null;
    return configData;
  } catch (error) {
    console.error("Erro ao obter configuração específica:", error);
    return null;
  }
}

// ---------------- VERIFICAR DISPONIBILIDADE CORRIGIDA ----------------
async function verificarDisponibilidade(clienteId, data, horario, ignoreId = null) {
  try {
    const config = await getConfigHorarios(clienteId);
    const configData = await getConfigDataEspecifica(clienteId, data);
    
    console.log(`🔍 Verificando disponibilidade: ${data} ${horario} para ${clienteId}`);
    console.log('📋 Config geral:', config.dias_semana, config.horarios_disponiveis, config.datas_bloqueadas);
    console.log('📅 Config específica:', configData);

    // 1. Verificar se a data está bloqueada na configuração específica
    if (configData?.bloqueada) {
      console.log('❌ Data bloqueada na configuração específica');
      return false;
    }

    // 2. Verificar se a data está na lista de datas bloqueadas gerais
    if (config.datas_bloqueadas && config.datas_bloqueadas.includes(data)) {
      console.log('❌ Data bloqueada na configuração geral');
      return false;
    }

    // 3. Verificar dia da semana
    const dataObj = new Date(data + 'T00:00:00');
    const diaSemana = dataObj.getDay();
    if (!config.dias_semana.includes(diaSemana)) {
      console.log(`❌ Dia da semana não permitido: ${diaSemana}`);
      return false;
    }

    // 4. Verificar horários disponíveis
    let horariosPermitidos = config.horarios_disponiveis || [];
    
    // Aplicar configurações específicas da data
    if (configData) {
      if (configData.horarios_disponiveis) {
        horariosPermitidos = configData.horarios_disponiveis;
      }
      if (configData.horarios_bloqueados && configData.horarios_bloqueados.includes(horario)) {
        console.log('❌ Horário bloqueado na configuração específica');
        return false;
      }
    }

    if (!horariosPermitidos.includes(horario)) {
      console.log(`❌ Horário não permitido: ${horario}`);
      return false;
    }

    // 5. Verificar limite de agendamentos do dia
    const maxAgendamentos = configData?.max_agendamentos || config.max_agendamentos_dia;
    const { data: agendamentosDia, error } = await supabase
      .from("agendamentos")
      .select("id")
      .eq("cliente", clienteId)
      .eq("data", data)
      .neq("status", "cancelado");

    if (error) {
      console.error('Erro ao buscar agendamentos:', error);
      return false;
    }

    if (agendamentosDia && agendamentosDia.length >= maxAgendamentos) {
      console.log(`❌ Limite de agendamentos atingido: ${agendamentosDia.length}/${maxAgendamentos}`);
      return false;
    }

    // 6. Verificar se horário já está ocupado
    const disponivel = await horarioDisponivel(clienteId, data, horario, ignoreId);
    console.log(disponivel ? '✅ Horário disponível' : '❌ Horário ocupado');
    
    return disponivel;
  } catch (error) {
    console.error("❌ Erro na verificação de disponibilidade:", error);
    return false;
  }
}

// ---------------- ROTAS PARA CONFIGURAÇÃO (APENAS ADMIN) ----------------

// Obter configurações
app.get("/admin/config/:cliente", authMiddleware, async (req, res) => {
  try {
    const { cliente } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const config = await getConfigHorarios(cliente);
    res.json(config);
  } catch (err) {
    console.error("Erro ao obter configurações:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// Obter lista de dias da semana
app.get("/api/dias-semana", (req, res) => {
  res.json(DIAS_SEMANA);
});

// Atualizar configurações
app.put("/admin/config/:cliente", authMiddleware, async (req, res) => {
  try {
    const { cliente } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { dias_semana, horarios_disponiveis, intervalo_minutos, max_agendamentos_dia, datas_bloqueadas } = req.body;

    const { data, error } = await supabase
      .from("config_horarios")
      .upsert({
        cliente_id: cliente,
        dias_semana: dias_semana || [1, 2, 3, 4, 5],
        horarios_disponiveis: horarios_disponiveis || ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"],
        intervalo_minutos: intervalo_minutos || 60,
        max_agendamentos_dia: max_agendamentos_dia || 10,
        datas_bloqueadas: datas_bloqueadas || [],
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    
    // Adiciona informações dos dias da semana na resposta
    data.dias_semana_info = DIAS_SEMANA.filter(dia => data.dias_semana.includes(dia.id));
    
    res.json({ msg: "Configurações atualizadas com sucesso", config: data });
  } catch (err) {
    console.error("Erro ao atualizar configurações:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// Configurações específicas por data
app.get("/admin/config/:cliente/datas", authMiddleware, async (req, res) => {
  try {
    const { cliente } = req.params;
    const { startDate, endDate } = req.query;
    
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    let query = supabase
      .from("config_datas_especificas")
      .select("*")
      .eq("cliente_id", cliente);

    if (startDate && endDate) {
      query = query.gte("data", startDate).lte("data", endDate);
    }

    const { data, error } = await query.order("data", { ascending: true });

    if (error) throw error;
    res.json({ configs: data || [] });
  } catch (err) {
    console.error("Erro ao obter configurações de datas:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// Adicionar/atualizar configuração específica de data
app.post("/admin/config/:cliente/datas", authMiddleware, async (req, res) => {
  try {
    const { cliente } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { data: dataConfig, horarios_disponiveis, horarios_bloqueados, max_agendamentos, bloqueada } = req.body;

    const { data, error } = await supabase
      .from("config_datas_especificas")
      .upsert({
        cliente_id: cliente,
        data: dataConfig,
        horarios_disponiveis: horarios_disponiveis || null,
        horarios_bloqueados: horarios_bloqueados || [],
        max_agendamentos: max_agendamentos || null,
        bloqueada: bloqueada || false,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ msg: "Configuração de data atualizada com sucesso", config: data });
  } catch (err) {
    console.error("Erro ao atualizar configuração de data:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});


// ---------------- FUNÇÃO getHorariosDisponiveis (ADICIONE ISSO) ----------------
async function getHorariosDisponiveis(clienteId, data) {
  try {
    const config = await getConfigHorarios(clienteId);
    const configData = await getConfigDataEspecifica(clienteId, data);
    
    // Verificar se a data está bloqueada
    if (configData?.bloqueada || (config.datas_bloqueadas && config.datas_bloqueadas.includes(data))) {
      return [];
    }

    let horariosPermitidos = config.horarios_disponiveis || [];
    
    // Aplicar configurações específicas da data
    if (configData) {
      if (configData.horarios_disponiveis) {
        horariosPermitidos = configData.horarios_disponiveis;
      }
      // Remover horários bloqueados
      if (configData.horarios_bloqueados) {
        horariosPermitidos = horariosPermitidos.filter(horario => 
          !configData.horarios_bloqueados.includes(horario)
        );
      }
    }

    // Verificar quais horários estão disponíveis
    const horariosDisponiveis = [];
    
    for (const horario of horariosPermitidos) {
      const disponivel = await horarioDisponivel(clienteId, data, horario);
      if (disponivel) {
        horariosDisponiveis.push(horario);
      }
    }

    return horariosDisponiveis;
  } catch (error) {
    console.error("Erro ao obter horários disponíveis:", error);
    return [];
  }
}
// ---------------- ROTAS PÚBLICAS PARA CLIENTES ----------------

// Obter horários disponíveis para uma data (para cliente1.html)
app.get("/api/horarios-disponiveis/:cliente", async (req, res) => {
  try {
    const { cliente } = req.params;
    const { data } = req.query;

    if (!data) {
      return res.status(400).json({ msg: "Data é obrigatória" });
    }

    const horarios = await getHorariosDisponiveis(cliente, data);
    res.json({ horarios_disponiveis: horarios });
  } catch (err) {
    console.error("Erro ao obter horários disponíveis:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// Obter dias da semana disponíveis para um cliente
app.get("/api/dias-disponiveis/:cliente", async (req, res) => {
  try {
    const { cliente } = req.params;
    const config = await getConfigHorarios(cliente);
    
    res.json({ 
      dias_semana: config.dias_semana,
      dias_semana_info: config.dias_semana_info 
    });
  } catch (err) {
    console.error("Erro ao obter dias disponíveis:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// Serve o painel de admin (index.html)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


// Serve páginas de cliente dinamicamente
app.get("/cliente/:cliente", (req, res) => {
  const cliente = req.params.cliente;
  const filePath = path.join(__dirname, "public", `${cliente}.html`);

  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).send("Página do cliente não encontrada");
    }
  });
});


// ---------------- ROTAS EXISTENTES (MANTIDAS) ----------------

app.get("/agendamentos/:cliente?", authMiddleware, async (req, res) => {
  try {
    let cliente = req.params.cliente;

    console.log('🔍 Parâmetro cliente:', cliente);
    console.log('👤 Usuário:', req.user);
    console.log('📊 Metadata:', req.user.user_metadata);

    // Se for admin, cliente pode ser passado ou não
    if (req.user.user_metadata?.isAdmin) {
      console.log('✅ Usuário é admin');
      
      // Admin: se não passar cliente, retorna TODOS os agendamentos
      if (!cliente || cliente === 'undefined') {
        console.log('📦 Buscando TODOS os agendamentos para admin');
        
        const { data, error } = await supabase
          .from("agendamentos")
          .select("*")
          .neq("status", "cancelado")
          .order("data", { ascending: true })
          .order("horario", { ascending: true });

        if (error) {
          console.error('❌ Erro Supabase:', error);
          throw error;
        }
        
        console.log(`✅ Admin: encontrados ${data?.length || 0} agendamentos`);
        return res.json({ agendamentos: data || [] });
      } else {
        console.log(`📦 Buscando agendamentos do cliente específico: ${cliente}`);
      }
    } else {
      // Cliente normal: força a ver apenas o próprio cliente
      console.log('👤 Usuário é cliente normal');
      if (!cliente) {
        cliente = req.user.user_metadata?.cliente_id;
        console.log(`🔧 Cliente definido do metadata: ${cliente}`);
      }
      
      if (req.user.user_metadata?.cliente_id !== cliente) {
        console.log('❌ Acesso negado: cliente não corresponde');
        return res.status(403).json({ msg: "Acesso negado" });
      }
    }

    console.log(`🔍 Buscando agendamentos para cliente: ${cliente}`);
    
    const { data, error } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente)
      .neq("status", "cancelado")
      .order("data", { ascending: true })
      .order("horario", { ascending: true });

    if (error) {
      console.error('❌ Erro Supabase:', error);
      throw error;
    }
    
    console.log(`✅ Encontrados ${data?.length || 0} agendamentos para ${cliente}`);
    res.json({ agendamentos: data || [] });

  } catch (err) {
    console.error("❌ Erro ao listar agendamentos:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});



// ==== ROTA /create-pix COM VALIDAÇÃO ====
app.post("/create-pix", async (req, res) => {
  const { amount, description, email, nome, telefone, data, horario, cliente } = req.body;

  // 🔎 Valida dados obrigatórios
  if (!amount || !email || !nome || !telefone || !data || !horario || !cliente) {
    return res.status(400).json({ error: "Faltando dados" });
  }

  try {
    // ✅ VALIDAÇÃO CRÍTICA: Verificar se horário está disponível
    const disponivel = await verificarDisponibilidade(cliente, data, horario);
    if (!disponivel) {
      return res.status(400).json({ error: "Horário indisponível para agendamento" });
    }

    // ⏰ Calcula data de expiração (15 minutos)
    const dateOfExpiration = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // 1️⃣ Cria o pagamento PIX no Mercado Pago
    const result = await payment.create({
      body: {
        transaction_amount: Number(amount),
        description: description || "Pagamento de Agendamento",
        payment_method_id: "pix",
        payer: { email },
        date_of_expiration: dateOfExpiration
      },
    });

    console.log("💰 Pagamento criado no Mercado Pago:", result.id, result.status, "Expira:", dateOfExpiration);

    // 2️⃣ Salva em pagamentos
    const { error: insertPaymentError } = await supabase
      .from("pagamentos")
      .insert([{ 
        id: result.id, 
        email: email.toLowerCase().trim(), 
        amount: Number(amount), 
        status: result.status || 'pending', 
        valid_until: null,
        description: description || "Pagamento de Agendamento"
      }]);

    if (insertPaymentError) {
      console.error("Erro ao inserir pagamento no Supabase:", insertPaymentError);
      return res.status(500).json({ error: "Erro ao salvar pagamento" });
    }

    // 3️⃣ Salva em agendamentos (pendente até aprovação do PIX)
    const { error: insertAgendamentoError } = await supabase
      .from("agendamentos")
      .insert([{ 
        cliente,
        nome,
        email: email.toLowerCase().trim(),
        telefone,
        data,
        horario,
        status: "pendente",
        confirmado: false,
        payment_id: result.id
      }]);

    if (insertAgendamentoError) {
      console.error("Erro ao criar agendamento no Supabase:", insertAgendamentoError);
      
      // 🔄 Rollback: Remove o pagamento se o agendamento falhar
      await supabase.from("pagamentos").delete().eq("id", result.id);
      
      return res.status(500).json({ error: "Erro ao salvar agendamento" });
    }

    console.log("💾 Pagamento e agendamento salvos no Supabase:", result.id);

    // 4️⃣ Retorna dados pro frontend
    res.json({
      payment_id: result.id,
      status: result.status,
      qr_code: result.point_of_interaction.transaction_data.qr_code,
      qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64,
      expires_at: dateOfExpiration
    });
  } catch (err) {
    console.error("Erro ao criar PIX:", err);
    res.status(500).json({ error: err.message });
  }
});

// Verifica status do pagamento
app.get("/check-payment/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    // Primeiro verifica no banco de dados
    const { data: paymentData, error: dbError } = await supabase
      .from("pagamentos")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();  // Usa maybeSingle para evitar erro quando não encontra

    if (dbError && dbError.code !== 'PGRST116') {
      console.error("Erro ao buscar pagamento no banco:", dbError);
      return res.status(500).json({ error: "Erro ao verificar pagamento" });
    }

    // Se não encontrou no banco, verifica no Mercado Pago
    if (!paymentData) {
      console.log("Pagamento não encontrado no banco, verificando no Mercado Pago...");
      try {
        const paymentDetails = await payment.get({ id: paymentId });
        return res.json({ status: paymentDetails.status, payment: paymentDetails });
      } catch (mpError) {
        console.error("Erro ao verificar pagamento no Mercado Pago:", mpError);
        return res.status(404).json({ error: "Pagamento não encontrado" });
      }
    }

    // Se já está aprovado no banco, retorna
    if (paymentData.status === "approved") {
      return res.json({ status: "approved", payment: paymentData });
    }

    // Se não está aprovado, verifica no Mercado Pago
    try {
      const paymentDetails = await payment.get({ id: paymentId });
      
      // Atualiza status no banco se mudou
      if (paymentDetails.status !== paymentData.status) {
        let valid_until = paymentData.valid_until;
        
        if (["approved", "paid"].includes(paymentDetails.status.toLowerCase())) {
          const vipExpires = new Date();
          vipExpires.setDate(vipExpires.getDate() + 30);
          valid_until = vipExpires.toISOString();
        }

        await supabase
          .from("pagamentos")
          .update({ 
            status: paymentDetails.status, 
            valid_until,
            updated_at: new Date().toISOString()
          })
          .eq("id", paymentId);
      }

      res.json({ status: paymentDetails.status, payment: paymentDetails });

    } catch (mpError) {
      console.error("Erro ao verificar pagamento no Mercado Pago:", mpError);
      // Se não conseguir verificar no MP, retorna o status do banco
      res.json({ status: paymentData.status, payment: paymentData });
    }

  } catch (err) {
    console.error("Erro em /check-payment:", err);
    res.status(500).json({ error: "Erro interno ao verificar pagamento" });
  }
});

// Checa VIP pelo email (aprovado e dentro do prazo)
app.get("/check-vip/:email", async (req, res) => {
  const email = req.params.email;
  if (!email) return res.status(400).json({ error: "Faltando email" });

  const now = new Date();
  const { data, error } = await supabase
    .from("pagamentos")
    .select("valid_until")
    .eq("email", email)
    .eq("status", "approved")
    .gt("valid_until", now.toISOString())
    .order("valid_until", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    return res.status(500).json({ error: error.message });
  }

  res.json({
    vip: !!data,
    valid_until: data?.valid_until || null
  });
});

// Webhook Mercado Pago
app.post("/webhook", async (req, res) => {
  try {
    const paymentId = req.body?.data?.id || req.query["data.id"];
    if (!paymentId) return res.sendStatus(400);

    const paymentDetails = await payment.get({ id: paymentId });

    // Atualiza status no Supabase
    const status = paymentDetails.status;
    let valid_until = null;

    if (["approved", "paid"].includes(status.toLowerCase())) {
      const vipExpires = new Date();
      vipExpires.setDate(vipExpires.getDate() + 30); // 30 dias
      valid_until = vipExpires.toISOString();
    }

    const { error: updateError } = await supabase
      .from("pagamentos")
      .update({ status, valid_until })
      .eq("id", paymentId);

    if (updateError) {
      console.error("Erro ao atualizar Supabase:", updateError.message);
    } else {
      console.log(`✅ Pagamento ${paymentId} atualizado: status=${status}, valid_until=${valid_until}`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro no webhook:", err.message);
    res.sendStatus(500);
  }
});

// ---------------- Agendar ----------------
app.post("/agendar/:cliente", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { Nome, Email, Telefone, Data, Horario } = req.body;
    if (!Nome || !Email || !Telefone || !Data || !Horario)
      return res.status(400).json({ msg: "Todos os campos obrigatórios" });

    const emailNormalizado = Email.toLowerCase().trim();
    const dataNormalizada = new Date(Data).toISOString().split("T")[0];

    // Verifica se o horário está disponível
    const disponivel = await horarioDisponivel(cliente, dataNormalizada, Horario);
    if (!disponivel) {
      return res.status(400).json({ msg: "Horário indisponível para agendamento" });
    }

    // Inserção do agendamento
    const { data: novoAgendamento, error } = await supabase
      .from("agendamentos")
      .insert([{
        cliente,
        nome: Nome,
        email: emailNormalizado,
        telefone: Telefone,
        data: dataNormalizada,
        horario: Horario,
        status: "pendente",
        confirmado: false,
      }])
      .select()
      .single();

    if (error) {
      console.error("Erro ao inserir agendamento:", error);
      return res.status(500).json({ msg: "Erro ao criar agendamento" });
    }

    // Atualiza Google Sheet
    try {
      const doc = await accessSpreadsheet(cliente);
      const sheet = doc.sheetsByIndex[0];
      await ensureDynamicHeaders(sheet, Object.keys(novoAgendamento));
      await sheet.addRow(novoAgendamento);
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
      // Não falha a requisição por erro no sheet
    }

    res.json({ msg: "Agendamento realizado com sucesso!", agendamento: novoAgendamento });

  } catch (err) {
    console.error("Erro no /agendar:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- Confirmar / Cancelar / Reagendar ----------------
app.post("/agendamentos/:cliente/confirmar/:id", authMiddleware, async (req,res)=>{
  try {
    const { cliente, id } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({msg:"Acesso negado"});
    
    const { data, error } = await supabase.from("agendamentos")
      .update({confirmado:true,status:"confirmado"})
      .eq("id",id).eq("cliente",cliente).select().single();
    
    if (error) throw error;
    
    // Atualiza Google Sheet
    try {
      if (creds) {
        const doc = await accessSpreadsheet(cliente);
        await updateRowInSheet(doc.sheetsByIndex[0], id, data);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }
    
    res.json({msg:"Agendamento confirmado", agendamento:data});
  } catch (error) {
    console.error("Erro ao confirmar agendamento:", error);
    res.status(500).json({msg:"Erro interno"});
  }
});

app.post("/agendamentos/:cliente/cancelar/:id", authMiddleware, async (req,res)=>{
  try {
    const { cliente, id } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({msg:"Acesso negado"});
    
    const { data, error } = await supabase.from("agendamentos")
      .update({status:"cancelado", confirmado:false})
      .eq("id",id).eq("cliente",cliente).select().single();
    
    if (error) throw error;
    
    // Atualiza Google Sheet
    try {
      if (creds) {
        const doc = await accessSpreadsheet(cliente);
        await updateRowInSheet(doc.sheetsByIndex[0], id, data);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }
    
    res.json({msg:"Agendamento cancelado", agendamento:data});
  } catch (error) {
    console.error("Erro ao cancelar agendamento:", error);
    res.status(500).json({msg:"Erro interno"});
  }
});

app.post("/agendamentos/:cliente/reagendar/:id", authMiddleware, async (req,res)=>{
  try {
    const { cliente, id } = req.params;
    const { novaData, novoHorario } = req.body;
    if (!novaData || !novoHorario) return res.status(400).json({msg:"Data e horário obrigatórios"});
    if (req.clienteId !== cliente) return res.status(403).json({msg:"Acesso negado"});
    
    const disponivel = await verificarDisponibilidade(cliente, novaData, novoHorario, id);
    if(!disponivel) return res.status(400).json({msg:"Horário indisponível"});
    
    const { data, error } = await supabase.from("agendamentos")
      .update({
        data: novaData, 
        horario: novoHorario,
        status: "pendente",
        confirmado: false
      })
      .eq("id", id)
      .eq("cliente", cliente)
      .select()
      .single();
    
    if (error) throw error;
    
    // Atualiza Google Sheet
    try {
      if (creds) {
        const doc = await accessSpreadsheet(cliente);
        await updateRowInSheet(doc.sheetsByIndex[0], id, data);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }
    
    res.json({msg:"Agendamento reagendado com sucesso", agendamento:data});
  } catch (error) {
    console.error("Erro ao reagendar:", error);
    res.status(500).json({msg:"Erro interno"});
  }
});





// ==== INICIALIZAR LIMPEZA AUTOMÁTICA ====
// Executar a cada 5 minutos (300000 ms)
setInterval(limparAgendamentosExpirados, 5 * 60 * 1000);

// Executar imediatamente ao iniciar o servidor
setTimeout(limparAgendamentosExpirados, 2000);

// ---------------- Health Check ----------------
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    port: PORT 
  });
});

// ---------------- Servidor ----------------
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log("⏰ Sistema de limpeza de agendamentos expirados ativo");
  console.log("🔧 Sistema de configuração de horários ativo");
  console.log("📅 Dias da semana configurados:", DIAS_SEMANA.map(d => d.abreviacao).join(", "));
  
  // Verifica configurações
  if (!process.env.MP_ACCESS_TOKEN) {
    console.warn("⚠️ Mercado Pago não está configurado");
  }
  if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
    console.warn("⚠️ Google Sheets não está configurado");
  }
});












