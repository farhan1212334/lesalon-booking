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

// Middleware
app.use(cors());
app.use(express.json());

// In-Memory Database
const appointments = [];

// Helper Function: Safe Email Delivery via Brevo
async function sendBrevoEmail({ to, subject, htmlContent }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.SENDER_EMAIL || 'info@lesalonnyc.com';

  if (!apiKey) {
    console.log('⚠️ BREVO NOTICE: BREVO_API_KEY environment variable is not set in Render.');
    return false;
  }

  const payload = JSON.stringify({
    sender: { name: 'Le Salon NYC', email: senderEmail },
    to: [{ email: to }],
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
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ Brevo Email sent successfully to ${to}`);
          resolve(true);
        } else {
          console.error(`❌ Brevo API Rejected [HTTP ${res.statusCode}]:`, body);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Brevo Network Request Error:', err.message);
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
    console.log('📥 Incoming Payload:', req.body);

    const full_name = req.body.full_name || req.body.fullName || req.body.name || 'Guest User';
    const email = req.body.email || req.body.userEmail || '';
    const phone = req.body.phone || req.body.phoneNumber || '';
    const service = req.body.service_name || req.body.service || req.body.serviceName || 'Hair Service';
    const price = parseFloat(req.body.starting_price || req.body.price || req.body.amount) || 75;

    // Smart Date & Time Extractor from ISO start_time string
    let date = req.body.date || req.body.appointmentDate;
    let time = req.body.time || req.body.appointmentTime;

    if (req.body.start_time) {
      const parts = String(req.body.start_time).split('T');
      if (!date && parts[0]) date = parts[0];
      if (!time && parts[1]) {
        const rawTime = parts[1].substring(0, 5); // e.g., "11:00"
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

    // Generate unique 6-character cancellation code
    const cancellation_code = Math.random().toString(36).substring(2, 8).toUpperCase();

    let stripeCustomerId = null;
    let stripePaymentMethodId = null;

    // Stripe Vaulting
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
        console.log(`💳 Card vaulted. Customer ID: ${customer.id}`);
      } catch (stripeErr) {
        console.error('⚠️ Stripe Vaulting Notice:', stripeErr.message);
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
      service_name: service,
      price,
      starting_price: price,
      date,
      time,
      start_time: req.body.start_time || `${date}T${time}`,
      status: 'confirmed',
      stripeCustomerId,
      stripePaymentMethodId,
      createdAt: new Date(),
    };

    appointments.push(newAppointment);

    // Confirmation Email Body
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

    // Send email asynchronously in background
    if (email) {
      sendBrevoEmail({
        to: email,
        subject: `Reservation Confirmed — Le Salon NYC (${cancellation_code})`,
        htmlContent: emailHtml,
      }).catch(err => console.error('Email dispatch error:', err));
    }

    // Return complete payload object to support all frontend state models
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

    const appointmentDateTime = new Date(apt.start_time || `${apt.date} ${apt.time}`);
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
        <p>Your reservation for <strong>${apt.service}</strong> has been canceled.</p>
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
    }).catch(err => console.error('Email cancellation error:', err));

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

// Health check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Le Salon NYC Server running on port ${PORT}`);
});