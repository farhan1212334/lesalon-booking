import React, { useState, useEffect } from 'react';
import './index.css';

const API_BASE_URL = 'https://lesalon-api.onrender.com/api';

export default function App() {
  const [step, setStep] = useState(1);
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedService, setSelectedService] = useState(null);
  
  // Date & Slot state
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [bookedSlots, setBookedSlots] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. Load Services on Mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/services`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setServices(data);
      })
      .catch((err) => console.error('Error loading services:', err));
  }, []);

  // 2. Fetch Booked Slots & Compute Duration Slots when Date/Service Changes
  useEffect(() => {
    if (!selectedDate || !selectedService) return;

    setLoadingSlots(true);
    fetch(`${API_BASE_URL}/booked-slots?date=${selectedDate}`)
      .then((res) => res.json())
      .then((data) => {
        const booked = Array.isArray(data) ? data : [];
        setBookedSlots(booked);
        calculateTimeSlots(selectedDate, selectedService.duration_minutes, booked);
      })
      .catch((err) => {
        console.error('Error fetching booked slots:', err);
        calculateTimeSlots(selectedDate, selectedService.duration_minutes, []);
      })
      .finally(() => setLoadingSlots(false));
  }, [selectedDate, selectedService]);

  // Dynamic Slot Calculation with Collision Detection
  const calculateTimeSlots = (dateStr, durationMins, bookedList) => {
    const slots = [];
    const openHour = 9;  // 9:00 AM
    const closeHour = 19; // 7:00 PM (19:00)

    const startOfDay = new Date(`${dateStr}T00:00:00`);
    const salonOpenTime = new Date(startOfDay.getTime() + openHour * 60 * 60 * 1000);
    const salonCloseTime = new Date(startOfDay.getTime() + closeHour * 60 * 60 * 1000);

    let currentTime = new Date(salonOpenTime);

    while (currentTime.getTime() + durationMins * 60000 <= salonCloseTime.getTime()) {
      const slotStart = new Date(currentTime);
      const slotEnd = new Date(slotStart.getTime() + durationMins * 60000);

      // Check collision with existing database bookings
      const isBooked = bookedList.some((booking) => {
        const bStart = new Date(booking.start_time).getTime();
        const bEnd = bStart + (booking.duration_minutes || 45) * 60000;
        return slotStart.getTime() < bEnd && slotEnd.getTime() > bStart;
      });

      const formattedTime = slotStart.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      slots.push({
        timeDisplay: formattedTime,
        isoStart: slotStart.toISOString(),
        isBooked,
      });

      // Increment in 30-minute step intervals across the business day
      currentTime = new Date(currentTime.getTime() + 30 * 60000);
    }

    setAvailableSlots(slots);
  };

  const handleServiceSelect = (service) => {
    setSelectedService(service);
    setSelectedSlot(null);
    setStep(2);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSlot || !formData.full_name || !formData.email || !formData.phone) {
      setErrorMsg('Please fill out all required fields.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const payload = {
        service_id: selectedService.id,
        start_time: selectedSlot.isoStart,
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        notes: formData.notes,
      };

      const res = await fetch(`${API_BASE_URL}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setBookingResult(data);
        setStep(4); // Success screen
      } else {
        setErrorMsg(data.message || 'Booking failed. Please try another slot.');
      }
    } catch (err) {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setSubmitting(false);
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
      </header>

      {/* Step Progress Bar */}
      <nav className="step-bar">
        <div className={`step-node ${step >= 1 ? 'active' : ''}`}>
          <span className="step-num">1</span>
          <span className="step-label">Select Service</span>
        </div>
        <div className={`step-line ${step >= 2 ? 'active' : ''}`} />
        <div className={`step-node ${step >= 2 ? 'active' : ''}`}>
          <span className="step-num">2</span>
          <span className="step-label">Date & Time</span>
        </div>
        <div className={`step-line ${step >= 3 ? 'active' : ''}`} />
        <div className={`step-node ${step >= 3 ? 'active' : ''}`}>
          <span className="step-num">3</span>
          <span className="step-label">Client Details</span>
        </div>
      </nav>

      {/* STEP 1: SERVICE SELECTION GRID */}
      {step === 1 && (
        <section className="step-content">
          <div className="section-header">
            <h2>Select a Service</h2>
            <p>Choose from our luxury hair care, coloring, and styling treatments.</p>
          </div>

          {/* Category Filter Pills */}
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

          {/* Service Cards Grid */}
          <div className="services-grid">
            {filteredServices.map((service) => (
              <div
                key={service.id}
                className={`service-card ${selectedService?.id === service.id ? 'selected' : ''}`}
                onClick={() => handleServiceSelect(service)}
              >
                <div className="card-top">
                  <span className="category-badge">{service.category || 'Service'}</span>
                  <span className="service-duration">⏱ {service.duration_minutes} Mins</span>
                </div>
                <h3 className="service-name">{service.name}</h3>
                <div className="card-bottom">
                  <div className="price-tag">
                    <span className="price-label">Starting at</span>
                    <span className="price-val">${service.starting_price}</span>
                  </div>
                  <button className="card-btn">Select Slot →</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* STEP 2: CALENDAR & DYNAMIC TIME SLOTS */}
      {step === 2 && selectedService && (
        <section className="step-content">
          <div className="section-header">
            <button className="back-link" onClick={() => setStep(1)}>← Change Service</button>
            <h2>Choose Date & Available Time</h2>
            <p className="service-summary-badge">
              Selected: <strong>{selectedService.name}</strong> ({selectedService.duration_minutes} mins)
            </p>
          </div>

          <div className="booking-panel">
            {/* Calendar Date Input */}
            <div className="date-picker-box">
              <label className="input-label">Select Date</label>
              <input
                type="date"
                className="custom-date-input"
                value={selectedDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>

            {/* Time Slot Grid */}
            <div className="slots-container">
              <label className="input-label">
                Available Slots for {selectedService.duration_minutes}-Min Session:
              </label>

              {loadingSlots ? (
                <div className="loading-spinner">Calculating open slots...</div>
              ) : availableSlots.length === 0 ? (
                <p className="no-slots">No available slots for this date. Please pick another day.</p>
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
                      <span>{slot.timeDisplay}</span>
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
              Continue to Details →
            </button>
          </div>
        </section>
      )}

      {/* STEP 3: CLIENT DETAILS FORM */}
      {step === 3 && selectedService && selectedSlot && (
        <section className="step-content">
          <div className="section-header">
            <button className="back-link" onClick={() => setStep(2)}>← Change Date/Time</button>
            <h2>Guest Information</h2>
            <p>Please enter your contact information to receive your confirmation receipt.</p>
          </div>

          <div className="booking-summary-card">
            <div><strong>Service:</strong> {selectedService.name}</div>
            <div><strong>Duration:</strong> {selectedService.duration_minutes} Mins</div>
            <div><strong>Date & Time:</strong> {new Date(selectedSlot.isoStart).toLocaleString()}</div>
            <div><strong>Total Due at Salon:</strong> ${selectedService.starting_price}</div>
          </div>

          <form onSubmit={handleFormSubmit} className="client-form">
            {errorMsg && <div className="error-banner">{errorMsg}</div>}

            <div className="form-group">
              <label>Full Name *</label>
              <input
                type="text"
                required
                placeholder="e.g., Jane Doe"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="jane@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Phone Number *</label>
                <input
                  type="tel"
                  required
                  placeholder="(212) 555-0199"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Special Notes or Requests (Optional)</label>
              <textarea
                rows="3"
                placeholder="Let us know about hair sensitivities, preferences, or questions..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            <div className="step-actions">
              <button type="button" className="btn-secondary" onClick={() => setStep(2)}>Back</button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Confirming Reservation...' : 'Complete Reservation'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* STEP 4: CONFIRMATION RECEIPT */}
      {step === 4 && bookingResult && (
        <section className="step-content confirmation-view">
          <div className="success-badge-icon">✓</div>
          <h2 className="confirmation-title">Reservation Confirmed!</h2>
          <p className="confirmation-subtext">
            A confirmation receipt has been sent to <strong>{formData.email}</strong>.
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
              <span>Date & Time:</span>
              <strong>{new Date(selectedSlot.isoStart).toLocaleString()}</strong>
            </div>
            <div className="summary-item">
              <span>Salon Location:</span>
              <strong>310 East 44th St, Manhattan, NY 10017</strong>
            </div>
          </div>

          <button
            className="btn-primary"
            onClick={() => {
              setStep(1);
              setSelectedService(null);
              setSelectedSlot(null);
              setBookingResult(null);
            }}
          >
            Book Another Appointment
          </button>
        </section>
      )}
    </div>
  );
}