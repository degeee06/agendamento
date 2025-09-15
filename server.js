import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// ---------------- Supabase ----------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------- Clientes e planilhas ----------------
const planilhasClientes = {
  cliente1: process.env.ID_PLANILHA_CLIENTE1,
  cliente2: process.env.ID_PLANILHA_CLIENTE2
};
const clientesValidos = Object.keys(planilhasClientes);

// ---------------- Google Service Account ----------------
let creds;
try {
  creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
} catch (e) {
  console.error("Erro ao parsear GOOGLE_SERVICE_ACCOUNT:", e);
  process.exit(1);
}

// ---------------- App ----------------
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ---------------- Middleware Auth ----------------
async function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ msg: "Token não enviado" });

  const { data, error } = await supabase.auth.signInWithPassword({
  email: emailInput.value,
  password: passwordInput.value
});

if (error) {
  alert("Erro no login: " + error.message);
  return;
}

const userToken = data.session.access_token; // ⚠️ este é o token que vai no header

const response = await fetch(`/agendar/${cliente}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${userToken}` // ⚠️ aqui vai o token do login
  },
  body: JSON.stringify({
    Nome: form.Nome.value,
    Email: form.Email.value,
    Telefone: form.Telefone.value,
    Data: form.Data.value,
    Horario: form.Horario.value
  })
});


// ---------------- Google Sheets ----------------
async function accessSpreadsheet(cliente) {
  const SPREADSHEET_ID = planilhasClientes[cliente];
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
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

// ---------------- Rotas ----------------
app.get("/", (req, res) => res.send("Servidor rodando"));

app.get("/:cliente", (req, res) => {
  const cliente = req.params.cliente;
  if (!clientesValidos.includes(cliente)) return res.status(404).send("Cliente não encontrado");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------------- Agendar ----------------
app.post("/agendar/:cliente", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    // desestrutura com minúsculo, pois é assim que o frontend envia
    const { nome, email, telefone, data, horario } = req.body;
    if (!nome || !email || !telefone || !data || !horario)
      return res.status(400).json({ msg: "Todos os campos obrigatórios" });

    const novoAgendamento = {
      cliente,
      nome,
      email,
      telefone,
      data,
      horario,
      status: "pendente",
      confirmado: false
    };

    // renomeia para não conflitar
    const { data: insertData, error: insertError } = await supabase
      .from("agendamentos")
      .insert([novoAgendamento])
      .select()
      .single();

    if (insertError) return res.status(500).json({ msg: "Erro ao salvar no Supabase" });

    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(insertData));
    await sheet.addRow(insertData);

    res.json({ msg: "Agendamento realizado com sucesso!", agendamento: insertData });

  } catch (err) {
    console.error("Erro interno na rota /agendar:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});


// ---------------- Reagendar ----------------
app.post("/reagendar/:cliente/:id", async (req, res) => {
  const { cliente, id } = req.params;
  const { novaData, novoHorario } = req.body;

  try {
    // Atualiza no Supabase (aceita qualquer data/horário, sem bloqueio)
    const { data: agendamento, error } = await supabase
      .from("agendamentos")
      .update({ data: novaData, horario: novoHorario })
      .eq("id", id)
      .eq("cliente", cliente)
      .select()
      .single();

    if (error) return res.status(500).json({ message: "Erro ao atualizar Supabase" });
    if (!agendamento) return res.status(404).json({ message: "Agendamento não encontrado" });

    // Atualiza no Google Sheets
    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    const row = rows.find(r => r.id == id); // procura pelo mesmo ID do Supabase

    if (row) {
      row.data = novaData;
      row.horario = novoHorario;
      await row.save();
    } else {
      await sheet.addRow(agendamento); // se não existir no Sheets, cria
    }

    return res.json({ message: "Agendamento reagendado com sucesso!", agendamento });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Erro interno ao reagendar" });
  }
});

// ---------------- Cancelar ----------------
app.post("/cancelar/:cliente/:id", authMiddleware, async (req, res) => {
    try {
        const { cliente, id } = req.params;
        if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

        // Atualiza o status no Supabase
        const { data, error } = await supabase
            .from("agendamentos")
            .update({ status: "cancelado", confirmado: false })
            .eq("id", id)
            .eq("cliente", cliente)
            .select()
            .single();

        if (error) return res.status(500).json({ msg: "Erro ao cancelar agendamento" });
        if (!data) return res.status(404).json({ msg: "Agendamento não encontrado" });

        // Atualiza no Google Sheets
        const doc = await accessSpreadsheet(cliente);
        const sheet = doc.sheetsByIndex[0];
        await ensureDynamicHeaders(sheet, Object.keys(data));
        const rows = await sheet.getRows();
        const row = rows.find(r => r.id == data.id);
        if (row) {
            row.status = "cancelado";
            row.confirmado = false;
            await row.save();
        } else {
            await sheet.addRow(data);
        }

        res.json({ msg: "Agendamento cancelado!", agendamento: data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "Erro interno ao cancelar" });
    }
});


// ---------------- Confirmar ----------------
app.post("/confirmar/:cliente/:id", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { id } = req.params;
    const { data, error } = await supabase
      .from("agendamentos")
      .update({ status: "confirmado", confirmado: true })
      .eq("id", id)
      .eq("cliente", cliente)
      .select()
      .single();

    if (error) return res.status(500).json({ msg: "Erro ao confirmar agendamento" });
    if (!data) return res.status(404).json({ msg: "Agendamento não encontrado" });

    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(data));
    const rows = await sheet.getRows();
    const row = rows.find(r => r.id == data.id);
    if (row) {
      row.status = "confirmado";
      row.confirmado = true;
      await row.save();
    } else {
      await sheet.addRow(data);
    }

    res.json({ msg: "Agendamento confirmado!", agendamento: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- Disponíveis ----------------
app.get("/disponiveis/:cliente/:data", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    res.json({ ocupados: [] }); // sempre retorna vazio para não bloquear horários
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- Meus Agendamentos ----------------
app.get("/meus-agendamentos/:cliente", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { data, error } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente);

    if (error) return res.status(500).json({ msg: "Erro Supabase" });

    res.json({ agendamentos: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));







