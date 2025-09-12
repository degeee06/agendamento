const express = require("express");
const bodyParser = require("body-parser");
const { GoogleSpreadsheet } = require("google-spreadsheet");

const app = express();
app.use(bodyParser.json());

// Carrega variáveis do Render
const SHEET_ID = process.env.ID_DA_PLANILHA;
const CREDS = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

// Configura a planilha
const doc = new GoogleSpreadsheet(SHEET_ID);

async function connectToSheet() {
  await doc.useServiceAccountAuth({
    client_email: CREDS.client_email,
    private_key: CREDS.private_key,
  });
  await doc.loadInfo();
  console.log("✅ Conectado à planilha:", doc.title);
}
await connectToSheet();

// Seleciona a primeira aba da planilha
const sheet = doc.sheetsByIndex[0];

// Rota de agendamento
app.post("/agendar", async (req, res) => {
  try {
    const { nome, email, data, hora } = req.body;

    // Verifica se o horário já está ocupado
    const rows = await sheet.getRows();
    const ocupado = rows.find(
      (r) => r.data === data && r.hora === hora
    );
    if (ocupado) {
      return res.json({ msg: "❌ Horário já reservado!" });
    }

    // Adiciona novo agendamento
    await sheet.addRow({ nome, email, data, hora });
    res.json({ msg: "✅ Agendamento confirmado!" });
  } catch (err) {
    console.error("Erro ao agendar:", err);
    res.status(500).json({ msg: "Erro no servidor" });
  }
});

// Página inicial simples
app.get("/", (req, res) => {
  res.send("<h1>📅 API de Agendamento rodando!</h1><p>Use POST /agendar</p>");
});

// Porta para Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Servidor rodando na porta ${PORT}`)
);

