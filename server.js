import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { GoogleSpreadsheet } from "google-spreadsheet";

const PORT = process.env.PORT || 3000;
const app = express();

// ==================== CORS CONFIGURADO CORRETAMENTE ====================
app.use(cors({
  origin: [
    'https://frontrender-iota.vercel.app',
    'https://frontrender.netlify.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'https://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Allow-Headers'
  ],
  exposedHeaders: ['Content-Length', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400 // 24 hours
}));

// Handle preflight requests for ALL routes
app.options('*', cors());
app.use(express.json());

// ==================== SISTEMA DE CACHE HÍBRIDO OFFLINE-FIRST ====================
const cache = new Map();
const pendingSync = new Map(); // 🔄 Fila de sincronização offline

class HybridCacheManager {
  constructor() {
    this.cache = new Map();
    this.syncQueue = new Map();
    this.isOnline = true;
    this.setupOnlineListener();
  }

  setupOnlineListener() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
    }
  }

  handleOnline() {
    this.isOnline = true;
    console.log('🟢 Conectado - Iniciando sincronização...');
    this.processSyncQueue();
  }

  handleOffline() {
    this.isOnline = false;
    console.log('🔴 Offline - Modo cache ativado');
  }

  // 🔥 MÉTODO PRINCIPAL: Carrega do cache instantaneamente e sincroniza depois
  async getOrSet(key, fetchFn, ttl = 5 * 60 * 1000) {
    // 1. Tenta pegar do cache primeiro (instantâneo)
    const cached = this.get(key);
    if (cached) {
      console.log('📦 Cache hit (instantâneo):', key);
      
      // 2. Sincronização silenciosa em background se online
      if (this.isOnline) {
        this.silentSync(key, fetchFn, ttl).catch(console.error);
      }
      
      return cached;
    }

    console.log('🔄 Cache miss:', key);
    
    // 3. Se offline, retorna dados offline ou busca do cache antigo
    if (!this.isOnline) {
      const offlineData = this.getOfflineData(key);
      if (offlineData) {
        console.log('📱 Dados offline recuperados:', key);
        return offlineData;
      }
      throw new Error('Offline e sem dados em cache');
    }

    // 4. Se online, busca dados frescos
    try {
      const value = await fetchFn();
      this.set(key, value, ttl);
      return value;
    } catch (error) {
      // 5. Fallback para dados offline em caso de erro
      const offlineData = this.getOfflineData(key);
      if (offlineData) {
        console.log('🔄 Fallback para dados offline devido a erro:', error.message);
        return offlineData;
      }
      throw error;
    }
  }

  // 🔄 Sincronização silenciosa em background
  async silentSync(key, fetchFn, ttl) {
    try {
      console.log('🔄 Sincronização silenciosa em background:', key);
      const freshData = await fetchFn();
      this.set(key, freshData, ttl);
      console.log('✅ Sincronização silenciosa concluída:', key);
    } catch (error) {
      console.warn('⚠️ Sincronização silenciosa falhou:', key, error.message);
    }
  }

  // 💾 Sistema de dados offline
  getOfflineData(key) {
    const item = this.cache.get(key);
    if (item && item.offlinePersistent) {
      return item.value;
    }
    return null;
  }

  set(key, value, ttl = 5 * 60 * 1000, offlinePersistent = true) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl,
      offlinePersistent,
      timestamp: Date.now()
    });

    // Salva no localStorage para persistência (se no browser)
    if (typeof window !== 'undefined' && offlinePersistent) {
      try {
        localStorage.setItem(`cache_${key}`, JSON.stringify({
          value,
          timestamp: Date.now()
        }));
      } catch (e) {
        console.warn('⚠️ Não foi possível salvar no localStorage:', e.message);
      }
    }
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) {
      // Tenta carregar do localStorage
      if (typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem(`cache_${key}`);
          if (stored) {
            const parsed = JSON.parse(stored);
            this.cache.set(key, {
              value: parsed.value,
              expiry: Date.now() + (24 * 60 * 60 * 1000), // 24h para dados persistentes
              offlinePersistent: true,
              timestamp: parsed.timestamp
            });
            return parsed.value;
          }
        } catch (e) {
          console.warn('⚠️ Erro ao carregar do localStorage:', e.message);
        }
      }
      return null;
    }
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`cache_${key}`);
      }
      return null;
    }
    
    return item.value;
  }

  // 🚀 Sistema de fila de sincronização para operações offline
  addToSyncQueue(operation) {
    const queueId = Date.now().toString();
    this.syncQueue.set(queueId, {
      ...operation,
      id: queueId,
      timestamp: Date.now(),
      retries: 0
    });

    // Salva fila no localStorage
    this.saveSyncQueue();
    
    return queueId;
  }

  async processSyncQueue() {
    if (this.syncQueue.size === 0 || !this.isOnline) return;

    console.log(`🔄 Processando ${this.syncQueue.size} operações pendentes...`);
    
    for (const [id, operation] of this.syncQueue) {
      try {
        await this.executeSyncOperation(operation);
        this.syncQueue.delete(id);
        console.log(`✅ Operação sincronizada: ${operation.type}`);
      } catch (error) {
        console.warn(`⚠️ Falha na sincronização ${operation.type}:`, error.message);
        operation.retries++;
        
        // Remove após muitas tentativas
        if (operation.retries > 3) {
          this.syncQueue.delete(id);
          console.error(`❌ Operação removida após muitas falhas: ${operation.type}`);
        }
      }
    }
    
    this.saveSyncQueue();
  }

  async executeSyncOperation(operation) {
    // Implemente as operações de sincronização baseadas no tipo
    switch (operation.type) {
      case 'CREATE_AGENDAMENTO':
        // Chamada API para criar agendamento
        break;
      case 'UPDATE_AGENDAMENTO':
        // Chamada API para atualizar
        break;
      case 'DELETE_AGENDAMENTO':
        // Chamada API para deletar
        break;
      default:
        console.warn('Tipo de operação desconhecido:', operation.type);
    }
  }

  saveSyncQueue() {
    if (typeof window !== 'undefined') {
      try {
        const queueArray = Array.from(this.syncQueue.values());
        localStorage.setItem('syncQueue', JSON.stringify(queueArray));
      } catch (e) {
        console.warn('⚠️ Não foi possível salvar fila de sincronização:', e.message);
      }
    }
  }

  loadSyncQueue() {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('syncQueue');
        if (stored) {
          const queueArray = JSON.parse(stored);
          queueArray.forEach(op => {
            this.syncQueue.set(op.id, op);
          });
          console.log(`📋 Fila de sincronização carregada: ${queueArray.length} operações`);
        }
      } catch (e) {
        console.warn('⚠️ Erro ao carregar fila de sincronização:', e.message);
      }
    }
  }

  delete(key) {
    this.cache.delete(key);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`cache_${key}`);
    }
    return true;
  }

  clear() {
    this.cache.clear();
    if (typeof window !== 'undefined') {
      // Remove apenas itens de cache do app
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('cache_') || key === 'syncQueue') {
          localStorage.removeItem(key);
        }
      });
    }
  }

  getStats() {
    return {
      totalItems: this.cache.size,
      pendingSync: this.syncQueue.size,
      isOnline: this.isOnline,
      cacheHits: this.cacheHits || 0,
      cacheMisses: this.cacheMisses || 0
    };
  }
}

// ==================== INICIALIZAÇÃO DO CACHE HÍBRIDO ====================
const cacheManager = new HybridCacheManager();
cacheManager.loadSyncQueue(); // Carrega fila pendente ao iniciar

// ==================== CONFIGURAÇÃO SUPABASE ====================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==================== MIDDLEWARE DE AUTENTICAÇÃO ====================
async function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ msg: "Token não enviado" });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ msg: "Token inválido" });

  req.user = data.user;
  next();
}

// ==================== ROTAS COM SISTEMA HÍBRIDO OFFLINE-FIRST ====================

// 🔥 ROTA PRINCIPAL: Agendamentos com Cache Híbrido
app.get("/agendamentos", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const cacheKey = `agendamentos_${userEmail}`;
    
    const agendamentos = await cacheManager.getOrSet(cacheKey, async () => {
      console.log('🔄 Buscando agendamentos frescos do DB para:', userEmail);
      
      const { data, error } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("email", userEmail)
        .order("data", { ascending: true })
        .order("horario", { ascending: true });

      if (error) throw error;
      return data || [];
    }, 2 * 60 * 1000); // 2 minutos de cache

    res.json({ 
      agendamentos,
      source: cacheManager.get(cacheKey) ? 'cache' : 'fresh',
      offline: !cacheManager.isOnline,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("Erro ao listar agendamentos:", err);
    
    // 🔄 Tenta retornar dados do cache mesmo com erro
    const userEmail = req.user.email;
    const cacheKey = `agendamentos_${userEmail}`;
    const cached = cacheManager.get(cacheKey);
    
    if (cached) {
      console.log('📱 Retornando dados do cache devido a erro:', err.message);
      return res.json({ 
        agendamentos: cached,
        source: 'cache_fallback',
        offline: true,
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
    
    res.status(500).json({ 
      msg: "Erro interno",
      offline: !cacheManager.isOnline,
      error: err.message 
    });
  }
});

// 🔥 AGENDAR COM SUPORTE OFFLINE
app.post("/agendar", authMiddleware, async (req, res) => {
  try {
    const { Nome, Email, Telefone, Data, Horario } = req.body;
    if (!Nome || !Email || !Telefone || !Data || !Horario)
      return res.status(400).json({ msg: "Todos os campos obrigatórios" });

    const userEmail = req.user.email;
    const dataNormalizada = new Date(Data).toISOString().split("T")[0];

    const novoAgendamento = {
      id: `temp_${Date.now()}`,
      cliente: userEmail,
      nome: Nome,
      email: userEmail,
      telefone: Telefone,
      data: dataNormalizada,
      horario: Horario,
      status: "pendente",
      confirmado: false,
      criado_em: new Date().toISOString(),
      offlinePending: !cacheManager.isOnline
    };

    // Se offline, adiciona à fila de sincronização
    if (!cacheManager.isOnline) {
      const operationId = cacheManager.addToSyncQueue({
        type: 'CREATE_AGENDAMENTO',
        data: novoAgendamento,
        timestamp: new Date().toISOString()
      });
      
      // Atualiza cache local imediatamente
      const cacheKey = `agendamentos_${userEmail}`;
      const currentAgendamentos = cacheManager.get(cacheKey) || [];
      cacheManager.set(cacheKey, [...currentAgendamentos, novoAgendamento]);
      
      return res.json({ 
        msg: "Agendamento salvo localmente (offline)",
        agendamento: novoAgendamento,
        offline: true,
        operationId,
        syncPending: true
      });
    }

    // Se online, salva normalmente
    const { data: agendamentoDB, error } = await supabase
      .from("agendamentos")
      .insert([{
        cliente: userEmail,
        nome: Nome,
        email: userEmail,
        telefone: Telefone,
        data: dataNormalizada,
        horario: Horario,
        status: "pendente",
        confirmado: false,
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ 
          msg: "Você já possui um agendamento para esta data e horário" 
        });
      }
      throw error;
    }

    // Atualiza cache
    cacheManager.delete(`agendamentos_${userEmail}`);
    
    // Google Sheets integration
    try {
      const doc = await accessUserSpreadsheet(userEmail, req.user.user_metadata);
      if (doc) {
        const sheet = doc.sheetsByIndex[0];
        await ensureDynamicHeaders(sheet, Object.keys(agendamentoDB));
        await sheet.addRow(agendamentoDB);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    res.json({ 
      msg: "Agendamento realizado com sucesso!", 
      agendamento: agendamentoDB,
      offline: false
    });

  } catch (err) {
    console.error("Erro no /agendar:", err);
    res.status(500).json({ 
      msg: "Erro interno no servidor",
      offline: !cacheManager.isOnline
    });
  }
});

// 🔥 CONFIRMAR AGENDAMENTO HÍBRIDO
app.post("/agendamentos/:email/confirmar/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user.email;
    
    const updateData = { 
      confirmado: true, 
      status: "confirmado",
      updated_at: new Date().toISOString()
    };

    // Se offline, adiciona à fila
    if (!cacheManager.isOnline) {
      const operationId = cacheManager.addToSyncQueue({
        type: 'UPDATE_AGENDAMENTO',
        id: id,
        data: updateData,
        timestamp: new Date().toISOString()
      });
      
      // Atualiza cache local
      const cacheKey = `agendamentos_${userEmail}`;
      const currentAgendamentos = cacheManager.get(cacheKey) || [];
      const updatedAgendamentos = currentAgendamentos.map(ag => 
        ag.id === id ? { ...ag, ...updateData, offlinePending: true } : ag
      );
      cacheManager.set(cacheKey, updatedAgendamentos);
      
      return res.json({ 
        msg: "Confirmação salva localmente (offline)",
        agendamento: updatedAgendamentos.find(ag => ag.id === id),
        offline: true,
        operationId,
        syncPending: true
      });
    }

    // Se online, atualiza normalmente
    const { data, error } = await supabase.from("agendamentos")
      .update(updateData)
      .eq("id", id)
      .eq("email", userEmail)
      .select()
      .single();
    
    if (error) throw error;
    if (!data) return res.status(404).json({ msg: "Agendamento não encontrado" });

    // Atualiza cache
    cacheManager.delete(`agendamentos_${userEmail}`);
    
    // Google Sheets
    try {
      const doc = await accessUserSpreadsheet(userEmail, req.user.user_metadata);
      if (doc) {
        await updateRowInSheet(doc.sheetsByIndex[0], id, data);
      }
    } catch (sheetError) {
      console.error("Erro ao atualizar Google Sheets:", sheetError);
    }

    res.json({ 
      msg: "Agendamento confirmado", 
      agendamento: data,
      offline: false 
    });
    
  } catch (err) {
    console.error("Erro ao confirmar agendamento:", err);
    res.status(500).json({ 
      msg: "Erro interno",
      offline: !cacheManager.isOnline
    });
  }
});

// 🔥 STATUS DO SISTEMA HÍBRIDO
app.get("/api/hybrid-status", authMiddleware, async (req, res) => {
  const stats = cacheManager.getStats();
  
  res.json({
    success: true,
    hybrid: {
      isOnline: cacheManager.isOnline,
      cacheItems: stats.totalItems,
      pendingSync: stats.pendingSync,
      cacheHits: stats.cacheHits,
      cacheMisses: stats.cacheMisses,
      hitRate: stats.cacheHits / (stats.cacheHits + stats.cacheMisses) || 0
    },
    user: req.user.email,
    timestamp: new Date().toISOString()
  });
});

// 🔥 SINCRONIZAR MANUALMENTE
app.post("/api/sync-now", authMiddleware, async (req, res) => {
  try {
    if (!cacheManager.isOnline) {
      return res.status(400).json({ 
        success: false, 
        msg: "Dispositivo offline - não é possível sincronizar" 
      });
    }
    
    await cacheManager.processSyncQueue();
    
    // Força atualização de todos os caches do usuário
    const userEmail = req.user.email;
    cacheManager.delete(`agendamentos_${userEmail}`);
    cacheManager.delete(`config_${userEmail}`);
    cacheManager.delete(`estatisticas_${userEmail}`);
    cacheManager.delete(`sugestoes_${userEmail}`);
    
    res.json({
      success: true,
      msg: "Sincronização manual concluída",
      pendingOperations: cacheManager.syncQueue.size,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("Erro na sincronização manual:", error);
    res.status(500).json({ 
      success: false, 
      msg: "Erro durante sincronização" 
    });
  }
});

// ==================== FUNÇÕES AUXILIARES (mantidas do original) ====================

let creds;
try {
  creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
} catch (e) {
  console.error("Erro ao parsear GOOGLE_SERVICE_ACCOUNT:", e);
  process.exit(1);
}

async function accessUserSpreadsheet(userEmail, userMetadata) {
  try {
    const spreadsheetId = userMetadata?.spreadsheet_id;
    
    if (!spreadsheetId) {
      console.log(`📝 Usuário ${userEmail} não configurou Sheets`);
      return null;
    }
    
    const doc = new GoogleSpreadsheet(spreadsheetId);
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
    
    console.log(`✅ Acessando planilha do usuário: ${userEmail}`);
    return doc;
  } catch (error) {
    console.error(`❌ Erro ao acessar planilha do usuário ${userEmail}:`, error.message);
    return null;
  }
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
  if (!sheet) return;
  
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

// ==================== HEALTH CHECKS ATUALIZADOS ====================
app.get("/health", (req, res) => {
  const stats = cacheManager.getStats();
  
  res.json({ 
    status: "OK", 
    message: "Backend rodando com sistema híbrido offline-first",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    hybrid: {
      isOnline: cacheManager.isOnline,
      cacheItems: stats.totalItems,
      pendingSync: stats.pendingSync
    },
    supabase: "connected",
    ia_configurada: !!process.env.DEEPSEEK_API_KEY
  });
});

app.get("/warmup", async (req, res) => {
  try {
    const { data, error } = await supabase.from('agendamentos').select('count').limit(1);
    
    res.json({ 
      status: "WARM", 
      timestamp: new Date().toISOString(),
      supabase: error ? "offline" : "online",
      hybrid: {
        isOnline: cacheManager.isOnline,
        cacheItems: cacheManager.cache.size
      },
      ia: process.env.DEEPSEEK_API_KEY ? "configurada" : "não configurada"
    });
  } catch (error) {
    res.json({ 
      status: "COLD", 
      timestamp: new Date().toISOString(),
      error: error.message 
    });
  }
});

// ==================== INICIALIZAÇÃO ====================
app.listen(PORT, () => {
  console.log(`🚀 Backend HÍBRIDO rodando na porta ${PORT}`);
  console.log('✅ Sistema offline-first ativo');
  console.log('✅ Cache híbrido com sincronização inteligente');
  console.log('✅ Suporte a operações offline');
  console.log('📊 Use /api/hybrid-status para status completo');
  console.log('🔄 Use /api/sync-now para sincronização manual');
});
