// /js/servicos.js
import { db } from './firestore.js';
import { getCurrentUser } from './auth.js';
import { 
    collection, 
    addDoc, 
    query, 
    where, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const SERVICOS_COLLECTION = "servicos";

// 1. Funções de CRUD no Firestore
// ----------------------------------------------------------------

/**
 * Cadastra um novo serviço para o barbeiro logado.
 */
export const addService = async (nome, duracao, valor, descricao) => {
    const user = getCurrentUser();
    if (!user) throw new Error("Usuário não autenticado.");

    try {
        const novoServico = {
            barbeiroId: user.uid,
            nome: nome,
            duracao: parseInt(duracao), // Garante que a duração seja um número
            valor: parseFloat(valor), // Garante que o valor seja um número
            descricao: descricao || "",
            createdAt: new Date().toISOString()
        };
        await addDoc(collection(db, SERVICOS_COLLECTION), novoServico);
    } catch (error) {
        console.error("Erro ao adicionar serviço:", error);
        throw error;
    }
};

/**
 * Busca todos os serviços cadastrados pelo barbeiro logado.
 */
export const getServicesByBarber = async () => {
    const user = getCurrentUser();
    if (!user) return [];

    try {
        const q = query(
            collection(db, SERVICOS_COLLECTION), 
            where("barbeiroId", "==", user.uid)
        );
        const snapshot = await getDocs(q);
        
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error("Erro ao buscar serviços:", error);
        return [];
    }
};

/**
 * Atualiza um serviço existente.
 */
export const updateService = async (serviceId, nome, duracao, valor, descricao) => {
    const user = getCurrentUser();
    if (!user) throw new Error("Usuário não autenticado.");

    try {
        const servicoRef = doc(db, SERVICOS_COLLECTION, serviceId);
        await updateDoc(servicoRef, {
            nome: nome,
            duracao: parseInt(duracao),
            valor: parseFloat(valor),
            descricao: descricao || "",
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Erro ao atualizar serviço:", error);
        throw error;
    }
};

/**
 * Exclui um serviço.
 */
export const deleteService = async (serviceId) => {
    const user = getCurrentUser();
    if (!user) throw new Error("Usuário não autenticado.");

    try {
        const servicoRef = doc(db, SERVICOS_COLLECTION, serviceId);
        await deleteDoc(servicoRef);
    } catch (error) {
        console.error("Erro ao excluir serviço:", error);
        throw error;
    }
};

// 2. Funções de UI e Manipulação DOM
// ----------------------------------------------------------------

/**
 * Carrega a interface completa de gerenciamento de serviços.
 */
export const loadServicesManager = (container = null) => {
    const appContainer = container || document.getElementById('app-container');
    if (!appContainer) {
        console.warn('Container para serviços não encontrado');
        return;
    }
    
    appContainer.innerHTML = `
        <h2 class="text-3xl font-bold mb-6 text-gray-800">✂️ Gerenciamento de Serviços</h2>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg h-fit">
                <h3 id="form-title" class="text-xl font-semibold mb-4">Cadastrar Novo Serviço</h3>
                <form id="service-form" class="space-y-4">
                    <input type="hidden" id="service-id" value="">
                    <div>
                        <label for="service-nome" class="block text-sm font-medium text-gray-700">Nome do Serviço</label>
                        <input type="text" id="service-nome" required class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label for="service-duracao" class="block text-sm font-medium text-gray-700">Duração (minutos)</label>
                            <input type="number" id="service-duracao" required min="10" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                        </div>
                        <div>
                            <label for="service-valor" class="block text-sm font-medium text-gray-700">Valor (R$)</label>
                            <input type="number" id="service-valor" required step="0.01" min="0" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                        </div>
                    </div>
                    <div>
                        <label for="service-descricao" class="block text-sm font-medium text-gray-700">Descrição (Opcional)</label>
                        <textarea id="service-descricao" rows="3" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"></textarea>
                    </div>
                    <button type="submit" id="service-submit-btn" class="w-full bg-yellow-500 hover:bg-yellow-600 text-gray-800 font-bold py-2 px-4 rounded-md transition duration-300">
                        Cadastrar
                    </button>
                    <button type="button" id="cancel-edit-btn" class="w-full bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-md transition duration-300 hidden">
                        Cancelar Edição
                    </button>
                    <p id="service-message" class="mt-2 text-center text-sm text-red-500"></p>
                </form>
            </div>
            
            <div class="lg:col-span-2">
                <h3 class="text-xl font-semibold mb-4">Serviços Cadastrados</h3>
                <div id="services-list" class="space-y-4">
                    <p class="text-gray-500">Carregando serviços...</p>
                </div>
            </div>
        </div>
    `;

    // Adiciona a lógica de interação após a renderização
    setupServiceListeners();
    renderServicesList();
};

/**
 * Renderiza a lista de serviços na tela.
 */
const renderServicesList = async () => {
    const listDiv = document.getElementById('services-list');
    listDiv.innerHTML = '<p class="text-gray-500">Carregando serviços...</p>';

    try {
        const services = await getServicesByBarber();
        listDiv.innerHTML = ''; // Limpa o loading

        if (services.length === 0) {
            listDiv.innerHTML = '<p class="text-gray-500">Nenhum serviço cadastrado ainda. Use o formulário ao lado para começar.</p>';
            return;
        }

        services.forEach(service => {
            const serviceItem = document.createElement('div');
            serviceItem.className = 'bg-white p-4 rounded-lg shadow-md flex justify-between items-start';
            serviceItem.innerHTML = `
                <div>
                    <p class="font-semibold text-xl">${service.nome}</p>
                    <p class="text-gray-700 mt-1">
                        R$ ${service.valor.toFixed(2).replace('.', ',')} 
                        <span class="text-sm text-gray-500">| ${service.duracao} min</span>
                    </p>
                    ${service.descricao ? `<p class="text-sm text-gray-500 mt-1">${service.descricao}</p>` : ''}
                </div>
                <div class="flex space-x-2 pt-1">
                    <button data-id="${service.id}" data-action="edit" class="text-blue-500 hover:text-blue-700 transition duration-150">Editar</button>
                    <button data-id="${service.id}" data-action="delete" class="text-red-500 hover:text-red-700 transition duration-150">Excluir</button>
                </div>
            `;
            listDiv.appendChild(serviceItem);
        });
    } catch (error) {
        listDiv.innerHTML = `<p class="text-red-500">Erro ao carregar serviços: ${error.message}</p>`;
    }
};

/**
 * Configura os listeners de submissão do formulário e cliques da lista.
 */
const setupServiceListeners = () => {
    const form = document.getElementById('service-form');
    const list = document.getElementById('services-list');
    const formTitle = document.getElementById('form-title');
    const submitBtn = document.getElementById('service-submit-btn');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    const msg = document.getElementById('service-message');

    // Listener para o Formulário (Adicionar/Editar)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('service-id').value;
        const nome = document.getElementById('service-nome').value;
        const duracao = document.getElementById('service-duracao').value;
        const valor = document.getElementById('service-valor').value;
        const descricao = document.getElementById('service-descricao').value;
        
        msg.textContent = id ? 'Atualizando...' : 'Cadastrando...';
        msg.classList.remove('text-red-500', 'text-green-500');

        try {
            if (id) {
                await updateService(id, nome, duracao, valor, descricao);
                msg.textContent = 'Serviço atualizado com sucesso!';
            } else {
                await addService(nome, duracao, valor, descricao);
                msg.textContent = 'Serviço cadastrado com sucesso!';
            }
            msg.classList.add('text-green-500');
            
            // Limpa o formulário e re-renderiza a lista
            form.reset();
            cancelBtn.click(); // Volta para o modo cadastro
            renderServicesList();

        } catch (error) {
            msg.textContent = `Erro: ${error.message}`;
            msg.classList.add('text-red-500');
        }
    });

    // Listener para os botões da lista (Editar e Excluir)
    list.addEventListener('click', async (e) => {
        const target = e.target;
        const serviceId = target.dataset.id;
        const action = target.dataset.action;

        if (action === 'delete') {
            if (confirm('Tem certeza que deseja excluir este serviço?')) {
                try {
                    await deleteService(serviceId);
                    renderServicesList();
                } catch (error) {
                    alert(`Erro ao excluir: ${error.message}`);
                }
            }
        } else if (action === 'edit') {
            // Preenche o formulário com os dados do serviço para edição
            const services = await getServicesByBarber();
            const service = services.find(s => s.id === serviceId);
            
            if (service) {
                document.getElementById('service-id').value = service.id;
                document.getElementById('service-nome').value = service.nome;
                document.getElementById('service-duracao').value = service.duracao;
                document.getElementById('service-valor').value = service.valor;
                document.getElementById('service-descricao').value = service.descricao;
                
                formTitle.textContent = 'Editar Serviço';
                submitBtn.textContent = 'Salvar Alterações';
                cancelBtn.classList.remove('hidden');
                
                // Rola para o topo do formulário
                document.getElementById('app-container').scrollIntoView({ behavior: 'smooth' });
            }
        }
    });
    
    // Listener para Cancelar Edição
    cancelBtn.addEventListener('click', () => {
        form.reset();
        document.getElementById('service-id').value = '';
        formTitle.textContent = 'Cadastrar Novo Serviço';
        submitBtn.textContent = 'Cadastrar';
        cancelBtn.classList.add('hidden');
        msg.textContent = '';
    });
};