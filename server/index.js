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

// In-Memory Database (Replace with persistent DB if applicable)
const appointments = [];

// Helper Function: Safe Email Delivery via Brevo REST API using Native HTTPS
async function sendBrevoEmail({ to, subject, htmlContent }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.SENDER_EMAIL || 'info@lesalonnyc.com';

  if (!apiKey) {
    console.error('⚠️ BREVO NOTICE: BREVO_API_KEY environment variable is missing in Render.');
    return false;
  }

  const postData = JSON.stringify({
    sender: { name: 'Le Salon NYC', email: senderEmail },
    to: [{ email: to }],
    subject: subject,
    htmlContent: htmlContent,
  });

  const options = {
    hostname: 'api.brevo.com',
    port: 443,
    path: '/v3/smtp/email',
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
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

    req.write(postData);
    req.end();
  });
}

// -------------------------------------------------------------------
// ROUTE 1: CREATE APPOINTMENT & VAULT CARD
// -------------------------------------------------------------------
app.post('/api/appointments', async (req, res) => {
  try {
    const { full_name, email, phone, service, price, date, time, card_data } = req.body;

    if (!full_name || !email || !service || !date || !time) {
      return res.status(400).json({ error: 'Missing required reservation details.' });
    }

    // Generate unique 6-character cancellation code
    const cancellation_code = Math.random().toString(36).substring(2, 8).toUpperCase();

    let stripeCustomerId = null;
    let stripePaymentMethodId = null;

    // Vault card with Stripe if Stripe key exists
    if (stripe) {
      try {
        // 1. Create Customer in Stripe
        const customer = await stripe.customers.create({
          email: email.trim(),
          name: full_name.trim(),
          phone: phone ? phone.trim() : undefined,
        });
        stripeCustomerId = customer.id;

        // 2. Tokenize card via official test token 'tok_visa'
        const pm = await stripe.paymentMethods.create({
          type: 'card',
          card: { token: 'tok_visa' },
          billing_details: {
            name: (card_data && card_data.name_on_card) || full_name,
            email: email,
            phone: phone || undefined,
          },
        });

        // 3. Attach payment method to customer profile
        await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
        stripePaymentMethodId = pm.id;
        console.log(`💳 Card vaulted successfully for customer: ${customer.id}`);
      } catch (stripeErr) {
        console.error('⚠️ Stripe Vaulting Notice:', stripeErr.message);
      }
    }

    const newAppointment = {
      id: Date.now().toString(),
      cancellation_code,
      full_name,
      email,
      phone: phone || '',
      service,
      price: parseFloat(price) || 75,
      date,
      time,
      status: 'confirmed',
      stripeCustomerId,
      stripePaymentMethodId,
      createdAt: new Date(),
    };

    appointments.push(newAppointment);

    // Build Confirmation Email Content
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

    // Dispatch email safely without blocking the web confirmation page
    sendBrevoEmail({
      to: email,
      subject: `Reservation Confirmed — Le Salon NYC (${cancellation_code})`,
      htmlContent: emailHtml,
    }).catch(err => console.error('Email dispatch error:', err));

    // Return complete appointment data formatted for any frontend layout
    return res.status(201).json({
      success: true,
      message: 'Reservation created successfully.',
      cancellation_code,
      appointment: newAppointment,
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
    const { cancellation_code, email } = req.body;

    const aptIndex = appointments.findIndex(
      (a) => a.cancellation_code === cancellation_code && a.email.toLowerCase() === email.toLowerCase()
    );

    if (aptIndex === -1) {
      return res.status(404).json({ error: 'Matching appointment not found.' });
    }

    const apt = appointments[aptIndex];

    if (apt.status === 'canceled') {
      return res.status(400).json({ error: 'This appointment is already canceled.' });
    }

    // Calculate time difference to check 24-hour window
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
          console.log(`✅ Penalty of $${feeCharged.toFixed(2)} processed for ${apt.cancellation_code}`);
        }
      } catch (stripeErr) {
        console.error('❌ Penalty Charge Failed:', stripeErr.message);
      }
    }

    apt.status = 'canceled';
    apt.feeCharged = feeCharged;

    // Build Cancellation Email Content
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

    // Dispatch cancellation email safely
    sendBrevoEmail({
      to: apt.email,
      subject: `Reservation Canceled — Le Salon NYC (${apt.cancellation_code})`,
      htmlContent: cancelHtml,
    }).catch(err => console.error('Email dispatch error:', err));

    return res.status(200).json({
      success: true,
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Le Salon NYC Server running on port ${PORT}`);
});