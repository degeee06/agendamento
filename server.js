import express from "express";
import bodyParser from "body-parser";
import { GoogleSpreadsheet } from "google-spreadsheet";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Inicializa o Google Spreadsheet usando variável de ambiente
const SPREADSHEET_ID = "SEU_SPREADSHEET_ID_AQUI"; // Substitua pelo ID real
const creds = JSON.parse(process.env.GOOGLE_CREDS); // Aqui pega do Render

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

// Exemplo de rota
app.get("/", async (req, res) => {
  await accessSpreadsheet();
  res.send("Servidor rodando e planilha acessada!");
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
