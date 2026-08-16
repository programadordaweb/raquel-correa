const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const store = require('./store');

const CONFIG_PATH = path.join(__dirname, 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  console.error('\nFalta o arquivo config.json — copie config.example.json para config.json e defina uma senha de admin.\n');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
if (!config.adminPassword || config.adminPassword === 'troque-esta-senha') {
  console.warn('\n[aviso] Você ainda está usando a senha padrão do config.json — troque antes de publicar o site.\n');
}

const PORT = process.env.PORT || 8631;
const SESSION_COOKIE = 'raquel_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

/** token -> expiry timestamp (ms). In-memory: resets on server restart, which is fine for a single-admin local app. */
const sessions = new Map();

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}
function isValidSession(token) {
  if (!token) return false;
  const expiry = sessions.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) { sessions.delete(token); return false; }
  return true;
}
function requireAdmin(req, res, next) {
  const token = req.cookies[SESSION_COOKIE];
  if (!isValidSession(token)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(__dirname));

/* ---------------- SSE (real-time push to the admin dashboard) ---------------- */
const sseClients = new Set();

function broadcast(event, payload) {
  const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach((res) => res.write(chunk));
}

app.get('/api/admin/stream', requireAdmin, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  sseClients.add(res);

  const keepAlive = setInterval(() => res.write(': ping\n\n'), 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

/* ---------------- Public booking API ---------------- */
app.get('/api/appointments/slots', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'missing_date' });
  res.json({ taken: store.getSlotsForDate(date) });
});

app.post('/api/appointments', (req, res) => {
  const { name, phone, email, notes, apptDate, apptTime } = req.body || {};
  if (!name || !phone || !apptDate || !apptTime) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  try {
    const appt = store.create({ name, phone, email, notes, apptDate, apptTime });
    broadcast('appointment:created', appt);
    res.status(201).json(appt);
  } catch (err) {
    if (err.code === 'SLOT_TAKEN') return res.status(409).json({ error: 'slot_taken' });
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

/* ---------------- Admin auth ---------------- */
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password !== config.adminPassword) {
    return res.status(401).json({ error: 'wrong_password' });
  }
  const token = createSession();
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS,
  });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  const token = req.cookies[SESSION_COOKIE];
  if (token) sessions.delete(token);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => {
  res.json({ authenticated: isValidSession(req.cookies[SESSION_COOKIE]) });
});

/* ---------------- Admin data ---------------- */
app.get('/api/admin/appointments', requireAdmin, (req, res) => {
  res.json(store.getAll());
});

app.patch('/api/admin/appointments/:id', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'done'].includes(status)) return res.status(400).json({ error: 'invalid_status' });
  const appt = store.updateStatus(req.params.id, status);
  if (!appt) return res.status(404).json({ error: 'not_found' });
  broadcast('appointment:updated', appt);
  res.json(appt);
});

app.listen(PORT, () => {
  console.log(`Raquel Corrêa Psicóloga rodando em http://localhost:${PORT}`);
});
