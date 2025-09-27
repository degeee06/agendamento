import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { GoogleSpreadsheet } from "google-spreadsheet";

// ---------------- Config ----------------
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



let creds;
try {
  creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
} catch (e) {
  console.error("Erro ao parsear GOOGLE_SERVICE_ACCOUNT:", e);
  process.exit(1);
}

// ---------------- Google Sheets ----------------
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

// ---------------- Rotas ----------------
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));
app.get("/:cliente", async (req, res) => {
  const cliente = req.params.cliente;
  const { data, error } = await supabase.from("clientes").select("id").eq("id", cliente).single();
  if (error || !data) return res.status(404).send("Cliente não encontrado");
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.get("/agendamentos/:cliente", authMiddleware, async (req, res) => {
  try {
    const { cliente } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { data, error } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente)
      .neq("status", "cancelado")
      .order("data", { ascending: true })
      .order("horario", { ascending: true });

    if (error) throw error;
    res.json({ agendamentos: data });
  } catch (err) {
    console.error("Erro ao listar agendamentos:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});



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

    // Checa VIP (para limite de agendamentos/dia)
    const isVip = await checkVip(emailNormalizado);

    if (!isVip) {
      const startDay = new Date(Data); startDay.setHours(0,0,0,0);
      const endDay = new Date(Data); endDay.setHours(23,59,59,999);

      const { data: agendamentosHoje } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("cliente", cliente)
        .ilike("email", emailNormalizado)
        .in("status", ["pendente", "confirmado"])
        .gte("created_at", startDay.toISOString())
        .lte("created_at", endDay.toISOString());

      if (agendamentosHoje.length >= 3)
        return res.status(402).json({
          msg: "Você atingiu o limite de 3 agendamentos/dia. Faça upgrade para VIP.",
        });
    }

    // Limpeza de agendamentos cancelados (opcional)
    await supabase
      .from("agendamentos")
      .delete()
      .eq("cliente", cliente)
      .eq("data", dataNormalizada)
      .eq("horario", Horario)
      .eq("status", "cancelado");

    // Debug: log dos dados que vão ser inseridos
    console.log({
      cliente, Nome, Email, Telefone, Data, Horario,
      dataNormalizada, emailNormalizado
    });

    // Inserção sem checagem de horário disponível
    const { data: novoAgendamento, error } = await supabase
      .from("agendamentos")
      .insert([{
        cliente,
        nome: Nome,
        email: emailNormalizado,
        telefone: Telefone,
        data: dataNormalizada,
        horario: Horario,
        status: "pendente",   // sempre pendente
        confirmado: false,    // sempre falso
      }])
      .select()
      .single();

    if (error) throw error;

    // Atualiza Google Sheet
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


// ---------------- Confirmar / Cancelar / Reagendar ----------------
app.post("/agendamentos/:cliente/confirmar/:id", authMiddleware, async (req,res)=>{
  const { cliente, id } = req.params;
  if (req.clienteId !== cliente) return res.status(403).json({msg:"Acesso negado"});
  const { data } = await supabase.from("agendamentos")
    .update({confirmado:true,status:"confirmado"})
    .eq("id",id).eq("cliente",cliente).select().single();
  const doc = await accessSpreadsheet(cliente);
  await updateRowInSheet(doc.sheetsByIndex[0], id, data);
  res.json({msg:"Agendamento confirmado", agendamento:data});
});

app.post("/agendamentos/:cliente/cancelar/:id", authMiddleware, async (req,res)=>{
  const { cliente, id } = req.params;
  if (req.clienteId !== cliente) return res.status(403).json({msg:"Acesso negado"});
  const { data } = await supabase.from("agendamentos")
    .update({status:"cancelado", confirmado:false})
    .eq("id",id).eq("cliente",cliente).select().single();
  const doc = await accessSpreadsheet(cliente);
  await updateRowInSheet(doc.sheetsByIndex[0], id, data);
  res.json({msg:"Agendamento cancelado", agendamento:data});
});

app.post("/agendamentos/:cliente/reagendar/:id", authMiddleware, async (req,res)=>{
  const { cliente, id } = req.params;
  const { novaData, novoHorario } = req.body;
  if (!novaData || !novoHorario) return res.status(400).json({msg:"Data e horário obrigatórios"});
  if (req.clienteId !== cliente) return res.status(403).json({msg:"Acesso negado"});
  const disponivel = await horarioDisponivel(cliente, novaData, novoHorario, id);
  if(!disponivel) return res.status(400).json({msg:"Horário indisponível"});
  const { data } = await supabase.from("agendamentos")
    .update({data:novaData, horario:novoHorario})
    .eq("id",id).eq("cliente",cliente).select().single();
  const doc = await accessSpreadsheet(cliente);
  await updateRowInSheet(doc.sheetsByIndex[0], id, data);
  res.json({msg:"Agendamento reagendado com sucesso", agendamento:data});
});

// ---------------- Servidor ----------------
app.listen(PORT,()=>console.log(`Servidor rodando na porta ${PORT}`));







