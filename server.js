import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { GoogleSpreadsheet } from "google-spreadsheet";

// Variável da conta de serviço
const GOOGLE_SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT;

// Parse JSON da conta de serviço
let creds;
try {
  creds = JSON.parse(GOOGLE_SERVICE_ACCOUNT);
} catch (e) {
  console.error("Erro ao parsear GOOGLE_SERVICE_ACCOUNT:", e);
  process.exit(1);
}

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(process.cwd(), "public")));

// Função para acessar qualquer planilha pelo ID
async function accessSpreadsheet(sheetId) {
  const doc = new GoogleSpreadsheet(sheetId);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  return doc;
}

// Função para garantir headers dinâmicos e manter ordem de registro
async function ensureDynamicHeaders(sheet, newKeys) {
  await sheet.loadHeaderRow();
  const currentHeaders = sheet.headerValues || [];
  const headersToAdd = newKeys.filter((key) => !currentHeaders.includes(key));

  if (headersToAdd.length > 0) {
    const updatedHeaders = [...currentHeaders, ...headersToAdd];
    await sheet.setHeaderRow(updatedHeaders);
    console.log("Cabeçalhos atualizados na ordem de registro:", updatedHeaders);
  }
}

// Endpoint de teste para verificar título da planilha
app.get("/planilha/:sheetId", async (req, res) => {
  try {
    const doc = await accessSpreadsheet(req.params.sheetId);
    res.send(`Planilha: ${doc.title}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao acessar a planilha");
  }
});

// Endpoint para receber agendamentos
app.post("/agendar", async (req, res) => {
  try {
    const { sheetId, ...data } = req.body;

    if (!sheetId) {
      return res.status(400).json({ msg: "❌ sheetId é obrigatório" });
    }

    const doc = await accessSpreadsheet(sheetId);
    const sheet = doc.sheetsByIndex[0]; // primeira aba

    // Garantir headers dinâmicos
    const keys = Object.keys(data);
    await ensureDynamicHeaders(sheet, keys);

    await sheet.addRow(data);
    res.json({ msg: "✅ Agendamento realizado com sucesso!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "❌ Erro ao realizar agendamento" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
