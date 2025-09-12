import express from "express";
import bodyParser from "body-parser";
import { GoogleSpreadsheet } from "google-spreadsheet";

// Pega variáveis de ambiente do Render
const SPREADSHEET_ID = process.env.ID_DA_PLANILHA;
const GOOGLE_SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT;

// Converte a string JSON da variável de ambiente em objeto
let creds;
try {
  creds = JSON.parse(GOOGLE_SERVICE_ACCOUNT);
} catch (e) {
  console.error("Erro ao parsear GOOGLE_SERVICE_ACCOUNT:", e);
  process.exit(1); // Encerra se JSON inválido
}

const doc = new GoogleSpreadsheet(SPREADSHEET_ID);

const app = express();
app.use(bodyParser.json());

async function accessSpreadsheet() {
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  return doc;
}

app.get("/", async (req, res) => {
  try {
    const doc = await accessSpreadsheet();
    res.send(`Planilha: ${doc.title}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao acessar a planilha");
  }
});

// Usa porta do Render ou 3000 por padrão
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
