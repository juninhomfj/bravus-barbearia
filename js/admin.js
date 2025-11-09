import { getBarbeiro } from './firestore.js';
import { getCurrentUser, getAuthToken } from './auth.js';
import { getFirestore, collection, query, where, getDocs, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';

let db;
export const initAdmin = (firestoreInstance) => { db = firestoreInstance; };

// Simple Firestore document editor (very basic)
const renderDocEditor = async (container, path) => {
    container.innerHTML = '';
    const parts = path.split('/');
    if (parts.length % 2 === 0) {
        container.textContent = 'Path inválido — forneça caminho para um documento (ex: barbeiros/UID).';
        return;
    }
    try {
        const docRef = doc(db, ...parts);
        const snap = await getDoc(docRef);
        const pre = document.createElement('pre');
        pre.className = 'p-3 bg-gray-100 rounded';
        pre.textContent = JSON.stringify(snap.exists() ? snap.data() : {}, null, 2);
        container.appendChild(pre);

        const textArea = document.createElement('textarea');
        textArea.className = 'w-full h-32 border p-2';
        textArea.value = JSON.stringify(snap.exists() ? snap.data() : {}, null, 2);
        container.appendChild(textArea);

        const saveBtn = document.createElement('button');
        saveBtn.className = 'mt-2 bg-blue-500 text-white px-3 py-1 rounded';
        saveBtn.textContent = 'Salvar Alterações';
        saveBtn.addEventListener('click', async () => {
            try {
                const payload = JSON.parse(textArea.value);
                await setDoc(docRef, payload, { merge: true });
                alert('Documento atualizado com sucesso.');
            } catch (err) { alert('Erro ao salvar: ' + err.message); }
        });
        container.appendChild(saveBtn);
    } catch (err) {
        container.textContent = 'Erro: ' + err.message;
    }
};

export const loadAdminPanel = async (container = null) => {
    const target = container || document.getElementById('content-display') || document.getElementById('app-container');
    if (!target) return;
    target.innerHTML = '';

    const user = getCurrentUser();
    if (!user) return target.innerHTML = '<div class="p-4 bg-white rounded">Faça login como admin.</div>';

    const profile = await getBarbeiro(user.uid);
    if (!profile?.isAdmin) return target.innerHTML = '<div class="p-4 bg-white rounded">Acesso negado. Conta não é admin.</div>';

    // Header and controls
    const card = document.createElement('div');
    card.className = 'bg-white p-6 rounded shadow';
    card.innerHTML = `
      <h2 class="text-2xl font-semibold mb-3">Super Admin Panel</h2>
      <p class="text-sm text-gray-600 mb-4">Área restrita: você tem acesso para ajustar configurações, gerenciar users e editar documentos.</p>
      <div class="mb-4"><button id="reload-trials" class="bg-yellow-500 px-3 py-1 rounded mr-2">Recarregar Trials</button><button id="toggle-stripe" class="bg-gray-200 px-3 py-1 rounded">Toggle Stripe Enabled</button></div>
      <div id="trials-list" class="mb-4"></div>
      <hr class="my-4" />
      <div class="mb-4"><h3 class="font-semibold">Visualizador/Editor de DB</h3><input id="doc-path" class="border p-2 w-full" placeholder="ex: barbeiros/USER_UID" /><div id="doc-editor" class="mt-3"></div></div>
    `;
    target.appendChild(card);

    const trialsList = card.querySelector('#trials-list');
    const reloadBtn = card.querySelector('#reload-trials');
    const toggleStripeBtn = card.querySelector('#toggle-stripe');
    const docPathInput = card.querySelector('#doc-path');
    const docEditor = card.querySelector('#doc-editor');

    // Initialize Firebase Functions callable
    const functions = getFunctions();
    const promoteFn = httpsCallable(functions, 'promoteUser');
    const demoteFn = httpsCallable(functions, 'demoteUser');
    const updateConfigFn = httpsCallable(functions, 'updatePlatformConfig');

    const loadTrials = async () => {
        trialsList.innerHTML = '<div>Carregando trials...</div>';
        try {
            const colRef = collection(db, 'barbeiros');
            const q = query(colRef, where('plan', '==', 'trial'));
            const snaps = await getDocs(q);
            trialsList.innerHTML = '';
            if (snaps.empty) { trialsList.textContent = 'Nenhum trial ativo.'; return; }
            snaps.forEach(docSnap => {
                const d = docSnap.data();
                const row = document.createElement('div');
                row.className = 'p-2 border-b flex justify-between items-center';
                row.innerHTML = `<div><strong>${d.displayName || d.name || docSnap.id}</strong><div class="text-sm text-gray-600">Ends: ${d.trialEnd?.toDate ? d.trialEnd.toDate().toLocaleString() : d.trialEnd}</div></div>`;
                const actions = document.createElement('div');
                const promoteBtn = document.createElement('button');
                promoteBtn.className = 'bg-green-500 text-white px-2 py-1 rounded mr-2';
                promoteBtn.textContent = 'Promover';
                promoteBtn.addEventListener('click', async () => {
                    try { await promoteFn({ targetUid: docSnap.id }); alert('Usuario promovido'); loadTrials(); } catch (err) { alert('Erro: '+ err.message); }
                });
                const demoteBtn = document.createElement('button');
                demoteBtn.className = 'bg-gray-300 px-2 py-1 rounded';
                demoteBtn.textContent = 'Encerrar';
                demoteBtn.addEventListener('click', async () => {
                    if (!confirm('Encerrar trial deste usuário?')) return;
                    try { await demoteFn({ targetUid: docSnap.id }); alert('Trial encerrado'); loadTrials(); } catch (err) { alert('Erro: '+ err.message); }
                });
                actions.appendChild(promoteBtn);
                actions.appendChild(demoteBtn);
                row.appendChild(actions);
                trialsList.appendChild(row);
            });

        } catch (err) {
            trialsList.textContent = 'Erro ao carregar trials: ' + err.message;
        }
    };

    reloadBtn.addEventListener('click', loadTrials);
    loadTrials();

    toggleStripeBtn.addEventListener('click', async () => {
        try {
            // read current config
            const cfgDoc = await db.doc('platform/config').get();
            const current = cfgDoc.exists ? cfgDoc.data().stripeEnabled === true : false;
            const payload = { stripeEnabled: !current };
            await updateConfigFn({ payload });
            alert('Stripe enabled set to: ' + (!current));
        } catch (err) { alert('Erro ao atualizar config: ' + err.message); }
    });

    // doc editor
    docPathInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const path = docPathInput.value.trim();
            if (path) renderDocEditor(docEditor, path);
        }
    });
};

export default { loadAdminPanel, initAdmin };
