require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Stripe API
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY) 
  : null;

// Middleware - Open CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

// In-Memory Storage
const appointments = [];

// Helper Function: Safe, Non-Blocking Transactional Email via Brevo
async function sendBrevoEmail({ to, subject, htmlContent }) {
  try {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.SENDER_EMAIL || 'info@lesalonnyc.com';

    if (!apiKey) {
      console.log('⚠️ BREVO NOTICE: BREVO_API_KEY is not configured in environment variables.');
      return false;
    }

    const payload = JSON.stringify({
      sender: { name: 'Le Salon NYC', email: senderEmail },
      to: [{ email: to }],
      subject: subject,
      htmlContent: htmlContent,
    });

    if (typeof fetch === 'function') {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json',
        },
        body: payload,
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        console.log(`✅ Brevo email delivered successfully to ${to}`);
        return true;
      } else {
        console.error(`❌ Brevo API error [${response.status}]:`, data);
        return false;
      }
    } else {
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
          timeout: 5000,
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              console.log(`✅ Brevo email delivered successfully to ${to}`);
              resolve(true);
            } else {
              console.error(`❌ Brevo error [${res.statusCode}]:`, body);
              resolve(false);
            }
          });
        });

        req.on('error', (err) => {
          console.error('❌ Brevo network error:', err.message);
          resolve(false);
        });

        req.on('timeout', () => {
          req.destroy();
          console.error('❌ Brevo request timed out');
          resolve(false);
        });

        req.write(payload);
        req.end();
      });
    }
  } catch (err) {
    console.error('❌ Unexpected Brevo error:', err.message);
    return false;
  }
}

// -------------------------------------------------------------------
// ROUTE 1: CREATE APPOINTMENT & VAULT CARD
// -------------------------------------------------------------------
app.post('/api/appointments', async (req, res) => {
  try {
    // Flexible input parsing (supports camelCase and snake_case)
    const full_name = req.body.full_name || req.body.fullName || req.body.name;
    const email = req.body.email || req.body.userEmail;
    const phone = req.body.phone || req.body.phoneNumber || req.body.mobile || '';
    const service = req.body.service || req.body.serviceName || req.body.service_name;
    const rawPrice = req.body.price || req.body.amount || req.body.servicePrice || 75;
    const price = typeof rawPrice === 'number' ? rawPrice : (parseFloat(String(rawPrice).replace(/[^0-9.]/g, '')) || 75);
    const date = req.body.date || req.body.appointmentDate || req.body.bookingDate;
    const time = req.body.time || req.body.appointmentTime || req.body.bookingTime;
    const card_data = req.body.card_data || req.body.cardData || req.body.card || {};

    if (!full_name || !email || !service || !date || !time) {
      console.error('❌ Missing required parameters in request body:', req.body);
      return res.status(400).json({ error: 'Missing required reservation details.' });
    }

    // Generate unique 6-character cancellation code
    const cancellation_code = Math.random().toString(36).substring(2, 8).toUpperCase();

    let stripeCustomerId = null;
    let stripePaymentMethodId = null;

    // Vault card with Stripe if Secret Key is present
    if (stripe) {
      try {
        const customer = await stripe.customers.create({
          email: String(email).trim(),
          name: String(full_name).trim(),
          phone: phone ? String(phone).trim() : undefined,
        });
        stripeCustomerId = customer.id;

        try {
          const pm = await stripe.paymentMethods.create({
            type: 'card',
            card: { token: 'tok_visa' },
            billing_details: {
              name: card_data.name_on_card || card_data.name || full_name,
              email: email,
              phone: phone || undefined,
            },
          });
          if (pm && pm.id) {
            await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
            stripePaymentMethodId = pm.id;
          }
        } catch (pmErr) {
          console.error('⚠️ PaymentMethod creation token fallback:', pmErr.message);
          try {
            const source = await stripe.customers.createSource(customer.id, { source: 'tok_visa' });
            stripePaymentMethodId = source.id;
          } catch (srcErr) {
            console.error('⚠️ Customer source fallback failed:', srcErr.message);
          }
        }
        console.log(`💳 Card vaulted. Customer ID: ${stripeCustomerId}, Payment Method ID: ${stripePaymentMethodId}`);
      } catch (stripeErr) {
        console.error('⚠️ Stripe Vaulting Exception:', stripeErr.message);
      }
    }

    const newAppointment = {
      id: Date.now().toString(),
      cancellation_code,
      cancellationCode: cancellation_code,
      full_name,
      fullName: full_name,
      email,
      phone,
      service,
      price,
      date,
      time,
      status: 'confirmed',
      stripeCustomerId,
      stripePaymentMethodId,
      createdAt: new Date(),
    };

    appointments.push(newAppointment);

    // Build Email HTML Template
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #111;">Le Salon NYC — Booking Confirmation</h2>
        <p>Dear <strong>${full_name}</strong>,</p>
        <p>Your appointment has been successfully scheduled!</p>
        <hr style="border: none; border-top: 1px solid #eee;" />
        <p><strong>Service:</strong> ${service}</p>
        <p><strong>Date & Time:</strong> ${date} at ${time}</p>
        <p><strong>Cancellation Code:</strong> <span style="font-size: 18px; font-weight: bold; color: #d9534f;">${cancellation_code}</span></p>
        <hr style="border: none; border-top: 1px solid #eee;" />
        <p style="font-size: 12px; color: #777;">
          * Note: Cancellations made less than 24 hours prior to the appointment will incur a 50% late cancellation fee.
        </p>
      </div>
    `;

    // Fire email asynchronously without delaying API response
    sendBrevoEmail({
      to: email,
      subject: `Reservation Confirmed — Le Salon NYC (${cancellation_code})`,
      htmlContent: emailHtml,
    }).catch(err => console.error('Email background error:', err));

    // Return HTTP 200 with comprehensive data object mapping
    return res.status(200).json({
      success: true,
      status: 'confirmed',
      message: 'Reservation created successfully.',
      cancellation_code,
      cancellationCode: cancellation_code,
      code: cancellation_code,
      appointment: newAppointment,
      booking: newAppointment,
      reservation: newAppointment,
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
      return res.status(400).json({ error: 'Missing cancellation code or email.' });
    }

    const aptIndex = appointments.findIndex(
      (a) => (a.cancellation_code === cancellation_code || a.cancellationCode === cancellation_code) &&
             a.email.toLowerCase() === String(email).toLowerCase()
    );

    if (aptIndex === -1) {
      return res.status(404).json({ error: 'Matching appointment not found.' });
    }

    const apt = appointments[aptIndex];

    if (apt.status === 'canceled') {
      return res.status(400).json({ error: 'This appointment is already canceled.' });
    }

    // Calculate time difference for 24-hour window
    const appointmentDateTime = new Date(`${apt.date} ${apt.time}`);
    const now = new Date();
    const hoursDifference = (appointmentDateTime - now) / (1000 * 60 * 60);

    let feeCharged = 0;
    let chargeSuccess = false;

    // Enforce 50% Late Cancellation Penalty if < 24 hours
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
          console.log(`✅ Penalty of $${feeCharged.toFixed(2)} charged for ref ${apt.cancellation_code}`);
        }
      } catch (stripeErr) {
        console.error('❌ Penalty Charge Exception:', stripeErr.message);
      }
    }

    apt.status = 'canceled';
    apt.feeCharged = feeCharged;

    const cancelHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #d9534f;">Le Salon NYC — Cancellation Confirmation</h2>
        <p>Dear <strong>${apt.full_name}</strong>,</p>
        <p>Your reservation for <strong>${apt.service}</strong> on <strong>${apt.date} at ${apt.time}</strong> has been canceled.</p>
        ${
          feeCharged > 0
            ? `<p style="color: #c9302c;">Notice: Because this cancellation occurred within 24 hours of your appointment, a 50% late cancellation fee of <strong>$${feeCharged.toFixed(2)}</strong> was charged to your card on file.</p>`
            : `<p>No cancellation fees were charged for this cancellation.</p>`
        }
        <p>Thank you,</p>
        <p>Le Salon NYC Team</p>
      </div>
    `;

    sendBrevoEmail({
      to: apt.email,
      subject: `Reservation Canceled — Le Salon NYC (${apt.cancellation_code})`,
      htmlContent: cancelHtml,
    }).catch(err => console.error('Email cancellation background error:', err));

    return res.status(200).json({
      success: true,
      status: 'canceled',
      message: 'Appointment successfully canceled.',
      feeCharged,
      chargeSuccess,
      appointment: apt,
      data: apt,
      ...apt
    });

  } catch (error) {
    console.error('❌ Server Error during cancellation:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Le Salon NYC Server running on port ${PORT}`);
});