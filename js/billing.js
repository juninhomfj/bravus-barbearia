import { getBarbeiro, startTrial, endTrial, promoteToPremium } from './firestore.js';
import { getCurrentUser } from './auth.js';

// Formato simples para calcular dias restantes
const daysBetween = (startTs, endTs) => {
    if (!startTs || !endTs) return 0;
    const start = startTs.toDate ? startTs.toDate() : new Date(startTs);
    const end = endTs.toDate ? endTs.toDate() : new Date(endTs);
    const ms = end - new Date();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
};

export const loadBillingManager = async (container = null) => {
    const target = container || document.getElementById('content-display') || document.getElementById('app-container');
    if (!target) return;
    target.innerHTML = '';

    const user = getCurrentUser();
    if (!user) {
        target.innerHTML = '<div class="p-6 bg-white rounded shadow">Faça login para gerenciar seu plano.</div>';
        return;
    }

    let profile = null;
    try {
        profile = await getBarbeiro(user.uid);
    } catch (err) {
        console.error('Erro ao buscar perfil:', err);
    }

    const plan = profile?.plan || 'free';
    const trialStart = profile?.trialStart || null;
    const trialEnd = profile?.trialEnd || null;

    const card = document.createElement('div');
    card.className = 'bg-white p-6 rounded shadow';
    card.innerHTML = `
        <h2 class="text-2xl font-semibold mb-2">Plano e Teste Grátis</h2>
        <p class="mb-4">Seu plano atual: <strong>${plan}</strong></p>
        <div id="billing-status" class="mb-4"></div>
        <div class="flex gap-3">
            <button id="start-trial" class="bg-green-500 text-white px-4 py-2 rounded">Iniciar Teste Grátis</button>
            <button id="end-trial" class="bg-gray-300 text-gray-800 px-4 py-2 rounded">Encerrar Teste</button>
            <button id="subscribe" class="bg-yellow-500 text-gray-900 px-4 py-2 rounded">Assinar (Mensal)</button>
        </div>
        <p class="text-sm text-gray-600 mt-4">O período de teste dura um número limitado de dias. Após o término do trial, será necessário assinar o plano mensal para continuar com recursos Premium.</p>
        <p class="text-sm text-gray-500 mt-2">(Integração com gateway de pagamentos não implementada — placeholder para Stripe)</p>
    `;

    target.appendChild(card);

    const statusEl = card.querySelector('#billing-status');
    const startBtn = card.querySelector('#start-trial');
    const endBtn = card.querySelector('#end-trial');
    const subscribeBtn = card.querySelector('#subscribe');

    const renderStatus = () => {
        if (plan === 'premium') {
            statusEl.innerHTML = '<div class="text-green-600">Você é Premium — todos os recursos estão desbloqueados.</div>';
        } else if (plan === 'trial' && trialEnd) {
            const days = daysBetween(trialStart, trialEnd);
            statusEl.innerHTML = `<div class="text-yellow-600">Período de teste ativo. Dias restantes: <strong>${days}</strong></div>`;
        } else {
            statusEl.innerHTML = '<div class="text-gray-600">Você está no plano gratuito. Inicie um teste gratuito para experimentar os recursos Premium.</div>';
        }
    };

    renderStatus();

    startBtn.addEventListener('click', async () => {
        startBtn.disabled = true;
        startBtn.textContent = 'Iniciando...';
        try {
            await startTrial(user.uid, 14);
            // reload profile
            const p = await getBarbeiro(user.uid);
            profile = p;
            startBtn.textContent = 'Teste Iniciado';
            renderStatus();
        } catch (err) {
            console.error('Erro ao iniciar trial:', err);
            alert('Erro ao iniciar trial: ' + err.message);
            startBtn.disabled = false;
            startBtn.textContent = 'Iniciar Teste Grátis';
        }
    });

    endBtn.addEventListener('click', async () => {
        if (!confirm('Encerrar o período de teste e voltar para o plano gratuito?')) return;
        try {
            await endTrial(user.uid);
            const p = await getBarbeiro(user.uid);
            profile = p;
            renderStatus();
            alert('Teste encerrado. Você está no plano gratuito.');
        } catch (err) {
            console.error('Erro ao encerrar trial:', err);
            alert('Erro ao encerrar trial: ' + err.message);
        }
    });

    subscribeBtn.addEventListener('click', async () => {
        // Placeholder: aqui podemos abrir um fluxo de pagamento (Stripe, etc.)
        if (!confirm('Assinar o plano mensal? (Placeholder)')) return;
        try {
            await promoteToPremium(user.uid);
            const p = await getBarbeiro(user.uid);
            profile = p;
            renderStatus();
            alert('Parabéns — você agora é Premium (simulado).');
        } catch (err) {
            console.error('Erro ao promover para Premium:', err);
            alert('Erro ao assinar: ' + err.message);
        }
    });
};

export default { loadBillingManager };
