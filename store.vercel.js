// Postgres-backed store — used on Vercel, which has no persistent local
// filesystem. Requires a Postgres database connected in the Vercel dashboard
// (Storage tab -> Neon), which auto-injects a connection string env var.
// Vercel's Neon integration has used a few different env var names over
// time, so we check the common ones.

const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

// Lazily created — requiring this module must NEVER throw, even if the
// database isn't connected yet, because on Vercel every request (including
// plain page loads) routes through the same function. If neon() were
// called eagerly at module-load time with a missing connection string, a
// misconfigured/not-yet-connected database would crash the entire site,
// not just the booking API.
let sql = null;
function getSql() {
  if (!sql) {
    const connectionString =
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.DATABASE_URL_UNPOOLED;
    if (!connectionString) {
      throw new Error('Nenhuma variável de conexão com o Postgres encontrada (DATABASE_URL / POSTGRES_URL). Conecte um banco em Vercel > Storage e faça o redeploy.');
    }
    sql = neon(connectionString);
  }
  return sql;
}

let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    const sql = getSql();
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        notes TEXT,
        appt_date DATE NOT NULL,
        appt_time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (appt_date, appt_time)
      );
    `;
  }
  return tableReady;
}

function toApi(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    apptDate: row.appt_date.toISOString().slice(0, 10),
    apptTime: row.appt_time,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

async function getAll() {
  await ensureTable();
  const rows = await sql`SELECT * FROM appointments ORDER BY appt_date, appt_time`;
  return rows.map(toApi);
}

async function getSlotsForDate(apptDate) {
  await ensureTable();
  const rows = await sql`SELECT appt_time FROM appointments WHERE appt_date = ${apptDate}`;
  return rows.map((r) => r.appt_time);
}

async function create({ name, phone, email, notes, apptDate, apptTime }) {
  await ensureTable();
  const id = crypto.randomUUID();
  try {
    const rows = await sql`
      INSERT INTO appointments (id, name, phone, email, notes, appt_date, appt_time, status)
      VALUES (${id}, ${name}, ${phone}, ${email || null}, ${notes || null}, ${apptDate}, ${apptTime}, 'pending')
      RETURNING *;
    `;
    return toApi(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      const conflict = new Error('slot_taken');
      conflict.code = 'SLOT_TAKEN';
      throw conflict;
    }
    throw err;
  }
}

async function updateStatus(id, status) {
  await ensureTable();
  const rows = await sql`
    UPDATE appointments SET status = ${status} WHERE id = ${id} RETURNING *;
  `;
  return rows[0] ? toApi(rows[0]) : null;
}

module.exports = { getAll, getSlotsForDate, create, updateStatus };
