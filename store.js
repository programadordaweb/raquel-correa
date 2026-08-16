// Simple local JSON-file "database" for appointments.
// Fine for a single-practitioner booking volume — no external service needed.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'appointments.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');

let appointments = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

function persist() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(appointments, null, 2), 'utf8');
}

function getAll() {
  return appointments;
}

function getSlotsForDate(apptDate) {
  return appointments
    .filter((a) => a.apptDate === apptDate)
    .map((a) => a.apptTime);
}

function isSlotTaken(apptDate, apptTime) {
  return appointments.some((a) => a.apptDate === apptDate && a.apptTime === apptTime);
}

function create({ name, phone, email, notes, apptDate, apptTime }) {
  if (isSlotTaken(apptDate, apptTime)) {
    const err = new Error('slot_taken');
    err.code = 'SLOT_TAKEN';
    throw err;
  }
  const appt = {
    id: crypto.randomUUID(),
    name,
    phone,
    email: email || null,
    notes: notes || null,
    apptDate,
    apptTime,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  appointments.push(appt);
  persist();
  return appt;
}

function updateStatus(id, status) {
  const appt = appointments.find((a) => a.id === id);
  if (!appt) return null;
  appt.status = status;
  persist();
  return appt;
}

module.exports = { getAll, getSlotsForDate, isSlotTaken, create, updateStatus };
