require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const https = require('https');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Stripe API
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY) 
  : null;

// Initialize PostgreSQL Pool (if DATABASE_URL exists in Render)
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  pool.connect()
    .then(client => {
      console.log('✅ PostgreSQL database connected successfully.');
      client.release();
      initDb();
    })
    .catch(err => console.error('⚠️ PostgreSQL connection warning:', err.message));
} else {
  console.log('ℹ️ Running with in-memory storage fallback.');
}

// In-Memory Database Fallback
const inMemoryAppointments = [];

// Initialize Database Table Schema
async function initDb() {
  if (!pool) return;
  const queryText = `
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      cancellation_code VARCHAR(10) UNIQUE NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      service_name VARCHAR(255) NOT NULL,
      starting_price NUMERIC(10, 2) NOT NULL,
      duration_minutes INT DEFAULT 60,
      start_time TIMESTAMP WITH TIME ZONE,
      date VARCHAR(50) NOT NULL,
      time VARCHAR(50) NOT NULL,
      status VARCHAR(50) DEFAULT 'confirmed',
      stripe_customer_id VARCHAR(255),
      stripe_payment_method_id VARCHAR(255),
      fee_charged NUMERIC(10, 2) DEFAULT 0.00,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(queryText);
    console.log('✅ Appointments table aligned in PostgreSQL database.');
  } catch (err) {
    console.error('❌ Error initializing database table:', err.message);
  }
}

// Global CORS Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

// Helper Function: Dual Brevo Email Delivery (Sends to BOTH Customer and Admin)
async function sendBrevoEmail({ to, subject, htmlContent }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.SENDER_EMAIL || 'info@lesalonnyc.com';
  const adminEmail = process.env.ADMIN_EMAIL || senderEmail;

  if (!apiKey) {
    console.log('⚠️ BREVO NOTICE: BREVO_API_KEY environment variable is missing.');
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
      timeout: 6000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ Brevo notification delivered to ${to} & Admin`);
          resolve(true);
        } else {
          console.error(`❌ Brevo API error [${res.statusCode}]:`, body);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Brevo network error:', err.message);
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

// -------------------------------------------------------------------
// ROUTE 1: CREATE APPOINTMENT & VAULT CARD
// -------------------------------------------------------------------
app.post('/api/appointments', async (req, res) => {
  try {
    console.log('📥 Booking Payload:', req.body);

    const full_name = req.body.full_name || req.body.fullName || req.body.name || 'Guest User';
    const email = req.body.email || req.body.userEmail || '';
    const phone = req.body.phone || req.body.phoneNumber || '';
    const service_name = req.body.service_name || req.body.service || 'Salon Service';
    const starting_price = parseFloat(req.body.starting_price || req.body.price) || 75.00;
    const duration_minutes = parseInt(req.body.duration_minutes, 10) || 60;

    let date = req.body.date || req.body.appointmentDate;
    let time = req.body.time || req.body.appointmentTime;

    if (req.body.start_time && (!date || !time)) {
      const parts = String(req.body.start_time).split('T');
      date = parts[0];
      if (parts[1]) {
        const rawTime = parts[1].substring(0, 5);
        const [h, m] = rawTime.split(':');
        const hourNum = parseInt(h, 10);
        const ampm = hourNum >= 12 ? 'PM' : 'AM';
        const hour12 = hourNum % 12 || 12;
        time = `${hour12}:${m} ${ampm}`;
      }
    }

    if (!date) date = new Date().toISOString().split('T')[0];
    if (!time) time = '10:00 AM';

    const card_data = req.body.card_data || req.body.cardData || {};
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

        const pm = await stripe.paymentMethods.create({
          type: 'card',
          card: { token: 'tok_visa' },
          billing_details: {
            name: card_data.name_on_card || full_name,
            email: email,
            phone: phone || undefined,
          },
        });

        await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
        stripePaymentMethodId = pm.id;
        console.log(`💳 Card Vaulted via Stripe: Customer ${customer.id}`);
      } catch (stripeErr) {
        console.error('⚠️ Stripe Vaulting Exception:', stripeErr.message);
      }
    }

    const newAppointment = {
      cancellation_code,
      cancellationCode: cancellation_code,
      full_name,
      fullName: full_name,
      email,
      phone,
      service_name,
      service: service_name,
      starting_price,
      price: starting_price,
      duration_minutes,
      date,
      time,
      start_time: req.body.start_time || `${date}T${time}`,
      status: 'confirmed',
      stripeCustomerId,
      stripePaymentMethodId,
      createdAt: new Date(),
    };

    if (pool) {
      try {
        const insertQuery = `
          INSERT INTO appointments 
          (cancellation_code, full_name, email, phone, service_name, starting_price, duration_minutes, date, time, status, stripe_customer_id, stripe_payment_method_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id;
        `;
        const values = [
          cancellation_code, full_name, email, phone, service_name, starting_price,
          duration_minutes, date, time, 'confirmed', stripeCustomerId, stripePaymentMethodId
        ];
        const dbRes = await pool.query(insertQuery, values);
        newAppointment.id = dbRes.rows[0].id;
      } catch (dbErr) {
        console.error('❌ Database insertion error:', dbErr.message);
        newAppointment.id = Date.now().toString();
      }
    } else {
      newAppointment.id = Date.now().toString();
      inMemoryAppointments.push(newAppointment);
    }

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 24px; color: #171717; max-width: 600px; margin: 0 auto; border: 1px solid #e5e5e5; border-radius: 12px;">
        <h2 style="font-family: Georgia, serif; color: #111; margin-top: 0;">LE SALON NYC</h2>
        <p style="color: #666; font-size: 14px;">Official Appointment Confirmation</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
        <p>Dear <strong>${full_name}</strong>,</p>
        <p>Your luxury salon experience has been reserved successfully.</p>
        
        <div style="background-color: #fafafa; padding: 16px; border-radius: 8px; border: 1px solid #eaeaea; margin: 20px 0;">
          <p style="margin: 6px 0;"><strong>Service:</strong> ${service_name}</p>
          <p style="margin: 6px 0;"><strong>Price:</strong> $${starting_price.toFixed(2)}</p>
          <p style="margin: 6px 0;"><strong>Date & Time:</strong> ${date} at ${time}</p>
          <p style="margin: 6px 0;"><strong>Cancellation Code:</strong> <span style="font-size: 18px; font-weight: bold; color: #d9534f; letter-spacing: 1px;">${cancellation_code}</span></p>
        </div>

        <p style="font-size: 12px; color: #777;">
          * Card Policy: A $0 hold was placed to vault your card. Cancellations less than 24 hours prior to your scheduled time will automatically incur a 50% late fee.
        </p>
      </div>
    `;

    sendBrevoEmail({
      to: email,
      subject: `Reservation Confirmed — Le Salon NYC (${cancellation_code})`,
      htmlContent: emailHtml,
    }).catch(err => console.error('Email background error:', err));

    return res.status(200).json({
      success: true,
      status: 'confirmed',
      message: 'Reservation created successfully.',
      cancellation_code,
      cancellationCode: cancellation_code,
      appointment: newAppointment,
      data: newAppointment,
      ...newAppointment
    });

  } catch (error) {
    console.error('❌ Server Error during appointment creation:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -------------------------------------------------------------------
// ROUTE 2: CANCEL APPOINTMENT & ENFORCE 50% PENALTY IF < 24 HOURS
// -------------------------------------------------------------------
app.post('/api/cancel', async (req, res) => {
  try {
    const cancellation_code = req.body.cancellation_code || req.body.cancellationCode || req.body.code;
    const email = req.body.email || req.body.userEmail;

    if (!cancellation_code || !email) {
      return res.status(400).json({ error: 'Missing cancellation reference code or email address.' });
    }

    let apt = null;

    if (pool) {
      const selectQuery = `SELECT * FROM appointments WHERE cancellation_code = $1 AND LOWER(email) = LOWER($2);`;
      const dbRes = await pool.query(selectQuery, [cancellation_code, email]);
      if (dbRes.rows.length > 0) {
        apt = dbRes.rows[0];
        apt.price = parseFloat(apt.starting_price);
        apt.stripeCustomerId = apt.stripe_customer_id;
        apt.stripePaymentMethodId = apt.stripe_payment_method_id;
      }
    } else {
      const index = inMemoryAppointments.findIndex(
        (a) => (a.cancellation_code === cancellation_code || a.cancellationCode === cancellation_code) &&
               a.email.toLowerCase() === String(email).toLowerCase()
      );
      if (index !== -1) apt = inMemoryAppointments[index];
    }

    if (!apt) {
      return res.status(404).json({ error: 'Matching reservation not found.' });
    }

    if (apt.status === 'canceled') {
      return res.status(400).json({ error: 'This appointment is already canceled.' });
    }

    const appointmentDateTime = new Date(`${apt.date} ${apt.time}`);
    const now = new Date();
    const hoursDifference = (appointmentDateTime - now) / (1000 * 60 * 60);

    let feeCharged = 0;
    let chargeSuccess = false;

    if (hoursDifference < 24 && apt.stripeCustomerId && apt.stripePaymentMethodId && stripe) {
      const penaltyAmountCents = Math.round((apt.price * 0.5) * 100);

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: penaltyAmountCents,
          currency: 'usd',
          customer: apt.stripeCustomerId,
          payment_method: apt.stripePaymentMethodId,
          off_session: true,
          confirm: true,
          description: `Late Cancellation Fee (50%) - Ref: ${apt.cancellation_code}`,
        });

        if (paymentIntent.status === 'succeeded') {
          feeCharged = apt.price * 0.5;
          chargeSuccess = true;
          console.log(`✅ 50% Penalty ($${feeCharged.toFixed(2)}) charged for ${apt.cancellation_code}`);
        }
      } catch (stripeErr) {
        console.error('❌ Penalty Charge Failed:', stripeErr.message);
      }
    }

    if (pool) {
      await pool.query(
        `UPDATE appointments SET status = 'canceled', fee_charged = $1 WHERE cancellation_code = $2;`,
        [feeCharged, cancellation_code]
      );
    } else {
      apt.status = 'canceled';
      apt.feeCharged = feeCharged;
    }

    const cancelHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #d9534f; font-family: Georgia, serif;">Le Salon NYC — Cancellation Confirmation</h2>
        <p>Dear <strong>${apt.full_name}</strong>,</p>
        <p>Your appointment for <strong>${apt.service_name || apt.service}</strong> has been canceled.</p>
        ${
          feeCharged > 0
            ? `<p style="color: #c9302c;">Notice: Because cancellation occurred within 24 hours of your appointment, a 50% late cancellation fee of <strong>$${feeCharged.toFixed(2)}</strong> was charged to your card on file.</p>`
            : `<p>No cancellation fee was charged for this cancellation.</p>`
        }
        <p>Thank you,</p>
        <p>Le Salon NYC Team</p>
      </div>
    `;

    sendBrevoEmail({
      to: apt.email,
      subject: `Reservation Canceled — Le Salon NYC (${apt.cancellation_code})`,
      htmlContent: cancelHtml,
    }).catch(err => console.error('Cancellation email error:', err));

    return res.status(200).json({
      success: true,
      status: 'canceled',
      message: 'Appointment successfully canceled.',
      feeCharged,
      chargeSuccess,
      appointment: apt,
    });

  } catch (error) {
    console.error('❌ Server Error during cancellation:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/health', (req, res) => res.status(200).send('OK'));

app.listen(PORT, () => {
  console.log(`🚀 Le Salon NYC Server running on port ${PORT}`);
});