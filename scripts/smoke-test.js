/* smoke-test.js
   Script simples que usa firebase-admin para exercitar flows:
   - cria um barbeiro de teste
   - promove para premium e demove
   - cria agendamentos sobrepostos e lista-os

   Execute com os emuladores rodando (Firestore emulator default em localhost:8080).
*/

const admin = require('firebase-admin');

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'bravus-barbearia';

// If running against the emulator, set FIRESTORE_EMULATOR_HOST=localhost:8080 in environment
admin.initializeApp({ projectId: PROJECT_ID });

const db = admin.firestore();

async function run() {
  console.log('Smoke test start');
  const barberId = 'smoke-test-barber';
  const barberRef = db.collection('barbeiros').doc(barberId);

  // 1) Create or reset barber profile
  await barberRef.set({
    nome: 'Barber Smoke Test',
    plan: 'free',
    plano: 'Free',
    isPremium: false,
    publicLink: `http://localhost:5500/agendar.html?id=${barberId}`
  });
  console.log('Created barber profile:', barberId);

  const snap1 = await barberRef.get();
  console.log('Profile after create:', snap1.data());

  // 2) Promote to premium (simulate billing)
  await barberRef.set({ plan: 'premium', isPremium: true }, { merge: true });
  const snap2 = await barberRef.get();
  console.log('Profile after promote:', snap2.data());

  // 3) Create two overlapping appointments for the barber
  const agendamentoCol = db.collection('agendamentos');
  const now = new Date();
  const start1 = new Date(now.getTime() + 60 * 60 * 1000); // +1h
  const end1 = new Date(start1.getTime() + 30 * 60 * 1000); // +30m
  const start2 = new Date(start1.getTime() + 15 * 60 * 1000); // overlaps (start 15m into first)
  const end2 = new Date(start2.getTime() + 30 * 60 * 1000);

  await agendamentoCol.add({
    barbeiroId: barberId,
    clienteId: 'client-1',
    clienteNome: 'Cliente A',
    servicoNome: 'Corte Simples',
    dataHoraInicio: admin.firestore.Timestamp.fromDate(start1),
    dataHoraFim: admin.firestore.Timestamp.fromDate(end1),
    status: 'confirmado'
  });

  await agendamentoCol.add({
    barbeiroId: barberId,
    clienteId: 'client-2',
    clienteNome: 'Cliente B',
    servicoNome: 'Barba',
    dataHoraInicio: admin.firestore.Timestamp.fromDate(start2),
    dataHoraFim: admin.firestore.Timestamp.fromDate(end2),
    status: 'confirmado'
  });

  console.log('Created two overlapping agendamentos.');

  // 4) Query agendamentos for barber
  const q = await agendamentoCol.where('barbeiroId', '==', barberId).get();
  console.log('Agendamentos count for barber:', q.size);
  q.forEach(doc => {
    const d = doc.data();
    console.log('-', doc.id, d.clienteNome, d.servicoNome, d.dataHoraInicio.toDate(), '-', d.dataHoraFim.toDate());
  });

  // 5) Demote to free
  await barberRef.set({ plan: 'free', isPremium: false }, { merge: true });
  const snap3 = await barberRef.get();
  console.log('Profile after demote:', snap3.data());

  console.log('Smoke test finished');
}

run().catch(err => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
