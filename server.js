import express from "express";
import bodyParser from "body-parser";
import { GoogleSpreadsheet } from "google-spreadsheet";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Pega as variáveis de ambiente do Render
const SPREADSHEET_ID = process.env.ID_DA_PLANILHA;
const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

const doc = new GoogleSpreadsheet(SPREADSHEET_ID);

async function accessSpreadsheet() {
  try {
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
    console.log(`Planilha carregada: ${doc.title}`);
  } catch (error) {
    console.error("Erro ao acessar planilha:", error);
  }
}

// Rota de teste
app.get("/", async (req, res) => {
  await accessSpreadsheet();
  res.send("Servidor rodando e planilha acessada!");
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
