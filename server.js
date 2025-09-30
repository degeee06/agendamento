import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { GoogleSpreadsheet } from "google-spreadsheet";

// ---------------- Config ----------------
const PORT = process.env.PORT || 3000;

const app = express();

// Configuração CORS SIMPLIFICADA - Use esta
app.use(cors({
  origin: [
    'https://frontrender.netlify.app',
    'http://localhost:3000',
    'http://localhost:5173'
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

// ---------------- Google Sheets ----------------
async function accessSpreadsheet() {
  // Usa um spreadsheet fixo para todos
  const spreadsheetId = process.env.DEFAULT_SPREADSHEET_ID || "seu_spreadsheet_id_aqui";
  const doc = new GoogleSpreadsheet(spreadsheetId);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  return doc;
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

// ---------------- Middleware Auth ----------------
async function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ msg: "Token não enviado" });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ msg: "Token inválido" });

  req.user = data.user;
  next(); // ✅ SEM verificação de cliente_id
}

// ---------------- Health Check ----------------
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "Backend rodando no GitHub",
    timestamp: new Date().toISOString()
  });
});

// ---------------- LISTAR AGENDAMENTOS ----------------
app.get("/agendamentos", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    
    const { data, error } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("email", userEmail)
      .order("data", { ascending: true })
      .order("horario", { ascending: true });

    if (error) throw error;
    res.json({ agendamentos: data });
  } catch (err) {
    console.error("Erro ao listar agendamentos:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- AGENDAR ----------------
app.post("/agendar", authMiddleware, async (req, res) => {
  try {
    const { Nome, Email, Telefone, Data, Horario } = req.body;
    if (!Nome || !Email || !Telefone || !Data || !Horario)
      return res.status(400).json({ msg: "Todos os campos obrigatórios" });

    const userEmail = req.user.email;
    const emailNormalizado = Email.toLowerCase().trim();
    const dataNormalizada = new Date(Data).toISOString().split("T")[0];

    // Limpeza de agendamentos cancelados (opcional)
    await supabase
      .from("agendamentos")
      .delete()
      .eq("email", userEmail)
      .eq("data", dataNormalizada)
      .eq("horario", Horario)
      .eq("status", "cancelado");

    // Inserção sem checagem de horário disponível
    const { data: novoAgendamento, error } = await supabase
      .from("agendamentos")
      .insert([{
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

    if (error) throw error;

    // Atualiza Google Sheet
    const doc = await accessSpreadsheet();
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(novoAgendamento));
    await sheet.addRow(novoAgendamento);

    res.json({ msg: "Agendamento realizado com sucesso!", agendamento: novoAgendamento });

  } catch (err) {
    console.error("Erro no /agendar:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- CONFIRMAR AGENDAMENTO ----------------
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

    const doc = await accessSpreadsheet();
    await updateRowInSheet(doc.sheetsByIndex[0], id, data);
    res.json({ msg: "Agendamento confirmado", agendamento: data });
  } catch (err) {
    console.error("Erro ao confirmar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- CANCELAR AGENDAMENTO ----------------
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

    const doc = await accessSpreadsheet();
    await updateRowInSheet(doc.sheetsByIndex[0], id, data);
    res.json({ msg: "Agendamento cancelado", agendamento: data });
  } catch (err) {
    console.error("Erro ao cancelar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- REAGENDAR AGENDAMENTO ----------------
app.post("/agendamentos/reagendar/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { novaData, novoHorario } = req.body;
    const userEmail = req.user.email;
    
    if (!novaData || !novoHorario) return res.status(400).json({ msg: "Data e horário obrigatórios" });
    
    // ✅ SEM verificação de horário disponível
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
    
    if (error) throw error;
    if (!data) return res.status(404).json({ msg: "Agendamento não encontrado" });

    const doc = await accessSpreadsheet();
    await updateRowInSheet(doc.sheetsByIndex[0], id, data);
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

// Rota 404 para endpoints não encontrados
app.use("*", (req, res) => {
  res.status(404).json({ msg: "Endpoint não encontrado" });
});

// ---------------- Servidor ----------------
app.listen(PORT, () => console.log(`Backend API rodando na porta ${PORT}`));
