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

// Verifica variáveis de ambiente críticas
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Variáveis de ambiente do Supabase não configuradas");
  process.exit(1);
}

if (!process.env.MP_ACCESS_TOKEN) {
  console.error("❌ Token de acesso do Mercado Pago não configurado");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Inicializa Mercado Pago apenas se o token existir
let mpClient, payment;
if (process.env.MP_ACCESS_TOKEN) {
  mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  payment = new Payment(mpClient);
} else {
  console.warn("⚠️ Mercado Pago não inicializado - MP_ACCESS_TOKEN não encontrado");
}

let creds;
try {
  if (process.env.GOOGLE_SERVICE_ACCOUNT) {
    creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  }
} catch (e) {
  console.error("❌ Erro ao parsear GOOGLE_SERVICE_ACCOUNT:", e);
}

// ---------------- Google Sheets ----------------
async function accessSpreadsheet(clienteId) {
  if (!creds) {
    throw new Error("Credenciais do Google Sheets não configuradas");
  }

  const { data, error } = await supabase
    .from("clientes")
    .select("spreadsheet_id")
    .eq("id", clienteId)
    .single();
    
  if (error || !data) throw new Error(`Cliente ${clienteId} não encontrado`);
  if (!data.spreadsheet_id) throw new Error(`Cliente ${clienteId} sem spreadsheet_id`);

  const doc = new GoogleSpreadsheet(data.spreadsheet_id);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  return doc;
}

async function ensureDynamicHeaders(sheet, newKeys) {
  try {
    await sheet.loadHeaderRow();
  } catch (error) {
    // Se não tem header, cria com as novas keys
    await sheet.setHeaderRow(newKeys);
    return;
  }
  
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
      if (sheet.headerValues.includes(key)) {
        row[key] = updatedData[key];
      }
    });
    await row.save();
  } else {
    await ensureDynamicHeaders(sheet, Object.keys(updatedData));
    await sheet.addRow({ id: rowId, ...updatedData });
  }
}

// ---------------- Middleware Auth ----------------
async function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ msg: "Token não enviado" });

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ msg: "Token inválido" });

    req.user = data.user;
    req.clienteId = data.user.user_metadata?.cliente_id;
    
    // CORREÇÃO: Verificar isAdmin corretamente
    req.isAdmin = data.user.user_metadata?.isAdmin === true || 
                 data.user.user_metadata?.role === "admin" || 
                 false;

    console.log('🔐 Middleware - User:', data.user.email);
    console.log('🔐 Middleware - clienteId:', req.clienteId);
    console.log('🔐 Middleware - isAdmin:', req.isAdmin);
    console.log('🔐 Middleware - Metadata:', data.user.user_metadata);

    // Apenas usuários comuns precisam de cliente_id (admin pode não ter)
    if (!req.clienteId && !req.isAdmin) {
      return res.status(403).json({ msg: "Usuário sem cliente_id e não é admin" });
    }

    next();
  } catch (error) {
    console.error("Erro no middleware de auth:", error);
    res.status(500).json({ msg: "Erro interno no servidor" });
  }
}

async function horarioDisponivel(cliente, data, horario, ignoreId = null) {
  try {
    let query = supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente)
      .eq("data", data)
      .eq("horario", horario)
      .neq("status", "cancelado");

    if (ignoreId) query = query.neq("id", ignoreId);
    
    const { data: agendamentos, error } = await query;
    
    if (error) {
      console.error("Erro ao verificar horário disponível:", error);
      return false;
    }
    
    return agendamentos.length === 0;
  } catch (error) {
    console.error("Erro na função horarioDisponivel:", error);
    return false;
  }
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

// ---------------- CONFIGURAÇÃO DE DIAS DA SEMANA ----------------
const DIAS_SEMANA = [
  { id: 0, nome: "Domingo", abreviacao: "Dom" },
  { id: 1, nome: "Segunda-feira", abreviacao: "Seg" },
  { id: 2, nome: "Terça-feira", abreviacao: "Ter" },
  { id: 3, nome: "Quarta-feira", abreviacao: "Qua" },
  { id: 4, nome: "Quinta-feira", abreviacao: "Qui" },
  { id: 5, nome: "Sexta-feira", abreviacao: "Sex" },
  { id: 6, nome: "Sábado", abreviacao: "Sáb" }
];

// ---------------- FUNÇÕES PARA CONFIGURAÇÃO ----------------

// ---------------- FUNÇÕES AUXILIARES PARA HORÁRIOS ----------------

// Obter configuração de horários do cliente
async function getConfigHorarios(cliente) {
    const { data, error } = await supabase
        .from("config_horarios")
        .select("*")
        .eq("cliente_id", cliente)
        .single();

    if (error) {
        console.log(`Configuração não encontrada para ${cliente}, usando padrão`);
        return {
            dias_semana: [1, 2, 3, 4, 5], // Segunda a Sexta
            horarios_disponiveis: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"],
            intervalo_minutos: 60,
            max_agendamentos_dia: 10,
            datas_bloqueadas: []
        };
    }

    // Converter times para formato HH:MM
    const horariosFormatados = data.horarios_disponiveis.map(time => {
        return time.substring(0, 5); // Pega apenas HH:MM
    });

    return {
        ...data,
        horarios_disponiveis: horariosFormatados
    };
}

// Obter configuração específica para uma data
async function getConfigDataEspecifica(cliente, data) {
    const { data: configData, error } = await supabase
        .from("config_datas_especificas")
        .select("*")
        .eq("cliente_id", cliente)
        .eq("data", data)
        .single();

    if (error) return null;

    // Converter times para formato HH:MM
    const horariosFormatados = configData.horarios_disponiveis?.map(time => {
        return time.substring(0, 5);
    }) || [];

    const horariosBloqueadosFormatados = configData.horarios_bloqueados?.map(time => {
        return time.substring(0, 5);
    }) || [];

    return {
        ...configData,
        horarios_disponiveis: horariosFormatados,
        horarios_bloqueados: horariosBloqueadosFormatados
    };
}

// Obter horários disponíveis para uma data específica
async function getHorariosDisponiveis(cliente, data) {
    try {
        // 1. Obter configuração geral do cliente
        const configGeral = await getConfigHorarios(cliente);
        
        // 2. Obter configuração específica da data (se existir)
        const configData = await getConfigDataEspecifica(cliente, data);
        
        // 3. Se a data estiver bloqueada, retornar array vazio
        if (configData?.bloqueada) {
            return [];
        }
        
        // 4. Verificar se é um dia da semana permitido
        const dataObj = new Date(data);
        const diaSemana = dataObj.getDay();
        
        if (!configGeral.dias_semana.includes(diaSemana) && !configData) {
            return [];
        }
        
        // 5. Definir lista base de horários
        let horariosBase = configGeral.horarios_disponiveis;
        
        // 6. Se existe configuração específica, usar seus horários
        if (configData?.horarios_disponiveis?.length > 0) {
            horariosBase = configData.horarios_disponiveis;
        }
        
        // 7. Remover horários bloqueados da configuração específica
        if (configData?.horarios_bloqueados?.length > 0) {
            horariosBase = horariosBase.filter(horario => 
                !configData.horarios_bloqueados.includes(horario)
            );
        }
        
        // 8. Obter agendamentos existentes para a data
        const { data: agendamentos, error } = await supabase
            .from("agendamentos")
            .select("horario")
            .eq("cliente", cliente)
            .eq("data", data)
            .neq("status", "cancelado");

        if (error) throw error;
        
        // 9. Filtrar horários já ocupados
        const horariosOcupados = agendamentos.map(a => a.horario.substring(0, 5));
        const horariosDisponiveis = horariosBase.filter(horario => 
            !horariosOcupados.includes(horario)
        );
        
        // 10. Verificar limite máximo de agendamentos
        const maxAgendamentos = configData?.max_agendamentos || configGeral.max_agendamentos_dia;
        if (agendamentos.length >= maxAgendamentos) {
            return [];
        }
        
        return horariosDisponiveis.sort();
        
    } catch (error) {
        console.error("Erro ao obter horários disponíveis:", error);
        return [];
    }
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

// Obter lista de dias da semana
app.get("/api/dias-semana", (req, res) => {
  res.json(DIAS_SEMANA);
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
        dias_semana: dias_semana || [1, 2, 3, 4, 5],
        horarios_disponiveis: horarios_disponiveis || ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"],
        intervalo_minutos: intervalo_minutos || 60,
        max_agendamentos_dia: max_agendamentos_dia || 10,
        datas_bloqueadas: datas_bloqueadas || [],
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    
    // Adiciona informações dos dias da semana na resposta
    data.dias_semana_info = DIAS_SEMANA.filter(dia => data.dias_semana.includes(dia.id));
    
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
    const { startDate, endDate } = req.query;
    
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
    res.json({ configs: data || [] });
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
        horarios_disponiveis: horarios_disponiveis || null,
        horarios_bloqueados: horarios_bloqueados || [],
        max_agendamentos: max_agendamentos || null,
        bloqueada: bloqueada || false,
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

// Obter horários disponíveis para uma data
app.get("/api/horarios-disponiveis/:cliente", async (req, res) => {
    try {
        const { cliente } = req.params;
        const { data } = req.query;

        if (!data) {
            return res.status(400).json({ msg: "Data é obrigatória" });
        }

        const horarios = await getHorariosDisponiveis(cliente, data);
        res.json({ 
            horarios_disponiveis: horarios,
            data: data,
            cliente: cliente
        });
    } catch (err) {
        console.error("Erro ao obter horários disponíveis:", err);
        res.status(500).json({ msg: "Erro interno" });
    }
});

// Obter configuração completa do cliente
app.get("/api/config/:cliente", async (req, res) => {
    try {
        const { cliente } = req.params;
        const config = await getConfigHorarios(cliente);
        
        // Adicionar informações dos dias da semana
        const diasSemanaInfo = {
            0: "Domingo", 1: "Segunda", 2: "Terça", 3: "Quarta", 
            4: "Quinta", 5: "Sexta", 6: "Sábado"
        };
        
        res.json({ 
            ...config,
            dias_semana_info: diasSemanaInfo
        });
    } catch (err) {
        console.error("Erro ao obter configuração:", err);
        res.status(500).json({ msg: "Erro interno" });
    }
});

// Verificar se uma data está disponível
app.get("/api/verificar-data/:cliente", async (req, res) => {
    try {
        const { cliente } = req.params;
        const { data } = req.query;

        if (!data) {
            return res.status(400).json({ msg: "Data é obrigatória" });
        }

        const configGeral = await getConfigHorarios(cliente);
        const configData = await getConfigDataEspecifica(cliente, data);
        
        const dataObj = new Date(data);
        const diaSemana = dataObj.getDay();
        
        const disponivel = !configData?.bloqueada && 
                          (configGeral.dias_semana.includes(diaSemana) || configData);
        
        res.json({ 
            disponivel,
            motivo: !disponivel ? 
                (configData?.bloqueada ? "Data bloqueada" : "Dia da semana não disponível") : 
                "Data disponível"
        });
    } catch (err) {
        console.error("Erro ao verificar data:", err);
        res.status(500).json({ msg: "Erro interno" });
    }
});


// ---------------- ROTAS EXISTENTES (MANTIDAS) ----------------

app.get("/agendamentos/:cliente?", authMiddleware, async (req, res) => {
  try {
    let cliente = req.params.cliente;

    console.log('🔍 Parâmetro cliente:', cliente);
    console.log('👤 Usuário:', req.user);
    console.log('📊 Metadata:', req.user.user_metadata);

    // Se for admin, cliente pode ser passado ou não
    if (req.user.user_metadata?.isAdmin) {
      console.log('✅ Usuário é admin');
      
      // Admin: se não passar cliente, retorna TODOS os agendamentos
      if (!cliente || cliente === 'undefined') {
        console.log('📦 Buscando TODOS os agendamentos para admin');
        
        const { data, error } = await supabase
          .from("agendamentos")
          .select("*")
          .neq("status", "cancelado")
          .order("data", { ascending: true })
          .order("horario", { ascending: true });

        if (error) {
          console.error('❌ Erro Supabase:', error);
          throw error;
        }
        
        console.log(`✅ Admin: encontrados ${data?.length || 0} agendamentos`);
        return res.json({ agendamentos: data || [] });
      } else {
        console.log(`📦 Buscando agendamentos do cliente específico: ${cliente}`);
      }
    } else {
      // Cliente normal: força a ver apenas o próprio cliente
      console.log('👤 Usuário é cliente normal');
      if (!cliente) {
        cliente = req.user.user_metadata?.cliente_id;
        console.log(`🔧 Cliente definido do metadata: ${cliente}`);
      }
      
      if (req.user.user_metadata?.cliente_id !== cliente) {
        console.log('❌ Acesso negado: cliente não corresponde');
        return res.status(403).json({ msg: "Acesso negado" });
      }
    }

    console.log(`🔍 Buscando agendamentos para cliente: ${cliente}`);
    
    const { data, error } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("cliente", cliente)
      .neq("status", "cancelado")
      .order("data", { ascending: true })
      .order("horario", { ascending: true });

    if (error) {
      console.error('❌ Erro Supabase:', error);
      throw error;
    }
    
    console.log(`✅ Encontrados ${data?.length || 0} agendamentos para ${cliente}`);
    res.json({ agendamentos: data || [] });

  } catch (err) {
    console.error("❌ Erro ao listar agendamentos:", err);
    res.status(500).json({ msg: "Erro interno" });
  }
});


// ==== ROTA /create-pix COM EXPIRAÇÃO ====
app.post("/create-pix", async (req, res) => {
  const { amount, description, email, nome, telefone, data, horario, cliente } = req.body;

  // 🔎 Valida dados obrigatórios
  if (!amount || !email || !nome || !telefone || !data || !horario || !cliente) {
    return res.status(400).json({ error: "Faltando dados" });
  }

  try {
    // ⏰ Calcula data de expiração (15 minutos)
    const dateOfExpiration = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // 1️⃣ Cria o pagamento PIX no Mercado Pago
    const result = await payment.create({
      body: {
        transaction_amount: Number(amount),
        description: description || "Pagamento de Agendamento",
        payment_method_id: "pix",
        payer: { email },
        date_of_expiration: dateOfExpiration
      },
    });

    console.log("💰 Pagamento criado no Mercado Pago:", result.id, result.status, "Expira:", dateOfExpiration);

    // 2️⃣ Salva em pagamentos
    const { error: insertPaymentError } = await supabase
      .from("pagamentos")
      .insert([{ 
        id: result.id, 
        email: email.toLowerCase().trim(), 
        amount: Number(amount), 
        status: result.status || 'pending', 
        valid_until: null,
        description: description || "Pagamento de Agendamento"
      }]);

    if (insertPaymentError) {
      console.error("Erro ao inserir pagamento no Supabase:", insertPaymentError);
      return res.status(500).json({ error: "Erro ao salvar pagamento" });
    }

    // 3️⃣ Salva em agendamentos (pendente até aprovação do PIX)
    const { error: insertAgendamentoError } = await supabase
      .from("agendamentos")
      .insert([{ 
        cliente,
        nome,
        email: email.toLowerCase().trim(),
        telefone,
        data,
        horario,
        status: "pendente",
        confirmado: false,
        payment_id: result.id
      }]);

    if (insertAgendamentoError) {
      console.error("Erro ao criar agendamento no Supabase:", insertAgendamentoError);
      return res.status(500).json({ error: "Erro ao salvar agendamento" });
    }

    console.log("💾 Pagamento e agendamento salvos no Supabase:", result.id);

    // 4️⃣ Retorna dados pro frontend
    res.json({
      payment_id: result.id,
      status: result.status,
      qr_code: result.point_of_interaction.transaction_data.qr_code,
      qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64,
      expires_at: dateOfExpiration
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
      if (creds) {
        const doc = await accessSpreadsheet(cliente);
        await updateRowInSheet(doc.sheetsByIndex[0], id, data);
      }
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
      if (creds) {
        const doc = await accessSpreadsheet(cliente);
        await updateRowInSheet(doc.sheetsByIndex[0], id, data);
      }
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
        status: "pendente",
        confirmado: false
      })
      .eq("id", id)
      .eq("cliente", cliente)
      .select()
      .single();
    
    if (error) throw error;
    
    // Atualiza Google Sheet
    try {
      if (creds) {
        const doc = await accessSpreadsheet(cliente);
        await updateRowInSheet(doc.sheetsByIndex[0], id, data);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }
    
    res.json({msg:"Agendamento reagendado com sucesso", agendamento:data});
  } catch (error) {
    console.error("Erro ao reagendar:", error);
    res.status(500).json({msg:"Erro interno"});
  }
});



// ==== INICIALIZAR LIMPEZA AUTOMÁTICA ====
// Executar a cada 5 minutos (300000 ms)
setInterval(limparAgendamentosExpirados, 5 * 60 * 1000);

// Executar imediatamente ao iniciar o servidor
setTimeout(limparAgendamentosExpirados, 2000);

// ---------------- Health Check ----------------
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    port: PORT 
  });
});

// ========== ROTAS PARA SERVIR ARQUIVOS HTML ==========

// Serve o painel de admin (index.html)
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Serve páginas de cliente dinamicamente
app.get("/cliente/:cliente", (req, res) => {
    const cliente = req.params.cliente;
    res.sendFile(path.join(__dirname, "public", `${cliente}.html`));
});

// Rota alternativa direta para cliente1.html
app.get("/cliente1", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "cliente1.html"));
});

// Catch-all para outras rotas - redireciona para admin
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------------- Servidor ----------------
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log("⏰ Sistema de limpeza de agendamentos expirados ativo");
  console.log("🔧 Sistema de configuração de horários ativo");
  console.log("📅 Dias da semana configurados:", DIAS_SEMANA.map(d => d.abreviacao).join(", "));
  
  // Verifica configurações
  if (!process.env.MP_ACCESS_TOKEN) {
    console.warn("⚠️ Mercado Pago não está configurado");
  }
  if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
    console.warn("⚠️ Google Sheets não está configurado");
  }
});







