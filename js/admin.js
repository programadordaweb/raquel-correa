const loginScreen = document.getElementById('loginScreen');
const loginForm = document.getElementById('loginForm');
const loginCard = document.querySelector('.admin-login-card');
const loginMessage = document.getElementById('loginMessage');
const loginBtn = document.getElementById('loginBtn');
const loginPassword = document.getElementById('loginPassword');
const passwordToggle = document.getElementById('passwordToggle');
const dashboard = document.getElementById('dashboard');
const logoutBtn = document.getElementById('logoutBtn');
const apptList = document.getElementById('apptList');
const adminEmpty = document.getElementById('adminEmpty');
const filters = document.getElementById('filters');
const liveDot = document.getElementById('liveDot');

let appointments = [];
let currentFilter = 'upcoming';
let pollTimer = null;
const POLL_INTERVAL_MS = 5000;

/* ---------- Auth ---------- */
async function checkSession() {
  try {
    const res = await fetch('/api/admin/me');
    const data = await res.json();
    if (data.authenticated) {
      showDashboard();
    } else {
      showLogin();
    }
  } catch (err) {
    showLogin();
  }
}

function showLogin() {
  loginScreen.hidden = false;
  dashboard.hidden = true;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  liveDot.classList.remove('is-live');
}

function showDashboard() {
  loginScreen.hidden = true;
  dashboard.hidden = false;
  loadAppointments();
  startPolling();
}

passwordToggle.addEventListener('click', () => {
  const showing = loginPassword.type === 'text';
  loginPassword.type = showing ? 'password' : 'text';
  passwordToggle.classList.toggle('is-visible', !showing);
  passwordToggle.setAttribute('aria-pressed', String(!showing));
  passwordToggle.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
  loginPassword.focus();
});

function showLoginError(text) {
  loginMessage.textContent = text;
  loginMessage.className = 'booking-message booking-message--error';
  loginCard.classList.remove('is-shake');
  // restart the animation even if it's already mid-shake from a previous attempt
  void loginCard.offsetWidth;
  loginCard.classList.add('is-shake');
  loginPassword.focus();
  loginPassword.select();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginMessage.textContent = '';
  loginBtn.disabled = true;
  loginBtn.textContent = 'Entrando…';

  const password = loginPassword.value;

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    loginBtn.disabled = false;
    loginBtn.textContent = 'Entrar';

    if (!res.ok) {
      showLoginError('Senha incorreta. Tente novamente.');
      return;
    }
    loginForm.reset();
    showDashboard();
  } catch (err) {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Entrar';
    showLoginError('Não foi possível conectar ao servidor.');
  }
});

logoutBtn.addEventListener('click', async () => {
  try { await fetch('/api/admin/logout', { method: 'POST' }); } catch (err) { /* ignore */ }
  showLogin();
});

/* ---------- Data ----------
   No persistent push connection (Vercel's serverless functions don't keep
   a connection alive between requests), so the dashboard polls instead —
   still "updates on its own", just every few seconds rather than instantly. */
async function loadAppointments() {
  try {
    const res = await fetch('/api/admin/appointments');
    if (res.status === 401) { showLogin(); return; }
    if (!res.ok) throw new Error('bad_response');
    const fresh = await res.json();

    const previousIds = new Set(appointments.map((a) => a.id));
    const newlyArrived = fresh.find((a) => !previousIds.has(a.id));

    appointments = fresh;
    liveDot.classList.add('is-live');
    render(newlyArrived ? newlyArrived.id : undefined);
  } catch (err) {
    liveDot.classList.remove('is-live');
  }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(loadAppointments, POLL_INTERVAL_MS);
}

/* ---------- Render ---------- */
function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

filters.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  filters.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('is-active'));
  btn.classList.add('is-active');
  currentFilter = btn.dataset.filter;
  render();
});

function render(highlightId) {
  const today = todayISO();
  let list = appointments;
  if (currentFilter === 'upcoming') {
    list = appointments.filter((a) => a.status === 'pending' && a.apptDate >= today);
  } else if (currentFilter === 'done') {
    list = appointments.filter((a) => a.status === 'done');
  }

  adminEmpty.hidden = list.length !== 0;
  apptList.innerHTML = '';

  list.forEach((a) => {
    const card = document.createElement('article');
    card.className = 'appt-card' + (a.status === 'done' ? ' appt-card--done' : '');
    if (a.id === highlightId) card.classList.add('appt-card--new');

    const waNumber = (a.phone || '').replace(/\D/g, '');

    card.innerHTML = `
      <div class="appt-when">
        <span class="appt-date">${formatDate(a.apptDate)}</span>
        <span class="appt-time">${a.apptTime}</span>
      </div>
      <div class="appt-info">
        <span class="appt-name">${escapeHtml(a.name)}</span>
        <a class="appt-phone" href="https://wa.me/55${waNumber}" target="_blank" rel="noopener">${escapeHtml(a.phone)}</a>
        ${a.email ? `<span class="appt-email">${escapeHtml(a.email)}</span>` : ''}
        ${a.notes ? `<span class="appt-notes">${escapeHtml(a.notes)}</span>` : ''}
      </div>
      <div class="appt-actions">
        <span class="appt-status appt-status--${a.status}">${a.status === 'done' ? 'Concluído' : 'Pendente'}</span>
        ${a.status !== 'done' ? `<button class="btn btn-outline btn-small" data-done="${a.id}">Marcar como concluído</button>` : `<button class="btn btn-outline btn-small" data-undo="${a.id}">Reabrir</button>`}
      </div>
    `;
    apptList.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

apptList.addEventListener('click', async (e) => {
  const doneBtn = e.target.closest('[data-done]');
  const undoBtn = e.target.closest('[data-undo]');
  const id = doneBtn?.dataset.done || undoBtn?.dataset.undo;
  if (!id) return;
  const status = doneBtn ? 'done' : 'pending';
  try {
    await fetch(`/api/admin/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  } catch (err) { /* SSE/refresh will reconcile */ }
});

checkSession();
