const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL Connection (Neon Database)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Comprehensive DB Auto-Migration on Startup
const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        service_id INTEGER,
        service_name VARCHAR(255),
        duration_minutes INTEGER DEFAULT 45,
        start_time TIMESTAMPTZ,
        end_time TIMESTAMPTZ,
        full_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        notes TEXT,
        cancellation_code VARCHAR(50),
        status VARCHAR(50) DEFAULT 'confirmed',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const alterQueries = [
      'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_id INTEGER;',
      'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_name VARCHAR(255);',
      'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 45;',
      'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;',
      'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;',
      'ALTER TABLE appointments ALTER COLUMN end_time DROP NOT NULL;',
      'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);',
      'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS email VARCHAR(255);',
      'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS phone VARCHAR(50);',
      'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS notes TEXT;',
      'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancellation_code VARCHAR(50);',
      'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT \'confirmed\';',
    ];

    for (const q of alterQueries) {
      await pool.query(q).catch((e) => console.log('DB Schema sync step:', e.message));
    }

    console.log('✅ PostgreSQL DB schema aligned (cancellation & status columns verified).');
  } catch (err) {
    console.error('❌ Database schema migration error:', err.message);
  }
};
initDb();

// Helper: Send Transactional Email via Brevo HTTPS REST API
async function sendBrevoEmail({ to, subject, htmlContent }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY environment variable is not set.');
  }

  const senderEmail = process.env.SENDER_EMAIL || 'umarfarhan442@gmail.com';
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
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

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Failed to send email via Brevo REST API');
  }
  return data;
}

// --------------------------------------------------------------------------
// 1. Health & Test Endpoint
// --------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timezone: 'America/New_York', timestamp: new Date() });
});

app.get('/api/test-email', async (req, res) => {
  try {
    const adminEmail = process.env.SALON_NOTIFICATION_EMAIL || 'umarfarhan442@gmail.com';
    const result = await sendBrevoEmail({
      to: adminEmail,
      subject: 'Le Salon NYC — Brevo Delivery Test',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #b88e28; border-radius: 8px;">
          <h2 style="color: #b88e28;">Diagnostic Email Successful</h2>
          <p>Brevo HTTP REST API is operating correctly on Render.</p>
          <p><strong>Server Timezone:</strong> America/New_York</p>
        </div>
      `,
    });
    res.json({ success: true, message: `Diagnostic test email sent to ${adminEmail}!`, result });
  } catch (error) {
    console.error('Test email failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --------------------------------------------------------------------------
// 2. Fetch Master Service Catalog
// --------------------------------------------------------------------------
app.get('/api/services', async (req, res) => {
  try {
    const query = 'SELECT * FROM services ORDER BY id ASC';
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching services:', err);
    res.status(500).json({ error: 'Failed to retrieve service catalog' });
  }
});

// --------------------------------------------------------------------------
// 3. Fetch Booked Slots for a Given Date (New York Time)
// --------------------------------------------------------------------------
app.get('/api/booked-slots', async (req, res) => {
  const { date } = req.query; // Expecting YYYY-MM-DD
  if (!date) {
    return res.status(400).json({ error: 'Date query parameter is required.' });
  }

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
    console.error('Error fetching booked slots:', err);
    res.json([]);
  }
});

// --------------------------------------------------------------------------
// 4. Create New Appointment & Dispatch Confirmation Emails
// --------------------------------------------------------------------------
app.post('/api/appointments', async (req, res) => {
  const { service_id, start_time, full_name, email, phone, notes } = req.body;

  if (!service_id || !start_time || !full_name || !email || !phone) {
    return res.status(400).json({ success: false, message: 'Missing required reservation fields.' });
  }

  try {
    let service = { name: 'Salon Service', duration_minutes: 60, price_display: 'Upon Consultation' };
    try {
      const serviceRes = await pool.query('SELECT * FROM services WHERE id = $1', [service_id]);
      if (serviceRes.rows.length > 0) {
        service = serviceRes.rows[0];
      }
    } catch (e) {
      console.log('Using fallback service details');
    }

    const durationMins = service.duration_minutes || 45;
    const requestedStartObj = new Date(start_time);
    const requestedEndObj = new Date(requestedStartObj.getTime() + durationMins * 60000);

    const requestedStartISO = requestedStartObj.toISOString();
    const requestedEndISO = requestedEndObj.toISOString();

    try {
      const conflictCheckQuery = `
        SELECT id, start_time, end_time, duration_minutes 
        FROM appointments 
        WHERE (status IS NULL OR status != 'cancelled')
      `;
      const existingBookings = await pool.query(conflictCheckQuery);

      const reqStartMs = requestedStartObj.getTime();
      const reqEndMs = requestedEndObj.getTime();

      const hasConflict = existingBookings.rows.some((b) => {
        if (!b.start_time) return false;
        const bStartMs = new Date(b.start_time).getTime();
        const bEndMs = b.end_time 
          ? new Date(b.end_time).getTime() 
          : bStartMs + (b.duration_minutes || 45) * 60000;
        return reqStartMs < bEndMs && reqEndMs > bStartMs;
      });

      if (hasConflict) {
        return res.status(409).json({
          success: false,
          message: 'This time slot was just booked by another customer. Please select a different time.',
        });
      }
    } catch (e) {
      console.log('Skipping collision check step');
    }

    const cancellation_code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const insertQuery = `
      INSERT INTO appointments 
      (service_id, service_name, duration_minutes, start_time, end_time, full_name, email, phone, notes, cancellation_code, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'confirmed')
      RETURNING *
    `;
    const insertValues = [
      service_id,
      service.name || 'Salon Service',
      durationMins,
      requestedStartISO,
      requestedEndISO,
      full_name,
      email,
      phone,
      notes || '',
      cancellation_code,
    ];

    const { rows } = await pool.query(insertQuery, insertValues);
    const newAppointment = rows[0];

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

    const customerHtml = `
      <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e6d3a7; border-radius: 12px; padding: 30px; color: #1f1f1f;">
        <div style="text-align: center; border-bottom: 1px solid #e6e1da; padding-bottom: 20px; margin-bottom: 25px;">
          <h1 style="font-family: Georgia, serif; color: #b88e28; letter-spacing: 3px; margin: 0;">LE SALON NYC</h1>
          <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #666; margin-top: 5px;">Reservation Confirmation</p>
        </div>

        <p>Dear <strong>${full_name}</strong>,</p>
        <p>Thank you for choosing Le Salon NYC. Your reservation has been successfully confirmed!</p>

        <div style="background-color: #fcf8f0; border: 1px dashed #b88e28; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <span style="font-size: 11px; text-transform: uppercase; color: #666; display: block;">Cancellation Reference Code</span>
          <strong style="font-size: 22px; color: #b88e28; font-family: monospace; letter-spacing: 2px;">${cancellation_code}</strong>
        </div>

        <h3 style="color: #121212; border-bottom: 1px solid #eee; padding-bottom: 8px;">Appointment Details</h3>
        <ul style="list-style: none; padding: 0; line-height: 1.8;">
          <li><strong>Service:</strong> ${service.name || 'Salon Service'}</li>
          <li><strong>Duration:</strong> ${durationMins} Minutes</li>
          <li><strong>Date & Time:</strong> ${formattedDateStr}</li>
          <li><strong>Location:</strong> 310 East 44th St, Manhattan, NY 10017</li>
        </ul>

        <div style="background-color: #faf8f5; border: 1px solid #e6d3a7; border-radius: 8px; padding: 18px; margin: 25px 0;">
          <h4 style="color: #b88e28; margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Salon Policies & Guidelines</h4>
          <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #444; line-height: 1.6;">
            <li style="margin-bottom: 8px;"><strong>In-Salon Payment:</strong> Paid at salon upon completion. Cash & major credit cards accepted <em>(No American Express)</em>.</li>
            <li style="margin-bottom: 8px;"><strong>Redo Policy:</strong> We fix or redo unsatisfactory work; no monetary refunds are issued.</li>
            <li><strong>24-Hour Cancellation:</strong> Must cancel at least 24 hours prior. Cancellations within 24 hours incur a <strong>50% service charge</strong>.</li>
          </ul>
        </div>

        <div style="text-align: center; border-top: 1px solid #e6e1da; padding-top: 15px; margin-top: 30px; font-size: 11px; color: #888;">
          Le Salon NYC • 310 East 44th St, New York, NY • (212) 949-6693
        </div>
      </div>
    `;

    const adminEmail = process.env.SALON_NOTIFICATION_EMAIL || 'umarfarhan442@gmail.com';
    const adminHtml = `
      <div style="font-family: Arial, sans-serif; padding: 25px; border: 1px solid #121212; border-radius: 8px; max-width: 600px;">
        <h2 style="color: #b88e28; margin-top: 0;">🚨 New Online Reservation Received</h2>
        <ul>
          <li><strong>Customer Name:</strong> ${full_name}</li>
          <li><strong>Customer Email:</strong> ${email}</li>
          <li><strong>Customer Phone:</strong> ${phone}</li>
          <li><strong>Reserved Service:</strong> ${service.name || 'Salon Service'}</li>
          <li><strong>Scheduled Date & Time:</strong> ${formattedDateStr}</li>
          <li><strong>Special Notes:</strong> ${notes || 'None'}</li>
          <li><strong>Reference Code:</strong> ${cancellation_code}</li>
        </ul>
      </div>
    `;

    sendBrevoEmail({
      to: email,
      subject: `Reservation Confirmed — Le Salon NYC (${cancellation_code})`,
      htmlContent: customerHtml,
    }).catch((e) => console.error('Customer email send warning:', e.message));

    sendBrevoEmail({
      to: adminEmail,
      subject: `NEW BOOKING: ${service.name || 'Service'} - ${full_name}`,
      htmlContent: adminHtml,
    }).catch((e) => console.error('Admin notification send warning:', e.message));

    res.json({
      success: true,
      message: 'Reservation booked successfully!',
      cancellation_code,
      appointment: newAppointment,
    });
  } catch (err) {
    console.error('Error creating appointment:', err);
    res.status(500).json({ success: false, message: err.message || 'Server error processing reservation.' });
  }
});

// --------------------------------------------------------------------------
// 5. Cancel Appointment Endpoint
// --------------------------------------------------------------------------
app.post('/api/cancel-appointment', async (req, res) => {
  const { cancellation_code, email } = req.body;

  if (!cancellation_code || !email) {
    return res.status(400).json({ success: false, message: 'Reference code and email address are required.' });
  }

  try {
    const searchRes = await pool.query(
      'SELECT * FROM appointments WHERE UPPER(cancellation_code) = UPPER($1) AND LOWER(email) = LOWER($2)',
      [cancellation_code.trim(), email.trim()]
    );

    if (searchRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No active reservation found with that reference code and email.' });
    }

    const appointment = searchRes.rows[0];

    if (appointment.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'This reservation has already been cancelled.' });
    }

    // Update DB status to cancelled
    const updateRes = await pool.query(
      "UPDATE appointments SET status = 'cancelled' WHERE id = $1 RETURNING *",
      [appointment.id]
    );

    const cancelledAppt = updateRes.rows[0];

    // Check if cancellation is within 24 hours
    const apptTimeMs = new Date(cancelledAppt.start_time).getTime();
    const nowMs = Date.now();
    const hoursNotice = (apptTimeMs - nowMs) / (1000 * 60 * 60);
    const isLateCancellation = hoursNotice < 24;

    const formattedDateStr = new Date(cancelledAppt.start_time).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) + ' (New York Time)';

    // Send Customer Cancellation Email
    const customerCancelHtml = `
      <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e6d3a7; border-radius: 12px; padding: 30px; color: #1f1f1f;">
        <div style="text-align: center; border-bottom: 1px solid #e6e1da; padding-bottom: 20px; margin-bottom: 25px;">
          <h1 style="font-family: Georgia, serif; color: #b88e28; letter-spacing: 3px; margin: 0;">LE SALON NYC</h1>
          <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #666; margin-top: 5px;">Reservation Cancellation</p>
        </div>

        <p>Dear <strong>${cancelledAppt.full_name}</strong>,</p>
        <p>Your reservation <strong>(${cancelledAppt.cancellation_code})</strong> has been successfully <strong>cancelled</strong>.</p>

        <h3 style="color: #121212; border-bottom: 1px solid #eee; padding-bottom: 8px;">Cancelled Details</h3>
        <ul style="list-style: none; padding: 0; line-height: 1.8;">
          <li><strong>Service:</strong> ${cancelledAppt.service_name}</li>
          <li><strong>Date & Time:</strong> ${formattedDateStr}</li>
        </ul>

        ${isLateCancellation ? `
          <div style="background-color: #fff3f3; border: 1px solid #ffcdd2; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 13px; color: #c62828;">
            <strong>Notice on 24-Hour Policy:</strong> This cancellation was submitted within 24 hours of your scheduled time. Per salon policy, a 50% service charge applies.
          </div>
        ` : ''}

        <div style="text-align: center; border-top: 1px solid #e6e1da; padding-top: 15px; margin-top: 30px; font-size: 11px; color: #888;">
          Le Salon NYC • 310 East 44th St, New York, NY • (212) 949-6693
        </div>
      </div>
    `;

    // Send Admin Cancellation Email Notification
    const adminEmail = process.env.SALON_NOTIFICATION_EMAIL || 'umarfarhan442@gmail.com';
    const adminCancelHtml = `
      <div style="font-family: Arial, sans-serif; padding: 25px; border: 1px solid #c62828; border-radius: 8px; max-width: 600px;">
        <h2 style="color: #c62828; margin-top: 0;">⚠️ Reservation Cancelled by Customer</h2>
        <ul>
          <li><strong>Customer Name:</strong> ${cancelledAppt.full_name}</li>
          <li><strong>Customer Email:</strong> ${cancelledAppt.email}</li>
          <li><strong>Customer Phone:</strong> ${cancelledAppt.phone}</li>
          <li><strong>Service:</strong> ${cancelledAppt.service_name}</li>
          <li><strong>Scheduled Time:</strong> ${formattedDateStr}</li>
          <li><strong>Reference Code:</strong> ${cancelledAppt.cancellation_code}</li>
          <li><strong>Notice Period:</strong> ${isLateCancellation ? 'LESS than 24 Hours (50% fee applies)' : 'More than 24 Hours (Standard cancellation)'}</li>
        </ul>
      </div>
    `;

    sendBrevoEmail({
      to: cancelledAppt.email,
      subject: `Reservation Cancelled — Le Salon NYC (${cancelledAppt.cancellation_code})`,
      htmlContent: customerCancelHtml,
    }).catch((e) => console.error('Customer cancel email error:', e.message));

    sendBrevoEmail({
      to: adminEmail,
      subject: `CANCELLED: ${cancelledAppt.service_name} - ${cancelledAppt.full_name}`,
      htmlContent: adminCancelHtml,
    }).catch((e) => console.error('Admin cancel email error:', e.message));

    res.json({
      success: true,
      message: 'Reservation cancelled successfully.',
      isLateCancellation,
      appointment: cancelledAppt,
    });
  } catch (err) {
    console.error('Error cancelling appointment:', err);
    res.status(500).json({ success: false, message: 'Server error processing cancellation.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Le Salon NYC API server running on port ${PORT}`);
});