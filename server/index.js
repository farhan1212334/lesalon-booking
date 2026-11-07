const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const Stripe = require('stripe');
const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// PostgreSQL Connection (Neon Database)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Database Migration on Startup
const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        service_id INTEGER,
        service_name VARCHAR(255),
        duration_minutes INTEGER DEFAULT 45,
        starting_price NUMERIC(10, 2) DEFAULT 0,
        start_time TIMESTAMPTZ,
        end_time TIMESTAMPTZ,
        full_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        notes TEXT,
        cancellation_code VARCHAR(50),
        status VARCHAR(50) DEFAULT 'confirmed',
        stripe_customer_id VARCHAR(255),
        stripe_payment_method_id VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pending_fees (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255),
        phone VARCHAR(50),
        full_name VARCHAR(255),
        amount_due NUMERIC(10, 2),
        service_name VARCHAR(255),
        reason VARCHAR(255),
        status VARCHAR(50) DEFAULT 'unpaid',
        stripe_charge_id VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const alterQueries = [
      'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);',
      'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS stripe_payment_method_id VARCHAR(255);',
      'ALTER TABLE pending_fees ADD COLUMN IF NOT EXISTS stripe_charge_id VARCHAR(255);',
    ];

    for (const q of alterQueries) {
      await pool.query(q).catch((e) => console.log('DB Schema sync step:', e.message));
    }

    console.log('✅ PostgreSQL database aligned with Stripe Vault schema.');
  } catch (err) {
    console.error('❌ DB migration error:', err.message);
  }
};
initDb();

// Helper: Send Transactional Email via Brevo REST API
async function sendBrevoEmail({ to, subject, htmlContent }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return;

  const senderEmail = process.env.SENDER_EMAIL || 'info@lesalonnyc.com';
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Le Salon NYC', email: senderEmail },
        to: [{ email: to }],
        subject: subject,
        htmlContent: htmlContent,
      }),
    });
  } catch (err) {
    console.error('Brevo email send error:', err.message);
  }
}

// --------------------------------------------------------------------------
// 1. Health Endpoint
// --------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timezone: 'America/New_York', timestamp: new Date() });
});

// --------------------------------------------------------------------------
// 2. Fetch Master Services Catalog
// --------------------------------------------------------------------------
app.get('/api/services', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM services ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    res.json([]);
  }
});

// --------------------------------------------------------------------------
// 3. Fetch Booked Slots for Date (New York Time)
// --------------------------------------------------------------------------
app.get('/api/booked-slots', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Date query required' });

  try {
    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;

    const query = `
      SELECT start_time, end_time, duration_minutes 
      FROM appointments 
      WHERE start_time >= $1 AND start_time <= $2 AND (status IS NULL OR status != 'cancelled')
    `;
    const { rows } = await pool.query(query, [startOfDay, endOfDay]);
    res.json(rows);
  } catch (err) {
    res.json([]);
  }
});

// --------------------------------------------------------------------------
// 4. Create Reservation & Vault Credit Card ($0 Upfront Hold)
// --------------------------------------------------------------------------
app.post('/api/appointments', async (req, res) => {
  const {
    service_id,
    service_name,
    duration_minutes,
    starting_price,
    start_time,
    full_name,
    email,
    phone,
    notes,
    card_data,
  } = req.body;

  if (!start_time || !full_name || !email || !phone) {
    return res.status(400).json({ success: false, message: 'Missing required guest fields.' });
  }

  try {
    // Check pending unpaid cancellation fees
    const pendingCheck = await pool.query(
      "SELECT * FROM pending_fees WHERE (LOWER(email) = LOWER($1) OR phone = $2) AND status = 'unpaid'",
      [email.trim(), phone.trim()]
    );

    if (pendingCheck.rows.length > 0) {
      const fee = pendingCheck.rows[0];
      const feeAmount = parseFloat(fee.amount_due || 37.50).toFixed(2);
      return res.status(403).json({
        success: false,
        message: `You have an unpaid 50% cancellation fee ($${feeAmount}) from a prior booking. Please call (212) 949-6693 to settle your account balance.`,
      });
    }

    const durationMins = duration_minutes || 60;
    const priceVal = starting_price || 75;
    const requestedStartObj = new Date(start_time);
    const requestedEndISO = new Date(requestedStartObj.getTime() + durationMins * 60000).toISOString();

    // Time Slot Collision Check
    const collisionCheck = await pool.query(
      "SELECT id, start_time, end_time, duration_minutes FROM appointments WHERE (status IS NULL OR status != 'cancelled')"
    );

    const reqStartMs = requestedStartObj.getTime();
    const reqEndMs = reqStartMs + durationMins * 60000;

    const hasConflict = collisionCheck.rows.some((b) => {
      if (!b.start_time) return false;
      const bStartMs = new Date(b.start_time).getTime();
      const bEndMs = b.end_time ? new Date(b.end_time).getTime() : bStartMs + (b.duration_minutes || 45) * 60000;
      return reqStartMs < bEndMs && reqEndMs > bStartMs;
    });

    if (hasConflict) {
      return res.status(409).json({
        success: false,
        message: 'This time slot was just booked by another customer. Please select another slot.',
      });
    }

    // Stripe Card Vaulting Setup ($0 upfront charge)
    let stripeCustomerId = null;
    let stripePaymentMethodId = null;

    if (stripe && card_data && card_data.card_number) {
      try {
        const customer = await stripe.customers.create({
          email: email.trim(),
          name: full_name.trim(),
          phone: phone.trim(),
        });
        stripeCustomerId = customer.id;

        const expMonth = parseInt(card_data.expiry.split('/')[0] || '12', 10);
        const expYear = parseInt('20' + (card_data.expiry.split('/')[1] || '26'), 10);

        const pm = await stripe.paymentMethods.create({
          type: 'card',
          card: {
            number: card_data.card_number.replace(/\s/g, ''),
            exp_month: expMonth,
            exp_year: expYear,
            cvc: card_data.cvc,
          },
          billing_details: {
            name: card_data.name_on_card || full_name,
            email: email,
            phone: phone,
          },
        });

        await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
        stripePaymentMethodId = pm.id;
      } catch (stripeErr) {
        console.error('Stripe Vaulting Notice:', stripeErr.message);
      }
    }

    const cancellation_code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const insertQuery = `
      INSERT INTO appointments 
      (service_id, service_name, duration_minutes, starting_price, start_time, end_time, full_name, email, phone, notes, cancellation_code, status, stripe_customer_id, stripe_payment_method_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'confirmed', $12, $13)
      RETURNING *
    `;

    const { rows } = await pool.query(insertQuery, [
      service_id || 1,
      service_name || 'Salon Service',
      durationMins,
      priceVal,
      start_time,
      requestedEndISO,
      full_name,
      email,
      phone,
      notes || '',
      cancellation_code,
      stripeCustomerId,
      stripePaymentMethodId,
    ]);

    const formattedDateStr = requestedStartObj.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) + ' (New York Time)';

    // Email Templates
    const customerHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e6d3a7; border-radius: 12px; background: #fff;">
        <h2 style="color: #b88e28; text-align: center; margin: 0 0 10px 0;">LE SALON NYC</h2>
        <p style="text-align: center; font-size: 12px; color: #666; text-transform: uppercase;">Reservation Confirmation</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p>Dear <strong>${full_name}</strong>,</p>
        <p>Your appointment has been confirmed!</p>
        <div style="background: #faf8f5; border: 1px dashed #b88e28; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <span style="font-size: 11px; text-transform: uppercase; color: #777;">Reference Code</span><br/>
          <strong style="font-size: 22px; color: #b88e28; letter-spacing: 2px;">${cancellation_code}</strong>
        </div>
        <ul>
          <li><strong>Services:</strong> ${service_name}</li>
          <li><strong>Date & Time:</strong> ${formattedDateStr}</li>
          <li><strong>Location:</strong> 310 East 44th St, Manhattan, NY 10017</li>
        </ul>
        <p style="font-size: 12px; color: #666;">Cancellations require 24 hours notice to avoid a 50% late fee.</p>
      </div>
    `;

    sendBrevoEmail({
      to: email,
      subject: `Reservation Confirmed — Le Salon NYC (${cancellation_code})`,
      htmlContent: customerHtml,
    });

    res.json({
      success: true,
      message: 'Reservation confirmed with card on file.',
      cancellation_code,
      appointment: rows[0],
    });
  } catch (err) {
    console.error('Error creating appointment:', err);
    res.status(500).json({ success: false, message: 'Server error creating reservation.' });
  }
});

// --------------------------------------------------------------------------
// 5. Cancel Appointment (24-Hour Policy + Automatic Stripe Fee Deduction)
// --------------------------------------------------------------------------
app.post('/api/cancel-appointment', async (req, res) => {
  const { cancellation_code, email } = req.body;

  try {
    const searchRes = await pool.query(
      'SELECT * FROM appointments WHERE UPPER(cancellation_code) = UPPER($1) AND LOWER(email) = LOWER($2)',
      [cancellation_code.trim(), email.trim()]
    );

    if (searchRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No active reservation found with those credentials.' });
    }

    const appointment = searchRes.rows[0];

    if (appointment.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'This appointment has already been cancelled.' });
    }

    await pool.query("UPDATE appointments SET status = 'cancelled' WHERE id = $1", [appointment.id]);

    // Calculate notice hours
    const apptTimeMs = new Date(appointment.start_time).getTime();
    const nowMs = Date.now();
    const hoursNotice = (apptTimeMs - nowMs) / (1000 * 60 * 60);

    // Rule: Cancelled within 24 hours incurs 50% late fee
    const isLateCancellation = hoursNotice < 24;
    let stripeChargeId = null;
    let feeAmount = '0.00';

    if (isLateCancellation) {
      const basePrice = parseFloat(appointment.starting_price || 75);
      feeAmount = (basePrice * 0.5).toFixed(2);
      const feeInCents = Math.round(parseFloat(feeAmount) * 100);

      // Charge Vaulted Stripe Card Off-Session
      if (stripe && appointment.stripe_customer_id && appointment.stripe_payment_method_id) {
        try {
          const paymentIntent = await stripe.paymentIntents.create({
            amount: feeInCents,
            currency: 'usd',
            customer: appointment.stripe_customer_id,
            payment_method: appointment.stripe_payment_method_id,
            off_session: true,
            confirm: true,
            description: `Late Cancellation Fee (50%) - Ref: ${appointment.cancellation_code}`,
          });
          stripeChargeId = paymentIntent.id;
        } catch (stripeErr) {
          console.error('Automatic Stripe Charge Notice:', stripeErr.message);
        }
      }

      await pool.query(
        `INSERT INTO pending_fees (email, phone, full_name, amount_due, service_name, reason, status, stripe_charge_id)
         VALUES ($1, $2, $3, $4, $5, 'Late Cancellation Fee (<24h)', $6, $7)`,
        [
          appointment.email,
          appointment.phone,
          appointment.full_name,
          feeAmount,
          appointment.service_name,
          stripeChargeId ? 'paid_via_stripe' : 'unpaid',
          stripeChargeId,
        ]
      );
    }

    res.json({
      success: true,
      message: 'Reservation cancelled successfully.',
      isLateCancellation,
      feeAmount,
      stripeCharged: !!stripeChargeId,
    });
  } catch (err) {
    console.error('Cancellation error:', err);
    res.status(500).json({ success: false, message: 'Server error processing cancellation.' });
  }
});

// --------------------------------------------------------------------------
// 6. Admin Panel Endpoints
// --------------------------------------------------------------------------
app.post('/api/admin/verify-pin', (req, res) => {
  const { pin } = req.body;
  if (pin === (process.env.ADMIN_PIN || '212949')) {
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, message: 'Invalid Admin PIN.' });
});

app.get('/api/admin/appointments', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM appointments ORDER BY start_time DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

app.patch('/api/admin/appointments/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const { rows } = await pool.query('UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
    res.json({ success: true, appointment: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get('/api/admin/pending-fees', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM pending_fees ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending fees' });
  }
});

app.patch('/api/admin/pending-fees/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const { rows } = await pool.query('UPDATE pending_fees SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
    res.json({ success: true, fee: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.delete('/api/admin/clear-all', async (req, res) => {
  try {
    await pool.query('TRUNCATE TABLE appointments, pending_fees RESTART IDENTITY CASCADE;');
    res.json({ success: true, message: 'All database records cleared.' });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.listen(PORT, () => {
  console.log(`Le Salon NYC API server running on port ${PORT}`);
});