import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { GoogleSpreadsheet } from "google-spreadsheet";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const mpPayment = new Payment(mpClient);

let creds;
try { creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } 
catch (e) { console.error(e); process.exit(1); }

async function accessSpreadsheet(clienteId) {
  const { data } = await supabase.from("clientes").select("spreadsheet_id").eq("id", clienteId).single();
  const doc = new GoogleSpreadsheet(data.spreadsheet_id);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  return doc;
}

async function ensureDynamicHeaders(sheet, newKeys) {
  await sheet.loadHeaderRow().catch(() => sheet.setHeaderRow(newKeys));
  const headersToAdd = newKeys.filter(k => !sheet.headerValues.includes(k));
  if (headersToAdd.length) await sheet.setHeaderRow([...sheet.headerValues, ...headersToAdd]);
}

async function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ msg: "Token não enviado" });
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return res.status(401).json({ msg: "Token inválido" });
  req.user = data.user;
  req.clienteId = data.user.user_metadata.cliente_id;
  if (!req.clienteId) return res.status(403).json({ msg: "Usuário sem cliente_id" });
  next();
}

async function horarioDisponivel(cliente, data, horario, ignoreId = null) {
  let query = supabase.from("agendamentos")
    .select("*").eq("cliente", cliente).eq("data", data).eq("horario", horario)
    .neq("status", "cancelado");
  if (ignoreId) query = query.neq("id", ignoreId);
  const { data: agendamentos } = await query;
  return agendamentos.length === 0;
}

async function checkVip(email) {
  try {
    const { data } = await supabase.from("pagamentos")
      .select("status, valid_until")
      .eq("email", email.toLowerCase().trim())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    return ["approved","paid"].includes(data.status.toLowerCase()) && new Date(data.valid_until) > new Date();
  } catch { return false; }
}

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));
app.get("/:cliente", async (req, res) => {
  const { data } = await supabase.from("clientes").select("id").eq("id", req.params.cliente).single();
  if (!data) return res.status(404).send("Cliente não encontrado");
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.post("/agendar/:cliente", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { Nome, Email, Telefone, Data, Horario } = req.body;
    if (!Nome || !Email || !Telefone || !Data || !Horario) return res.status(400).json({ msg: "Todos os campos obrigatórios" });

    const emailNormalizado = Email.toLowerCase().trim();
    const dataNormalizada = new Date(Data).toISOString().split("T")[0];
    const isVip = await checkVip(emailNormalizado);

    if (!isVip) {
      const { data: agendamentosHoje } = await supabase.from("agendamentos")
        .select("id").eq("cliente", cliente).eq("data", dataNormalizada)
        .eq("email", emailNormalizado).in("status", ["pendente", "confirmado"]);
      if ((agendamentosHoje?.length || 0) >= 3) return res.status(402).json({ msg: "Limite atingido. Pague VIP.", needPayment: true });
    }

    if (!await horarioDisponivel(cliente, dataNormalizada, Horario)) return res.status(400).json({ msg: "Horário indisponível" });

    await supabase.from("agendamentos").delete()
      .eq("cliente", cliente).eq("data", dataNormalizada)
      .eq("horario", Horario).eq("status", "cancelado");

    const { data: novoAgendamento } = await supabase.from("agendamentos")
      .insert([{ cliente, nome: Nome, email: emailNormalizado, telefone: Telefone,
                 data: dataNormalizada, horario: Horario, status: isVip?"confirmado":"pendente",
                 confirmado: isVip }]).select().single();

    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(novoAgendamento));
    await sheet.addRow(novoAgendamento);

    res.json({ msg: "Agendamento realizado!", agendamento: novoAgendamento });
  } catch (err) { console.error(err); res.status(500).json({ msg: "Erro interno" }); }
});

app.post("/create-pix", async (req, res) => {
  try {
    const { email, amount = 10.0, description = "Assinatura VIP ilimitada" } = req.body;
    if (!email) return res.status(400).json({ msg: "Email obrigatório" });

    const emailNormalizado = email.toLowerCase().trim();
    const result = await mpPayment.create({
      body: { transaction_amount: Number(amount), description, payment_method_id: "pix", payer: { email: emailNormalizado } }
    });

    await supabase.from("pagamentos").upsert(
      [{ id: result.id, email: emailNormalizado, amount: Number(amount), status: "pending" }],
      { onConflict: ["id"] }
    );

    res.json({
      id: result.id,
      qr_code: result.point_of_interaction.transaction_data.qr_code,
      qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64
    });
  } catch (err) { console.error(err); res.status(500).json({ msg: "Erro interno" }); }
});

app.post("/webhook", async (req, res) => {
  try {
    const paymentId = req.body?.data?.id || req.query["data.id"];
    if (!paymentId) return res.sendStatus(400);

    const paymentDetails = await mpPayment.get({ id: paymentId });
    const status = paymentDetails.status;
    let valid_until = null;

    if (["approved","paid"].includes(status.toLowerCase())) {
      const vipExpires = new Date(); vipExpires.setDate(vipExpires.getDate()+30); valid_until = vipExpires.toISOString();
      const { data: pagamento } = await supabase.from("pagamentos").select("email").eq("id", paymentId).single();
      if (pagamento?.email) await supabase.from("clientes").update({ is_vip:true, vip_valid_until:valid_until }).eq("email", pagamento.email);
    }

    await supabase.from("pagamentos").update({ status, valid_until }).eq("id", paymentId);
    res.sendStatus(200);
  } catch (err) { console.error(err); res.sendStatus(500); }
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
