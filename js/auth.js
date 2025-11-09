// auth.js
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { setBarbeiro, createNewBarberProfile } from './firestore.js'; // Importa a função do Firestore

let auth;

export const initializeAuth = (app) => {
    auth = getAuth(app);
};

const ensureAuth = () => {
    if (!auth) throw new Error('Auth não inicializado. Chame initializeAuth(app) primeiro.');
};

// Função auxiliar para obter o usuário logado
export const getCurrentUser = () => {
    ensureAuth();
    return auth.currentUser;
};

// 1. Função de Login
export const handleLogin = async (email, password) => {
    ensureAuth();
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    } catch (error) {
        console.error("Erro no login:", error);
        throw error;
    }
};

// 2. Função de Cadastro
export const handleSignup = async (name, accountType, email, password, phone, city) => {
    ensureAuth();
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Cria perfil do barbeiro incluindo o publicLink
        await createNewBarberProfile(user, name);
        
        return user;
    } catch (error) {
        console.error("Erro no cadastro:", error);
        throw error;
    }
};

// 3. Função de Logout
export const handleLogout = () => {
    ensureAuth();
    return signOut(auth);
};

// 4. Listener de Estado de Autenticação
export const onAuthChange = (callback) => {
    ensureAuth();
    onAuthStateChanged(auth, callback);
};