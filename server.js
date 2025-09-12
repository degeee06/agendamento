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
  process.env.SUPABASE_KEY
);

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// 🕒 Horários padrão por cliente
const horariosClientes = {
  cliente1: [
    "09:00", "10:00", "11:00", "12:00",
    "13:00", "14:00", "15:00", "16:00",
    "17:00", "18:00"
  ],
  cliente2: [
    "08:00", "09:00", "10:00", "11:00", "12:00",
    "13:00", "14:00", "15:00", "16:00",
    "17:00", "18:00", "19:00", "20:00"
  ]
};

// 🔹 Endpoint para horários disponíveis
app.get("/horarios/:cliente/:data", async (req, res) => {
  try {
    const { cliente, data } = req.params;

    const horariosPadrao = horariosClientes[cliente] || horariosClientes["cliente1"];

    // Buscar agendamentos já feitos
    const { data: agendamentos, error } = await supabase
      .from("agendamentos")
      .select("horario")
      .eq("cliente", cliente)
      .eq("data", data);

    if (error) {
      console.error(error);
      return res.status(500).json({ msg: "Erro ao consultar horários" });
    }

    const ocupados = agendamentos.map(a => a.horario.slice(0, 5)); // HH:MM
    const disponiveis = horariosPadrao.filter(h => !ocupados.includes(h));

    res.json({ disponiveis });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

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

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
