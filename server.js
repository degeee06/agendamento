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
  cliente1: process.env.11Hrgpo21LxBLn6Esoiwz0gDk5j_HAxBuLARfo59s-RA,
  cliente2: process.env.ID_PLANILHA_CLIENTE2
};

// Lista de clientes válidos
const clientesValidos = Object.keys(planilhasClientes);

// Google Service Account
const GOOGLE_SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT;
let creds;
try {
  creds = JSON.parse(GOOGLE_SERVICE_ACCOUNT);
} catch (e) {
  console.error("Erro ao parsear GOOGLE_SERVICE_ACCOUNT:", e);
  process.exit(1);
}

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Funções Google Sheets
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

// Verifica se horário está disponível
async function horarioDisponivel(cliente, data, horario) {
  const { data: agendamentos, error } = await supabase
    .from("agendamentos")
    .select("*")
    .eq("cliente", cliente)
    .eq("data", data)
    .eq("horario", horario);

  if (error) throw error;
  return agendamentos.length === 0; // true se livre
}

// Rota dinâmica para servir index.html
app.get("/:cliente", (req, res) => {
  const cliente = req.params.cliente;
  if (!clientesValidos.includes(cliente)) {
    return res.status(404).send("Cliente não encontrado");
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Endpoint para agendar
app.post("/agendar/:cliente", async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (!clientesValidos.includes(cliente)) {
      return res.status(400).json({ msg: "Cliente inválido" });
    }

    const { Nome, Email, Telefone, Data, Horario } = req.body;
    if (!Nome || !Email || !Telefone || !Data || !Horario) {
      return res.status(400).json({ msg: "Todos os campos são obrigatórios" });
    }

    // Verifica disponibilidade
    const livre = await horarioDisponivel(cliente, Data, Horario);
    if (!livre) return res.status(400).json({ msg: "Horário indisponível" });

    const registro = { cliente, Nome, Email, Telefone, Data, Horario };

    // Salva no Google Sheets
    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(registro));
    await sheet.addRow(registro);

    // Salva no Supabase
    const { error } = await supabase
      .from("agendamentos")
      .insert([registro]);
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

// Endpoint para checar horários ocupados
app.get("/disponiveis/:cliente/:data", async (req, res) => {
  try {
    const { cliente, data } = req.params;
    if (!clientesValidos.includes(cliente)) {
      return res.status(400).json({ msg: "Cliente inválido" });
    }

    const { data: agendamentos, error } = await supabase
      .from("agendamentos")
      .select("horario")
      .eq("cliente", cliente)
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

