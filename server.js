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
    if (req.clienteId !== cliente)
      return res.status(403).json({ msg: "Acesso negado" });

    const { Nome, Email, Telefone, Data, Horario } = req.body;
    if (!Nome || !Email || !Telefone || !Data || !Horario)
      return res.status(400).json({ msg: "Todos os campos obrigatórios" });

    // Verifica se já existe agendamento no mesmo horário/data
    const { data: existente } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente)
      .eq("data", Data)
      .eq("horario", Horario)
      .in("status", ["pendente", "confirmado"])
      .single()
      .catch(() => ({ data: null }));

    let agendamentoFinal;

    if (existente) {
      // Substitui o agendamento existente
      const { data, error } = await supabase
        .from("agendamentos")
        .update({
          nome: Nome,
          email: Email,
          telefone: Telefone,
          status: "pendente",
          confirmado: false
        })
        .eq("id", existente.id)
        .select()
        .single();

      if (error) return res.status(500).json({ msg: "Erro ao atualizar agendamento existente" });
      agendamentoFinal = data;

      // Atualiza Google Sheets
      const doc = await accessSpreadsheet(cliente);
      const sheet = doc.sheetsByIndex[0];
      await ensureDynamicHeaders(sheet, Object.keys(data));
      const rows = await sheet.getRows();
      const row = rows.find(r => r.id == existente.id);
      if (row) {
        row.nome = Nome;
        row.email = Email;
        row.telefone = Telefone;
        row.status = "pendente";
        row.confirmado = false;
        await row.save();
      } else {
        await sheet.addRow(data);
      }

    } else {
      // Cria novo agendamento
      const { data, error } = await supabase
        .from("agendamentos")
        .insert([{
          cliente,
          nome: Nome,
          email: Email,
          telefone: Telefone,
          data: Data,
          horario: Horario,
          status: "pendente",
          confirmado: false
        }])
        .select()
        .single();

      if (error) return res.status(500).json({ msg: "Erro ao salvar no Supabase" });
      agendamentoFinal = data;

      const doc = await accessSpreadsheet(cliente);
      const sheet = doc.sheetsByIndex[0];
      await ensureDynamicHeaders(sheet, Object.keys(data));
      await sheet.addRow(data);
    }

    res.json({ msg: "Agendamento realizado com sucesso!", agendamento: agendamentoFinal });

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- Reagendar ----------------
app.post("/reagendar/:cliente/:id", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { id } = req.params;
    const { novaData, novoHorario } = req.body;
    if (!novaData || !novoHorario)
      return res.status(400).json({ msg: "Nova data e horário obrigatórios" });

    const { data: agendamento, error: errorGet } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("id", id)
      .eq("cliente", cliente)
      .single();
    if (errorGet || !agendamento) return res.status(404).json({ msg: "Agendamento não encontrado" });

    // Marca o agendamento original como "reagendado"
    const { error: errorUpdate } = await supabase
      .from("agendamentos")
      .update({ status: "reagendado" })
      .eq("id", id);
    if (errorUpdate) return res.status(500).json({ msg: "Erro ao atualizar agendamento original" });

    // Verifica se já existe agendamento no mesmo horário/data
    const { data: existente } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente)
      .eq("data", novaData)
      .eq("horario", novoHorario)
      .in("status", ["pendente", "confirmado"])
      .single()
      .catch(() => ({ data: null }));

    let novoAgendamentoFinal;

    if (existente) {
      // Substitui o existente
      const { data, error } = await supabase
        .from("agendamentos")
        .update({
          nome: agendamento.nome,
          email: agendamento.email,
          telefone: agendamento.telefone,
          status: "pendente",
          confirmado: false
        })
        .eq("id", existente.id)
        .select()
        .single();

      if (error) return res.status(500).json({ msg: "Erro ao atualizar agendamento existente" });
      novoAgendamentoFinal = data;

      const doc = await accessSpreadsheet(cliente);
      const sheet = doc.sheetsByIndex[0];
      await ensureDynamicHeaders(sheet, Object.keys(data));
      const rows = await sheet.getRows();
      const row = rows.find(r => r.id == existente.id);
      if (row) {
        row.nome = agendamento.nome;
        row.email = agendamento.email;
        row.telefone = agendamento.telefone;
        row.status = "pendente";
        row.confirmado = false;
        await row.save();
      } else {
        await sheet.addRow(data);
      }

    } else {
      // Cria novo reagendamento
      const novoAgendamento = {
        cliente,
        nome: agendamento.nome,
        email: agendamento.email,
        telefone: agendamento.telefone,
        data: novaData,
        horario: novoHorario,
        status: "pendente",
        confirmado: false
      };

      const { data: novo, error: errorInsert } = await supabase
        .from("agendamentos")
        .insert([novoAgendamento])
        .select()
        .single();
      if (errorInsert) return res.status(500).json({ msg: "Erro ao criar novo agendamento" });
      novoAgendamentoFinal = novo;

      const doc = await accessSpreadsheet(cliente);
      const sheet = doc.sheetsByIndex[0];
      await ensureDynamicHeaders(sheet, Object.keys(novo));
      await sheet.addRow(novo);
    }

    res.json({ msg: "Reagendamento realizado com sucesso!", agendamento: novoAgendamentoFinal });

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- Cancelar ----------------
app.post("/cancelar/:cliente/:id", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { id } = req.params;
    const { data: agendamento, error: errorGet } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("id", id)
      .eq("cliente", cliente)
      .single();
    if (errorGet || !agendamento) return res.status(404).json({ msg: "Agendamento não encontrado" });

    const { data, error: errorUpdate } = await supabase
      .from("agendamentos")
      .update({ status: "cancelado" })
      .eq("id", id)
      .select()
      .single();
    if (errorUpdate) return res.status(500).json({ msg: "Erro ao cancelar agendamento" });

    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    const row = rows.find(r => r.id == id);
    if (row) {
      row.status = "cancelado";
      await row.save();
    }

    res.json({ msg: "Agendamento cancelado com sucesso!", agendamento: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
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

    const { data: agendamentos, error } = await supabase
      .from("agendamentos")
      .select("horario")
      .eq("cliente", cliente)
      .eq("data", req.params.data);
    if (error) return res.status(500).json({ msg: "Erro Supabase" });

    const ocupados = agendamentos.map(a => a.horario);
    res.json({ ocupados });
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
