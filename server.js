import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { GoogleSpreadsheet } from "google-spreadsheet";

// Variáveis do Render
const SPREADSHEET_ID = process.env.ID_DA_PLANILHA;
const GOOGLE_SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT;

// Parse JSON da conta de serviço
let creds;
try {
  creds = JSON.parse(GOOGLE_SERVICE_ACCOUNT);
} catch (e) {
  console.error("Erro ao parsear GOOGLE_SERVICE_ACCOUNT:", e);
  process.exit(1);
}

const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
const app = express();

app.use(bodyParser.json());

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(process.cwd(), "public")));

async function accessSpreadsheet() {
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  return doc;
}
async function accessSpreadsheet() {
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0]; // primeira aba

  // Cabeçalho automático se estiver vazio
  if (!sheet.headerValues || sheet.headerValues.length === 0) {
    const defaultHeaders = ["nome", "email", "data", "hora"];
    await sheet.setHeaderRow(defaultHeaders);
    console.log("Cabeçalho criado automaticamente:", defaultHeaders);
  }

  return doc;
}

// Endpoint de teste (opcional)
app.get("/planilha", async (req, res) => {
  try {
    const doc = await accessSpreadsheet();
    res.send(`Planilha: ${doc.title}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao acessar a planilha");
  }
});

// Endpoint para receber agendamentos do formulário
app.post("/agendar", async (req, res) => {
  try {
    const doc = await accessSpreadsheet();
    const sheet = doc.sheetsByIndex[0]; // primeira aba
    await sheet.addRow(req.body);
    res.json({ msg: "✅ Agendamento realizado com sucesso!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "❌ Erro ao realizar agendamento" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
