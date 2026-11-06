import React, { useState, useEffect } from 'react';
import './index.css';

const API_BASE_URL = 'https://lesalon-api.onrender.com/api';

// Complete Le Salon NYC Master Catalog
const DEFAULT_SERVICES = [
  { id: 1, name: 'Shampoo Haircut & Blow Dry', price_display: '$75 and up', starting_price: 75, duration_minutes: 75, category: 'Haircut & Styling' },
  { id: 2, name: 'Shampoo & Blow Dry', price_display: '$40 and up', starting_price: 40, duration_minutes: 45, category: 'Haircut & Styling' },
  { id: 3, name: 'Single Process Color', price_display: '$100 and up', starting_price: 100, duration_minutes: 75, category: 'Color Services' },
  { id: 4, name: 'Single Process Color & Blow Dry', price_display: '$130 and up', starting_price: 130, duration_minutes: 120, category: 'Color Services' },
  { id: 5, name: 'Single Process & Full Head of Highlights', price_display: '$330 and up', starting_price: 330, duration_minutes: 180, category: 'Color Services' },
  { id: 6, name: 'Single Process with Full Head of Highlights & Blow Dry', price_display: '$380 and up', starting_price: 380, duration_minutes: 210, category: 'Color Services' },
  { id: 7, name: 'Full Head Highlights', price_display: '$250', starting_price: 250, duration_minutes: 120, category: 'Highlights' },
  { id: 8, name: 'Full Head Highlights & Blow Dry', price_display: '$290', starting_price: 290, duration_minutes: 150, category: 'Highlights' },
  { id: 9, name: 'Half Head Highlights', price_display: '$180', starting_price: 180, duration_minutes: 90, category: 'Highlights' },
  { id: 10, name: 'Half Head Highlights & Blow Dry', price_display: '$220', starting_price: 220, duration_minutes: 120, category: 'Highlights' },
  { id: 11, name: 'Hair Treatment', price_display: '$35', starting_price: 35, duration_minutes: 30, category: 'Treatments' },
  { id: 12, name: 'Organic Perm', price_display: '$150 and up', starting_price: 150, duration_minutes: 120, category: 'Treatments' },
  { id: 13, name: 'Barber Haircut', price_display: '$40', starting_price: 40, duration_minutes: 30, category: 'Haircut & Styling' },
  { id: 14, name: 'Makeup', price_display: 'Upon consultation', starting_price: 0, duration_minutes: 60, category: 'Specialty' },
  { id: 15, name: 'Keratin Protein Treatment', price_display: 'Upon consultation', starting_price: 0, duration_minutes: 150, category: 'Treatments' },
];

export default function App() {
  const [viewMode, setViewMode] = useState('booking'); // 'booking' | 'cancel'
  const [step, setStep] = useState(1);
  const [services, setServices] = useState(DEFAULT_SERVICES);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedService, setSelectedService] = useState(null);
  
  // Date & Slot state
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Client Form state & Validations
  const [formData, setFormData] = useState({ full_name: '', email: '', phone: '', notes: '' });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);
  const [serverError, setServerError] = useState('');

  // Cancellation Flow state
  const [cancelData, setCancelData] = useState({ cancellation_code: '', email: '' });
  const [cancelErrors, setCancelErrors] = useState({});
  const [cancelling, setCancelling] = useState(false);
  const [cancelResult, setCancelResult] = useState(null);
  const [cancelServerError, setCancelServerError] = useState('');

  // 1. Fetch backend services with fallback
  useEffect(() => {
    fetch(`${API_BASE_URL}/services`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const merged = DEFAULT_SERVICES.map((def) => {
            const found = data.find((d) => d.name.toLowerCase() === def.name.toLowerCase());
            return found ? { ...def, ...found } : def;
          });
          setServices(merged);
        }
      })
      .catch(() => console.log('Using static service catalog'));
  }, []);

  // 2. Fetch Booked Slots & Compute Duration Slots
  useEffect(() => {
    if (!selectedDate || !selectedService) return;

    setLoadingSlots(true);
    fetch(`${API_BASE_URL}/booked-slots?date=${selectedDate}`)
      .then((res) => res.json())
      .then((data) => {
        const booked = Array.isArray(data) ? data : [];
        calculateTimeSlots(selectedDate, selectedService.duration_minutes, booked);
      })
      .catch(() => calculateTimeSlots(selectedDate, selectedService.duration_minutes, []))
      .finally(() => setLoadingSlots(false));
  }, [selectedDate, selectedService]);

  // Strict New York Time Slot Calculation
  const calculateTimeSlots = (dateStr, durationMins, bookedList) => {
    const slots = [];
    const openMinutes = 9 * 60;   // 9:00 AM
    const closeMinutes = 19 * 60; // 7:00 PM

    const testDate = new Date(`${dateStr}T12:00:00Z`);
    const nyTimeStr = testDate.toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' });
    const nyOffset = nyTimeStr.includes('EDT') ? '-04:00' : '-05:00';

    const pad = (n) => String(n).padStart(2, '0');

    for (let currentMins = openMinutes; currentMins + durationMins <= closeMinutes; currentMins += 30) {
      const startH = Math.floor(currentMins / 60);
      const startM = currentMins % 60;

      const endMins = currentMins + durationMins;
      const endH = Math.floor(endMins / 60);
      const endM = endMins % 60;

      const isoStart = `${dateStr}T${pad(startH)}:${pad(startM)}:00${nyOffset}`;
      const slotStartMs = new Date(isoStart).getTime();
      const slotEndMs = slotStartMs + durationMins * 60000;

      const isBooked = bookedList.some((booking) => {
        if (!booking.start_time) return false;
        const bStartMs = new Date(booking.start_time).getTime();
        const bEndMs = booking.end_time 
          ? new Date(booking.end_time).getTime() 
          : bStartMs + (booking.duration_minutes || 45) * 60000;
        return slotStartMs < bEndMs && slotEndMs > bStartMs;
      });

      const format12H = (h, m) => {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${h12}:${pad(m)} ${ampm}`;
      };

      const timeDisplay = `${format12H(startH, startM)} – ${format12H(endH, endM)}`;

      slots.push({
        timeDisplay,
        isoStart,
        isBooked,
      });
    }

    setAvailableSlots(slots);
  };

  const handleServiceSelect = (service) => {
    setSelectedService(service);
    setSelectedSlot(null);
    setStep(2);
  };

  // Client Form Validations
  const validateForm = () => {
    const errors = {};
    if (!formData.full_name.trim()) {
      errors.full_name = 'Full name is required.';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!emailRegex.test(formData.email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }

    const phoneDigits = formData.phone.replace(/\D/g, '');
    if (!formData.phone.trim()) {
      errors.phone = 'Phone number is required.';
    } else if (phoneDigits.length < 7) {
      errors.phone = 'Please enter a valid phone number.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    setServerError('');

    try {
      const payload = {
        service_id: selectedService.id,
        start_time: selectedSlot.isoStart,
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        notes: formData.notes.trim(),
      };

      const res = await fetch(`${API_BASE_URL}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setBookingResult(data);
        setStep(4);
      } else {
        setServerError(data.message || 'Booking failed. Please select another slot.');
      }
    } catch (err) {
      setServerError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Cancellation Form Submission
  const handleCancelSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!cancelData.cancellation_code.trim()) {
      errors.cancellation_code = 'Reference code is required.';
    }
    if (!cancelData.email.trim()) {
      errors.email = 'Email address is required.';
    }
    setCancelErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setCancelling(true);
    setCancelServerError('');

    try {
      const res = await fetch(`${API_BASE_URL}/cancel-appointment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cancellation_code: cancelData.cancellation_code.trim(),
          email: cancelData.email.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCancelResult(data);
      } else {
        setCancelServerError(data.message || 'Could not locate matching active appointment.');
      }
    } catch (err) {
      setCancelServerError('Network error. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  const categories = ['All', ...new Set(services.map((s) => s.category).filter(Boolean))];
  const filteredServices = selectedCategory === 'All'
    ? services
    : services.filter((s) => s.category === selectedCategory);

  return (
    <div className="salon-app">
      {/* Brand Header */}
      <header className="salon-header">
        <span className="brand-tagline">Manhattan Flagship</span>
        <h1 className="brand-title">LE SALON NYC</h1>
        <p className="brand-address">310 East 44th St, New York, NY • (212) 949-6693</p>

        {/* View Mode Navigation Toggle */}
        <div className="header-nav-toggle">
          <button
            className={`nav-tab-btn ${viewMode === 'booking' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('booking');
              setCancelResult(null);
            }}
          >
            Book Appointment
          </button>
          <button
            className={`nav-tab-btn ${viewMode === 'cancel' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('cancel');
              setBookingResult(null);
            }}
          >
            Manage / Cancel Reservation
          </button>
        </div>
      </header>

      {/* CANCELLATION WORKFLOW VIEW */}
      {viewMode === 'cancel' ? (
        <section className="step-content">
          {!cancelResult ? (
            <>
              <div className="section-header">
                <h2>Cancel an Existing Appointment</h2>
                <p>Enter your 6-character reference code and booking email to cancel your reservation.</p>
              </div>

              <div className="policies-card">
                <h3 className="policies-title">Cancellation Policy Reminder</h3>
                <ul className="policies-list">
                  <li className="policy-item">
                    <span className="policy-bullet">⏰</span>
                    <div>
                      <strong>24-Hour Notice Required:</strong> Cancellations made at least 24 hours prior to your scheduled time are penalty-free. Cancellations within 24 hours or last-minute no-shows incur a <strong>50% service fee</strong>.
                    </div>
                  </li>
                </ul>
              </div>

              <form onSubmit={handleCancelSubmit} className="client-form-card" noValidate>
                {cancelServerError && <div className="error-banner">{cancelServerError}</div>}

                <div className="form-field">
                  <label className="field-label">Reference Code <span className="required-star">*</span></label>
                  <input
                    type="text"
                    className={`form-input uppercase-input ${cancelErrors.cancellation_code ? 'invalid' : ''}`}
                    placeholder="e.g. Q705VD"
                    value={cancelData.cancellation_code}
                    onChange={(e) => setCancelData({ ...cancelData, cancellation_code: e.target.value.toUpperCase() })}
                  />
                  {cancelErrors.cancellation_code && <span className="field-error">{cancelErrors.cancellation_code}</span>}
                </div>

                <div className="form-field">
                  <label className="field-label">Email Address <span className="required-star">*</span></label>
                  <input
                    type="email"
                    className={`form-input ${cancelErrors.email ? 'invalid' : ''}`}
                    placeholder="name@example.com"
                    value={cancelData.email}
                    onChange={(e) => setCancelData({ ...cancelData, email: e.target.value })}
                  />
                  {cancelErrors.email && <span className="field-error">{cancelErrors.email}</span>}
                </div>

                <div className="step-actions">
                  <button type="button" className="btn-secondary" onClick={() => setViewMode('booking')}>
                    Back to Booking
                  </button>
                  <button type="submit" className="btn-danger" disabled={cancelling}>
                    {cancelling ? 'Verifying...' : 'Cancel Reservation'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="confirmation-view">
              <div className="cancel-badge-icon">✕</div>
              <h2 className="confirmation-title">Reservation Cancelled</h2>
              <p className="confirmation-subtext">
                Your reservation <strong>({cancelData.cancellation_code})</strong> has been successfully cancelled and removed from our schedule.
              </p>

              {cancelResult.isLateCancellation && (
                <div className="warning-banner">
                  <strong>Notice on Late Cancellation:</strong> This appointment was cancelled within 24 hours of the scheduled time. Per salon policy, a 50% service charge applies.
                </div>
              )}

              <button
                className="btn-primary"
                onClick={() => {
                  setViewMode('booking');
                  setStep(1);
                  setCancelResult(null);
                  setCancelData({ cancellation_code: '', email: '' });
                }}
              >
                Return to Service Menu
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Step Progress Bar */}
          <nav className="step-bar">
            <div className={`step-node ${step >= 1 ? 'active' : ''}`} onClick={() => step > 1 && setStep(1)}>
              <span className="step-num">1</span>
              <span className="step-label">Select Service</span>
            </div>
            <div className={`step-line ${step >= 2 ? 'active' : ''}`} />
            <div className={`step-node ${step >= 2 ? 'active' : ''}`} onClick={() => step > 2 && setStep(2)}>
              <span className="step-num">2</span>
              <span className="step-label">Date & Time</span>
            </div>
            <div className={`step-line ${step >= 3 ? 'active' : ''}`} />
            <div className={`step-node ${step >= 3 ? 'active' : ''}`}>
              <span className="step-num">3</span>
              <span className="step-label">Client Details</span>
            </div>
          </nav>

          {/* STEP 1: SERVICES CATALOG GRID */}
          {step === 1 && (
            <section className="step-content">
              <div className="section-header">
                <h2>Our Service Menu</h2>
                <p>Select a luxury service to view available reservation times.</p>
              </div>

              <div className="category-filter">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    className={`filter-chip ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="services-grid">
                {filteredServices.map((service) => (
                  <div
                    key={service.id}
                    className="service-card"
                    onClick={() => handleServiceSelect(service)}
                  >
                    <div className="card-top">
                      <span className="category-badge">{service.category}</span>
                      <span className="service-duration">⏱ {service.duration_minutes} Mins</span>
                    </div>
                    <h3 className="service-name">{service.name}</h3>
                    <div className="card-bottom">
                      <div className="price-tag">
                        <span className="price-val">{service.price_display}</span>
                      </div>
                      <span className="card-btn">Select Slot →</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* STEP 2: DYNAMIC CALENDAR & TIME SLOTS */}
          {step === 2 && selectedService && (
            <section className="step-content">
              <div className="section-header">
                <button className="back-link" onClick={() => setStep(1)}>← Change Service</button>
                <h2>Select Date & Duration Slot</h2>
                <div className="service-summary-badge">
                  <span>Selected: <strong>{selectedService.name}</strong></span>
                  <span>Price: <strong>{selectedService.price_display}</strong></span>
                  <span>Session: <strong>{selectedService.duration_minutes} Minutes</strong></span>
                </div>
              </div>

              <div className="booking-panel">
                <div className="form-field">
                  <label className="field-label">Choose Appointment Date</label>
                  <input
                    type="date"
                    className="custom-date-input"
                    value={selectedDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>

                <div className="slots-container">
                  <label className="field-label">
                    Available {selectedService.duration_minutes}-Min Slots for {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}:
                  </label>

                  {loadingSlots ? (
                    <div className="loading-spinner">Calculating open slots...</div>
                  ) : availableSlots.length === 0 ? (
                    <p className="no-slots">No slots remaining for this date. Please select another date above.</p>
                  ) : (
                    <div className="slots-grid">
                      {availableSlots.map((slot, idx) => (
                        <button
                          key={idx}
                          disabled={slot.isBooked}
                          className={`slot-chip ${slot.isBooked ? 'booked' : ''} ${
                            selectedSlot?.isoStart === slot.isoStart ? 'selected' : ''
                          }`}
                          onClick={() => setSelectedSlot(slot)}
                        >
                          <span className="slot-range">{slot.timeDisplay}</span>
                          {slot.isBooked && <span className="booked-subtext">Booked</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="step-actions">
                <button className="btn-secondary" onClick={() => setStep(1)}>Back</button>
                <button
                  className="btn-primary"
                  disabled={!selectedSlot}
                  onClick={() => setStep(3)}
                >
                  Continue to Guest Details →
                </button>
              </div>
            </section>
          )}

          {/* STEP 3: CLIENT DETAILS FORM WITH SALON POLICIES */}
          {step === 3 && selectedService && selectedSlot && (
            <section className="step-content">
              <div className="section-header">
                <button className="back-link" onClick={() => setStep(2)}>← Change Date/Time</button>
                <h2>Guest Details & Reservation Review</h2>
                <p>Please enter your contact information to finalize your appointment.</p>
              </div>

              <div className="summary-card-panel">
                <h3 className="summary-card-title">Booking Overview</h3>
                <div className="summary-grid">
                  <div className="summary-cell">
                    <span className="cell-label">Service</span>
                    <span className="cell-val">{selectedService.name}</span>
                  </div>
                  <div className="summary-cell">
                    <span className="cell-label">Duration</span>
                    <span className="cell-val">{selectedService.duration_minutes} Minutes</span>
                  </div>
                  <div className="summary-cell">
                    <span className="cell-label">Reserved Time (NY Time)</span>
                    <span className="cell-val">{selectedSlot.timeDisplay}</span>
                  </div>
                  <div className="summary-cell">
                    <span className="cell-label">Estimated Price</span>
                    <span className="cell-val gold-text">{selectedService.price_display}</span>
                  </div>
                </div>
              </div>

              {/* Clean Salon Policies & Terms Card */}
              <div className="policies-card">
                <h3 className="policies-title">Salon Policies & Terms</h3>
                <ul className="policies-list">
                  <li className="policy-item">
                    <span className="policy-bullet">💳</span>
                    <div>
                      <strong>In-Salon Payment:</strong> Payment is due at the salon upon service completion. We accept Cash, Visa, MasterCard, and Discover. <em>(American Express is NOT accepted)</em>.
                    </div>
                  </li>
                  <li className="policy-item">
                    <span className="policy-bullet">✨</span>
                    <div>
                      <strong>Satisfaction Guarantee:</strong> If you are unsatisfied with your hair outcome, we will happily fix or redo your service. We do not offer monetary refunds under any circumstances.
                    </div>
                  </li>
                  <li className="policy-item">
                    <span className="policy-bullet">⏰</span>
                    <div>
                      <strong>24-Hour Cancellation Policy:</strong> Cancellations must be made at least 24 hours prior to your scheduled time. Cancellations made within 24 hours or last-minute no-shows will be charged a <strong>50% service fee</strong>.
                    </div>
                  </li>
                </ul>
              </div>

              <form onSubmit={handleFormSubmit} className="client-form-card" noValidate>
                {serverError && <div className="error-banner">{serverError}</div>}

                <div className="form-field">
                  <label className="field-label">Full Name <span className="required-star">*</span></label>
                  <input
                    type="text"
                    className={`form-input ${formErrors.full_name ? 'invalid' : ''}`}
                    placeholder="e.g. Farhan Umar"
                    value={formData.full_name}
                    onChange={(e) => {
                      setFormData({ ...formData, full_name: e.target.value });
                      if (formErrors.full_name) setFormErrors({ ...formErrors, full_name: null });
                    }}
                  />
                  {formErrors.full_name && <span className="field-error">{formErrors.full_name}</span>}
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label className="field-label">Email Address <span className="required-star">*</span></label>
                    <input
                      type="email"
                      className={`form-input ${formErrors.email ? 'invalid' : ''}`}
                      placeholder="name@example.com"
                      value={formData.email}
                      onChange={(e) => {
                        setFormData({ ...formData, email: e.target.value });
                        if (formErrors.email) setFormErrors({ ...formErrors, email: null });
                      }}
                    />
                    {formErrors.email && <span className="field-error">{formErrors.email}</span>}
                  </div>

                  <div className="form-field">
                    <label className="field-label">Phone Number <span className="required-star">*</span></label>
                    <input
                      type="tel"
                      className={`form-input ${formErrors.phone ? 'invalid' : ''}`}
                      placeholder="(212) 555-0199"
                      value={formData.phone}
                      onChange={(e) => {
                        setFormData({ ...formData, phone: e.target.value });
                        if (formErrors.phone) setFormErrors({ ...formErrors, phone: null });
                      }}
                    />
                    {formErrors.phone && <span className="field-error">{formErrors.phone}</span>}
                  </div>
                </div>

                <div className="form-field">
                  <label className="field-label">Special Notes or Requests (Optional)</label>
                  <textarea
                    className="form-textarea"
                    rows="3"
                    placeholder="Mention hair length, preferences, or sensitivities..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>

                <div className="step-actions">
                  <button type="button" className="btn-secondary" onClick={() => setStep(2)}>Back</button>
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting ? 'Processing...' : 'Complete Reservation'}
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* STEP 4: SUCCESS CONFIRMATION RECEIPT WITH POLICY REMINDERS */}
          {step === 4 && bookingResult && (
            <section className="step-content confirmation-view">
              <div className="success-badge-icon">✓</div>
              <h2 className="confirmation-title">Reservation Confirmed!</h2>
              <p className="confirmation-subtext">
                A confirmation email has been dispatched to <strong>{formData.email}</strong>.
              </p>

              <div className="cancellation-code-card">
                <span className="code-label">Cancellation / Reference Code</span>
                <span className="code-val">{bookingResult.cancellation_code}</span>
              </div>

              <div className="summary-list">
                <div className="summary-item">
                  <span>Customer:</span>
                  <strong>{formData.full_name}</strong>
                </div>
                <div className="summary-item">
                  <span>Service:</span>
                  <strong>{selectedService.name}</strong>
                </div>
                <div className="summary-item">
                  <span>Time Slot:</span>
                  <strong>{selectedSlot.timeDisplay} (New York Time)</strong>
                </div>
                <div className="summary-item">
                  <span>Salon Location:</span>
                  <strong>310 East 44th St, Manhattan, NY 10017</strong>
                </div>
              </div>

              <div className="policies-card confirmation-policies">
                <h4 className="policies-title-sm">Important Reminders</h4>
                <ul className="policies-list-sm">
                  <li><strong>Payment:</strong> Pay at salon via Cash or Card (No American Express).</li>
                  <li><strong>Redo Policy:</strong> We fix/redo unsatisfactory work; no monetary refunds.</li>
                  <li><strong>Cancellation:</strong> Notify us at least 24h prior to avoid a 50% charge.</li>
                </ul>
              </div>

              <button
                className="btn-primary"
                onClick={() => {
                  setStep(1);
                  setSelectedService(null);
                  setSelectedSlot(null);
                  setFormData({ full_name: '', email: '', phone: '', notes: '' });
                  setBookingResult(null);
                }}
              >
                Book Another Appointment
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}