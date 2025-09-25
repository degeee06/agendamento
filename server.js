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


// ---------------- Middleware ----------------

// Middleware para rotas de cliente (autenticação normal)
async function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ msg: "Token não enviado" });

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ msg: "Token inválido" });

    req.user = data.user;
    req.clienteId = data.user.user_metadata?.cliente_id;

    if (!req.clienteId) {
      return res.status(403).json({ msg: "Usuário sem cliente_id" });
    }

    next();
  } catch (error) {
    console.error("Erro no middleware de auth:", error);
    res.status(500).json({ msg: "Erro interno no servidor" });
  }
}

// Middleware para rotas admin
async function adminAuthMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ msg: "Token não enviado" });

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ msg: "Token inválido" });

    req.user = data.user;
    // Verifica role admin definida no Supabase
    req.isAdmin = data.user.user_metadata?.role === "admin";
    if (!req.isAdmin) return res.status(403).json({ msg: "Acesso negado" });

    next();
  } catch (err) {
    console.error("Erro no admin auth:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
}


async function horarioDisponivel(cliente, data, horario, ignoreId = null) {
  try {
    let query = supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente)
      .eq("data", data)
      .eq("horario", horario)
      .neq("status", "cancelado");

    if (ignoreId) query = query.neq("id", ignoreId);
    
    const { data: agendamentos, error } = await query;
    
    if (error) {
      console.error("Erro ao verificar horário disponível:", error);
      return false;
    }
    
    return agendamentos.length === 0;
  } catch (error) {
    console.error("Erro na função horarioDisponivel:", error);
    return false;
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

// Obter configurações de horários
async function getConfigHorarios(clienteId) {
  try {
    const { data, error } = await supabase
      .from("config_horarios")
      .select("*")
      .eq("cliente_id", clienteId)
      .single();

    if (error || !data) {
      // Retorna configuração padrão se não existir
      return {
        dias_semana: [1, 2, 3, 4, 5], // Segunda a Sexta
        horarios_disponiveis: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"],
        intervalo_minutos: 60,
        max_agendamentos_dia: 10,
        datas_bloqueadas: [],
        dias_semana_info: DIAS_SEMANA.filter(dia => [1, 2, 3, 4, 5].includes(dia.id))
      };
    }

    // Adiciona informações dos dias da semana
    data.dias_semana_info = DIAS_SEMANA.filter(dia => data.dias_semana.includes(dia.id));
    return data;
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

// Verificar se horário está disponível considerando configurações
async function verificarDisponibilidade(clienteId, data, horario, ignoreId = null) {
  try {
    const config = await getConfigHorarios(clienteId);
    const configData = await getConfigDataEspecifica(clienteId, data);
    
    // Verificar se a data está bloqueada
    if (configData?.bloqueada) {
      return false;
    }

    // Verificar se a data está na lista de datas bloqueadas
    if (config.datas_bloqueadas && config.datas_bloqueadas.includes(data)) {
      return false;
    }

    // Verificar dia da semana
    const dataObj = new Date(data);
    const diaSemana = dataObj.getDay();
    if (!config.dias_semana.includes(diaSemana)) {
      return false;
    }

    // Verificar horários disponíveis
    let horariosPermitidos = config.horarios_disponiveis || [];
    
    // Aplicar configurações específicas da data
    if (configData) {
      if (configData.horarios_disponiveis) {
        horariosPermitidos = configData.horarios_disponiveis;
      }
      if (configData.horarios_bloqueados && configData.horarios_bloqueados.includes(horario)) {
        return false;
      }
    }

    if (!horariosPermitidos.includes(horario)) {
      return false;
    }

    // Verificar limite de agendamentos do dia
    const maxAgendamentos = configData?.max_agendamentos || config.max_agendamentos_dia;
    const { data: agendamentosDia } = await supabase
      .from("agendamentos")
      .select("id")
      .eq("cliente", clienteId)
      .eq("data", data)
      .neq("status", "cancelado");

    if (agendamentosDia && agendamentosDia.length >= maxAgendamentos) {
      return false;
    }

    return await horarioDisponivel(clienteId, data, horario, ignoreId);
  } catch (error) {
    console.error("Erro na verificação de disponibilidade:", error);
    return false;
  }
}

// Obter horários disponíveis para uma data
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

// ---------------- ROTAS PÚBLICAS PARA CLIENTES ----------------

// Obter horários disponíveis para uma data
app.get("/api/horarios-disponiveis/:cliente", async (req, res) => {
  try {
    const { cliente } = req.params;
    const { data } = req.query;

    if (!data) return res.status(400).json({ msg: "Data é obrigatória" });

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

// Serve o painel de admin
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Serve páginas de cliente dinamicamente
app.get("/cliente/:cliente", (req, res) => {
  const cliente = req.params.cliente;
  const filePath = path.join(__dirname, "public", `${cliente}.html`);
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).send("Página do cliente não encontrada");
  });
});

// ---------------- AGENDAMENTOS ----------------
app.get("/agendamentos/:cliente", authMiddleware, async (req, res) => {
  try {
    const { cliente } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { data, error } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente)
      .neq("status", "cancelado")
      .order("data", { ascending: true })
      .order("horario", { ascending: true });

    if (error) throw error;
    res.json({ agendamentos: data || [] });
  } catch (err) {
    console.error("Erro ao listar agendamentos:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// Agendar
app.post("/agendar/:cliente", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { Nome, Email, Telefone, Data, Horario } = req.body;
    if (!Nome || !Email || !Telefone || !Data || !Horario)
      return res.status(400).json({ msg: "Todos os campos obrigatórios" });

    const emailNormalizado = Email.toLowerCase().trim();
    const dataNormalizada = new Date(Data).toISOString().split("T")[0];

    const disponivel = await horarioDisponivel(cliente, dataNormalizada, Horario);
    if (!disponivel) return res.status(400).json({ msg: "Horário indisponível" });

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
    }

    res.json({ msg: "Agendamento realizado com sucesso!", agendamento: novoAgendamento });

  } catch (err) {
    console.error("Erro no /agendar:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// Confirmar / Cancelar / Reagendar
app.post("/agendamentos/:cliente/confirmar/:id", authMiddleware, async (req,res)=>{
  try {
    const { cliente, id } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({msg:"Acesso negado"});
    
    const { data, error } = await supabase.from("agendamentos")
      .update({confirmado:true,status:"confirmado"})
      .eq("id",id).eq("cliente",cliente).select().single();
    
    if (error) throw error;
    
    try {
      const doc = await accessSpreadsheet(cliente);
      await updateRowInSheet(doc.sheetsByIndex[0], id, data);
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
    
    try {
      const doc = await accessSpreadsheet(cliente);
      await updateRowInSheet(doc.sheetsByIndex[0], id, data);
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
    
    try {
      const doc = await accessSpreadsheet(cliente);
      await updateRowInSheet(doc.sheetsByIndex[0], id, data);
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




