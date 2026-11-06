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

// Auto-repair DB schema on server start (Ensures missing columns are added automatically)
const initDb = async () => {
  try {
    await pool.query(`
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_name VARCHAR(255);
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 45;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 45;
    `);
    console.log('Database schema verified & updated successfully.');
  } catch (err) {
    console.error('Database schema initialization error:', err);
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
// 1. Diagnostic Health & Email Test Endpoint
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
          <p>Your Brevo HTTP REST API integration is working cleanly on Render.</p>
          <p><strong>Server Timezone:</strong> America/New_York</p>
        </div>
      `,
    });
    res.json({ success: true, message: `Diagnostic test email successfully sent to ${adminEmail}!`, result });
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
      SELECT start_time, duration_minutes 
      FROM appointments 
      WHERE start_time >= $1 AND start_time <= $2 AND status != 'cancelled'
    `;
    const { rows } = await pool.query(query, [startOfDay, endOfDay]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching booked slots:', err);
    res.status(500).json({ error: 'Failed to retrieve booked slots' });
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
    // A. Fetch service details for pricing and duration
    const serviceRes = await pool.query('SELECT * FROM services WHERE id = $1', [service_id]);
    const service = serviceRes.rows[0] || {
      name: 'Custom Service',
      duration_minutes: 60,
      price_display: 'Upon Consultation',
    };

    // B. Collision check for existing overlapping bookings
    const requestedStart = new Date(start_time).getTime();
    const requestedEnd = requestedStart + (service.duration_minutes || 45) * 60000;

    const conflictCheckQuery = `
      SELECT id, start_time, duration_minutes 
      FROM appointments 
      WHERE status != 'cancelled'
    `;
    const existingBookings = await pool.query(conflictCheckQuery);

    const hasConflict = existingBookings.rows.some((b) => {
      const bStart = new Date(b.start_time).getTime();
      const bEnd = bStart + (b.duration_minutes || 45) * 60000;
      return requestedStart < bEnd && requestedEnd > bStart;
    });

    if (hasConflict) {
      return res.status(409).json({
        success: false,
        message: 'This time slot was just booked by another customer. Please select a different time.',
      });
    }

    // C. Generate unique 6-character reference code
    const cancellation_code = Math.random().toString(36).substring(2, 8).toUpperCase();

    // D. Save to PostgreSQL
    const insertQuery = `
      INSERT INTO appointments 
      (service_id, service_name, duration_minutes, start_time, full_name, email, phone, notes, cancellation_code, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmed')
      RETURNING *
    `;
    const insertValues = [
      service_id,
      service.name,
      service.duration_minutes || 45,
      start_time,
      full_name,
      email,
      phone,
      notes || '',
      cancellation_code,
    ];
    const { rows } = await pool.query(insertQuery, insertValues);
    const newAppointment = rows[0];

    // E. Format Date strictly in America/New_York Timezone for Emails
    const formattedDateStr = new Date(start_time).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) + ' (New York Time)';

    // F. Send Customer Confirmation Email
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
          <li><strong>Service:</strong> ${service.name}</li>
          <li><strong>Duration:</strong> ${service.duration_minutes || 45} Minutes</li>
          <li><strong>Date & Time:</strong> ${formattedDateStr}</li>
          <li><strong>Price:</strong> ${service.price_display || '$' + service.starting_price}</li>
          <li><strong>Location:</strong> 310 East 44th St, Manhattan, NY 10017</li>
        </ul>

        <p style="font-size: 13px; color: #666; margin-top: 25px;">
          If you need to reschedule or cancel your appointment, please contact us at (212) 949-6693 with your reference code.
        </p>

        <div style="text-align: center; border-top: 1px solid #e6e1da; padding-top: 15px; margin-top: 30px; font-size: 11px; color: #888;">
          Le Salon NYC • 310 East 44th St, New York, NY • (212) 949-6693
        </div>
      </div>
    `;

    // G. Send Admin Notification Email
    const adminEmail = process.env.SALON_NOTIFICATION_EMAIL || 'umarfarhan442@gmail.com';
    const adminHtml = `
      <div style="font-family: Arial, sans-serif; padding: 25px; border: 1px solid #121212; border-radius: 8px; max-width: 600px;">
        <h2 style="color: #b88e28; margin-top: 0;">🚨 New Online Reservation Received</h2>
        <p>A new customer has booked an appointment online:</p>
        <ul>
          <li><strong>Customer Name:</strong> ${full_name}</li>
          <li><strong>Customer Email:</strong> ${email}</li>
          <li><strong>Customer Phone:</strong> ${phone}</li>
          <li><strong>Reserved Service:</strong> ${service.name} (${service.duration_minutes || 45} mins)</li>
          <li><strong>Scheduled Date & Time:</strong> ${formattedDateStr}</li>
          <li><strong>Special Notes:</strong> ${notes || 'None'}</li>
          <li><strong>Reference Code:</strong> ${cancellation_code}</li>
        </ul>
      </div>
    `;

    // Dispatch emails asynchronously via Brevo HTTP REST API
    await sendBrevoEmail({
      to: email,
      subject: `Reservation Confirmed — Le Salon NYC (${cancellation_code})`,
      htmlContent: customerHtml,
    });

    await sendBrevoEmail({
      to: adminEmail,
      subject: `NEW BOOKING: ${service.name} - ${full_name}`,
      htmlContent: adminHtml,
    });

    res.json({
      success: true,
      message: 'Reservation booked successfully!',
      cancellation_code,
      appointment: newAppointment,
    });
  } catch (err) {
    console.error('Error creating appointment:', err);
    res.status(500).json({ success: false, message: 'Server error processing reservation.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Le Salon NYC API server running on port ${PORT}`);
});