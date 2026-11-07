import React, { useState, useEffect } from 'react';
import './index.css';

const API_BASE_URL = 'https://lesalon-api.onrender.com/api';

const DEFAULT_SERVICES = [
  { id: 1, name: 'Shampoo Haircut & Blow Dry', starting_price: 75, price_display: '$75', duration_minutes: 75, category: 'Haircut & Styling' },
  { id: 2, name: 'Shampoo & Blow Dry', starting_price: 40, price_display: '$40', duration_minutes: 45, category: 'Haircut & Styling' },
  { id: 3, name: 'Single Process Color', starting_price: 100, price_display: '$100', duration_minutes: 75, category: 'Color Services' },
  { id: 4, name: 'Single Process Color & Blow Dry', starting_price: 130, price_display: '$130', duration_minutes: 120, category: 'Color Services' },
  { id: 5, name: 'Single Process & Full Head of Highlights', starting_price: 330, price_display: '$330', duration_minutes: 180, category: 'Color Services' },
  { id: 6, name: 'Single Process with Full Head of Highlights & Blow Dry', starting_price: 380, price_display: '$380', duration_minutes: 210, category: 'Color Services' },
  { id: 7, name: 'Full Head Highlights', starting_price: 250, price_display: '$250', duration_minutes: 120, category: 'Highlights' },
  { id: 8, name: 'Full Head Highlights & Blow Dry', starting_price: 290, price_display: '$290', duration_minutes: 150, category: 'Highlights' },
  { id: 9, name: 'Half Head Highlights', starting_price: 180, price_display: '$180', duration_minutes: 90, category: 'Highlights' },
  { id: 10, name: 'Half Head Highlights & Blow Dry', starting_price: 220, price_display: '$220', duration_minutes: 120, category: 'Highlights' },
  { id: 11, name: 'Hair Treatment', starting_price: 35, price_display: '$35', duration_minutes: 30, category: 'Treatments' },
  { id: 12, name: 'Organic Perm', starting_price: 150, price_display: '$150', duration_minutes: 120, category: 'Treatments' },
  { id: 13, name: 'Barber Haircut', starting_price: 40, price_display: '$40', duration_minutes: 30, category: 'Haircut & Styling' },
  { id: 14, name: 'Makeup', starting_price: 60, price_display: '$60', duration_minutes: 60, category: 'Specialty' },
  { id: 15, name: 'Keratin Protein Treatment', starting_price: 150, price_display: '$150', duration_minutes: 150, category: 'Treatments' },
];

const STAFF_MEMBERS = [
  { id: 'any', name: 'Any Professional', role: 'First available stylist', avatar: '✨' },
  { id: 'ashraf', name: 'Ashraf', role: 'Master Stylist & Owner', avatar: '✂️' },
  { id: 'ricardo', name: 'Ricardo', role: 'Senior Colorist & Stylist', avatar: '🎨' },
];

export default function App() {
  const [viewMode, setViewMode] = useState('booking'); // 'booking' | 'cancel'
  const [step, setStep] = useState(1); // 1: Services | 2: Professional | 3: Time | 4: Confirm
  const [services, setServices] = useState(DEFAULT_SERVICES);
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Multi-Service Selection
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(STAFF_MEMBERS[0]);

  // Date & Slot State
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Client Details & Card State
  const [formData, setFormData] = useState({ full_name: '', email: '', phone: '', notes: '' });
  const [cardData, setCardData] = useState({ name_on_card: '', card_number: '', expiry: '', cvc: '' });
  const [policyAgreed, setPolicyAgreed] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);
  const [serverError, setServerError] = useState('');

  // Cancellation State
  const [cancelData, setCancelData] = useState({ cancellation_code: '', email: '' });
  const [cancelErrors, setCancelErrors] = useState({});
  const [cancelling, setCancelling] = useState(false);
  const [cancelResult, setCancelResult] = useState(null);
  const [cancelServerError, setCancelServerError] = useState('');

  // Bill Calculations
  const totalPrice = selectedServices.reduce((sum, s) => sum + (s.starting_price || 0), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const lateFee = (totalPrice * 0.5).toFixed(2);
  const noShowFee = totalPrice.toFixed(2);

  const handleToggleService = (service) => {
    setSelectedServices((prev) => {
      const exists = prev.some((s) => s.id === service.id);
      return exists ? prev.filter((s) => s.id !== service.id) : [...prev, service];
    });
    setSelectedSlot(null);
  };

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

  useEffect(() => {
    if (!selectedDate || selectedServices.length === 0) return;

    setLoadingSlots(true);
    fetch(`${API_BASE_URL}/booked-slots?date=${selectedDate}`)
      .then((res) => res.json())
      .then((data) => {
        const booked = Array.isArray(data) ? data : [];
        calculateTimeSlots(selectedDate, totalDuration || 45, booked);
      })
      .catch(() => calculateTimeSlots(selectedDate, totalDuration || 45, []))
      .finally(() => setLoadingSlots(false));
  }, [selectedDate, selectedServices, totalDuration]);

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

      slots.push({
        timeDisplay: `${format12H(startH, startM)} – ${format12H(endH, endM)}`,
        isoStart,
        isBooked,
      });
    }

    setAvailableSlots(slots);
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.full_name.trim()) errors.full_name = 'Full name is required.';
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!emailRegex.test(formData.email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!formData.phone.trim()) errors.phone = 'Phone number is required.';
    if (!cardData.card_number.trim()) errors.card_number = 'Card number is required.';
    if (!cardData.expiry.trim()) errors.expiry = 'Expiry date required.';
    if (!cardData.cvc.trim()) errors.cvc = 'CVC required.';
    if (!policyAgreed) errors.policyAgreed = 'You must accept the cancellation terms.';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    setServerError('');

    try {
      const payload = {
        service_id: selectedServices[0]?.id || 1,
        service_name: selectedServices.map((s) => s.name).join(', '),
        duration_minutes: totalDuration,
        starting_price: totalPrice,
        start_time: selectedSlot.isoStart,
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        notes: `[Staff: ${selectedStaff.name}] ${formData.notes.trim()}`,
        card_data: {
          name_on_card: cardData.name_on_card.trim(),
          card_number: cardData.card_number.replace(/\s/g, ''),
          expiry: cardData.expiry.trim(),
          cvc: cardData.cvc.trim(),
        },
      };

      const res = await fetch(`${API_BASE_URL}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setBookingResult(data);
        setStep(5);
      } else {
        setServerError(data.message || 'Booking failed. Please try another slot.');
      }
    } catch (err) {
      setServerError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!cancelData.cancellation_code.trim()) errors.cancellation_code = 'Reference code required.';
    if (!cancelData.email.trim()) errors.email = 'Email address required.';
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
        setCancelServerError(data.message || 'Could not locate matching appointment.');
      }
    } catch (err) {
      setCancelServerError('Network error. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  const generateDateStrip = () => {
    const dates = [];
    const base = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = d.getDate();
      const monthName = d.toLocaleDateString('en-US', { month: 'short' });
      dates.push({ iso, dayName, dayNum, monthName });
    }
    return dates;
  };

  const categories = ['All', ...new Set(services.map((s) => s.category).filter(Boolean))];
  const filteredServices = selectedCategory === 'All'
    ? services
    : services.filter((s) => s.category === selectedCategory);

  const canContinue = () => {
    if (step === 1) return selectedServices.length > 0;
    if (step === 2) return !!selectedStaff;
    if (step === 3) return !!selectedSlot;
    if (step === 4) return policyAgreed && formData.full_name && formData.email && formData.phone && cardData.card_number;
    return false;
  };

  const handleSidebarContinue = () => {
    if (step < 4) {
      setStep(step + 1);
    } else if (step === 4) {
      handleFormSubmit();
    }
  };

  return (
    <div className="fresha-app-shell">
      {/* Header */}
      <header className="fresha-header">
        <div className="header-brand">
          <h1 className="header-title">LE SALON NYC</h1>
          <span className="header-tagline">EXCLUSIVELY ORGANIC</span>
        </div>

        <div className="header-actions">
          <button
            className={`nav-mode-btn ${viewMode === 'booking' ? 'active' : ''}`}
            onClick={() => { setViewMode('booking'); setStep(1); }}
          >
            Book Appointment
          </button>
          <button
            className={`nav-mode-btn ${viewMode === 'cancel' ? 'active' : ''}`}
            onClick={() => setViewMode('cancel')}
          >
            Manage / Cancel
          </button>
        </div>
      </header>

      {/* CANCELLATION PORTAL */}
      {viewMode === 'cancel' ? (
        <main className="cancel-standalone-container">
          {!cancelResult ? (
            <div className="cancel-card-box">
              <h2>Cancel an Appointment</h2>
              <p className="subtitle">Enter your reference code and email address.</p>

              <form onSubmit={handleCancelSubmit} noValidate>
                {cancelServerError && <div className="error-banner">{cancelServerError}</div>}

                <div className="form-group">
                  <label>Reference Code *</label>
                  <input
                    type="text"
                    className="styled-input uppercase"
                    placeholder="e.g. Q705VD"
                    value={cancelData.cancellation_code}
                    onChange={(e) => setCancelData({ ...cancelData, cancellation_code: e.target.value.toUpperCase() })}
                  />
                  {cancelErrors.cancellation_code && <span className="input-error">{cancelErrors.cancellation_code}</span>}
                </div>

                <div className="form-group">
                  <label>Email Address *</label>
                  <input
                    type="email"
                    className="styled-input"
                    placeholder="name@example.com"
                    value={cancelData.email}
                    onChange={(e) => setCancelData({ ...cancelData, email: e.target.value })}
                  />
                  {cancelErrors.email && <span className="input-error">{cancelErrors.email}</span>}
                </div>

                <button type="submit" className="btn-danger-lg" disabled={cancelling}>
                  {cancelling ? 'Verifying...' : 'Cancel Reservation'}
                </button>
              </form>
            </div>
          ) : (
            <div className="cancel-card-box text-center">
              <div className="cancel-icon">✕</div>
              <h2>Reservation Cancelled</h2>
              <p>Reference Code: <strong>{cancelData.cancellation_code}</strong></p>

              {cancelResult.isLateCancellation ? (
                <div className="warning-banner-box">
                  <strong>Notice on Late Cancellation:</strong> Submitted within 24 hours. Per salon policy, a 50% charge (${cancelResult.feeAmount || '37.50'}) has been processed.
                </div>
              ) : (
                <div className="info-banner-box">
                  <strong>Notice:</strong> Cancelled more than 24 hours in advance. No cancellation fee charged.
                </div>
              )}

              <button className="btn-primary-lg" onClick={() => { setViewMode('booking'); setStep(1); setCancelResult(null); }}>
                Return to Service Menu
              </button>
            </div>
          )}
        </main>
      ) : step === 5 && bookingResult ? (
        /* RECEIPT VIEW */
        <main className="receipt-container">
          <div className="receipt-card">
            <div className="success-icon">✓</div>
            <h2>Reservation Confirmed!</h2>
            <p className="receipt-sub">Confirmation sent to <strong>{formData.email}</strong></p>

            <div className="ref-code-box">
              <span>CANCELLATION REFERENCE CODE</span>
              <strong>{bookingResult.cancellation_code}</strong>
            </div>

            <div className="receipt-details-list">
              <div className="row"><span>Customer:</span> <strong>{formData.full_name}</strong></div>
              <div className="row"><span>Services:</span> <strong>{selectedServices.map(s => s.name).join(', ')}</strong></div>
              <div className="row"><span>Professional:</span> <strong>{selectedStaff.name}</strong></div>
              <div className="row"><span>Date & Time:</span> <strong>{selectedSlot?.timeDisplay} (New York Time)</strong></div>
              <div className="row"><span>Total Bill:</span> <strong>${totalPrice.toFixed(2)} (Paid in Salon)</strong></div>
            </div>

            <button
              className="btn-primary-lg"
              onClick={() => {
                setStep(1);
                setSelectedServices([]);
                setSelectedSlot(null);
                setBookingResult(null);
              }}
            >
              Book Another Appointment
            </button>
          </div>
        </main>
      ) : (
        /* MAIN SPLIT-SCREEN WORKFLOW */
        <main className="fresha-split-layout">
          {/* LEFT COLUMN */}
          <div className="flow-main-column">
            <nav className="stepper-breadcrumbs">
              <span className={`step-item ${step === 1 ? 'active' : step > 1 ? 'completed' : ''}`} onClick={() => setStep(1)}>
                1. Services ({selectedServices.length})
              </span>
              <span className="chevron">›</span>
              <span className={`step-item ${step === 2 ? 'active' : step > 2 ? 'completed' : ''}`} onClick={() => selectedServices.length > 0 && setStep(2)}>
                2. Professional
              </span>
              <span className="chevron">›</span>
              <span className={`step-item ${step === 3 ? 'active' : step > 3 ? 'completed' : ''}`} onClick={() => selectedServices.length > 0 && selectedStaff && setStep(3)}>
                3. Time
              </span>
              <span className="chevron">›</span>
              <span className={`step-item ${step === 4 ? 'active' : ''}`}>
                4. Confirm & Card
              </span>
            </nav>

            {/* STEP 1: MULTI-SERVICE SELECTION */}
            {step === 1 && (
              <section className="step-panel">
                <h2 className="panel-title">Select Services</h2>
                <p className="panel-subtitle">Select one or multiple services to add them to your reservation bill.</p>

                <div className="category-pill-bar">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      className={`cat-pill ${selectedCategory === cat ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="services-list-container">
                  {filteredServices.map((service) => {
                    const isSelected = selectedServices.some((s) => s.id === service.id);
                    return (
                      <div
                        key={service.id}
                        className={`service-list-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleToggleService(service)}
                      >
                        <div className="service-info">
                          <h3 className="service-title-text">{service.name}</h3>
                          <span className="service-meta">⏱ {service.duration_minutes} Mins • {service.category}</span>
                        </div>

                        <div className="service-price-action">
                          <span className="price-text">{service.price_display}</span>
                          <button className={`add-circle-btn ${isSelected ? 'active' : ''}`}>
                            {isSelected ? '✓ Added' : '+ Add'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* STEP 2: PROFESSIONAL */}
            {step === 2 && (
              <section className="step-panel">
                <button className="back-link-btn" onClick={() => setStep(1)}>← Back to Services</button>
                <h2 className="panel-title">Select Professional</h2>

                <div className="staff-grid">
                  {STAFF_MEMBERS.map((staff) => {
                    const isSelected = selectedStaff.id === staff.id;
                    return (
                      <div
                        key={staff.id}
                        className={`staff-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedStaff(staff)}
                      >
                        <div className="staff-avatar">{staff.avatar}</div>
                        <div className="staff-details">
                          <h4>{staff.name}</h4>
                          <p>{staff.role}</p>
                        </div>
                        <button className={`select-chip-btn ${isSelected ? 'active' : ''}`}>
                          {isSelected ? 'Selected' : 'Select'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* STEP 3: TIME */}
            {step === 3 && (
              <section className="step-panel">
                <button className="back-link-btn" onClick={() => setStep(2)}>← Back to Professional</button>
                <h2 className="panel-title">Select Date & Time</h2>

                <div className="date-strip-wrapper">
                  <div className="date-strip">
                    {generateDateStrip().map((item) => {
                      const isSelected = selectedDate === item.iso;
                      return (
                        <button
                          key={item.iso}
                          className={`date-tile ${isSelected ? 'selected' : ''}`}
                          onClick={() => { setSelectedDate(item.iso); setSelectedSlot(null); }}
                        >
                          <span className="day-name">{item.dayName}</span>
                          <span className="day-num">{item.dayNum}</span>
                          <span className="month-name">{item.monthName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="slots-section">
                  <h4 className="slots-heading">Available Slots for {totalDuration} Min Duration (NY Time)</h4>

                  {loadingSlots ? (
                    <div className="loading-spinner-box">Calculating open slots...</div>
                  ) : availableSlots.length === 0 ? (
                    <p className="no-slots-msg">No slots available for this date. Pick another date above.</p>
                  ) : (
                    <div className="fresha-slots-grid">
                      {availableSlots.map((slot, idx) => (
                        <button
                          key={idx}
                          disabled={slot.isBooked}
                          className={`time-chip ${slot.isBooked ? 'booked' : ''} ${selectedSlot?.isoStart === slot.isoStart ? 'selected' : ''}`}
                          onClick={() => setSelectedSlot(slot)}
                        >
                          {slot.timeDisplay.split(' – ')[0]}
                          {slot.isBooked && <span className="booked-sub">Booked</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* STEP 4: REVIEW, CARD INPUT & POLICIES */}
            {step === 4 && (
              <section className="step-content">
                <button className="back-link-btn" onClick={() => setStep(3)}>← Back to Time Slot</button>
                <h2 className="panel-title">Review and Confirm</h2>

                <div className="in-salon-notice-card">
                  <span className="notice-icon">🔒</span>
                  <div>
                    <strong>Payment Method</strong>
                    <p>You won't be charged now, payment will be collected in store after your appointment.</p>
                  </div>
                </div>

                {serverError && <div className="error-banner">{serverError}</div>}

                {/* Guest Contact Details */}
                <div className="checkout-card-section">
                  <h3 className="section-subtitle">Guest Details</h3>
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input
                      type="text"
                      className={`styled-input ${formErrors.full_name ? 'invalid' : ''}`}
                      placeholder="e.g. Farhan Umar"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    />
                    {formErrors.full_name && <span className="input-error">{formErrors.full_name}</span>}
                  </div>

                  <div className="form-row-2col">
                    <div className="form-group">
                      <label>Email Address *</label>
                      <input
                        type="email"
                        className={`styled-input ${formErrors.email ? 'invalid' : ''}`}
                        placeholder="name@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                      {formErrors.email && <span className="input-error">{formErrors.email}</span>}
                    </div>

                    <div className="form-group">
                      <label>Phone Number *</label>
                      <input
                        type="tel"
                        className={`styled-input ${formErrors.phone ? 'invalid' : ''}`}
                        placeholder="(212) 555-0199"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                      {formErrors.phone && <span className="input-error">{formErrors.phone}</span>}
                    </div>
                  </div>
                </div>

                {/* Card-on-File Details */}
                <div className="checkout-card-section">
                  <h3 className="section-subtitle">Pay by debit or credit card</h3>
                  <p className="card-sub-label">Add card details for reservation hold</p>

                  <div className="form-group">
                    <label>Name on card *</label>
                    <input
                      type="text"
                      className="styled-input"
                      placeholder="Cardholder Name"
                      value={cardData.name_on_card}
                      onChange={(e) => setCardData({ ...cardData, name_on_card: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Card number *</label>
                    <input
                      type="text"
                      className={`styled-input ${formErrors.card_number ? 'invalid' : ''}`}
                      placeholder="•••• •••• •••• ••••"
                      maxLength="19"
                      value={cardData.card_number}
                      onChange={(e) => setCardData({ ...cardData, card_number: e.target.value })}
                    />
                    {formErrors.card_number && <span className="input-error">{formErrors.card_number}</span>}
                  </div>

                  <div className="form-row-2col">
                    <div className="form-group">
                      <label>Expiry date *</label>
                      <input
                        type="text"
                        className={`styled-input ${formErrors.expiry ? 'invalid' : ''}`}
                        placeholder="MM/YY"
                        maxLength="5"
                        value={cardData.expiry}
                        onChange={(e) => setCardData({ ...cardData, expiry: e.target.value })}
                      />
                      {formErrors.expiry && <span className="input-error">{formErrors.expiry}</span>}
                    </div>

                    <div className="form-group">
                      <label>Security code *</label>
                      <input
                        type="password"
                        className={`styled-input ${formErrors.cvc ? 'invalid' : ''}`}
                        placeholder="123"
                        maxLength="4"
                        value={cardData.cvc}
                        onChange={(e) => setCardData({ ...cardData, cvc: e.target.value })}
                      />
                      {formErrors.cvc && <span className="input-error">{formErrors.cvc}</span>}
                    </div>
                  </div>

                  <div className="card-secure-badges">
                    <span>Pay securely with</span>
                    <span className="card-badge visa">VISA</span>
                    <span className="card-badge mc">MC</span>
                    <span className="card-badge disc">DISC</span>
                  </div>
                </div>

                {/* Policy Cards */}
                <div className="more-details-section">
                  <h3 className="section-heading-lg">More details</h3>

                  <div className="policy-detail-card">
                    <h4>Cancellation policy</h4>
                    <p>
                      Cancel for free up to 24 hours ahead, otherwise you will be charged a <strong>${lateFee}</strong> late cancellation fee (50%). If you do not show up to your appointment, you will be charged a <strong>${noShowFee}</strong> no-show fee (100%).
                    </p>
                  </div>

                  <div className="policy-detail-card">
                    <h4>Important information</h4>
                    <p>
                      Please cancel or reschedule your appointments within 24 hours to avoid any cancellation fees. Payment is collected in salon via Cash, Visa, MasterCard, or Discover <em>(No American Express)</em>.
                    </p>
                  </div>

                  <div className="policy-detail-card">
                    <h4>Comments or requests</h4>
                    <p className="sub-hint">Anything you'd like us to know?</p>
                    <textarea
                      className="styled-textarea"
                      rows="3"
                      placeholder="Add special instructions or hair notes..."
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    />
                  </div>

                  <div className="checkbox-agree-box">
                    <label className="checkbox-flex">
                      <input
                        type="checkbox"
                        className="styled-checkbox"
                        checked={policyAgreed}
                        onChange={(e) => {
                          setPolicyAgreed(e.target.checked);
                          if (formErrors.policyAgreed) setFormErrors({ ...formErrors, policyAgreed: null });
                        }}
                      />
                      <span>
                        I agree to the <strong>Le Salon NYC Policies</strong> and cancellation fee terms.
                      </span>
                    </label>
                    {formErrors.policyAgreed && <span className="input-error block">{formErrors.policyAgreed}</span>}
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* RIGHT COLUMN: STICKY SUMMARY SIDEBAR */}
          <aside className="sticky-summary-column">
            <div className="summary-card">
              <div className="summary-salon-header">
                <div className="salon-thumbnail">💈</div>
                <div>
                  <h3 className="salon-name">Le Salon NYC</h3>
                  <p className="salon-rating">4.94 ★★★★★ <span className="rating-count">(688)</span></p>
                  <p className="salon-address">310 East 44th St, Manhattan, NY</p>
                </div>
              </div>

              <div className="summary-body">
                {selectedServices.length > 0 ? (
                  <div className="selected-services-bill-list">
                    {selectedServices.map((s) => (
                      <div key={s.id} className="bill-item-row">
                        <div>
                          <h4 className="bill-item-title">{s.name}</h4>
                          <span className="bill-item-meta">{s.duration_minutes} min with {selectedStaff.name}</span>
                        </div>
                        <div className="bill-item-price">${s.starting_price.toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-summary-text">No services selected yet.</p>
                )}

                {selectedSlot && (
                  <div className="selected-time-box">
                    <span className="clock-icon">🕒</span>
                    <div>
                      <strong>{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</strong>
                      <p>{selectedSlot.timeDisplay} ({totalDuration} min duration)</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="summary-footer">
                <div className="tax-row">
                  <span>Tax</span>
                  <span>$0.00</span>
                </div>
                <div className="total-row">
                  <span>Total</span>
                  <strong className="total-price">${totalPrice.toFixed(2)}</strong>
                </div>

                <button
                  className="btn-continue-main"
                  disabled={!canContinue() || submitting}
                  onClick={handleSidebarContinue}
                >
                  {submitting ? 'Processing...' : step === 4 ? 'Confirm Reservation' : 'Continue →'}
                </button>
              </div>
            </div>
          </aside>
        </main>
      )}
    </div>
  );
}