require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const https = require('https');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

// Force explicit CORS headers on ALL requests (prevents browser fetch blocks)
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

// Initialize Stripe API safely
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY) 
  : null;

// Database Connection & Table Auto-Creation
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
            stripe_customer_id VARCHAR(255),
            stripe_payment_method_id VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        console.log('✅ Appointments table verified/created in database.');
      } catch (tableErr) {
        console.error('⚠️ Table creation notice:', tableErr.message);
      } finally {
        client.release();
      }
    })
    .catch(err => console.error('⚠️ DB Connection Error:', err.message));
}

const inMemoryAppointments = [];

// Health & Root Endpoints
app.get('/', (req, res) => res.status(200).send('Le Salon NYC API Server Active'));
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/api/health', (req, res) => res.status(200).send('OK'));

// Brevo Email Dispatch
async function sendBrevoEmail({ to, subject, htmlContent }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.SENDER_EMAIL || process.env.SMTP_EMAIL || 'umarfarhan442@gmail.com';
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SALON_NOTIFICATION_EMAIL || senderEmail;

  if (!apiKey) {
    console.error('❌ BREVO ERROR: BREVO_API_KEY environment variable is missing.');
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
          console.log(`✅ Brevo notification delivered to ${to} & Admin`);
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

// ROUTE 1: CREATE APPOINTMENT
app.post('/api/appointments', async (req, res) => {
  try {
    console.log('📥 Booking Request Received:', req.body);

    const full_name = req.body.full_name || req.body.fullName || 'Guest';
    const email = req.body.email || '';
    const phone = req.body.phone || '';
    const service_name = req.body.service_name || 'Salon Treatment';
    const starting_price = parseFloat(req.body.starting_price || req.body.price) || 75;
    const duration_minutes = parseInt(req.body.duration_minutes, 10) || 60;

    let date = req.body.date || new Date().toISOString().split('T')[0];
    let time = req.body.time || '10:00 AM';

    const cancellation_code = Math.random().toString(36).substring(2, 8).toUpperCase();

    let stripeCustomerId = null;
    let stripePaymentMethodId = null;

    if (stripe) {
      try {
        const customer = await stripe.customers.create({
          email: email.trim(),
          name: full_name.trim(),
          phone: phone ? phone.trim() : undefined,
        });
        stripeCustomerId = customer.id;
        console.log(`💳 Customer Created on Stripe: ${customer.id}`);
      } catch (stripeErr) {
        console.error('⚠️ Stripe customer creation note:', stripeErr.message);
      }
    }

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
      stripeCustomerId,
      stripePaymentMethodId,
      createdAt: new Date(),
    };

    if (pool) {
      try {
        const queryText = `
          INSERT INTO appointments 
          (cancellation_code, full_name, email, phone, service_name, starting_price, duration_minutes, date, time, status, stripe_customer_id, stripe_payment_method_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id;
        `;
        const values = [cancellation_code, full_name, email, phone, service_name, starting_price, duration_minutes, date, time, 'confirmed', stripeCustomerId, stripePaymentMethodId];
        const dbRes = await pool.query(queryText, values);
        newAppointment.id = dbRes.rows[0].id;
      } catch (dbErr) {
        console.error('❌ DB Insert Notice:', dbErr.message);
        newAppointment.id = Date.now().toString();
      }
    } else {
      newAppointment.id = Date.now().toString();
      inMemoryAppointments.push(newAppointment);
    }

    // Trigger email in background so user receives instant HTTP response
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #1a1a1a;">Le Salon NYC — Confirmation</h2>
        <p>Dear <strong>${full_name}</strong>,</p>
        <p>Your appointment has been successfully confirmed.</p>
        <div style="background-color: #fafafa; padding: 14px; border-radius: 6px; margin: 16px 0; border: 1px solid #e8e6e1;">
          <p style="margin: 4px 0;"><strong>Service:</strong> ${service_name}</p>
          <p style="margin: 4px 0;"><strong>Date & Time:</strong> ${date} at ${time}</p>
          <p style="margin: 4px 0;"><strong>Cancellation Code:</strong> <span style="font-size: 18px; font-weight: bold; color: #c59b27;">${cancellation_code}</span></p>
        </div>
      </div>
    `;

    sendBrevoEmail({
      to: email,
      subject: `Reservation Confirmed — Le Salon NYC (${cancellation_code})`,
      htmlContent: emailHtml,
    }).catch(err => console.error('❌ Brevo background error:', err));

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

// ROUTE 2: CANCEL APPOINTMENT
app.post('/api/cancel', async (req, res) => {
  try {
    const cancellation_code = req.body.cancellation_code || req.body.cancellationCode;
    const email = req.body.email;

    let apt = null;

    if (pool) {
      const dbRes = await pool.query(`SELECT * FROM appointments WHERE cancellation_code = $1 AND LOWER(email) = LOWER($2);`, [cancellation_code, email]);
      if (dbRes.rows.length > 0) {
        apt = dbRes.rows[0];
        apt.price = parseFloat(apt.starting_price);
        apt.stripeCustomerId = apt.stripe_customer_id;
        apt.stripePaymentMethodId = apt.stripe_payment_method_id;
      }
    } else {
      const idx = inMemoryAppointments.findIndex(a => a.cancellation_code === cancellation_code && a.email.toLowerCase() === email.toLowerCase());
      if (idx !== -1) apt = inMemoryAppointments[idx];
    }

    if (!apt) return res.status(404).json({ error: 'Matching reservation not found.' });

    const appointmentDateTime = new Date(`${apt.date} ${apt.time}`);
    const hoursDifference = (appointmentDateTime - new Date()) / (1000 * 60 * 60);

    let feeCharged = 0;
    if (hoursDifference < 24 && apt.stripeCustomerId && apt.stripePaymentMethodId && stripe) {
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round((apt.price * 0.5) * 100),
          currency: 'usd',
          customer: apt.stripeCustomerId,
          payment_method: apt.stripePaymentMethodId,
          off_session: true,
          confirm: true,
          description: `Late Cancellation Fee (50%) - Ref: ${apt.cancellation_code}`,
        });

        if (paymentIntent.status === 'succeeded') feeCharged = apt.price * 0.5;
      } catch (stripeErr) {
        console.error('❌ Penalty Charge Notice:', stripeErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Canceled successfully.',
      feeCharged,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Le Salon NYC Server running on port ${PORT}`));