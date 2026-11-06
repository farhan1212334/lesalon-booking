const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// Enable CORS for Vercel and all clients
app.use(cors());
app.use(express.json());

// PostgreSQL Connection Pool (Neon.tech)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Nodemailer Gmail SMTP Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Le Salon NYC API Server is Live & Operational.');
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

// Create New Appointment
app.post('/api/appointments', async (req, res) => {
  const { service_id, start_time, full_name, email, phone, notes } = req.body;

  if (!service_id || !start_time || !full_name || !email || !phone) {
    return res.status(400).json({ success: false, message: 'Missing required booking fields' });
  }

  try {
    // 1. Create or fetch existing customer
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

    // 2. Generate random 6-character cancellation code
    const cancellation_code = Math.random().toString(36).substring(2, 8).toUpperCase();

    // 3. Insert appointment record
    const appointmentResult = await pool.query(
      `INSERT INTO appointments (customer_id, service_id, start_time, notes, cancellation_code, status)
       VALUES ($1, $2, $3, $4, $5, 'confirmed')
       RETURNING id`,
      [customerId, service_id, start_time, notes || '', cancellation_code]
    );

    // 4. Fetch service details for email
    const serviceDetails = await pool.query('SELECT name FROM services WHERE id = $1', [service_id]);
    const serviceName = serviceDetails.rows[0]?.name || 'Salon Service';

    // 5. Send Email Notifications
    const emailOptionsClient = {
      from: `"Le Salon NYC" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: `Appointment Confirmation - Le Salon NYC (${cancellation_code})`,
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #000; color: #fff; padding: 20px; border-radius: 8px;">
          <h2 style="color: #fbbf24;">Le Salon NYC</h2>
          <p>Dear ${full_name},</p>
          <p>Your appointment has been successfully scheduled!</p>
          <ul>
            <li><strong>Service:</strong> ${serviceName}</li>
            <li><strong>Date & Time:</strong> ${new Date(start_time).toLocaleString()}</li>
            <li><strong>Location:</strong> 310 East 44th St, Manhattan</li>
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

    res.json({
      success: true,
      message: 'Booking successfully confirmed!',
      appointment_id: appointmentResult.rows[0].id,
      cancellation_code,
      email,
    });
  } catch (err) {
    console.error('Booking processing error:', err);
    res.status(500).json({ success: false, message: 'Server error processing appointment' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});