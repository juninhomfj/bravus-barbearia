import * as firestore from './firestore.js';

const getBarberUidFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
};

const displayError = (message) => {
    const loading = document.getElementById('loading-container');
    const scheduler = document.getElementById('agendamento-container');
    const errorDiv = document.getElementById('error-container');
    if (loading) loading.classList.add('hidden');
    if (scheduler) scheduler.classList.add('hidden');
    if (errorDiv) {
        const msg = document.getElementById('error-message');
        if (msg) msg.textContent = message;
        errorDiv.classList.remove('hidden');
    }
};

const renderServices = (services) => {
    const servicesListDiv = document.getElementById('services-list');
    if (!servicesListDiv) return;
    servicesListDiv.innerHTML = '';

    if (!services || services.length === 0) {
        servicesListDiv.innerHTML = '<p class="text-gray-500">Este barbeiro ainda não cadastrou serviços.</p>';
        return;
    }

    services.forEach(service => {
        const serviceItem = document.createElement('div');
        serviceItem.className = 'flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200';
        serviceItem.innerHTML = `
            <div>
                <p class="font-semibold text-gray-900">${service.nome || 'Serviço Sem Nome'}</p>
                <p class="text-sm text-gray-600">${service.duracao || '?'} minutos</p>
            </div>
            <p class="text-lg font-bold text-yellow-600">R$ ${(service.preco || 0).toFixed(2).replace('.', ',')}</p>
        `;
        servicesListDiv.appendChild(serviceItem);
    });
};

export const initializeClientBookingPage = async () => {
    const barberUid = getBarberUidFromUrl();
    if (!barberUid) return displayError('ID do barbeiro não fornecido na URL.');

    try {
        const profile = await firestore.getBarbeiro(barberUid);
        if (!profile) return displayError('Barbearia não encontrada. Verifique o link.');

        const nameEl = document.getElementById('barber-name');
        const descEl = document.getElementById('barber-desc');
        if (nameEl) nameEl.textContent = profile.nome || profile.displayName || 'Barbeiro';
        if (descEl) descEl.textContent = profile.descricao || '';

        const services = await firestore.getDisponibilidades ? await firestore.getBarberServices?.(barberUid) : [];
        // If getBarberServices not available, try to fetch from collection
        if (!services || services.length === 0) {
            // Try to use getBarberServices if exported
            if (typeof firestore.getBarberServices === 'function') {
                const s = await firestore.getBarberServices(barberUid);
                renderServices(s);
            } else {
                renderServices([]);
            }
        } else {
            renderServices(services);
        }

        const loading = document.getElementById('loading-container');
        const scheduler = document.getElementById('agendamento-container');
        if (loading) loading.classList.add('hidden');
        if (scheduler) scheduler.classList.remove('hidden');

    } catch (err) {
        console.error(err);
        displayError('Erro ao carregar a página de agendamento. Tente novamente.');
    }
};

export default { initializeClientBookingPage };
