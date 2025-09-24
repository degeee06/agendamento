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

// ---------------- NOVAS FUNÇÕES PARA CONFIGURAÇÃO ----------------

// Obter configurações de horários
async function getConfigHorarios(clienteId) {
  const { data, error } = await supabase
    .from("config_horarios")
    .select("*")
    .eq("cliente_id", clienteId)
    .single();

  if (error || !data) {
    // Retorna configuração padrão se não existir
    return {
      dias_semana: [0, 1, 2, 3, 4, 5, 6],
      horarios_disponiveis: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"],
      intervalo_minutos: 60,
      max_agendamentos_dia: 10,
      datas_bloqueadas: []
    };
  }

  return data;
}

// Obter configurações específicas por data
async function getConfigDataEspecifica(clienteId, data) {
  const { data: configData, error } = await supabase
    .from("config_datas_especificas")
    .select("*")
    .eq("cliente_id", clienteId)
    .eq("data", data)
    .single();

  if (error) return null;
  return configData;
}

// Verificar se horário está disponível considerando configurações
async function verificarDisponibilidade(clienteId, data, horario) {
  const config = await getConfigHorarios(clienteId);
  const configData = await getConfigDataEspecifica(clienteId, data);
  
  // Verificar se a data está bloqueada
  if (configData?.bloqueada) {
    return false;
  }

  // Verificar se a data está na lista de datas bloqueadas
  const dataObj = new Date(data);
  if (config.datas_bloqueadas.includes(data)) {
    return false;
  }

  // Verificar dia da semana
  const diaSemana = dataObj.getDay(); // 0 = Domingo, 1 = Segunda, etc.
  if (!config.dias_semana.includes(diaSemana)) {
    return false;
  }

  // Verificar horários disponíveis
  let horariosPermitidos = config.horarios_disponiveis;
  
  // Aplicar configurações específicas da data
  if (configData) {
    if (configData.horarios_disponiveis) {
      horariosPermitidos = configData.horarios_disponiveis;
    }
    if (configData.horarios_bloqueados.includes(horario)) {
      return false;
    }
  }

  if (!horariosPermitidos.includes(horario)) {
    return false;
  }

  // Verificar limite de agendamentos do dia
  const maxAgendamentos = configData?.max_agendamentos || config.max_agendamentos_dia;
  const { data: agendamentosDia } = await supabase
    .from("agendamentos")
    .select("id")
    .eq("cliente", clienteId)
    .eq("data", data)
    .neq("status", "cancelado");

  if (agendamentosDia.length >= maxAgendamentos) {
    return false;
  }

  return await horarioDisponivel(clienteId, data, horario);
}

// Obter horários disponíveis para uma data
async function getHorariosDisponiveis(clienteId, data) {
  const config = await getConfigHorarios(clienteId);
  const configData = await getConfigDataEspecifica(clienteId, data);
  
  // Verificar se a data está bloqueada
  if (configData?.bloqueada || config.datas_bloqueadas.includes(data)) {
    return [];
  }

  let horariosPermitidos = config.horarios_disponiveis;
  
  // Aplicar configurações específicas da data
  if (configData) {
    if (configData.horarios_disponiveis) {
      horariosPermitidos = configData.horarios_disponiveis;
    }
    // Remover horários bloqueados
    horariosPermitidos = horariosPermitidos.filter(horario => 
      !configData.horarios_bloqueados.includes(horario)
    );
  }

  // Verificar quais horários estão disponíveis
  const horariosDisponiveis = [];
  
  for (const horario of horariosPermitidos) {
    const disponivel = await horarioDisponivel(clienteId, data, horario);
    if (disponivel) {
      horariosDisponiveis.push(horario);
    }
  }

  return horariosDisponiveis;
}

// ---------------- ROTAS PARA CONFIGURAÇÃO (APENAS ADMIN) ----------------

// Obter configurações
app.get("/admin/config/:cliente", authMiddleware, async (req, res) => {
  try {
    const { cliente } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const config = await getConfigHorarios(cliente);
    res.json(config);
  } catch (err) {
    console.error("Erro ao obter configurações:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// Atualizar configurações
app.put("/admin/config/:cliente", authMiddleware, async (req, res) => {
  try {
    const { cliente } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { dias_semana, horarios_disponiveis, intervalo_minutos, max_agendamentos_dia, datas_bloqueadas } = req.body;

    const { data, error } = await supabase
      .from("config_horarios")
      .upsert({
        cliente_id: cliente,
        dias_semana,
        horarios_disponiveis,
        intervalo_minutos,
        max_agendamentos_dia,
        datas_bloqueadas,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ msg: "Configurações atualizadas com sucesso", config: data });
  } catch (err) {
    console.error("Erro ao atualizar configurações:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// Configurações específicas por data
app.get("/admin/config/:cliente/datas", authMiddleware, async (req, res) => {
  try {
    const { cliente } = req.params;
    const { data: startDate, endDate } = req.query;
    
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    let query = supabase
      .from("config_datas_especificas")
      .select("*")
      .eq("cliente_id", cliente);

    if (startDate && endDate) {
      query = query.gte("data", startDate).lte("data", endDate);
    }

    const { data, error } = await query.order("data", { ascending: true });

    if (error) throw error;
    res.json({ configs: data });
  } catch (err) {
    console.error("Erro ao obter configurações de datas:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// Adicionar/atualizar configuração específica de data
app.post("/admin/config/:cliente/datas", authMiddleware, async (req, res) => {
  try {
    const { cliente } = req.params;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { data: dataConfig, horarios_disponiveis, horarios_bloqueados, max_agendamentos, bloqueada } = req.body;

    const { data, error } = await supabase
      .from("config_datas_especificas")
      .upsert({
        cliente_id: cliente,
        data: dataConfig,
        horarios_disponiveis,
        horarios_bloqueados,
        max_agendamentos,
        bloqueada,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ msg: "Configuração de data atualizada com sucesso", config: data });
  } catch (err) {
    console.error("Erro ao atualizar configuração de data:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// ---------------- ROTAS PÚBLICAS PARA CLIENTES ----------------

// Obter horários disponíveis para uma data (para cliente1.html)
app.get("/api/horarios-disponiveis/:cliente", async (req, res) => {
  try {
    const { cliente } = req.params;
    const { data } = req.query;

    if (!data) {
      return res.status(400).json({ msg: "Data é obrigatória" });
    }

    const horarios = await getHorariosDisponiveis(cliente, data);
    res.json({ horarios_disponiveis: horarios });
  } catch (err) {
    console.error("Erro ao obter horários disponíveis:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});

// Serve o painel de admin (index.html)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Serve páginas de cliente dinamicamente
app.get("/:cliente", (req, res) => {
  const cliente = req.params.cliente;
  const filePath = path.join(__dirname, "public", `${cliente}.html`);

  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).send("Página do cliente não encontrada");
    }
  });
});

// ---------------- ROTAS EXISTENTES (MANTIDAS) ----------------

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
app.post("/agendar/:cliente", async (req, res) => {
  try {
    const cliente = req.params.cliente;

    const { Nome, Email, Telefone, Data, Horario } = req.body;
    if (!Nome || !Email || !Telefone || !Data || !Horario)
      return res.status(400).json({ msg: "Todos os campos obrigatórios" });

    const emailNormalizado = Email.toLowerCase().trim();
    const dataNormalizada = new Date(Data).toISOString().split("T")[0];

    // Verifica se o horário está disponível considerando configurações
    const disponivel = await verificarDisponibilidade(cliente, dataNormalizada, Horario);
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
    
    const disponivel = await verificarDisponibilidade(cliente, novaData, novoHorario, id);
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
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
    const seteDiasAtrasStr = seteDiasAtras.toISOString().split('T')[0];

    // Todos os agendamentos do cliente (incluindo cancelados)
    const { data: todosAgendamentos, error: errorTotal } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente);

    if (errorTotal) throw errorTotal;

    // Filtrar agendamentos
    const agendamentosHoje = todosAgendamentos.filter(a => a.data === hoje && a.status !== "cancelado");
    const agendamentosSemana = todosAgendamentos.filter(a => a.data >= seteDiasAtrasStr && a.status !== "cancelado");

    // Estatísticas por status
    const confirmados = todosAgendamentos.filter(a => a.status === 'confirmado').length;
    const pendentes = todosAgendamentos.filter(a => a.status === 'pendente').length;
    const cancelados = todosAgendamentos.filter(a => a.status === 'cancelado').length;

    const totalAtivos = todosAgendamentos.filter(a => a.status !== "cancelado").length;

    const estatisticas = {
      hoje: agendamentosHoje.length,
      total: totalAtivos,
      semana: agendamentosSemana.length,
      status: {
        confirmado: confirmados,
        pendente: pendentes,
        cancelado: cancelados
      },
      taxaConfirmacao: totalAtivos > 0 ? Math.round((confirmados / totalAtivos) * 100) : 0
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
      .select("nome, email, telefone, status")
      .eq("cliente", cliente);

    if (!agendamentos) return res.json([]);

    // Contagem por cliente (por email)
    const clientesCount = {};
    agendamentos.forEach(a => {
      if (a.status === "cancelado") return; // ignora cancelados
      const key = a.email || a.nome || `cliente-${Math.random()}`; // fallback se sem email/nome
      clientesCount[key] = (clientesCount[key] || 0) + 1;
    });

    const topClientes = Object.entries(clientesCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([key, count]) => {
        const agendamento = agendamentos.find(a => (a.email || a.nome) === key);
        return {
          nome: agendamento?.nome || 'Não informado',
          email: agendamento?.email || 'Não informado',
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

// ---------------- SUPABASE: carregar horários disponíveis ----------------
async function carregarHorariosDisponiveis(cliente, data) {
    try {
        // Pega o token do usuário logado no Supabase
        const token = supabase.auth.session()?.access_token;
        if (!token) throw new Error('Usuário não está logado');

        // Faz requisição para sua rota protegida no backend
        const res = await fetch(`/agendamentos/${cliente}?data=${data}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!res.ok) {
            throw new Error(`Erro ao consultar agendamentos: ${res.status}`);
        }

        const agendamentos = await res.json();
        return agendamentos;

    } catch (err) {
        console.error(err);
        return [];
    }
}

// ---------------- SUPABASE: carregar configuração do cliente ----------------
async function carregarConfiguracoesCliente(cliente) {
    try {
        const token = supabase.auth.session()?.access_token;
        if (!token) throw new Error('Usuário não está logado');

        // Se a query pode retornar várias linhas, não use .single()
        const { data, error } = await supabase
            .from('config_horarios')
            .select('*')
            .eq('cliente_id', cliente);

        if (error) {
            console.error('Erro ao carregar configuração:', error);
            return null;
        }

        // Pega só a primeira configuração encontrada
        const config = data[0] || null;

        // Normalizar tipos (dias_semana como números)
        if (config && config.dias_semana) {
            config.dias_semana = config.dias_semana.map(Number);
        }

        return config;

    } catch (err) {
        console.error('Erro ao acessar Supabase:', err);
        return null;
    }
}





// ==== INICIALIZAR LIMPEZA AUTOMÁTICA ====
// Executar a cada 5 minutos (300000 ms)
setInterval(limparAgendamentosExpirados, 5 * 60 * 1000);

// Executar imediatamente ao iniciar o servidor
setTimeout(limparAgendamentosExpirados, 2000);

// ---------------- Servidor ----------------
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log("⏰ Sistema de limpeza de agendamentos expirados ativo");
  console.log("🔧 Sistema de configuração de horários ativo");
});



