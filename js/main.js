// main.js
import { initializeAuth, onAuthChange, handleLogin, handleSignup, getCurrentUser, handleLogout } from './auth.js';
import { initializeDatabase, getBarbeiro, generatePublicLink } from './firestore.js';
import * as agenda from './agenda.js'; 
import * as servicos from './servicos.js'; // NOVO: Importa o módulo de serviços
import * as financeiro from './financeiro.js';
import * as estoque from './estoque.js';
import * as billing from './billing.js';
import * as adminPanel from './admin.js';
// ...existing imports...

// Função para iniciar o aplicativo, chamada a partir do index.html ou dashboard.html
export const startApp = (firebaseApp) => {
    initializeAuth(firebaseApp);
    initializeDatabase(firebaseApp);

    // Adiciona listener de autenticação
    onAuthChange(user => {
        updateUIForUser(user);
        
        // Lógica de Redirecionamento após o Auth
        if (user) {
             // Redireciona para o dashboard se estiver logado e NÃO estiver já no dashboard
             if (window.location.pathname !== '/dashboard.html') {
                 window.location.href = './dashboard.html';
             } else {
                 // Se já estiver no dashboard, configura listeners do dashboard
                 setupDashboardListeners();
             }
       } else if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
           // Redireciona para o index.html se estiver deslogado e NÃO estiver já no index
           window.location.href = './index.html';
       }
    });

    // Inicia os listeners dos formulários (só no index.html)
    if (document.getElementById('login-form')) {
        setupAuthListeners();
    }

    // NOTE: dashboard listeners are set up in setupDashboardListeners when onAuthChange detects we're on dashboard
};

// ... updateUIForUser (Mantenha o mesmo conteúdo para o botão Login/Sair) ...

// Função para configurar listeners de Login/Cadastro
const setupAuthListeners = () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const toggleButton = document.getElementById('toggle-auth');
    const authTitle = document.getElementById('auth-title');
    const authMessage = document.getElementById('auth-message');
    
    let isLogin = true;

    // Toggle (Alternância)
    toggleButton.addEventListener('click', () => {
        isLogin = !isLogin;
        loginForm.classList.toggle('hidden', !isLogin);
        signupForm.classList.toggle('hidden', isLogin);
        authTitle.textContent = isLogin ? 'Acessar Conta' : 'Criar Conta (Barbeiro/Barbearia)';
        toggleButton.textContent = isLogin ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Faça Login';
        authMessage.textContent = ''; // Limpa mensagens
    });

    // Submissão do Login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        authMessage.textContent = 'Autenticando...';
        try {
            await handleLogin(email, password);
            // Redirecionamento será feito pelo onAuthChange
        } catch (error) {
            authMessage.textContent = `Erro ao fazer login: ${error.message}`;
        }
    });

    // Submissão do Cadastro
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value;
        const type = document.getElementById('signup-type').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const phone = document.getElementById('signup-phone').value;
        const city = document.getElementById('signup-city').value;
        authMessage.textContent = 'Cadastrando...';

        try {
            await handleSignup(name, type, email, password, phone, city);
            alert("Cadastro realizado com sucesso! Faça login agora.");
            // Volta para a tela de login
            toggleButton.click(); 
        } catch (error) {
            authMessage.textContent = `Erro ao cadastrar: ${error.message}`;
        }
    });
};

const updateUIForUser = (user) => {
    // Simples implementação de atualização de UI: mostra botão Entrar/Sair no header
    let header = document.querySelector('header');
    if (!header) return;

    // Cria container de ações no header, se necessário
    let authArea = document.getElementById('auth-area');
    if (!authArea) {
        authArea = document.createElement('div');
        authArea.id = 'auth-area';
        authArea.className = 'p-4 text-right';
        header.appendChild(authArea);
    }

    authArea.innerHTML = '';
    if (user) {
        const btn = document.createElement('button');
        btn.textContent = 'Sair';
        btn.className = 'bg-red-600 text-white px-3 py-1 rounded';
        btn.addEventListener('click', async () => {
            try {
                await handleLogout();
                // onAuthChange cuidará do redirecionamento
            } catch (err) {
                console.error('Erro no logout:', err);
                alert('Erro ao sair: ' + err.message);
            }
        });
        authArea.appendChild(btn);

        // Se estivermos no dashboard, garanta que os listeners do dashboard estejam configurados
        if (window.location.pathname.endsWith('dashboard.html')) {
            try { setupDashboardListeners(); } catch (e) { console.warn('Erro ao configurar dashboard listeners', e); }
            // também preenche o link público (se existir)
            try { fillPublicLinkForUser(user.uid); } catch (e) { console.warn('Erro ao preencher public link', e); }
        }

    } else {
        const btn = document.createElement('button');
        btn.textContent = 'Entrar';
        btn.className = 'bg-yellow-500 text-gray-900 px-3 py-1 rounded';
        btn.addEventListener('click', () => { window.location.href = './index.html'; });
        authArea.appendChild(btn);
    }
};

// NOVO: Lógica de Roteamento Simples no Dashboard
const setupDashboardListeners = (container = null) => {
    const user = getCurrentUser();

    if (user && document.getElementById('nav-servicos')) {
        // Listener para Gerenciar Serviços
        document.getElementById('nav-servicos').addEventListener('click', (e) => {
            e.preventDefault();
            const targetContainer = container || document.getElementById('content-display') || document.getElementById('app-container');
            if (servicos && typeof servicos.loadServicesManager === 'function') {
                servicos.loadServicesManager(targetContainer); // Chama a função para renderizar a UI
            } else if (servicos && typeof servicos.loadServicos === 'function') {
                // fallback para implementações existentes
                servicos.loadServicos(targetContainer);
            } else {
                console.warn('Módulo servicos não implementado ou função de carregamento não encontrada.');
            }
        });

        // Listener para Gerenciar Agenda
        const agendaBtn = document.getElementById('nav-agenda'); // NOME ATUALIZADO
        if (agendaBtn) {
            agendaBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const targetContainer = container || document.getElementById('content-display') || document.getElementById('app-container');
                // Chama a nova função de gestão da agenda do barbeiro
                if (agenda && typeof agenda.loadBarberAgendaManager === 'function') {
                    agenda.loadBarberAgendaManager(targetContainer);
                } else if (agenda && typeof agenda.loadAgendaPage === 'function') {
                    // fallback para versões antigas
                    agenda.loadAgendaPage(user.uid);
                } else {
                    console.warn('Módulo agenda não possui a função esperada para carregar a gestão da agenda.');
                }
            });
        }
        // Listener para Gerenciar Financeiro
        const financeBtn = document.getElementById('nav-financeiro');
        if (financeBtn) {
            financeBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const targetContainer = container || document.getElementById('content-display') || document.getElementById('app-container');
                if (financeiro && typeof financeiro.loadFinanceiroManager === 'function') {
                    financeiro.loadFinanceiroManager(targetContainer);
                } else {
                    console.warn('Módulo financeiro não implementado ou função de carregamento não encontrada.');
                }
            });
        }
        // Listener para Gerenciar Estoque (Premium)
        const estoqueBtn = document.getElementById('nav-estoque');
        if (estoqueBtn) {
            estoqueBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const targetContainer = container || document.getElementById('content-display') || document.getElementById('app-container');
                let isPremium = false;
                const user = getCurrentUser();
                if (user) {
                    try {
                        const profile = await getBarbeiro(user.uid);
                        isPremium = (profile?.plan === 'premium') || (profile?.isPremium === true);
                    } catch (err) {
                        console.warn('Erro ao verificar plano do barbeiro:', err);
                    }
                }

                // Listener para Gerenciar Plano / Trial
                const planoBtn = document.getElementById('nav-plano');
                if (planoBtn) {
                    planoBtn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        const targetContainer = container || document.getElementById('content-display') || document.getElementById('app-container');
                        if (billing && typeof billing.loadBillingManager === 'function') {
                            billing.loadBillingManager(targetContainer);
                        } else if (billing && billing.default && typeof billing.default.loadBillingManager === 'function') {
                            billing.default.loadBillingManager(targetContainer);
                        } else {
                            console.warn('Módulo billing não encontrado.');
                        }
                    });
                }

                // Listener para Painel Admin
                const adminBtn = document.getElementById('nav-admin');
                if (adminBtn) {
                    adminBtn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        const targetContainer = container || document.getElementById('content-display') || document.getElementById('app-container');
                        if (adminPanel && typeof adminPanel.loadAdminPanel === 'function') {
                            // init admin if needed
                            try { adminPanel.initAdmin && adminPanel.initAdmin(window.db); } catch(_){}
                            adminPanel.loadAdminPanel(targetContainer);
                        } else {
                            console.warn('Módulo admin não encontrado.');
                        }
                    });
                }
                if (estoque && typeof estoque.loadEstoqueManager === 'function') {
                    estoque.loadEstoqueManager(targetContainer, isPremium);
                } else {
                    console.warn('Módulo estoque não implementado ou função de carregamento não encontrada.');
                }
            });
        }
    }
};

const fillPublicLinkForUser = async (uid) => {
    try {
        const profile = await getBarbeiro(uid);
        const card = document.getElementById('public-link-card');
        const input = document.getElementById('public-link-input');
        const copyBtn = document.getElementById('copy-public-link');
        if (!card || !input || !copyBtn) return;

        // prefere o link salvo no perfil, senão gera um novo
        const link = profile?.publicLink || generatePublicLink(uid);
        input.value = link;
        card.classList.remove('hidden');

        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(input.value);
                copyBtn.textContent = 'Copiado!';
                setTimeout(() => copyBtn.textContent = 'Copiar', 1500);
            } catch (err) {
                // fallback
                input.select();
                document.execCommand('copy');
                copyBtn.textContent = 'Copiado!';
                setTimeout(() => copyBtn.textContent = 'Copiar', 1500);
            }
        });
    } catch (err) { console.warn('Erro ao preencher link público', err); }
};

export const initializeDashboard = async (containerId = 'content-display') => {
    const container = document.getElementById(containerId) || document.getElementById('app-container');
    const loading = document.getElementById('loading');
    const dashboardHome = document.getElementById('dashboard-home');
    const authCheck = document.getElementById('auth-check');

    if (loading) loading.classList.add('hidden');

    const user = getCurrentUser();
    if (user) {
        if (dashboardHome) dashboardHome.classList.remove('hidden');

        const logoutBtn = document.getElementById('logout-button');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await handleLogout();
                window.location.href = '/index.html';
            });
        }

        // configura os listeners do dashboard passando o container
        setupDashboardListeners(container);

        // carrega agenda por padrão
        if (agenda && typeof agenda.loadBarberAgendaManager === 'function') {
            agenda.loadBarberAgendaManager(container);
        }
    } else {
        if (authCheck) authCheck.classList.remove('hidden');
        setTimeout(() => { window.location.href = '/index.html'; }, 3000);
    }
};
