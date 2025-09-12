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

// ---------------- Google Sheets ----------------
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

// ---------------- Disponibilidade ----------------
async function horarioDisponivel(cliente, data, horario) {
  const { data: agendamentos, error } = await supabase
    .from("agendamentos")
    .select("*")
    .eq("cliente", cliente)
    .eq("data", data)
    .eq("horario", horario);
  if (error) throw error;
  return agendamentos.length === 0;
}

// ---------------- Rotas ----------------
app.get("/", (req, res) => res.send("Servidor rodando"));

app.get("/:cliente", (req, res) => {
  const cliente = req.params.cliente;
  if (!clientesValidos.includes(cliente)) return res.status(404).send("Cliente não encontrado");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Endpoint para agendar (protegido)
app.post("/agendar/:cliente", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { Nome, Email, Telefone, Data, Horario } = req.body;
    if (!Nome || !Email || !Telefone || !Data || !Horario) return res.status(400).json({ msg: "Todos os campos obrigatórios" });

    const livre = await horarioDisponivel(cliente, Data, Horario);
    if (!livre) return res.status(400).json({ msg: "Horário indisponível" });

    const registro = { cliente, nome: Nome, email: Email, telefone: Telefone, data: Data, horario: Horario };

    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(registro));
    await sheet.addRow(registro);

    const { error } = await supabase.from("agendamentos").insert([registro]);
    if (error) return res.status(500).json({ msg: "Erro ao salvar no Supabase" });

    res.json({ msg: "✅ Agendamento realizado com sucesso" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "❌ Erro interno" });
  }
});

// Confirmar agendamento (protegido)
// Confirmar agendamento (protegido)
app.post("/confirmar/:cliente/:id", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) {
      return res.status(403).json({ msg: "Acesso negado" });
    }

    const { id } = req.params;

    // 1. Atualiza no Supabase
    const { data, error } = await supabase
      .from("agendamentos")
      .update({ status: "confirmado", confirmado: true })
      .eq("id", id)
      .eq("cliente", cliente)
      .select()
      .single();

    if (error) return res.status(500).json({ msg: "Erro ao confirmar agendamento" });
    if (!data) return res.status(404).json({ msg: "Agendamento não encontrado" });

    // 2. Atualiza no Google Sheets
    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(data));

    // tenta localizar a linha correspondente
    await sheet.loadCells(); // garante acesso
    const rows = await sheet.getRows();
    const row = rows.find(
      (r) =>
        r.get("email") === data.email &&
        r.get("data") === data.data &&
        r.get("horario") === data.horario
    );

    if (row) {
      row.set("status", "confirmado");
      row.set("confirmado", true);
      await row.save();
    } else {
      // fallback: se não achar, cria nova linha com os dados atualizados
      await sheet.addRow(data);
    }

    res.json({ msg: "✅ Agendamento confirmado", agendamento: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "❌ Erro interno" });
  }
});


app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

