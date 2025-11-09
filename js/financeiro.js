import { db } from './firestore.js';
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

const FINANCA_SUBCOLLECTION = "financeiro";

// =================================================================
// 1. LÓGICA DE TRANSAÇÃO AUTOMÁTICA
// =================================================================

/**
 * Cria um novo lançamento de Contas a Receber, disparado após um agendamento.
 * NOTA: Em um sistema real, isso seria disparado no momento da conclusão do serviço.
 */
export const createReceivableEntry = async (barbeiroId, agendamentoData) => {
    // Usamos o barbeiroId do agendamento, pois o Barbeiro pode não estar logado
    // quando o agendamento é criado, mas a transação é dele.
    if (!barbeiroId) {
        console.error("ID do barbeiro não fornecido para o lançamento financeiro.");
        return;
    }

    try {
        const novoLancamento = {
            dataAgendamento: Timestamp.now(), // Usando a data atual para o registro
            clienteNome: agendamentoData.clienteNome || "Anônimo",
            servicoNome: agendamentoData.servicoNome,
            valor: agendamentoData.valor, // Assumindo que o valor foi incluído nos dados do agendamento/serviço
            status: 'pendente',
            agendamentoId: agendamentoData.id || "manual", // ID do agendamento (se existir)
            dataCriacao: Timestamp.now()
        };

        const financeiroRef = collection(db, "barbeiros", barbeiroId, FINANCA_SUBCOLLECTION);
        await addDoc(financeiroRef, novoLancamento);
        console.log(`Lançamento financeiro criado para o serviço: ${agendamentoData.servicoNome}`);
        
    } catch (error) {
        console.error("Erro ao criar lançamento financeiro:", error);
        throw error;
    }
};

/**
 * Busca todos os lançamentos financeiros do barbeiro logado.
 */
const getFinancialEntries = async () => {
    const user = getCurrentUser();
    if (!user) return [];

    try {
        const financeiroRef = collection(db, "barbeiros", user.uid, FINANCA_SUBCOLLECTION);
        const q = query(financeiroRef);
        const snapshot = await getDocs(q);
        
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            // Converte Timestamps para objetos Date para facilitar a exibição
            dataAgendamento: doc.data().dataAgendamento.toDate(),
            dataCriacao: doc.data().dataCriacao.toDate()
        }));
    } catch (error) {
        console.error("Erro ao buscar lançamentos financeiros:", error);
        return [];
    }
};

/**
 * Atualiza o status de um lançamento (ex: de pendente para pago).
 */
export const updateEntryStatus = async (entryId, newStatus) => {
    const user = getCurrentUser();
    if (!user) throw new Error("Usuário não autenticado.");
    
    if (newStatus !== 'pago' && newStatus !== 'pendente') {
        throw new Error("Status inválido.");
    }

    try {
        const docRef = doc(db, "barbeiros", user.uid, FINANCA_SUBCOLLECTION, entryId);
        await updateDoc(docRef, {
            status: newStatus,
            dataAtualizacao: Timestamp.now()
        });
    } catch (error) {
        console.error("Erro ao atualizar status:", error);
        throw error;
    }
};


// =================================================================
// 2. UI DO PAINEL DO BARBEIRO
// =================================================================

/**
 * Carrega a interface completa de controle financeiro.
 */
export const loadFinanceiroManager = () => {
    const appContainer = document.getElementById('app-container');
    
    appContainer.innerHTML = `
        <h2 class="text-3xl font-bold mb-6 text-gray-800">📊 Controle Financeiro</h2>
        
        <!-- Cartões de Resumo -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8" id="financial-summary">
            <!-- Total Recebido -->
            <div class="bg-white p-6 rounded-xl shadow-lg border-l-4 border-green-500">
                <p class="text-sm font-medium text-gray-500">Total Recebido (Pago)</p>
                <p class="mt-1 text-3xl font-semibold text-green-600" id="total-pago">R$ 0,00</p>
            </div>
            <!-- Total Pendente -->
            <div class="bg-white p-6 rounded-xl shadow-lg border-l-4 border-yellow-500">
                <p class="text-sm font-medium text-gray-500">Total a Receber (Pendente)</p>
                <p class="mt-1 text-3xl font-semibold text-yellow-600" id="total-pendente">R$ 0,00</p>
            </div>
            <!-- Total Geral -->
            <div class="bg-white p-6 rounded-xl shadow-lg border-l-4 border-gray-500">
                <p class="text-sm font-medium text-gray-500">Total Geral (Recebido + Pendente)</p>
                <p class="mt-1 text-3xl font-semibold text-gray-800" id="total-geral">R$ 0,00</p>
            </div>
        </div>

        <!-- Lista de Lançamentos -->
        <div class="bg-white p-6 rounded-xl shadow-lg">
            <h3 class="text-xl font-semibold mb-4">Lançamentos de Contas a Receber</h3>
            <div id="entries-list" class="space-y-3">
                <p class="text-gray-500">Carregando lançamentos...</p>
            </div>
        </div>
    `;

    renderFinancialList();
};

/**
 * Renderiza a lista de lançamentos e atualiza os cartões de resumo.
 */
const renderFinancialList = async () => {
    const listDiv = document.getElementById('entries-list');
    const entries = await getFinancialEntries();
    
    let totalPago = 0;
    let totalPendente = 0;

    listDiv.innerHTML = ''; // Limpa o loading

    if (entries.length === 0) {
        listDiv.innerHTML = '<p class="text-gray-500">Nenhum lançamento financeiro registrado (agendamentos concluídos).</p>';
        updateSummary(0, 0); // Zera o resumo
        return;
    }

    entries.forEach(entry => {
        const valor = entry.valor || 0;
        
        if (entry.status === 'pago') {
            totalPago += valor;
            
        } else {
            totalPendente += valor;
        }

        const entryItem = document.createElement('div');
        entryItem.className = 'flex justify-between items-center p-3 border-b border-gray-100';
        
        const statusColor = entry.status === 'pago' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
        const statusText = entry.status === 'pago' ? 'Pago' : 'Pendente';
        const buttonText = entry.status === 'pago' ? 'Marcar como Pendente' : 'Marcar como Pago';
        const newStatus = entry.status === 'pago' ? 'pendente' : 'pago';

        entryItem.innerHTML = `
            <div class="flex-1 min-w-0">
                <p class="font-semibold truncate">${entry.servicoNome}</p>
                <p class="text-sm text-gray-600">Cliente: ${entry.clienteNome}</p>
                <p class="text-xs text-gray-400">Data: ${entry.dataAgendamento.toLocaleDateString('pt-BR')}</p>
            </div>
            
            <div class="flex-shrink-0 text-right mx-4">
                <span class="text-lg font-bold text-gray-900">R$ ${valor.toFixed(2).replace('.', ',')}</span>
                <span class="inline-block px-2 py-0.5 ml-2 text-xs font-medium rounded-full ${statusColor}">${statusText}</span>
            </div>

            <div class="flex-shrink-0">
                <button 
                    data-id="${entry.id}" 
                    data-status="${newStatus}" 
                    class="status-toggle-btn bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs py-1 px-2 rounded transition duration-150">
                    ${buttonText}
                </button>
            </div>
        `;
        listDiv.appendChild(entryItem);
    });
    
    updateSummary(totalPago, totalPendente);
    setupStatusToggleListeners();
};

/**
 * Atualiza os cartões de resumo com os totais calculados.
 */
const updateSummary = (totalPago, totalPendente) => {
    const totalGeral = totalPago + totalPendente;
    
    document.getElementById('total-pago').textContent = `R$ ${totalPago.toFixed(2).replace('.', ',')}`;
    document.getElementById('total-pendente').textContent = `R$ ${totalPendente.toFixed(2).replace('.', ',')}`;
    document.getElementById('total-geral').textContent = `R$ ${totalGeral.toFixed(2).replace('.', ',')}`;
};

/**
 * Configura os listeners para os botões de toggle de status.
 */
const setupStatusToggleListeners = () => {
    document.querySelectorAll('.status-toggle-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            const btn = e.target;
            const entryId = btn.dataset.id;
            const newStatus = btn.dataset.status;

            btn.textContent = 'Aguarde...';
            btn.disabled = true;

            try {
                await updateEntryStatus(entryId, newStatus);
                // Re-renderiza a lista para atualizar a UI e os totais
                await renderFinancialList(); 
            } catch (error) {
                alert(`Falha ao atualizar status: ${error.message}`);
                btn.textContent = btn.dataset.status === 'pago' ? 'Marcar como Pendente' : 'Marcar como Pago';
            } finally {
                btn.disabled = false;
            }
        });
    });
};  