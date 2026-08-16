const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const auth = require('./auth');

/* ---------------- Config ----------------
   On Vercel, set ADMIN_PASSWORD and SESSION_SECRET as Environment Variables
   in the project dashboard. Locally, config.json is used as a fallback so
   nothing changes for local/Render use. */
const CONFIG_PATH = path.join(__dirname, 'config.json');
const localConfig = fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {};

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || localConfig.adminPassword;
const SESSION_SECRET = process.env.SESSION_SECRET || localConfig.sessionSecret || 'dev-only-insecure-secret-troque-isso';

if (!ADMIN_PASSWORD) {
  console.error('\nFalta a senha do admin: defina ADMIN_PASSWORD (env var) ou adminPassword em config.json.\n');
}
if (SESSION_SECRET === 'dev-only-insecure-secret-troque-isso') {
  console.warn('\n[aviso] Usando um SESSION_SECRET padrão e inseguro — defina um valor próprio (env var SESSION_SECRET ou config.json).\n');
}

/* ---------------- Store (local JSON file vs. Vercel Postgres) ---------------- */
const store = (process.env.POSTGRES_URL || process.env.VERCEL)
  ? require('./store.vercel')
  : require('./store.local');

/* ---------------- Session cookie (stateless, works on serverless) ---------------- */
const SESSION_COOKIE = 'raquel_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function requireAdmin(req, res, next) {
  const token = req.cookies[SESSION_COOKIE];
  const payload = auth.verify(token, SESSION_SECRET);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });
  next();
}

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(__dirname));

/* ---------------- Public booking API ---------------- */
app.get('/api/appointments/slots', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'missing_date' });
  try {
    res.json({ taken: await store.getSlotsForDate(date) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/appointments', async (req, res) => {
  const { name, phone, email, notes, apptDate, apptTime } = req.body || {};
  if (!name || !phone || !apptDate || !apptTime) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  try {
    const appt = await store.create({ name, phone, email, notes, apptDate, apptTime });
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
  if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'wrong_password' });
  }
  const token = auth.sign({ exp: Date.now() + SESSION_TTL_MS }, SESSION_SECRET);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!process.env.VERCEL,
    maxAge: SESSION_TTL_MS,
  });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => {
  const payload = auth.verify(req.cookies[SESSION_COOKIE], SESSION_SECRET);
  res.json({ authenticated: !!payload });
});

/* ---------------- Admin data ----------------
   The dashboard polls this endpoint every few seconds for near-real-time
   updates (a persistent push connection like SSE isn't reliable on
   serverless functions, which don't stay alive between requests). */
app.get('/api/admin/appointments', requireAdmin, async (req, res) => {
  try {
    res.json(await store.getAll());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

app.patch('/api/admin/appointments/:id', requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'done'].includes(status)) return res.status(400).json({ error: 'invalid_status' });
  try {
    const appt = await store.updateStatus(req.params.id, status);
    if (!appt) return res.status(404).json({ error: 'not_found' });
    res.json(appt);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = app;
