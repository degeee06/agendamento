import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { GoogleSpreadsheet } from "google-spreadsheet";

// ---------------- Config ----------------
const PORT = process.env.PORT || 3000;

const app = express();

// Configuração CORS para permitir frontend no Netlify - CORRIGIDO
app.use(cors({
  origin: function(origin, callback) {
    // Permite requests sem origin (como mobile apps) ou de domínios específicos
    const allowedOrigins = [
      'https://frontrender.netlify.app', // 🔥 ADICIONE HTTPS
      'http://localhost:3000', // Para desenvolvimento local
      'http://localhost:5173' // Vite dev server
    ];
    
    // Permite requests sem origin (mobile apps, etc) OU de domínios permitidos
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
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
async function accessSpreadsheet(clienteId) {
  const { data, error } = await supabase
    .from("clientes")
    .select("spreadsheet_id")
    .eq("id", clienteId)
    .single();
  if (error || !data) throw new Error(`Cliente ${clienteId} não encontrado`);

  const doc = new GoogleSpreadsheet(data.spreadsheet_id);
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
  req.clienteId = data.user.user_metadata.cliente_id;
  if (!req.clienteId) return res.status(403).json({ msg: "Usuário sem cliente_id" });
  next();
}

async function horarioDisponivel(cliente, data, horario, ignoreId = null) {
  let query = supabase
    .from("agendamentos")
    .select("*")
    .eq("cliente", cliente)
    .eq("data", data)
    .eq("horario", horario)
    .neq("status", "cancelado");

  if (ignoreId) query = query.neq("id", ignoreId);
  const { data: agendamentos } = await query;
  return agendamentos.length === 0;
}

// ---------------- Health Check ----------------
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "Backend rodando no GitHub",
    timestamp: new Date().toISOString()
  });
});

// ---------------- Rotas de Agendamentos ----------------
app.get("/agendamentos/:cliente", authMiddleware, async (req, res) => {
  try {
    const { cliente } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { data, error } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente)
      .order("data", { ascending: true })
      .order("horario", { ascending: true });

    if (error) throw error;
    res.json({ agendamentos: data });
  } catch (err) {
    console.error("Erro ao listar agendamentos:", err);
    res.status(500).json({ msg: "Erro interno" });
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

    // Limpeza de agendamentos cancelados (opcional)
    await supabase
      .from("agendamentos")
      .delete()
      .eq("cliente", cliente)
      .eq("data", dataNormalizada)
      .eq("horario", Horario)
      .eq("status", "cancelado");

    // Inserção sem checagem de horário disponível
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

    if (error) throw error;

    // Atualiza Google Sheet
    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(novoAgendamento));
    await sheet.addRow(novoAgendamento);

    res.json({ msg: "Agendamento realizado com sucesso!", agendamento: novoAgendamento });

  } catch (err) {
    console.error("Erro no /agendar:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- Confirmar / Cancelar / Reagendar ----------------
app.post("/agendamentos/:cliente/confirmar/:id", authMiddleware, async (req, res) => {
  try {
    const { cliente, id } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });
    
    const { data, error } = await supabase.from("agendamentos")
      .update({ confirmado: true, status: "confirmado" })
      .eq("id", id).eq("cliente", cliente).select().single();
    
    if (error) throw error;

    const doc = await accessSpreadsheet(cliente);
    await updateRowInSheet(doc.sheetsByIndex[0], id, data);
    res.json({ msg: "Agendamento confirmado", agendamento: data });
  } catch (err) {
    console.error("Erro ao confirmar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

app.post("/agendamentos/:cliente/cancelar/:id", authMiddleware, async (req, res) => {
  try {
    const { cliente, id } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });
    
    const { data, error } = await supabase.from("agendamentos")
      .update({ status: "cancelado", confirmado: false })
      .eq("id", id).eq("cliente", cliente).select().single();
    
    if (error) throw error;

    const doc = await accessSpreadsheet(cliente);
    await updateRowInSheet(doc.sheetsByIndex[0], id, data);
    res.json({ msg: "Agendamento cancelado", agendamento: data });
  } catch (err) {
    console.error("Erro ao cancelar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

app.post("/agendamentos/:cliente/reagendar/:id", authMiddleware, async (req, res) => {
  try {
    const { cliente, id } = req.params;
    const { novaData, novoHorario } = req.body;
    if (!novaData || !novoHorario) return res.status(400).json({ msg: "Data e horário obrigatórios" });
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });
    
    const disponivel = await horarioDisponivel(cliente, novaData, novoHorario, id);
    if (!disponivel) return res.status(400).json({ msg: "Horário indisponível" });
    
    const { data, error } = await supabase.from("agendamentos")
      .update({ data: novaData, horario: novoHorario })
      .eq("id", id).eq("cliente", cliente).select().single();
    
    if (error) throw error;

    const doc = await accessSpreadsheet(cliente);
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

