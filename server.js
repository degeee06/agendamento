import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// ----------------- SUPABASE -----------------
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Google Service Account
let creds;
try {
  creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
} catch (e) {
  console.error("Erro ao parsear GOOGLE_SERVICE_ACCOUNT:", e);
  process.exit(1);
}

// Map de clientes -> planilhas
const planilhasClientes = {
  cliente1: process.env.ID_PLANILHA_CLIENTE1,
  cliente2: process.env.ID_PLANILHA_CLIENTE2,
};
const clientesValidos = Object.keys(planilhasClientes);

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ----------------- GOOGLE SHEETS -----------------
async function accessSpreadsheet(cliente) {
  const SPREADSHEET_ID = planilhasClientes[cliente];
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  return doc;
}

async function ensureDynamicHeaders(sheet, newKeys) {
  await sheet.loadHeaderRow().catch(async () => {
    await sheet.setHeaderRow(newKeys);
  });

  const currentHeaders = sheet.headerValues || [];
  const headersToAdd = newKeys.filter((k) => !currentHeaders.includes(k));
  if (headersToAdd.length > 0) {
    await sheet.setHeaderRow([...currentHeaders, ...headersToAdd]);
  }
}

// ----------------- VERIFICAÇÃO DE HORÁRIO -----------------
async function horarioDisponivel(cliente, data, horario) {
  const { data: agendamentos, error } = await supabaseAdmin
    .from("agendamentos")
    .select("*")
    .eq("cliente", cliente)
    .eq("data", data)
    .eq("horario", horario);

  if (error) throw error;
  return agendamentos.length === 0;
}

// ----------------- MIDDLEWARE DE AUTENTICAÇÃO -----------------
async function authMiddleware(req, res, next) {
  try {
    const token = req.headers["authorization"]?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ msg: "Token obrigatório" });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ msg: "Token inválido" });

    req.user = data.user;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
  }
}

// ----------------- ROTAS -----------------

// Serve index.html protegido
app.get("/cliente/:cliente", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Agendar horário
app.post("/agendar/:cliente", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.user.user_metadata.clienteId !== cliente) {
      return res.status(403).json({ msg: "Cliente inválido para este usuário" });
    }

    const { Nome, Email, Telefone, Data, Horario } = req.body;
    if (!Nome || !Email || !Telefone || !Data || !Horario) {
      return res.status(400).json({ msg: "Todos os campos são obrigatórios" });
    }

    const livre = await horarioDisponivel(cliente, Data, Horario);
    if (!livre) return res.status(400).json({ msg: "Horário indisponível" });

    const registro = { cliente, nome: Nome, email: Email, telefone: Telefone, data: Data, horario: Horario };

    // Google Sheets
    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(registro));
    await sheet.addRow(registro);

    // Supabase
    const { error } = await supabaseAdmin.from("agendamentos").insert([registro]);
    if (error) return res.status(500).json({ msg: "Erro ao salvar no Supabase" });

    res.json({ msg: "✅ Agendamento realizado com sucesso" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "❌ Erro interno" });
  }
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
