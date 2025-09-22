import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { GoogleSpreadsheet } from "google-spreadsheet";
import crypto from "crypto";

// ---------------- Config ----------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------------- Supabase ----------------
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

async function updateRowInSheet(sheet, rowId, updatedData) {
  await sheet.loadHeaderRow();
  const rows = await sheet.getRows();
  const row = rows.find(r => r.id === rowId);
  if (row) {
    Object.keys(updatedData).forEach(key => {
      if (sheet.headerValues.includes(key)) row[key] = updatedData[key];
    });
    await row.save();
  } else {
    await ensureDynamicHeaders(sheet, Object.keys(updatedData));
    await sheet.addRow(updatedData);
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

// ---------------- Horário Disponível ----------------
async function horarioDisponivel(cliente, data, horario, ignoreId = null) {
  let query = supabase
    .from("agendamentos")
    .select("*")
    .eq("cliente", cliente)
    .eq("data", data)
    .eq("horario", horario)
    .neq("status", "cancelado");

  if (ignoreId) query = query.neq("id", ignoreId);
  const { data: agendamentos } = await query;
  return agendamentos.length === 0;
}

// ---------------- Links PIX ----------------
function generateToken(length = 32) {
  return crypto.randomBytes(length).toString("hex");
}

async function generatePaymentLink(agendamento_id, expirationHours = 24) {
  const token = generateToken();
  const expira_em = new Date(Date.now() + expirationHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase.from("confirmacao_links")
    .insert([{ agendamento_id, token, expira_em, utilizado: false }])
    .select()
    .single();

  if (error) throw error;

  return {
    link: `${process.env.FRONTEND_URL}/pagamento/${token}`,
    token: data.token,
    expira_em: data.expira_em
  };
}

async function validateLink(token) {
  const { data, error } = await supabase.from("confirmacao_links")
    .select("*")
    .eq("token", token)
    .single();

  if (error || !data) return false;
  if (data.utilizado) return false;
  if (new Date(data.expira_em) < new Date()) return false;
  return true;
}

async function markLinkAsUsed(token) {
  const { data, error } = await supabase.from("confirmacao_links")
    .update({ utilizado: true, updated_at: new Date().toISOString() })
    .eq("token", token)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getLinkData(token) {
  const { data } = await supabase.from("confirmacao_links")
    .select("*")
    .eq("token", token)
    .single();

  if (!data || data.utilizado || new Date(data.expira_em) < new Date()) return null;
  return data;
}

async function deleteExpiredLinks() {
  const { error } = await supabase.from("confirmacao_links")
    .delete()
    .lt("expira_em", new Date().toISOString());
  if (error) console.error("Erro ao deletar links expirados:", error);
}

// ---------------- Serviço PIX (exemplo) ----------------
async function createPixPayment({ amount, description, email }) {
  // Substitua aqui pela sua integração real com PIX
  return {
    qr_code: "https://pix-qrcode-url.com",
    pix_copia_cola: "000201...123456",
    amount
  };
}

// ---------------- Limpeza Automática ----------------
async function limparAgendamentosExpirados() {
  try {
    await deleteExpiredLinks();

    const quinzeMinutosAtras = new Date(Date.now() - 15 * 60 * 1000);
    const { data: agendamentosExpirados } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("status", "pendente")
      .lt("created_at", quinzeMinutosAtras.toISOString());

    for (const agendamento of agendamentosExpirados || []) {
      await supabase
        .from("agendamentos")
        .update({ status: "cancelado", confirmado: false })
        .eq("id", agendamento.id);

      try {
        const doc = await accessSpreadsheet(agendamento.cliente);
        await updateRowInSheet(doc.sheetsByIndex[0], agendamento.id, { status: "cancelado", confirmado: false });
      } catch (sheetError) {
        console.error("Erro ao atualizar Google Sheets:", sheetError);
      }
    }
  } catch (err) {
    console.error("Erro na limpeza de agendamentos expirados:", err);
  }
}

// ---------------- Rotas ----------------

// Página inicial
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));
// Rota de cliente
app.get("/:cliente", async (req, res) => {
  const cliente = req.params.cliente;
  const { data, error } = await supabase.from("clientes").select("id").eq("id", cliente).single();
  if (error || !data) return res.status(404).send("Cliente não encontrado");
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// Agendar
app.post("/agendar/:cliente", authMiddleware, async (req, res) => {
  try {
    const { cliente } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { Nome, Email, Telefone, Data, Horario, Valor } = req.body;
    if (!Nome || !Email || !Telefone || !Data || !Horario)
      return res.status(400).json({ msg: "Todos os campos obrigatórios" });

    const emailNormalizado = Email.toLowerCase().trim();
    const dataNormalizada = new Date(Data).toISOString().split("T")[0];

    const disponivel = await horarioDisponivel(cliente, dataNormalizada, Horario);
    if (!disponivel) return res.status(400).json({ msg: "Horário indisponível" });

    const { data: novoAgendamento, error } = await supabase
      .from("agendamentos")
      .insert([{
        cliente,
        nome: Nome,
        email: emailNormalizado,
        telefone: Telefone,
        data: dataNormalizada,
        horario: Horario,
        valor: Valor || 0,
        status: "pendente",
        confirmado: false,
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ msg: "Erro ao criar agendamento" });

    try {
      const doc = await accessSpreadsheet(cliente);
      const sheet = doc.sheetsByIndex[0];
      await ensureDynamicHeaders(sheet, Object.keys(novoAgendamento));
      await sheet.addRow(novoAgendamento);
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    res.json({ msg: "Agendamento realizado com sucesso!", agendamento: novoAgendamento });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// Confirmar
app.post("/agendamentos/:cliente/confirmar/:id", authMiddleware, async (req,res)=>{
  try {
    const { cliente, id } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({msg:"Acesso negado"});

    const { data, error } = await supabase.from("agendamentos")
      .update({confirmado:true,status:"confirmado"})
      .eq("id",id).eq("cliente",cliente).select().single();

    if (error) throw error;

    try {
      const doc = await accessSpreadsheet(cliente);
      await updateRowInSheet(doc.sheetsByIndex[0], id, data);
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    res.json({msg:"Agendamento confirmado", agendamento:data});
  } catch (error) {
    console.error(error);
    res.status(500).json({msg:"Erro interno"});
  }
});

// Cancelar
app.post("/agendamentos/:cliente/cancelar/:id", authMiddleware, async (req,res)=>{
  try {
    const { cliente, id } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({msg:"Acesso negado"});

    const { data, error } = await supabase.from("agendamentos")
      .update({status:"cancelado", confirmado:false})
      .eq("id",id).eq("cliente",cliente).select().single();

    if (error) throw error;

    try {
      const doc = await accessSpreadsheet(cliente);
      await updateRowInSheet(doc.sheetsByIndex[0], id, data);
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    res.json({msg:"Agendamento cancelado", agendamento:data});
  } catch (error) {
    console.error(error);
    res.status(500).json({msg:"Erro interno"});
  }
});

// Reagendar
app.post("/agendamentos/:cliente/reagendar/:id", authMiddleware, async (req,res)=>{
  try {
    const { cliente, id } = req.params;
    const { novaData, novoHorario } = req.body;
    if (!novaData || !novoHorario) return res.status(400).json({msg:"Data e horário obrigatórios"});
    if (req.clienteId !== cliente) return res.status(403).json({msg:"Acesso negado"});

    const disponivel = await horarioDisponivel(cliente, novaData, novoHorario, id);
    if(!disponivel) return res.status(400).json({msg:"Horário indisponível"});

    const { data, error } = await supabase.from("agendamentos")
      .update({
        data: novaData, 
        horario: novoHorario,
        status: "pendente",
        confirmado: false
      })
      .eq("id", id)
      .eq("cliente", cliente)
      .select()
      .single();

    if (error) throw error;

    try {
      const doc = await accessSpreadsheet(cliente);
      await updateRowInSheet(doc.sheetsByIndex[0], id, data);
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    res.json({msg:"Agendamento reagendado com sucesso", agendamento:data});
  } catch (error) {
    console.error(error);
    res.status(500).json({msg:"Erro interno"});
  }
});

// ---------------- PIX ----------------
app.post("/pix/gerar-link/:id", authMiddleware, async (req,res)=>{
  try {
    const { id } = req.params;
    const link = await generatePaymentLink(id);
    res.json(link);
  } catch(err) {
    console.error(err);
    res.status(500).json({msg:"Erro ao gerar link PIX"});
  }
});

app.get("/pix/:token", async (req,res)=>{
  try {
    const { token } = req.params;
    const valid = await validateLink(token);
    if(!valid) return res.status(404).json({msg:"Link inválido ou expirado"});

    const linkData = await getLinkData(token);
    const { data: agendamento } = await supabase.from("agendamentos")
      .select("*").eq("id", linkData.agendamento_id).single();

    const pixData = await createPixPayment({ amount: agendamento.valor || 0, description:"Pagamento Agendamento", email:agendamento.email });
    res.json({agendamento, pix:pixData});
  } catch(err) {
    console.error(err);
    res.status(500).json({msg:"Erro interno"});
  }
});

app.post("/pix/confirmar", async (req,res)=>{
  try {
    const { token } = req.body;
    const linkData = await getLinkData(token);
    if(!linkData) return res.status(400).json({msg:"Link inválido ou expirado"});

    await markLinkAsUsed(token);
    await supabase.from("agendamentos").update({status:"pago"}).eq("id", linkData.agendamento_id);
    res.json({success:true});
  } catch(err) {
    console.error(err);
    res.status(500).json({msg:"Erro interno"});
  }
});

// ---------------- Inicialização ----------------
setInterval(limparAgendamentosExpirados, 5 * 60 * 1000);
setTimeout(limparAgendamentosExpirados, 2000);

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});


