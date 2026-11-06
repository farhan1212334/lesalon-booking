const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const nodemailer = require('nodemailer');

dayjs.extend(utc);
dayjs.extend(timezone);
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// -------------------------------------------------------------
// 1. PostgreSQL Database Pool Setup
// -------------------------------------------------------------
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'lesalon_db',
  password: process.env.DB_PASSWORD || 'your_postgres_password',
  port: process.env.DB_PORT || 5432,
});

// Salon Operations Configuration
const SALON_TIMEZONE = 'America/New_York';
const SALON_EMAIL = process.env.SALON_NOTIFICATION_EMAIL || 'umarfarhan442@gmail.com';

// -------------------------------------------------------------
// 2. Nodemailer SMTP Transporter Setup
// -------------------------------------------------------------
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

// Verify SMTP connection on startup (non-blocking)
if (process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD) {
  transporter.verify((error) => {
    if (error) {
      console.warn('⚠️ Nodemailer SMTP Authentication Notice:', error.message);
      console.warn('📌 Appointments will still be saved, but verify your App Password in server/.env');
    } else {
      console.log('✅ SMTP Email Transporter ready to send automated confirmations.');
    }
  });
} else {
  console.warn('⚠️ SMTP_EMAIL or SMTP_PASSWORD missing in server/.env file. Emails will be logged locally.');
}

// -------------------------------------------------------------
// 3. API Endpoints
// -------------------------------------------------------------

// GET: Fetch Active Services Catalog
app.get('/api/services', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services WHERE is_active = true ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Database Fetch Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch services catalog from database.' });
  }
});

// GET: Availability Engine (New York Business Hours: 10:00 AM – 8:00 PM)
app.get('/api/availability', async (req, res) => {
  const { date, serviceId } = req.query; // Expected date format: YYYY-MM-DD
  if (!date || !serviceId) {
    return res.status(400).json({ error: 'Missing required query parameters: date and serviceId' });
  }

  try {
    // 1. Fetch requested service duration
    const serviceRes = await pool.query('SELECT duration_minutes FROM services WHERE id = $1', [serviceId]);
    if (serviceRes.rows.length === 0) {
      return res.status(404).json({ error: 'Selected service not found.' });
    }
    const duration = serviceRes.rows[0].duration_minutes;

    // 2. Query existing active bookings for the specified day in NYC timezone
    const dayStart = dayjs.tz(`${date} 00:00:00`, SALON_TIMEZONE).toISOString();
    const dayEnd = dayjs.tz(`${date} 23:59:59`, SALON_TIMEZONE).toISOString();

    const apptRes = await pool.query(
      `SELECT start_time, end_time FROM appointments 
       WHERE start_time >= $1 AND start_time <= $2 AND status != 'cancelled'`,
      [dayStart, dayEnd]
    );
    const existingBookings = apptRes.rows;

    // 3. Calculate 30-minute interval slots between 10 AM and 8 PM NYC time
    const availableSlots = [];
    let currentSlot = dayjs.tz(`${date} 10:00:00`, SALON_TIMEZONE);
    const closingTime = dayjs.tz(`${date} 20:00:00`, SALON_TIMEZONE);

    while (currentSlot.add(duration, 'minute').isBefore(closingTime) || currentSlot.add(duration, 'minute').isSame(closingTime)) {
      const slotStart = currentSlot.valueOf();
      const slotEnd = currentSlot.add(duration, 'minute').valueOf();

      // Check collision with existing salon appointments
      const hasOverlap = existingBookings.some(b => {
        const bStart = dayjs(b.start_time).valueOf();
        const bEnd = dayjs(b.end_time).valueOf();
        return slotStart < bEnd && slotEnd > bStart;
      });

      if (!hasOverlap) {
        availableSlots.push(currentSlot.toISOString());
      }
      currentSlot = currentSlot.add(30, 'minute');
    }

    res.json({ slots: availableSlots });
  } catch (err) {
    console.error('Availability Calculation Error:', err.message);
    res.status(500).json({ error: 'Failed to calculate available time slots.' });
  }
});

// POST: Book Appointment + Trigger Automated Emails
app.post('/api/appointments', async (req, res) => {
  const { fullName, email, phone, serviceId, staffId, startTime, notes } = req.body;

  if (!fullName || !email || !phone || !serviceId || !startTime) {
    return res.status(400).json({ error: 'Missing required booking fields.' });
  }

  try {
    // 1. Get service details
    const serviceRes = await pool.query('SELECT * FROM services WHERE id = $1', [serviceId]);
    if (serviceRes.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found.' });
    }
    const service = serviceRes.rows[0];
    const endTime = dayjs(startTime).add(service.duration_minutes, 'minute').toISOString();

    // 2. Find or create customer record
    let customerRes = await pool.query('SELECT id FROM customers WHERE email = $1', [email]);
    let customerId;
    if (customerRes.rows.length === 0) {
      const newCust = await pool.query(
        'INSERT INTO customers (full_name, email, phone) VALUES ($1, $2, $3) RETURNING id',
        [fullName, email, phone]
      );
      customerId = newCust.rows[0].id;
    } else {
      customerId = customerRes.rows[0].id;
    }

    // 3. Generate unique 6-character cancellation reference code
    const cancellationCode = crypto.randomBytes(3).toString('hex').toUpperCase();

    // 4. Save confirmed appointment in PostgreSQL
    const newAppt = await pool.query(
      `INSERT INTO appointments 
       (customer_id, staff_id, service_id, start_time, end_time, status, payment_method, cancellation_code, notes)
       VALUES ($1, $2, $3, $4, $5, 'confirmed', 'pay_at_salon', $6, $7) RETURNING *`,
      [customerId, staffId || 1, serviceId, startTime, endTime, cancellationCode, notes || '']
    );

    const formattedTime = dayjs(startTime).tz(SALON_TIMEZONE).format('dddd, MMMM D, YYYY [at] h:mm A');

    // -------------------------------------------------------------
    // AUTOMATED EMAIL 1: CUSTOMER CONFIRMATION
    // -------------------------------------------------------------
    const customerMailOptions = {
      from: `"Le Salon NYC" <${process.env.SMTP_EMAIL || 'no-reply@lesalonnyc.com'}>`,
      to: email,
      subject: 'Appointment Confirmation — Le Salon NYC',
      html: `
        <div style="font-family: Georgia, serif; max-width: 580px; margin: 0 auto; padding: 30px; border: 1px solid #efece6; background-color: #faf8f5; color: #2c2a29;">
          <h2 style="color: #1a1a1a; text-transform: uppercase; text-align: center; font-size: 26px; letter-spacing: 2px; margin-bottom: 4px;">LE SALON NYC</h2>
          <p style="text-align: center; font-size: 11px; text-transform: uppercase; color: #4a5d4e; letter-spacing: 2px; margin-top: 0; font-family: sans-serif; font-weight: 600;">Clean Beauty & Organic Hair Care</p>
          <hr style="border: none; border-top: 1px solid #efece6; margin: 24px 0;" />
          
          <p style="font-size: 15px;">Dear <strong>${fullName}</strong>,</p>
          <p style="font-size: 14px; color: #57534e; line-height: 1.6;">Thank you for booking with Le Salon NYC. Your appointment has been successfully reserved!</p>
          
          <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; border: 1px solid #efece6; margin: 24px 0; font-family: sans-serif; font-size: 13px; color: #374151;">
            <p style="margin: 6px 0;"><strong>Service:</strong> ${service.name}</p>
            <p style="margin: 6px 0;"><strong>Date & Time:</strong> ${formattedTime} (EST)</p>
            <p style="margin: 6px 0;"><strong>Location:</strong> 310 East 44th St, Manhattan, NY 10017</p>
            <p style="margin: 6px 0;"><strong>Payment Terms:</strong> Pay in full at salon upon arrival</p>
            <p style="margin: 12px 0 0 0; padding-top: 10px; border-top: 1px dashed #e5e7eb; color: #6b7280; font-size: 12px;">
              Cancellation Reference: <strong style="color: #111827; letter-spacing: 1px;">${cancellationCode}</strong>
            </p>
          </div>

          <p style="font-size: 13px; color: #57534e; line-height: 1.5; font-family: sans-serif;">
            🌿 <strong>Need to adjust your plans?</strong> Please call the salon directly at <strong>(212) 949-6693</strong> and provide your cancellation reference code.
          </p>
          
          <p style="margin-top: 30px; font-size: 13px; text-align: center; color: #7e7a75; font-family: sans-serif;">
            We look forward to seeing you!<br>
            <strong style="color: #2c2a29;">Le Salon NYC Team</strong>
          </p>
        </div>
      `
    };

    // -------------------------------------------------------------
    // AUTOMATED EMAIL 2: SALON OWNER / ADMIN ALERT (ASHRAF)
    // -------------------------------------------------------------
    const salonMailOptions = {
      from: `"Booking System" <${process.env.SMTP_EMAIL || 'no-reply@lesalonnyc.com'}>`,
      to: SALON_EMAIL,
      subject: `🚨 New Online Booking: ${service.name} - ${fullName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 550px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; background-color: #ffffff;">
          <h3 style="color: #4a5d4e; margin-top: 0;">New Appointment Booked Online</h3>
          <table style="width: 100%; text-align: left; border-collapse: collapse; font-size: 14px;">
            <tr><th style="padding: 6px 0; border-bottom: 1px solid #f3f4f6;">Customer:</th><td style="padding: 6px 0; border-bottom: 1px solid #f3f4f6;">${fullName}</td></tr>
            <tr><th style="padding: 6px 0; border-bottom: 1px solid #f3f4f6;">Email:</th><td style="padding: 6px 0; border-bottom: 1px solid #f3f4f6;"><a href="mailto:${email}">${email}</a></td></tr>
            <tr><th style="padding: 6px 0; border-bottom: 1px solid #f3f4f6;">Phone:</th><td style="padding: 6px 0; border-bottom: 1px solid #f3f4f6;"><a href="tel:${phone}">${phone}</a></td></tr>
            <tr><th style="padding: 6px 0; border-bottom: 1px solid #f3f4f6;">Service:</th><td style="padding: 6px 0; border-bottom: 1px solid #f3f4f6;">${service.name}</td></tr>
            <tr><th style="padding: 6px 0; border-bottom: 1px solid #f3f4f6;">Date/Time:</th><td style="padding: 6px 0; border-bottom: 1px solid #f3f4f6;">${formattedTime}</td></tr>
            <tr><th style="padding: 6px 0; border-bottom: 1px solid #f3f4f6;">Notes:</th><td style="padding: 6px 0; border-bottom: 1px solid #f3f4f6;">${notes || 'None'}</td></tr>
            <tr><th style="padding: 6px 0;">Ref Code:</th><td style="padding: 6px 0;"><strong>${cancellationCode}</strong></td></tr>
          </table>
        </div>
      `
    };

    // Asynchronously dispatch emails without delaying the client HTTP response
    if (process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD) {
      transporter.sendMail(customerMailOptions).catch(err => console.error('❌ Failed to send Customer Email:', err.message));
      transporter.sendMail(salonMailOptions).catch(err => console.error('❌ Failed to send Salon Alert Email:', err.message));
    } else {
      console.log('📌 Email sending skipped (SMTP credentials not configured in server/.env)');
    }

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully.',
      appointment: newAppt.rows[0]
    });
  } catch (err) {
    console.error('Booking Creation Error:', err.message);
    res.status(500).json({ error: 'Failed to create appointment.' });
  }
});

// -------------------------------------------------------------
// 4. Start Server
// -------------------------------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 Le Salon NYC API running on port ${PORT}`);
  console.log(`📍 Operating Timezone: ${SALON_TIMEZONE}`);
  console.log(`===================================================`);
});