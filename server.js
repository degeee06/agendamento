const express = require("express");
const bodyParser = require("body-parser");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(bodyParser.json());

// Caminho do JSON de credenciais do Google Service Account
const CREDENTIALS_PATH = path.join(__dirname, "service-account.json");

// Função para acessar a planilha
async function accessSpreadsheet() {
    const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
    const doc = new GoogleSpreadsheet("SEU_SPREADSHEET_ID_AQUI");
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
    return doc;
}

// Rota de teste
app.get("/", async (req, res) => {
    try {
        const doc = await accessSpreadsheet();
        res.send(`Planilha carregada: ${doc.title}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Erro ao acessar planilha");
    }
});

// Rota para agendar (exemplo)
app.post("/agendar", async (req, res) => {
    const { nome, email } = req.body;
    if (!nome || !email) return res.status(400).send("Dados incompletos");

    try {
        const doc = await accessSpreadsheet();
        const sheet = doc.sheetsByIndex[0]; // primeira aba
        await sheet.addRow({ Nome: nome, Email: email });
        res.send("Agendamento registrado!");
    } catch (err) {
        console.error(err);
        res.status(500).send("Erro ao registrar agendamento");
    }
});

// Inicia servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
