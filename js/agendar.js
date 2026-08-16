const SCHEDULE = {
  workDays: [1, 2, 3, 4, 5], // segunda a sexta
  startHour: 9,
  endHour: 18,
  sessionMinutes: 60,
};

const dateInput = document.getElementById('apptDate');
const dateHint = document.getElementById('dateHint');
const slotsGrid = document.getElementById('slotsGrid');
const slotsEmpty = document.getElementById('slotsEmpty');
const timeInput = document.getElementById('apptTime');
const form = document.getElementById('bookingForm');
const submitBtn = document.getElementById('submitBtn');
const messageEl = document.getElementById('bookingMessage');

const pad = (n) => String(n).padStart(2, '0');

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
dateInput.min = todayISO();

function isWorkDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return SCHEDULE.workDays.includes(day);
}

function buildSlots() {
  const slots = [];
  const totalMinutesStart = SCHEDULE.startHour * 60;
  const totalMinutesEnd = SCHEDULE.endHour * 60;
  for (let t = totalMinutesStart; t + SCHEDULE.sessionMinutes <= totalMinutesEnd; t += SCHEDULE.sessionMinutes) {
    slots.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  }
  return slots;
}

function setMessage(text, kind) {
  messageEl.textContent = text;
  messageEl.className = 'booking-message' + (kind ? ` booking-message--${kind}` : '');
}

async function loadSlotsForDate(dateStr) {
  timeInput.value = '';
  slotsGrid.innerHTML = '';
  setMessage('', null);

  if (!dateStr) {
    slotsGrid.appendChild(slotsEmpty);
    return;
  }

  if (!isWorkDay(dateStr)) {
    dateHint.textContent = 'Esse dia não tem atendimento — escolha de segunda a sexta.';
    dateHint.classList.add('booking-hint--warn');
    const p = document.createElement('p');
    p.className = 'slots-empty';
    p.textContent = 'Sem horários nesse dia.';
    slotsGrid.appendChild(p);
    return;
  }
  dateHint.textContent = 'Atendimentos de segunda a sexta.';
  dateHint.classList.remove('booking-hint--warn');

  slotsGrid.innerHTML = '<p class="slots-empty">Carregando horários…</p>';

  let taken = [];
  try {
    const res = await fetch(`/api/appointments/slots?date=${encodeURIComponent(dateStr)}`);
    if (!res.ok) throw new Error('bad_response');
    const data = await res.json();
    taken = data.taken || [];
  } catch (err) {
    slotsGrid.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'slots-empty';
    p.textContent = 'Não foi possível carregar os horários agora. Tente novamente em instantes.';
    slotsGrid.appendChild(p);
    return;
  }

  const takenSet = new Set(taken);
  const allSlots = buildSlots();
  slotsGrid.innerHTML = '';

  const now = new Date();
  const isToday = dateStr === todayISO();

  let anyFree = false;
  allSlots.forEach((slot) => {
    const isTaken = takenSet.has(slot);
    const [h, m] = slot.split(':').map(Number);
    const isPast = isToday && (h * 60 + m) <= (now.getHours() * 60 + now.getMinutes());
    const disabled = isTaken || isPast;
    if (!disabled) anyFree = true;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot-btn';
    btn.textContent = slot;
    btn.disabled = disabled;
    btn.addEventListener('click', () => {
      slotsGrid.querySelectorAll('.slot-btn').forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      timeInput.value = slot;
    });
    slotsGrid.appendChild(btn);
  });

  if (!anyFree) {
    const p = document.createElement('p');
    p.className = 'slots-empty';
    p.textContent = 'Todos os horários desse dia já foram reservados.';
    slotsGrid.appendChild(p);
  }
}

dateInput.addEventListener('change', () => loadSlotsForDate(dateInput.value));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setMessage('', null);

  const name = document.getElementById('apptName').value.trim();
  const phone = document.getElementById('apptPhone').value.trim();
  const email = document.getElementById('apptEmail').value.trim();
  const notes = document.getElementById('apptNotes').value.trim();
  const apptDate = dateInput.value;
  const apptTime = timeInput.value;

  if (!apptDate || !apptTime) {
    setMessage('Escolha uma data e um horário disponível.', 'error');
    return;
  }
  if (!name || !phone) {
    setMessage('Preencha nome e WhatsApp para continuar.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Enviando…';

  try {
    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email, notes, apptDate, apptTime }),
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Confirmar agendamento';

    if (res.status === 409) {
      setMessage('Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.', 'error');
      loadSlotsForDate(apptDate);
      return;
    }
    if (!res.ok) {
      setMessage('Não foi possível confirmar o agendamento. Tente novamente.', 'error');
      return;
    }

    form.reset();
    slotsGrid.innerHTML = '';
    slotsGrid.appendChild(slotsEmpty);
    setMessage(`Agendamento confirmado para ${apptDate.split('-').reverse().join('/')} às ${apptTime}. Você também pode confirmar pelo WhatsApp.`, 'success');
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Confirmar agendamento';
    setMessage('Não foi possível conectar ao servidor. Tente novamente.', 'error');
  }
});
