import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { GoogleSpreadsheet } from "google-spreadsheet";

// Conta de serviço do Google
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
app.use(express.static(path.join(process.cwd(), "public")));

// Estrutura de clientes + planilhas
const clientes = {
  "cliente1": "ID_DA_PLANILHA_CLIENTE1",
  "cliente2": "ID_DA_PLANILHA_CLIENTE2"
};

// Função para acessar qualquer planilha
async function accessSpreadsheet(sheetId) {
  const doc = new GoogleSpreadsheet(sheetId);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  return doc;
}

// Garantir headers dinâmicos (Nome, Email, Telefone, Data, Horário)
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

// Rota para servir o formulário do cliente
app.get("/:cliente", (req, res) => {
  const cliente = req.params.cliente;
  if (!clientes[cliente]) return res.status(404).send("Cliente não encontrado");

  res.sendFile(path.join(process.cwd(), "public", "formulario.html"));
});

// Endpoint para receber agendamento
app.post("/agendar/:cliente", async (req, res) => {
  try {
    const cliente = req.params.cliente;
    const sheetId = clientes[cliente];
    if (!sheetId) return res.status(404).json({ msg: "Cliente não encontrado" });

    const data = req.body;

    // Garante que os campos principais existam mesmo se não vierem
    const defaultKeys = ["Nome", "Email", "Telefone", "Data", "Horario"];
    defaultKeys.forEach(k => { if (!data[k]) data[k] = ""; });

    const doc = await accessSpreadsheet(sheetId);
    const sheet = doc.sheetsByIndex[0];

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
