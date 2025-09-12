import express from "express";
import bodyParser from "body-parser";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

// Config
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);


const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// 🔹 Endpoint para agendar
app.post("/agendar/:cliente", async (req, res) => {
  try {
    const { cliente } = req.params;
    const { Nome, Email, Telefone, Data, Horario } = req.body;

    if (!Nome || !Email || !Telefone || !Data || !Horario) {
      return res.status(400).json({ msg: "Todos os campos são obrigatórios" });
    }

    // Salvar no Supabase
    const { error } = await supabase
      .from("agendamentos")
      .insert([{ cliente, nome: Nome, email: Email, telefone: Telefone, data: Data, horario: Horario }]);

    if (error) {
      console.error(error);
      return res.status(500).json({ msg: "Erro ao salvar agendamento" });
    }

    res.json({ msg: "Agendamento realizado com sucesso" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// 🔹 Endpoint opcional para listar agendamentos de um cliente
app.get("/agendamentos/:cliente", async (req, res) => {
  try {
    const { cliente } = req.params;
    const { data: agendamentos, error } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente)
      .order("data", { ascending: true })
      .order("horario", { ascending: true });

    if (error) {
      console.error(error);
      return res.status(500).json({ msg: "Erro ao buscar agendamentos" });
    }

    res.json(agendamentos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

