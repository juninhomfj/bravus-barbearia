// /js/agenda.js
import { getCurrentUser } from './auth.js';
import { db, createAgendamento, getAgendamentosByBarbeiro, getBarbeiro } from './firestore.js';

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  getDoc,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const AGENDAMENTOS_COLLECTION = "agendamentos";

// =================================================================
// 1. LÓGICA DE GESTÃO DA DISPONIBILIDADE (BARBEIRO - PRIVADO)
// =================================================================

export const saveAvailability = async (availabilityData) => {
  const user = getCurrentUser();
  if (!user) throw new Error("Usuário não autenticado.");

  try {
    const docRef = doc(db, "barbeiros", user.uid, "agenda", "horarios");
    await setDoc(docRef, availabilityData, { merge: true });
    return true;
  } catch (error) {
    console.error("Erro ao salvar disponibilidade:", error);
    throw error;
  }
};

export const getAvailability = async (barbeiroId) => {
  try {
    const docRef = doc(db, "barbeiros", barbeiroId, "agenda", "horarios");
    const snap = await getDoc(docRef);
  if (snap?.exists()) return snap.data();

  // Fallback: check profile
  const barbeiro = await getBarbeiro(barbeiroId);
  return barbeiro?.horarios ?? {};
  } catch (error) {
    console.error("Erro ao obter disponibilidade:", error);
    return {};
  }
};

// =================================================================
// 2. LÓGICA DE AGENDAMENTO (CLIENTE - PÚBLICO)
// =================================================================

export const getConflictingAppointments = async (barbeiroId, startTime, endTime) => {
  const startOfDay = new Date(startTime);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startTime);
  endOfDay.setHours(23, 59, 59, 999);

  const q = query(
    collection(db, AGENDAMENTOS_COLLECTION),
    where("barbeiroId", "==", barbeiroId),
    where("dataHoraInicio", ">=", Timestamp.fromDate(startOfDay)),
    where("dataHoraInicio", "<=", Timestamp.fromDate(endOfDay))
  );

  const snapshot = await getDocs(q);
  const conflicting = snapshot.docs.filter((d) => {
    const data = d.data();
    const existingStart = data.dataHoraInicio.toDate();
    const existingEnd = data.dataHoraFim.toDate();
    return (startTime < existingEnd && endTime > existingStart);
  });

  return conflicting.length > 0;
};

export const agendarHorario = async (barbeiroId, servico, dataHora, clienteInfo = null) => {
  const user = getCurrentUser();
  const duracaoMs = (servico.duracao || 30) * 60000;
  const startTime = new Date(dataHora);
  const endTime = new Date(startTime.getTime() + duracaoMs);

  const isConflicting = await getConflictingAppointments(barbeiroId, startTime, endTime);
  if (isConflicting) throw new Error("Horário indisponível. Conflito detectado com outro agendamento.");

  try {
    await createAgendamento({
      barbeiroId: barbeiroId,
  clienteId: user?.uid ?? clienteInfo?.id ?? 'anonimo',
  clienteNome: clienteInfo?.nome ?? (user?.displayName ?? user?.email) ?? 'Anonimo',
      servicoId: servico.id,
      servicoNome: servico.nome,
      dataHoraInicio: startTime,
      dataHoraFim: endTime,
      status: 'confirmado'
    });
    return true;
  } catch (error) {
    console.error("Erro ao agendar horário:", error);
    throw error;
  }
};

// =================================================================
// 3. UI BARBEIRO - PAINEL DE GESTÃO DA AGENDA
// =================================================================

export const loadBarberAgendaManager = async (container = null) => {
  const appContainer = container || document.getElementById('app-container');
  const user = getCurrentUser();
  if (!user) {
    if (appContainer) appContainer.innerHTML = `<p class="text-red-500">Acesso negado. Faça login como barbeiro/barbearia.</p>`;
    return;
  }

  appContainer.innerHTML = `
    <h2 class="text-3xl font-bold mb-6 text-gray-800">📅 Gestão de Disponibilidade e Agenda</h2>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div class="bg-white p-6 rounded-xl shadow-lg">
        <h3 class="text-xl font-semibold mb-4">Definir Horários de Trabalho</h3>
        <form id="availability-form" class="space-y-4">
          <p class="text-sm text-gray-600">Defina o intervalo de tempo padrão para seus agendamentos (em minutos).</p>
          <div>
            <label for="intervalo" class="block text-sm font-medium text-gray-700">Intervalo Padrão (min)</label>
            <input type="number" id="intervalo" value="30" min="10" required class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
          </div>

          <p class="text-sm font-semibold mt-4">Horários por Dia da Semana:</p>
          <div id="daily-schedules" class="space-y-3"></div>

          <button type="submit" class="w-full bg-yellow-500 hover:bg-yellow-600 text-gray-800 font-bold py-2 px-4 rounded-md transition duration-300">Salvar Disponibilidade</button>
          <p id="avail-message" class="mt-2 text-center text-sm text-red-500"></p>
        </form>
      </div>

      <div class="space-y-8">
        <div class="bg-yellow-100 p-6 rounded-xl shadow-lg border-l-4 border-yellow-500">
          <h3 class="text-xl font-semibold mb-4">Link Público de Agendamento</h3>
          <p class="text-sm text-gray-700 mb-3">Compartilhe este link com seus clientes:</p>
          <div class="flex items-center space-x-2">
            <input type="text" id="public-link" readonly class="flex-grow border-dashed border-2 border-gray-400 bg-white p-2 rounded-md text-sm" value="${window.location.origin}/agendar.html?id=${user.uid}">
            <button id="copy-link" class="bg-gray-800 text-white p-2 rounded-md text-sm hover:bg-gray-700">Copiar</button>
          </div>
        </div>

        <div class="bg-white p-6 rounded-xl shadow-lg">
          <h3 class="text-xl font-semibold mb-4">Agendamentos de Hoje</h3>
          <div id="agendamentos-list" class="space-y-4"><p class="text-gray-500">Carregando agendamentos...</p></div>
        </div>
      </div>
    </div>
  `;

  await setupAvailabilityForm();
  await loadTodayAppointments();

  const copyBtn = document.getElementById('copy-link');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const link = document.getElementById('public-link');
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(link.value)
          .then(() => alert('Link copiado para a área de transferência!'))
          .catch((err) => {
            console.warn('Falha ao copiar para a área de transferência, fallback para prompt', err);
            window.prompt('Copie o link abaixo:', link.value);
          });
      } else {
        window.prompt('Copie o link abaixo:', link.value);
      }
    });
  }
};

const setupAvailabilityForm = async () => {
  const user = getCurrentUser();
  if (!user) return;

  const days = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const dailySchedules = document.getElementById('daily-schedules');
  dailySchedules.innerHTML = '';

  const savedAvailDoc = await getAvailability(user.uid);
  const savedIntervalo = savedAvailDoc.intervalo || 30;
  document.getElementById('intervalo').value = savedIntervalo;

  days.forEach(day => {
    const saved = savedAvailDoc[day] || { inicio: "09:00", fim: "18:00", ativo: true };

    dailySchedules.innerHTML += `
      <div class="flex items-center space-x-3">
        <input type="checkbox" id="check-${day}" data-day="${day}" ${saved.ativo ? 'checked' : ''} class="h-4 w-4 text-yellow-600 border-gray-300 rounded">
        <label for="check-${day}" class="w-24 text-sm font-medium text-gray-700">${day}</label>
        <input type="time" id="start-${day}" value="${saved.inicio}" ${!saved.ativo ? 'disabled' : ''} class="w-28 border border-gray-300 rounded-md p-1.5 text-sm">
        <span>às</span>
        <input type="time" id="end-${day}" value="${saved.fim}" ${!saved.ativo ? 'disabled' : ''} class="w-28 border border-gray-300 rounded-md p-1.5 text-sm">
      </div>
    `;
  });

  dailySchedules.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const day = e.target.dataset.day;
      document.getElementById(`start-${day}`).disabled = !e.target.checked;
      document.getElementById(`end-${day}`).disabled = !e.target.checked;
    });
  });

  document.getElementById('availability-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('avail-message');
    msg.textContent = 'Salvando...';
    msg.classList.remove('text-red-500', 'text-green-500');

    const newAvail = { intervalo: parseInt(document.getElementById('intervalo').value, 10) };

    days.forEach(day => {
      const isActive = document.getElementById(`check-${day}`).checked;
      newAvail[day] = {
        ativo: isActive,
        inicio: isActive ? document.getElementById(`start-${day}`).value : '00:00',
        fim: isActive ? document.getElementById(`end-${day}`).value : '00:00'
      };
    });

    try {
      await saveAvailability(newAvail);
      msg.textContent = 'Disponibilidade salva com sucesso!';
      msg.classList.add('text-green-500');
    } catch (error) {
      msg.textContent = `Erro ao salvar: ${error.message}`;
      msg.classList.add('text-red-500');
    }
  });
};

const loadTodayAppointments = async () => {
  const user = getCurrentUser();
  if (!user) return;

  const listDiv = document.getElementById('agendamentos-list');
  listDiv.innerHTML = '<p class="text-gray-500">Buscando agendamentos...</p>';

  try {
    const agendamentos = await getAgendamentosByBarbeiro(user.uid);
    const today = new Date().toLocaleDateString('pt-BR');

    const formatted = agendamentos
      .map(a => ({ ...a, dataHoraInicio: a.dataHoraInicio.toDate() }))
      .filter(a => a.dataHoraInicio.toLocaleDateString('pt-BR') === today)
      .sort((a, b) => a.dataHoraInicio - b.dataHoraInicio);

    listDiv.innerHTML = '';
    if (formatted.length === 0) {
      listDiv.innerHTML = '<p class="text-gray-500">Nenhum agendamento para hoje.</p>';
      return;
    }

    formatted.forEach(agendamento => {
      const horarioFormatado = agendamento.dataHoraInicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      listDiv.innerHTML += `
        <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
          <p class="font-semibold text-lg">${horarioFormatado} - ${agendamento.servicoNome || 'Serviço Indefinido'}</p>
          <p class="text-gray-600 text-sm">Cliente: ${agendamento.clienteNome || 'Anônimo'}</p>
        </div>
      `;
    });
  } catch (error) {
    listDiv.innerHTML = `<p class="text-red-500">Erro ao carregar a agenda: ${error.message}</p>`;
  }
};

// =================================================================
// 4. UI CLIENTE - PÁGINA PÚBLICA DE AGENDAMENTO
// =================================================================

export const loadPublicScheduler = async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const barbeiroId = urlParams.get('id');
  const appContainer = document.getElementById('public-scheduler-container');

  if (!barbeiroId) {
    appContainer.innerHTML = '<h1 class="text-4xl text-center text-red-600">ID da Barbearia não encontrado.</h1>';
    return;
  }

  appContainer.innerHTML = `<h1 class="text-4xl font-extrabold text-gray-800 text-center mb-10">💈 Agendamento Online</h1>
    <p class="text-center text-xl text-gray-600 mb-6">Barbearia/Barbeiro: <span id="barber-name" class="font-bold text-yellow-600">Carregando...</span></p>
    <div id="scheduler-content" class="grid grid-cols-1 md:grid-cols-2 gap-8">
         <div class="bg-white p-6 rounded-xl shadow-lg h-fit">
            <h3 class="text-xl font-semibold mb-4">1. Selecione o Serviço</h3>
            <div id="service-selector">Carregando serviços...</div>
         </div>
         <div class="bg-white p-6 rounded-xl shadow-lg">
            <h3 class="text-xl font-semibold mb-4">2. Escolha Data e Horário</h3>
            <input type="date" id="agendar-data" required class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
            <div id="time-slots" class="mt-4 grid grid-cols-3 gap-2">Selecione uma data...</div>
         </div>
         <div id="client-details-card" class="md:col-span-2 bg-yellow-100 p-6 rounded-xl shadow-xl hidden">
            <h3 class="text-xl font-semibold mb-4">3. Confirmação</h3>
            <form id="booking-form" class="space-y-4">
                 <p>Serviço Selecionado: <span id="selected-service-name" class="font-semibold"></span></p>
                 <p>Data e Hora: <span id="selected-datetime" class="font-semibold"></span></p>
                 
                 <!-- Detalhes do Cliente (se não estiver logado) -->
                 <div>
                    <label for="client-name" class="block text-sm font-medium text-gray-700">Seu Nome</label>
                    <input type="text" id="client-name" required class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                 </div>
                 <div>
                    <label for="client-phone" class="block text-sm font-medium text-gray-700">Telefone (Whatsapp)</label>
                    <input type="tel" id="client-phone" required class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                 </div>

                <button type="submit" class="w-full bg-yellow-500 hover:bg-yellow-600 text-gray-800 font-bold py-3 px-4 rounded-md transition duration-300">CONFIRMAR AGENDAMENTO</button>
                <p id="booking-message" class="mt-2 text-center text-sm text-red-500"></p>
            </form>
         </div>
    </div>
  `;

  const barberData = await getBarbeiro(barbeiroId);
  if (barberData?.name) {
    document.getElementById('barber-name').textContent = barberData.name;
  }

  const allServices = await getPublicServices(barbeiroId);
  const availability = await getAvailability(barbeiroId);

  setupPublicSchedulerListeners(barbeiroId, allServices, availability);
};

const getPublicServices = async (barbeiroId) => {
  try {
    const q = query(collection(db, "servicos"), where("barbeiroId", "==", barbeiroId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("Erro ao buscar serviços públicos:", error);
    return [];
  }
};

const setupPublicSchedulerListeners = (barbeiroId, allServices, availability) => {
  let selectedService = null;
  let selectedDate = null;
  let selectedTime = null;

  const serviceSelector = document.getElementById('service-selector');
  const dateInput = document.getElementById('agendar-data');
  const timeSlotsDiv = document.getElementById('time-slots');
  const detailsCard = document.getElementById('client-details-card');
  const bookingForm = document.getElementById('booking-form');
  const bookingMessage = document.getElementById('booking-message');

  if (allServices.length === 0) {
    serviceSelector.innerHTML = '<p class="text-red-500">Nenhum serviço cadastrado.</p>';
    return;
  }

  serviceSelector.innerHTML = '';
  allServices.forEach(service => {
    const btn = document.createElement('button');
    btn.className = 'w-full text-left p-3 my-1 rounded-lg border-2 border-gray-200 hover:bg-yellow-500 transition duration-150';
    btn.innerHTML = `<span class="font-semibold">${service.nome}</span> - R$${(service.valor||0).toFixed(2).replace('.', ',')} (${service.duracao} min)`;
    btn.dataset.id = service.id;

    btn.addEventListener('click', () => {
      serviceSelector.querySelectorAll('button').forEach(b => b.classList.remove('bg-yellow-500', 'border-yellow-700'));
      btn.classList.add('bg-yellow-500', 'border-yellow-700');
      selectedService = service;
      if (selectedDate) renderTimeSlots();
    });
    serviceSelector.appendChild(btn);
  });

  dateInput.min = new Date().toISOString().split('T')[0];
  dateInput.addEventListener('change', (e) => {
    selectedDate = e.target.value;
    renderTimeSlots();
    detailsCard.classList.add('hidden');
  });

  const renderTimeSlots = async () => {
    timeSlotsDiv.innerHTML = '<p class="col-span-3 text-center text-gray-500">Buscando horários...</p>';
    if (!selectedService || !selectedDate) {
      timeSlotsDiv.innerHTML = '<p class="col-span-3 text-center text-gray-500">Selecione um serviço e uma data.</p>';
      return;
    }

    const date = new Date(selectedDate + "T00:00:00");
    const dayOfWeek = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][date.getDay()];
    const dailyAvail = availability[dayOfWeek];
    const appointmentDuration = selectedService.duracao;
    const interval = availability.intervalo || 30;

    if (!dailyAvail?.ativo) {
      timeSlotsDiv.innerHTML = `<p class="col-span-3 text-center text-red-500">Barbearia fechada na ${dayOfWeek}.</p>`;
      return;
    }

    const startHour = parseInt(dailyAvail.inicio.split(':')[0]);
    const startMinute = parseInt(dailyAvail.inicio.split(':')[1]);
    const endHour = parseInt(dailyAvail.fim.split(':')[0]);
    const endMinute = parseInt(dailyAvail.fim.split(':')[1]);

    let currentTime = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startHour, startMinute);
    const endTimeLimit = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endHour, endMinute);

    const slots = [];
    timeSlotsDiv.innerHTML = '';

    while (currentTime < endTimeLimit) {
      const slotStartTime = new Date(currentTime);
      const slotEndTime = new Date(slotStartTime.getTime() + appointmentDuration * 60000);
      if (slotEndTime <= endTimeLimit) {
        const timeString = slotStartTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        slots.push({ startTime: slotStartTime, timeString: timeString });
      }
      currentTime = new Date(currentTime.getTime() + interval * 60000);
    }

    if (slots.length === 0) {
      timeSlotsDiv.innerHTML = '<p class="col-span-3 text-center text-gray-500">Sem horários disponíveis neste dia.</p>';
      return;
    }

    const availableSlots = [];
    for (const slot of slots) {
      const slotEndTime = new Date(slot.startTime.getTime() + appointmentDuration * 60000);
      const isConflicting = await getConflictingAppointments(barbeiroId, slot.startTime, slotEndTime);
      if (!isConflicting) {
        availableSlots.push(slot);
        const btn = document.createElement('button');
        btn.className = 'bg-gray-200 text-gray-800 p-2 rounded-md font-semibold hover:bg-yellow-500 transition duration-150 text-sm';
        btn.textContent = slot.timeString;
        btn.dataset.time = slot.timeString;
        btn.addEventListener('click', () => {
          timeSlotsDiv.querySelectorAll('button').forEach(b => b.classList.remove('bg-yellow-500', 'border-yellow-700'));
          btn.classList.add('bg-yellow-500', 'border-yellow-700');
          selectedTime = slot.startTime;
          document.getElementById('selected-service-name').textContent = selectedService.nome;
          document.getElementById('selected-datetime').textContent = `${slot.startTime.toLocaleDateString('pt-BR')} às ${slot.timeString}`;
          detailsCard.classList.remove('hidden');
        });
        timeSlotsDiv.appendChild(btn);
      }
    }

    if (availableSlots.length === 0) {
      timeSlotsDiv.innerHTML = '<p class="col-span-3 text-center text-red-500">Todos os horários estão ocupados.</p>';
    }
  };

  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedService || !selectedTime) {
      bookingMessage.textContent = 'Erro: Selecione um serviço e um horário.';
      return;
    }

    const clientName = document.getElementById('client-name').value;
    const clientPhone = document.getElementById('client-phone').value;

    bookingMessage.textContent = 'Confirmando agendamento...';
    bookingMessage.classList.remove('text-red-500', 'text-green-500');

    try {
      await agendarHorario(barbeiroId, selectedService, selectedTime, { nome: clientName, phone: clientPhone });
      bookingMessage.textContent = '✅ Agendamento realizado com sucesso!';
      bookingMessage.classList.add('text-green-500');
      bookingForm.classList.add('hidden');
      timeSlotsDiv.innerHTML = '<p class="col-span-3 text-center text-lg text-green-600 font-semibold">Horário reservado!</p>';
    } catch (error) {
      bookingMessage.textContent = `❌ Erro no agendamento: ${error.message}`;
      bookingMessage.classList.add('text-red-500');
    }
  });
};