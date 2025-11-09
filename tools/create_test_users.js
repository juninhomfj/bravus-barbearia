// tools/create_test_users.js
// Creates test users and barber profiles in the emulator environment.
// Usage (PowerShell):
// $env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"; $env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8082"; node .\tools\create_test_users.js

const admin = require('firebase-admin');

// Initialize Admin SDK for the project (emulator connection is automatic when env vars are set)
admin.initializeApp({ projectId: 'bravus-barbearia' });

const auth = admin.auth();
const db = admin.firestore();

async function createOrGetUser(email, password, displayName) {
  try {
    const u = await auth.createUser({ email, password, displayName });
    console.log('Created user', email, u.uid);
    return u.uid;
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      const existing = await auth.getUserByEmail(email);
      console.log('User already exists:', email, existing.uid);
      return existing.uid;
    }
    throw err;
  }
}

async function createBarberProfile(uid, name, plan = 'free', isAdmin = false) {
  const docRef = db.doc(`barbeiros/${uid}`);
  const data = {
    nome: name,
    plan,
    plano: plan === 'premium' ? 'Premium' : 'Free',
    isPremium: plan === 'premium',
    isAdmin: !!isAdmin,
    publicLink: `http://localhost:5500/agendar.html?id=${uid}`,
    dataRegistro: admin.firestore.FieldValue.serverTimestamp()
  };
  await docRef.set(data, { merge: true });
  console.log('Barber profile set for', uid, 'plan:', plan);
}

(async () => {
  try {
    const barberUid = await createOrGetUser('barber@test.local', 'Test1234!', 'Barbeiro Teste');
    await createBarberProfile(barberUid, 'Barbeiro Teste', 'free', false);

    const clientUid = await createOrGetUser('client@test.local', 'Test1234!', 'Cliente Teste');
    // client profile optional

    const adminUid = await createOrGetUser('admin@test.local', 'Test1234!', 'Admin Teste');
    await createBarberProfile(adminUid, 'Admin Teste', 'premium', true);

    console.log('\nCreated/verified test users:\n - barber@test.local\n - client@test.local\n - admin@test.local\n');
    process.exit(0);
  } catch (err) {
    console.error('Error creating test users:', err);
    process.exit(1);
  }
})();
