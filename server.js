import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { createClient } from "@supabase/supabase-js";

// ---------------- Supabase ----------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- Middleware de autenticação ---
async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ message: "Token ausente" });

  const token = auth.split(" ")[1];
  const { data: user, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ message: "Token inválido" });

  req.user = user;
  next();
}

// --- Listar agendamentos ---
app.get("/meus-agendamentos/:cliente", authMiddleware, async (req, res) => {
  const { cliente } = req.params;
  const { data, error } = await supabase
    .from("agendamentos")
    .select("*")
    .eq("cliente", cliente)
    .neq("status", "cancelado")
    .order("data", { ascending: true })
    .order("horario", { ascending: true });

  if (error) return res.status(500).json({ message: error.message });
  res.json({ agendamentos: data });
});

// --- Agendar ---
app.post("/agendar/:cliente", authMiddleware, async (req, res) => {
  const { cliente } = req.params;
  const { Nome, Email, Telefone, Data, Horario } = req.body;

  if (!Nome || !Email || !Telefone || !Data || !Horario)
    return res.status(400).json({ message: "Todos os campos são obrigatórios" });

  // Verifica conflito
  const { data: conflitantes } = await supabase
    .from("agendamentos")
    .select("*")
    .eq("cliente", cliente)
    .eq("data", Data)
    .eq("horario", Horario)
    .neq("status", "cancelado");

  if (conflitantes.length > 0)
    return res.status(400).json({ message: "Já existe um agendamento nesse horário" });

  const { data, error } = await supabase
    .from("agendamentos")
    .insert([{ cliente, nome: Nome, email: Email, telefone: Telefone, data: Data, horario: Horario }]);

  if (error) return res.status(500).json({ message: error.message });
  res.status(201).json(data[0]);
});

// --- Confirmar ---
app.post("/confirmar/:cliente/:id", authMiddleware, async (req, res) => {
  const { cliente, id } = req.params;
  const { data, error } = await supabase
    .from("agendamentos")
    .update({ confirmado: true, status: "confirmado" })
    .eq("id", id)
    .eq("cliente", cliente);

  if (error) return res.status(500).json({ message: error.message });
  res.json(data[0]);
});

// --- Cancelar ---
app.post("/cancelar/:cliente/:id", authMiddleware, async (req, res) => {
  const { cliente, id } = req.params;
  const { data, error } = await supabase
    .from("agendamentos")
    .update({ status: "cancelado" })
    .eq("id", id)
    .eq("cliente", cliente);

  if (error) return res.status(500).json({ message: error.message });
  res.json(data[0]);
});

// --- Reagendar ---
app.post("/reagendar/:cliente/:id", authMiddleware, async (req, res) => {
  const { cliente, id } = req.params;
  const { novaData, novoHorario } = req.body;

  if (!novaData || !novoHorario)
    return res.status(400).json({ message: "Nova data e horário são obrigatórios" });

  // Verifica conflito
  const { data: conflitantes } = await supabase
    .from("agendamentos")
    .select("*")
    .eq("cliente", cliente)
    .eq("data", novaData)
    .eq("horario", novoHorario)
    .neq("status", "cancelado");

  if (conflitantes.length > 0)
    return res.status(400).json({ message: "Já existe um agendamento nesse horário" });

  const { data, error } = await supabase
    .from("agendamentos")
    .update({ data: novaData, horario: novoHorario, status: "pendente", confirmado: false })
    .eq("id", id)
    .eq("cliente", cliente);

  if (error) return res.status(500).json({ message: error.message });
  res.json(data[0]);
});

app.listen(3000, () => console.log("Server rodando na porta 3000"));
