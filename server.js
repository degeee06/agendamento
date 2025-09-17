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

// ---------------- Rotas Frontend ----------------
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));
app.get("/:cliente", async (req, res) => {
  const cliente = req.params.cliente;
  const { data, error } = await supabase.from("clientes").select("id").eq("id", cliente).single();
  if (error || !data) return res.status(404).send("Cliente não encontrado");
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ---------------- Função VIP ----------------
async function checkVip(email) {
  try {
    const { data, error } = await supabase
      .from("pagamentos")
      .select("status, valid_until")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return false;

    return (["approved", "paid"].includes(data.status.toLowerCase())) &&
           data.valid_until && new Date(data.valid_until) > new Date();
  } catch (e) {
    console.error("Erro ao verificar VIP:", e);
    return false;
  }
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

    const isVip = await checkVip(emailNormalizado);

    if (!isVip) {
      const { data: agendamentosHoje, error } = await supabase
        .from("agendamentos")
        .select("id")
        .eq("cliente", cliente)
        .eq("data", dataNormalizada)
        .eq("email", emailNormalizado)
        .in("status", ["pendente", "confirmado"]);

      if (error) return res.status(500).json({ msg: "Erro interno ao validar limite" });
      if ((agendamentosHoje?.length || 0) >= 3)
        return res.status(402).json({ 
          msg: "Você atingiu o limite de 3 agendamentos. Efetue o pagamento VIP para desbloquear ilimitado.",
          needPayment: true
        });
    }

    const livre = await horarioDisponivel(cliente, dataNormalizada, Horario);
    if (!livre) return res.status(400).json({ msg: "Horário indisponível" });

    await supabase
      .from("agendamentos")
      .delete()
      .eq("cliente", cliente)
      .eq("data", dataNormalizada)
      .eq("horario", Horario)
      .eq("status", "cancelado");

    const { data: novoAgendamento, error: insertError } = await supabase
      .from("agendamentos")
      .insert([{
        cliente,
        nome: Nome,
        email: emailNormalizado,
        telefone: Telefone,
        data: dataNormalizada,
        horario: Horario,
        status: isVip ? "confirmado" : "pendente",
        confirmado: isVip,
      }])
      .select()
      .single();

    if (insertError) return res.status(500).json({ msg: "Erro ao salvar agendamento" });

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

// ---------------- Confirmar ----------------
app.post("/confirmar/:cliente/:id", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    const { id } = req.params;

    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { data, error } = await supabase
      .from("agendamentos")
      .update({ status: "confirmado", confirmado: true })
      .eq("id", id)
      .eq("cliente", cliente)
      .select()
      .single();

    if (error) return res.status(500).json({ msg: "Erro ao confirmar agendamento" });
    if (!data) return res.status(404).json({ msg: "Agendamento não encontrado" });

    // Normaliza data para manter sheets consistentes
    data.email = data.email?.toLowerCase().trim();
    data.data = new Date(data.data).toISOString().split("T")[0];

    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(data));
    const rows = await sheet.getRows();
    const row = rows.find(r => r.id === data.id);
    if (row) {
      row.status = "confirmado";
      row.confirmado = true;
      await row.save();
    } else {
      await sheet.addRow(data);
    }

    res.json({ msg: "Agendamento confirmado!", agendamento: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
  }
});


// ---------------- Cancelar ----------------
app.post("/cancelar/:cliente/:id", authMiddleware, async (req, res) => {
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

    if (error) return res.status(500).json({ msg: "Erro ao cancelar agendamento" });
    if (!data) return res.status(404).json({ msg: "Agendamento não encontrado" });

    // Normaliza data/email
    data.email = data.email?.toLowerCase().trim();
    data.data = new Date(data.data).toISOString().split("T")[0];

    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(data));
    const rows = await sheet.getRows();
    const row = rows.find(r => r.id == data.id);
    if (row) {
      row.status = "cancelado";
      row.confirmado = false;
      await row.save();
    } else {
      await sheet.addRow(data);
    }

    res.json({ msg: "Agendamento cancelado!", agendamento: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno ao cancelar" });
  }
});


// ---------------- Reagendar ----------------
app.post("/reagendar/:cliente/:id", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    const { id } = req.params;
    const { novaData, novoHorario } = req.body;

    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });
    if (!novaData || !novoHorario) return res.status(400).json({ msg: "Nova data e horário obrigatórios" });

    const { data: agendamento, error: errorGet } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("id", id)
      .eq("cliente", cliente)
      .single();

    if (errorGet || !agendamento) return res.status(404).json({ msg: "Agendamento não encontrado" });

    // Normaliza data
    const dataNormalizada = new Date(novaData).toISOString().split("T")[0];

    // Checa se novo horário está livre
    const livre = await horarioDisponivel(cliente, dataNormalizada, novoHorario, id);
    if (!livre) return res.status(400).json({ msg: "Horário indisponível" });

    const { data: novo, error: errorUpdate } = await supabase
      .from("agendamentos")
      .update({
        data: dataNormalizada,
        horario: novoHorario,
        status: "pendente",
        confirmado: false
      })
      .eq("id", id)
      .select()
      .single();

    if (errorUpdate) return res.status(500).json({ msg: "Erro ao reagendar" });

    // Normaliza email também
    novo.email = novo.email?.toLowerCase().trim();

    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(novo));
    const rows = await sheet.getRows();
    const row = rows.find(r => r.id === novo.id);
    if (row) {
      row.data = novo.data;
      row.horario = novo.horario;
      row.status = novo.status;
      row.confirmado = novo.confirmado;
      await row.save();
    } else {
      await sheet.addRow(novo);
    }

    res.json({ msg: "Reagendamento realizado com sucesso!", agendamento: novo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- Listar ----------------
app.get("/meus-agendamentos/:cliente", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { data, error } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente);
    if (error) return res.status(500).json({ msg: "Erro Supabase" });

    res.json({ agendamentos: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
  }
});
// ---------------- Criar PIX ----------------
app.post("/create-pix", authMiddleware, async (req, res) => {
  try {
    const { email, amount = 10.0, description = "Assinatura VIP ilimitada" } = req.body;
    if (!email) return res.status(400).json({ msg: "Email obrigatório" });

    const emailNormalizado = email.toLowerCase().trim();
    const result = await mpPayment.create({
      body: {
        transaction_amount: Number(amount),
        description,
        payment_method_id: "pix",
        payer: { email: emailNormalizado },
      },
    });

    await supabase.from("pagamentos").upsert(
      [{ id: result.id, email: emailNormalizado, amount: Number(amount), status: "pending" }],
      { onConflict: ["id"] }
    );

    res.json({
      msg: "Pagamento PIX criado",
      id: result.id,
      qr_code: result.point_of_interaction.transaction_data.qr_code,
      qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64,
    });
  } catch (err) {
    console.error("Erro ao criar PIX:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- Webhook PIX (Produção) ----------------
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

      const { data: pagamento } = await supabase
        .from("pagamentos")
        .select("email")
        .eq("id", paymentId)
        .single();

      if (pagamento?.email) {
        const { error } = await supabase
          .from("clientes")
          .update({ is_vip: true, vip_valid_until: valid_until })
          .eq("email", pagamento.email);

        if (error) console.error("Erro ao atualizar VIP:", error.message);
        else console.log(`Cliente ${pagamento.email} agora é VIP até ${valid_until}`);
      }
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

// ---------------- Servidor ----------------
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
