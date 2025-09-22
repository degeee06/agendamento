import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
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

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Inicializa Mercado Pago
const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const payment = new Payment(mpClient);
const preference = new Preference(mpClient);

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

// ==== GERAR LINK DE PAGAMENTO PARA AGENDAMENTO ====
app.post("/gerar-link-pagamento/:agendamentoId", authMiddleware, async (req, res) => {
  try {
    const { agendamentoId } = req.params;
    const { valor, titulo, descricao } = req.body;
    
    if (!valor) return res.status(400).json({ error: "Valor é obrigatório" });
    
    // Buscar informações do agendamento
    const { data: agendamento, error: agendamentoError } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("id", agendamentoId)
      .single();
    
    if (agendamentoError || !agendamento) {
      return res.status(404).json({ error: "Agendamento não encontrado" });
    }
    
    // Verificar se o usuário tem permissão para este agendamento
    if (req.clienteId !== agendamento.cliente) {
      return res.status(403).json({ error: "Acesso negado" });
    }
    
    // Gerar token único para o link de confirmação
    const token = crypto.randomBytes(32).toString('hex');
    const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000); // Expira em 24 horas
    
    // Criar preferência no Mercado Pago
    const preferenceResult = await preference.create({
      body: {
        items: [
          {
            title: titulo || "Pagamento de Agendamento",
            description: descricao || `Agendamento para ${agendamento.data} às ${agendamento.horario}`,
            quantity: 1,
            currency_id: "BRL",
            unit_price: parseFloat(valor)
          }
        ],
        payer: {
          email: agendamento.email,
          name: agendamento.nome
        },
        payment_methods: {
          excluded_payment_types: [],
          installments: 1
        },
        external_reference: agendamentoId,
        notification_url: `${process.env.BASE_URL}/webhook-pagamento`,
        back_urls: {
          success: `${process.env.FRONTEND_URL}/pagamento/sucesso`,
          failure: `${process.env.FRONTEND_URL}/pagamento/erro`,
          pending: `${process.env.FRONTEND_URL}/pagamento/pendente`
        },
        auto_return: "approved"
      }
    });
    
    // Salvar o link de confirmação no banco
    const { error: linkError } = await supabase
      .from("confirmacao_links")
      .insert({
        agendamento_id: agendamentoId,
        token: token,
        expira_em: expiraEm.toISOString(),
        preference_id: preferenceResult.id,
        link_pagamento: preferenceResult.init_point
      });
    
    if (linkError) {
      console.error("Erro ao salvar link de confirmação:", linkError);
      return res.status(500).json({ error: "Erro ao gerar link de pagamento" });
    }
    
    res.json({
      success: true,
      link: `${process.env.BASE_URL}/confirmar-pagamento/${token}`,
      link_mp: preferenceResult.init_point,
      expira_em: expiraEm
    });
    
  } catch (error) {
    console.error("Erro ao gerar link de pagamento:", error);
    res.status(500).json({ error: "Erro interno ao gerar link de pagamento" });
  }
});

// ==== ROTA PARA CONFIRMAÇÃO DE PAGAMENTO VIA LINK ====
app.get("/confirmar-pagamento/:token", async (req, res) => {
  try {
    const { token } = req.params;
    
    // Buscar o link de confirmação
    const { data: linkData, error: linkError } = await supabase
      .from("confirmacao_links")
      .select("*, agendamentos(*)")
      .eq("token", token)
      .single();
    
    if (linkError || !linkData) {
      return res.status(404).send("Link de confirmação não encontrado ou inválido");
    }
    
    // Verificar se o link já foi utilizado
    if (linkData.utilizado) {
      return res.status(400).send("Este link já foi utilizado");
    }
    
    // Verificar se o link expirou
    if (new Date(linkData.expira_em) < new Date()) {
      return res.status(400).send("Este link expirou");
    }
    
    // Buscar informações do pagamento no Mercado Pago
    let statusPagamento = "pending";
    try {
      const paymentInfo = await payment.get({ id: linkData.preference_id });
      statusPagamento = paymentInfo.status;
    } catch (mpError) {
      console.error("Erro ao buscar informações do pagamento:", mpError);
    }
    
    // Se o pagamento já foi aprovado, atualizar o agendamento
    if (statusPagamento === "approved") {
      // Atualizar agendamento para confirmado
      const { error: updateError } = await supabase
        .from("agendamentos")
        .update({ 
          status: "confirmado", 
          confirmado: true 
        })
        .eq("id", linkData.agendamento_id);
      
      if (updateError) {
        console.error("Erro ao atualizar agendamento:", updateError);
      } else {
        // Marcar link como utilizado
        await supabase
          .from("confirmacao_links")
          .update({ utilizado: true })
          .eq("token", token);
        
        // Atualizar Google Sheet
        try {
          const doc = await accessSpreadsheet(linkData.agendamentos.cliente);
          await updateRowInSheet(doc.sheetsByIndex[0], linkData.agendamento_id, {
            status: "confirmado",
            confirmado: true
          });
        } catch (sheetError) {
          console.error("Erro ao atualizar Google Sheets:", sheetError);
        }
      }
      
      return res.redirect(`${process.env.FRONTEND_URL}/pagamento/sucesso?agendamento=${linkData.agendamento_id}`);
    } else {
      // Redirecionar para o checkout do Mercado Pago
      return res.redirect(linkData.link_pagamento);
    }
    
  } catch (error) {
    console.error("Erro na confirmação de pagamento:", error);
    res.status(500).send("Erro interno ao processar pagamento");
  }
});

// ==== WEBHOOK ESPECÍFICO PARA PAGAMENTOS VIA LINK ====
app.post("/webhook-pagamento", async (req, res) => {
  try {
    const { type, data } = req.body;
    
    if (type === "payment") {
      const paymentId = data.id;
      
      // Buscar informações do pagamento
      const paymentInfo = await payment.get({ id: paymentId });
      
      // Buscar o agendamento relacionado
      const { data: linkData, error: linkError } = await supabase
        .from("confirmacao_links")
        .select("*, agendamentos(*)")
        .eq("preference_id", paymentInfo.order.id)
        .single();
      
      if (linkError || !linkData) {
        return res.sendStatus(200); // Ignora pagamentos não relacionados a agendamentos
      }
      
      // Atualizar status do pagamento
      await supabase
        .from("pagamentos")
        .upsert({
          id: paymentId,
          email: paymentInfo.payer.email,
          amount: paymentInfo.transaction_amount,
          status: paymentInfo.status,
          description: `Pagamento para agendamento ${linkData.agendamento_id}`,
          agendamento_id: linkData.agendamento_id
        });
      
      // Se o pagamento foi aprovado, confirmar o agendamento
      if (paymentInfo.status === "approved") {
        await supabase
          .from("agendamentos")
          .update({ 
            status: "confirmado", 
            confirmado: true 
          })
          .eq("id", linkData.agendamento_id);
        
        // Marcar link como utilizado
        await supabase
          .from("confirmacao_links")
          .update({ utilizado: true })
          .eq("preference_id", paymentInfo.order.id);
        
        // Atualizar Google Sheet
        try {
          const doc = await accessSpreadsheet(linkData.agendamentos.cliente);
          await updateRowInSheet(doc.sheetsByIndex[0], linkData.agendamento_id, {
            status: "confirmado",
            confirmado: true
          });
        } catch (sheetError) {
          console.error("Erro ao atualizar Google Sheets:", sheetError);
        }
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error("Erro no webhook de pagamento:", error);
    res.sendStatus(500);
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
