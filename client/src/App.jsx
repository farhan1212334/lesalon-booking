import React, { useState, useEffect } from 'react';
import './index.css';

const API_BASE_URL = 'https://lesalon-api.onrender.com/api';

// Complete Le Salon NYC Master Service Catalog
const DEFAULT_SERVICES = [
  { id: 1, name: 'Shampoo Haircut & Blow Dry', price_display: '$75 and up', starting_price: 75, duration_minutes: 75, category: 'Haircut & Styling' },
  { id: 2, name: 'Shampoo & Blow Dry', price_display: '$40 and up', starting_price: 40, duration_minutes: 45, category: 'Haircut & Styling', variants: [{ name: 'Standard Hair', price: 40, duration: 45 }, { name: 'Long Hair', price: 60, duration: 60 }, { name: 'Extra Long / Thick', price: 80, duration: 75 }] },
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
  const [selectedService, setSelectedService] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(STAFF_MEMBERS[0]);

  // Variant Modal State
  const [variantModalService, setVariantModalService] = useState(null);

  // Date & Slot State
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Client Details & Policies State
  const [formData, setFormData] = useState({ full_name: '', email: '', phone: '', notes: '' });
  const [policyAgreed, setPolicyAgreed] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);
  const [serverError, setServerError] = useState('');

  // Self-Service Cancellation State
  const [cancelData, setCancelData] = useState({ cancellation_code: '', email: '' });
  const [cancelErrors, setCancelErrors] = useState({});
  const [cancelling, setCancelling] = useState(false);
  const [cancelResult, setCancelResult] = useState(null);
  const [cancelServerError, setCancelServerError] = useState('');

  // Fetch Services from API
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
      .catch(() => console.log('Using catalog fallback'));
  }, []);

  // Fetch Booked Slots & Compute NY Time Slots
  useEffect(() => {
    if (!selectedDate || !selectedService) return;

    setLoadingSlots(true);
    const duration = selectedVariant ? selectedVariant.duration : selectedService.duration_minutes;

    fetch(`${API_BASE_URL}/booked-slots?date=${selectedDate}`)
      .then((res) => res.json())
      .then((data) => {
        const booked = Array.isArray(data) ? data : [];
        calculateTimeSlots(selectedDate, duration, booked);
      })
      .catch(() => calculateTimeSlots(selectedDate, duration, []))
      .finally(() => setLoadingSlots(false));
  }, [selectedDate, selectedService, selectedVariant]);

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

  const handleSelectServiceClick = (service) => {
    if (service.variants && service.variants.length > 0) {
      setVariantModalService(service);
    } else {
      setSelectedService(service);
      setSelectedVariant(null);
      setSelectedSlot(null);
    }
  };

  const handleSelectVariant = (service, variant) => {
    setSelectedService(service);
    setSelectedVariant(variant);
    setVariantModalService(null);
    setSelectedSlot(null);
  };

  // Form Validation
  const validateForm = () => {
    const errors = {};
    if (!formData.full_name.trim()) errors.full_name = 'Full name is required.';

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

    if (!policyAgreed) {
      errors.policyAgreed = 'You must agree to the salon cancellation policies.';
    }

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
        service_id: selectedService.id,
        start_time: selectedSlot.isoStart,
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        notes: `[Staff: ${selectedStaff.name}] ${formData.notes.trim()}`,
      };

      const res = await fetch(`${API_BASE_URL}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setBookingResult(data);
        setStep(5); // Final Receipt Step
      } else {
        setServerError(data.message || 'Booking failed. Please try another slot.');
      }
    } catch (err) {
      setServerError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancellation Submit
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

  // Next Step Validation
  const canContinue = () => {
    if (step === 1) return !!selectedService;
    if (step === 2) return !!selectedStaff;
    if (step === 3) return !!selectedSlot;
    if (step === 4) return policyAgreed && formData.full_name && formData.email && formData.phone;
    return false;
  };

  const handleSidebarContinue = () => {
    if (step < 4) {
      setStep(step + 1);
    } else if (step === 4) {
      handleFormSubmit();
    }
  };

  const categories = ['All', ...new Set(services.map((s) => s.category).filter(Boolean))];
  const filteredServices = selectedCategory === 'All'
    ? services
    : services.filter((s) => s.category === selectedCategory);

  // Date Strip Generator (7 Days)
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

  const activePriceDisplay = selectedVariant ? `$${selectedVariant.price}` : selectedService?.price_display || '$0';
  const activeDurationDisplay = selectedVariant ? selectedVariant.duration : selectedService?.duration_minutes || 0;

  return (
    <div className="fresha-app-shell">
      {/* Top Header */}
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

      {/* CANCELLATION PORTAL VIEW */}
      {viewMode === 'cancel' ? (
        <main className="cancel-standalone-container">
          {!cancelResult ? (
            <div className="cancel-card-box">
              <h2>Cancel an Appointment</h2>
              <p className="subtitle">Enter your 6-character reference code and booking email.</p>

              <div className="policy-alert-banner">
                <strong>Cancellation Policy:</strong> Free cancellations up to 24 hours prior. Cancellations within 24 hours incur a 50% fee.
              </div>

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

              {cancelResult.isLateCancellation && (
                <div className="warning-banner-box">
                  <strong>Late Cancellation Notice:</strong> Cancelled within 24 hours. A 50% service balance (${cancelResult.feeAmount || '37.50'}) has been logged to your customer profile.
                </div>
              )}

              <button className="btn-primary-lg" onClick={() => { setViewMode('booking'); setStep(1); setCancelResult(null); }}>
                Return to Service Menu
              </button>
            </div>
          )}
        </main>
      ) : step === 5 && bookingResult ? (
        /* RECEIPT / SUCCESS VIEW */
        <main className="receipt-container">
          <div className="receipt-card">
            <div className="success-icon">✓</div>
            <h2>Reservation Confirmed!</h2>
            <p className="receipt-sub">Confirmation dispatched to <strong>{formData.email}</strong></p>

            <div className="ref-code-box">
              <span>CANCELLATION REFERENCE CODE</span>
              <strong>{bookingResult.cancellation_code}</strong>
            </div>

            <div className="receipt-details-list">
              <div className="row"><span>Customer:</span> <strong>{formData.full_name}</strong></div>
              <div className="row"><span>Service:</span> <strong>{selectedService.name} {selectedVariant ? `(${selectedVariant.name})` : ''}</strong></div>
              <div className="row"><span>Professional:</span> <strong>{selectedStaff.name}</strong></div>
              <div className="row"><span>Date & Time:</span> <strong>{selectedSlot?.timeDisplay} (New York Time)</strong></div>
              <div className="row"><span>Location:</span> <strong>310 East 44th St, Manhattan, NY 10017</strong></div>
            </div>

            <button
              className="btn-primary-lg"
              onClick={() => {
                setStep(1);
                setSelectedService(null);
                setSelectedVariant(null);
                setSelectedSlot(null);
                setBookingResult(null);
              }}
            >
              Book Another Appointment
            </button>
          </div>
        </main>
      ) : (
        /* MAIN SPLIT-SCREEN BOOKING LAYOUT */
        <main className="fresha-split-layout">
          {/* LEFT COLUMN: MULTI-STEP FLOW */}
          <div className="flow-main-column">
            {/* Top Stepper Breadcrumbs */}
            <nav className="stepper-breadcrumbs">
              <span className={`step-item ${step === 1 ? 'active' : step > 1 ? 'completed' : ''}`} onClick={() => setStep(1)}>
                1. Services
              </span>
              <span className="chevron">›</span>
              <span className={`step-item ${step === 2 ? 'active' : step > 2 ? 'completed' : ''}`} onClick={() => selectedService && setStep(2)}>
                2. Professional
              </span>
              <span className="chevron">›</span>
              <span className={`step-item ${step === 3 ? 'active' : step > 3 ? 'completed' : ''}`} onClick={() => selectedService && selectedStaff && setStep(3)}>
                3. Time
              </span>
              <span className="chevron">›</span>
              <span className={`step-item ${step === 4 ? 'active' : ''}`}>
                4. Confirm
              </span>
            </nav>

            {/* STEP 1: SELECT SERVICES */}
            {step === 1 && (
              <section className="step-panel">
                <h2 className="panel-title">Select Services</h2>

                {/* Category Pills */}
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

                {/* Services List */}
                <div className="services-list-container">
                  {filteredServices.map((service) => {
                    const isSelected = selectedService?.id === service.id;
                    return (
                      <div
                        key={service.id}
                        className={`service-list-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelectServiceClick(service)}
                      >
                        <div className="service-info">
                          <h3 className="service-title-text">{service.name}</h3>
                          <span className="service-meta">⏱ {service.duration_minutes} Mins • {service.category}</span>
                        </div>

                        <div className="service-price-action">
                          <span className="price-text">{service.price_display}</span>
                          <button className={`add-circle-btn ${isSelected ? 'active' : ''}`}>
                            {isSelected ? '✓' : '+'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* STEP 2: SELECT PROFESSIONAL */}
            {step === 2 && (
              <section className="step-panel">
                <button className="back-link-btn" onClick={() => setStep(1)}>← Back to Services</button>
                <h2 className="panel-title">Select Professional</h2>
                <p className="panel-subtitle">Choose a specific stylist or select any available team member.</p>

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

            {/* STEP 3: SELECT DATE AND TIME */}
            {step === 3 && (
              <section className="step-panel">
                <button className="back-link-btn" onClick={() => setStep(2)}>← Back to Professional</button>
                <h2 className="panel-title">Select Date & Time</h2>

                {/* Horizontal Date Strip Carousel */}
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

                {/* Time Slots Grid */}
                <div className="slots-section">
                  <h4 className="slots-heading">Available Time Slots (New York Time)</h4>

                  {loadingSlots ? (
                    <div className="loading-spinner-box">Calculating open slots...</div>
                  ) : availableSlots.length === 0 ? (
                    <p className="no-slots-msg">No slots remaining for this date. Please pick another date above.</p>
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

            {/* STEP 4: REVIEW & CONFIRM */}
            {step === 4 && (
              <section className="step-content">
                <button className="back-link-btn" onClick={() => setStep(3)}>← Back to Date & Time</button>
                <h2 className="panel-title">Review and Confirm</h2>

                <div className="in-salon-notice-card">
                  <span className="notice-icon">💳</span>
                  <div>
                    <strong>Payment Method: In-Salon Collection</strong>
                    <p>You won't be charged online now. Payment is collected in store after your appointment.</p>
                  </div>
                </div>

                {serverError && <div className="error-banner">{serverError}</div>}

                <form className="checkout-form-box" noValidate>
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input
                      type="text"
                      className={`styled-input ${formErrors.full_name ? 'invalid' : ''}`}
                      placeholder="e.g. Farhan Umar"
                      value={formData.full_name}
                      onChange={(e) => {
                        setFormData({ ...formData, full_name: e.target.value });
                        if (formErrors.full_name) setFormErrors({ ...formErrors, full_name: null });
                      }}
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
                        onChange={(e) => {
                          setFormData({ ...formData, email: e.target.value });
                          if (formErrors.email) setFormErrors({ ...formErrors, email: null });
                        }}
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
                        onChange={(e) => {
                          setFormData({ ...formData, phone: e.target.value });
                          if (formErrors.phone) setFormErrors({ ...formErrors, phone: null });
                        }}
                      />
                      {formErrors.phone && <span className="input-error">{formErrors.phone}</span>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Special Requests or Notes (Optional)</label>
                    <textarea
                      className="styled-textarea"
                      rows="3"
                      placeholder="Mention hair length, preferences, or sensitivities..."
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    />
                  </div>

                  {/* Mandatory Policy Agreement Checkbox */}
                  <div className="policy-checkbox-card">
                    <h4 className="policy-heading">Salon Terms & Cancellation Policy</h4>
                    <ul className="policy-bullets">
                      <li>Payment due at salon (Cash, Visa, MasterCard, Discover. <em>No AmEx</em>).</li>
                      <li>Monetary refunds are not offered; unsatisfactory work will be fixed/redone.</li>
                      <li>Cancellations require 24 hours notice. Late cancellations incur a 50% fee.</li>
                    </ul>

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
                        I acknowledge and accept the <strong>Le Salon NYC Policies</strong>.
                      </span>
                    </label>
                    {formErrors.policyAgreed && <span className="input-error block">{formErrors.policyAgreed}</span>}
                  </div>
                </form>
              </section>
            )}
          </div>

          {/* RIGHT COLUMN: STICKY SUMMARY SIDEBAR */}
          <aside className="sticky-summary-column">
            <div className="summary-card">
              {/* Salon Header */}
              <div className="summary-salon-header">
                <div className="salon-thumbnail">💈</div>
                <div>
                  <h3 className="salon-name">Le Salon NYC</h3>
                  <p className="salon-rating">4.95 ★★★★★ <span className="rating-count">(950+)</span></p>
                  <p className="salon-address">310 East 44th St, Manhattan, NY</p>
                </div>
              </div>

              {/* Selected Item Breakdown */}
              <div className="summary-body">
                {selectedService ? (
                  <div className="selected-item-row">
                    <div className="item-title-col">
                      <h4>{selectedService.name}</h4>
                      {selectedVariant && <span className="variant-tag">{selectedVariant.name}</span>}
                      <p className="item-duration">{activeDurationDisplay} min with {selectedStaff.name}</p>
                    </div>
                    <div className="item-price">{activePriceDisplay}</div>
                  </div>
                ) : (
                  <p className="empty-summary-text">No services selected yet.</p>
                )}

                {selectedSlot && (
                  <div className="selected-time-box">
                    <span className="clock-icon">🕒</span>
                    <div>
                      <strong>{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
                      <p>{selectedSlot.timeDisplay} (NY Time)</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer / Total */}
              <div className="summary-footer">
                <div className="total-row">
                  <span>Total</span>
                  <strong className="total-price">{activePriceDisplay}</strong>
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

      {/* VARIANT OPTIONS POPUP MODAL */}
      {variantModalService && (
        <div className="modal-overlay" onClick={() => setVariantModalService(null)}>
          <div className="modal-content-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{variantModalService.name}</h3>
              <button className="close-modal-btn" onClick={() => setVariantModalService(null)}>✕</button>
            </div>

            <p className="modal-sub">Select hair length or service variation:</p>

            <div className="variants-list">
              {variantModalService.variants.map((v, i) => (
                <div
                  key={i}
                  className="variant-option-card"
                  onClick={() => handleSelectVariant(variantModalService, v)}
                >
                  <div>
                    <strong>{v.name}</strong>
                    <p className="text-muted">{v.duration} Mins</p>
                  </div>
                  <div className="variant-price">${v.price}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}