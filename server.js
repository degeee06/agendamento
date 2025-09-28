import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// ---------------- Supabase ----------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

// ---------------- Funções Auxiliares ----------------
function normalizarData(data) {
  return new Date(data).toISOString().split('T')[0];
}

function normalizarHorario(horario) {
  if (horario.includes(':')) {
    const parts = horario.split(':');
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`;
  }
  return horario;
}

// ---------------- Disponibilidade (SOMENTE SUPABASE) ----------------
async function horarioDisponivel(cliente, data, horario, ignoreId = null) {
  try {
    const dataNormalizada = normalizarData(data);
    const horarioNormalizado = normalizarHorario(horario);

    console.log('🔍 Verificando disponibilidade no Supabase:', { 
      cliente, 
      data: dataNormalizada, 
      horario: horarioNormalizado 
    });

    let query = supabase
      .from("agendamentos")
      .select("id, status, nome")
      .eq("cliente", cliente)
      .eq("data", dataNormalizada)
      .eq("horario", horarioNormalizado)
      .in("status", ["pendente", "confirmado"]);

    if (ignoreId) {
      query = query.neq("id", ignoreId);
    }

    const { data: agendamentos, error } = await query;
    
    if (error) {
      console.error('❌ Erro ao verificar disponibilidade:', error);
      throw error;
    }

    const disponivel = agendamentos.length === 0;
    
    console.log('📊 Resultado disponibilidade:', { 
      disponivel, 
      agendamentosEncontrados: agendamentos.length 
    });
    
    return disponivel;
  } catch (error) {
    console.error('💥 Erro na função horarioDisponivel:', error);
    throw error;
  }
}

// ---------------- Agendar (SOMENTE SUPABASE) ----------------
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

    console.log('📅 Novo agendamento solicitado:', {
      cliente,
      Nome, 
      Email, 
      Data: dataNormalizada, 
      Horario: horarioNormalizado
    });

    // Verifica se a data não é no passado
    const dataAgendamento = new Date(`${dataNormalizada}T${horarioNormalizado}`);
    const agora = new Date();
    if (dataAgendamento < agora) {
      console.log('❌ Tentativa de agendar no passado');
      return res.status(400).json({ msg: "Não é possível agendar para datas/horários passados" });
    }

    // VERIFICA DISPONIBILIDADE NO SUPABASE
    const livre = await horarioDisponivel(cliente, dataNormalizada, horarioNormalizado);
    
    if (!livre) {
      console.log('❌ Horário indisponível no Supabase');
      return res.status(400).json({ msg: "Horário indisponível. Por favor, escolha outro horário." });
    }

    // Verifica limite de agendamentos por dia (SUPABASE)
    const { data: agendamentosHoje } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("email", Email)
      .eq("data", dataNormalizada)
      .neq("status", "cancelado");

    if (agendamentosHoje && agendamentosHoje.length >= 3) {
      console.log('❌ Limite de agendamentos atingido');
      return res.status(400).json({ msg: "Limite de 3 agendamentos por dia atingido" });
    }

    // Remove agendamento cancelado no mesmo horário (SUPABASE)
    await supabase
      .from("agendamentos")
      .delete()
      .eq("cliente", cliente)
      .eq("data", dataNormalizada)
      .eq("horario", horarioNormalizado)
      .eq("status", "cancelado");

    // INSERE NO SUPABASE
    const { data: agendamento, error: insertError } = await supabase
      .from("agendamentos")
      .insert([{
        cliente,
        nome: Nome,
        email: Email,
        telefone: Telefone,
        data: dataNormalizada,
        horario: horarioNormalizado,
        status: "confirmado",
        confirmado: true
      }])
      .select()
      .single();

    if (insertError) {
      console.error('❌ Erro ao inserir no Supabase:', insertError);
      if (insertError.code === '23505') {
        return res.status(400).json({ msg: "Horário já ocupado por outro agendamento" });
      }
      return res.status(500).json({ msg: "Erro ao salvar agendamento" });
    }

    console.log('✅ Agendamento criado com sucesso no Supabase ID:', agendamento.id);
    
    res.json({ 
      msg: "Agendamento realizado com sucesso!", 
      agendamento: agendamento
    });
  } catch (err) {
    console.error("💥 Erro no agendamento:", err);
    res.status(500).json({ msg: "Erro interno no servidor" });
  }
});

// ---------------- Reagendar (SOMENTE SUPABASE) ----------------
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

    // Atualiza no Supabase
    const { data: novo, error: errorUpdate } = await supabase
      .from("agendamentos")
      .update({
        data: dataNormalizada,
        horario: horarioNormalizado,
        status: "confirmado",
        confirmado: true,
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

    res.json({ msg: "Agendamento cancelado!", agendamento: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno ao cancelar" });
  }
});

// ---------------- Listar Agendamentos ----------------
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

    if (error) return res.status(500).json({ msg: "Erro ao buscar agendamentos" });

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

    const disponivel = await horarioDisponivel(cliente, data, horario);
    res.json({ disponivel });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro ao verificar disponibilidade" });
  }
});

// ---------------- Rota Raiz ----------------
app.get("/", (req, res) => res.send("Servidor rodando"));

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
