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
  if (!creds) throw new Error("Credenciais do Google Sheets não configuradas");

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
  } catch {
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
      if (sheet.headerValues.includes(key)) row[key] = updatedData[key];
    });
    await row.save();
  } else {
    await ensureDynamicHeaders(sheet, Object.keys(updatedData));
    await sheet.addRow({ id: rowId, ...updatedData });
  }
}

// ---------------- Middleware ----------------
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ msg: "Token ausente" });

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    req.clienteId = payload?.user_metadata?.cliente_id;
    req.isAdmin = payload?.user_metadata?.role === "admin";
    next();
  } catch {
    res.status(401).json({ msg: "Token inválido" });
  }
}

// ---------------- Funções auxiliares ----------------
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
    if (error) return false;

    return agendamentos.length === 0;
  } catch {
    return false;
  }
}

const DIAS_SEMANA = [
  { id: 0, nome: "Domingo", abreviacao: "Dom" },
  { id: 1, nome: "Segunda-feira", abreviacao: "Seg" },
  { id: 2, nome: "Terça-feira", abreviacao: "Ter" },
  { id: 3, nome: "Quarta-feira", abreviacao: "Qua" },
  { id: 4, nome: "Quinta-feira", abreviacao: "Qui" },
  { id: 5, nome: "Sexta-feira", abreviacao: "Sex" },
  { id: 6, nome: "Sábado", abreviacao: "Sáb" }
];

// ---------------- Rotas Admin/Cliente ----------------
function checkAdminOrOwner(req, cliente) {
  if (!req.isAdmin && req.clienteId !== cliente) {
    return false;
  }
  return true;
}


// ---------------- ROTAS CONFIGURAÇÕES ----------------
app.get("/admin/config/:cliente", authMiddleware, async (req, res) => {
  const { cliente } = req.params;
  if (!checkAdminOrOwner(req, cliente)) return res.status(403).json({ msg: "Acesso negado" });

  try {
    const { data, error } = await supabase.from("config_horarios")
      .select("*").eq("cliente_id", cliente).single();

    if (error || !data) return res.json({
      dias_semana: [1,2,3,4,5],
      horarios_disponiveis: ["09:00","10:00","11:00","14:00","15:00","16:00"],
      intervalo_minutos: 60,
      max_agendamentos_dia: 10,
      datas_bloqueadas: [],
      dias_semana_info: DIAS_SEMANA.filter(d => [1,2,3,4,5].includes(d.id))
    });

    data.dias_semana_info = DIAS_SEMANA.filter(d => data.dias_semana.includes(d.id));
    res.json(data);
  } catch {
    res.status(500).json({ msg: "Erro interno" });
  }
});

app.put("/admin/config/:cliente", authMiddleware, async (req, res) => {
  const { cliente } = req.params;
  if (!checkAdminOrOwner(req, cliente)) return res.status(403).json({ msg: "Acesso negado" });

  try {
    const { dias_semana, horarios_disponiveis, intervalo_minutos, max_agendamentos_dia, datas_bloqueadas } = req.body;
    const { data, error } = await supabase.from("config_horarios")
      .upsert({
        cliente_id: cliente,
        dias_semana: dias_semana || [1,2,3,4,5],
        horarios_disponiveis: horarios_disponiveis || ["09:00","10:00","11:00","14:00","15:00","16:00"],
        intervalo_minutos: intervalo_minutos || 60,
        max_agendamentos_dia: max_agendamentos_dia || 10,
        datas_bloqueadas: datas_bloqueadas || [],
        updated_at: new Date().toISOString()
      }).select().single();

    if (error) throw error;
    data.dias_semana_info = DIAS_SEMANA.filter(d => data.dias_semana.includes(d.id));
    res.json({ msg:"Configurações atualizadas com sucesso", config:data });
  } catch {
    res.status(500).json({ msg:"Erro interno" });
  }
});

// ---------------- ROTAS AGENDAMENTOS ----------------
app.get("/agendamentos/:cliente", authMiddleware, async (req, res) => {
  const { cliente } = req.params;
  if (!checkAdminOrOwner(req, cliente)) return res.status(403).json({ msg: "Acesso negado" });

  try {
    const { data, error } = await supabase.from("agendamentos")
      .select("*")
      .eq("cliente", cliente)
      .neq("status", "cancelado")
      .order("data", { ascending:true })
      .order("horario", { ascending:true });

    res.json({ agendamentos: data || [] });
  } catch {
    res.status(500).json({ msg:"Erro interno" });
  }
});

app.post("/agendar/:cliente", authMiddleware, async (req,res)=>{
  const { cliente } = req.params;
  if (!checkAdminOrOwner(req, cliente)) return res.status(403).json({ msg: "Acesso negado" });

  try {
    const { Nome, Email, Telefone, Data, Horario } = req.body;
    if (!Nome || !Email || !Telefone || !Data || !Horario) 
      return res.status(400).json({ msg: "Todos os campos obrigatórios" });

    const disponivel = await horarioDisponivel(cliente, novaData, novoHorario, id);
    if(!disponivel) return res.status(400).json({ msg: "Horário indisponível" });

    const { data, error } = await supabase.from("agendamentos")
      .insert([{ cliente, nome:Nome, email:Email.toLowerCase(), telefone:Telefone, data:Data, horario:Horario, status:"pendente", confirmado:false }])
      .select().single();
    
    if(error) throw error;

    try {
      const doc = await accessSpreadsheet(cliente);
      const sheet = doc.sheetsByIndex[0];
      await ensureDynamicHeaders(sheet, Object.keys(data));
      await sheet.addRow(data);
    } catch(e){ console.error("Erro Google Sheets:", e); }

    res.json({ msg:"Agendamento realizado com sucesso!", agendamento:data });
  } catch {
    res.status(500).json({ msg:"Erro interno" });
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







