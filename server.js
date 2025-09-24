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
  console.warn("⚠️ Token de acesso do Mercado Pago não configurado");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let mpClient, payment;
if (process.env.MP_ACCESS_TOKEN) {
  mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  payment = new Payment(mpClient);
}

let creds;
try {
  if (process.env.GOOGLE_SERVICE_ACCOUNT) {
    creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  }
} catch (e) {
  console.error("❌ Erro ao parsear GOOGLE_SERVICE_ACCOUNT:", e);
}

// ---------------- Constantes ----------------
const DIAS_SEMANA = [
  { id: 0, nome: "Domingo", abreviacao: "Dom" },
  { id: 1, nome: "Segunda-feira", abreviacao: "Seg" },
  { id: 2, nome: "Terça-feira", abreviacao: "Ter" },
  { id: 3, nome: "Quarta-feira", abreviacao: "Qua" },
  { id: 4, nome: "Quinta-feira", abreviacao: "Qui" },
  { id: 5, nome: "Sexta-feira", abreviacao: "Sex" },
  { id: 6, nome: "Sábado", abreviacao: "Sáb" }
];

// ---------------- Middleware Auth ----------------
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

// ---------------- Funções Google Sheets ----------------
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
  try { await sheet.loadHeaderRow(); } 
  catch { await sheet.setHeaderRow(newKeys); return; }
  
  const currentHeaders = sheet.headerValues || [];
  const headersToAdd = newKeys.filter(k => !currentHeaders.includes(k));
  if (headersToAdd.length > 0) await sheet.setHeaderRow([...currentHeaders, ...headersToAdd]);
}

async function updateRowInSheet(sheet, rowId, updatedData) {
  await sheet.loadHeaderRow();
  const rows = await sheet.getRows();
  const row = rows.find(r => r.id === rowId);
  
  if (row) {
    Object.keys(updatedData).forEach(key => { if(sheet.headerValues.includes(key)) row[key]=updatedData[key]; });
    await row.save();
  } else {
    await ensureDynamicHeaders(sheet, Object.keys(updatedData));
    await sheet.addRow({ id: rowId, ...updatedData });
  }
}

// ---------------- Funções Agendamento ----------------
async function horarioDisponivel(cliente, data, horario, ignoreId=null) {
  let query = supabase.from("agendamentos").select("*").eq("cliente", cliente).eq("data", data).eq("horario", horario).neq("status","cancelado");
  if(ignoreId) query=query.neq("id", ignoreId);
  const { data: agendamentos } = await query;
  return agendamentos.length===0;
}

// ==== Limpar agendamentos expirados ====
async function limparAgendamentosExpirados() {
  try {
    const quinzeMinutosAtras = new Date(Date.now() - 15*60*1000);
    const { data: agendamentosExpirados } = await supabase
      .from("agendamentos")
      .select("id, cliente")
      .eq("status","pendente")
      .lt("created_at", quinzeMinutosAtras.toISOString());

    if(agendamentosExpirados?.length>0) {
      for(const ag of agendamentosExpirados) {
        await supabase.from("agendamentos").update({status:"cancelado", confirmado:false}).eq("id", ag.id);
        try { 
          const doc = await accessSpreadsheet(ag.cliente); 
          await updateRowInSheet(doc.sheetsByIndex[0], ag.id, {status:"cancelado", confirmado:false}); 
        }
        catch(e){ console.error(e); }
      }
    }
  } catch(err) { console.error("Erro limparAgendamentosExpirados:", err); }
}

// ================= ROTAS =================

// ---------- Rotas Admin ----------
app.get("/admin/config/:cliente", authMiddleware, async (req,res)=>{/* ... */});
app.put("/admin/config/:cliente", authMiddleware, async (req,res)=>{/* ... */});
app.get("/admin/config/:cliente/datas", authMiddleware, async (req,res)=>{/* ... */});
app.post("/admin/config/:cliente/datas", authMiddleware, async (req,res)=>{/* ... */});

// ---------- Rotas API Cliente ----------
app.get("/api/horarios-disponiveis/:cliente", async (req,res)=>{/* ... */});
app.get("/api/dias-disponiveis/:cliente", async (req,res)=>{/* ... */});

app.get("/agendamentos/:cliente", authMiddleware, async (req,res)=>{/* ... */});
app.post("/agendar/:cliente", authMiddleware, async (req,res)=>{/* ... */});
app.post("/agendamentos/:cliente/confirmar/:id", authMiddleware, async (req,res)=>{/* ... */});
app.post("/agendamentos/:cliente/cancelar/:id", authMiddleware, async (req,res)=>{/* ... */});
app.post("/agendamentos/:cliente/reagendar/:id", authMiddleware, async (req,res)=>{/* ... */});

// ---------- Pagamentos PIX ----------
app.post("/create-pix", async (req,res)=>{/* ... */});
app.get("/check-payment/:paymentId", async (req,res)=>{/* ... */});
app.get("/check-vip/:email", async (req,res)=>{/* ... */});
app.post("/webhook", async (req,res)=>{/* ... */});

// ---------- Rotas Frontend ----------
app.get("/", (req,res)=>res.sendFile(path.join(__dirname,"public/index.html"))); // Painel Admin

// Aqui está a correção principal: prefixo /clientes
app.get("/clientes/:cliente", (req,res)=>{
  const cliente=req.params.cliente;
  const filePath = path.join(__dirname,"public",`${cliente}.html`);
  res.sendFile(filePath, (err)=>{if(err) res.status(404).send("Página do cliente não encontrada");});
});

// ---------- Health Check ----------
app.get("/health", (req,res)=>res.json({status:"OK", timestamp:new Date().toISOString(), port:PORT}));

// ---------- Inicializar servidor ----------
app.listen(PORT, ()=>{
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  setInterval(limparAgendamentosExpirados,5*60*1000);
  setTimeout(limparAgendamentosExpirados,2000);
});
