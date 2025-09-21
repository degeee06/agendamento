import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { MercadoPagoConfig, Payment } from "mercadopago";
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

// Inicializa Mercado Pago
const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const payment = new Payment(mpClient);

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

// ==== FUNÇÃO PARA LIMPAR AGENDAMENTOS EXPIRADOS ====
async function limparAgendamentosExpirados() {
  try {
    const quinzeMinutosAtras = new Date(Date.now() - 15 * 60 * 1000);
    
    console.log("🔄 Verificando agendamentos expirados...");
    
    const { data: agendamentosExpirados, error } = await supabase
      .from("agendamentos")
      .select("id, cliente, email, data, horario, created_at")
      .eq("status", "pendente")
      .lt("created_at", quinzeMinutosAtras.toISOString());

    if (error) {
      console.error("Erro ao buscar agendamentos expirados:", error);
      return;
    }

    if (agendamentosExpirados && agendamentosExpirados.length > 0) {
      console.log(`📋 Encontrados ${agendamentosExpirados.length} agendamentos expirados`);
      
      for (const agendamento of agendamentosExpirados) {
        // Cancela agendamento não pago
        const { error: updateError } = await supabase
          .from("agendamentos")
          .update({ status: "cancelado", confirmado: false })
          .eq("id", agendamento.id);
        
        if (updateError) {
          console.error(`❌ Erro ao cancelar agendamento ${agendamento.id}:`, updateError);
        } else {
          console.log(`✅ Agendamento ${agendamento.id} cancelado por falta de pagamento`);
          
          // Atualiza Google Sheet
          try {
            const doc = await accessSpreadsheet(agendamento.cliente);
            await updateRowInSheet(doc.sheetsByIndex[0], agendamento.id, {
              status: "cancelado",
              confirmado: false
            });
          } catch (sheetError) {
            console.error("Erro ao atualizar Google Sheets:", sheetError);
          }
        }
      }
    } else {
      console.log("✅ Nenhum agendamento expirado encontrado");
    }
  } catch (err) {
    console.error("Erro na limpeza de agendamentos expirados:", err);
  }
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

// ==== ROTA /create-pix COM EXPIRAÇÃO ====
app.post("/create-pix", async (req, res) => {
  const { amount, description, email } = req.body;
  if (!amount || !email) return res.status(400).json({ error: "Faltando dados" });

  try {
    // ⏰ Calcula data de expiração (15 minutos)
    const dateOfExpiration = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    
    const result = await payment.create({
      body: {
        transaction_amount: Number(amount),
        description: description || "Pagamento de Agendamento",
        payment_method_id: "pix",
        payer: { email },
        // ⏰ ADD EXPIRAÇÃO DE 15 MINUTOS
        date_of_expiration: dateOfExpiration
      },
    });

    console.log("💰 Pagamento criado no Mercado Pago:", result.id, result.status, "Expira:", dateOfExpiration);

    // INSERÇÃO NO BANCO
    const { error: insertError } = await supabase
      .from("pagamentos")
      .insert([{ 
        id: result.id, 
        email: email.toLowerCase().trim(), 
        amount: Number(amount), 
        status: result.status || 'pending', 
        valid_until: null,
        description: description || "Pagamento de Agendamento"
      }]);

    if (insertError) {
      console.error("Erro ao inserir pagamento no Supabase:", insertError);
      
      // Tenta atualizar se já existir
      const { error: updateError } = await supabase
        .from("pagamentos")
        .update({ 
          status: result.status || 'pending',
          amount: Number(amount),
          description: description || "Pagamento de Agendamento"
        })
        .eq("id", result.id);
        
      if (updateError) {
        console.error("Erro ao atualizar pagamento no Supabase:", updateError);
        return res.status(500).json({ error: "Erro ao salvar pagamento" });
      }
    }

    console.log("💾 Pagamento salvo no Supabase:", result.id);

    res.json({
      payment_id: result.id,
      status: result.status,
      qr_code: result.point_of_interaction.transaction_data.qr_code,
      qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64,
      expires_at: dateOfExpiration // ⏰ Envia data de expiração para frontend
    });
  } catch (err) {
    console.error("Erro ao criar PIX:", err);
    res.status(500).json({ error: err.message });
  }
});

// Verifica status do pagamento
app.get("/check-payment/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    // Primeiro verifica no banco de dados
    const { data: paymentData, error: dbError } = await supabase
      .from("pagamentos")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();  // Usa maybeSingle para evitar erro quando não encontra

    if (dbError && dbError.code !== 'PGRST116') {
      console.error("Erro ao buscar pagamento no banco:", dbError);
      return res.status(500).json({ error: "Erro ao verificar pagamento" });
    }

    // Se não encontrou no banco, verifica no Mercado Pago
    if (!paymentData) {
      console.log("Pagamento não encontrado no banco, verificando no Mercado Pago...");
      try {
        const paymentDetails = await payment.get({ id: paymentId });
        return res.json({ status: paymentDetails.status, payment: paymentDetails });
      } catch (mpError) {
        console.error("Erro ao verificar pagamento no Mercado Pago:", mpError);
        return res.status(404).json({ error: "Pagamento não encontrado" });
      }
    }

    // Se já está aprovado no banco, retorna
    if (paymentData.status === "approved") {
      return res.json({ status: "approved", payment: paymentData });
    }

    // Se não está aprovado, verifica no Mercado Pago
    try {
      const paymentDetails = await payment.get({ id: paymentId });
      
      // Atualiza status no banco se mudou
      if (paymentDetails.status !== paymentData.status) {
        let valid_until = paymentData.valid_until;
        
        if (["approved", "paid"].includes(paymentDetails.status.toLowerCase())) {
          const vipExpires = new Date();
          vipExpires.setDate(vipExpires.getDate() + 30);
          valid_until = vipExpires.toISOString();
        }

        await supabase
          .from("pagamentos")
          .update({ 
            status: paymentDetails.status, 
            valid_until,
            updated_at: new Date().toISOString()
          })
          .eq("id", paymentId);
      }

      res.json({ status: paymentDetails.status, payment: paymentDetails });

    } catch (mpError) {
      console.error("Erro ao verificar pagamento no Mercado Pago:", mpError);
      // Se não conseguir verificar no MP, retorna o status do banco
      res.json({ status: paymentData.status, payment: paymentData });
    }

  } catch (err) {
    console.error("Erro em /check-payment:", err);
    res.status(500).json({ error: "Erro interno ao verificar pagamento" });
  }
});

// Checa VIP pelo email (aprovado e dentro do prazo)
app.get("/check-vip/:email", async (req, res) => {
  const email = req.params.email;
  if (!email) return res.status(400).json({ error: "Faltando email" });

  const now = new Date();
  const { data, error } = await supabase
    .from("pagamentos")
    .select("valid_until")
    .eq("email", email)
    .eq("status", "approved")
    .gt("valid_until", now.toISOString())
    .order("valid_until", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    return res.status(500).json({ error: error.message });
  }

  res.json({
    vip: !!data,
    valid_until: data?.valid_until || null
  });
});

// Webhook Mercado Pago
app.post("/webhook", async (req, res) => {
  try {
    const paymentId = req.body?.data?.id || req.query["data.id"];
    if (!paymentId) return res.sendStatus(400);

    const paymentDetails = await payment.get({ id: paymentId });

    // Atualiza status no Supabase
    const status = paymentDetails.status;
    let valid_until = null;

    if (["approved", "paid"].includes(status.toLowerCase())) {
      const vipExpires = new Date();
      vipExpires.setDate(vipExpires.getDate() + 30); // 30 dias
      valid_until = vipExpires.toISOString();
    }

    const { error: updateError } = await supabase
      .from("pagamentos")
      .update({ status, valid_until })
      .eq("id", paymentId);

    if (updateError) {
      console.error("Erro ao atualizar Supabase:", updateError.message);
    } else {
      console.log(`✅ Pagamento ${paymentId} atualizado: status=${status}, valid_until=${valid_until}`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro no webhook:", err.message);
    res.sendStatus(500);
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

    // Verifica se o horário está disponível
    const disponivel = await horarioDisponivel(cliente, dataNormalizada, Horario);
    if (!disponivel) {
      return res.status(400).json({ msg: "Horário indisponível para agendamento" });
    }

    // Inserção do agendamento
    const { data: novoAgendamento, error } = await supabase
      .from("agendamentos")
      .insert([{
        cliente,
        nome: Nome,
        email: emailNormalizado,
        telefone: Telefone,
        data: dataNormalizada,
        horario: Horario,
        status: "pendente",
        confirmado: false,
      }])
      .select()
      .single();

    if (error) {
      console.error("Erro ao inserir agendamento:", error);
      return res.status(500).json({ msg: "Erro ao criar agendamento" });
    }

    // Atualiza Google Sheet
    try {
      const doc = await accessSpreadsheet(cliente);
      const sheet = doc.sheetsByIndex[0];
      await ensureDynamicHeaders(sheet, Object.keys(novoAgendamento));
      await sheet.addRow(novoAgendamento);
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
      // Não falha a requisição por erro no sheet
    }

    res.json({ msg: "Agendamento realizado com sucesso!", agendamento: novoAgendamento });

  } catch (err) {
    console.error("Erro no /agendar:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- Confirmar / Cancelar / Reagendar ----------------
app.post("/agendamentos/:cliente/confirmar/:id", authMiddleware, async (req,res)=>{
  try {
    const { cliente, id } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({msg:"Acesso negado"});
    
    const { data, error } = await supabase.from("agendamentos")
      .update({confirmado:true,status:"confirmado"})
      .eq("id",id).eq("cliente",cliente).select().single();
    
    if (error) throw error;
    
    // Atualiza Google Sheet
    try {
      const doc = await accessSpreadsheet(cliente);
      await updateRowInSheet(doc.sheetsByIndex[0], id, data);
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }
    
    res.json({msg:"Agendamento confirmado", agendamento:data});
  } catch (error) {
    console.error("Erro ao confirmar agendamento:", error);
    res.status(500).json({msg:"Erro interno"});
  }
});

app.post("/agendamentos/:cliente/cancelar/:id", authMiddleware, async (req,res)=>{
  try {
    const { cliente, id } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({msg:"Acesso negado"});
    
    const { data, error } = await supabase.from("agendamentos")
      .update({status:"cancelado", confirmado:false})
      .eq("id",id).eq("cliente",cliente).select().single();
    
    if (error) throw error;
    
    // Atualiza Google Sheet
    try {
      const doc = await accessSpreadsheet(cliente);
      await updateRowInSheet(doc.sheetsByIndex[0], id, data);
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }
    
    res.json({msg:"Agendamento cancelado", agendamento:data});
  } catch (error) {
    console.error("Erro ao cancelar agendamento:", error);
    res.status(500).json({msg:"Erro interno"});
  }
});

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
        status: "pendente",        // SEMPRE volta para pendente
        confirmado: false          // SEMPRE volta para não confirmado
      })
      .eq("id", id)
      .eq("cliente", cliente)
      .select()
      .single();
    
    if (error) throw error;
    
    // Atualiza Google Sheet
    try {
      const doc = await accessSpreadsheet(cliente);
      await updateRowInSheet(doc.sheetsByIndex[0], id, data);
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }
    
    res.json({msg:"Agendamento reagendado com sucesso", agendamento:data});
  } catch (error) {
    console.error("Erro ao reagendar:", error);
    res.status(500).json({msg:"Erro interno"});
  }
});

// ---------------- ESTATÍSTICAS ----------------
app.get("/estatisticas/:cliente", authMiddleware, async (req, res) => {
  try {
    const { cliente } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const hoje = new Date().toISOString().split('T')[0];
    const umaSemanaAtras = new Date();
    umaSemanaAtras.setDate(umaSemanaAtras.getDate() - 7);

    // Agendamentos de hoje
    const { data: agendamentosHoje, error: errorHoje } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente)
      .eq("data", hoje)
      .neq("status", "cancelado");

    if (errorHoje) throw errorHoje;

    // Total de agendamentos
    const { data: todosAgendamentos, error: errorTotal } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente)
      .neq("status", "cancelado");

    if (errorTotal) throw errorTotal;

    // Agendamentos da semana
    const { data: agendamentosSemana, error: errorSemana } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente)
      .gte("data", umaSemanaAtras.toISOString().split('T')[0])
      .neq("status", "cancelado");

    if (errorSemana) throw errorSemana;

    // Estatísticas por status
    const confirmados = todosAgendamentos.filter(a => a.status === 'confirmado').length;
    const pendentes = todosAgendamentos.filter(a => a.status === 'pendente').length;
    const cancelados = todosAgendamentos.filter(a => a.status === 'cancelado').length;

    const estatisticas = {
      hoje: agendamentosHoje?.length || 0,
      total: todosAgendamentos?.length || 0,
      semana: agendamentosSemana?.length || 0,
      status: {
        confirmado: confirmados,
        pendente: pendentes,
        cancelado: cancelados
      },
      taxaConfirmacao: todosAgendamentos.length > 0 ? Math.round((confirmados / todosAgendamentos.length) * 100) : 0
    };

    res.json(estatisticas);
  } catch (error) {
    console.error("Erro ao buscar estatísticas:", error);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- TOP CLIENTES ----------------
app.get("/top-clientes/:cliente", authMiddleware, async (req, res) => {
  try {
    const { cliente } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { data: agendamentos } = await supabase
      .from("agendamentos")
      .select("nome, email, telefone")
      .eq("cliente", cliente)
      .neq("status", "cancelado");

    if (!agendamentos) {
      return res.json([]);
    }

    // Contagem por cliente
    const clientesCount = agendamentos.reduce((acc, agendamento) => {
      const key = agendamento.email;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    // Ordenar por quantidade
    const topClientes = Object.entries(clientesCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([email, count]) => {
        const agendamento = agendamentos.find(a => a.email === email);
        return {
          nome: agendamento?.nome || 'Não informado',
          email: email,
          telefone: agendamento?.telefone || 'Não informado',
          agendamentos: count
        };
      });

    res.json(topClientes);
  } catch (error) {
    console.error("Erro ao buscar top clientes:", error);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ==== GERAR LINK DE CONFIRMAÇÃO ====
app.post("/generate-confirmation-link", async (req, res) => {
  const { agendamento_id, email } = req.body;
  
  if (!agendamento_id || !email) {
    return res.status(400).json({ error: "Agendamento ID e email são obrigatórios" });
  }

  try {
    // Verificar se o agendamento existe e pertence ao email
    const { data: agendamento, error: agError } = await supabase
      .from("agendamentos")
      .select("id, cliente, email, status")
      .eq("id", agendamento_id)
      .eq("email", email.toLowerCase())
      .single();

    if (agError || !agendamento) {
      return res.status(404).json({ error: "Agendamento não encontrado" });
    }

    if (agendamento.status !== "pendente") {
      return res.status(400).json({ error: "Agendamento já confirmado ou cancelado" });
    }

    // Gerar token único
    const token = require('crypto').randomBytes(32).toString('hex');
    const expira_em = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

    // Salvar no banco
    const { error: insertError } = await supabase
      .from("confirmacao_links")
      .insert([{
        agendamento_id: agendamento_id,
        token: token,
        expira_em: expira_em.toISOString()
      }]);

    if (insertError) {
      console.error("Erro ao salvar link de confirmação:", insertError);
      return res.status(500).json({ error: "Erro ao gerar link" });
    }

    // Gerar URL do link de confirmação
    const confirmationUrl = `${process.env.FRONTEND_URL}/confirmar/${token}`;

    res.json({
      confirmation_url: confirmationUrl,
      expira_em: expira_em,
      message: "Link gerado com sucesso. Envie este link para o cliente."
    });

  } catch (err) {
    console.error("Erro ao gerar link de confirmação:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// ==== PÁGINA PÚBLICA DE CONFIRMAÇÃO ====
app.get("/confirmar/:token", async (req, res) => {
  const { token } = req.params;

  try {
    // Buscar o link de confirmação
    const { data: confirmacao, error: confError } = await supabase
      .from("confirmacao_links")
      .select(`
        *,
        agendamentos:agendamento_id (
          id,
          nome,
          email,
          telefone,
          data,
          horario,
          status,
          cliente
        )
      `)
      .eq("token", token)
      .single();

    if (confError || !confirmacao) {
      return res.status(404).send("Link inválido ou expirado");
    }

    // Verificar se já foi utilizado
    if (confirmacao.utilizado) {
      return res.status(400).send("Este link já foi utilizado");
    }

    // Verificar se expirou
    if (new Date() > new Date(confirmacao.expira_em)) {
      return res.status(400).send("Link expirado");
    }

    // Verificar status do agendamento
    if (confirmacao.agendamentos.status !== "pendente") {
      return res.status(400).send("Agendamento já confirmado ou cancelado");
    }

    // Servir página HTML de confirmação
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Confirmar Agendamento</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <h1 class="text-2xl font-bold mb-4">Confirmar Agendamento</h1>
          
          <div class="mb-6">
            <p><strong>Nome:</strong> ${confirmacao.agendamentos.nome}</p>
            <p><strong>Data:</strong> ${confirmacao.agendamentos.data}</p>
            <p><strong>Horário:</strong> ${confirmacao.agendamentos.horario}</p>
            <p><strong>Email:</strong> ${confirmacao.agendamentos.email}</p>
          </div>

          <div id="pixSection" class="mb-4 hidden">
            <h2 class="text-lg font-semibold mb-2">Pagamento via PIX</h2>
            <div id="qrCodeContainer"></div>
            <div id="countdown" class="text-sm text-gray-600 mt-2"></div>
          </div>

          <button onclick="iniciarPagamento()" class="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700">
            Confirmar e Pagar via PIX
          </button>

          <script>
            async function iniciarPagamento() {
              try {
                const response = await fetch('/create-pix-confirmacao', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    token: '${token}',
                    agendamento_id: '${confirmacao.agendamento_id}'
                  })
                });

                const data = await response.json();
                
                if (response.ok) {
                  // Mostrar QR Code PIX
                  document.getElementById('pixSection').classList.remove('hidden');
                  document.querySelector('button').classList.add('hidden');
                  
                  document.getElementById('qrCodeContainer').innerHTML = \`
                    <img src="data:image/png;base64,\${data.qr_code_base64}" class="w-48 h-48 mx-auto mb-4"/>
                    <textarea readonly class="w-full p-2 border rounded">\${data.qr_code}</textarea>
                    <p class="text-center mt-2">Valor: R$ \${data.amount.toFixed(2)}</p>
                  \`;
                  
                  // Iniciar verificação de pagamento
                  verificarPagamento(data.payment_id);
                } else {
                  alert('Erro: ' + data.error);
                }
              } catch (error) {
                alert('Erro ao processar pagamento');
              }
            }

            async function verificarPagamento(paymentId) {
              const interval = setInterval(async () => {
                const response = await fetch(\`/check-payment/\${paymentId}\`);
                const data = await response.json();
                
                if (data.status === 'approved') {
                  clearInterval(interval);
                  alert('Pagamento confirmado! Agendamento realizado com sucesso.');
                  window.location.reload();
                }
              }, 5000);
            }
          </script>
        </div>
      </body>
      </html>
    `);

  } catch (err) {
    console.error("Erro na página de confirmação:", err);
    res.status(500).send("Erro interno");
  }
});

// ==== CRIAR PIX PARA CONFIRMAÇÃO ====
app.post("/create-pix-confirmacao", async (req, res) => {
  const { token, agendamento_id } = req.body;

  try {
    // Verificar token válido
    const { data: confirmacao, error: confError } = await supabase
      .from("confirmacao_links")
      .select("*, agendamentos:agendamento_id(*)")
      .eq("token", token)
      .single();

    if (confError || !confirmacao) {
      return res.status(400).json({ error: "Token inválido" });
    }

    // Criar pagamento PIX
    const valor = 0.01; // Ou valor real do serviço
    const dateOfExpiration = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    
    const result = await payment.create({
      body: {
        transaction_amount: valor,
        description: `Agendamento - ${confirmacao.agendamentos.nome}`,
        payment_method_id: "pix",
        payer: { email: confirmacao.agendamentos.email },
        date_of_expiration: dateOfExpiration
      }
    });

    // Marcar token como utilizado
    await supabase
      .from("confirmacao_links")
      .update({ utilizado: true })
      .eq("token", token);

    res.json({
      payment_id: result.id,
      qr_code: result.point_of_interaction.transaction_data.qr_code,
      qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64,
      amount: valor,
      expires_at: dateOfExpiration
    });

  } catch (err) {
    console.error("Erro ao criar PIX de confirmação:", err);
    res.status(500).json({ error: "Erro ao processar pagamento" });
  }
});




// ==== INICIALIZAR LIMPEZA AUTOMÁTICA ====
// Executar a cada 5 minutos (300000 ms)
setInterval(limparAgendamentosExpirados, 5 * 60 * 1000);

// Executar imediatamente ao iniciar o servidor
setTimeout(limparAgendamentosExpirados, 2000);

// ---------------- Servidor ----------------
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log("⏰ Sistema de limpeza de agendamentos expirados ativo");
});

