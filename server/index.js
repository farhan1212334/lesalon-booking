const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const SALON_ADMIN_EMAIL = (process.env.SALON_NOTIFICATION_EMAIL || 'umarfarhan442@gmail.com').trim();
const API_KEY = (process.env.BREVO_API_KEY || 'xsmtpsib-71dd5e86f6e174ca8b087aadf4569b9f3248a669de43356475e508679cfc3491-IODIalWJICxbOJn1').trim();

// Dispatch email via Brevo HTTPS API (Bypasses all Render port blocks)
async function sendEmailViaAPI({ to, subject, html }) {
  if (!API_KEY) {
    throw new Error('BREVO_API_KEY is missing.');
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Le Salon NYC', email: 'umarfarhan442@gmail.com' },
      to: [{ email: to }],
      subject: subject,
      htmlContent: html,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return data;
}

app.get('/', (req, res) => {
  res.send('Le Salon NYC API Server is Live.');
});

// Diagnostic Email Test Endpoint
app.get('/api/test-email', async (req, res) => {
  try {
    const result = await sendEmailViaAPI({
      to: SALON_ADMIN_EMAIL,
      subject: 'Le Salon NYC - Diagnostic Email Test',
      html: `<div style="font-family: Arial; padding: 20px; border: 1px solid #c59b27; border-radius: 8px;">
              <h2>Brevo HTTP API Connection Successful!</h2>
              <p>This test email confirms that delivery to <strong>${SALON_ADMIN_EMAIL}</strong> is 100% operational on Render.</p>
             </div>`,
    });

    res.json({
      success: true,
      message: `Diagnostic test email successfully sent to ${SALON_ADMIN_EMAIL}! Check your inbox.`,
      result,
    });
  } catch (err) {
    console.error('Test email failure:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      fix: 'Verify BREVO_API_KEY settings.',
    });
  }
});

// Fetch Services Catalog
app.get('/api/services', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Database query error:', err);
    res.status(500).json({ error: 'Failed to retrieve services' });
  }
});

// Fetch Booked Slots
app.get('/api/booked-slots', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Date parameter is required' });

  try {
    const query = `
      SELECT a.start_time, s.duration_minutes 
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      WHERE DATE(a.start_time) = $1 AND (a.status IS NULL OR a.status != 'cancelled')
    `;
    const result = await pool.query(query, [date]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching booked slots:', err);
    res.json([]);
  }
});

// Create New Appointment
app.post('/api/appointments', async (req, res) => {
  const { service_id, start_time, full_name, email, phone, notes } = req.body;

  if (!service_id || !start_time || !full_name || !email || !phone) {
    return res.status(400).json({ success: false, message: 'Missing required booking fields' });
  }

  try {
    const serviceDetails = await pool.query('SELECT name, duration_minutes FROM services WHERE id = $1', [service_id]);
    const durationMinutes = parseInt(serviceDetails.rows[0]?.duration_minutes || 45, 10);
    const serviceName = serviceDetails.rows[0]?.name || 'Salon Service';

    const startDate = new Date(start_time);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
    const end_time = endDate.toISOString();

    let customerResult = await pool.query('SELECT id FROM customers WHERE email = $1', [email]);
    let customerId;

    if (customerResult.rows.length === 0) {
      const newCustomer = await pool.query(
        'INSERT INTO customers (full_name, email, phone) VALUES ($1, $2, $3) RETURNING id',
        [full_name, email, phone]
      );
      customerId = newCustomer.rows[0].id;
    } else {
      customerId = customerResult.rows[0].id;
    }

    const cancellation_code = Math.random().toString(36).substring(2, 8).toUpperCase();

    let appointmentResult;
    try {
      appointmentResult = await pool.query(
        `INSERT INTO appointments (customer_id, service_id, start_time, end_time, notes, cancellation_code, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'confirmed')
         RETURNING id`,
        [customerId, service_id, start_time, end_time, notes || '', cancellation_code]
      );
    } catch (dbErr) {
      appointmentResult = await pool.query(
        `INSERT INTO appointments (customer_id, service_id, start_time, end_time, notes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [customerId, service_id, start_time, end_time, notes || '']
      );
    }

    const appointmentId = appointmentResult.rows[0].id;
    const formattedDateStr = new Date(start_time).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const clientHtml = `
      <div style="font-family: Arial, sans-serif; background-color: #faf8f5; color: #1a1a1a; padding: 30px; border-radius: 10px; border: 1px solid #e6e1da; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #b88e28; font-family: Georgia, serif; text-align: center; margin-bottom: 5px;">LE SALON NYC</h1>
        <p style="text-align: center; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-top: 0;">310 East 44th St, Manhattan • (212) 949-6693</p>
        <hr style="border: none; border-top: 1px solid #e6e1da; margin: 20px 0;" />
        
        <h2 style="color: #1a1a1a; font-size: 18px;">Thank You for Your Reservation, ${full_name}!</h2>
        <p style="color: #444; line-height: 1.6;">We have successfully scheduled your appointment. Here are your booking details:</p>
        
        <div style="background-color: #ffffff; border: 1px solid #e6e1da; padding: 18px; border-radius: 8px; margin: 20px 0; line-height: 1.8;">
          <p style="margin: 4px 0;"><strong>Service:</strong> ${serviceName}</p>
          <p style="margin: 4px 0;"><strong>Duration:</strong> ${durationMinutes} Minutes</p>
          <p style="margin: 4px 0;"><strong>Date & Time:</strong> ${formattedDateStr}</p>
          <p style="margin: 4px 0;"><strong>Location:</strong> 310 East 44th St, Manhattan, NY 10017</p>
          <p style="margin: 4px 0; color: #b88e28;"><strong>Cancellation Code:</strong> <span style="font-family: monospace; font-size: 16px; font-weight: bold;">${cancellation_code}</span></p>
        </div>

        <p style="color: #666; font-size: 13px; line-height: 1.5;">If you need to modify or cancel your appointment, please contact us at (212) 949-6693 and provide your cancellation code.</p>
        
        <p style="color: #1a1a1a; font-weight: bold; margin-top: 25px;">We look forward to welcoming you!</p>
        <p style="color: #888; font-size: 12px; margin-top: 5px;">— Le Salon NYC Team</p>
      </div>
    `;

    const adminHtml = `
      <div style="font-family: Arial, sans-serif; padding: 24px; border: 1px solid #e6e1da; border-radius: 8px; max-width: 600px;">
        <h2 style="color: #b88e28; margin-top: 0;">New Online Reservation Received</h2>
        <p>A new customer has just booked an appointment through the website:</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 15px 0;" />
        <ul style="line-height: 2.0; font-size: 14px;">
          <li><strong>Customer Name:</strong> ${full_name}</li>
          <li><strong>Customer Email:</strong> ${email}</li>
          <li><strong>Customer Phone:</strong> ${phone}</li>
          <li><strong>Reserved Service:</strong> ${serviceName} (${durationMinutes} mins)</li>
          <li><strong>Scheduled Date & Time:</strong> ${formattedDateStr}</li>
          <li><strong>Special Notes:</strong> ${notes || 'None'}</li>
          <li><strong>Cancellation Code:</strong> ${cancellation_code}</li>
        </ul>
      </div>
    `;

    // Background email dispatch
    sendEmailViaAPI({ to: email.trim(), subject: `Thank you for booking with Le Salon NYC! (Ref: ${cancellation_code})`, html: clientHtml })
      .catch(err => console.error('Client email ERROR:', err.message));

    sendEmailViaAPI({ to: SALON_ADMIN_EMAIL, subject: `🚨 NEW BOOKING: ${full_name} - ${serviceName}`, html: adminHtml })
      .catch(err => console.error('Admin email ERROR:', err.message));

    return res.json({
      success: true,
      message: 'Booking successfully confirmed!',
      appointment_id: appointmentId,
      cancellation_code,
      email,
    });
  } catch (err) {
    console.error('Booking processing error:', err);
    return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});