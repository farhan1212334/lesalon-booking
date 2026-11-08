import React, { useState, useEffect } from 'react';

const API_BASE_URL = 'https://lesalon-booking.onrender.com';

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
      label: `${startTimeStr} – ${endTimeStr}`
    });

    currentMinutes += 30;
  }
  return slots;
}

// Automatic retry fetch helper to handle Render cold starts silently
async function fetchWithRetry(url, options, retries = 4, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState('book');
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedService, setSelectedService] = useState(SERVICES[0]);
  const [selectedProfessional, setSelectedProfessional] = useState(PROFESSIONALS[0]);
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);
  const [bookedSlots, setBookedSlots] = useState([]);

  const availableSlots = generateTimeSlots(selectedService.duration_minutes);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(availableSlots[0]?.value || '10:00 AM');

  const [guest, setGuest] = useState({ fullName: '', email: '', phone: '', comments: '' });
  const [agreedTerms, setAgreedTerms] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingStatusText, setSubmittingStatusText] = useState('Processing...');
  const [bookingResult, setBookingResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const [cancelCode, setCancelCode] = useState('');
  const [cancelEmail, setCancelEmail] = useState('');
  const [cancelResult, setCancelResult] = useState(null);
  const [cancelError, setCancelError] = useState('');

  // Auto-warmup backend when app loads
  useEffect(() => {
    fetch(`${API_BASE_URL}/health`).catch(() => {});
  }, []);

  // Early wakeup when step 3 or 4 is reached
  useEffect(() => {
    if (currentStep >= 3) {
      fetch(`${API_BASE_URL}/health`).catch(() => {});
      fetchBookedSlots(bookingDate);
    }
  }, [currentStep, bookingDate]);

  const fetchBookedSlots = async (dateStr) => {
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/api/booked-slots?date=${dateStr}`, { method: 'GET' }, 2, 1000);
      if (res && res.ok) {
        const data = await res.json();
        setBookedSlots(data.bookedSlots || []);
      }
    } catch (err) {
      console.log('Slots fetch notice:', err);
    }
  };

  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    if (!agreedTerms) {
      setErrorMessage('Please check the box to agree to the Le Salon NYC terms.');
      return;
    }

    setIsSubmitting(true);
    setSubmittingStatusText('Connecting to server...');
    setErrorMessage('');

    const payload = {
      full_name: guest.fullName,
      email: guest.email,
      phone: guest.phone,
      service_name: selectedService.service_name,
      starting_price: selectedService.starting_price,
      duration_minutes: selectedService.duration_minutes,
      date: bookingDate,
      time: selectedTimeSlot,
      notes: guest.comments,
    };

    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/api/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, 4, 2500);

      const data = await res.json();
      if (res.ok && (data.success || data.cancellation_code || data.cancellationCode)) {
        setBookingResult(data);
        fetchBookedSlots(bookingDate);
      } else {
        setErrorMessage(data.error || 'Unable to process reservation. Please check details.');
      }
    } catch (err) {
      setErrorMessage('Network connection lost. Please check your internet connection and click confirm again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmittingStatusText('Processing cancellation...');
    setCancelError('');
    setCancelResult(null);

    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/api/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancellation_code: cancelCode.trim().toUpperCase(), email: cancelEmail.trim() }),
      }, 3, 2000);

      const data = await res.json();
      if (res.ok && data.success) {
        setCancelResult(data);
        fetchBookedSlots(bookingDate);
      } else {
        setCancelError(data.error || 'No active reservation found matching those details.');
      }
    } catch (err) {
      setCancelError('Network error connecting to backend server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Header */}
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
            /* Confirmation Card */
            <div className="info-card" style={{ textAlign: 'center', padding: '32px 20px' }}>
              <div style={{ fontSize: '2.5rem', color: '#059669', marginBottom: '10px' }}>✓</div>
              <h2 className="font-serif" style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Reservation Confirmed!</h2>
              <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '16px' }}>
                Confirmation receipt sent to <strong>{guest.email}</strong>.
              </p>
              
              <div style={{ background: '#faf9f6', border: '1px solid #e8e6e1', borderRadius: '8px', padding: '16px', textAlign: 'left', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ color: '#777', fontSize: '0.85rem' }}>Reference Code:</span>
                  <strong style={{ fontFamily: 'monospace', fontSize: '1.1rem', color: '#c59b27' }}>{bookingResult.cancellation_code || bookingResult.cancellationCode}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ color: '#777', fontSize: '0.85rem' }}>Service:</span>
                  <strong style={{ fontSize: '0.85rem' }}>{selectedService.service_name}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
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
                  2. Stylist
                </span>
                <span className={`step-nav-item ${currentStep === 3 ? 'active' : ''}`} onClick={() => setCurrentStep(3)}>
                  3. Time
                </span>
                <span className={`step-nav-item ${currentStep === 4 ? 'active' : ''}`} onClick={() => setCurrentStep(4)}>
                  4. Confirm
                </span>
              </div>

              {/* STEP 1 */}
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
                      Continue to Stylist Selection →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2 */}
              {currentStep === 2 && (
                <div>
                  <h3 className="font-serif" style={{ marginBottom: '14px' }}>Select Stylist</h3>
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

              {/* STEP 3 */}
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
                    <label className="form-label">Available Time Slots</label>
                    <div className="styled-dropdown-wrapper">
                      <select
                        className="styled-dropdown"
                        value={selectedTimeSlot}
                        onChange={(e) => setSelectedTimeSlot(e.target.value)}
                      >
                        {availableSlots.map((slot) => {
                          const isBooked = bookedSlots.includes(slot.value);
                          return (
                            <option key={slot.value} value={slot.value} disabled={isBooked}>
                              {slot.label} {isBooked ? '(Booked)' : ''}
                            </option>
                          );
                        })}
                      </select>
                      <div className="dropdown-arrow">▼</div>
                    </div>
                  </div>

                  <div className="btn-group">
                    <button className="back-btn" onClick={() => setCurrentStep(2)}>
                      ← Back
                    </button>
                    <button className="confirm-action-btn" onClick={() => setCurrentStep(4)}>
                      Continue to Guest Details →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4 */}
              {currentStep === 4 && (
                <form onSubmit={handleBookingSubmit}>
                  <h3 className="font-serif" style={{ marginBottom: '14px' }}>Complete Reservation</h3>

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
                    <div className="info-card-title">Salon Policies</div>
                    <p className="policy-text" style={{ marginBottom: '10px' }}>
                      Cancellations can be made for free up to 24 hours prior using your 6-character reference code.
                    </p>

                    <div className="form-group">
                      <label className="form-label">Notes or special requests</label>
                      <textarea
                        placeholder="Add notes..."
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
                        I agree to the <strong>Le Salon NYC Reservation Terms</strong>.
                      </label>
                    </div>
                  </div>

                  {errorMessage && <div className="alert-error">{errorMessage}</div>}

                  <div className="btn-group">
                    <button type="button" className="back-btn" onClick={() => setCurrentStep(3)}>
                      ← Back
                    </button>
                    <button type="submit" disabled={isSubmitting} className="confirm-action-btn">
                      {isSubmitting ? submittingStatusText : `Confirm Reservation — $${selectedService.starting_price}`}
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
              Enter your reference code and email address to cancel your appointment.
            </p>

            {cancelError && <div className="alert-error">{cancelError}</div>}

            {cancelResult ? (
              <div style={{ background: '#faf9f6', padding: '16px', borderRadius: '8px', border: '1px solid #e8e6e1' }}>
                <p style={{ color: '#059669', fontWeight: 600 }}>✓ Reservation Canceled Successfully</p>
                <p style={{ color: '#555', fontSize: '0.85rem', marginTop: '4px' }}>
                  The time slot has been freed and a confirmation receipt has been sent to your email.
                </p>
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
                  {isSubmitting ? submittingStatusText : 'Cancel Reservation & Release Slot'}
                </button>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
}