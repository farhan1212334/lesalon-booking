require('dotenv').config();
const express = require('express');
const cors = require('cors');
const https = require('https');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

// Global process crash prevention
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection:', reason);
});

// Enable CORS Preflight Headers
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

// Database Pool with Safe Timeout & Memory Fallback
let pool = null;
if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 4000,
      idleTimeoutMillis: 8000,
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
          console.error('⚠️ Table query notice:', tableErr.message);
        } finally {
          client.release();
        }
      })
      .catch(err => {
        console.error('⚠️ DB Connection notice (falling back to memory):', err.message);
        pool = null;
      });
  } catch (err) {
    console.error('⚠️ DB Pool Init error:', err.message);
    pool = null;
  }
}

const inMemoryAppointments = [];

// Health Check Endpoints
app.get('/', (req, res) => res.status(200).send('Le Salon NYC Backend Active'));
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/api/health', (req, res) => res.status(200).send('OK'));

// Non-Blocking Brevo Email Dispatcher
function sendBrevoEmailAsync({ to, subject, htmlContent }) {
  setTimeout(() => {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.SENDER_EMAIL || process.env.SMTP_EMAIL || 'umarfarhan442@gmail.com';
    const adminEmail = process.env.ADMIN_EMAIL || process.env.SALON_NOTIFICATION_EMAIL || senderEmail;

    if (!apiKey) {
      console.error('❌ BREVO ERROR: BREVO_API_KEY environment variable missing.');
      return;
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
      timeout: 5000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ Brevo email delivered to ${to}`);
        } else {
          console.error(`❌ Brevo API Error [HTTP ${res.statusCode}]:`, body);
        }
      });
    });

    req.on('error', (err) => console.error('❌ Brevo Request Error:', err.message));
    req.write(payload);
    req.end();
  }, 0);
}

// ROUTE 1: GET BOOKED SLOTS
app.get('/api/booked-slots', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Date parameter required.' });

  try {
    let bookedTimes = [];
    if (pool) {
      try {
        const dbRes = await pool.query(
          `SELECT time FROM appointments WHERE date = $1 AND status = 'confirmed';`,
          [date]
        );
        bookedTimes = dbRes.rows.map(r => r.time);
      } catch (dbErr) {
        bookedTimes = inMemoryAppointments.filter(a => a.date === date && a.status === 'confirmed').map(a => a.time);
      }
    } else {
      bookedTimes = inMemoryAppointments.filter(a => a.date === date && a.status === 'confirmed').map(a => a.time);
    }
    return res.status(200).json({ bookedSlots: bookedTimes });
  } catch (err) {
    return res.status(200).json({ bookedSlots: [] });
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
      try {
        const queryText = `
          INSERT INTO appointments 
          (cancellation_code, full_name, email, phone, service_name, starting_price, duration_minutes, date, time, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id;
        `;
        const values = [cancellation_code, full_name, email, phone, service_name, starting_price, duration_minutes, date, time, 'confirmed'];
        const dbRes = await pool.query(queryText, values);
        newAppointment.id = dbRes.rows[0].id;
      } catch (dbErr) {
        console.error('⚠️ DB Insert fallback:', dbErr.message);
        newAppointment.id = Date.now().toString();
        inMemoryAppointments.push(newAppointment);
      }
    } else {
      newAppointment.id = Date.now().toString();
      inMemoryAppointments.push(newAppointment);
    }

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 24px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e8e6e1; border-radius: 8px;">
        <h2 style="color: #1a1a1a; margin-top: 0;">Le Salon NYC — Reservation Confirmed</h2>
        <p>Dear <strong>${full_name}</strong>,</p>
        <p>Your appointment has been successfully scheduled:</p>
        <div style="background-color: #faf9f6; padding: 16px; border-radius: 6px; margin: 16px 0; border: 1px solid #e8e6e1;">
          <p style="margin: 6px 0;"><strong>Service:</strong> ${service_name}</p>
          <p style="margin: 6px 0;"><strong>Date & Time:</strong> ${date} at ${time}</p>
          <p style="margin: 6px 0;"><strong>Price:</strong> $${starting_price}</p>
          <p style="margin: 10px 0 0 0;"><strong>Cancellation Code:</strong> <span style="font-size: 18px; font-weight: bold; color: #c59b27; font-family: monospace;">${cancellation_code}</span></p>
        </div>
      </div>
    `;

    sendBrevoEmailAsync({
      to: email,
      subject: `Reservation Confirmed — Le Salon NYC (${cancellation_code})`,
      htmlContent: emailHtml,
    });

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

// ROUTE 3: CANCEL APPOINTMENT
app.post('/api/cancel', async (req, res) => {
  try {
    const cancellation_code = (req.body.cancellation_code || req.body.cancellationCode || '').trim().toUpperCase();
    const email = (req.body.email || '').trim().toLowerCase();

    if (!cancellation_code || !email) {
      return res.status(400).json({ error: 'Cancellation code and email are required.' });
    }

    let apt = null;

    if (pool) {
      try {
        const updateRes = await pool.query(
          `UPDATE appointments 
           SET status = 'canceled' 
           WHERE cancellation_code = $1 AND LOWER(email) = $2 AND status = 'confirmed' 
           RETURNING *;`,
          [cancellation_code, email]
        );
        if (updateRes.rows.length > 0) apt = updateRes.rows[0];
      } catch (err) {
        const idx = inMemoryAppointments.findIndex(a => a.cancellation_code === cancellation_code && a.email.toLowerCase() === email && a.status === 'confirmed');
        if (idx !== -1) {
          inMemoryAppointments[idx].status = 'canceled';
          apt = inMemoryAppointments[idx];
        }
      }
    } else {
      const idx = inMemoryAppointments.findIndex(a => a.cancellation_code === cancellation_code && a.email.toLowerCase() === email && a.status === 'confirmed');
      if (idx !== -1) {
        inMemoryAppointments[idx].status = 'canceled';
        apt = inMemoryAppointments[idx];
      }
    }

    if (!apt) {
      return res.status(404).json({ error: 'No active reservation found matching those details.' });
    }

    const cancelEmailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 24px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e8e6e1; border-radius: 8px;">
        <h2 style="color: #b91c1c; margin-top: 0;">Le Salon NYC — Reservation Canceled</h2>
        <p>Dear <strong>${apt.full_name}</strong>,</p>
        <p>Your reservation (Code: <strong>${cancellation_code}</strong>) for <strong>${apt.service_name}</strong> on <strong>${apt.date} at ${apt.time}</strong> has been canceled.</p>
        <p style="font-size: 0.85rem; color: #666;">This time slot has been released back into our active availability.</p>
      </div>
    `;

    sendBrevoEmailAsync({
      to: email,
      subject: `Reservation Canceled — Le Salon NYC (${cancellation_code})`,
      htmlContent: cancelEmailHtml,
    });

    return res.status(200).json({
      success: true,
      message: 'Reservation canceled successfully.',
      canceledAppointment: apt
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Le Salon NYC Server running on port ${PORT}`));