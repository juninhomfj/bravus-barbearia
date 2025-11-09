import { db, promoteToPremium } from './firestore.js';
import { getCurrentUser } from './auth.js';

import { 
    collection, 
    addDoc, 
    query, 
    getDocs, 
    doc, 
    updateDoc, 
    Timestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ESTOQUE_SUBCOLLECTION = "estoque";
const LOW_STOCK_THRESHOLD = 5; // Limite para alerta de estoque baixo

// =================================================================
// 1. FUNÇÕES DE BANCO DE DADOS
// =================================================================

export const addProduto = async (data) => {
    const user = getCurrentUser();
    if (!user) throw new Error("Usuário não autenticado.");

    try {
        const produtoData = {
            nomeProduto: data.nomeProduto,
            quantidadeEstoque: parseInt(data.quantidadeEstoque, 10),
            custoUnitario: parseFloat(data.custoUnitario),
            fornecedor: data.fornecedor || '',
            dataCriacao: Timestamp.now(),
            dataAtualizacao: Timestamp.now()
        };

        const estoqueRef = collection(db, "barbeiros", user.uid, ESTOQUE_SUBCOLLECTION);
        await addDoc(estoqueRef, produtoData);
        console.log(`Produto ${data.nomeProduto} adicionado ao estoque.`);
        
    } catch (error) {
        console.error("Erro ao adicionar produto:", error);
        throw error;
    }
};

export const getEstoqueItems = async () => {
    const user = getCurrentUser();
    if (!user) return [];

    try {
        const estoqueRef = collection(db, "barbeiros", user.uid, ESTOQUE_SUBCOLLECTION);
        const q = query(estoqueRef);
        const snapshot = await getDocs(q);
        
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
        console.error("Erro ao buscar estoque:", error);
        return [];
    }
};

export const updateProdutoQuantity = async (productId, newQuantity) => {
    const user = getCurrentUser();
    if (!user) throw new Error("Usuário não autenticado.");
    
    const quantity = parseInt(newQuantity, 10);
    if (isNaN(quantity) || quantity < 0) {
        throw new Error("Quantidade inválida.");
    }

    try {
        const docRef = doc(db, "barbeiros", user.uid, ESTOQUE_SUBCOLLECTION, productId);
        await updateDoc(docRef, {
            quantidadeEstoque: quantity,
            dataAtualizacao: Timestamp.now()
        });
    } catch (error) {
        console.error("Erro ao atualizar estoque:", error);
        throw error;
    }
};

// =================================================================
// 2. UI E INTERAÇÃO
// =================================================================

export const loadEstoqueManager = async (container = null, isPremium = true) => {
    const appContainer = container || document.getElementById('content-display') || document.getElementById('app-container');
    if (!appContainer) {
        console.warn('Container para estoque não encontrado');
        return;
    }
    
    // --- VERIFICAÇÃO DE PLANO PREMIUM ---
    if (!isPremium) {
        appContainer.innerHTML = `
            <div class="p-8 bg-gray-900 border-2 border-yellow-500 text-white rounded-xl shadow-2xl transition-all duration-300">
                <div class="text-yellow-500 mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                </div>
                <h3 class="text-3xl font-extrabold text-center mb-2">🔒 Módulo Premium Exclusivo</h3>
                <p class="text-center text-gray-400">O controle avançado de Estoque e Insumos é um recurso vital para a gestão, disponível apenas no Plano Premium.</p>
                <div class="text-center mt-6">
                    <button id="upgrade-premium-btn" class="bg-yellow-500 text-gray-900 font-bold py-3 px-6 rounded-lg shadow-lg hover:bg-yellow-400 transition duration-300">
                        Atualizar para Premium
                    </button>
                </div>
            </div>
        `;

        // Handler para o botão de upgrade (mock direto no cliente)
        const upgradeBtn = appContainer.querySelector('#upgrade-premium-btn');
        if (upgradeBtn) {
            upgradeBtn.addEventListener('click', async () => {
                upgradeBtn.textContent = 'Processando...';
                upgradeBtn.disabled = true;
                try {
                    const user = getCurrentUser();
                    if (!user) throw new Error('Você precisa estar autenticado para atualizar o plano.');
                    await promoteToPremium(user.uid);
                    // Recarrega o manager como Premium
                    await loadEstoqueManager(appContainer, true);
                } catch (err) {
                    console.error('Falha ao promover para Premium:', err);
                    alert('Não foi possível promover sua conta: ' + err.message);
                } finally {
                    upgradeBtn.textContent = 'Atualizar para Premium';
                    upgradeBtn.disabled = false;
                }
            });
        }

        return;
    }

    // UI principal para usuários Premium
    appContainer.innerHTML = `
        <h2 class="text-3xl font-bold mb-6 text-gray-800">📦 Controle de Estoque (Premium)</h2>
        
        <!-- Formulário para Novo Produto -->
        <div class="bg-white p-6 rounded-xl shadow-lg mb-8">
            <h3 class="text-xl font-semibold mb-4 border-b pb-2">Adicionar Novo Produto/Insumo</h3>
            <form id="add-product-form" class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <input type="text" id="nomeProduto" placeholder="Nome do Produto (Ex: Pomada Fixadora)" required class="col-span-4 md:col-span-1 p-3 border border-gray-300 rounded-lg focus:ring-yellow-500 focus:border-yellow-500">
                <input type="number" id="quantidadeEstoque" placeholder="Quantidade Inicial" required min="0" class="col-span-2 md:col-span-1 p-3 border border-gray-300 rounded-lg focus:ring-yellow-500 focus:border-yellow-500">
                <input type="number" id="custoUnitario" placeholder="Custo Unitário (R$)" required min="0" step="0.01" class="col-span-2 md:col-span-1 p-3 border border-gray-300 rounded-lg focus:ring-yellow-500 focus:border-yellow-500">
                <input type="text" id="fornecedor" placeholder="Fornecedor (Opcional)" class="col-span-4 md:col-span-1 p-3 border border-gray-300 rounded-lg focus:ring-yellow-500 focus:border-yellow-500">
                <button type="submit" class="col-span-4 bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 rounded-lg transition duration-300 shadow-md">
                    Adicionar ao Estoque
                </button>
            </form>
        </div>

        <!-- Lista de Estoque -->
        <div class="bg-white p-6 rounded-xl shadow-lg">
            <h3 class="text-xl font-semibold mb-4">Itens em Estoque</h3>
            <div id="estoque-list" class="space-y-4">
                <p class="text-gray-500">Carregando itens...</p>
            </div>
        </div>
    `;

    // 1. Configurar listener do formulário
    document.getElementById('add-product-form').addEventListener('submit', handleAddProduto);

    // 2. Renderizar a lista inicial
    await renderEstoqueList();
};

const handleAddProduto = async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');

    const data = {
        nomeProduto: form.nomeProduto.value.trim(),
        quantidadeEstoque: form.quantidadeEstoque.value,
        custoUnitario: form.custoUnitario.value,
        fornecedor: form.fornecedor.value.trim()
    };

    btn.textContent = 'Adicionando...';
    btn.disabled = true;

    try {
        await addProduto(data);
        form.reset();
        await renderEstoqueList();
    } catch (error) {
        alert(`Falha ao adicionar produto: ${error.message}`);
    } finally {
        btn.textContent = 'Adicionar ao Estoque';
        btn.disabled = false;
    }
};

const renderEstoqueList = async () => {
    const listDiv = document.getElementById('estoque-list');
    listDiv.innerHTML = ''; // Limpa a lista
    const items = await getEstoqueItems();

    if (items.length === 0) {
        listDiv.innerHTML = '<p class="text-gray-500">Nenhum produto registrado no estoque.</p>';
        return;
    }

    items.forEach(item => {
        const isLowStock = item.quantidadeEstoque < LOW_STOCK_THRESHOLD;
        const alertClass = isLowStock ? 'bg-red-50 border-red-400' : 'bg-white border-gray-200';
        const icon = isLowStock 
            ? '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-500 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>' 
            : '';

        const itemElement = document.createElement('div');
        itemElement.className = `flex justify-between items-center p-4 border rounded-lg shadow-sm ${alertClass}`;
        itemElement.innerHTML = `
            <div class="flex items-center flex-1 min-w-0">
                ${icon}
                <div class="min-w-0">
                    <p class="font-semibold text-gray-900 truncate">${item.nomeProduto} 
                        ${isLowStock ? '<span class="text-xs font-bold text-red-500 ml-2">ESTOQUE BAIXO!</span>' : ''}
                    </p>
                    <p class="text-sm text-gray-600">
                        Custo Unitário: R$ ${item.custoUnitario.toFixed(2).replace('.', ',')} 
                        ${item.fornecedor ? `| Fornecedor: ${item.fornecedor}` : ''}
                    </p>
                </div>
            </div>
            
            <div class="flex items-center space-x-3 flex-shrink-0">
                <input type="number" 
                    id="qty-${item.id}" 
                    value="${item.quantidadeEstoque}" 
                    min="0"
                    class="w-20 p-2 border border-gray-300 rounded-lg text-center focus:ring-yellow-500 focus:border-yellow-500 update-quantity-input">
                
                <button data-id="${item.id}" 
                    class="update-qty-btn bg-yellow-500 hover:bg-yellow-600 text-white text-sm py-2 px-3 rounded-lg transition duration-150">
                    Atualizar
                </button>
            </div>
        `;
        listDiv.appendChild(itemElement);
    });
    
    setupQuantityUpdateListeners();
};

const setupQuantityUpdateListeners = () => {
    document.querySelectorAll('.update-qty-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            const btn = e.target;
            const productId = btn.dataset.id;
            const input = document.getElementById(`qty-${productId}`);
            const newQuantity = input.value;

            btn.textContent = '...';
            btn.disabled = true;

            try {
                await updateProdutoQuantity(productId, newQuantity);
                await renderEstoqueList(); // Re-renderiza para ver o novo status/alerta
            } catch (error) {
                alert(`Falha ao atualizar quantidade: ${error.message}`);
            } finally {
                btn.textContent = 'Atualizar';
                btn.disabled = false;
            }
        });
    });
};
