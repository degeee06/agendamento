import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { GoogleSpreadsheet } from "google-spreadsheet";

// ---------------- Variáveis ----------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

// ---------------- App ----------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------------- Supabase ----------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------- Mercado Pago ----------------
const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const mpPayment = new Payment(mpClient);

// ---------------- Google Sheets ----------------
let creds;
try {
  creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
} catch (e) {
  console.error("Erro ao parsear GOOGLE_SERVICE_ACCOUNT:", e);
  process.exit(1);
}

async function accessSpreadsheet(clienteId) {
  const { data, error } = await supabase
    .from("clientes")
    .select("spreadsheet_id")
    .eq("id", clienteId)
    .single();
  if (error || !data) throw new Error(`Cliente ${clienteId} não encontrado`);
  const doc = new GoogleSpreadsheet(data.spreadsheet_id);
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

// ---------------- Verifica disponibilidade ----------------
async function horarioDisponivel(cliente, data, horario, ignoreId = null) {
  let query = supabase
    .from("agendamentos")
    .select("*")
    .eq("cliente", cliente)
    .eq("data", data)
    .eq("horario", horario)
    .neq("status", "cancelado");

  if (ignoreId) query = query.neq("id", ignoreId);
  const { data: agendamentos, error } = await query;
  if (error) throw error;
  return agendamentos.length === 0;
}

// ---------------- Rotas ----------------
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));

app.get("/:cliente", async (req, res) => {
  const cliente = req.params.cliente;
  const { data, error } = await supabase.from("clientes").select("id").eq("id", cliente).single();
  if (error || !data) return res.status(404).send("Cliente não encontrado");
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ---------------- Cria PIX ----------------
app.post("/create-pix", async (req, res) => {
  const { amount, description, email } = req.body;
  if (!amount || !email) return res.status(400).json({ error: "Faltando dados" });

  try {
    const result = await mpPayment.create({
      body: {
        transaction_amount: Number(amount),
        description: description || "Pagamento VIP",
        payment_method_id: "pix",
        payer: { email },
      },
    });

    await supabase.from("pagamentos").upsert(
      [{ id: result.id, email, amount: Number(amount), status: "pending", valid_until: null }],
      { onConflict: ["id"] }
    );

    res.json({
      id: result.id,
      status: result.status,
      qr_code: result.point_of_interaction.transaction_data.qr_code,
      qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- Webhook Mercado Pago ----------------
app.post("/webhook", async (req, res) => {
  try {
    const paymentId = req.body?.data?.id || req.query["data.id"];
    if (!paymentId) return res.sendStatus(400);

    const paymentDetails = await mpPayment.get({ id: paymentId });
    const status = paymentDetails.status;
    let valid_until = null;

    if (["approved", "paid"].includes(status.toLowerCase())) {
      const vipExpires = new Date();
      vipExpires.setDate(vipExpires.getDate() + 30);
      valid_until = vipExpires.toISOString();
    }

    const { error: updateError } = await supabase
      .from("pagamentos")
      .update({ status, valid_until })
      .eq("id", paymentId);

    if (updateError) console.error("Erro ao atualizar Supabase:", updateError.message);
    else console.log(`Pagamento ${paymentId} atualizado: status=${status}`);
    res.sendStatus(200);
  } catch (err) {
    console.error("Erro no webhook:", err.message);
    res.sendStatus(500);
  }
});

// ---------------- Checa VIP ----------------
async function checkVip(email) {
  const now = new Date();
  const { data, error } = await supabase
    .from("pagamentos")
    .select("valid_until")
    .eq("email", email.toLowerCase().trim())
    .eq("status", "approved")
    .gt("valid_until", now.toISOString())
    .order("valid_until", { ascending: false })
    .limit(1)
    .single();

  return !!data;
}

// ---------------- Agendar ----------------
app.post("/agendar/:cliente", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { Nome, Email, Telefone, Data, Horario } = req.body;
    if (!Nome || !Email || !Telefone || !Data || !Horario)
      return res.status(400).json({ msg: "Todos os campos obrigatórios" });

    const emailNormalizado = Email.toLowerCase().trim();
    const dataNormalizada = new Date(Data).toISOString().split("T")[0];

    // 🔹 Checa VIP
    const isVip = await checkVip(emailNormalizado);

    // 🔹 Checa limite free (3 agendamentos)
if (!isVip) {
  const { data: agendamentosHoje, error } = await supabase
    .from("agendamentos")
    .select("id")
    .eq("cliente", cliente)
    .eq("data", dataNormalizada)
    .eq("email", emailNormalizado)
    .in("status", ["pendente", "confirmado"]);

  if (error) {
    console.error("Erro ao consultar agendamentos do usuário:", error);
    return res.status(500).json({ msg: "Erro ao validar limite" });
  }

  const totalAgendamentos = agendamentosHoje ? agendamentosHoje.length : 0;

  if (totalAgendamentos >= 3) {
    return res.status(402).json({
      msg: "Você atingiu o limite de 3 agendamentos por dia. Efetue o pagamento VIP para continuar.",
    });
  }
}


    // 🔹 Checa se horário está disponível
    const livre = await horarioDisponivel(cliente, dataNormalizada, Horario);
    if (!livre) return res.status(400).json({ msg: "Horário indisponível" });

    // 🔹 Remove agendamento cancelado no mesmo horário
    await supabase
      .from("agendamentos")
      .delete()
      .eq("cliente", cliente)
      .eq("data", dataNormalizada)
      .eq("horario", Horario)
      .eq("status", "cancelado");

    // 🔹 Insere novo agendamento
    const { data: novoAgendamento, error: insertError } = await supabase
      .from("agendamentos")
      .insert([
        {
          cliente,
          nome: Nome,
          email: emailNormalizado,
          telefone: Telefone,
          data: dataNormalizada,
          horario: Horario,
          status: isVip ? "confirmado" : "pendente",
          confirmado: isVip,
        },
      ])
      .select()
      .single();

    if (insertError) return res.status(500).json({ msg: "Erro ao salvar agendamento" });

    // 🔹 Salva no Google Sheets
    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(novoAgendamento));
    await sheet.addRow(novoAgendamento);

    res.json({ msg: "Agendamento realizado com sucesso!", agendamento: novoAgendamento });
  } catch (err) {
    console.error("Erro no /agendar:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});
// ---------------- Função auxiliar para atualizar linha no Sheets ----------------
async function updateRowInSheet(sheet, rowId, updatedData) {
  await sheet.loadHeaderRow();
  await sheet.loadCells(); // Carrega células
  const rows = await sheet.getRows();
  const row = rows.find(r => r.id === rowId); // Assume que 'id' é coluna no Sheets
  if (row) {
    Object.keys(updatedData).forEach(key => {
      if (sheet.headerValues.includes(key)) {
        row[key] = updatedData[key];
      }
    });
    await row.save();
  } else {
    // Se não existir, adiciona como nova linha
    await ensureDynamicHeaders(sheet, Object.keys(updatedData));
    await sheet.addRow(updatedData);
  }
}

// ---------------- Confirmar agendamento ----------------
app.post("/agendamentos/:cliente/confirmar/:id", authMiddleware, async (req, res) => {
  try {
    const { cliente, id } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { data, error } = await supabase
      .from("agendamentos")
      .update({ confirmado: true, status: "confirmado" })
      .eq("id", id)
      .eq("cliente", cliente)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ msg: "Agendamento não encontrado" });

    // Atualiza Google Sheets
    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await updateRowInSheet(sheet, id, data);

    res.json({ msg: "Agendamento confirmado", agendamento: data });
  } catch (err) {
    console.error("Erro ao confirmar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- Cancelar agendamento ----------------
app.post("/agendamentos/:cliente/cancelar/:id", authMiddleware, async (req, res) => {
  try {
    const { cliente, id } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { data, error } = await supabase
      .from("agendamentos")
      .update({ status: "cancelado", confirmado: false })
      .eq("id", id)
      .eq("cliente", cliente)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ msg: "Agendamento não encontrado" });

    // Atualiza Google Sheets
    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await updateRowInSheet(sheet, id, data);

    res.json({ msg: "Agendamento cancelado", agendamento: data });
  } catch (err) {
    console.error("Erro ao cancelar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- Reagendar agendamento ----------------
app.post("/agendamentos/:cliente/reagendar/:id", authMiddleware, async (req, res) => {
  try {
    const { cliente, id } = req.params;
    const { novaData, novoHorario } = req.body;

    if (!novaData || !novoHorario) return res.status(400).json({ msg: "Data e horário obrigatórios" });
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    // Verifica se horário está disponível
    const disponivel = await horarioDisponivel(cliente, novaData, novoHorario, id);
    if (!disponivel) return res.status(400).json({ msg: "Horário indisponível" });

    // Atualiza agendamento
    const { data, error } = await supabase
      .from("agendamentos")
      .update({ data: novaData, horario: novoHorario })
      .eq("id", id)
      .eq("cliente", cliente)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ msg: "Agendamento não encontrado" });

    // Atualiza Google Sheets
    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await updateRowInSheet(sheet, id, data);

    res.json({ msg: "Agendamento reagendado com sucesso", agendamento: data });
  } catch (err) {
    console.error("Erro ao reagendar agendamento:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- Servidor ----------------
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

