require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const DB_POOL_MAX = Number(process.env.PG_POOL_MAX) || 2;
const TIME_ZONE = 'America/New_York';
const BOOKING_HORIZON_DAYS = 90;
const STYLISTS = [
  { id: 'ashraf', name: 'Ashraf' },
  { id: 'ricardo', name: 'Ricardo' },
];
const SERVICES = [
  { id: 1, name: 'Shampoo haircut and blow dry', price: 75, duration: 75 },
  { id: 2, name: 'Shampoo and blow dry', price: 40, duration: 45 },
  { id: 3, name: 'Barber Haircut', price: 40, duration: 45 },
  { id: 4, name: 'Single process color', price: 100, duration: 75 },
  { id: 5, name: 'Single process color and blow dry', price: 130, duration: 120 },
  { id: 6, name: 'Single process and full head of highlights', price: 330, duration: 150 },
  { id: 7, name: 'Single process with full head of highlights and blow dry', price: 380, duration: 180 },
  { id: 8, name: 'Full head highlights', price: 250, duration: 120 },
  { id: 9, name: 'Full head highlights and blow dry', price: 290, duration: 150 },
  { id: 10, name: 'Half head highlights', price: 180, duration: 90 },
  { id: 11, name: 'Half head highlights and blow dry', price: 220, duration: 120 },
  { id: 12, name: 'Hair treatment', price: 35, duration: 45 },
  { id: 13, name: 'Organic Perm', price: 150, duration: 120 },
  { id: 14, name: 'Makeup', price: null, duration: 60 },
  { id: 15, name: 'Keratin Protein Treatment', price: null, duration: 120 },
];

app.use(express.json({ limit: '20kb' }));

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. The API will not start without its database.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: DB_POOL_MAX,
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error.message);
});

function getTimeZoneParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function getSalonDate(date = new Date()) {
  const parts = getTimeZoneParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getDayOfWeek(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validateBookableDate(dateString) {
  if (!isValidDateString(dateString)) return 'Choose a valid appointment date.';
  const today = getSalonDate();
  if (dateString < today) return 'Appointments cannot be booked in the past.';
  if (dateString > addDays(today, BOOKING_HORIZON_DAYS)) {
    return `Appointments can only be booked up to ${BOOKING_HORIZON_DAYS} days ahead.`;
  }
  if (getDayOfWeek(dateString) === 0) return 'The salon is closed on Sundays.';
  return null;
}

function formatTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function parseTime(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hour += 12;
  return hour * 60 + Number(match[2]);
}

function getSchedule(dateString, duration) {
  const day = getDayOfWeek(dateString);
  if (day === 0) return [];
  const opening = 10 * 60;
  const closing = (day === 6 ? 18 : 20) * 60;
  const slots = [];
  for (let start = opening; start + duration <= closing; start += 30) {
    slots.push({
      start: formatTime(start),
      end: formatTime(start + duration),
      startMinute: start,
      endMinute: start + duration,
    });
  }
  return slots;
}

function getCurrentSalonMinutes() {
  const parts = getTimeZoneParts();
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function validateSlot(dateString, startTime, duration) {
  const dateError = validateBookableDate(dateString);
  if (dateError) return dateError;
  const slots = getSchedule(dateString, duration);
  const slot = slots.find((candidate) => candidate.start === startTime);
  if (!slot) return 'That appointment time is outside the salon schedule.';
  if (dateString === getSalonDate() && slot.startMinute <= getCurrentSalonMinutes()) {
    return 'Choose an appointment time that has not passed in New York.';
  }
  return null;
}

function getServiceSelection(serviceIds) {
  if (!Array.isArray(serviceIds) || serviceIds.length === 0 || serviceIds.length > SERVICES.length) {
    return null;
  }
  if (serviceIds.some((id) => !Number.isInteger(id)) || new Set(serviceIds).size !== serviceIds.length) {
    return null;
  }
  const services = serviceIds.map((id) => SERVICES.find((service) => service.id === id));
  if (services.some((service) => !service)) return null;
  return {
    services,
    duration: services.reduce((total, service) => total + service.duration, 0),
    price: services.reduce((total, service) => total + (service.price || 0), 0),
    consultationRequired: services.some((service) => service.price === null),
    names: services.map((service) => service.name),
  };
}

function normalizeGuest(body) {
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  if (fullName.length < 2 || fullName.length > 255) return { error: 'Enter a name between 2 and 255 characters.' };
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Enter a valid email address.' };
  }
  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 10 || phoneDigits.length > 15) return { error: 'Enter a valid phone number.' };
  if (notes.length > 500) return { error: 'Special requests must be 500 characters or fewer.' };
  return { fullName, email, phone, notes };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

async function sendBrevoEmail({ to, subject, htmlContent }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.SENDER_EMAIL || process.env.SMTP_EMAIL;
  const replyToEmail = process.env.REPLY_TO_EMAIL ||
    process.env.ADMIN_EMAIL ||
    process.env.SALON_NOTIFICATION_EMAIL;
  if (!apiKey || !senderEmail) {
    throw new Error('Missing BREVO_API_KEY or SENDER_EMAIL in the backend environment.');
  }

  const payload = {
    sender: { name: 'Le Salon NYC — Test Booking', email: senderEmail },
    to: [{ email: to }],
    subject,
    htmlContent,
  };
  if (replyToEmail) payload.replyTo = { email: replyToEmail };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const responseBody = await response.text();
    if (!response.ok) {
      let details = responseBody;
      try {
        const parsed = JSON.parse(responseBody);
        details = parsed.message || parsed.code || responseBody;
      } catch {
        // Keep Brevo's response text when it is not JSON.
      }
      throw new Error(`Brevo rejected the email (HTTP ${response.status}): ${String(details).slice(0, 300)}`);
    }
    return { accepted: true };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendBookingEmails(appointment) {
  const adminEmail = (process.env.ADMIN_EMAIL || process.env.SALON_NOTIFICATION_EMAIL || '')
    .trim()
    .toLowerCase();
  const customerName = escapeHtml(appointment.fullName);
  const serviceNames = escapeHtml(appointment.serviceNames.join(', '));
  const stylistName = escapeHtml(appointment.stylistName);
  const date = escapeHtml(appointment.date);
  const startTime = escapeHtml(appointment.startTime);
  const endTime = escapeHtml(appointment.endTime);
  const referenceCode = escapeHtml(appointment.referenceCode);
  const price = appointment.consultationRequired
    ? `$${appointment.price} + consultation`
    : `$${appointment.price}`;
  const customerHtml = `
    <div style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:auto;padding:24px">
      <h2>Le Salon NYC — Test Reservation</h2>
      <p>Hello ${customerName},</p>
      <p>Your test appointment has been saved.</p>
      <p><strong>Services:</strong> ${serviceNames}<br>
      <strong>Stylist:</strong> ${stylistName}<br>
      <strong>Date:</strong> ${date}<br>
      <strong>Time:</strong> ${startTime} – ${endTime} (New York time)<br>
      <strong>Estimate:</strong> ${price}<br>
      <strong>Reference code:</strong> ${referenceCode}</p>
      <p>Use your reference code and email address to cancel this test booking.</p>
    </div>`;
  const salonHtml = `
    <div style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:auto;padding:24px">
      <h2>New test reservation</h2>
      <p><strong>Customer:</strong> ${customerName}<br>
      <strong>Email:</strong> ${escapeHtml(appointment.email)}<br>
      <strong>Phone:</strong> ${escapeHtml(appointment.phone)}<br>
      <strong>Services:</strong> ${serviceNames}<br>
      <strong>Stylist:</strong> ${stylistName}<br>
      <strong>Date and time:</strong> ${date}, ${startTime} – ${endTime} (New York time)<br>
      <strong>Notes:</strong> ${escapeHtml(appointment.notes || 'None')}<br>
      <strong>Reference code:</strong> ${referenceCode}</p>
    </div>`;

  const deliveries = [
    {
      recipient: 'customer',
      send: () => sendBrevoEmail({
        to: appointment.email,
        subject: `Test booking received — ${appointment.referenceCode}`,
        htmlContent: customerHtml,
      }),
    },
    {
      recipient: 'admin',
      send: () => adminEmail
        ? sendBrevoEmail({
          to: adminEmail,
          subject: `New test booking — ${appointment.referenceCode}`,
          htmlContent: salonHtml,
        })
        : Promise.reject(new Error('ADMIN_EMAIL is not set in the Render environment.')),
    },
  ];
  const results = await Promise.all(deliveries.map(async ({ recipient, send }) => {
    try {
      await send();
      console.info(`Brevo accepted ${recipient} booking email for reference ${appointment.referenceCode}.`);
      return { recipient, accepted: true };
    } catch (error) {
      console.error(`Brevo ${recipient} booking email failed for reference ${appointment.referenceCode}:`, error.message);
      return { recipient, accepted: false, error: error.message };
    }
  }));
  const customer = results.find((result) => result.recipient === 'customer');
  const admin = results.find((result) => result.recipient === 'admin');
  const failures = results.filter((result) => !result.accepted);
  return {
    sent: failures.length === 0,
    customer: { accepted: customer.accepted, error: customer.error },
    admin: { accepted: admin.accepted, error: admin.error },
    message: failures.length === 0 ? undefined : 'Booking saved, but one or more emails were not accepted by Brevo.',
  };
}

function formatAppointment(row) {
  return {
    id: row.id,
    referenceCode: row.reference_code,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    serviceIds: row.service_ids,
    serviceNames: row.service_names,
    price: Number(row.starting_price),
    consultationRequired: row.consultation_required,
    duration: row.duration_minutes,
    stylistId: row.stylist_id,
    stylistName: STYLISTS.find((stylist) => stylist.id === row.stylist_id)?.name || row.stylist_id,
    date: row.appointment_date,
    startTime: formatTime(row.start_minute),
    endTime: formatTime(row.end_minute),
    status: row.status,
  };
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_appointments (
      id BIGSERIAL PRIMARY KEY,
      reference_code VARCHAR(16) NOT NULL UNIQUE,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(320) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      notes VARCHAR(500) NOT NULL DEFAULT '',
      service_ids INTEGER[] NOT NULL,
      service_names TEXT[] NOT NULL,
      starting_price NUMERIC(10, 2) NOT NULL,
      consultation_required BOOLEAN NOT NULL DEFAULT FALSE,
      duration_minutes INTEGER NOT NULL,
      stylist_id VARCHAR(32) NOT NULL,
      appointment_date DATE NOT NULL,
      start_minute INTEGER NOT NULL,
      end_minute INTEGER NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'confirmed'
        CHECK (status IN ('confirmed', 'canceled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (start_minute >= 0 AND end_minute > start_minute AND end_minute <= 1440)
    );
    CREATE INDEX IF NOT EXISTS booking_appointments_date_status_idx
      ON booking_appointments (appointment_date, status);
  `);
  console.log('Connected to PostgreSQL; booking table is ready.');
}

let databaseInitialization;

function ensureDatabaseInitialized() {
  if (!databaseInitialization) {
    databaseInitialization = initializeDatabase().catch((error) => {
      databaseInitialization = undefined;
      throw error;
    });
  }
  return databaseInitialization;
}

async function healthCheck(_req, res) {
  try {
    await pool.query('SELECT 1');
    const senderConfigured = Boolean(process.env.SENDER_EMAIL || process.env.SMTP_EMAIL);
    const adminConfigured = Boolean(process.env.ADMIN_EMAIL || process.env.SALON_NOTIFICATION_EMAIL);
    const emailConfigured = Boolean(process.env.BREVO_API_KEY && senderConfigured && adminConfigured);
    res.status(200).json({
      status: 'ok',
      database: 'connected',
      email: {
        configured: emailConfigured,
        apiKeyConfigured: Boolean(process.env.BREVO_API_KEY),
        senderConfigured,
        adminConfigured,
      },
    });
  } catch (error) {
    console.error('Health check database query failed:', error.message);
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
}

app.get('/', (_req, res) => res.status(200).send('Le Salon NYC booking API is running.'));
app.get('/health', healthCheck);
app.get('/api/health', healthCheck);

async function availabilityHandler(req, res) {
  const { date, stylistId = 'any' } = req.query;
  const duration = Number(req.query.duration || 30);
  const dateError = validateBookableDate(date);
  if (dateError) return res.status(400).json({ error: dateError });
  if (!Number.isInteger(duration) || duration < 1 || duration > 600) {
    return res.status(400).json({ error: 'A valid appointment duration is required.' });
  }
  if (stylistId !== 'any' && !STYLISTS.some((stylist) => stylist.id === stylistId)) {
    return res.status(400).json({ error: 'Choose a valid stylist.' });
  }

  try {
    const result = await pool.query(
      `SELECT stylist_id, start_minute, end_minute
       FROM booking_appointments
       WHERE appointment_date = $1 AND status = 'confirmed';`,
      [date]
    );
    const schedule = getSchedule(date, duration).filter((slot) =>
      date !== getSalonDate() || slot.startMinute > getCurrentSalonMinutes()
    );
    const relevantStylists = stylistId === 'any' ? STYLISTS.map(({ id }) => id) : [stylistId];
    const bookedSlots = schedule
      .filter((slot) => {
        const availableForSomeStylist = relevantStylists.some((id) => !result.rows.some((appointment) =>
          appointment.stylist_id === id &&
          appointment.start_minute < slot.endMinute &&
          appointment.end_minute > slot.startMinute
        ));
        return !availableForSomeStylist;
      })
      .map((slot) => slot.start);
    return res.status(200).json({ bookedSlots });
  } catch (error) {
    console.error('Availability query failed:', error.message);
    return res.status(503).json({ error: 'Availability is temporarily unavailable. Please try again.' });
  }
}

app.get('/api/availability', availabilityHandler);
app.get('/api/booked-slots', availabilityHandler);

app.post('/api/appointments', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const guest = normalizeGuest(body);
  if (guest.error) return res.status(400).json({ error: guest.error });
  if (body.acceptedPolicies !== true) {
    return res.status(400).json({ error: 'Please accept the reservation policies.' });
  }
  const selection = getServiceSelection(body.serviceIds);
  if (!selection) return res.status(400).json({ error: 'Choose one or more valid services.' });

  const stylistId = body.stylistId;
  if (stylistId !== 'any' && !STYLISTS.some((stylist) => stylist.id === stylistId)) {
    return res.status(400).json({ error: 'Choose a valid stylist.' });
  }
  const { date, startTime } = body;
  const slotError = validateSlot(date, startTime, selection.duration);
  if (slotError) return res.status(400).json({ error: slotError });
  const startMinute = parseTime(startTime);
  const endMinute = startMinute + selection.duration;
  const candidates = stylistId === 'any'
    ? STYLISTS.map(({ id }) => id).sort()
    : [stylistId];
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    for (const candidate of candidates) {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2));',
        [date, candidate]
      );
    }

    let assignedStylistId = null;
    for (const candidate of candidates) {
      const overlap = await client.query(
        `SELECT 1 FROM booking_appointments
         WHERE appointment_date = $1 AND stylist_id = $2 AND status = 'confirmed'
           AND start_minute < $3 AND end_minute > $4
         LIMIT 1;`,
        [date, candidate, endMinute, startMinute]
      );
      if (overlap.rowCount === 0) {
        assignedStylistId = candidate;
        break;
      }
    }
    if (!assignedStylistId) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'That time was just booked. Please choose another available time.' });
    }

    const referenceCode = crypto.randomBytes(5).toString('hex').toUpperCase();
    const inserted = await client.query(
      `INSERT INTO booking_appointments
        (reference_code, full_name, email, phone, notes, service_ids, service_names,
         starting_price, consultation_required, duration_minutes, stylist_id,
         appointment_date, start_minute, end_minute)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *;`,
      [
        referenceCode,
        guest.fullName,
        guest.email,
        guest.phone,
        guest.notes,
        selection.services.map(({ id }) => id),
        selection.names,
        selection.price,
        selection.consultationRequired,
        selection.duration,
        assignedStylistId,
        date,
        startMinute,
        endMinute,
      ]
    );
    await client.query('COMMIT');

    const appointment = formatAppointment(inserted.rows[0]);
    const emailStatus = await sendBookingEmails(appointment);
    return res.status(201).json({
      success: true,
      appointment,
      emailStatus,
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Booking transaction rollback failed:', rollbackError.message);
    }
    console.error('Appointment creation failed:', error.message);
    return res.status(500).json({ error: 'The booking could not be completed. Please try again.' });
  } finally {
    if (client) client.release();
  }
});

app.post('/api/cancel', async (req, res) => {
  const referenceCode = typeof req.body?.referenceCode === 'string'
    ? req.body.referenceCode.trim().toUpperCase()
    : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!/^[A-F0-9]{10}$/.test(referenceCode) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid reference code and email address.' });
  }

  try {
    const result = await pool.query(
      `UPDATE booking_appointments
       SET status = 'canceled'
       WHERE reference_code = $1 AND LOWER(email) = $2 AND status = 'confirmed'
       RETURNING *;`,
      [referenceCode, email]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'No active reservation matches that reference code and email.' });
    }

    const appointment = formatAppointment(result.rows[0]);
    let emailStatus;
    try {
      await sendBrevoEmail({
        to: appointment.email,
        subject: `Test booking canceled — ${appointment.referenceCode}`,
        htmlContent: `
          <div style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:auto;padding:24px">
            <h2>Le Salon NYC — Test Reservation Canceled</h2>
            <p>Hello ${escapeHtml(appointment.fullName)}, your test reservation has been canceled.</p>
            <p><strong>Services:</strong> ${escapeHtml(appointment.serviceNames.join(', '))}<br>
            <strong>Date and time:</strong> ${escapeHtml(appointment.date)}, ${escapeHtml(appointment.startTime)} – ${escapeHtml(appointment.endTime)} (New York time)<br>
            <strong>Reference code:</strong> ${escapeHtml(appointment.referenceCode)}</p>
          </div>`,
      });
      emailStatus = { sent: true, customer: { accepted: true } };
    } catch (error) {
      console.error(`Brevo cancellation email failed for reference ${appointment.referenceCode}:`, error.message);
      emailStatus = {
        sent: false,
        customer: { accepted: false, error: error.message },
        message: 'Cancellation saved, but Brevo did not accept the email.',
      };
    }
    return res.status(200).json({
      success: true,
      message: 'Reservation canceled successfully.',
      appointment,
      emailStatus,
    });
  } catch (error) {
    console.error('Appointment cancellation failed:', error.message);
    return res.status(500).json({ error: 'The reservation could not be canceled. Please try again.' });
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'Request body must be valid JSON.' });
  }
  console.error('Unhandled request error:', error.message);
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
});

async function startServer() {
  try {
    await ensureDatabaseInitialized();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Le Salon NYC test booking API listening on port ${PORT}.`);
    });
  } catch (error) {
    console.error('API startup failed; check DATABASE_URL and database availability:', error.message);
    process.exitCode = 1;
    await pool.end();
  }
}

async function handleServerlessRequest(req, res) {
  try {
    await ensureDatabaseInitialized();
  } catch (error) {
    console.error('API request could not initialize PostgreSQL:', error.message);
    return res.status(503).json({ error: 'Booking service is temporarily unavailable. Please try again.' });
  }
  return app(req, res);
}

module.exports = { app, handleServerlessRequest, startServer };

if (require.main === module) {
  startServer();
}
