import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { createClient } from "@supabase/supabase-js";



const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;



// ---------------- Supabase ----------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------- Clientes e planilhas ----------------
const planilhasClientes = {
  cliente1: process.env.ID_PLANILHA_CLIENTE1,
  cliente2: process.env.ID_PLANILHA_CLIENTE2
};
const clientesValidos = Object.keys(planilhasClientes);

// ---------------- Google Service Account ----------------
let creds;
try {
  creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
} catch (e) {
  console.error("Erro ao parsear GOOGLE_SERVICE_ACCOUNT:", e);
  process.exit(1);
}

// ---------------- App ----------------
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

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

// ---------------- Google Sheets ----------------
async function accessSpreadsheet(cliente) {
  const SPREADSHEET_ID = planilhasClientes[cliente];
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
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

// ---------------- Funções Auxiliares Melhoradas ----------------
function normalizarData(data) {
  // Garante que a data está no formato YYYY-MM-DD
  return new Date(data).toISOString().split('T')[0];
}

function normalizarHorario(horario) {
  // Garante que o horário está no formato HH:MM:SS
  if (horario.includes(':')) {
    const parts = horario.split(':');
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`;
  }
  return horario;
}

// ---------------- Disponibilidade Melhorada ----------------
async function horarioDisponivel(cliente, data, horario, ignoreId = null) {
  try {
    const dataNormalizada = normalizarData(data);
    const horarioNormalizado = normalizarHorario(horario);

    console.log('Verificando disponibilidade:', { cliente, dataNormalizada, horarioNormalizado, ignoreId });

    let query = supabase
      .from("agendamentos")
      .select("id, status")
      .eq("cliente", cliente)
      .eq("data", dataNormalizada)
      .eq("horario", horarioNormalizado)
      .neq("status", "cancelado");

    if (ignoreId) {
      query = query.neq("id", ignoreId);
    }

    const { data: agendamentos, error } = await query;
    
    if (error) {
      console.error('Erro ao verificar disponibilidade:', error);
      throw error;
    }

    const disponivel = agendamentos.length === 0;
    console.log('Resultado disponibilidade:', { disponivel, agendamentosEncontrados: agendamentos.length });
    
    return disponivel;
  } catch (error) {
    console.error('Erro na função horarioDisponivel:', error);
    throw error;
  }
}

// ---------------- Transação Segura para Agendamento ----------------
async function executarAgendamentoSeguro(cliente, dadosAgendamento) {
  try {
    const { data, error } = await supabase
      .from("agendamentos")
      .insert([{
        ...dadosAgendamento,
        cliente,
        status: "confirmado", // Agora todos são confirmados automaticamente
        confirmado: true
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error("Horário já ocupado por outro agendamento");
      }
      throw error;
    }

    return data;
  } catch (error) {
    throw error;
  }
}

// ---------------- Rotas ----------------
app.get("/", (req, res) => res.send("Servidor rodando"));

app.get("/:cliente", (req, res) => {
  const cliente = req.params.cliente;
  if (!clientesValidos.includes(cliente)) return res.status(404).send("Cliente não encontrado");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});



// ---------------- Agendar Corrigido ----------------
app.post("/agendar/:cliente", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { Nome, Email, Telefone, Data, Horario } = req.body;
    if (!Nome || !Email || !Telefone || !Data || !Horario)
      return res.status(400).json({ msg: "Todos os campos obrigatórios" });

    // Normaliza dados
    const dataNormalizada = normalizarData(Data);
    const horarioNormalizado = normalizarHorario(Horario);

    // Verifica se a data não é no passado
    const dataAgendamento = new Date(`${dataNormalizada}T${horarioNormalizado}`);
    if (dataAgendamento < new Date()) {
      return res.status(400).json({ msg: "Não é possível agendar para datas/horários passados" });
    }

  // Verifica limite de agendamentos por dia (para todos os usuários)
const { data: agendamentosHoje } = await supabase
  .from("agendamentos")
  .select("*")
  .eq("email", Email)
  .eq("data", dataNormalizada)
  .neq("status", "cancelado");

// Define um limite geral (ex: 3 agendamentos por dia por email)
if (agendamentosHoje.length >= 3) {
  return res.status(400).json({ msg: "Limite de 3 agendamentos por dia atingido" });
}
    // Checa disponibilidade do horário
    const livre = await horarioDisponivel(cliente, dataNormalizada, horarioNormalizado);
    if (!livre) return res.status(400).json({ msg: "Horário indisponível" });

    // Remove agendamento cancelado no mesmo horário (se existir)
    await supabase
      .from("agendamentos")
      .delete()
      .eq("cliente", cliente)
      .eq("data", dataNormalizada)
      .eq("horario", horarioNormalizado)
      .eq("status", "cancelado");

    // Insere novo agendamento com transação segura
    const dadosAgendamento = {
      nome: Nome,
      email: Email,
      telefone: Telefone,
      data: dataNormalizada,
      horario: horarioNormalizado
    };

    const agendamento = await executarAgendamentoSeguro(cliente, dadosAgendamento);

   

    // Salva no Google Sheets
    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(agendamento));
    await sheet.addRow(agendamento);

    res.json({ 
  msg: "Agendamento realizado com sucesso!", 
  agendamento: agendamento
});
  } catch (err) {
    console.error("Erro no agendamento:", err);
    
    if (err.message === "Horário já ocupado por outro agendamento") {
      return res.status(400).json({ msg: "Horário indisponível. Tente outro horário." });
    }
    
    res.status(500).json({ msg: "Erro interno no servidor" });
  }
});

// ---------------- Reagendar Corrigido ----------------
app.post("/reagendar/:cliente/:id", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { id } = req.params;
    const { novaData, novoHorario } = req.body;
    if (!novaData || !novoHorario) return res.status(400).json({ msg: "Nova data e horário obrigatórios" });

    // Normaliza dados
    const dataNormalizada = normalizarData(novaData);
    const horarioNormalizado = normalizarHorario(novoHorario);

    // Verifica se a nova data não é no passado
    const dataAgendamento = new Date(`${dataNormalizada}T${horarioNormalizado}`);
    if (dataAgendamento < new Date()) {
      return res.status(400).json({ msg: "Não é possível reagendar para datas/horários passados" });
    }

    const { data: agendamento, error: errorGet } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("id", id)
      .eq("cliente", cliente)
      .single();

    if (errorGet || !agendamento) return res.status(404).json({ msg: "Agendamento não encontrado" });

    // Checa se novo horário está livre, ignorando o próprio ID
    const livre = await horarioDisponivel(cliente, dataNormalizada, horarioNormalizado, id);
    if (!livre) return res.status(400).json({ msg: "Horário indisponível" });

    // Atualiza o agendamento existente com verificação de constraint
    const { data: novo, error: errorUpdate } = await supabase
      .from("agendamentos")
      .update({
        data: dataNormalizada,
        horario: horarioNormalizado,
        status: "pendente",
        confirmado: false,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (errorUpdate) {
      if (errorUpdate.code === '23505') {
        return res.status(400).json({ msg: "Horário já ocupado por outro agendamento" });
      }
      return res.status(500).json({ msg: "Erro ao reagendar" });
    }

    // Atualiza Google Sheets
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
    console.error("Erro no reagendamento:", err);
    res.status(500).json({ msg: "Erro interno no servidor" });
  }
});

// ---------------- Confirmar ----------------
app.post("/confirmar/:cliente/:id", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { id } = req.params;
    const { data, error } = await supabase
      .from("agendamentos")
      .update({ status: "confirmado", confirmado: true })
      .eq("id", id)
      .eq("cliente", cliente)
      .select()
      .single();

    if (error) return res.status(500).json({ msg: "Erro ao confirmar agendamento" });
    if (!data) return res.status(404).json({ msg: "Agendamento não encontrado" });

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

// ---------------- Listar ----------------
app.get("/meus-agendamentos/:cliente", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { data, error } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente)
      .order("data", { ascending: true })
      .order("horario", { ascending: true });

    if (error) return res.status(500).json({ msg: "Erro Supabase" });

    res.json({ agendamentos: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- Verificar Disponibilidade ----------------
app.get("/disponibilidade/:cliente", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    const { data, horario } = req.query;

    if (!data || !horario) {
      return res.status(400).json({ msg: "Data e horário são obrigatórios" });
    }

    const dataNormalizada = normalizarData(data);
    const horarioNormalizado = normalizarHorario(horario);

    const disponivel = await horarioDisponivel(cliente, dataNormalizada, horarioNormalizado);

    res.json({ disponivel });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro ao verificar disponibilidade" });
  }
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

