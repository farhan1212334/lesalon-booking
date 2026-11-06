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

// Auto-sanitize environment variables (strip spaces from App Passwords)
const SMTP_USER = (process.env.SMTP_EMAIL || 'farhanumar442@gmail.com').trim();
const rawPass = process.env.SMTP_PASSWORD || '';
const SMTP_PASS = rawPass.replace(/\s+/g, '').trim(); 
const SALON_ADMIN_EMAIL = (process.env.SALON_NOTIFICATION_EMAIL || 'farhanumar442@gmail.com').trim();

// Configure Nodemailer for Render SSL compatibility (Port 465)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // SSL
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});

app.get('/', (req, res) => {
  res.send('Le Salon NYC API Server is Live.');
});

// Live Email Diagnostic Endpoint (Open in browser to verify setup)
app.get('/api/test-email', async (req, res) => {
  if (!SMTP_PASS) {
    return res.status(500).json({
      success: false,
      error: 'SMTP_PASSWORD environment variable is missing on Render.',
      fix: 'Add SMTP_PASSWORD in Render Dashboard -> Environment'
    });
  }

  try {
    await transporter.verify();
    
    const info = await transporter.sendMail({
      from: `"Le Salon NYC" <${SMTP_USER}>`,
      to: SALON_ADMIN_EMAIL,
      subject: 'Le Salon NYC - Diagnostic Email Test',
      html: `<div style="font-family: Arial; padding: 20px; border: 1px solid #c59b27; border-radius: 8px;">
              <h2>Email System is 100% Operational!</h2>
              <p>This test email confirms that <strong>farhanumar442@gmail.com</strong> is connected and sending messages properly from Render.</p>
             </div>`
    });

    res.json({
      success: true,
      message: `Diagnostic test email successfully sent to ${SALON_ADMIN_EMAIL}! Check your inbox.`,
      messageId: info.messageId
    });
  } catch (err) {
    console.error('Test email failure:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      code: err.code,
      hint: 'If error says 535 / Invalid login, double-check that 2-Step Verification is enabled on your Google account and you created a 16-character App Password.'
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

// Fetch Booked Slots for Real-Time Conflict Checking
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
    // 1. Fetch service details
    const serviceDetails = await pool.query('SELECT name, duration_minutes FROM services WHERE id = $1', [service_id]);
    const durationMinutes = parseInt(serviceDetails.rows[0]?.duration_minutes || 45, 10);
    const serviceName = serviceDetails.rows[0]?.name || 'Salon Service';

    // 2. Calculate end_time
    const startDate = new Date(start_time);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
    const end_time = endDate.toISOString();

    // 3. Customer lookup/create
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

    // 4. Generate Cancellation Code
    const cancellation_code = Math.random().toString(36).substring(2, 8).toUpperCase();

    // 5. Insert Appointment Record
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

    // 6. EMAIL 1: Automated Client Confirmation Email (From Le Salon NYC)
    const emailOptionsClient = {
      from: `"Le Salon NYC" <${SMTP_USER}>`,
      to: email.trim(),
      subject: `Thank you for booking with Le Salon NYC! (Ref: ${cancellation_code})`,
      html: `
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
      `,
    };

    // 7. EMAIL 2: Salon Admin Notification Sent to YOU (farhanumar442@gmail.com)
    const emailOptionsAdmin = {
      from: `"Le Salon Booking System" <${SMTP_USER}>`,
      to: SALON_ADMIN_EMAIL,
      subject: `🚨 NEW BOOKING: ${full_name} - ${serviceName}`,
      html: `
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
      `,
    };

    // Dispatch emails with full console tracking on Render
    if (SMTP_PASS) {
      transporter.sendMail(emailOptionsClient)
        .then(info => console.log('Client email sent:', info.messageId))
        .catch(err => console.error('Client email ERROR:', err.message));

      transporter.sendMail(emailOptionsAdmin)
        .then(info => console.log('Admin email sent:', info.messageId))
        .catch(err => console.error('Admin email ERROR:', err.message));
    } else {
      console.warn('SMTP_PASSWORD environment variable is missing on Render. Email dispatch skipped.');
    }

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