const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Configure Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

app.get('/', (req, res) => {
  res.send('Le Salon NYC API Server is Live.');
});

// Get Services Catalog
app.get('/api/services', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Database query error:', err);
    res.status(500).json({ error: 'Failed to retrieve services' });
  }
});

// Fetch Booked Slots for a Specific Date
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
    // 1. Fetch service details to get exact duration_minutes & name
    const serviceDetails = await pool.query('SELECT name, duration_minutes FROM services WHERE id = $1', [service_id]);
    const durationMinutes = parseInt(serviceDetails.rows[0]?.duration_minutes || 45, 10);
    const serviceName = serviceDetails.rows[0]?.name || 'Salon Service';

    // 2. Calculate end_time based on duration
    const startDate = new Date(start_time);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
    const end_time = endDate.toISOString();

    // 3. Create or fetch existing customer
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

    // 4. Generate random 6-character cancellation code
    const cancellation_code = Math.random().toString(36).substring(2, 8).toUpperCase();

    // 5. Insert appointment record (Including calculated end_time)
    let appointmentResult;
    try {
      appointmentResult = await pool.query(
        `INSERT INTO appointments (customer_id, service_id, start_time, end_time, notes, cancellation_code, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'confirmed')
         RETURNING id`,
        [customerId, service_id, start_time, end_time, notes || '', cancellation_code]
      );
    } catch (dbSchemaErr) {
      console.warn('Full schema insert fallback:', dbSchemaErr.message);
      appointmentResult = await pool.query(
        `INSERT INTO appointments (customer_id, service_id, start_time, end_time, notes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [customerId, service_id, start_time, end_time, notes || '']
      );
    }

    // 6. Send Email Notifications (Safe execution)
    if (process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD) {
      try {
        const emailOptionsClient = {
          from: `"Le Salon NYC" <${process.env.SMTP_EMAIL}>`,
          to: email,
          subject: `Appointment Confirmation - Le Salon NYC (${cancellation_code})`,
          html: `
            <div style="font-family: Arial, sans-serif; background-color: #faf8f5; color: #1a1a1a; padding: 24px; border-radius: 8px; border: 1px solid #e5e0d8;">
              <h2 style="color: #b58900; font-family: Georgia, serif;">Le Salon NYC</h2>
              <p>Dear ${full_name},</p>
              <p>Your appointment has been confirmed!</p>
              <ul style="line-height: 1.8;">
                <li><strong>Service:</strong> ${serviceName}</li>
                <li><strong>Date & Time:</strong> ${new Date(start_time).toLocaleString()}</li>
                <li><strong>Location:</strong> 310 East 44th St, Manhattan, NY</li>
                <li><strong>Cancellation Code:</strong> ${cancellation_code}</li>
              </ul>
              <p>Thank you for choosing Le Salon NYC.</p>
            </div>
          `,
        };

        const emailOptionsSalon = {
          from: `"Le Salon Booking" <${process.env.SMTP_EMAIL}>`,
          to: process.env.SALON_NOTIFICATION_EMAIL || process.env.SMTP_EMAIL,
          subject: `NEW BOOKING: ${full_name} - ${serviceName}`,
          html: `
            <h3>New Appointment Received</h3>
            <p><strong>Customer:</strong> ${full_name} (${email}, ${phone})</p>
            <p><strong>Service:</strong> ${serviceName}</p>
            <p><strong>Time:</strong> ${new Date(start_time).toLocaleString()}</p>
            <p><strong>Notes:</strong> ${notes || 'None'}</p>
            <p><strong>Cancellation Code:</strong> ${cancellation_code}</p>
          `,
        };

        await transporter.sendMail(emailOptionsClient);
        await transporter.sendMail(emailOptionsSalon);
      } catch (emailErr) {
        console.error('Email error (non-fatal):', emailErr.message);
      }
    }

    return res.json({
      success: true,
      message: 'Booking successfully confirmed!',
      appointment_id: appointmentResult.rows[0].id,
      cancellation_code,
      email,
    });
  } catch (err) {
    console.error('Booking processing error:', err);
    return res.status(500).json({ success: false, message: 'Server error processing appointment: ' + err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});