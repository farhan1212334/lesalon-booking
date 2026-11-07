require('dotenv').config();
const express = require('express');
const cors = require('cors');
const https = require('https');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, api-key');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(cors({ origin: '*' }));
app.use(express.json());

// Database Connection & Schema Setup
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  pool.connect()
    .then(async (client) => {
      console.log('✅ PostgreSQL DB Connected.');
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS appointments (
            id SERIAL PRIMARY KEY,
            cancellation_code VARCHAR(20) UNIQUE NOT NULL,
            full_name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            service_name VARCHAR(255) NOT NULL,
            starting_price NUMERIC(10, 2) NOT NULL,
            duration_minutes INT NOT NULL,
            date VARCHAR(50) NOT NULL,
            time VARCHAR(50) NOT NULL,
            status VARCHAR(50) DEFAULT 'confirmed',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        console.log('✅ Appointments table verified.');
      } catch (tableErr) {
        console.error('⚠️ Table verification notice:', tableErr.message);
      } finally {
        client.release();
      }
    })
    .catch(err => console.error('⚠️ DB Connection Error:', err.message));
}

const inMemoryAppointments = [];

// Health & Ping Endpoints
app.get('/', (req, res) => res.status(200).send('Le Salon NYC API Active'));
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/api/health', (req, res) => res.status(200).send('OK'));

// Brevo Email Handler
async function sendBrevoEmail({ to, subject, htmlContent }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.SENDER_EMAIL || process.env.SMTP_EMAIL || 'umarfarhan442@gmail.com';
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SALON_NOTIFICATION_EMAIL || senderEmail;

  if (!apiKey) {
    console.error('❌ BREVO ERROR: BREVO_API_KEY environment variable missing.');
    return false;
  }

  const recipients = [{ email: to }];
  if (adminEmail && adminEmail.toLowerCase() !== to.toLowerCase()) {
    recipients.push({ email: adminEmail });
  }

  const payload = JSON.stringify({
    sender: { name: 'Le Salon NYC', email: senderEmail },
    to: recipients,
    subject: subject,
    htmlContent: htmlContent,
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.brevo.com',
      port: 443,
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 8000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ Brevo notification sent to ${to}`);
          resolve(true);
        } else {
          console.error(`❌ Brevo API Error [HTTP ${res.statusCode}]:`, body);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Brevo Network Error:', err.message);
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

// ROUTE 1: GET BOOKED SLOTS FOR A SPECIFIC DATE
app.get('/api/booked-slots', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Date query parameter is required.' });

  try {
    let bookedTimes = [];
    if (pool) {
      const dbRes = await pool.query(
        `SELECT time FROM appointments WHERE date = $1 AND status = 'confirmed';`,
        [date]
      );
      bookedTimes = dbRes.rows.map(r => r.time);
    } else {
      bookedTimes = inMemoryAppointments
        .filter(a => a.date === date && a.status === 'confirmed')
        .map(a => a.time);
    }
    return res.status(200).json({ bookedSlots: bookedTimes });
  } catch (err) {
    console.error('❌ Error fetching booked slots:', err.message);
    return res.status(500).json({ bookedSlots: [] });
  }
});

// ROUTE 2: CREATE APPOINTMENT
app.post('/api/appointments', async (req, res) => {
  try {
    const full_name = req.body.full_name || req.body.fullName || 'Guest';
    const email = req.body.email || '';
    const phone = req.body.phone || '';
    const service_name = req.body.service_name || 'Salon Treatment';
    const starting_price = parseFloat(req.body.starting_price || req.body.price) || 75;
    const duration_minutes = parseInt(req.body.duration_minutes, 10) || 60;
    const date = req.body.date || new Date().toISOString().split('T')[0];
    const time = req.body.time || '10:00 AM';

    // Check if slot is already booked
    if (pool) {
      const existing = await pool.query(
        `SELECT id FROM appointments WHERE date = $1 AND time = $2 AND status = 'confirmed';`,
        [date, time]
      );
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'This time slot was just booked by another guest. Please select another time.' });
      }
    }

    const cancellation_code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const newAppointment = {
      cancellation_code,
      cancellationCode: cancellation_code,
      full_name,
      email,
      phone,
      service_name,
      starting_price,
      duration_minutes,
      date,
      time,
      status: 'confirmed',
      createdAt: new Date(),
    };

    if (pool) {
      const queryText = `
        INSERT INTO appointments 
        (cancellation_code, full_name, email, phone, service_name, starting_price, duration_minutes, date, time, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id;
      `;
      const values = [cancellation_code, full_name, email, phone, service_name, starting_price, duration_minutes, date, time, 'confirmed'];
      const dbRes = await pool.query(queryText, values);
      newAppointment.id = dbRes.rows[0].id;
    } else {
      newAppointment.id = Date.now().toString();
      inMemoryAppointments.push(newAppointment);
    }

    // Confirmation Email Body
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 24px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e8e6e1; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #1a1a1a; margin-top: 0;">Le Salon NYC — Reservation Confirmed</h2>
        <p>Dear <strong>${full_name}</strong>,</p>
        <p>Your appointment has been successfully scheduled. Here are your reservation details:</p>
        <div style="background-color: #faf9f6; padding: 16px; border-radius: 6px; margin: 16px 0; border: 1px solid #e8e6e1;">
          <p style="margin: 6px 0;"><strong>Service:</strong> ${service_name}</p>
          <p style="margin: 6px 0;"><strong>Date & Time:</strong> ${date} at ${time}</p>
          <p style="margin: 6px 0;"><strong>Duration:</strong> ${duration_minutes} Minutes</p>
          <p style="margin: 6px 0;"><strong>Starting Price:</strong> $${starting_price}</p>
          <p style="margin: 10px 0 0 0;"><strong>Cancellation Code:</strong> <span style="font-size: 18px; font-weight: bold; color: #c59b27; font-family: monospace;">${cancellation_code}</span></p>
        </div>
        <p style="font-size: 0.85rem; color: #666;">Keep your cancellation code safe. You can manage or cancel your appointment anytime up to 24 hours prior.</p>
      </div>
    `;

    sendBrevoEmail({
      to: email,
      subject: `Reservation Confirmed — Le Salon NYC (${cancellation_code})`,
      htmlContent: emailHtml,
    }).catch(err => console.error('❌ Brevo async error:', err));

    return res.status(200).json({
      success: true,
      status: 'confirmed',
      cancellation_code,
      cancellationCode: cancellation_code,
      appointment: newAppointment,
      ...newAppointment
    });
  } catch (error) {
    console.error('❌ Server Error during booking:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ROUTE 3: CANCEL APPOINTMENT & FREE THE TIME SLOT
app.post('/api/cancel', async (req, res) => {
  try {
    const cancellation_code = (req.body.cancellation_code || req.body.cancellationCode || '').trim().toUpperCase();
    const email = (req.body.email || '').trim().toLowerCase();

    if (!cancellation_code || !email) {
      return res.status(400).json({ error: 'Cancellation code and email are required.' });
    }

    let apt = null;

    if (pool) {
      const updateRes = await pool.query(
        `UPDATE appointments 
         SET status = 'canceled' 
         WHERE cancellation_code = $1 AND LOWER(email) = $2 AND status = 'confirmed' 
         RETURNING *;`,
        [cancellation_code, email]
      );
      if (updateRes.rows.length > 0) {
        apt = updateRes.rows[0];
      }
    } else {
      const idx = inMemoryAppointments.findIndex(
        a => a.cancellation_code === cancellation_code && a.email.toLowerCase() === email && a.status === 'confirmed'
      );
      if (idx !== -1) {
        inMemoryAppointments[idx].status = 'canceled';
        apt = inMemoryAppointments[idx];
      }
    }

    if (!apt) {
      return res.status(444 || 404).json({ error: 'No active reservation found with that reference code and email.' });
    }

    // Cancellation Email Body
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 24px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e8e6e1; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #b91c1c; margin-top: 0;">Le Salon NYC — Reservation Canceled</h2>
        <p>Dear <strong>${apt.full_name}</strong>,</p>
        <p>Your reservation (Code: <strong>${cancellation_code}</strong>) for <strong>${apt.service_name}</strong> on <strong>${apt.date} at ${apt.time}</strong> has been successfully canceled.</p>
        <p style="font-size: 0.85rem; color: #666;">This time slot has been released back into our scheduling system.</p>
      </div>
    `;

    sendBrevoEmail({
      to: email,
      subject: `Reservation Canceled — Le Salon NYC (${cancellation_code})`,
      htmlContent: emailHtml,
    }).catch(err => console.error('❌ Brevo cancel email error:', err));

    return res.status(200).json({
      success: true,
      message: 'Reservation canceled successfully. Time slot has been freed.',
      canceledAppointment: apt
    });
  } catch (error) {
    console.error('❌ Server error during cancellation:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Le Salon NYC Backend running on port ${PORT}`));