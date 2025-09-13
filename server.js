<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agendamento Moderno</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://unpkg.com/aos@2.3.1/dist/aos.css" rel="stylesheet">
<script src="https://unpkg.com/aos@2.3.1/dist/aos.js"></script>
<script src="https://unpkg.com/feather-icons"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<style>
  .glass-card {
    background: linear-gradient(135deg, rgba(30,40,60,0.3), rgba(50,60,80,0.3));
    border: 1px solid rgba(255,255,255,0.1);
    backdrop-filter: blur(12px);
  }
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
  #meusAgendamentos { max-height: 500px; overflow-y: auto; }
</style>
</head>
<body class="min-h-screen bg-gradient-to-br from-slate-700 to-slate-900 text-white font-sans">

<div class="container mx-auto px-4 py-12 max-w-4xl">

  <!-- Login -->
  <div id="loginSection" class="glass-card rounded-xl p-8 mb-8 shadow-xl" data-aos="fade-up">
    <h2 class="text-2xl font-semibold mb-6 flex items-center gap-2">
      <i data-feather="lock" class="w-5 h-5"></i>Acesso ao Sistema
    </h2>
    <div class="space-y-4">
      <input type="email" id="email" placeholder="Email" class="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20">
      <input type="password" id="senha" placeholder="Senha" class="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20">
      <button id="loginBtn" class="w-full bg-white text-purple-700 py-3 rounded-lg flex items-center justify-center gap-2">
        <i data-feather="log-in" class="w-5 h-5"></i>Entrar
      </button>
    </div>
  </div>

  <!-- Novo Agendamento -->
  <form id="agendamentoForm" style="display:none;" class="glass-card rounded-xl p-8 mb-8 shadow-xl hover:scale-105 transition-transform" data-aos="fade-up">
    <h2 class="text-2xl font-semibold mb-6 flex items-center gap-2">
      <i data-feather="calendar" class="w-5 h-5"></i>Novo Agendamento
    </h2>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="space-y-4">
        <input type="text" name="Nome" placeholder="Nome completo" required class="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20">
        <input type="email" name="Email" placeholder="Email" required class="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20">
      </div>
      <div class="space-y-4">
        <input type="text" name="Telefone" placeholder="Telefone" required class="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20">
        <div class="grid grid-cols-2 gap-4">
          <input type="date" name="Data" required class="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20">
          <input type="time" name="Horario" required class="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20">
        </div>
      </div>
    </div>
    <button type="submit" class="mt-6 w-full bg-purple-600 text-white py-3 rounded-lg flex items-center justify-center gap-2">
      <i data-feather="plus" class="w-5 h-5"></i>Agendar
    </button>
  </form>

  <!-- Filtros -->
  <div id="filtersSection" style="display:none;" class="glass-card rounded-xl p-6 mb-6 shadow-xl" data-aos="fade-up">
    <input type="text" id="searchInput" placeholder="Pesquisar por nome ou email" class="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 mb-2">
    <select id="statusFilter" class="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20">
      <option value="">Todos os status</option>
      <option value="pendente">Pendente</option>
      <option value="confirmado">Confirmado</option>
      <option value="cancelado">Cancelado</option>
    </select>
  </div>

  <!-- Tabs Dias -->
  <div id="diasTabs" style="display:none;" class="flex gap-2 mb-6" data-aos="fade-up">
    <button data-dia="1" class="tab-dia active px-4 py-2 rounded-lg bg-purple-600">Segunda</button>
    <button data-dia="2" class="tab-dia px-4 py-2 rounded-lg bg-white/10">Terça</button>
    <button data-dia="3" class="tab-dia px-4 py-2 rounded-lg bg-white/10">Quarta</button>
    <button data-dia="4" class="tab-dia px-4 py-2 rounded-lg bg-white/10">Quinta</button>
    <button data-dia="5" class="tab-dia px-4 py-2 rounded-lg bg-white/10">Sexta</button>
    <button data-dia="6" class="tab-dia px-4 py-2 rounded-lg bg-white/10">Sábado</button>
  </div>

  <!-- Lista de Agendamentos -->
  <div id="meusAgendamentos" class="glass-card rounded-xl p-6 shadow-xl max-h-[500px] overflow-y-auto scrollbar-hide" style="display:none;" data-aos="fade-up"></div>

</div>

<div id="toast-container" class="fixed top-4 right-4 space-y-2 z-50"></div>

<script type="module">
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://otyxjcxxqwjotnuyrvmc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let userToken = null;
let agendamentosCache = [];
let diaSelecionado = 1;

const loginSection = document.getElementById("loginSection");
const form = document.getElementById("agendamentoForm");
const meusAgendamentos = document.getElementById("meusAgendamentos");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const diasTabs = document.querySelectorAll(".tab-dia");

const pathParts = window.location.pathname.split('/');
const cliente = pathParts[1] || '';

function formatData(data){ const [y,m,d] = data.split("-"); return `${d}/${m}/${y}`; }

function showToast(msg,type="success"){
  const colors={success:"bg-green-600",error:"bg-red-600",info:"bg-blue-600",warning:"bg-yellow-600"};
  const container=document.getElementById("toast-container");
  const toast=document.createElement("div");
  toast.className=`p-4 rounded-lg shadow-md text-white font-medium ${colors[type]} opacity-0 translate-x-5 transition-all duration-500 flex items-center gap-2`;
  toast.innerHTML=`<i data-feather="${type==="success"?"check-circle":type==="error"?"alert-circle":"info"}" class="w-5 h-5"></i> <span>${msg}</span>`;
  container.appendChild(toast);
  feather.replace();
  requestAnimationFrame(()=>{ toast.classList.remove("opacity-0","translate-x-5"); toast.classList.add("opacity-100","translate-x-0"); });
  setTimeout(()=>{ toast.classList.add("opacity-0","translate-x-5"); setTimeout(()=>toast.remove(),500); },3000);
}

// --- LOGIN ---
document.getElementById("loginBtn").addEventListener("click", async()=>{
  const email=document.getElementById("email").value;
  const senha=document.getElementById("senha").value;
  const { data,error } = await supabase.auth.signInWithPassword({email,password:senha});
  if(error){ showToast(error.message,"error"); return; }
  userToken = data.session.access_token;
  loginSection.style.display='none';
  form.style.display='block';
  listarAgendamentos();
});

// --- LISTAR AGENDAMENTOS ---
async function listarAgendamentos(){
  if(!userToken) return;
  try{
    const res = await fetch(`/meus-agendamentos/${cliente}`, { headers: { "Authorization": `Bearer ${userToken}` }});
    const { agendamentos } = await res.json();
    agendamentosCache = agendamentos;
    meusAgendamentos.style.display='block';
    document.getElementById('filtersSection').style.display='block';
    document.getElementById('diasTabs').style.display='flex';
    diaSelecionado = new Date().getDay() || 1;
    renderAgendamentos();
  }catch(e){ console.error(e); showToast("Erro ao listar agendamentos","error"); }
}

// --- RENDER AGENDAMENTOS ---
function renderAgendamentos(){
  const filtroNome = searchInput.value.toLowerCase();
  const filtroStatus = statusFilter.value;
  const filtrados = agendamentosCache.filter(a=> ((a.nome+a.email).toLowerCase().includes(filtroNome)) && (filtroStatus?a.status===filtroStatus:true))
                                     .filter(a=> new Date(`${a.data}T${a.horario}`).getDay()===diaSelecionado)
                                     .sort((a,b)=>new Date(`${a.data}T${a.horario}`)-new Date(`${b.data}T${b.horario}`));
  meusAgendamentos.innerHTML='';
  if(filtrados.length===0){ meusAgendamentos.innerHTML=`<div class='text-center py-8 text-gray-300'>Nenhum agendamento</div>`; return; }

  filtrados.forEach(a=>{
    const div=document.createElement("div");
    div.className=`agendamento ${a.status} glass-card rounded-xl p-4 mb-4 shadow hover:scale-105 transition-transform`;
    div.innerHTML=`
      <strong>${formatData(a.data)} ${a.horario}</strong>
      <div><strong>Nome:</strong> ${a.nome}</div>
      <div><strong>Email:</strong> ${a.email}</div>
      <div><strong>Telefone:</strong> ${a.telefone}</div>
      <div><strong>Status:</strong> ${a.status}</div>
      <div class="mt-2 flex gap-2">
        ${!a.confirmado && a.status!=="cancelado"?`<button data-action="confirmar" data-id="${a.id}" class="px-3 py-1 bg-green-600 rounded text-white">Confirmar</button>`:""}
        ${a.status!=="cancelado"?`<button data-action="cancelar" data-id="${a.id}" class="px-3 py-1 bg-red-600 rounded text-white">Cancelar</button>`:""}
      </div>
    `;
    meusAgendamentos.appendChild(div);

    const confirmBtn=div.querySelector('button[data-action="confirmar"]');
    if(confirmBtn) confirmBtn.addEventListener("click", async()=>{
      try{
        const res=await fetch(`/confirmar/${cliente}/${a.id}`, { method:"POST", headers:{"Authorization":`Bearer ${userToken}`}});
        if(res.ok){ showToast("Confirmado!","success"); listarAgendamentos(); } 
        else showToast("Erro ao confirmar","error");
      }catch(e){ showToast("Erro de conexão","error"); }
    });

    const cancelBtn=div.querySelector('button[data-action="cancelar"]');
    if(cancelBtn) cancelBtn.addEventListener("click", async()=>{
      try{
        const res=await fetch(`/cancelar/${cliente}/${a.id}`, { method:"POST", headers:{"Authorization":`Bearer ${userToken}`}});
        if(res.ok){ showToast("Cancelado!","warning"); listarAgendamentos(); } 
        else showToast("Erro ao cancelar","error");
      }catch(e){ showToast("Erro de conexão","error"); }
    });
  });
}

// --- FILTROS ---
searchInput.addEventListener("input", renderAgendamentos);
statusFilter.addEventListener("change", renderAgendamentos);

// --- TABS DIAS ---
diasTabs.forEach(tab=>{
  tab.addEventListener("click", ()=>{
    diasTabs.forEach(t=>t.classList.replace("bg-purple-600","bg-white/10"));
    tab.classList.replace("bg-white/10","bg-purple-600");
    diaSelecionado = parseInt(tab.dataset.dia);
    renderAgendamentos();
  });
});

// --- FORM AGENDAMENTO ---
form.addEventListener("submit", async(e)=>{
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  try{
    const res=await fetch(`/agendar/${cliente}`, { method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${userToken}`}, body:JSON.stringify(data)});
    if(res.ok){ showToast("Agendamento criado!","success"); form.reset(); listarAgendamentos(); } 
    else { const err=await res.json(); showToast(err.msg,"error"); }
  }catch(e){ showToast("Erro de conexão","error"); }
});

AOS.init();
feather.replace();
</script>
</body>
</html>
