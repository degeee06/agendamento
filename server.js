<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agendamento Premium</title>
    <!-- 🔒 ADICIONE ESTE BLOCO AQUI -->
    <script>
    window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90eXhqY3h4cXdqb3RudXlydm1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MzU5MTQsImV4cCI6MjA3MzAxMTkxNH0.O6pWtKMQvsIQlOt7G6nIcDMMKoTJU-G-qpZiiE6Q3Hk";
    window.API_BASE_URL = "https://agendamento-ynxr.onrender.com";
    </script>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://unpkg.com/aos@2.3.1/dist/aos.css" rel="stylesheet">
    <script src="https://unpkg.com/aos@2.3.1/dist/aos.js"></script>
    <script src="https://unpkg.com/feather-icons"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/imask/6.4.2/imask.min.js"></script>
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    
    /* ===== DESIGN SYSTEM MODERNO ===== */
    :root {
        --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        --success-gradient: linear-gradient(135deg, #10b981 0%, #059669 100%);
        --glass-bg: rgba(255, 255, 255, 0.08);
        --glass-border: rgba(255, 255, 255, 0.12);
        --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    }
    
    body {
        font-family: 'Inter', sans-serif;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        min-height: 100vh;
    }
    
    /* ===== COMPONENTES VISUAIS MODERNOS ===== */
    .glass-modern {
        background: var(--glass-bg);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid var(--glass-border);
        box-shadow: var(--glass-shadow);
    }
    
    .glass-card-enhanced {
        background: var(--glass-bg);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid var(--glass-border);
        box-shadow: 
            var(--glass-shadow),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    .glass-card-enhanced:hover {
        transform: translateY(-2px);
        box-shadow: 
            0 12px 40px rgba(0, 0, 0, 0.15),
            inset 0 1px 0 rgba(255, 255, 255, 0.15);
    }
    
    /* ===== BOTÕES PREMIUM ===== */
    .btn-premium {
        background: var(--primary-gradient);
        color: white;
        padding: 14px 28px;
        border: none;
        border-radius: 16px;
        font-weight: 600;
        font-size: 16px;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 
            0 8px 20px rgba(102, 126, 234, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
    }
    
    .btn-premium:hover {
        transform: translateY(-2px);
        box-shadow: 
            0 12px 25px rgba(102, 126, 234, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.3);
    }
    
    .btn-premium:active {
        transform: translateY(0);
    }
    
    .btn-premium::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
        transition: left 0.6s ease-in-out;
    }
    
    .btn-premium:hover::before {
        left: 100%;
    }
    
    /* ===== FORMULÁRIOS MODERNOS ===== */
    .input-modern {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        padding: 14px 16px;
        color: white;
        font-size: 16px;
        transition: all 0.3s ease;
        backdrop-filter: blur(10px);
    }
    
    .input-modern:focus {
        outline: none;
        border-color: rgba(102, 126, 234, 0.6);
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
        background: rgba(255, 255, 255, 0.12);
    }
    
    .input-modern::placeholder {
        color: rgba(255, 255, 255, 0.5);
    }
    
    /* ===== TABS MODERNAS ===== */
    .tab-modern {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 12px 20px;
        color: rgba(255, 255, 255, 0.8);
        font-weight: 500;
        transition: all 0.3s ease;
        cursor: pointer;
    }
    
    .tab-modern:hover {
        background: rgba(255, 255, 255, 0.1);
        transform: translateY(-1px);
    }
    
    .tab-modern.active {
        background: var(--primary-gradient);
        color: white;
        border-color: transparent;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    }
    
    /* ===== CARDS DE AGENDAMENTO MODERNOS ===== */
    .agendamento-card-modern {
        background: var(--glass-bg);
        backdrop-filter: blur(16px);
        border: 1px solid var(--glass-border);
        border-radius: 16px;
        padding: 20px;
        margin-bottom: 16px;
        transition: all 0.3s ease;
    }
    
    .agendamento-card-modern:hover {
        transform: translateY(-3px);
        box-shadow: 
            0 12px 28px rgba(0, 0, 0, 0.15),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.2);
    }
    
    /* ===== ANIMAÇÕES E MICROINTERAÇÕES ===== */
    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .animate-fade-in-up {
        animation: fadeInUp 0.5s ease-out;
    }
    
    @keyframes pulseSubtle {
        0%, 100% {
            box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
        }
        50% {
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.5);
        }
    }
    
    .pulse-subtle {
        animation: pulseSubtle 2s infinite;
    }
    
    /* ===== ESTILOS EXISTENTES (MANTIDOS) ===== */
    .auth-screen {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
        color: white;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        padding: 20px;
    }
    
    .spinner {
        border: 4px solid rgba(255,255,255,0.3);
        border-radius: 50%;
        border-top: 4px solid white;
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
        margin: 0 auto;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .hidden {
        display: none !important;
    }
    
    /* ESTILOS PARA AS SEÇÕES IA */
    .assistente-ia-section,
    .agendamento-ia-section,
    .sugestoes-ia-section {
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 20px;
        margin: 16px 0;
    }

    .chat-ia {
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        overflow: hidden;
    }

    .historico-chat {
        height: 280px;
        overflow-y: auto;
        padding: 12px;
        background: rgba(0, 0, 0, 0.2);
    }

    .mensagem {
        margin-bottom: 10px;
        padding: 10px;
        border-radius: 8px;
        max-width: 85%;
        font-size: 14px;
    }

    .mensagem.usuario {
        background: rgba(59, 130, 246, 0.3);
        margin-left: auto;
        border: 1px solid rgba(59, 130, 246, 0.5);
    }

    .mensagem.ia {
        background: rgba(139, 92, 246, 0.3);
        margin-right: auto;
        border: 1px solid rgba(139, 92, 246, 0.5);
    }

    .mensagem.erro {
        background: rgba(239, 68, 68, 0.3);
        border: 1px solid rgba(239, 68, 68, 0.5);
    }

    .input-chat {
        display: flex;
        padding: 12px;
        background: rgba(0, 0, 0, 0.3);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        gap: 8px;
    }

    .input-chat input {
        flex: 1;
        padding: 12px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        font-size: 16px;
    }

    .input-chat button {
        padding: 12px 16px;
        border-radius: 8px;
        background: linear-gradient(135deg, #8b5cf6, #06b6d4);
        border: none;
        color: white;
        cursor: pointer;
        white-space: nowrap;
    }

    .agendamento-rapido {
        display: flex;
        gap: 8px;
    }

    .agendamento-rapido input {
        flex: 1;
        padding: 12px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        font-size: 16px;
    }

    .agendamento-rapido button {
        padding: 12px 16px;
        border-radius: 8px;
        background: linear-gradient(135deg, #10b981, #059669);
        border: none;
        color: white;
        cursor: pointer;
    }

    .sugestoes-conteudo {
        margin-top: 16px;
    }

    .sugestoes-texto {
        white-space: pre-line;
        line-height: 1.6;
        font-size: 14px;
    }
    
    .glass-card {
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    }
    
    .scrollbar-hide::-webkit-scrollbar {
        width: 6px;
    }
    
    .scrollbar-hide::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 10px;
    }
    
    .scrollbar-hide::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 10px;
    }
    
    .scrollbar-hide::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    }
    
    .animate-fade-in {
        animation: fadeIn 0.3s ease-out forwards;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
    }
    
    .input-field {
        transition: all 0.3s ease;
        font-size: 16px;
    }
    
    .input-field:focus {
        box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.3);
    }
    
    .status-pendente {
        color: #fbbf24;
        background-color: rgba(251, 191, 36, 0.15);
        padding: 2px 6px;
        border-radius: 6px;
        font-weight: 600;
    }

    .status-confirmado {
        color: #34d399;
        background-color: rgba(52, 211, 153, 0.15);
        padding: 2px 6px;
        border-radius: 6px;
        font-weight: 600;
    }

    .status-cancelado {
        color: #f87171;
        background-color: rgba(248, 113, 113, 0.15);
        padding: 2px 6px;
        border-radius: 6px;
        font-weight: 600;
    }
    
    .tab-dia.active {
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    
    .agendamento-card {
        transition: all 0.3s ease;
    }
    
    .agendamento-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    }
    
    .loading-spinner {
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top: 2px solid white;
        width: 20px;
        height: 20px;
        animation: spin 1s linear infinite;
    }
    
    /* 🔥 CORREÇÕES MOBILE CRÍTICAS */
    @media (max-width: 640px) {
        .container {
            padding-left: 12px;
            padding-right: 12px;
        }
        
        .glass-card {
            margin-left: -8px;
            margin-right: -8px;
            border-radius: 16px;
        }
        
        .input-field {
            font-size: 16px !important;
            padding-top: 14px !important;
            padding-bottom: 14px !important;
        }
        
        .input-chat {
            padding: 12px;
            flex-direction: column;
            gap: 8px;
        }
        
        .input-chat input {
            margin-right: 0;
            font-size: 16px;
        }
        
        .input-chat button {
            width: 100%;
        }
        
        .mensagem {
            max-width: 95% !important;
            font-size: 14px;
            padding: 8px;
        }
        
        .historico-chat {
            height: 250px;
            padding: 10px;
        }
        
        .assistente-ia-section,
        .agendamento-ia-section,
        .sugestoes-ia-section {
            padding: 16px;
            margin: 12px 0;
            border-radius: 12px;
        }
        
        .mobile-w-full {
            width: 100%;
        }
        
        .mobile-flex-col {
            flex-direction: column;
        }
        
        .dias-tabs-container {
            margin-left: -8px;
            margin-right: -8px;
            padding-left: 8px;
            padding-right: 8px;
        }
        
        header h1 {
            font-size: 1.75rem !important;
        }
        
        header p {
            font-size: 0.9rem;
            padding: 0 8px;
        }
        
        .agendamentoForm .grid {
            gap: 12px !important;
        }
        
        .agendamentoForm .space-y-5 {
            gap: 16px !important;
        }
        
        /* Mobile enhancements */
        .btn-premium {
            padding: 12px 20px;
            font-size: 15px;
        }
        
        .glass-card-enhanced {
            margin: 8px 0;
        }
    }

    /* 🔥 Breakpoint extra pequeno */
    @media (max-width: 380px) {
        .text-2xl {
            font-size: 1.4rem !important;
        }
        
        .text-xl {
            font-size: 1.2rem !important;
        }
        
        .text-lg {
            font-size: 1rem !important;
        }
        
        .tab-dia, .tab-semana {
            font-size: 11px !important;
            padding-left: 8px !important;
            padding-right: 8px !important;
        }
        
        .glass-card {
            padding: 16px !important;
        }
        
        .historico-chat {
            height: 200px;
        }
        
        .mensagem {
            font-size: 13px;
        }
    }

    /* 🔥 Breakpoint tablets */
    @media (min-width: 641px) and (max-width: 768px) {
        .container {
            padding-left: 16px;
            padding-right: 16px;
        }
        
        .mensagem {
            max-width: 75%;
        }
        
        .input-chat {
            flex-direction: row;
        }
        
        .input-chat button {
            width: auto;
        }
    }

    /* 🔥 Estados de loading para IA */
    .btn-ia-loading {
        opacity: 0.7;
        cursor: not-allowed;
    }

    .input-chat input:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .mensagem.carregando {
        opacity: 0.7;
        font-style: italic;
    }

    /* 🔥 Melhorias de acessibilidade */
    @media (prefers-reduced-motion: reduce) {
        .animate-fade-in,
        .agendamento-card,
        .input-field {
            animation: none;
            transition: none;
        }
    }
    
    .settings-btn {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .settings-btn:hover {
        background: rgba(255, 255, 255, 0.2);
    }
    
    /* 🆕 ESTILOS PARA BLOQUEIO POR PERÍODOS */
    .periodo-bloqueado {
        animation: slideIn 0.3s ease-out;
    }

    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    #listaPeriodosBloqueados {
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.3) transparent;
    }

    #listaPeriodosBloqueados::-webkit-scrollbar {
        width: 6px;
    }

    #listaPeriodosBloqueados::-webkit-scrollbar-track {
        background: transparent;
    }

    #listaPeriodosBloqueados::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.3);
        border-radius: 3px;
    }

    .inicio-periodo:invalid + .fim-periodo:valid,
    .fim-periodo:invalid {
        border-color: rgba(239, 68, 68, 0.5) !important;
    }

    .inicio-periodo:valid + .fim-periodo:valid {
        border-color: rgba(34, 197, 94, 0.5) !important;
    }
    
    /* 🔧 Correção visual do select invisível */
    #tipoNegocioSelect {
      background-color: rgba(255, 255, 255, 0.1);
      color: #fff;
    }

    #tipoNegocioSelect option {
      background-color: #1f2937;
      color: #fff;
    }

    /* 🔥 CORREÇÃO: Estilos para inputs de data/time no iOS */
    input[type="date"], input[type="time"] {
        font-size: 16px !important;
        min-height: 44px !important;
    }

    /* 🔥 CORREÇÃO: Garantir que selects sejam visíveis */
    select {
        background-color: rgba(255, 255, 255, 0.1) !important;
        color: white !important;
    }

    select option {
        background-color: #1f2937 !important;
        color: white !important;
    }

    /* 🔥 CORREÇÃO: Loading states para botões IA */
    .btn-loading {
        opacity: 0.7;
        cursor: not-allowed;
    }

    .btn-loading .loading-spinner {
        display: inline-block !important;
    }

    .animate-pulse-slow {
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
    }

    /* 🔥 FALTAM ESTES ESTILOS NO SEU CSS: */

    /* Estados específicos do texto e spinner do botão agendar */
    #agendarText {
        transition: opacity 0.3s ease;
    }

    #agendarText.hidden {
        opacity: 0;
    }

    #agendarSpinner.hidden {
        display: none;
    }

    /* 🔥 ESTILOS PREMIUM QUE FALTAM: */

    /* Versão premium do botão */
    .btn-agendar-premium {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        color: white !important;
        padding: 14px 28px !important;
        border: none !important;
        border-radius: 16px !important;
        font-weight: 700 !important;
        font-size: 18px !important;
        cursor: pointer !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        box-shadow: 
            0 10px 25px -5px rgba(102, 126, 234, 0.4),
            0 4px 6px -2px rgba(0, 0, 0, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
        position: relative !important;
        overflow: hidden !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 12px !important;
        min-height: 56px !important;
        text-decoration: none !important;
        font-family: 'Inter', sans-serif !important;
    }

    /* Efeitos hover premium */
    .btn-agendar-premium:hover {
        transform: translateY(-3px) scale(1.02) !important;
        box-shadow: 
            0 20px 40px -10px rgba(102, 126, 234, 0.5),
            0 8px 12px -4px rgba(0, 0, 0, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.3) !important;
        background: linear-gradient(135deg, #764ba2 0%, #667eea 100%) !important;
    }

    /* Efeito de clique premium */
    .btn-agendar-premium:active {
        transform: translateY(-1px) scale(1.01) !important;
        box-shadow: 
            0 5px 15px -3px rgba(102, 126, 234, 0.4),
            0 2px 6px -1px rgba(0, 0, 0, 0.1) !important;
    }

    /* Efeito de brilho animado premium */
    .btn-agendar-premium::before {
        content: '' !important;
        position: absolute !important;
        top: 0 !important;
        left: -100% !important;
        width: 100% !important;
        height: 100% !important;
        background: linear-gradient(90deg, 
            transparent, 
            rgba(255, 255, 255, 0.3), 
            transparent) !important;
        transition: left 0.7s ease-in-out !important;
    }

    .btn-agendar-premium:hover::before {
        left: 100% !important;
    }

    /* Efeito de borda luminosa */
    .btn-agendar-premium::after {
        content: '' !important;
        position: absolute !important;
        top: -2px !important;
        left: -2px !important;
        right: -2px !important;
        bottom: -2px !important;
        background: linear-gradient(135deg, #667eea, #764ba2, #f093fb, #f5576c) !important;
        border-radius: 18px !important;
        z-index: -1 !important;
        opacity: 0 !important;
        transition: opacity 0.3s ease !important;
    }

    .btn-agendar-premium:hover::after {
        opacity: 1 !important;
    }

    /* Estado desabilitado premium */
    .btn-agendar-premium:disabled {
        background: linear-gradient(135deg, #9ca3af 0%, #6b7280 100%) !important;
        cursor: not-allowed !important;
        transform: none !important;
        box-shadow: 
            0 2px 8px -2px rgba(156, 163, 175, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
        opacity: 0.6 !important;
    }

    .btn-agendar-premium:disabled:hover {
        transform: none !important;
        box-shadow: 
            0 2px 8px -2px rgba(156, 163, 175, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
    }

    .btn-agendar-premium:disabled::before,
    .btn-agendar-premium:disabled::after {
        display: none !important;
    }

    /* Loading spinner premium */
    .loading-spinner-premium {
        border: 3px solid rgba(255, 255, 255, 0.3) !important;
        border-radius: 50% !important;
        border-top: 3px solid white !important;
        width: 24px !important;
        height: 24px !important;
        animation: spin 0.8s linear infinite !important;
    }

    /* Ícone do botão premium */
    .btn-agendar-premium i {
        transition: transform 0.3s ease !important;
    }

    .btn-agendar-premium:hover i {
        transform: scale(1.1) !important;
    }

    /* 🔥 ANIMAÇÃO DE PULSO PARA CHAMAR ATENÇÃO (FALTA) */
    @keyframes pulse-glow {
        0%, 100% {
            box-shadow: 
                0 10px 25px -5px rgba(102, 126, 234, 0.4),
                0 4px 6px -2px rgba(0, 0, 0, 0.05);
        }
        50% {
            box-shadow: 
                0 10px 30px -5px rgba(102, 126, 234, 0.6),
                0 6px 10px -2px rgba(0, 0, 0, 0.1),
                0 0 20px rgba(102, 126, 234, 0.4);
        }
    }

    /* Aplicar animação de pulso quando o formulário estiver em foco */
    #agendamentoForm:focus-within button[type="submit"] {
        animation: pulse-glow 2s infinite;
    }

    /* 🔥 ESTILOS ESPECÍFICOS PARA O BOTÃO DO FORMULÁRIO (FALTAM) */
    #agendamentoForm button[type="submit"] {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 16px 32px;
        border: none;
        border-radius: 16px;
        font-weight: 700;
        font-size: 18px;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 
            0 10px 25px -5px rgba(102, 126, 234, 0.4),
            0 4px 6px -2px rgba(0, 0, 0, 0.05);
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        min-height: 56px;
        width: 100%;
        max-width: 400px;
        margin: 0 auto;
    }

    #agendamentoForm button[type="submit"]:hover {
        transform: translateY(-3px);
        box-shadow: 
            0 20px 40px -10px rgba(102, 126, 234, 0.5),
            0 8px 12px -4px rgba(0, 0, 0, 0.1);
        background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
    }

    #agendamentoForm button[type="submit"]:active {
        transform: translateY(-1px);
        box-shadow: 
            0 5px 15px -3px rgba(102, 126, 234, 0.4),
            0 2px 6px -1px rgba(0, 0, 0, 0.1);
    }

    /* 🔥 RESPONSIVIDADE ESPECÍFICA PARA O BOTÃO AGENDAR (FALTAM) */
    @media (max-width: 768px) {
        #agendamentoForm button[type="submit"] {
            padding: 14px 24px;
            font-size: 16px;
            min-height: 52px;
        }
        
        .btn-agendar-premium {
            padding: 12px 20px !important;
            font-size: 16px !important;
            min-height: 48px !important;
        }
    }

    @media (max-width: 480px) {
        #agendamentoForm button[type="submit"] {
            padding: 12px 20px;
            font-size: 16px;
            min-height: 48px;
            border-radius: 14px;
        }
    }
    
    /* 🔥 FORÇAR DESIGN DO SEU BOTÃO SOBRE O HOTMART */
    .hotmart-fb.hotmart__button-checkout {
        background: linear-gradient(to right, #f59e0b, #ea580c) !important;
        background-color: transparent !important;
        border: none !important;
        color: white !important;
        font-weight: 700 !important;
        font-size: 16px !important;
        text-decoration: none !important;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important;
        border-radius: 12px !important;
        padding: 12px 16px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 8px !important;
        transition: all 0.3s ease !important;
        cursor: pointer !important;
    }

    .hotmart-fb.hotmart__button-checkout:hover {
        background: linear-gradient(to right, #d97706, #dc2626) !important;
        transform: translateY(-2px) !important;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
    }

    /* 🔥 REMOVER ESTILOS PADRÃO DO HOTMART */
    .hotmart-fb.hotmart__button-checkout:before,
    .hotmart-fb.hotmart__button-checkout:after {
        display: none !important;
    }
    </style>
</head>
<body class="min-h-screen text-white">
<!-- 🎯🎯🎯 TELA DE AUTENTICAÇÃO 🎯🎯🎯 -->
<div id="authCallbackScreen" class="auth-screen hidden">
    <div class="glass-card-enhanced rounded-2xl p-6 md:p-8 w-full max-w-md mx-auto animate-fade-in-up" data-aos="fade-up">
        <!-- Header Elegante -->
        <div class="flex items-center justify-center mb-6">
            <div class="p-3 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-lg">
                <i data-feather="lock" class="w-6 h-6 text-white"></i>
            </div>
        </div>

        <h2 class="text-xl sm:text-2xl font-semibold text-center mb-2">Autenticando</h2>
        <p class="text-center text-gray-300 mb-6">Conectando sua conta...</p>

        <!-- Spinner Central -->
        <div class="flex justify-center mb-6">
            <div class="spinner"></div>
        </div>

        <!-- Status e Informações -->
        <div class="text-center space-y-4">
            <p class="text-gray-300 animate-pulse-slow">Redirecionando de volta para o app</p>
            
            <!-- Informações de Debug (apenas em desenvolvimento) -->
            <div id="debugInfo" class="mt-6 p-4 bg-white/5 rounded-lg border border-white/10 text-left hidden">
                <h3 class="text-sm font-semibold mb-2">🔍 Informações de Conexão:</h3>
                <div class="text-xs space-y-1">
                    <div id="urlInfo"></div>
                    <div id="hashInfo"></div>
                    <div id="envInfo"></div>
                    <div id="tokenInfo"></div>
                </div>
            </div>

            <!-- Botão de Fallback -->
            <div class="mt-6 pt-6 border-t border-white/10">
                <button id="manualRedirect" class="text-sm text-cyan-300 hover:text-cyan-200 transition-colors hidden flex items-center justify-center gap-2 w-full">
                    <i data-feather="refresh-cw" class="w-4 h-4"></i>
                    Redirecionar manualmente
                </button>
            </div>
        </div>
    </div>
</div>

<!-- 🔒 MODAL DE TERMOS DE USO -->
<div id="termsModal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 hidden">
    <div class="glass-card-enhanced rounded-2xl p-6 max-w-2xl max-h-[80vh] overflow-y-auto mx-4">
        <!-- Header -->
        <div class="flex items-center justify-center mb-6">
            <div class="p-3 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg">
                <i data-feather="file-text" class="w-6 h-6 text-white"></i>
            </div>
        </div>
        
        <h3 class="text-xl font-semibold text-center mb-2">📝 Termos de Uso</h3>
        <p class="text-center text-gray-300 mb-6">Leia e aceite para continuar</p>
        
        <!-- ✅ CONTEÚDO DOS TERMOS -->
        <div class="bg-white/5 rounded-lg p-4 mb-6 max-h-60 overflow-y-auto">
            <div class="text-sm space-y-3 text-gray-200">
                <strong>Data de criação: 2025</strong>

                <h4 class="font-semibold text-cyan-300">1. Aceitação dos Termos</h4>
                <p>Ao utilizar nosso sistema de agendamentos, você concorda com estes Termos de Uso e nossa Política de Privacidade.</p>

                <h4 class="font-semibold text-cyan-300">2. Uso do Serviço</h4>
                <p>Você concorda em usar a plataforma apenas para fins legítimos de agendamento de serviços, sendo responsável por todas as informações cadastradas.</p>

                <h4 class="font-semibold text-cyan-300">3. Privacidade e Dados</h4>
                <p>Seus dados de agendamento são armazenados com segurança em servidores protegidos. Não compartilhamos suas informações com terceiros não autorizados.</p>

                <h4 class="font-semibold text-cyan-300">4. Responsabilidades</h4>
                <p>Você é integralmente responsável pela veracidade das informações fornecidas e pelos agendamentos realizados através da plataforma.</p>

                <h4 class="font-semibold text-cyan-300">5. Limitações de Uso</h4>
                <p>O serviço pode possuir limitações técnicas conforme seu plano atual (free trial ou premium). Reservamo-nos o direito de suspender contras em caso de uso inadequado.</p>

                <h4 class="font-semibold text-cyan-300">6. Modificações</h4>
                <p>Podemos atualizar estes termos periodicamente. O uso continuado após alterações significa sua aceitação.</p>

                <p class="text-xs text-gray-400 mt-4">
                    🔒 <strong>Proteção de Dados:</strong> Este sistema segue as melhores práticas de segurança e proteção de dados pessoais.
                </p>

                <p class="text-xs text-gray-400 mt-2">
                    Ao clicar em "Aceitar e Continuar", você declara ter lido, compreendido e concordado com todos os termos acima.
                </p>
            </div>
        </div>

        <!-- ✅ BOTÕES VERTICAIS -->
        <div class="flex flex-col gap-3">
            <button onclick="declineTerms()" class="w-full px-4 py-3 rounded-lg bg-gray-600 hover:bg-gray-700 transition-all text-white font-medium">
                Recusar
            </button>
            <button onclick="acceptTerms()" class="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-90 transition-all text-white font-medium">
                ✅ Aceitar e Continuar
            </button>
        </div>
    </div>
</div>

<!-- 🎯🎯🎯 CONTEÚDO PRINCIPAL 🎯🎯🎯 -->
<div id="mainAppContent">
    <div class="container mx-auto px-4 py-8 max-w-6xl">
      
        <!-- 🔥 HEADER COM BADGE AO LADO DO TÍTULO -->
        <header class="text-center mb-8 md:mb-12" data-aos="fade-down">
            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-3">
                <!-- Título e Badge juntos -->
                <div class="flex items-center justify-center gap-4">
                    <h1 class="text-2xl sm:text-3xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-300">
                       Agendamento
                    </h1>
                    <!-- 🔥 BADGE AO LADO DO TÍTULO -->
                    <div id="premiumBadge" class="hidden bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs px-3 py-2 rounded-lg shadow-lg border border-white/20">
                        <span id="usageCount">0/5</span>
                    </div>
                </div>
                
                <div class="flex gap-2 w-full sm:w-auto">
                    <button id="gerarLinkBtn" style="display:none;" 
                            class="btn-premium text-xs sm:text-sm px-3 py-2 rounded-lg flex items-center justify-center gap-2 w-full sm:w-auto">
                        <i data-feather="link" class="w-3 h-3 sm:w-4 sm:h-4"></i>
                        Gerar Link
                    </button>
                    <button id="settingsBtn" style="display:none;" class="text-xs sm:text-sm bg-gray-600 hover:bg-gray-700 px-3 py-2 rounded-lg flex items-center justify-center gap-2 w-full sm:w-auto">
                        <i data-feather="settings" class="w-3 h-3 sm:w-4 sm:h-4"></i>
                        Configurações
                    </button>
                    <button id="logoutBtn" style="display:none;" class="text-xs sm:text-sm bg-red-600 hover:bg-red-700 px-3 py-2 rounded-lg flex items-center justify-center gap-2 w-full sm:w-auto">
                        <i data-feather="log-out" class="w-3 h-3 sm:w-4 sm:h-4"></i>
                        Sair
                    </button>
                </div>
            </div>
            <p class="text-sm sm:text-lg opacity-90 max-w-2xl mx-auto px-2">
                Gerencie seus compromissos com uma interface intuitiva e elegante
            </p>
        </header>

        <!-- 🔐 SESSÕES IA (APÓS LOGIN) -->
        <div id="secoesIA" style="display: none;">

            <!-- 🎯 SUGERIR HORÁRIOS LIVRES -->
            <div class="agendamento-ia-section glass-card-enhanced" data-aos="fade-up">
                <h3 class="text-xl font-semibold mb-4 flex items-center gap-2">
                    <span>🎯</span>
                    Sugerir Horários Livres
                </h3>
                
                <div class="agendamento-rapido">
                    <button onclick="sugerirHorarios()" class="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white font-medium hover:opacity-90 transition-all flex items-center justify-center gap-2">
                        <span>📅</span>
                        Encontrar Melhores Horários
                    </button>
                </div>
                
                <div id="sugestoes-horarios" class="mt-3">
                    <!-- Sugestões aparecem aqui -->
                </div>
            </div>

            <!-- 📊 ANÁLISE E ESTATÍSTICAS -->
            <div class="sugestoes-ia-section glass-card-enhanced" data-aos="fade-up">
                <h3 class="text-xl font-semibold mb-4 flex items-center gap-2">
                    <span>📊</span>
                    Análise e Estatísticas
                </h3>
                
                <button id="btn-estatisticas" onclick="verEstatisticasIA()" class="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-medium hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    <span id="btn-estatisticas-text">📈 Ver Estatísticas Detalhadas</span>
                    <div id="btn-estatisticas-spinner" class="loading-spinner hidden" style="width:20px;height:20px;"></div>
                </button>
                
                <div id="sugestoes-conteudo" class="sugestoes-conteudo mt-4">
                    <!-- Estatísticas aparecem aqui -->
                </div>
            </div>
                
        </div> 

        <!-- Login Section - DESIGN MODERNO -->
        <div id="loginSection" class="glass-card-enhanced rounded-3xl p-10 mb-8" data-aos="fade-up">
            <!-- Header Moderno -->
            <div class="text-center mb-10">
                <div class="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300">
                    <i data-feather="lock" class="w-10 h-10 text-white"></i>
                </div>
                <h2 class="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent mb-3">Acesso ao Sistema</h2>
                <p class="text-gray-400 text-lg">Entre com sua conta Google</p>
            </div>

            <!-- Botão Google Moderno -->
            <div class="max-w-sm mx-auto space-y-6">
                <button id="googleLoginBtn" class="w-full group bg-white text-gray-800 py-4 px-8 rounded-2xl font-semibold hover:shadow-2xl transition-all duration-300 flex items-center justify-center gap-4 shadow-lg border border-gray-200 hover:border-blue-300 hover:scale-[1.02] active:scale-[0.98]">
                    <!-- Logo Google SVG -->
                    <svg class="w-6 h-6 transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span class="text-gray-700 group-hover:text-gray-900 transition-colors duration-300">Continuar com Google</span>
                </button>

                <!-- ✅ CHECKBOX TERMOS AQUI (ADICIONE ISSO) -->
                <div class="max-w-sm mx-auto mb-6">
                    <div class="p-4 bg-white/5 rounded-lg border border-white/10">
                        <label class="flex items-start gap-3 cursor-pointer">
                            <input type="checkbox" id="aceiteTermos" required 
                                   class="mt-1 rounded bg-white/10 border-white/20 focus:ring-2 focus:ring-cyan-500">
                            <span class="text-sm text-gray-300">
                                Concordo com os 
                                <button type="button" onclick="abrirModalTermos()" class="text-cyan-400 hover:text-cyan-300 underline">
                                    Termos de Uso
                                </button> 
                                e 
                                <button type="button" onclick="abrirModalPrivacidade()" class="text-cyan-400 hover:text-cyan-300 underline">
                                    Política de Privacidade
                                </button>
                            </span>
                        </label>
                    </div>
                </div>
                
                <!-- Aviso de Segurança Moderno -->
                <div class="text-center p-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-2xl border border-blue-500/20">
                    <p class="text-gray-400 text-sm flex items-center justify-center gap-2">
                        <i data-feather="shield" class="w-4 h-4 text-blue-400"></i>
                        <span class="font-medium">Login 100% seguro</span>
                        <span class="text-gray-500">•</span>
                        <span>Seus dados protegidos</span>
                    </p>
                </div>
            </div>
        </div>
        
        <!-- Appointment Form (Hidden Initially) -->
        <form id="agendamentoForm" style="display:none;" class="glass-card-enhanced rounded-2xl p-4 sm:p-6 md:p-8 mb-6 md:mb-8" data-aos="fade-up">
            <div class="flex items-center justify-center mb-4 md:mb-6">
                <div class="p-2 sm:p-3 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-lg">
                    <i data-feather="calendar" class="w-4 h-4 sm:w-6 sm:h-6 text-white"></i>
                </div>
            </div>
            <h2 class="text-xl sm:text-2xl font-semibold text-center mb-4 md:mb-6">Novo Agendamento</h2>
            <div class="grid grid-cols-1 gap-4 sm:gap-5 max-w-4xl mx-auto">
                <div class="space-y-4 sm:space-y-5">
                    <div>
                        <label for="Nome" class="block mb-2 text-sm font-medium opacity-80">Nome Completo</label>
                        <div class="relative">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <i data-feather="user" class="w-4 h-4 sm:w-5 sm:h-5 text-gray-400"></i>
                            </div>
                            <input type="text" name="Nome" placeholder="Seu nome" required 
                                   class="input-modern w-full pl-10 pr-4 py-2 sm:py-3 text-sm sm:text-base">
                        </div>
                    </div>
                    <div>
                        <label for="Email" class="block mb-2 text-sm font-medium opacity-80">Email</label>
                        <div class="relative">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <i data-feather="mail" class="w-4 h-4 sm:w-5 sm:h-5 text-gray-400"></i>
                            </div>
                            <input type="email" name="Email" placeholder="Email (opcional)" 
                                   class="input-modern w-full pl-10 pr-4 py-2 sm:py-3 text-sm sm:text-base">
                        </div>
                    </div>
                </div>
                <div class="space-y-4 sm:space-y-5">
                    <!-- Telefone -->
                    <div>
                        <label for="telefone" class="block mb-2 text-sm font-medium opacity-80">Telefone</label>
                        <div class="relative">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <i data-feather="phone" class="w-5 h-5 text-gray-400"></i>
                            </div>
                            <input type="tel" id="Telefone" name="Telefone" placeholder="(00) 00000-0000" required 
                                   class="input-modern w-full pl-10 pr-4 py-3">
                        </div>
                    </div>
                    <div class="grid grid-cols-1 xs:grid-cols-2 gap-3 sm:gap-4">
                        <div>
                            <label for="Data" class="block mb-2 text-sm font-medium opacity-80">Data</label>
                            <div class="relative">
                                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <i data-feather="calendar" class="w-4 h-4 sm:w-5 sm:h-5 text-gray-400"></i>
                                </div>
                                <input type="date" id="Data" name="Data" placeholder="Data do Agendamento" required 
                                       class="input-modern w-full pl-10 pr-4 py-2 sm:py-3 text-sm sm:text-base">
                            </div>
                        </div>
                        <div>
                            <label for="Horario" class="block mb-2 text-sm font-medium opacity-80">Horário</label>
                            <div class="relative">
                                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <i data-feather="clock" class="w-4 h-4 sm:w-5 sm:h-5 text-gray-400"></i>
                                </div>
                                <input type="time" id="Horario" name="Horario" placeholder="Horário" required 
                                       class="input-modern w-full pl-10 pr-4 py-2 sm:py-3 text-sm sm:text-base">
                            </div>
                            <p class="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                <i data-feather="info" class="w-3 h-3"></i>
                                <span>Dica: Horários flexíveis disponíveis (ex: 09:25, 14:45)</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            <div class="max-w-md mx-auto mt-6 md:mt-8">
                <button type="submit" class="btn-premium w-full py-2 sm:py-3 px-6 text-sm sm:text-base">
                    <i data-feather="plus" class="w-4 h-4 sm:w-5 sm:h-5"></i>
                    <span id="agendarText">Agendar</span>
                    <div id="agendarSpinner" class="loading-spinner hidden"></div>
                </button>
            </div>
        </form>
        
        <!-- Filters Section -->
        <div id="filtersSection" style="display:none;" class="glass-card-enhanced rounded-2xl p-6 mb-6" data-aos="fade-up">
            <div class="flex flex-col md:flex-row gap-4 items-center">
                <div class="flex-1 w-full">
                    <label for="searchInput" class="sr-only">Pesquisar</label>
                    <div class="relative">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <i data-feather="search" class="w-5 h-5 text-gray-400"></i>
                        </div>
                        <input type="text" id="searchInput" placeholder="Pesquisar por nome ou email" 
                               class="input-modern w-full pl-10 pr-4 py-3">
                    </div>
                </div>
                <div class="w-full md:w-48 relative">
                    <label for="statusFilter" class="sr-only">Status</label>
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <i data-feather="filter" class="w-5 h-5 text-gray-400"></i>
                    </div>
                    <select id="statusFilter" 
                        class="input-modern w-full appearance-none pl-10 pr-4 py-3 text-white">
                        <option value="" class="text-black">Todos os status</option>
                        <option value="pendente" class="text-black">Pendente</option>
                        <option value="confirmado" class="text-black">Confirmado</option>
                        <option value="cancelado" class="text-black">Cancelado</option>
                    </select>
                </div>
                <div class="flex gap-2 mobile-w-full mobile-flex-col md:flex-row">
                    <button id="exportCSVBtn" class="px-4 py-3 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition-all flex items-center justify-center gap-2 mobile-w-full">
                        <i data-feather="download" class="w-5 h-5"></i>
                        <span class="hidden md:inline">CSV</span>
                    </button>
                    <button id="exportPDFBtn" class="px-4 py-3 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition-all flex items-center justify-center gap-2 mobile-w-full">
                        <i data-feather="file-text" class="w-5 h-5"></i>
                        <span class="hidden md:inline">PDF</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- 📅 TABS DIAS DA SEMANA -->
        <div id="diasTabs" style="display:none;" class="flex flex-col gap-4 mb-6" data-aos="fade-up">
            <div class="flex justify-center gap-2 overflow-x-auto pb-2">
                <button data-dia="0" class="tab-modern">Dom</button>
                <button data-dia="1" class="tab-modern active">Seg</button>
                <button data-dia="2" class="tab-modern">Ter</button>
                <button data-dia="3" class="tab-modern">Qua</button>
                <button data-dia="4" class="tab-modern">Qui</button>
                <button data-dia="5" class="tab-modern">Sex</button>
                <button data-dia="6" class="tab-modern">Sáb</button>
            </div>
            <div class="flex justify-center gap-2 overflow-x-auto pb-2">
                <button data-semana="-1" class="tab-modern">Sem Passada</button>
                <button data-semana="-2" class="tab-modern">2 Semanas</button>
                <button data-semana="-4" class="tab-modern">1 Mês</button>
            </div>
        </div>

        <!-- 📋 LISTA DE AGENDAMENTOS -->
        <div id="meusAgendamentos" class="glass-card-enhanced p-6 shadow-xl max-h-[500px] overflow-y-auto scrollbar-custom mx-auto max-w-4xl" style="display:none;" data-aos="fade-up">
            <div class="text-center py-8">
                <div class="p-4 rounded-full bg-white/10 inline-block mb-4">
                    <i data-feather="calendar" class="w-8 h-8 text-gray-300"></i>
                </div>
                <p class="text-gray-300">Nenhum agendamento encontrado</p>
            </div>
        </div>
    </div>
</div>

<!-- Modal de Configuração do Google Sheets - VERSÃO SIMPLIFICADA -->
<div id="configSheetsModal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 hidden">
    <div class="glass-card-enhanced rounded-2xl p-8 max-w-md w-full mx-4 animate-fade-in-up">
        <div class="flex items-center justify-center mb-6">
            <div class="p-3 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 shadow-lg">
                <i data-feather="file-text" class="w-6 h-6 text-white"></i>
            </div>
        </div>
        
        <h3 class="text-2xl font-semibold text-center mb-2">🎯 Configurar Google Planilhas</h3>
        <p class="text-center text-gray-300 mb-6">Escolha como deseja sincronizar seus agendamentos</p>
        
        <div class="space-y-6">
            <!-- 🔥 REMOVIDA A SEÇÃO: Criar Planilha Automática -->

            <div class="config-option p-4 rounded-lg bg-white/5 border border-white/10">
                <h4 class="font-semibold mb-2 flex items-center gap-2">
                    <i data-feather="link" class="w-4 h-4 text-blue-400"></i>
                     Usar Minha Planilha Existente
                </h4>
                <p class="text-sm text-gray-300 mb-3">Cole o ID da sua planilha do Google Planilhas</p>
                <input type="text" id="spreadsheetIdInput" 
                       placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                       class="input-modern w-full px-3 py-2 mb-2 text-sm">
                <button class="btn-premium w-full py-2 px-4 flex items-center justify-center gap-2">
                    <i data-feather="save" class="w-4 h-4"></i>
                    💾 Usar Esta Planilha
                </button>
            </div>

            <div class="config-option p-4 rounded-lg bg-white/5 border border-white/10">
                <h4 class="font-semibold mb-2 flex items-center gap-2">
                    <i data-feather="clock" class="w-4 h-4 text-yellow-400"></i>
                    ⏭️ Configurar Depois
                </h4>
                <p class="text-sm text-gray-300 mb-3">Você pode agendar normalmente e configurar depois</p>
                <button class="w-full bg-gradient-to-r from-gray-500 to-slate-600 text-white py-2 px-4 rounded-lg font-medium hover:opacity-90 transition-all">
                    Pular por enquanto
                </button>
            </div>
        </div>

        <div class="mt-4 text-center">
            <p class="text-xs text-gray-400">
                💡 <strong>Como encontrar o ID da planilha:</strong><br>
                Abra sua planilha no Google Planilhas e veja na URL:<br>
                <code class="bg-black/30 px-1 rounded">docs.google.com/spreadsheets/d/<strong>SEU_ID_AQUI</strong>/edit</code>
            </p>
        </div>
    </div>
</div>


    <!-- Toast Container -->
    <div id="toast-container" class="fixed top-4 right-4 space-y-2 z-50"></div>

    <script type="module">
        import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";


// ✅ ADICIONE ISSO NO INÍCIO DO SEU type="module" (logo após os imports)
window.abrirModalTermos = function() {
    document.getElementById('termsModal').classList.remove('hidden');
};

window.abrirModalPrivacidade = function() {
    window.abrirModalTermos();
};

window.acceptTerms = async function() {
    try {
        console.log('✅ Salvando aceitação de termos...');
        
        // 1️⃣ Salva no localStorage (performance)
        localStorage.setItem('termsAccepted', 'true');
        localStorage.setItem('termsAcceptedAt', new Date().toISOString());
        localStorage.setItem('termsVersion', '1.0');
        
        // 2️⃣ Marca o checkbox automaticamente
        document.getElementById('aceiteTermos').checked = true;
        
        // 3️⃣ Salva no banco (segurança/legal) - MAS SÓ SE USUÁRIO JÁ ESTIVER LOGADO
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
            const { error } = await supabase
                .from('user_terms_acceptance')
                .insert({
                    user_id: user.id,
                    user_email: user.email,
                    terms_version: '1.0',
                    user_agent: navigator.userAgent
                });
            
            if (error) throw error;
            console.log('📝 Termos salvos no banco com sucesso!');
        }
        
        // Fecha modal
        document.getElementById('termsModal').classList.add('hidden');
        showToast('Termos aceitos com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao salvar termos:', error);
        showToast('Termos aceitos localmente!', 'success');
    }
};

window.declineTerms = function() {
    console.log('❌ Usuário recusou os termos');
    document.getElementById('termsModal').classList.add('hidden');
};

        
        
      // 🔥 CORREÇÃO: Função verificarCallbackOAuth atualizada
function verificarCallbackOAuth() {
    console.log('🔄 Verificando se é callback OAuth...');
    
    const isCallback = window.location.hash.includes('access_token') || 
                       window.location.hash.includes('error');
    
    if (isCallback) {
        console.log('🎯 Detectado callback OAuth - processando...');
        
        // MOSTRA TELA DE AUTENTICAÇÃO
        document.getElementById('authCallbackScreen').classList.remove('hidden');
        document.getElementById('mainAppContent').classList.add('hidden');
        
        // Processa o callback
        processarCallbackOAuth();
        return true;
    }
    
    return false;
}

        
// 🔥 CORREÇÃO: Função processarCallbackOAuth atualizada para carregar usos
async function processarCallbackOAuth() {
    try {
        console.log('🔄 Processando callback OAuth...');
        
        // Aguarda o Supabase processar a sessão
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
            throw error;
        }
        
        if (session) {
            console.log('✅ Sessão OAuth restaurada!');
            
            userToken = session.access_token;
            localStorage.setItem('userToken', userToken);
            
            // 🔥 INICIALIZAÇÃO IMEDIATA DO PREMIUM MANAGER
            if (!premiumManager) {
                premiumManager = new PremiumManager();
                await premiumManager.startTrial();
            }
            
            // Limpa a URL
            window.history.replaceState(null, '', window.location.pathname);
            
            // Mostra app normal
            document.getElementById('authCallbackScreen').classList.add('hidden');
            document.getElementById('mainAppContent').classList.remove('hidden');
            
            // Atualiza interface
            loginSection.style.display = 'none';
            form.style.display = 'block';
            
            // 🔥 ATUALIZAÇÃO IMEDIATA DO BADGE
            await premiumManager.updateUsageBadge();
            
            atualizarInterfacePosLogin();
            document.getElementById('secoesIA').style.display = 'block';
            
            listarAgendamentos();
            setTimeout(() => iniciarSistemaAtualizacao(), 1000);
            showToast("Login realizado com sucesso!", "success");
            await saveTermsAcceptanceToDatabase();

            // 🔥 VERIFICAÇÃO DE LIMITE APÓS LOGIN
            setTimeout(async () => {
                if (premiumManager && userToken) {
                    const status = await premiumManager.checkTrialStatus();
                    console.log('📊 Status no login OAuth:', status);
                    
                    if (status.hasTrial && status.dailyUsagesLeft <= 0) {
                        console.log('🚫 Usuário logou já sem usos disponíveis');
                        const limit = status.isPremiumTrial ? 15 : 5;
                        premiumManager.showDailyLimitModal(limit);
                    }
                }
            }, 2000);

        } else {
            throw new Error('Sessão não encontrada');
        }
    } catch (error) {
        console.error('❌ Erro OAuth:', error);
        showToast("Erro ao processar login", "error");
        setTimeout(() => {
            window.location.href = '/';
        }, 2000);
    }
}
        
      

       

        // 🔥 FUNÇÃO PARA FECHAR BROWSER
        async function fecharBrowserCapacitor() {
            console.log('🎯 Tentando fechar browser...');
            
            if (window.Capacitor && window.Capacitor.Plugins?.Browser) {
                try {
                    console.log('✅ Usando Capacitor Browser.close()');
                    await window.Capacitor.Plugins.Browser.close();
                    return;
                } catch (error) {
                    console.log('❌ Capacitor Browser.close() falhou:', error);
                }
            }
            
            try {
                window.close();
            } catch (error) {
                window.location.href = 'about:blank';
            }
        }


        // ---------------- CONFIGURAÇÃO BACKEND ----------------
        const API_BASE_URL = window.API_BASE_URL || 'https://agendamento-ynxr.onrender.com';

        const SUPABASE_URL = "https://otyxjcxxqwjotnuyrvmc.supabase.co";
        const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        let userToken = null;
        let agendamentosCache = [];
        let diaSelecionado = 1;
        let telefoneMask = null;
        let premiumManager = null;

    // 🔥 ADICIONAR CLASSE COMPLETA DO PREMIUM MANAGER
class PremiumManager {
    constructor() {
        this.cache = new Map();
    }

   // ✅ VERIFICAÇÃO: Garantir que hasTrial continua true mesmo sem usos
async checkTrialStatus() {
    if (!userToken) {
        return { hasTrial: false, dailyUsagesLeft: 0 };
    }
    
    try {
        const trial = await this.getUserTrial();
        if (!trial) {
            return { hasTrial: false, dailyUsagesLeft: 0 };
        }
        
        const subscription = await this.getUserSubscription();
        if (subscription && subscription.status === 'active') {
            const subscriptionDays = Math.floor((new Date() - new Date(subscription.starts_at)) / (1000 * 60 * 60 * 24));
            
            if (subscriptionDays < 7) {
                const dailyUsage = await this.getDailyUsage(trial, 15);
                return {
                    hasTrial: true, // 🔥 SEMPRE true se tem trial
                    isPremiumTrial: true,
                    dailyUsagesLeft: dailyUsage.dailyUsagesLeft,
                    unlimited: false
                };
            } else {
                return {
                    hasTrial: true, // 🔥 SEMPRE true se tem trial  
                    unlimited: true,
                    dailyUsagesLeft: 999
                };
            }
        }
        
        const dailyUsage = await this.getDailyUsage(trial, 5);
        
        // 🔥 CORREÇÃO: hasTrial continua true mesmo sem usos disponíveis
        if (trial.status !== 'active') {
            return { hasTrial: false, dailyUsagesLeft: 0 };
        }
        
        // 🔥 MANTÉM hasTrial: true MESMO QUANDO dailyUsagesLeft = 0
        return {
            hasTrial: true, // 🔥 ESTA É A CORREÇÃO PRINCIPAL
            isFreeTrial: true,
            dailyUsagesLeft: dailyUsage.dailyUsagesLeft
        };
        
    } catch (error) {
        console.error('❌ Erro ao verificar trial:', error);
        return { hasTrial: false, dailyUsagesLeft: 0 };
    }
}

    // ✅ REGISTRAR USO
    async registerUsage() {
        if (!userToken) return false;
        
        try {
            const status = await this.checkTrialStatus();
            
            if (status.unlimited) {
                console.log('🚀 Usuário Premium - Uso ilimitado permitido');
                return true;
            }
            
            if (status.isPremiumTrial) {
                if (status.dailyUsagesLeft > 0) {
                    console.log('🎯 Premium Trial - Usando 1 dos', status.dailyUsagesLeft, 'restantes');
                    return await this.registerDailyUsage(15);
                } else {
                    console.log('🚫 Premium Trial - Limite diário de 15 usos atingido');
                    this.showDailyLimitModal(15);
                    return false;
                }
            }
            
            if (status.isFreeTrial && status.hasTrial) {
                if (status.dailyUsagesLeft > 0) {
                    console.log('📝 Free Trial - Usando 1 dos', status.dailyUsagesLeft, 'restantes');
                    return await this.registerDailyUsage(5);
                } else {
                    console.log('🚫 Free Trial - Limite diário de 5 usos atingido');
                    this.showDailyLimitModal(5);
                    return false;
                }
            }
            
            console.log('❌ Nenhum uso disponível');
            return false;
            
        } catch (error) {
            console.error('❌ Erro no registerUsage:', error);
            return false;
        }
    }

    // ✅ REGISTRAR USO DIÁRIO
    async registerDailyUsage(dailyLimit) {
        const trial = await this.getUserTrial();
        if (!trial) return false;
        
        const today = new Date().toISOString().split('T')[0];
        const lastUsageDate = trial.last_usage_date ? new Date(trial.last_usage_date).toISOString().split('T')[0] : null;
        
        let dailyUsageCount = trial.daily_usage_count || 0;
        
        if (lastUsageDate !== today) {
            dailyUsageCount = 0;
            console.log('🔄 Novo dia - Resetando contador diário');
        }
        
        if (dailyUsageCount >= dailyLimit) {
            console.log(`🚫 Limite diário de ${dailyLimit} usos atingido`);
            this.showDailyLimitModal(dailyLimit);
            return false;
        }
        
        const newDailyUsageCount = dailyUsageCount + 1;
        const newTotalUsageCount = (trial.usage_count || 0) + 1;
        
        const { error } = await supabase
            .from('user_trials')
            .update({ 
                usage_count: newTotalUsageCount,
                daily_usage_count: newDailyUsageCount,
                last_usage_date: today
            })
            .eq('id', trial.id);
        
        if (error) {
            console.error('❌ Erro ao atualizar uso diário:', error);
            return false;
        }
        
        console.log(`✅ Uso diário registrado: ${newDailyUsageCount}/${dailyLimit}`);
        await this.updateUsageBadge();
        return true;
    }

    // ✅ BUSCAR TRIAL DO USUÁRIO
    async getUserTrial() {
        if (!userToken) return null;
        
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return null;

            const { data, error } = await supabase
                .from('user_trials')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
                
            if (error) {
                if (error.code === 'PGRST116') return null;
                throw error;
            }
            
            return data;
        } catch (error) {
            console.error('❌ Erro ao buscar trial:', error);
            return null;
        }
    }

    // ✅ BUSCAR ASSINATURA
    async getUserSubscription() {
        if (!userToken) return null;
        
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return null;

            const { data, error } = await supabase
                .from('user_subscriptions')
                .select('*')
                .eq('user_email', user.email)
                .eq('status', 'active')
                .gte('ends_at', new Date().toISOString())
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
                
            if (error && error.code !== 'PGRST116') {
                console.error('❌ Erro ao buscar assinatura:', error);
            }
            
            return data;
        } catch (error) {
            console.error('❌ Erro ao buscar assinatura:', error);
            return null;
        }
    }

    // ✅ USO DIÁRIO
    async getDailyUsage(trial, dailyLimit) {
        if (!trial) return { dailyUsageCount: 0, dailyUsagesLeft: 0, lastUsageDate: null };
        
        const { data: freshTrial, error } = await supabase
            .from('user_trials')
            .select('daily_usage_count, last_usage_date')
            .eq('id', trial.id)
            .single();
        
        if (error) {
            console.error('❌ Erro ao buscar dados atualizados:', error);
            return { dailyUsageCount: 0, dailyUsagesLeft: 0, lastUsageDate: null };
        }
        
        const today = new Date().toISOString().split('T')[0];
        const lastUsageDate = freshTrial.last_usage_date ? new Date(freshTrial.last_usage_date).toISOString().split('T')[0] : null;
        
        let dailyUsageCount = freshTrial.daily_usage_count || 0;
        
        if (lastUsageDate !== today) {
            dailyUsageCount = 0;
            console.log('🔄 Novo dia - Resetando contador diário');
            
            await supabase
                .from('user_trials')
                .update({ 
                    daily_usage_count: 0,
                    last_usage_date: today
                })
                .eq('id', trial.id);
        }
        
        const dailyUsagesLeft = Math.max(0, dailyLimit - dailyUsageCount);
        
        console.log(`📊 Uso diário: ${dailyUsageCount}/${dailyLimit} | Restantes: ${dailyUsagesLeft}`);
        
        return {
            dailyUsageCount: dailyUsageCount,
            dailyUsagesLeft: dailyUsagesLeft,
            lastUsageDate: lastUsageDate
        };
    }

    // ✅ INICIAR TRIAL
    async startTrial() {
        if (!userToken) return;
        
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const existingTrial = await this.getUserTrial();
            
            if (existingTrial) {
                console.log('✅ Trial já existe:', existingTrial);
                return existingTrial;
            }
            
            console.log('🔄 Criando NOVO trial...');
            const { data, error } = await supabase
                .from('user_trials')
                .insert([{ 
                    user_id: user.id,
                    user_email: user.email,
                    started_at: new Date().toISOString(),
                    ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    status: 'active',
                    usage_count: 0,
                    daily_usage_count: 0,
                    max_usages: 5
                }])
                .select()
                .single();
                
            if (error) throw error;
            
            console.log('🎉 NOVO Trial criado:', data);
            return data;
            
        } catch (error) {
            console.error('❌ Erro ao iniciar trial:', error);
            return null;
        }
    }


// 🎨 MODAL MODERNO: Estilo glassmorphism igual ao frontend principal
showDailyLimitModal(dailyLimit) {
    const modalExistente = document.querySelector('.fixed.inset-0.bg-black');
    if (modalExistente) modalExistente.remove();
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="glass-card rounded-2xl p-6 md:p-8 w-full max-w-md mx-auto animate-fade-in">
            <!-- Header Elegante -->
            <div class="flex items-center justify-center mb-6">
                <div class="p-3 rounded-full bg-gradient-to-br from-red-500 to-rose-500 shadow-lg">
                    <i data-feather="clock" class="w-6 h-6 text-white"></i>
                </div>
            </div>

            <h3 class="text-xl sm:text-2xl font-semibold text-center mb-2">⏰ Limite Diário Atingido</h3>
            <p class="text-center text-gray-300 mb-6">Você utilizou todos os ${dailyLimit} agendamentos de hoje</p>

            <!-- Badge de Status -->
            <div class="bg-gradient-to-r from-red-500/20 to-rose-500/20 border border-red-500/30 rounded-xl p-4 mb-6 text-center">
                <p class="text-red-400 font-semibold text-lg">${dailyLimit}/${dailyLimit} usos realizados</p>
                <p class="text-red-300 text-sm mt-1">Os usos resetam à meia-noite! 🕛</p>
            </div>

     
             <!-- Botões -->
            <div class="space-y-3">
                <!-- 🔥 BOTÃO COM WIDGET EMBEDIDO -->
                <a onclick="return false;" 
                   href="https://pay.hotmart.com/U102480243K?checkoutMode=2" 
                   class="hotmart-fb hotmart__button-checkout w-full px-4 py-3 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-bold transition-all flex items-center justify-center gap-2 shadow-lg">
                    <i data-feather="star" class="w-4 h-4"></i>
                    🚀 Fazer Upgrade Ilimitado
                </a>
                
                <button onclick="this.closest('.fixed').remove()" 
                        class="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-gray-300 font-medium transition-all flex items-center justify-center gap-2">
                    <i data-feather="clock" class="w-4 h-4"></i>
                    Entendi, aguardar reset
                </button>
            </div>

            <!-- Footer Informativo -->
            <div class="mt-6 pt-4 border-t border-white/10 text-center">
                <p class="text-xs text-gray-400">
                    💡 <strong>Upgrade:</strong> Agendamentos ilimitados + recursos premium
                </p>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    feather.replace();
    
    // 🔥 CARREGAR WIDGET HOTMART APÓS CRIAR MODAL
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.innerHTML = `
        function importHotmart(){ 
            var imported = document.createElement('script'); 
            imported.src = 'https://static.hotmart.com/checkout/widget.min.js'; 
            document.head.appendChild(imported); 
            var link = document.createElement('link'); 
            link.rel = 'stylesheet'; 
            link.type = 'text/css'; 
            link.href = 'https://static.hotmart.com/css/hotmart-fb.min.css'; 
            document.head.appendChild(link);
        } 
        importHotmart();
    `;
    document.body.appendChild(script);
}
    


// ✅ CORREÇÃO: Função updateUsageBadge - MOSTRA 5/5 QUANDO LIMITE ATINGIDO
async updateUsageBadge() {
    const badge = document.getElementById('premiumBadge');
    if (!badge) return;
    
    try {
        const status = await this.checkTrialStatus();
        
        console.log('📊 Status do badge:', status);
        
        if (status.unlimited) {
            badge.innerHTML = '<span>🚀 Premium</span>';
            badge.className = 'bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs px-3 py-2 rounded-lg flex items-center justify-center gap-2';
            badge.style.display = 'flex';
        } else if (status.hasTrial) {
            // 🔥 CORREÇÃO: Calcula usado/total CORRETAMENTE
            const total = status.isPremiumTrial ? 15 : 5;
            const used = total - status.dailyUsagesLeft; // Isso já dá o número correto de usos
            
            // 🔥 AGORA SEMPRE MOSTRA, MESMO QUANDO 5/5
            badge.innerHTML = `<span>🎯 ${used}/${total}</span>`;
            
            // Muda a cor baseado no status
            if (status.dailyUsagesLeft <= 0) {
                badge.className = 'bg-gradient-to-r from-red-500 to-rose-600 text-white text-xs px-3 py-2 rounded-lg flex items-center justify-center gap-2';
            } else if (status.dailyUsagesLeft <= 2) {
                badge.className = 'bg-gradient-to-r from-yellow-500 to-amber-600 text-white text-xs px-3 py-2 rounded-lg flex items-center justify-center gap-2';
            } else {
                badge.className = 'bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs px-3 py-2 rounded-lg flex items-center justify-center gap-2';
            }
            
            badge.style.display = 'flex';
            
        } else {
            // Só esconde se não tiver trial ativo
            badge.style.display = 'none';
        }
    } catch (error) {
        console.error('Erro ao atualizar badge:', error);
        badge.style.display = 'none';
    }
}
}
console.log('🚀 Script carregado! Iniciando aplicação...');

// 🔥 ADICIONAR: Alias para manter compatibilidade
function mostrarToast(message, type = "success") {
    showToast(message, type);
}
        

const form = document.getElementById('agendamentoForm');
const loginSection = document.getElementById('loginSection');
const meusAgendamentos = document.getElementById('meusAgendamentos');
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const exportCSVBtn = document.getElementById("exportCSVBtn");
const exportPDFBtn = document.getElementById("exportPDFBtn");
const logoutBtn = document.getElementById("logoutBtn");
// REMOVER: loginBtn, loginText, loginSpinner (não existem)
const agendarText = document.getElementById("agendarText");
const agendarSpinner = document.getElementById("agendarSpinner");
const telefoneInput = document.getElementById("Telefone");
const dataInput = document.getElementById("Data");
const horarioInput = document.getElementById("Horario");


        function formatData(data){ 
            const [y,m,d] = data.split("-"); 
            return `${d}/${m}/${y}`; 
        }

     // ✅ VERIFICAÇÃO DE SESSÃO CORRIGIDA
const token = localStorage.getItem('userToken');
console.log('🔑 Token no localStorage:', !!token);

if (token) {
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            console.log('✅ Sessão válida - usuário logado');
            userToken = session.access_token;
            // 🔥 CORREÇÃO: Usa função centralizada
            atualizarInterfacePosLogin();
            listarAgendamentos();
        } else {
            console.log('❌ Sessão inválida - fazendo limpeza');
            localStorage.removeItem('userToken');
            localStorage.removeItem('supabase.auth.token');
            userToken = null;
            // 🔥 CORREÇÃO: Usa função centralizada
            mostrarTelaLogin();
        }
    });
} else {
    console.log('👤 Sem token - mostrando tela de login');
    // 🔥 CORREÇÃO: Usa função centralizada
    mostrarTelaLogin();
}


// ✅ EVENT LISTENER PARA CHECKBOX AUTOMÁTICO
document.addEventListener('DOMContentLoaded', function() {
    const aceiteTermos = document.getElementById('aceiteTermos');
    if (aceiteTermos) {
        aceiteTermos.addEventListener('change', function() {
            if (this.checked) {
                localStorage.setItem('termsAccepted', 'true');
                localStorage.setItem('termsAcceptedAt', new Date().toISOString());
                localStorage.setItem('termsVersion', '1.0');
                console.log('✅ Termos aceitos via checkbox');
            }
        });
        
        // ✅ SE JÁ ACEITOU ANTES, MARCA CHECKBOX AUTOMATICAMENTE
        if (localStorage.getItem('termsAccepted')) {
            aceiteTermos.checked = true;
        }
    }
});
        
// 🔥 CORREÇÃO: Função init atualizada para carregar usos imediatamente após login
async function init() {
    console.log('🚀 Iniciando app...');
    
    if (verificarCallbackOAuth()) {
        console.log('⏸️ Parando init - é callback OAuth');
        return;
    }
    
    console.log('▶️ Continuando init normal...');
    
    // Aplica máscara de telefone
    setTimeout(() => {
        const telefoneInput = document.getElementById('Telefone');
        if (telefoneInput && window.IMask) {
            IMask(telefoneInput, {
                mask: '(00) 00000-0000'
            });
            console.log('✅ Máscara de telefone aplicada!');
        }
    }, 1000);
    
    // Configura listeners
    configurarEventListenersModal();
    
    // ✅ LISTENER CAPACITOR CORRIGIDO
    if (window.Capacitor && window.Capacitor.Plugins?.App) {
        window.Capacitor.Plugins.App.addListener('appUrlOpen', (data) => {
            console.log('🔗 App aberto via URL:', data.url);
            
            if (data.url.includes('auth-callback')) {
                console.log('📱 Processando retorno OAuth no app...');
                
                const url = new URL(data.url);
                const hash = url.hash;
                
                if (hash) {
                    const webUrl = `https://frontrender-iota.vercel.app/auth-callback.html${hash}`;
                    processarRetornoOAuth(webUrl);
                }
            }
        });
    }
    
    // ✅ VERIFICAÇÃO SIMPLES DE LOGIN - COM CARREGAMENTO IMEDIATO DO PREMIUM
    const token = localStorage.getItem('userToken');
    console.log('🔑 Token no localStorage:', !!token);
    
    if (token) {
        try {
            // Verifica se a sessão ainda é válida
            const { data: { session } } = await supabase.auth.getSession();
            
            if (session) {
                userToken = session.access_token;
                loginSection.style.display = 'none';
                form.style.display = 'block';
                
                // 🔥 CORREÇÃO CRÍTICA: Inicializar Premium Manager ANTES de usar
                premiumManager = new PremiumManager();
                
                // 🔥 NOVA SEQUÊNCIA: Iniciar trial E ATUALIZAR BADGE IMEDIATAMENTE
                await premiumManager.startTrial();
                
                // 🔥 ATUALIZAÇÃO IMEDIATA DO BADGE
                await premiumManager.updateUsageBadge();
                
                // 🔥 VERIFICAÇÃO DE LIMITE NO LOGIN (APÓS badge atualizado)
                const status = await premiumManager.checkTrialStatus();
                console.log('📊 Status do trial no login:', status);
                
                // 🔥 CORREÇÃO: Só mostra modal se TEM trial mas ZERO usos
                if (status.hasTrial && status.dailyUsagesLeft <= 0) {
                    console.log('🚫 Usuário COM trial mas SEM usos disponíveis no login - mostrando modal');
                    const limit = status.isPremiumTrial ? 15 : 5;
                    premiumManager.showDailyLimitModal(limit);
                }
                
                atualizarInterfacePosLogin();
                document.getElementById('secoesIA').style.display = 'block';
                listarAgendamentos();
                setTimeout(() => verificarConfiguracaoSheets(), 500);
            } else {
                // Sessão inválida - limpa tudo
                localStorage.removeItem('userToken');
                userToken = null;
                mostrarTelaLogin();
            }
        } catch (error) {
            console.error('❌ Erro ao verificar sessão:', error);
            localStorage.removeItem('userToken');
            userToken = null;
            mostrarTelaLogin();
        }
    } else {
        mostrarTelaLogin();
    }
    
    feather.replace();
}
        
// 🔥 ADICIONAR APENAS ISSO: Monitoramento do badge (FORA da função init)
setInterval(async () => {
    if (premiumManager && userToken) {
        await premiumManager.updateUsageBadge();
    }
}, 60000); // Atualiza badge a cada 1 minuto



        
// 🔥 CORREÇÃO: Função mostrarTelaLogin COMPLETA e ROBUSTA
function mostrarTelaLogin() {
    console.log('👤 Mostrando tela de login - ocultando todas as seções do app');
    
    // Mostra seção de login
    const loginSection = document.getElementById('loginSection');
    if (loginSection) loginSection.style.display = 'block';
    
    // Oculta formulário de agendamento
    const form = document.getElementById('agendamentoForm');
    if (form) form.style.display = 'none';
    
    // 🔥 CORREÇÃO CRÍTICA: Oculta TODAS as seções do app logado
    const filtersSection = document.getElementById('filtersSection');
    if (filtersSection) filtersSection.style.display = 'none';
    
    const diasTabs = document.getElementById('diasTabs');
    if (diasTabs) diasTabs.style.display = 'none';
    
    const meusAgendamentos = document.getElementById('meusAgendamentos');
    if (meusAgendamentos) meusAgendamentos.style.display = 'none';
    
    const secoesIA = document.getElementById('secoesIA');
    if (secoesIA) secoesIA.style.display = 'none';
    
    // Oculta botões do usuário logado
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.style.display = 'none';
    
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) settingsBtn.style.display = 'none';
    
    const gerarLinkBtn = document.getElementById('gerarLinkBtn');
    if (gerarLinkBtn) gerarLinkBtn.style.display = 'none';
    
    console.log('✅ Tela de login configurada completamente');
}

// ==================== SISTEMA DE PERFIS COM MENU (ADICIONAR AO FRONTEND) ====================

// 🎯 ATUALIZAÇÃO: Menu de Configurações com design igual ao modal
function abrirMenuConfiguracoes() {
    const modalExistente = document.getElementById('modalMenuConfig');
    if (modalExistente) modalExistente.remove();

    const modalHTML = `
        <div id="modalMenuConfig" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div class="glass-card rounded-2xl p-6 max-w-sm w-full mx-4 animate-fade-in">
                <!-- Header -->
                <div class="flex items-center justify-center mb-4">
                    <div class="p-3 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-lg">
                        <i data-feather="settings" class="w-6 h-6 text-white"></i>
                    </div>
                </div>
                
                <h3 class="text-xl font-semibold text-center mb-2">⚙️ Configurações</h3>
                <p class="text-center text-gray-300 mb-4">Gerencie suas configurações</p>
                
                <!-- Opções -->
                <div class="space-y-3">
                    <!-- Perfil do Negócio -->
                    <button id="btnPerfilNegocio" 
                            class="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 hover:opacity-90 transition-all text-white font-medium flex items-center justify-center gap-2">
                        <i data-feather="user" class="w-4 h-4"></i>
                        🏪 Perfil do Negócio
                    </button>
                    
                    <!-- Google Sheets -->
                    <button id="btnGoogleSheets" 
                            class="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 hover:opacity-90 transition-all text-white font-medium flex items-center justify-center gap-2">
                        <i data-feather="file-text" class="w-4 h-4"></i>
                        📊 Google Planilhas
                    </button>
                    
                    <!-- 🔥 BOTÃO UPGRADE -->
                    <a onclick="return false;" 
                       href="https://pay.hotmart.com/U102480243K?checkoutMode=2" 
                       class="hotmart-fb hotmart__button-checkout w-full px-4 py-3 rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 transition-all text-white font-medium flex items-center justify-center gap-2">
                        <i data-feather="star" class="w-4 h-4"></i>
                        🚀 Fazer Upgrade
                    </a>
                    
                    <!-- Fechar -->
                    <button id="btnFecharMenu" 
                            class="w-full px-4 py-3 rounded-lg bg-gray-600 hover:bg-gray-700 transition-all text-white flex items-center justify-center gap-2">
                        <i data-feather="x" class="w-4 h-4"></i>
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    feather.replace();
    
    // 🔥 CARREGAR WIDGET HOTMART PARA ESTE MODAL TAMBÉM
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.innerHTML = `
        function importHotmart(){ 
            var imported = document.createElement('script'); 
            imported.src = 'https://static.hotmart.com/checkout/widget.min.js'; 
            document.head.appendChild(imported); 
            var link = document.createElement('link'); 
            link.rel = 'stylesheet'; 
            link.type = 'text/css'; 
            link.href = 'https://static.hotmart.com/css/hotmart-fb.min.css'; 
            document.head.appendChild(link);
        } 
        // Só carrega se ainda não estiver carregado
        if (typeof Hotmart === 'undefined') {
            importHotmart();
        }
    `;
    document.body.appendChild(script);
    
    // Event listeners
    setTimeout(() => {
        document.getElementById('btnPerfilNegocio').addEventListener('click', function() {
            abrirModalPerfil();
            fecharMenuConfig();
        });
        
        document.getElementById('btnGoogleSheets').addEventListener('click', function() {
            mostrarModalConfiguracao();
            fecharMenuConfig();
        });
        
        document.getElementById('btnFecharMenu').addEventListener('click', fecharMenuConfig);
        
        document.getElementById('modalMenuConfig').addEventListener('click', function(e) {
            if (e.target === this) {
                fecharMenuConfig();
            }
        });
    }, 100);
}
        
// 🎯 FUNÇÃO: Fechar Menu
function fecharMenuConfig() {
    const modal = document.getElementById('modalMenuConfig');
    if (modal) modal.remove();
}

// ✅ FUNÇÃO GLOBAL para upgrade (pode ser chamada de qualquer lugar)
window.fazerUpgrade = function() {
    console.log('🔄 Redirecionando para checkout...');
    
    // 🔥 CORREÇÃO: Usa a mesma URL do seu checkout
    window.location.href = 'https://oubook.vercel.app/checkout.html';
};   

// 🎯 FUNÇÃO: Modal do Perfil do Negócio (VERSÃO CORRIGIDA - SEM DUPLICAÇÃO)
function abrirModalPerfil() {
    const modalExistente = document.getElementById('modalPerfilConfig');
    if (modalExistente) modalExistente.remove();

    const modalHTML = `
        <div id="modalPerfilConfig" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div class="glass-card rounded-2xl p-6 max-w-2xl w-full mx-4 animate-fade-in" style="max-height: 90vh; overflow-y: auto;">
                <!-- Cabeçalho -->
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-semibold">🏪 Perfil do Negócio</h3>
                    <button id="btnFecharModalPerfil" class="text-gray-400 hover:text-white">
                        <i data-feather="x" class="w-5 h-5"></i>
                    </button>
                </div>
                
                <div class="space-y-6">
                    <!-- Informações Básicas -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <!-- Nome do Negócio -->
                        <div>
                            <label class="block text-sm font-medium opacity-80 mb-1">Nome do Negócio</label>
                            <input type="text" id="nomeNegocioInput" placeholder="Ex: Barbearia do João" 
                                   class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 focus:outline-none text-white">
                        </div>
                        
                        <!-- Tipo de Negócio -->
                        <div>
                            <label class="block text-sm font-medium opacity-80 mb-1">Tipo de Negócio</label>
                            <select id="tipoNegocioSelect" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 focus:outline-none text-white">
                                <option value="barbearia">💈 Barbearia</option>
                                <option value="consultorio">🏥 Consultório</option>
                                <option value="salao">💇 Salão de Beleza</option>
                                <option value="clinica">🩺 Clínica</option>
                                <option value="estetica">✨ Clínica de Estética</option>
                                <option value="massagem">💆 Spa/Massagem</option>
                                <option value="outros">🏢 Outros</option>
                            </select>
                        </div>
                    </div>
                    
                    <!-- Dias de Funcionamento -->
                    <div>
                        <label class="block text-sm font-medium opacity-80 mb-2">📅 Dias de Funcionamento</label>
                        <div class="grid grid-cols-4 gap-2">
                            ${['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'].map(dia => `
                                <label class="flex items-center gap-1 text-sm cursor-pointer p-2 rounded hover:bg-white/5 transition-all">
                                    <input type="checkbox" value="${dia}" class="dias-checkbox rounded bg-white/10 border-white/20">
                                    <span class="capitalize">${dia}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    
                    <!-- Horários Padrão -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium opacity-80 mb-1">⏰ Horário de Abertura</label>
                            <input type="time" id="horarioAbertura" value="08:00" 
                                   class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 focus:outline-none text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-medium opacity-80 mb-1">⏰ Horário de Fechamento</label>
                            <input type="time" id="horarioFechamento" value="18:00" 
                                   class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 focus:outline-none text-white">
                        </div>
                    </div>
                    
                    <!-- 🆕 SEÇÃO: BLOQUEIO POR PERÍODOS -->
                    <div class="border-t border-white/10 pt-4">
                        <div class="flex items-center justify-between mb-4">
                            <h4 class="text-lg font-semibold">🚫 Bloquear Períodos</h4>
                            <button id="btnAdicionarPeriodo" class="px-3 py-1 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 hover:opacity-90 transition-all text-sm">
                                + Adicionar Período
                            </button>
                        </div>
                        
                        <p class="text-sm text-gray-300 mb-4">
                            Bloqueie faixas de horário indisponíveis. Ex: 10:30 até 12:00 bloqueia todos horários entre 10:30 e 12:00.
                        </p>
                        
                        <!-- Lista de Períodos Bloqueados -->
                        <div id="listaPeriodosBloqueados" class="space-y-3 max-h-40 overflow-y-auto">
                            <!-- Períodos serão adicionados aqui dinamicamente -->
                            <div class="text-center py-4 text-gray-400">
                                Nenhum período bloqueado
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Botões -->
                <div class="flex gap-2 mt-6">
                    <button id="btnCancelarPerfil" class="flex-1 px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-700 transition-all text-white">
                        Cancelar
                    </button>
<button id="btnSalvarPerfil" class="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 hover:opacity-90 transition-all text-white font-medium flex items-center justify-center gap-2">
    <i data-feather="save" class="w-4 h-4"></i>
    Salvar Configurações
</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    feather.replace();
    
    // 🔥 CORREÇÃO CRÍTICA: Configurar event listeners SEM setTimeout
    configurarEventListenersPerfil();
    
    // Carrega perfil existente se tiver
    carregarPerfilExistente();
}

// 🔥 NOVA FUNÇÃO: Configurar event listeners do perfil (SEM duplicação)
function configurarEventListenersPerfil() {
    console.log('🔧 Configurando event listeners do perfil...');
    
    // Fechar modal
    const btnFechar = document.getElementById('btnFecharModalPerfil');
    const btnCancelar = document.getElementById('btnCancelarPerfil');
    const btnSalvar = document.getElementById('btnSalvarPerfil');
    const btnAdicionarPeriodo = document.getElementById('btnAdicionarPeriodo');
    
    if (btnFechar) {
        btnFechar.onclick = fecharModalPerfil;
    }
    
    if (btnCancelar) {
        btnCancelar.onclick = fecharModalPerfil;
    }
    
    if (btnSalvar) {
        // 🔥 CORREÇÃO: Remove event listener anterior e adiciona apenas UM
        btnSalvar.replaceWith(btnSalvar.cloneNode(true));
        const novoBtnSalvar = document.getElementById('btnSalvarPerfil');
        novoBtnSalvar.onclick = salvarPerfil;
    }
    
    if (btnAdicionarPeriodo) {
        btnAdicionarPeriodo.onclick = adicionarPeriodoBloqueio;
    }
    
    // Fechar clicando fora do modal
    const modal = document.getElementById('modalPerfilConfig');
    if (modal) {
        modal.onclick = function(e) {
            if (e.target === this) {
                fecharModalPerfil();
            }
        };
    }
}

// 🆕 FUNÇÃO: Inicializar lista de períodos
function inicializarListaPeriodos() {
    const lista = document.getElementById('listaPeriodosBloqueados');
    if (lista) {
        lista.innerHTML = `
            <div class="text-center py-4 text-gray-400 text-sm">
                Clique em "Adicionar Período" para bloquear horários
            </div>
        `;
    }
}

// 🆕 SUBSTITUIR: Função adicionarPeriodoBloqueio com SELETOR DE TIPO
function adicionarPeriodoBloqueio() {
    const lista = document.getElementById('listaPeriodosBloqueados');
    
    // Remove mensagem de "vazio" se existir
    if (lista.querySelector('.text-center')) {
        lista.innerHTML = '';
    }
    
    const periodoId = 'periodo_' + Date.now();
    
    const periodoHTML = `
        <div id="${periodoId}" class="periodo-bloqueado p-3 bg-white/5 rounded-lg border border-white/10 space-y-2">
            <!-- 🆕 SELETOR DE TIPO DE BLOQUEIO -->
            <div class="flex gap-3 mb-2">
                <label class="flex items-center gap-1 text-xs cursor-pointer">
                    <input type="radio" name="tipo_${periodoId}" value="recorrente" checked 
                           class="tipo-bloqueio rounded-full bg-white/10 border-white/20">
                    <span>🔄 Fixo (Todos os dias)</span>
                </label>
                <label class="flex items-center gap-1 text-xs cursor-pointer">
                    <input type="radio" name="tipo_${periodoId}" value="data_especifica"
                           class="tipo-bloqueio rounded-full bg-white/10 border-white/20">
                    <span>📅 Data Específica</span>
                </label>
            </div>
            
            <!-- 🆕 CAMPO DATA (inicialmente oculto) -->
            <div id="campo-data-${periodoId}" class="hidden">
                <label class="block text-xs text-gray-300 mb-1">📅 Data do Bloqueio</label>
                <input type="date" class="data-periodo w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-sm" 
                       min="${new Date().toISOString().split('T')[0]}">
            </div>
            
            <!-- Campos de Horário (sempre visíveis) -->
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="block text-xs text-gray-300 mb-1">⏰ De</label>
                    <input type="time" class="inicio-periodo w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-sm" value="12:00">
                </div>
                <div>
                    <label class="block text-xs text-gray-300 mb-1">⏰ Até</label>
                    <input type="time" class="fim-periodo w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-sm" value="14:00">
                </div>
            </div>
            
            <div class="flex justify-between items-center pt-2">
                <span id="info-tipo-${periodoId}" class="text-xs text-green-400">
                    ✅ Bloqueio FIXO em todos os dias
                </span>
                <button class="btn-remover-periodo px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-all text-sm">
                    <i data-feather="trash-2" class="w-3 h-3"></i> Remover
                </button>
            </div>
        </div>
    `;
    
    lista.insertAdjacentHTML('beforeend', periodoHTML);
    feather.replace();
    
    // 🆕 CONFIGURAR EVENT LISTENERS PARA O TIPO
    const radios = document.querySelectorAll(`#${periodoId} .tipo-bloqueio`);
    const campoData = document.getElementById(`campo-data-${periodoId}`);
    const infoTipo = document.getElementById(`info-tipo-${periodoId}`);
    
    radios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'data_especifica') {
                campoData.classList.remove('hidden');
                infoTipo.textContent = '📅 Bloqueio para DATA ESPECÍFICA';
                infoTipo.className = 'text-xs text-blue-400';
            } else {
                campoData.classList.add('hidden');
                infoTipo.textContent = '✅ Bloqueio FIXO em todos os dias';
                infoTipo.className = 'text-xs text-green-400';
            }
        });
    });
    
    // Adicionar event listener para o botão remover
    const btnRemover = document.querySelector(`#${periodoId} .btn-remover-periodo`);
    if (btnRemover) {
        btnRemover.addEventListener('click', function() {
            document.getElementById(periodoId).remove();
            
            // Se não houver mais períodos, mostra mensagem
            if (lista.children.length === 0) {
                inicializarListaPeriodos();
            }
        });
    }
    
    // Rolagem para o novo período
    lista.scrollTop = lista.scrollHeight;
}

// 🆕 SUBSTITUIR: Função coletarPeriodosBloqueados com TIPO
function coletarPeriodosBloqueados() {
    const periodos = [];
    const elementosPeriodos = document.querySelectorAll('.periodo-bloqueado');
    
    elementosPeriodos.forEach(elemento => {
        // 🆕 Obtém o tipo selecionado
        const tipoSelecionado = elemento.querySelector('.tipo-bloqueio:checked')?.value || 'recorrente';
        const inicio = elemento.querySelector('.inicio-periodo').value;
        const fim = elemento.querySelector('.fim-periodo').value;
        
        // 🆕 VALIDAÇÃO POR TIPO
        if (inicio && fim && inicio !== fim) {
            const periodo = {
                tipo: tipoSelecionado,
                inicio: inicio,
                fim: fim
            };
            
            // 🆕 Se for data específica, adiciona a data
            if (tipoSelecionado === 'data_especifica') {
                const data = elemento.querySelector('.data-periodo').value;
                if (data) {
                    periodo.data = data;
                    periodos.push(periodo);
                }
            } else {
                // 🆕 Bloqueio recorrente não precisa de data
                periodos.push(periodo);
            }
        }
    });
    
    return periodos;
}
        

// 🎯 FUNÇÃO: Fechar Modal do Perfil
function fecharModalPerfil() {
    const modal = document.getElementById('modalPerfilConfig');
    if (modal) modal.remove();
}

// 🔥 ATUALIZAR: Função salvarPerfil com períodos bloqueados
async function salvarPerfil() {
    try {
        console.log('💾 Iniciando salvamento do perfil...');
        
        const nomeNegocio = document.getElementById('nomeNegocioInput').value.trim();
        const tipoNegocio = document.getElementById('tipoNegocioSelect').value;
        const horarioAbertura = document.getElementById('horarioAbertura').value;
        const horarioFechamento = document.getElementById('horarioFechamento').value;
        
        // Coletar dias selecionados
        const diasSelecionados = Array.from(document.querySelectorAll('.dias-checkbox:checked'))
            .map(cb => cb.value);
        
        // 🆕 Coletar períodos bloqueados
        const horariosBloqueados = coletarPeriodosBloqueados();
        
        if (!nomeNegocio) {
            mostrarToast('❌ Digite o nome do seu negócio', 'error');
            return;
        }
        
        if (diasSelecionados.length === 0) {
            mostrarToast('❌ Selecione pelo menos um dia de funcionamento', 'error');
            return;
        }
        
        // Criar objeto de horários por dia
        const horariosFuncionamento = {};
        diasSelecionados.forEach(dia => {
            horariosFuncionamento[dia] = {
                inicio: horarioAbertura,
                fim: horarioFechamento
            };
        });
        
        const perfilData = {
            nome_negocio: nomeNegocio,
            tipo_negocio: tipoNegocio,
            horarios_funcionamento: horariosFuncionamento,
            dias_funcionamento: diasSelecionados,
            horarios_bloqueados: horariosBloqueados // 🆕 Inclui períodos bloqueados
        };
        
        console.log('📤 Enviando dados do perfil:', perfilData);
        
        const btnSalvar = document.getElementById('btnSalvarPerfil');
        const originalText = btnSalvar.innerHTML;
        btnSalvar.innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;border-width:2px;"></div> Salvando...';
        btnSalvar.disabled = true;
        
        const response = await fetch(`${API_BASE_URL}/api/criar-perfil`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify(perfilData)
        });
        
        console.log('📥 Resposta recebida, status:', response.status);
        const data = await response.json();
        console.log('📊 Dados da resposta:', data);
        
        if (data.success) {
            mostrarToast('✅ Perfil salvo com sucesso!', 'success');
            fecharModalPerfil();
            
            // Atualiza badge do botão
            atualizarBadgePerfil();
            
        } else {
            throw new Error(data.msg || 'Erro ao salvar perfil');
        }
        
    } catch (error) {
        console.error('❌ Erro ao salvar perfil:', error);
        mostrarToast('❌ Erro ao salvar perfil: ' + error.message, 'error');
    } finally {
        const btnSalvar = document.getElementById('btnSalvarPerfil');
        if (btnSalvar) {
            btnSalvar.innerHTML = '<i data-feather="save" class="w-4 h-4"></i> Salvar Configurações';
            btnSalvar.disabled = false;
            feather.replace();
        }
    }
}

// 🔥 ATUALIZAR: Carregar perfil existente com períodos bloqueados
async function carregarPerfilExistente() {
    try {
        console.log('🔍 Buscando perfil existente...');
        
        const response = await fetch(`${API_BASE_URL}/api/meu-perfil`, {
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        console.log('📊 Status da resposta:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            console.log('📦 Dados do perfil:', data);
            
            if (data.success && data.perfil) {
                preencherFormularioPerfil(data.perfil);
                console.log('✅ Perfil carregado com sucesso');
            } else {
                console.log('ℹ️ Nenhum perfil encontrado');
            }
        } else {
            console.log('❌ Erro HTTP ao carregar perfil:', response.status);
        }
    } catch (error) {
        console.error('❌ Erro ao carregar perfil:', error);
    }
}

// 🆕 SUBSTITUIR: Preencher formulário com períodos bloqueados (COM TIPO)
function preencherFormularioPerfil(perfil) {
    const nomeInput = document.getElementById('nomeNegocioInput');
    const tipoSelect = document.getElementById('tipoNegocioSelect');
    const diasCheckboxes = document.querySelectorAll('.dias-checkbox');
    
    if (nomeInput) nomeInput.value = perfil.nome_negocio || '';
    if (tipoSelect) tipoSelect.value = perfil.tipo_negocio || 'barbearia';
    
    // Preencher dias
    diasCheckboxes.forEach(cb => {
        cb.checked = perfil.dias_funcionamento?.includes(cb.value) || false;
    });
    
    // Preencher horários (usa o primeiro dia como referência)
    if (perfil.horarios_funcionamento) {
        const primeiroDia = Object.keys(perfil.horarios_funcionamento)[0];
        if (primeiroDia) {
            const horarioAbertura = document.getElementById('horarioAbertura');
            const horarioFechamento = document.getElementById('horarioFechamento');
            
            if (horarioAbertura) horarioAbertura.value = perfil.horarios_funcionamento[primeiroDia].inicio || '08:00';
            if (horarioFechamento) horarioFechamento.value = perfil.horarios_funcionamento[primeiroDia].fim || '18:00';
        }
    }
    
    // 🆕 ATUALIZADO: Preencher períodos bloqueados COM TIPO
    if (perfil.horarios_bloqueados && perfil.horarios_bloqueados.length > 0) {
        const lista = document.getElementById('listaPeriodosBloqueados');
        lista.innerHTML = ''; // Limpa mensagem inicial
        
        perfil.horarios_bloqueados.forEach((periodo, index) => {
            const periodoId = 'periodo_' + index;
            const tipo = periodo.tipo || (periodo.data ? 'data_especifica' : 'recorrente');
            const mostraData = tipo === 'data_especifica';
            
            const periodoHTML = `
                <div id="${periodoId}" class="periodo-bloqueado p-3 bg-white/5 rounded-lg border border-white/10 space-y-2">
                    <!-- 🆕 SELETOR DE TIPO -->
                    <div class="flex gap-3 mb-2">
                        <label class="flex items-center gap-1 text-xs cursor-pointer">
                            <input type="radio" name="tipo_${periodoId}" value="recorrente" 
                                   ${tipo === 'recorrente' ? 'checked' : ''}
                                   class="tipo-bloqueio rounded-full bg-white/10 border-white/20">
                            <span>🔄 Fixo (Todos os dias)</span>
                        </label>
                        <label class="flex items-center gap-1 text-xs cursor-pointer">
                            <input type="radio" name="tipo_${periodoId}" value="data_especifica"
                                   ${tipo === 'data_especifica' ? 'checked' : ''}
                                   class="tipo-bloqueio rounded-full bg-white/10 border-white/20">
                            <span>📅 Data Específica</span>
                        </label>
                    </div>
                    
                    <!-- 🆕 CAMPO DATA -->
                    <div id="campo-data-${periodoId}" class="${mostraData ? '' : 'hidden'}">
                        <label class="block text-xs text-gray-300 mb-1">📅 Data do Bloqueio</label>
                        <input type="date" class="data-periodo w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-sm" 
                               value="${periodo.data || ''}">
                    </div>
                    
                    <!-- Campos de Horário -->
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="block text-xs text-gray-300 mb-1">⏰ De</label>
                            <input type="time" class="inicio-periodo w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-sm" 
                                   value="${periodo.inicio}">
                        </div>
                        <div>
                            <label class="block text-xs text-gray-300 mb-1">⏰ Até</label>
                            <input type="time" class="fim-periodo w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-sm" 
                                   value="${periodo.fim}">
                        </div>
                    </div>
                    
                    <div class="flex justify-between items-center pt-2">
                        <span id="info-tipo-${periodoId}" class="text-xs ${tipo === 'recorrente' ? 'text-green-400' : 'text-blue-400'}">
                            ${tipo === 'recorrente' ? '✅ Bloqueio FIXO em todos os dias' : '📅 Bloqueio para DATA ESPECÍFICA'}
                        </span>
                        <button class="btn-remover-periodo px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-all text-sm">
                            <i data-feather="trash-2" class="w-3 h-3"></i> Remover
                        </button>
                    </div>
                </div>
            `;
            
            lista.insertAdjacentHTML('beforeend', periodoHTML);
            
            // 🆕 CONFIGURAR EVENT LISTENERS (igual ao adicionar novo)
            setTimeout(() => {
                const radios = document.querySelectorAll(`#${periodoId} .tipo-bloqueio`);
                const campoData = document.getElementById(`campo-data-${periodoId}`);
                const infoTipo = document.getElementById(`info-tipo-${periodoId}`);
                
                radios.forEach(radio => {
                    radio.addEventListener('change', function() {
                        if (this.value === 'data_especifica') {
                            campoData.classList.remove('hidden');
                            infoTipo.textContent = '📅 Bloqueio para DATA ESPECÍFICA';
                            infoTipo.className = 'text-xs text-blue-400';
                        } else {
                            campoData.classList.add('hidden');
                            infoTipo.textContent = '✅ Bloqueio FIXO em todos os dias';
                            infoTipo.className = 'text-xs text-green-400';
                        }
                    });
                });
                
                const btnRemover = document.querySelector(`#${periodoId} .btn-remover-periodo`);
                if (btnRemover) {
                    btnRemover.addEventListener('click', function() {
                        document.getElementById(periodoId).remove();
                        if (lista.children.length === 0) {
                            inicializarListaPeriodos();
                        }
                    });
                }
            }, 100);
        });
        
        feather.replace();
    }
}

// ✅ MELHOR SOLUÇÃO: Simples e funcional
async function atualizarBadgePerfil() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/meu-perfil`, {
            headers: { 'Authorization': `Bearer ${userToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const settingsBtn = document.getElementById('settingsBtn');
            
            if (settingsBtn && data.success && data.perfil) {
                // ✅ Indicador visual simples e confiável
                settingsBtn.innerHTML = `<i data-feather="settings" class="w-4 h-4"></i> Configurações <span class="ml-1 text-green-400 text-xs">✓</span>`;
                feather.replace();
            }
        }
    } catch (error) {
        console.log('Erro ao verificar perfil:', error);
    }
}

// 🎯 FUNÇÃO: Configurar Botão Principal
function configurarBotaoSettings() {
    const settingsBtn = document.getElementById('settingsBtn');
    console.log('🔧 Configurando botão settings...', settingsBtn);
    
    if (settingsBtn) {
        // Remove event listeners antigos para evitar duplicação
        const newSettingsBtn = settingsBtn.cloneNode(true);
        settingsBtn.parentNode.replaceChild(newSettingsBtn, settingsBtn);
        
        // Adiciona o event listener ao novo botão
        newSettingsBtn.addEventListener('click', abrirMenuConfiguracoes);
        console.log('✅ Botão settings configurado com sucesso!');
    } else {
        console.log('❌ Botão settings não encontrado');
    }
}


// 🔥 CORREÇÃO: Função atualizarInterfacePosLogin atualizada para garantir badge
async function atualizarInterfacePosLogin() {
    console.log('🎯 Atualizando interface para usuário LOGADO...');
    
    // Oculta login
    const loginSection = document.getElementById('loginSection');
    if (loginSection) loginSection.style.display = 'none';
    
    // Mostra formulário
    const form = document.getElementById('agendamentoForm');
    if (form) form.style.display = 'block';
    
    // 🔥 CORREÇÃO: Mostra TODAS as seções do app
    const filtersSection = document.getElementById('filtersSection');
    if (filtersSection) filtersSection.style.display = 'block';
    
    const diasTabs = document.getElementById('diasTabs');
    if (diasTabs) diasTabs.style.display = 'flex';
    
    const meusAgendamentos = document.getElementById('meusAgendamentos');
    if (meusAgendamentos) meusAgendamentos.style.display = 'block';
    
    const secoesIA = document.getElementById('secoesIA');
    if (secoesIA) secoesIA.style.display = 'block';
    
    // Mostra botões do usuário logado
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.style.display = 'flex';
    
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) settingsBtn.style.display = 'flex';
    
    const gerarLinkBtn = document.getElementById('gerarLinkBtn');
    if (gerarLinkBtn) gerarLinkBtn.style.display = 'flex';
    
    // 🔥 CORREÇÃO CRÍTICA: Garantir que o Premium Manager existe e atualiza o badge
    if (!premiumManager) {
        premiumManager = new PremiumManager();
        await premiumManager.startTrial();
    }
    
    // 🔥 ATUALIZAÇÃO IMEDIATA DO BADGE
    await premiumManager.updateUsageBadge();
    
    // Configura botão settings
    configurarBotaoSettings();
    
    console.log('✅ Interface do usuário logado configurada');
}

  
        // 🔥 ADICIONE: Event listener para o botão gerar link
        document.getElementById('gerarLinkBtn').addEventListener('click', gerarLinkAgendamento);


async function gerarLinkAgendamento() {
    try {
        console.log('🔍 Verificando perfil para gerar link...');
        
        // ✅ VERIFICAÇÃO CORRIGIDA E ROBUSTA
        let temPerfil = false;
        let perfilData = null;
        
        try {
            // 🆕 ADICIONA '?forcado=true' PARA GARANTIR SEM CACHE
            const perfilResponse = await fetch(`${API_BASE_URL}/api/meu-perfil?forcado=true`, {
                headers: { 'Authorization': `Bearer ${userToken}` }
            });
            
            console.log('📊 Status da resposta do perfil:', perfilResponse.status);
            
            if (perfilResponse.ok) {
                perfilData = await perfilResponse.json();
                console.log('📦 Dados completos do perfil:', perfilData);
                
                // 🔥 VERIFICAÇÃO CORRIGIDA: Checa se existe ID do perfil
                temPerfil = perfilData.success && 
                           perfilData.perfil && 
                           perfilData.perfil.id && 
                           perfilData.perfil.nome_negocio;
                
                console.log('✅ Resultado da verificação:', {
                    success: perfilData.success,
                    hasPerfil: !!perfilData.perfil,
                    hasId: !!perfilData.perfil?.id,
                    hasNome: !!perfilData.perfil?.nome_negocio,
                    temPerfil: temPerfil
                });
                
            } else if (perfilResponse.status === 404) {
                console.log('❌ Perfil não encontrado (404)');
                temPerfil = false;
            } else {
                console.log('❌ Erro HTTP ao verificar perfil:', perfilResponse.status);
                temPerfil = false;
            }
        } catch (perfilError) {
            console.error('❌ Erro na requisição do perfil:', perfilError);
            temPerfil = false;
        }
        
        // 🔥 BLOQUEIO EFETIVO SE NÃO TIVER PERFIL
        if (!temPerfil) {
            console.log('🚫 BLOQUEADO: Usuário não tem perfil válido');
            showToast("❌ Crie um perfil do estabelecimento antes de gerar o link", "error");
            
            // Abre o menu de configurações para criar perfil
            setTimeout(() => {
                mostrarModalSemPerfil();
            }, 1000);
            
            return;
        }

        console.log('✅ PERFIL VALIDADO - Gerando link...');

        // 🔥 CONTINUA COM A GERAÇÃO DO LINK...
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user || !user.id) {
            showToast("Erro: usuário não encontrado", "error");
            return;
        }

        const userId = user.id;
        
        console.log('🔗 Fazendo requisição para gerar link...');
        const response = await fetch(`${API_BASE_URL}/gerar-link/${userId}`, {
            headers: { 'Authorization': `Bearer ${userToken}` }
        });
        
        const result = await response.json();
        console.log('📨 Resposta da geração do link:', result);
        
        if (result.success) {
            mostrarModalLinkAgendamento(result.link, result.qr_code);
        } else {
            showToast("Erro ao gerar link: " + (result.msg || ""), "error");
        }
    } catch (error) {
        console.error('❌ Erro ao gerar link:', error);
        showToast("Erro ao gerar link de agendamento", "error");
    }
}

        // 🎯 FUNÇÃO: Modal para usuário sem perfil (JÁ EXISTE - MANTENHA COMO ESTÁ)
function mostrarModalSemPerfil() {
    const modalExistente = document.getElementById('modalSemPerfil');
    if (modalExistente) modalExistente.remove();

    const modalHTML = `
        <div id="modalSemPerfil" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div class="glass-card rounded-2xl p-6 max-w-md w-full mx-4 animate-fade-in">
                <!-- Header -->
                <div class="flex items-center justify-center mb-4">
                    <div class="p-3 rounded-full bg-gradient-to-br from-yellow-500 to-amber-500 shadow-lg">
                        <i data-feather="user" class="w-6 h-6 text-white"></i>
                    </div>
                </div>
                
                <h3 class="text-xl font-semibold text-center mb-2">🏪 Perfil Necessário</h3>
                <p class="text-center text-gray-300 mb-4">Você precisa criar um perfil do estabelecimento antes de gerar links de agendamento</p>
                
                <div class="flex gap-2 mt-6">
                    <button onclick="fecharModalSemPerfil()" class="flex-1 px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-700 transition-all text-white">
                        Fechar
                    </button>
                    <button onclick="criarPerfilAgora()" class="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 hover:opacity-90 transition-all text-white font-medium">
                        Criar Perfil
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    feather.replace();
}

window.fecharModalSemPerfil = function() {
    const modal = document.getElementById('modalSemPerfil');
    if (modal) modal.remove();
}

window.criarPerfilAgora = function() {
    // Fecha o modal atual
    fecharModalSemPerfil();
    // Abre o modal de criação de perfil
    abrirModalPerfil();
}

        function mostrarModalLinkAgendamento(link, qrCodeUrl) {
            const modalExistente = document.getElementById('modalLinkAgendamento');
            if (modalExistente) modalExistente.remove();

            const modalHTML = `
                <div id="modalLinkAgendamento" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div class="glass-card rounded-xl p-6 w-full max-w-md mx-auto animate-fade-in relative">
                        
                        <!-- 🔥 BOTÃO X COM ID ESPECÍFICO -->
                        <button id="fecharModalLinkBtn" 
                                class="absolute top-4 right-4 text-gray-400 hover:text-white z-50 bg-black/50 rounded-full p-1 w-8 h-8 flex items-center justify-center">
                            ×
                        </button>
                        
                        <!-- Cabeçalho -->
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-lg font-semibold">🔗 Link de Agendamento</h3>
                        </div>
                        
                        <!-- Conteúdo -->
                        <div class="space-y-4">
                            <div class="text-center">
                                <p class="text-sm text-gray-300 mb-3">Compartilhe este link com seus clientes:</p>
                                
                                <div class="bg-white/10 rounded-lg p-3 mb-3">
                                    <code class="text-xs break-all text-cyan-300">${link}</code>
                                </div>
                                
                   
                                <!-- 🔥 BOTÃO COPIAR COM ID ESPECÍFICO -->
<button id="copiarLinkBtn" 
        class="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 active:scale-95 active:from-green-500 active:to-green-600 transition-all duration-200 text-sm font-medium">
    📋 Copiar Link
</button>
                            </div>
                            
                            ${qrCodeUrl ? `
                            <div class="text-center border-t border-white/10 pt-4">
                                <p class="text-sm text-gray-300 mb-2">Ou escaneie o QR Code:</p>
                                <img src="${qrCodeUrl}" alt="QR Code para agendamento" 
                                     class="mx-auto rounded-lg border-2 border-white/20 w-32 h-32">
                            </div>
                            ` : ''}
                        </div>
                        
                        <div class="mt-4 text-center">
                            <p class="text-xs text-gray-400">
                                💡 Seus clientes poderão agendar diretamente por este link!
                            </p>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            
            // 🔥 ADICIONE: Event listeners DEPOIS que o modal é criado
            setTimeout(() => {
                // Botão Fechar
                document.getElementById('fecharModalLinkBtn').addEventListener('click', fecharModalLinkAgendamento);
                
                // Botão Copiar
                document.getElementById('copiarLinkBtn').addEventListener('click', function() {
                    copiarLink(link);
                });
                
                // Fechar clicando fora
                document.getElementById('modalLinkAgendamento').addEventListener('click', function(e) {
                    if (e.target === this) {
                        fecharModalLinkAgendamento();
                    }
                });
            }, 100);
        }

        // 🔥 FUNÇÃO FECHAR
        function fecharModalLinkAgendamento() {
            console.log('🎯 Fechando modal...');
            const modal = document.getElementById('modalLinkAgendamento');
            if (modal) {
                modal.remove();
                console.log('✅ Modal removido!');
            }
        }

        // 🔥 FUNÇÃO COPIAR LINK CORRIGIDA
        function copiarLink(link) {
            console.log('📋 Tentando copiar:', link);
            
            // Método moderno
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(link).then(() => {
                    showToast("✅ Link copiado para a área de transferência!", "success");
                    console.log('✅ Link copiado com sucesso!');
                }).catch(err => {
                    console.error('❌ Erro ao copiar:', err);
                    copiarLinkFallback(link);
                });
            } else {
                // Fallback para navegadores antigos
                copiarLinkFallback(link);
            }
        }

        // 🔥 ADICIONE: Função fallback para copiar link
        function copiarLinkFallback(link) {
            const textArea = document.createElement('textarea');
            textArea.value = link;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                document.execCommand('copy');
                showToast("✅ Link copiado para a área de transferência!", "success");
            } catch (err) {
                console.error('❌ Fallback copy failed:', err);
                showToast("❌ Erro ao copiar link", "error");
            } finally {
                document.body.removeChild(textArea);
            }
        }
        
       
        function mostrarModalConfiguracao() {
            const modal = document.getElementById('configSheetsModal');
            modal.classList.remove('hidden');
            
            // 🔥 ADICIONE ESTA LINHA - Configura os event listeners quando o modal abre
            setTimeout(() => {
                configurarEventListenersModal();
            }, 100);
            
            feather.replace();
        }
        
        function fecharModalConfiguracao() {
            const modal = document.getElementById('configSheetsModal');
            modal.classList.add('hidden');
        }
        
      

        async function usarPlanilhaExistente() {
            console.log('🎯 Botão Usar Planilha clicado!');
            const spreadsheetId = document.getElementById('spreadsheetIdInput').value.trim();
            
            if (!spreadsheetId) {
                mostrarToast('❌ Por favor, cole o ID da planilha', 'error');
                return;
            }
            
            try {
                const btn = document.querySelector('#configSheetsModal .config-option:nth-child(2) button');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;border-width:2px;"></div> Configurando...';
                btn.disabled = true;
                
                console.log('🔧 Enviando requisição para configurar planilha...');
                const response = await fetch(`${API_BASE_URL}/configurar-sheets`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${userToken}`
                    },
                    body: JSON.stringify({
                        spreadsheetId: spreadsheetId
                    })
                });
                
                const data = await response.json();
                console.log('🔧 Resposta da API:', data);
                
                if (response.ok) {
                    mostrarToast('✅ Planilha configurada com sucesso!', 'success');
                    fecharModalConfiguracao();
                } else {
                    throw new Error(data.msg || 'Erro ao configurar planilha');
                }
            } catch (error) {
                console.error('Erro ao configurar planilha:', error);
                mostrarToast('❌ Erro ao configurar planilha: ' + error.message, 'error');
            } finally {
                // Restaurar botão
                const btn = document.querySelector('#configSheetsModal .config-option:nth-child(2) button');
                btn.innerHTML = '💾 Usar Esta Planilha';
                btn.disabled = false;
            }
        }

       async function verificarConfiguracaoSheets() {
    // 🔥 CORREÇÃO: Verifica se usuário está logado
    if (!userToken) {
        console.log('❌ verificarConfiguracaoSheets: Usuário não logado - abortando');
        return;
    }
    
    try {
        console.log('🔍 [DEBUG] Iniciando verificação Sheets...');
        
        const response = await fetch(`${API_BASE_URL}/configuracao-sheets`, {
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        // 🔥 CORREÇÃO: Se 401, faz logout
        if (response.status === 401) {
            await logoutSilencioso();
            return;
        }
        
        console.log('🔍 [DEBUG] Status da resposta:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            
            // 🔥 CORREÇÃO: Só abre modal se NÃO tiver configurado E usuário ainda estiver logado
            if (!data.temSheetsConfigurado && userToken) {
                console.log('🔍 [DEBUG] Usuário NÃO tem Sheets configurado - mostrando modal em 2 segundos...');
                setTimeout(() => {
                    // 🔥 VERIFICA NOVAMENTE se usuário ainda está logado
                    if (userToken) {
                        console.log('🔍 [DEBUG] Exibindo modal agora!');
                        mostrarModalConfiguracao();
                    }
                }, 2000);
            }
        }
    } catch (error) {
        console.error('🔍 [DEBUG] Erro catch:', error);
    }
}

        // ---------------- TOASTS ----------------
        let activeToasts = [];
        function showToast(message, type = "success") {
            const colors = {
                success: "bg-gradient-to-r from-green-500 to-teal-400",
                error: "bg-gradient-to-r from-red-500 to-pink-500",
                info: "bg-gradient-to-r from-blue-500 to-cyan-400",
                warning: "bg-gradient-to-r from-yellow-500 to-amber-400"
            };
            
            const container = document.getElementById("toast-container");
            if (activeToasts.length >= 3) {
                const oldest = activeToasts.shift();
                oldest.remove();
            }
            
            const toast = document.createElement("div");
            toast.className = `p-4 rounded-lg shadow-lg text-white font-medium ${colors[type] || colors.info} opacity-0 translate-x-5 transition-all duration-300 flex items-center gap-2`;
            toast.innerHTML = `<i data-feather="${type==="success"?"check-circle":type==="error"?"alert-circle":"info"}" class="w-5 h-5"></i> <span>${message}</span>`;
            container.appendChild(toast);
            activeToasts.push(toast);
            feather.replace();
            
            requestAnimationFrame(()=>{
                toast.classList.remove("opacity-0","translate-x-5"); 
                toast.classList.add("opacity-100","translate-x-0");
            });
            
            setTimeout(()=>{
                toast.classList.add("opacity-0","translate-x-5"); 
                setTimeout(()=>{
                    toast.remove(); 
                    activeToasts=activeToasts.filter(t=>t!==toast);
                },300);
            },3000);
        }

       function renderAgendamentos() {
    console.log('🎨 Frontend: Renderizando agendamentos...');
    console.log('📊 Frontend: agendamentosCache:', agendamentosCache);
    console.log('📊 Frontend: diaSelecionado:', diaSelecionado);
    
    // 🔥 CORREÇÃO URGENTE: Garantir que agendamentosCache sempre seja array
    const agendamentos = agendamentosCache || [];
    
    const filtroNome = searchInput.value.toLowerCase();
    const filtroStatus = statusFilter.value;

    console.log('🔍 Frontend: Filtros - nome:', filtroNome, 'status:', filtroStatus);

    const filtrados = agendamentos.filter(a => {
        // 🔥 CORREÇÃO: Aplica filtro de status PRIMEIRO
        if (filtroStatus && a.status !== filtroStatus) {
            return false;
        }
        
        // 🔥 CORREÇÃO: Aplica filtro de texto
        if (filtroNome && !a.nome.toLowerCase().includes(filtroNome) && 
            !a.email.toLowerCase().includes(filtroNome)) {
            return false;
        }
        
        // 🔥 CORREÇÃO: Lógica de data corrigida para tabs de semana
        const dataAgendamento = new Date(`${a.data}T${a.horario}`);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        // 🔥 CORREÇÃO COMPLETA - Substitua toda a lógica de data:
if(diaSelecionado >= 0 && diaSelecionado <= 6) {
    // Dias da semana (Seg, Ter, Qua, etc.) - FUTURO
    return dataAgendamento.getDay() === diaSelecionado && 
           dataAgendamento >= hoje;
} else {
    // Tabs de tempo PASSADO - CORREÇÃO CRÍTICA
    const hoje = new Date();
    hoje.setHours(23, 59, 59, 999); // Fim do dia de hoje
    
    const dataAgendamentoCompleta = new Date(`${a.data}T${a.horario}`);
    
    if (diaSelecionado === -1) { // SEM PASSADA
        const umaSemanaAtras = new Date();
        umaSemanaAtras.setDate(umaSemanaAtras.getDate() - 7);
        umaSemanaAtras.setHours(0, 0, 0, 0);
        
        return dataAgendamentoCompleta >= umaSemanaAtras && 
               dataAgendamentoCompleta <= hoje;
                
    } else if (diaSelecionado === -2) { // 2 SEMANAS
        const duasSemanasAtras = new Date();
        duasSemanasAtras.setDate(duasSemanasAtras.getDate() - 14);
        duasSemanasAtras.setHours(0, 0, 0, 0);
        
        const umaSemanaAtras = new Date();
        umaSemanaAtras.setDate(umaSemanaAtras.getDate() - 7);
        umaSemanaAtras.setHours(0, 0, 0, 0);
        
        return dataAgendamentoCompleta >= duasSemanasAtras && 
               dataAgendamentoCompleta < umaSemanaAtras;
                
    } else if (diaSelecionado === -4) { // 1 MÊS
        const umMesAtras = new Date();
        umMesAtras.setDate(umMesAtras.getDate() - 30);
        umMesAtras.setHours(0, 0, 0, 0);
        
        const duasSemanasAtras = new Date();
        duasSemanasAtras.setDate(duasSemanasAtras.getDate() - 14);
        duasSemanasAtras.setHours(0, 0, 0, 0);
        
        return dataAgendamentoCompleta >= umMesAtras && 
               dataAgendamentoCompleta < duasSemanasAtras;
    }
    
    return false;
}
    })
    .sort((a,b) => {
        const dateA = new Date(`${a.data}T${a.horario}`);
        const dateB = new Date(`${b.data}T${b.horario}`);
        return dateA - dateB;
    });

    console.log('✅ Frontend: Agendamentos filtrados:', filtrados.length);

    if (filtrados.length === 0) {
        console.log('❌ Frontend: Nenhum agendamento após filtros');
        meusAgendamentos.innerHTML = `
            <div class='text-center py-8'>
                <div class="p-4 rounded-full bg-white/10 inline-block mb-4">
                    <i data-feather="calendar" class="w-8 h-8 text-gray-300"></i>
                </div>
                <p class="text-gray-300">Nenhum agendamento encontrado</p>
            </div>
        `;
        feather.replace();
        return;
    }

    meusAgendamentos.innerHTML = "";

    filtrados.forEach(a => {
        const div = document.createElement("div");
        div.className = `agendamento-card glass-card rounded-xl p-5 mb-4 transition-all duration-300 ${a.status}`;
        
        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-2">
                    <i data-feather="clock" class="w-4 h-4 text-gray-300"></i>
                    <span class="font-medium">${a.horario}</span>
                </div>
                <span class="text-sm px-2 py-1 rounded-full ${a.status === 'confirmado' ? 'bg-green-900/30 text-green-300' : a.status === 'pendente' ? 'bg-yellow-900/30 text-yellow-300' : 'bg-red-900/30 text-red-300'}">
                    ${a.status}
                </span>
            </div>
            <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                    <i data-feather="user" class="w-4 h-4 text-gray-300"></i>
                </div>
                <div>
                    <h3 class="font-medium">${a.nome}</h3>
                    <p class="text-sm text-gray-300">${formatData(a.data)}</p>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="flex items-center gap-2">
                    <i data-feather="mail" class="w-4 h-4 text-gray-300"></i>
                    <span class="truncate">${a.email}</span>
                </div>
                <div class="flex items-center gap-2">
                    <i data-feather="phone" class="w-4 h-4 text-gray-300"></i>
                    <span>${a.telefone}</span>
                </div>
            </div>
        `;

        const btnContainer = document.createElement("div");
        btnContainer.className = "flex gap-2 mt-4 flex-wrap";

        // Confirmar
        if (a.status !== "confirmado") {
            const btnConfirmar = document.createElement("button");
            btnConfirmar.innerHTML = `<i data-feather="check" class="w-4 h-4"></i> Confirmar`;
            btnConfirmar.className = "px-3 py-1.5 text-sm rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white flex items-center gap-1 shadow-md hover:opacity-90 transition-all";
            btnConfirmar.addEventListener("click", () => confirmarAgendamento(a.id));
            btnContainer.appendChild(btnConfirmar);
        }

        // Cancelar
        const btnCancelar = document.createElement("button");
        btnCancelar.innerHTML = `<i data-feather="x" class="w-4 h-4"></i> Cancelar`;
        btnCancelar.className = "px-3 py-1.5 text-sm rounded-lg bg-gradient-to-r from-red-500 to-rose-600 text-white flex items-center gap-1 shadow-md hover:opacity-90 transition-all";
        btnCancelar.addEventListener("click", () => cancelarAgendamento(a.id));
        btnContainer.appendChild(btnCancelar);

        // Reagendar
        const btnReagendar = document.createElement("button");
        btnReagendar.innerHTML = `<i data-feather="refresh-cw" class="w-4 h-4"></i> Reagendar`;
        btnReagendar.className = "px-3 py-1.5 text-sm rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white flex items-center gap-1 shadow-md hover:opacity-90 transition-all";
        btnReagendar.addEventListener("click", () => abrirModalReagendar(a));
        btnContainer.appendChild(btnReagendar);

        div.appendChild(btnContainer);
        meusAgendamentos.appendChild(div);
    });

    feather.replace();
}

        // ---------------- MODAL REAGENDAR ----------------
        function abrirModalReagendar(agendamento) {
            let modal = document.getElementById("modalReagendar");

            if (!modal) {
                modal = document.createElement("div");
                modal.id = "modalReagendar";
                modal.className = "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 hidden";
                modal.innerHTML = `
                    <div class="bg-gray-900 rounded-xl p-6 w-full max-w-md relative">
                        <button id="fecharModal" class="absolute top-4 right-4 text-gray-400 hover:text-white">
                            <i data-feather="x" class="w-5 h-5"></i>
                        </button>
                        <h2 class="text-lg font-medium mb-4 text-white">Reagendar Agendamento</h2>
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm text-gray-300 mb-1">Data</label>
                                <input type="date" id="novaData" class="w-full p-3 rounded-md bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                            </div>
                            <div>
                                <label class="block text-sm text-gray-300 mb-1">Horário</label>
                                <input type="time" id="novoHorario" class="w-full p-3 rounded-md bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                            </div>
                        </div>
                        <div class="flex justify-end gap-2 mt-6">
                            <button id="cancelarReagendar" class="px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600 transition-all">Cancelar</button>
                            <button id="confirmarReagendar" class="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all">Confirmar</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
                feather.replace();

                // Evento de fechar
                modal.querySelector("#fecharModal").addEventListener("click", () => {
                    modal.classList.add("hidden");
                });
                
                modal.querySelector("#cancelarReagendar").addEventListener("click", () => {
                    modal.classList.add("hidden");
                });
            }

            // Preenche valores atuais e define data mínima como hoje
            modal.querySelector("#novaData").value = agendamento.data;
            modal.querySelector("#novoHorario").value = agendamento.horario;

            // Remove qualquer evento antigo para evitar duplicação
            const confirmarBtn = modal.querySelector("#confirmarReagendar");
            const novoConfirmarBtn = confirmarBtn.cloneNode(true);
            confirmarBtn.parentNode.replaceChild(novoConfirmarBtn, confirmarBtn);

            novoConfirmarBtn.addEventListener("click", () => {
                const novaData = modal.querySelector("#novaData").value;
                const novoHorario = modal.querySelector("#novoHorario").value;

                if (!novaData || !novoHorario) {
                    showToast("Preencha data e horário corretamente!", "warning");
                    return;
                }

                reagendarAgendamento(agendamento.id, novaData, novoHorario);
                modal.classList.add("hidden");
            });

            // Mostra modal
            modal.classList.remove("hidden");
        }

        // ---------------- VERIFICAÇÃO E RENOVAÇÃO DE TOKEN ----------------
        async function verificarToken() {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                
                if (error || !session) {
                    console.log('❌ Sessão inválida, fazendo logout...');
                    await logoutSilencioso();
                    return false;
                }
                
                // 🔥 ATUALIZA O TOKEN SE ESTIVER VÁLIDO
                userToken = session.access_token;
                localStorage.setItem('userToken', userToken);
                return true;
                
            } catch (error) {
                console.error('Erro ao verificar token:', error);
                return false;
            }
        }

// ---------------- LOGOUT SILENCIOSO ----------------
async function logoutSilencioso() {
    try {
        console.log('🔒 Executando logout silencioso...');
        localStorage.removeItem('userToken');
        localStorage.removeItem('supabase.auth.token');
        userToken = null;
        agendamentosCache = [];
        
        // Para operações em andamento
        desconectarSSE();
        if (intervaloAtualizacao) {
            clearInterval(intervaloAtualizacao);
        }
        
        // 🔥 CORREÇÃO: Oculta TUDO e mostra apenas login
        loginSection.style.display = 'block';
        form.style.display = 'none';
        meusAgendamentos.style.display = 'none';
        document.getElementById('filtersSection').style.display = 'none';
        document.getElementById('diasTabs').style.display = 'none';
        document.getElementById('secoesIA').style.display = 'none';
        logoutBtn.style.display = 'none';
        document.getElementById('settingsBtn').style.display = 'none';
        document.getElementById('gerarLinkBtn').style.display = 'none';
        
        console.log('✅ Logout silencioso concluído');
    } catch (error) {
        console.log('Erro no logout silencioso:', error);
    }
}

        
       async function listarAgendamentos(){
    // 🔥 CORREÇÃO: Verifica se usuário está logado ANTES de fazer qualquer coisa
    if (!userToken) {
        console.log('❌ listarAgendamentos: Usuário não logado - abortando');
        return;
    }
    
    try {
        console.log('🔄 Frontend: Iniciando listarAgendamentos...');
        
        // 🔥 VERIFICA TOKEN ANTES DE FAZER REQUISIÇÃO
        const tokenValido = await verificarToken();
        if (!tokenValido) {
            console.log('❌ Token inválido em listarAgendamentos');
            return;
        }

        console.log('📡 Frontend: Fazendo requisição para API...');
        const res = await fetch(`${API_BASE_URL}/agendamentos`, {
            headers: { "Authorization": `Bearer ${userToken}` }
        });
        
        // 🔥 CORREÇÃO: Se 401, faz logout silencioso
        if (res.status === 401) {
            console.log('🔐 Token expirado durante listarAgendamentos');
            await logoutSilencioso();
            return;
        }
        
        if (!res.ok) {
            throw new Error(`Erro ${res.status}: ${res.statusText}`);
        }
        
        const data = await res.json();
        
        if (data && data.agendamentos) {
            agendamentosCache = data.agendamentos;
            console.log('✅ Frontend: Agendamentos carregados:', agendamentosCache.length);
        } else {
            agendamentosCache = [];
        }
        
        meusAgendamentos.style.display = 'block';
        document.getElementById('filtersSection').style.display = 'block';
        document.getElementById('diasTabs').style.display = 'flex';
        initTabsDias();
        renderAgendamentos(); 
        
    } catch(e){
        console.error("❌ Frontend: Erro ao listar agendamentos:", e);
        // 🔥 CORREÇÃO: Não mostra toast se usuário não está logado
        if (userToken) {
            showToast("Erro ao carregar agendamentos","error");
        }
        agendamentosCache = [];
        renderAgendamentos();
    } finally {
        limparCacheEstatisticas();
    }
}

        // ---------------- RENOVAÇÃO DE TOKEN ----------------
        async function renovarToken() {
            try {
                const { data, error } = await supabase.auth.refreshSession();
                if (error) throw error;
                
                if (data.session) {
                    userToken = data.session.access_token;
                    localStorage.setItem('userToken', userToken);
                    console.log('✅ Token renovado com sucesso');
                    return true;
                }
                return false;
            } catch (error) {
                console.error('❌ Erro ao renovar token:', error);
                await logoutSilencioso();
                return false;
            }
        }

      

        // ✅ LOGIN GOOGLE CORRIGIDO
      // ✅ LOGIN GOOGLE COM VERIFICAÇÃO DE TERMOS (SUBSTITUA O EXISTENTE)
document.getElementById('googleLoginBtn').addEventListener('click', async () => {
    // 🔒 VERIFICAR CHECKBOX (NOVO - IMPORTANTE!)
    const aceiteTermos = document.getElementById('aceiteTermos');
    if (!aceiteTermos?.checked) {
        showToast("❌ Você precisa aceitar os termos para continuar", "error");
        aceiteTermos?.focus();
        return;
    }
            const btn = document.getElementById('googleLoginBtn');
            const originalText = btn.innerHTML;
            
            btn.innerHTML = '<div class="loading-spinner"></div> <span>Conectando com Google...</span>';
            btn.disabled = true;
            
            try {
                console.log('🔐 Iniciando autenticação Google...');
                
                // 🔥 DETECÇÃO CORRETA DE AMBIENTE
                const isMobileApp = !!(window.Capacitor || window.cordova);
                console.log('📱 Ambiente:', isMobileApp ? 'APP' : 'WEB');
                
                // 🔥 URL DE REDIRECT CORRETA
                const redirectUrl = isMobileApp 
                    ? 'com.oubook.agendamento://auth-callback'
                    : 'https://frontrender-iota.vercel.app/';
                
                console.log('🎯 Redirect URL:', redirectUrl);
                
                const { data, error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: redirectUrl,
                        skipBrowserRedirect: false
                    }
                });
                
                if (error) throw error;
                
                console.log('🌐 URL de autenticação:', data.url);
                
                // 🔥 ABRE O BROWSER CORRETAMENTE
                if (isMobileApp && window.Capacitor?.Plugins?.Browser) {
                    console.log('📱 Abrindo no Capacitor Browser...');
                    await window.Capacitor.Plugins.Browser.open({ 
                        url: data.url,
                        windowName: '_self'
                    });
                } else {
                    console.log('🌐 Redirecionando para URL...');
                    window.location.href = data.url;
                }
                
            } catch (error) {
                console.error('❌ Erro no login Google:', error);
                showToast("Erro ao conectar com Google", "error");
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });

// 🔒 SALVAR TERMOS NO BANCO APÓS LOGIN (se ainda não salvou)
async function saveTermsAcceptanceToDatabase() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user && localStorage.getItem('termsAccepted')) {
            // Verifica se já não salvou antes
            const { data: existing } = await supabase
                .from('user_terms_acceptance')
                .select('id')
                .eq('user_id', user.id)
                .eq('terms_version', '1.0')
                .single();
            
            if (!existing) {
                const { error } = await supabase
                    .from('user_terms_acceptance')
                    .insert({
                        user_id: user.id,
                        user_email: user.email,
                        terms_version: '1.0',
                        user_agent: navigator.userAgent
                    });
                
                if (!error) {
                    console.log('📝 Termos salvos no banco para usuário:', user.email);
                }
            }
        }
    } catch (error) {
        console.log('⚠️ Não foi possível salvar termos no banco:', error);
    }
}

        
// ---------------- LOGOUT CORRIGIDO ----------------
logoutBtn.addEventListener('click', async () => {
    console.log('🚪 Iniciando logout...');
    
    try {
        // Para todas as operações
        desconectarSSE();
        if (intervaloAtualizacao) {
            clearInterval(intervaloAtualizacao);
        }
        
        // Limpa storage
        localStorage.removeItem('userToken');
        localStorage.removeItem('supabase.auth.token');
        
        // Logout no Supabase
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.log('⚠️ Erro no logout Supabase:', error);
        }
        
    } catch (error) {
        console.log('⚠️ Erro no processo de logout:', error);
    } finally {
        // 🔥 GARANTE QUE LIMPA TUDO MESMO COM ERRO
        userToken = null;
        agendamentosCache = [];
        
        // 🔥 CORREÇÃO CRÍTICA: Oculta TODAS as seções do app
        loginSection.style.display = 'block';
        form.style.display = 'none';
        meusAgendamentos.style.display = 'none';
        document.getElementById('filtersSection').style.display = 'none';
        document.getElementById('diasTabs').style.display = 'none';
        document.getElementById('secoesIA').style.display = 'none';
        
        // 🔥 CORREÇÃO: Oculta botões do usuário logado
        logoutBtn.style.display = 'none';
        document.getElementById('settingsBtn').style.display = 'none';
        document.getElementById('gerarLinkBtn').style.display = 'none';
        
        // 🔥 CORREÇÃO: Limpa os campos de login
        if (document.getElementById('email')) {
            document.getElementById('email').value = '';
        }
        if (document.getElementById('senha')) {
            document.getElementById('senha').value = '';
        }
        
        console.log('✅ Logout realizado com sucesso - interface limpa');
        showToast("Logout realizado com sucesso", "info");
        
        // 🔥 OPCIONAL: Recarrega para garantir clean state completo
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
});


        
    // 🔥 ATUALIZAR FUNÇÃO AGENDAR EXISTENTE - ADICIONAR VERIFICAÇÃO DE USO
form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    
    // 🔥 NOVO: VERIFICAÇÃO DE USO PREMIUM (SÓ VERIFICA, NÃO REGISTRA AINDA)
    if (premiumManager && userToken) {
        const status = await premiumManager.checkTrialStatus();
        
        // 🔥 BLOQUEIA SE JÁ ESTIVER NO LIMITE
        if (status.dailyUsagesLeft <= 0) {
            console.log('🚫 Limite atingido - bloqueando agendamento');
            const limit = status.isPremiumTrial ? 15 : 5;
            premiumManager.showDailyLimitModal(limit);
            return;
        }
    } else if (!userToken) {
        showToast("Faça login para agendar", "warning");
        return;
    }
    
    const formData = new FormData(form);
    const dataToSend = {};
    formData.forEach((v,k) => dataToSend[k] = v);

    // Validação dos campos
    if(!dataToSend.Nome || !dataToSend.Telefone || !dataToSend.Data || !dataToSend.Horario) {
        showToast("Preencha todos os campos obrigatórios", "warning");
        return;
    }

    if(!dataToSend.Email || dataToSend.Email.trim() === '') {
        dataToSend.Email = 'Não informado';
    }

    // Mostrar loading
    agendarText.classList.add('hidden');
    agendarSpinner.classList.remove('hidden');
    form.querySelector('button[type="submit"]').disabled = true;

    try{
        const response = await fetch(`${API_BASE_URL}/agendar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                "Authorization": `Bearer ${userToken}`
            },
            body: JSON.stringify(dataToSend)
        });
        
        if(response.ok){ 
            // 🔥 SÓ REGISTRA USO SE O AGENDAMENTO FOR BEM-SUCEDIDO
            if (premiumManager && userToken) {
                const canUse = await premiumManager.registerUsage();
                if (!canUse) {
                    // Se não puder usar (limite atingido durante o processo)
                    showToast("Limite atingido durante o agendamento", "error");
                    return;
                }
            }
            
            showToast("Agendado com sucesso!", "success"); 
            form.reset(); 
            listarAgendamentos(); 
            
            // 🔥 ATUALIZA BADGE APÓS AGENDAMENTO BEM-SUCEDIDO
            if (premiumManager) {
                await premiumManager.updateUsageBadge();
            }
        } else {
    const data = await response.json();
    
    // 🔥 TRATAMENTO DE ERRO MELHORADO
    if (response.status === 400) {
        // Agora trata diferentes tipos de erro 400 do backend
        if (data.msg?.includes("Horário indisponível")) {
            showToast(data.msg, "error");
        } else if (data.msg?.includes("Fora do horário")) {
            showToast(data.msg, "error");
        } else if (data.msg?.includes("bloqueado")) {
            showToast(data.msg, "error");
        } else if (data.msg?.includes("passado")) {
            showToast(data.msg, "error");
        } else if (data.msg?.includes("conflito") || data.msg?.includes("já possui")) {
            showToast(data.msg, "error");
        } else {
            showToast(data.msg || "Erro ao agendar", "error");
        }
    } else {
        // Outros códigos de erro (401, 500, etc)
        showToast(data.msg || "Erro ao agendar", "error");
    }
    
    console.log("Detalhes do erro:", data);
}
    } catch(err){ 
        console.error(err); 
        showToast("Erro ao enviar agendamento", "error"); 
    } finally {
        // Esconder loading
        agendarText.classList.remove('hidden');
        agendarSpinner.classList.add('hidden');
        form.querySelector('button[type="submit"]').disabled = false;
    }
});

        // ---------------- FILTROS ----------------
        searchInput.addEventListener("input", debounce(renderAgendamentos, 300));
        statusFilter.addEventListener("change", renderAgendamentos);

        // 1. Buscar agendamentos do Supabase
        async function buscarAgendamentosDoSupabase() {
            try {
                console.log('🔄 Buscando agendamentos do Supabase...');
                
                const { data: agendamentos, error } = await supabase
                    .from('agendamentos')
                    .select('*')
                    .order('data', { ascending: true })
                    .order('horario', { ascending: true });

                if (error) throw error;

                console.log(`✅ ${agendamentos.length} agendamentos encontrados`);
                return agendamentos;
                
            } catch (error) {
                console.error('❌ Erro ao buscar agendamentos:', error);
                return [];
            }
        }

        // 2. Atualizar a lista na tela
        async function atualizarListaAutomaticamente() {
            const agendamentos = await buscarAgendamentosDoSupabase();
            
            if (agendamentos.length > 0 && typeof renderAgendamentos === 'function') {
                // 🔥 ATUALIZA O CACHE E RENDERIZA
                agendamentosCache = agendamentos;
                renderAgendamentos();
                console.log('🎯 Lista atualizada automaticamente');
            }
        }

        // 3. ATUALIZAÇÃO AUTOMÁTICA (a cada 30 segundos)
        let intervaloAtualizacao;

        function iniciarAtualizacaoAutomatica() {
            // Atualiza imediatamente ao carregar
            atualizarListaAutomaticamente();
            
            // E a cada 30 segundos
            intervaloAtualizacao = setInterval(atualizarListaAutomaticamente, 30000);
            
            console.log('🔔 Atualização automática ativada (30 segundos)');
        }

    

        // 5. Parar atualização automática quando página não está visível
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                // Página não visível - para de atualizar
                if (intervaloAtualizacao) {
                    clearInterval(intervaloAtualizacao);
                    console.log('⏸️ Atualização automática pausada');
                }
            } else {
                // Página visível - retorna a atualizar
                iniciarAtualizacaoAutomatica();
            }
        });

        // 🔥 INICIALIZAR QUANDO USUÁRIO ESTIVER LOGADO
        function iniciarSistemaAtualizacao() {
            if (userToken) {
                console.log('🚀 Iniciando sistema de atualização automática...');
                iniciarAtualizacaoAutomatica();
            }
        }

        // ---------------- TABS ----------------
        function initTabsDias(){
            const tabsDia = document.querySelectorAll(".tab-dia");
            const tabsSemana = document.querySelectorAll(".tab-semana");
            
            tabsDia.forEach(btn => {
                btn.addEventListener("click", () => {
                    tabsDia.forEach(b => b.classList.remove("bg-gradient-to-r", "from-indigo-500", "to-cyan-500", "active"));
                    tabsDia.forEach(b => b.classList.add("bg-white/10", "hover:bg-white/20"));
                    tabsSemana.forEach(b => b.classList.remove("bg-gradient-to-r", "from-indigo-500", "to-cyan-500", "active"));
                    tabsSemana.forEach(b => b.classList.add("bg-white/5", "hover:bg-white/10"));
                    
                    btn.classList.remove("bg-white/10", "hover:bg-white/20");
                    btn.classList.add("bg-gradient-to-r", "from-indigo-500", "to-cyan-500", "active");
                    diaSelecionado = parseInt(btn.dataset.dia);
                    renderAgendamentos();
                });
            });

            tabsSemana.forEach(btn => {
                btn.addEventListener("click", () => {
                    tabsDia.forEach(b => b.classList.remove("bg-gradient-to-r", "from-indigo-500", "to-cyan-500", "active"));
                    tabsDia.forEach(b => b.classList.add("bg-white/10", "hover:bg-white/20"));
                    tabsSemana.forEach(b => b.classList.remove("bg-gradient-to-r", "from-indigo-500", "to-cyan-500", "active"));
                    tabsSemana.forEach(b => b.classList.add("bg-white/5", "hover:bg-white/10"));
                    
                    btn.classList.remove("bg-white/5", "hover:bg-white/10");
                    btn.classList.add("bg-gradient-to-r", "from-indigo-500", "to-cyan-500", "active");
                    
                    const semanas = parseInt(btn.dataset.semana);
                    diaSelecionado = semanas; 
                    renderAgendamentos();
                });
            });
            } 
           

        // ---------------- FUNÇÃO AUXILIAR: Converter blob para base64 ----------------
        function blobToBase64(blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64data = reader.result.split(',')[1];
                    resolve(base64data);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }

        // ---------------- VERIFICAR E PEDIR PERMISSÕES ----------------
        async function verificarPermissoes() {
            try {
                if (window.Capacitor && window.Capacitor.Plugins?.Filesystem) {
                    // 🔥 SOLUÇÃO: Usar diretório CACHE que não precisa de permissão
                    return true;
                }
                return false;
            } catch (error) {
                console.log('⚠️ Erro ao verificar permissões:', error);
                return false;
            }
        }

        // ---------------- EXPORT CSV CORRIGIDO ----------------
        exportCSVBtn.addEventListener("click", async () => {
            try {
                const filtrados = agendamentosCache.filter(a => 
                    statusFilter.value ? a.status === statusFilter.value : true
                );
                
                if (filtrados.length === 0) {
                    showToast("Nenhum agendamento para exportar", "warning");
                    return;
                }

                // 🔥 CRIA CSV CORRETO
                let csv = "Nome,Email,Telefone,Data,Horário,Status\n";
                filtrados.forEach(a => {
                    const nome = `"${a.nome.replace(/"/g, '""')}"`;
                    const email = `"${a.email}"`;
                    const telefone = `"${a.telefone}"`;
                    csv += `${nome},${email},${telefone},${a.data},${a.horario},${a.status}\n`;
                });

                const blob = new Blob([csv], { 
                    type: "text/csv;charset=utf-8;" 
                });

                const isMobile = window.Capacitor && window.Capacitor.isNativePlatform;

                if (!isMobile) {
                    // 💻 WEB - Download normal
                    const link = document.createElement("a");
                    link.href = URL.createObjectURL(blob);
                    link.download = `agendamentos_${new Date().toISOString().split('T')[0]}.csv`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setTimeout(() => URL.revokeObjectURL(link.href), 100);
                    showToast("CSV exportado com sucesso!", "success");
                } else {
                    // 📱 MOBILE - CORREÇÃO: SALVAR TEXTO DIRETO, NÃO BASE64
                    console.log(`📱 Iniciando exportação CSV para mobile...`);
                    
                    console.log(`💾 Salvando arquivo CSV...`);
                    
                    // 🔥 CORREÇÃO CRÍTICA: Salva o TEXTO CSV diretamente, não base64
                    const result = await window.Capacitor.Plugins.Filesystem.writeFile({
                        path: `agendamentos_${new Date().toISOString().split('T')[0]}.csv`,
                        data: csv,
                        directory: 'CACHE',
                        encoding: 'utf8'
                    });

                    console.log('✅ Arquivo CSV salvo em:', result.uri);

                    // Compartilha o arquivo
                    await window.Capacitor.Plugins.Share.share({
                        title: `Agendamentos - CSV`,
                        text: `Arquivo CSV de agendamentos exportado do app`,
                        url: result.uri,
                        dialogTitle: `Compartilhar CSV`
                    });
                    
                    showToast(`CSV exportado com sucesso!`, "success");
                }

            } catch (error) {
                console.error("❌ Erro ao exportar CSV:", error);
                showToast("Erro ao exportar CSV", "error");
            }
        });

        // ---------------- EXPORT PDF ATUALIZADO ----------------
        exportPDFBtn.addEventListener("click", async () => {
            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();

                const filtrados = agendamentosCache.filter(a => 
                    statusFilter.value ? a.status === statusFilter.value : true
                );
                
                if (filtrados.length === 0) {
                    showToast("Nenhum agendamento para exportar", "warning");
                    return;
                }

                // CABEÇALHO
                doc.setFontSize(18);
                doc.setTextColor(40);
                doc.text("Relatório de Agendamentos", 105, 20, null, null, "center");

                doc.setFontSize(12);
                doc.setTextColor(100);
                const today = new Date().toLocaleDateString("pt-BR", { 
                    day: "2-digit", 
                    month: "2-digit", 
                    year: "numeric" 
                });
                doc.text(`Gerado em: ${today}`, 105, 30, null, null, "center");

                doc.setDrawColor(200);
                doc.line(20, 40, 190, 40);

                // TABELA
                doc.setFontSize(10);
                doc.setTextColor(40);
                let y = 50;

                // Cabeçalho da tabela
                doc.setFillColor(240, 240, 240);
                doc.rect(20, y, 170, 10, "F");
                doc.text("Data", 25, y + 7);
                doc.text("Horário", 50, y + 7);
                doc.text("Nome", 80, y + 7);
                doc.text("Status", 160, y + 7);
                y += 12;

                // Dados
                filtrados.forEach((a, index) => {
                    if (y > 270) {
                        doc.addPage();
                        y = 20;
                    }

                    if (index % 2 === 0) {
                        doc.setFillColor(250, 250, 250);
                        doc.rect(20, y - 2, 170, 10, "F");
                    }

                    doc.setTextColor(40);
                    doc.text(formatData(a.data), 25, y + 7);
                    doc.text(a.horario, 50, y + 7);
                    
                    const nome = a.nome.length > 20 ? a.nome.substring(0, 20) + '...' : a.nome;
                    doc.text(nome, 80, y + 7);

                    // Status colorido
                    if (a.status === "confirmado") {
                        doc.setTextColor(0, 150, 0);
                    } else if (a.status === "pendente") {
                        doc.setTextColor(200, 150, 0);
                    } else {
                        doc.setTextColor(150, 0, 0);
                    }

                    doc.text(a.status.charAt(0).toUpperCase() + a.status.slice(1), 160, y + 7);
                    y += 10;
                });

                const pdfBlob = doc.output("blob");
                
                // VERIFICAÇÃO DE PLATAFORMA
                const isMobile = window.Capacitor && 
                                window.Capacitor.isNativePlatform && 
                                window.Capacitor.isNativePlatform();

                if (!isMobile) {
                    // 💻 WEB
                    const link = document.createElement("a");
                    link.href = URL.createObjectURL(pdfBlob);
                    link.download = `agendamentos_${new Date().toISOString().split('T')[0]}.pdf`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setTimeout(() => URL.revokeObjectURL(link.href), 100);
                    showToast("PDF exportado com sucesso!", "success");
                } else {
                    // 📱 MOBILE - CORREÇÃO: Código direto sem exportMobile
                    console.log(`📱 Iniciando exportação PDF para mobile...`);
                    
                    // 🔥 CORREÇÃO: Data URL completa para PDF
                    const base64Data = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            resolve(reader.result);
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(pdfBlob);
                    });
                    
                    console.log(`💾 Salvando arquivo PDF...`);
                    
                    const result = await window.Capacitor.Plugins.Filesystem.writeFile({
                        path: `agendamentos_${new Date().toISOString().split('T')[0]}.pdf`,
                        data: base64Data,
                        directory: 'CACHE'
                    });

                    console.log('✅ Arquivo PDF salvo em:', result.uri);

                    // Compartilha o arquivo
                    await window.Capacitor.Plugins.Share.share({
                        title: `Agendamentos - PDF`,
                        text: `Arquivo PDF de agendamentos exportado do app`,
                        url: result.uri,
                        dialogTitle: `Compartilhar PDF`
                    });
                    
                    showToast(`PDF exportado com sucesso!`, "success");
                }

            } catch (error) {
                console.error("❌ Erro ao exportar PDF:", error);
                showToast("Erro ao exportar PDF", "error");
            }
        });

        // 🔥 ADICIONE ESTA FUNÇÃO PARA PEGAR O EMAIL DO USUÁRIO
        async function getUserEmail() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                return user?.email;
            } catch (error) {
                console.error("Erro ao obter email do usuário:", error);
                return null;
            }
        }

        // ---------------- CONFIRMAR AGENDAMENTO ----------------
    async function confirmarAgendamento(id) {
    if (!userToken) {
        showToast("Faça login para confirmar um agendamento.", "warning");
        return;
    }

    try {
        console.log('✅ Confirmando agendamento ID:', id);
        
        // 🔥 PRIMEIRO: Pega o email do usuário logado
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !user.email) {
            showToast("Erro: usuário não encontrado", "error");
            return;
        }

        const userEmail = user.email;
        console.log('📧 Usuário:', userEmail);
        
        // 🔥 CORREÇÃO: Endpoint com email na URL
        const res = await fetch(`${API_BASE_URL}/agendamentos/${userEmail}/confirmar/${id}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${userToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                status: "confirmado",
                confirmado: true 
            })
        });

        console.log('📨 Status resposta:', res.status);
        
        if (!res.ok) {
            const errorText = await res.text();
            console.error('❌ Erro HTTP:', res.status, errorText);
            throw new Error(`Erro ${res.status}: ${errorText}`);
        }

        const data = await res.json();
        console.log('📨 Resposta confirmação:', data);

        if (data.msg) {
            showToast(data.msg, "success");
            listarAgendamentos();
            limparCacheEstatisticas();
        } else {
            showToast("Agendamento confirmado com sucesso!", "success");
            listarAgendamentos();
            limparCacheEstatisticas();
        }

    } catch (e) {
        console.error('❌ Erro confirmar:', e);
        showToast("Erro ao confirmar agendamento", "error");
    }
}

        // ---------------- CANCELAR AGENDamento ----------------
     async function cancelarAgendamento(id) {
    if (!userToken) {
        showToast("Faça login para cancelar um agendamento.", "warning");
        return;
    }

    try {
        console.log('❌ Cancelando agendamento ID:', id);
        
        // 🔥 PRIMEIRO: Pega o email do usuário logado
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !user.email) {
            showToast("Erro: usuário não encontrado", "error");
            return;
        }

        const userEmail = user.email;
        console.log('📧 Usuário:', userEmail);
        
        // 🔥 CORREÇÃO: Endpoint com email na URL
        const res = await fetch(`${API_BASE_URL}/agendamentos/${userEmail}/cancelar/${id}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${userToken}`,
                "Content-Type": "application/json"
            }
            // 🔥 NOTA: Seu backend não espera body no cancelar
        });

        console.log('📨 Status resposta:', res.status);
        
        if (!res.ok) {
            const errorText = await res.text();
            console.error('❌ Erro HTTP:', res.status, errorText);
            throw new Error(`Erro ${res.status}: ${errorText}`);
        }

        const data = await res.json();
        console.log('📨 Resposta cancelamento:', data);

        if (data.msg) {
            showToast(data.msg, "success");
            listarAgendamentos();
            limparCacheEstatisticas();
        } else {
            showToast("Agendamento cancelado com sucesso!", "success");
            listarAgendamentos();
            limparCacheEstatisticas();
        }

    } catch (e) {
        console.error('❌ Erro cancelar:', e);
        showToast("Erro ao cancelar agendamento", "error");
    }
}

        // ---------------- REAGENDAR AGENDAMENTO ----------------
        async function reagendarAgendamento(id, novaData, novoHorario) {
            if (!userToken) {
                showToast("Faça login para reagendar um agendamento.", "warning");
                return;
            }

            try {
                const userEmail = await getUserEmail();
                if (!userEmail) {
                    showToast("Erro ao obter email do usuário.", "error");
                    return;
                }

                const res = await fetch(`${API_BASE_URL}/agendamentos/${userEmail}/reagendar/${id}`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${userToken}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ 
                        novaData, 
                        novoHorario
                    })
                });

                const data = await res.json();

                if (res.ok) {
                    showToast("Agendamento reagendado com sucesso!", "success");
                    listarAgendamentos();
                    limparCacheEstatisticas();
                } else {
                    // Detecta conflito de horário (erro do índice único)
                    if (data.code === "23505") {
                        showToast("Já existe um agendamento nesse horário!", "error");
                    } else {
                        showToast("Erro ao reagendar: " + (data.msg || data.message), "error");
                    }
                }

            } catch (e) {
                console.error(e);
                showToast("Erro de conexão ao reagendar.", "error");
            }
        }

       // 🔥 ATUALIZE a função configurarEventListenersModal para esta versão:

// 🔧 ATUALIZAR: Função configurarEventListenersModal - VERSÃO SIMPLIFICADA
function configurarEventListenersModal() {
    console.log('🔧 Configurando event listeners do modal...');
    
    const modal = document.getElementById('configSheetsModal');
    if (!modal) {
        console.log('❌ Modal não encontrado!');
        return;
    }

    // 🔥 REMOVIDO: Botão Criar Planilha Automática

    // Botão Usar Planilha Existente (agora é o primeiro)
    const btnUsar = modal.querySelector('.config-option:nth-child(1) button');
    if (btnUsar) {
        btnUsar.replaceWith(btnUsar.cloneNode(true));
        const novoBtnUsar = modal.querySelector('.config-option:nth-child(1) button');
        novoBtnUsar.addEventListener('click', usarPlanilhaExistente);
        console.log('✅ Event listener Usar adicionado');
    }

    // Botão Configurar Depois (agora é o segundo)
    const btnFechar = modal.querySelector('.config-option:nth-child(2) button');
    if (btnFechar) {
        btnFechar.replaceWith(btnFechar.cloneNode(true));
        const novoBtnFechar = modal.querySelector('.config-option:nth-child(2) button');
        novoBtnFechar.addEventListener('click', fecharConfiguracao);
        console.log('✅ Event listener Fechar adicionado');
    }

    // 🔥 ADICIONAR: Fechar modal clicando fora
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            fecharModalConfiguracao();
        }
    });

    // 🔥 ADICIONAR: Fechar com ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            fecharModalConfiguracao();
        }
    });
}
        // ==================== FUNÇÕES IA (ADICIONAR NO SEU FRONTEND) ====================

        // 🔧 FUNÇÃO: Pegar token CORRIGIDA
        function getToken() {
            return userToken || localStorage.getItem('userToken');
        }

     
       // 🎯 FUNÇÃO: Sugerir Horários CORRIGIDA - COM PERFIL
window.sugerirHorarios = async function() {
    try {
        const sugestoesDiv = document.getElementById('sugestoes-horarios');
        if (!sugestoesDiv) {
            console.error('❌ Elemento sugestoes-horarios não encontrado');
            return;
        }
        
        sugestoesDiv.innerHTML = '<div class="p-3 bg-blue-500/20 rounded-lg">🔍 Analisando sua agenda e perfil...</div>';

        const token = getToken();
        if (!token) {
            showToast("Faça login para usar esta função", "error");
            sugestoesDiv.innerHTML = '';
            return;
        }

        // 🔥 NOVO: Buscar perfil primeiro
        let perfilInfo = '';
        try {
            const perfilResponse = await fetch(`${API_BASE_URL}/api/meu-perfil`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (perfilResponse.ok) {
                const perfilData = await perfilResponse.json();
                if (perfilData.success && perfilData.perfil) {
                    const p = perfilData.perfil;
                    perfilInfo = `Baseado no seu perfil: ${p.nome_negocio} (${p.tipo_negocio}), atendendo ${p.dias_funcionamento.join(', ')} das ${Object.values(p.horarios_funcionamento)[0]?.inicio || '08:00'} às ${Object.values(p.horarios_funcionamento)[0]?.fim || '18:00'}`;
                }
            }
        } catch (error) {
            console.log('Erro ao buscar perfil para sugestões:', error);
        }

        const response = await fetch(`${API_BASE_URL}/api/sugerir-horarios`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`Erro ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            sugestoesDiv.innerHTML = `
                <div class="p-4 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-lg border border-green-500/30">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="text-green-400">📅</span>
                        <strong class="text-green-400">Horários Sugeridos</strong>
                    </div>
                    ${perfilInfo ? `<p class="text-sm text-green-300 mb-2">${perfilInfo}</p>` : ''}
                    <div class="sugestoes-texto whitespace-pre-line text-sm leading-relaxed">
                        ${data.sugestoes || 'Nenhuma sugestão disponível no momento.'}
                    </div>
                </div>
            `;
        } else {
            sugestoesDiv.innerHTML = `
                <div class="p-3 bg-red-500/20 rounded-lg">
                    <p class="text-red-400">❌ ${data.msg || 'Erro ao buscar sugestões'}</p>
                </div>
            `;
        }

    } catch (error) {
        console.error('❌ Erro ao sugerir horários:', error);
        const sugestoesDiv = document.getElementById('sugestoes-horarios');
        if (sugestoesDiv) {
            sugestoesDiv.innerHTML = `
                <div class="p-3 bg-red-500/20 rounded-lg">
                    <p class="text-red-400">❌ Erro de conexão</p>
                </div>
            `;
        }
    }
}

        // ==================== SSE NO FRONTEND ====================
        let eventSource = null;

       // 🔥 CORREÇÃO: Função conectarSSE simplificada
function conectarSSE() {
    if (!userToken) {
        console.log('❌ SSE: Token não disponível');
        return;
    }
    
    try {
        // Usa EventSource nativo (mais confiável)
        eventSource = new EventSource(`${API_BASE_URL}/api/updates?token=${encodeURIComponent(userToken)}`);
        
        eventSource.onopen = () => {
            console.log('✅ SSE: Conectado com sucesso!');
        };
        
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                processarEventoSSE(data);
            } catch (e) {
                console.log('📨 SSE: Mensagem recebida:', event.data);
            }
        };
        
        eventSource.onerror = (error) => {
            console.error('❌ SSE: Erro na conexão:', error);
            eventSource.close();
            
            // Reconexão automática
            setTimeout(() => {
                console.log('🔄 SSE: Tentando reconectar...');
                conectarSSE();
            }, 5000);
        };
        
    } catch (error) {
        console.error('❌ SSE: Erro na inicialização:', error);
    }
}

        // 🔥 NOVA: Conexão SSE usando fetch (mais confiável)
        async function conectarSSEComFetch() {
            try {
                const response = await fetch(`${API_BASE_URL}/api/updates`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${userToken}`,
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache'
                    },
                    credentials: 'include'
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                console.log('✅ SSE: Conectado com fetch!');
                
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                
                while (true) {
                    const { value, done } = await reader.read();
                    
                    if (done) {
                        console.log('🔔 SSE: Conexão fechada pelo servidor');
                        break;
                    }
                    
                    const chunk = decoder.decode(value);
                    console.log('🔔 SSE: Dados recebidos:', chunk);
                    
                    // Processa cada linha do SSE
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                processarEventoSSE(data);
                            } catch (e) {
                                // Ignora linhas que não são JSON
                            }
                        }
                    }
                }
                
            } catch (error) {
                console.error('❌ SSE: Erro na conexão fetch:', error);
                
                // 🔥 RECONEXÃO AUTOMÁTICA
                setTimeout(() => {
                    console.log('🔄 SSE: Tentando reconectar em 3 segundos...');
                    conectarSSE();
                }, 3000);
            }
        }

        // 🔥 FUNÇÃO: Processar eventos SSE
        function processarEventoSSE(data) {
            console.log('🔔 SSE: Evento recebido:', data);
            
            switch (data.type) {
                case 'connected':
                    console.log('✅ SSE: Conectado com sucesso!');
                    showToast("🔔 Conectado - atualizações em tempo real ativas", "success");
                    break;
                    
                case 'novo_agendamento':
                    console.log('🎉 SSE: Novo agendamento!', data.agendamento);
                    
                    // 🔥 ATUALIZAÇÃO IMEDIATA
                    mostrarNotificacaoAgendamento(data.agendamento);
                    
                    // 🔥 FORÇA ATUALIZAÇÃO DA LISTA
                    setTimeout(() => {
                        forcarAtualizacaoAgendamentos();
                    }, 500);
                    
                    break;
                    
                case 'ping':
                    console.log('🏓 SSE: Ping recebido');
                    break;
                    
                default:
                    console.log('🔔 SSE: Evento desconhecido:', data);
            }
        }

        // 🔥 FUNÇÃO: Mostrar notificação do novo agendamento
        function mostrarNotificacaoAgendamento(agendamento) {
            // Cria uma notificação flutuante
            const notificacao = document.createElement('div');
            notificacao.className = 'fixed top-4 right-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white p-4 rounded-lg shadow-lg z-50 max-w-sm animate-fade-in';
            notificacao.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="text-2xl">🎉</div>
                    <div>
                        <p class="font-semibold">Novo Agendamento!</p>
                        <p class="text-sm opacity-90">${agendamento.nome} - ${formatData(agendamento.data)} ${agendamento.horario}</p>
                    </div>
                    <button onclick="this.parentElement.parentElement.remove()" class="text-white hover:text-gray-200">
                        ×
                    </button>
                </div>
            `;
            
            document.body.appendChild(notificacao);
            
            // Remove automaticamente após 5 segundos
            setTimeout(() => {
                if (notificacao.parentElement) {
                    notificacao.remove();
                }
            }, 5000);
        }

// 🔥 CORREÇÃO: Função desconectarSSE robusta
function desconectarSSE() {
    if (eventSource) {
        try {
            eventSource.close();
            eventSource = null;
            console.log('🔗 Conexão SSE fechada');
        } catch (error) {
            console.log('⚠️ Erro ao fechar SSE:', error);
        }
    }
}

        // 🔧 FUNÇÃO AUXILIAR: Abrir formulário de agendamento
        window.abrirFormAgendamento = function() {
            // Foca no formulário principal
            document.getElementById('agendamentoForm').scrollIntoView({ 
                behavior: 'smooth' 
            });
            
            // Destaca o formulário
            const form = document.getElementById('agendamentoForm');
            form.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.5)';
            setTimeout(() => {
                form.style.boxShadow = '';
            }, 2000);
        }

        // 📊 FUNÇÃO: Estatísticas com IA CORRIGIDA (CACHE INTELIGENTE)
        window.verEstatisticasIA = async function() {
            const btn = document.getElementById('btn-estatisticas');
            const btnText = document.getElementById('btn-estatisticas-text');
            const btnSpinner = document.getElementById('btn-estatisticas-spinner');
            
            // 🔥 CORREÇÃO: Disable button imediatamente
            if (btn && btnText && btnSpinner) {
                btn.disabled = true;
                btnText.classList.add('hidden');
                btnSpinner.classList.remove('hidden');
            }
            
            try {
                const token = getToken();
                if (!token) {
                    showToast("Faça login para ver estatísticas", "error");
                    return;
                }

                // 🔥 CACHE INTELIGENTE (2 minutos)
                const cacheKey = `estatisticas_${userToken}`;
                const cacheData = localStorage.getItem(cacheKey);
                const cacheTimestamp = localStorage.getItem(`${cacheKey}_timestamp`);
                const now = Date.now();
                const twoMinutes = 2 * 60 * 1000;

                // ⚡ USA CACHE se for recente
                if (cacheData && cacheTimestamp && (now - parseInt(cacheTimestamp)) < twoMinutes) {
                    console.log('⚡ Estatísticas do cache');
                    const data = JSON.parse(cacheData);
                    mostrarModalEstatisticas(data);
                    
                    // 🔥 CORREÇÃO CRÍTICA: Restaura botão IMEDIATAMENTE
                    if (btn && btnText && btnSpinner) {
                        btn.disabled = false;
                        btnText.classList.remove('hidden');
                        btnSpinner.classList.add('hidden');
                    }
                    return;
                }

                // 🔄 Busca dados novos se cache expirou
                const response = await fetch(`${API_BASE_URL}/api/estatisticas-pessoais`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) throw new Error(`Erro ${response.status}`);

                const data = await response.json();

                if (data.success) {
                    // 💾 Salva novo cache
                    localStorage.setItem(cacheKey, JSON.stringify(data));
                    localStorage.setItem(`${cacheKey}_timestamp`, now.toString());
                    
                    mostrarModalEstatisticas(data);
                } else {
                    showToast("Erro: " + (data.msg || ""), "error");
                }

            } catch (error) {
                console.error('❌ Erro:', error);
                showToast("Erro ao carregar estatísticas", "error");
            } finally {
                // 🔥 Restaura botão se NÃO usou cache
                if (btn && btnText && btnSpinner && btn.disabled) {
                    btn.disabled = false;
                    btnText.classList.remove('hidden');
                    btnSpinner.classList.add('hidden');
                }
            }
        }

        // 🔥 ADICIONE ESTA FUNÇÃO PARA LIMPAR CACHE QUANDO PRECISAR
        window.limparCacheEstatisticas = function() {
            const cacheKey = `estatisticas_${userToken}`;
            localStorage.removeItem(cacheKey);
            localStorage.removeItem(`${cacheKey}_timestamp`);
            console.log('🗑️ Cache de estatísticas limpo');
        }

        // 📊 FUNÇÃO: Modal de Estatísticas Balanceado
        window.mostrarModalEstatisticas = function(data) {
            const modalExistente = document.getElementById('modalEstatisticas');
            if (modalExistente) modalExistente.remove();

           const modalHTML = `
    <div id="modalEstatisticas" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div class="glass-card rounded-xl p-4 w-full max-w-md mx-auto animate-fade-in" style="max-height: 85vh;">
            <!-- Cabeçalho -->
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-semibold">📊 Estatísticas do Negócio</h3>
                <button onclick="fecharModalEstatisticas()" class="text-gray-400 hover:text-white">
                    <i data-feather="x" class="w-4 h-4"></i>
                </button>
            </div>
            
            <!-- 🎯 ESTATÍSTICAS PRINCIPAIS -->
            <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="text-center p-3 bg-white/10 rounded-lg">
                    <div class="text-base font-bold text-cyan-400">${data.estatisticas.total}</div>
                    <div class="text-xs text-gray-300 mt-1">Total</div>
                </div>
                <div class="text-center p-3 bg-white/10 rounded-lg">
                    <div class="text-base font-bold text-green-400">${data.estatisticas.este_mes}</div>
                    <div class="text-xs text-gray-300 mt-1">Este Mês</div>
                </div>
                <div class="text-center p-3 bg-white/10 rounded-lg">
                    <div class="text-base font-bold text-blue-400">${data.estatisticas.confirmados}</div>
                    <div class="text-xs text-gray-300 mt-1">Confirmados</div>
                </div>
                <div class="text-center p-3 bg-white/10 rounded-lg">
                    <div class="text-base font-bold text-yellow-400">${data.estatisticas.taxa_comparecimento || '0%'}</div>
                    <div class="text-xs text-gray-300 mt-1">Comparecimento</div>
                </div>
            </div>
            
            <!-- 💼 ANÁLISE IA - VERSÃO MELHORADA -->
            <div class="bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-lg border border-purple-500/30 p-3 mb-4" style="max-height: 250px; overflow-y: auto;">
                <div class="flex items-center gap-2 mb-3">
                    <div class="w-6 h-6 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                        <span class="text-white text-xs">IA</span>
                    </div>
                    <h4 class="font-semibold text-purple-400 text-sm">💼 Análise do Seu Negócio</h4>
                </div>
                <div class="text-sm leading-relaxed whitespace-pre-line text-gray-200">
                    ${data.analise_ia}
                </div>
            </div>
            
            <!-- 📈 AÇÕES SUGERIDAS -->
            <div class="bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/20 p-3 mb-4">
                <h4 class="font-semibold text-green-400 text-sm mb-2 flex items-center gap-2">
                    <i data-feather="trending-up" class="w-4 h-4"></i>
                    Próximos Passos Sugeridos
                </h4>
                <ul class="text-xs text-gray-300 space-y-1">
                    <li>• Confirme os agendamentos pendentes</li>
                    <li>• Mantenha a frequência mensal</li>
                    <li>• Configure lembretes automáticos</li>
                </ul>
            </div>
            
            <button onclick="fecharModalEstatisticas()" class="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 transition-all text-sm font-medium text-white">
                Entendido
            </button>
        </div>
    </div>
`;
            
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            feather.replace();
        }

        window.fecharModalEstatisticas = function() {
            const modal = document.getElementById('modalEstatisticas');
            if (modal) modal.remove();
        }

       
        // ---------------- DETECTAR E REDIRECIONAR PARA O APP ----------------
        function isInApp() {
            return /Android|iPhone|iPad/i.test(navigator.userAgent) && 
                   !/Chrome|Safari|Firefox/i.test(navigator.userAgent.split('Mobile/')[1]);
        }

        // ---------------- SOLUÇÃO PRÁTICA ----------------
        function voltarParaApp() {
            console.log('🔄 Verificando ambiente...');
            
            // Se estiver no app Capacitor, usa verificação de sessão
            if (typeof Capacitor !== 'undefined') {
                console.log('📱 Está no app - verificando sessão...');
                // O listener do Capacitor já vai capturar
                return;
            }
            
            // Se estiver no navegador
            console.log('🌐 Está no navegador - mostrando instruções...');
            
            // Mostra mensagem clara
            alert('✅ Login realizado!\n\nVolte manualmente para o app.\n\nO app deve detectar automaticamente que você está logado.');
            
            // Opcional: tenta fechar a janela
            setTimeout(() => {
                try {
                    window.close();
                } catch (e) {
                    console.log('Não foi possível fechar a janela automaticamente');
                }
            }, 3000);
        }

        // 🔥 ADICIONE: Fechar modal clicando fora dele
        document.addEventListener('click', function(e) {
            const modal = document.getElementById('modalLinkAgendamento');
            if (modal && e.target === modal) {
                fecharModalLinkAgendamento();
            }
        });

        // 🔥 ADICIONE: Fechar com ESC
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                fecharModalLinkAgendamento();
            }
        });

// 🔥 CORREÇÃO: Função processarRetornoOAuth atualizada
async function processarRetornoOAuth(url) {
    try {
        console.log('🔄 Processando URL OAuth:', url);
        
        const urlObj = new URL(url);
        const hash = urlObj.hash.substring(1);
        
        if (hash) {
            const params = new URLSearchParams(hash);
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');
            
            if (accessToken) {
                const { data, error } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken
                });
                
                if (!error && data.session) {
                    userToken = data.session.access_token;
                    localStorage.setItem('userToken', userToken);
                    
                    // 🔥 INICIALIZAÇÃO IMEDIATA DO PREMIUM MANAGER
                    if (!premiumManager) {
                        premiumManager = new PremiumManager();
                        await premiumManager.startTrial();
                    }
                    
                    // Fecha browser do Capacitor
                    if (window.Capacitor && window.Capacitor.Plugins?.Browser) {
                        try {
                            await window.Capacitor.Plugins.Browser.close();
                        } catch (e) {
                            console.log('Browser já fechado');
                        }
                    }
                    
                    // 🔥 ATUALIZAÇÃO IMEDIATA DO BADGE
                    await premiumManager.updateUsageBadge();
                    
                    // 🔥 VERIFICAÇÃO DE USOS NO LOGIN MOBILE
                    setTimeout(async () => {
                        if (premiumManager && userToken) {
                            const status = await premiumManager.checkTrialStatus();
                            console.log('📊 Status no login mobile:', status);
                            
                            if (status.hasTrial && status.dailyUsagesLeft <= 0) {
                                console.log('🚫 Usuário mobile logou sem usos');
                                const limit = status.isPremiumTrial ? 15 : 5;
                                premiumManager.showDailyLimitModal(limit);
                            }
                        }
                    }, 2000);
                    
                    // 🔥 CORREÇÃO: Atualiza interface COMPLETAMENTE
                    loginSection.style.display = 'none';
                    form.style.display = 'block';
                    atualizarInterfacePosLogin();
                    document.getElementById('secoesIA').style.display = 'block';
                    setTimeout(() => atualizarBadgePerfil(), 2000);
                    listarAgendamentos();
                    showToast("Login com Google realizado!", "success");
                }
            }
        }
    } catch (error) {
        console.error('❌ Erro ao processar OAuth:', error);
        showToast("Erro ao finalizar login", "error");
    }
}
        
// 🔥 CORREÇÃO: Adicionar função debounce faltante
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
// 🔥 CORREÇÃO: Adicionar função forcarAtualizacaoAgendamentos faltante
function forcarAtualizacaoAgendamentos() {
    console.log('🔄 Forçando atualização de agendamentos...');
    listarAgendamentos();
}

        // 🔧 ATUALIZAR: Função para pular configuração (quando usuário clicar em "Pular")
        function fecharConfiguracao() {
            console.log('🎯 Usuário pulou configuração');
            fecharModalConfiguracao();
            mostrarToast('⚙️ Você pode configurar depois clicando na engrenagem', 'info');
        }

        // ---------------- INIT ----------------
        AOS.init({
            duration: 800,
            easing: 'ease-out-quart',
            once: true
        });
        feather.replace();
        init();
    </script>
</body>
</html>





























































































































