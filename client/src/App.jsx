import React, { useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://lesalon-booking.onrender.com';

const SERVICES = [
  { id: 1, service_name: 'Shampoo Haircut & Blow Dry', starting_price: 75, duration_minutes: 75, category: 'Haircut & Styling' },
  { id: 2, service_name: 'Shampoo & Blow Dry', starting_price: 40, duration_minutes: 45, category: 'Haircut & Styling' },
  { id: 3, service_name: 'Single Process Color', starting_price: 100, duration_minutes: 75, category: 'Color Services' },
  { id: 4, service_name: 'Single Process Color & Blow Dry', starting_price: 130, duration_minutes: 120, category: 'Color Services' },
  { id: 5, service_name: 'Full Head Highlights', starting_price: 250, duration_minutes: 120, category: 'Highlights' },
  { id: 6, service_name: 'Full Head Highlights & Blow Dry', starting_price: 280, duration_minutes: 150, category: 'Highlights' },
  { id: 7, service_name: 'Keratin Protein Treatment', starting_price: 320, duration_minutes: 150, category: 'Treatments' },
];

const PROFESSIONALS = [
  { id: 'any', name: 'Any Professional', title: 'First available stylist' },
  { id: 'ashraf', name: 'Ashraf', title: 'Master Stylist & Owner' },
  { id: 'ricardo', name: 'Ricardo', title: 'Senior Colorist & Stylist' }
];

function generateTimeSlots(durationMinutes) {
  const slots = [];
  const startHour = 10;
  const endHour = 20;

  let currentMinutes = startHour * 60;
  const maxMinutes = endHour * 60 - durationMinutes;

  while (currentMinutes <= maxMinutes) {
    const startH = Math.floor(currentMinutes / 60);
    const startM = currentMinutes % 60;
    const startAmpm = startH >= 12 ? 'PM' : 'AM';
    const startH12 = startH % 12 || 12;
    const startTimeStr = `${startH12}:${startM === 0 ? '00' : startM} ${startAmpm}`;

    const endMinutes = currentMinutes + durationMinutes;
    const endH = Math.floor(endMinutes / 60);
    const endM = endMinutes % 60;
    const endAmpm = endH >= 12 ? 'PM' : 'AM';
    const endH12 = endH % 12 || 12;
    const endTimeStr = `${endH12}:${endM === 0 ? '00' : endM} ${endAmpm}`;

    slots.push({
      value: startTimeStr,
      label: `${startTimeStr} – ${endTimeStr} (${durationMinutes} min duration)`
    });

    currentMinutes += 30;
  }
  return slots;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('book');
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedService, setSelectedService] = useState(SERVICES[0]);
  const [selectedProfessional, setSelectedProfessional] = useState(PROFESSIONALS[0]);
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);
  
  const availableSlots = generateTimeSlots(selectedService.duration_minutes);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(availableSlots[0]?.value || '10:00 AM');

  const [guest, setGuest] = useState({ fullName: '', email: '', phone: '', comments: '' });
  const [card, setCard] = useState({ nameOnCard: '', cardNumber: '', expiry: '', cvc: '' });
  const [agreedTerms, setAgreedTerms] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const [cancelCode, setCancelCode] = useState('');
  const [cancelEmail, setCancelEmail] = useState('');
  const [cancelResult, setCancelResult] = useState(null);
  const [cancelError, setCancelError] = useState('');

  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    if (!agreedTerms) {
      setErrorMessage('Please check the box to agree to the Le Salon NYC cancellation policy terms.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    const payload = {
      full_name: guest.fullName,
      email: guest.email,
      phone: guest.phone,
      service_name: selectedService.service_name,
      starting_price: selectedService.starting_price,
      duration_minutes: selectedService.duration_minutes,
      start_time: `${bookingDate}T${selectedTimeSlot}`,
      date: bookingDate,
      time: selectedTimeSlot,
      notes: guest.comments,
      card_data: {
        name_on_card: card.nameOnCard || guest.fullName,
        card_number: card.cardNumber,
        expiry: card.expiry,
        cvc: card.cvc,
      }
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && (data.success || data.cancellation_code || data.cancellationCode)) {
        setBookingResult(data);
      } else {
        setErrorMessage(data.error || 'Unable to process reservation. Please check input details.');
      }
    } catch (err) {
      setErrorMessage('Network connection error. Server may be starting up, please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setCancelError('');
    setCancelResult(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancellation_code: cancelCode.trim().toUpperCase(), email: cancelEmail.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setCancelResult(data);
      } else {
        setCancelError(data.error || 'Unable to locate matching appointment.');
      }
    } catch (err) {
      setCancelError('Network error connecting to server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Header Navigation */}
      <header className="app-header">
        <div className="header-inner">
          <div>
            <div className="brand-title">LE SALON NYC</div>
            <div className="brand-subtitle">Exclusively Organic</div>
          </div>
          <nav className="nav-buttons">
            <button
              className={`header-btn ${activeTab === 'book' ? 'active' : ''}`}
              onClick={() => { setActiveTab('book'); setCurrentStep(1); setBookingResult(null); }}
            >
              Book Service
            </button>
            <button
              className={`header-btn ${activeTab === 'manage' ? 'active' : ''}`}
              onClick={() => { setActiveTab('manage'); setCancelResult(null); }}
            >
              Manage / Cancel
            </button>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="main-container">
        {activeTab === 'book' ? (
          bookingResult ? (
            /* Confirmation Screen */
            <div className="info-card" style={{ textAlign: 'center', padding: '32px 20px' }}>
              <div style={{ fontSize: '2.5rem', color: '#059669', marginBottom: '10px' }}>✓</div>
              <h2 className="font-serif" style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Reservation Confirmed!</h2>
              <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '16px' }}>
                Confirmation receipt sent to <strong>{guest.email}</strong>.
              </p>
              
              <div style={{ background: '#fafafa', border: '1px solid #e8e6e1', borderRadius: '8px', padding: '14px', textAlign: 'left', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ color: '#777', fontSize: '0.85rem' }}>Reference Code:</span>
                  <strong style={{ fontFamily: 'monospace', fontSize: '1rem', color: '#111' }}>{bookingResult.cancellation_code || bookingResult.cancellationCode}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ color: '#777', fontSize: '0.85rem' }}>Service:</span>
                  <strong style={{ fontSize: '0.85rem' }}>{selectedService.service_name}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ color: '#777', fontSize: '0.85rem' }}>Date & Time:</span>
                  <span style={{ fontSize: '0.85rem' }}>{bookingDate} at {selectedTimeSlot}</span>
                </div>
              </div>

              <button className="confirm-action-btn" onClick={() => { setBookingResult(null); setCurrentStep(1); }}>
                Book Another Service
              </button>
            </div>
          ) : (
            <div>
              {/* Step Nav Bar */}
              <div className="step-nav-bar">
                <span className={`step-nav-item ${currentStep === 1 ? 'active' : ''}`} onClick={() => setCurrentStep(1)}>
                  1. Services
                </span>
                <span className={`step-nav-item ${currentStep === 2 ? 'active' : ''}`} onClick={() => setCurrentStep(2)}>
                  2. Professional
                </span>
                <span className={`step-nav-item ${currentStep === 3 ? 'active' : ''}`} onClick={() => setCurrentStep(3)}>
                  3. Time
                </span>
                <span className={`step-nav-item ${currentStep === 4 ? 'active' : ''}`} onClick={() => setCurrentStep(4)}>
                  4. Confirm & Card
                </span>
              </div>

              {/* STEP 1: Services */}
              {currentStep === 1 && (
                <div>
                  {SERVICES.map((s) => {
                    const isSelected = selectedService.id === s.id;
                    return (
                      <div key={s.id} className="service-card-compact">
                        <div className="service-info">
                          <span className="service-name">{s.service_name}</span>
                          <span className="service-meta">⏱ {s.duration_minutes} Mins • {s.category}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>${s.starting_price}</span>
                          <button
                            className={`add-btn ${isSelected ? 'added' : ''}`}
                            onClick={() => setSelectedService(s)}
                          >
                            {isSelected ? '✓ Added' : '+ Add'}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <div className="btn-group">
                    <button className="confirm-action-btn" onClick={() => setCurrentStep(2)}>
                      Continue to Professional → (${selectedService.starting_price})
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Professional */}
              {currentStep === 2 && (
                <div>
                  <h3 className="font-serif" style={{ marginBottom: '14px' }}>Select Professional</h3>
                  {PROFESSIONALS.map((p) => {
                    const isSelected = selectedProfessional.id === p.id;
                    return (
                      <div
                        key={p.id}
                        className="service-card-compact"
                        style={{ cursor: 'pointer', border: isSelected ? '2px solid #c59b27' : '1px solid #e8e6e1' }}
                        onClick={() => setSelectedProfessional(p)}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#777' }}>{p.title}</div>
                        </div>
                        <button className={`add-btn ${isSelected ? 'added' : ''}`}>
                          {isSelected ? 'Selected' : 'Select'}
                        </button>
                      </div>
                    );
                  })}

                  <div className="btn-group">
                    <button className="back-btn" onClick={() => setCurrentStep(1)}>
                      ← Back
                    </button>
                    <button className="confirm-action-btn" onClick={() => setCurrentStep(3)}>
                      Continue to Schedule →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: Time & Date */}
              {currentStep === 3 && (
                <div>
                  <h3 className="font-serif" style={{ marginBottom: '14px' }}>Select Date & Time Slot</h3>
                  
                  <div className="form-group">
                    <label className="form-label">Appointment Date</label>
                    <input
                      type="date"
                      min={new Date().toISOString().split('T')[0]}
                      value={bookingDate}
                      onChange={(e) => setBookingDate(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Available Time Slot (10:00 AM – 8:00 PM)</label>
                    <div className="styled-dropdown-wrapper">
                      <select
                        className="styled-dropdown"
                        value={selectedTimeSlot}
                        onChange={(e) => setSelectedTimeSlot(e.target.value)}
                      >
                        {availableSlots.map((slot) => (
                          <option key={slot.value} value={slot.value}>
                            {slot.label}
                          </option>
                        ))}
                      </select>
                      <div className="dropdown-arrow">▼</div>
                    </div>
                  </div>

                  <div className="btn-group">
                    <button className="back-btn" onClick={() => setCurrentStep(2)}>
                      ← Back
                    </button>
                    <button className="confirm-action-btn" onClick={() => setCurrentStep(4)}>
                      Continue to Guest & Card →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: Confirm & Card Vaulting */}
              {currentStep === 4 && (
                <form onSubmit={handleBookingSubmit}>
                  <h3 className="font-serif" style={{ marginBottom: '14px' }}>Review & Confirm Reservation</h3>

                  <div className="info-card">
                    <div className="info-card-title">Guest Details</div>
                    <div className="form-group">
                      <input
                        type="text"
                        placeholder="Full Name *"
                        value={guest.fullName}
                        onChange={(e) => setGuest({ ...guest, fullName: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <input
                        type="email"
                        placeholder="Email Address *"
                        value={guest.email}
                        onChange={(e) => setGuest({ ...guest, email: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <input
                        type="tel"
                        placeholder="Phone Number *"
                        value={guest.phone}
                        onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="info-card">
                    <div className="info-card-title">Pay by debit or credit card</div>
                    <p className="policy-text" style={{ marginBottom: '10px' }}>
                      Add card details for reservation hold ($0 charged today).
                    </p>
                    <div className="form-group">
                      <input
                        type="text"
                        placeholder="Name on card *"
                        value={card.nameOnCard}
                        onChange={(e) => setCard({ ...card, nameOnCard: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <input
                        type="text"
                        placeholder="Card number *"
                        value={card.cardNumber}
                        onChange={(e) => setCard({ ...card, cardNumber: e.target.value })}
                        required
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input
                        type="text"
                        placeholder="MM / YY *"
                        value={card.expiry}
                        onChange={(e) => setCard({ ...card, expiry: e.target.value })}
                        required
                      />
                      <input
                        type="text"
                        placeholder="CVC *"
                        value={card.cvc}
                        onChange={(e) => setCard({ ...card, cvc: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="info-card">
                    <div className="info-card-title">Salon Policies</div>
                    <p className="policy-text" style={{ marginBottom: '10px' }}>
                      Cancel for free up to 24 hours ahead. Cancellations within 24 hours incur a <strong>50% fee</strong> ($37.50). No-shows incur a <strong>100% fee</strong> ($75.00).
                    </p>

                    <div className="form-group">
                      <label className="form-label">Comments or special requests</label>
                      <textarea
                        placeholder="Add hair notes or preferences..."
                        value={guest.comments}
                        onChange={(e) => setGuest({ ...guest, comments: e.target.value })}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                      <input
                        type="checkbox"
                        id="terms"
                        checked={agreedTerms}
                        onChange={(e) => setAgreedTerms(e.target.checked)}
                      />
                      <label htmlFor="terms" style={{ fontSize: '0.8rem', color: '#555' }}>
                        I agree to the <strong>Le Salon NYC Policies</strong>.
                      </label>
                    </div>
                  </div>

                  {/* Inline Error Notice Directly Above Submit Buttons */}
                  {errorMessage && <div className="alert-error" style={{ marginBottom: '10px' }}>{errorMessage}</div>}

                  <div className="btn-group">
                    <button type="button" className="back-btn" onClick={() => setCurrentStep(3)}>
                      ← Back
                    </button>
                    <button type="submit" disabled={isSubmitting} className="confirm-action-btn">
                      {isSubmitting ? 'Processing...' : `Confirm Reservation — $${selectedService.starting_price}`}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )
        ) : (
          /* Manage / Cancel View */
          <div className="info-card">
            <h3 className="font-serif" style={{ marginBottom: '6px' }}>Cancel Reservation</h3>
            <p className="policy-text" style={{ marginBottom: '16px' }}>
              Enter your reference code and email address to process cancellation.
            </p>

            {cancelError && <div className="alert-error">{cancelError}</div>}

            {cancelResult ? (
              <div style={{ background: '#fafafa', padding: '12px', borderRadius: '8px', border: '1px solid #e8e6e1' }}>
                <p style={{ color: '#059669', fontWeight: 600 }}>Canceled Successfully.</p>
                {cancelResult.feeCharged > 0 ? (
                  <p style={{ color: '#b91c1c', fontSize: '0.8rem', marginTop: '4px' }}>
                    50% Late Fee Applied: <strong>${cancelResult.feeCharged.toFixed(2)}</strong>
                  </p>
                ) : (
                  <p style={{ color: '#666', fontSize: '0.8rem', marginTop: '4px' }}>No cancellation fee charged.</p>
                )}
              </div>
            ) : (
              <form onSubmit={handleCancelSubmit}>
                <div className="form-group">
                  <label className="form-label">Cancellation Reference Code</label>
                  <input
                    type="text"
                    placeholder="e.g. X7K9A2"
                    value={cancelCode}
                    onChange={(e) => setCancelCode(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    placeholder="guest@example.com"
                    value={cancelEmail}
                    onChange={(e) => setCancelEmail(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" disabled={isSubmitting} className="cancel-btn">
                  {isSubmitting ? 'Processing...' : 'Cancel Reservation'}
                </button>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
}