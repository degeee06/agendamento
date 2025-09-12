import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { createClient } from "@supabase/supabase-js";

// Config
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Clientes e IDs das planilhas deles
const planilhasClientes = {
  cliente1: process.env.ID_PLANILHA_CLIENTE1,
  cliente2: process.env.ID_PLANILHA_CLIENTE2
};

// Lista de clientes válidos
const clientesValidos = Object.keys(planilhasClientes);

// Google Service Account
let creds;
try {
  creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
} catch (e) {
  console.error("Erro ao parsear GOOGLE_SERVICE_ACCOUNT:", e);
  process.exit(1);
}

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ------------------------
// Google Sheets Functions
// ------------------------
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
    console.log("Cabeçalhos criados:", newKeys);
  });

  const currentHeaders = sheet.headerValues || [];
  const headersToAdd = newKeys.filter((k) => !currentHeaders.includes(k));
  if (headersToAdd.length > 0) {
    await sheet.setHeaderRow([...currentHeaders, ...headersToAdd]);
    console.log("Cabeçalhos atualizados:", [...currentHeaders, ...headersToAdd]);
  }
}

// ------------------------
// Auth Middleware
// ------------------------
async function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ msg: "Não autorizado" });

  try {
    const { data: user, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ msg: "Token inválido" });

    req.user = user.user;
    next();
  } catch {
    return res.status(401).json({ msg: "Token inválido" });
  }
}

// ------------------------
// Verifica se horário está disponível
// ------------------------
async function horarioDisponivel(clienteId, data, horario) {
  const { data: agendamentos, error } = await supabase
    .from("agendamentos")
    .select("*")
    .eq("cliente_id", clienteId)
    .eq("data", data)
    .eq("horario", horario);

  if (error) throw error;
  return agendamentos.length === 0; // true se livre
}

// ------------------------
// Routes
// ------------------------

// Login usando Supabase Auth
app.post("/login", async (req, res) => {
  const { email, senha } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: senha
  });

  if (error) return res.status(400).json({ msg: error.message });
  res.json({ msg: "Login OK", token: data.session?.access_token });
});

// Retorna info do cliente logado
app.get("/minhas-info", authMiddleware, async (req, res) => {
  try {
    const clienteId = req.user.user_metadata?.cliente_id;
    if (!clienteId) return res.status(400).json({ msg: "Cliente não encontrado" });

    const { data: cliente } = await supabase
      .from("clientes")
      .select("*")
      .eq("id", clienteId)
      .single();

    res.json({ cliente });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// Servir front-end
app.get("/:cliente", (req, res) => {
  const cliente = req.params.cliente;
  if (!clientesValidos.includes(cliente)) {
    return res.status(404).send("Cliente não encontrado");
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Agendamento protegido
app.post("/agendar/:cliente", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (!clientesValidos.includes(cliente)) {
      return res.status(400).json({ msg: "Cliente inválido" });
    }

    const { Nome, Email, Telefone, Data, Horario } = req.body;
    if (!Nome || !Email || !Telefone || !Data || !Horario) {
      return res.status(400).json({ msg: "Todos os campos são obrigatórios" });
    }

    // Pega clienteId do usuário logado
    const clienteId = req.user.user_metadata?.cliente_id;

    // Verifica disponibilidade
    const livre = await horarioDisponivel(clienteId, Data, Horario);
    if (!livre) return res.status(400).json({ msg: "Horário indisponível" });

    const registro = {
      cliente_id: clienteId,
      nome: Nome,
      email: Email,
      telefone: Telefone,
      data: Data,
      horario: Horario
    };

    // Salva no Google Sheets
    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(registro));
    await sheet.addRow(registro);

    // Salva no Supabase
    const { error } = await supabase.from("agendamentos").insert([registro]);
    if (error) {
      console.error("Erro Supabase:", error);
      return res.status(500).json({ msg: "Erro ao salvar no Supabase" });
    }

    res.json({ msg: "✅ Agendamento realizado com sucesso" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "❌ Erro interno" });
  }
});

// Checar horários ocupados (protegido)
app.get("/disponiveis/:cliente/:data", authMiddleware, async (req, res) => {
  try {
    const { cliente, data } = req.params;
    if (!clientesValidos.includes(cliente)) {
      return res.status(400).json({ msg: "Cliente inválido" });
    }

    const clienteId = req.user.user_metadata?.cliente_id;

    const { data: agendamentos, error } = await supabase
      .from("agendamentos")
      .select("horario")
      .eq("cliente_id", clienteId)
      .eq("data", data);

    if (error) return res.status(500).json({ msg: "Erro Supabase" });

    const ocupados = agendamentos.map(a => a.horario);
    res.json({ ocupados });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
