// firestore.js
import { getFirestore, collection, doc, addDoc, getDocs, setDoc, getDoc, query, where, Timestamp, updateDoc, deleteDoc, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// Permit mutable exported bindings (we intentionally reassign these in initializeDatabase)
/* eslint-disable import/no-mutable-exports */
// EXPORTAR a instância do DB
export let db;
export let storage;

export const initializeDatabase = (app) => {
    db = getFirestore(app);
    storage = getStorage(app);
    // If running on localhost, connect Firestore to the emulator (note: port configured in firebase.json)
    try {
        if (location && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
            // Port 8082 configured in firebase.json
            connectFirestoreEmulator(db, '127.0.0.1', 8082);
            console.info('Firestore emulator connected: 127.0.0.1:8082');
        }
    } catch (e) {
        console.warn('Could not connect to Firestore emulator:', e);
    }
};

// ----------------------------
// Public link generation helpers
// ----------------------------
/**
 * Gera o link público único de agendamento com base no UID do barbeiro.
 * @param {string} uid O UID do barbeiro.
 * @returns {string} O link público.
 */
export const generatePublicLink = (uid) => {
    if (!uid) return '';
    const BASE_URL = window.location.origin;
    return `${BASE_URL}/agendar.html?id=${encodeURIComponent(uid)}`;
};

/**
 * Cria o documento inicial do perfil do barbeiro, incluindo o link público.
 */
export const createNewBarberProfile = async (user, nome) => {
    if (!user) return;
    try {
        const publicLink = generatePublicLink(user.uid);
        const barberData = {
            nome: nome || user.displayName || '',
            // normalized fields: 'plan' for internal checks, 'plano' for display
            plan: 'free',
            plano: 'Free',
            publicLink,
            dataRegistro: Timestamp.now()
        };
        const docRef = doc(db, 'barbeiros', user.uid);
        await setDoc(docRef, barberData);
        return { id: user.uid, ...barberData };
    } catch (err) {
        console.error('Erro ao criar perfil do barbeiro:', err);
        throw err;
    }
};

// Funções existentes para manter compatibilidade com o restante do código
export const getBarbeiro = async (uid) => {
    const docRef = doc(db, "barbeiros", uid);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
        return snapshot.data();
    }
    return null;
};

export const setBarbeiro = async (uid, data) => {
    const docRef = doc(db, "barbeiros", uid);
    // Ensure default plan if not provided
    const payload = { ...data };
    if (payload.plan == null && payload.isPremium == null) {
        payload.plan = 'free';
    }
    await setDoc(docRef, payload, { merge: true });
};

export const promoteToPremium = async (uid) => {
    const docRef = doc(db, "barbeiros", uid);
    await setDoc(docRef, { plan: 'premium', isPremium: true }, { merge: true });
};

// Trial helpers
export const startTrial = async (uid, days = 14) => {
    const docRef = doc(db, "barbeiros", uid);
    const now = Timestamp.now();
    const end = Timestamp.fromDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
    await setDoc(docRef, { plan: 'trial', trialStart: now, trialEnd: end, isPremium: true }, { merge: true });
    return { trialStart: now, trialEnd: end };
};

export const endTrial = async (uid) => {
    const docRef = doc(db, "barbeiros", uid);
    // Demote to free plan and remove trial flags
    await setDoc(docRef, { plan: 'free', isPremium: false, trialStart: null, trialEnd: null }, { merge: true });
};

export const uploadImage = async (path, file) => {
    if (!storage) throw new Error('Storage não inicializado. Chame initializeDatabase(app) primeiro.');
    const storageRef = ref(storage, path);
    const snap = await uploadBytes(storageRef, file);
    const url = await getDownloadURL(snap.ref);
    return url;
};

// ----------------------------
// Disponibilidade (barbeiros/{uid}/agenda/disponibilidade)
// ----------------------------
export const addDisponibilidade = async (uid, disponibilidade) => {
    // disponibilidade: { diaSemana, inicio, fim, intervalo }
    const colRef = collection(db, 'barbeiros', uid, 'agenda', 'disponibilidade');
    const docRef = await addDoc(colRef, disponibilidade);
    return { id: docRef.id, ...disponibilidade };
};

export const getDisponibilidades = async (uid) => {
    const colRef = collection(db, 'barbeiros', uid, 'agenda', 'disponibilidade');
    const snaps = await getDocs(colRef);
    return snaps.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const setDisponibilidade = async (uid, disponibilidadeId, data) => {
    const docRef = doc(db, 'barbeiros', uid, 'agenda', 'disponibilidade', disponibilidadeId);
    await setDoc(docRef, data, { merge: true });
};

export const deleteDisponibilidade = async (uid, disponibilidadeId) => {
    const docRef = doc(db, 'barbeiros', uid, 'agenda', 'disponibilidade', disponibilidadeId);
    await deleteDoc(docRef);
};

// ----------------------------
// Agendamentos (/agendamentos/{id})
// ----------------------------
export const createAgendamento = async (agendamento) => {
    // agendamento: { barbeiroId, clienteId, clienteNome, servicoId, dataHoraInicio(Date|Timestamp), dataHoraFim(Date|Timestamp), status }
    const colRef = collection(db, 'agendamentos');
    // Normalize Date -> Timestamp
    const payload = { ...agendamento };
    if (payload.dataHoraInicio instanceof Date) payload.dataHoraInicio = Timestamp.fromDate(payload.dataHoraInicio);
    if (payload.dataHoraFim instanceof Date) payload.dataHoraFim = Timestamp.fromDate(payload.dataHoraFim);
    const docRef = await addDoc(colRef, payload);
    return { id: docRef.id, ...payload };
};

export const getAgendamento = async (id) => {
    const docRef = doc(db, 'agendamentos', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
};

export const getAgendamentosByBarbeiro = async (barbeiroId) => {
    const colRef = collection(db, 'agendamentos');
    const q = query(colRef, where('barbeiroId', '==', barbeiroId));
    const snaps = await getDocs(q);
    return snaps.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const updateAgendamentoStatus = async (id, status) => {
    const docRef = doc(db, 'agendamentos', id);
    await updateDoc(docRef, { status });
};

export const deleteAgendamento = async (id) => {
    const docRef = doc(db, 'agendamentos', id);
    await deleteDoc(docRef);
};