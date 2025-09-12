import express from "express";
import bodyParser from "body-parser";
import bcrypt from 'bcryptjs';
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(bodyParser.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Login
app.post("/login", async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ msg: "Email e senha são obrigatórios" });

  const { data: user } = await supabase
    .from("usuarios")
    .select("id, cliente_id, senha_hash")
    .eq("email", email)
    .single();

  if (!user) return res.status(400).json({ msg: "Usuário não encontrado" });

  const match = await bcrypt.compare(senha, user.senha_hash);
  if (!match) return res.status(400).json({ msg: "Senha incorreta" });

  // Aqui podemos gerar um token JWT simples para proteger rotas
  const token = Buffer.from(JSON.stringify({ userId: user.id, clienteId: user.cliente_id })).toString("base64");
  res.json({ msg: "Login OK", token });
});

// Middleware para rotas protegidas
async function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ msg: "Não autorizado" });

  try {
    const payload = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ msg: "Token inválido" });
  }
}

// Exemplo: rota protegida
app.get("/minhas-info", authMiddleware, async (req, res) => {
  const clienteId = req.user.clienteId;
  const { data: cliente } = await supabase.from("clientes").select("*").eq("id", clienteId).single();
  res.json({ cliente });
});

app.listen(3000, () => console.log("Servidor rodando na porta 3000"));

