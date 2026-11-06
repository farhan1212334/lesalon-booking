import React, { useState, useEffect } from 'react';

const API_BASE_URL = 'https://lesalon-api.onrender.com';

export default function App() {
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedService, setSelectedService] = useState(null);
  
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const [step, setStep] = useState(1);
  const [loadingServices, setLoadingServices] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    setLoadingServices(true);
    setErrorMessage('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/services`);
      if (!response.ok) throw new Error(`Server status: ${response.status}`);
      const data = await response.json();
      setServices(data);
    } catch (err) {
      console.error('Error fetching services:', err);
      setErrorMessage(
        'Backend server is waking up (Render free tier takes ~30 seconds on cold start). Please click Retry below.'
      );
    } finally {
      setLoadingServices(false);
    }
  };

  const categories = ['All', ...new Set(services.map((s) => s.category || 'General'))];
  const filteredServices = selectedCategory === 'All'
    ? services
    : services.filter((s) => (s.category || 'General') === selectedCategory);

  const handleSubmitBooking = async (e) => {
    e.preventDefault();
    if (!selectedService || !date || !time || !fullName || !email || !phone) {
      setErrorMessage('Please complete all required fields.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    const payload = {
      service_id: selectedService.id,
      start_time: `${date}T${time}:00`,
      full_name: fullName,
      email: email,
      phone: phone,
      notes: notes,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setBookingResult(data);
        setStep(3);
      } else {
        setErrorMessage(data.message || 'Failed to confirm booking. Please try again.');
      }
    } catch (err) {
      console.error('Submission error:', err);
      setErrorMessage('Network error connecting to booking engine. Please retry.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedService(null);
    setDate('');
    setTime('');
    setFullName('');
    setEmail('');
    setPhone('');
    setNotes('');
    setErrorMessage('');
    setBookingResult(null);
    setStep(1);
  };

  const formatPrice = (service) => {
    if (service.price_mode === 'consultation' || !service.price) return 'Consultation Required';
    const priceStr = `$${parseFloat(service.price).toFixed(2)}`;
    return service.price_mode === 'starting' ? `Starting at ${priceStr}` : priceStr;
  };

  return (
    <div className="salon-container">
      {/* Header */}
      <header className="salon-header">
        <h1>LE SALON NYC</h1>
        <p>310 East 44th St, Manhattan • (212) 555-0199 • Online Reservations</p>
      </header>

      {/* Progress Bar */}
      <div className="steps-bar">
        <div className={`step-item ${step >= 1 ? 'active' : ''}`}>
          <span className="step-number">1</span> Select Service & Time
        </div>
        <div className="step-divider"></div>
        <div className={`step-item ${step >= 2 ? 'active' : ''}`}>
          <span className="step-number">2</span> Your Details
        </div>
        <div className="step-divider"></div>
        <div className={`step-item ${step === 3 ? 'active' : ''}`}>
          <span className="step-number">3</span> Confirmation
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="alert-error">
          <span>{errorMessage}</span>
          <button onClick={fetchServices} className="btn-secondary" style={{ padding: '4px 10px' }}>
            Retry
          </button>
        </div>
      )}

      {/* STEP 1: SERVICE & DATETIME */}
      {step === 1 && (
        <div>
          <div className="category-tabs">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`tab-btn ${selectedCategory === cat ? 'active' : ''}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {loadingServices ? (
            <div className="salon-card-box" style={{ textAlign: 'center', padding: '40px' }}>
              <p style={{ color: 'var(--text-muted)' }}>Loading service catalog from backend...</p>
            </div>
          ) : (
            <div className="services-grid">
              {filteredServices.map((service) => {
                const isSelected = selectedService?.id === service.id;
                return (
                  <div
                    key={service.id}
                    onClick={() => setSelectedService(service)}
                    className={`service-card ${isSelected ? 'selected' : ''}`}
                  >
                    <div>
                      <div className="service-header">
                        <h3 className="service-title">{service.name}</h3>
                        <span className="service-price">{formatPrice(service)}</span>
                      </div>
                      <p className="service-meta">⏱ {service.duration_minutes} Mins • {service.category || 'General'}</p>
                    </div>
                    <div className="service-footer">
                      <span>{isSelected ? 'Selected' : 'Click to select'}</span>
                      <div className="check-circle">{isSelected ? '✓' : ''}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selectedService && (
            <div className="salon-card-box">
              <h3 style={{ color: 'var(--accent-gold)', marginBottom: '16px', fontSize: '0.875rem', textTransform: 'uppercase' }}>
                Choose Date & Time Slot
              </h3>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().split('T')[0]}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Time Slot</label>
                  <input
                    type="time"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button
                  disabled={!date || !time}
                  onClick={() => setStep(2)}
                  className="btn-gold"
                  style={{ width: 'auto' }}
                >
                  Continue to Client Details →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: CLIENT DETAILS FORM */}
      {step === 2 && selectedService && (
        <div className="salon-card-box">
          <h2 style={{ color: 'var(--accent-gold)', marginBottom: '8px' }}>Client Information</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
            Service: <strong>{selectedService.name}</strong> on <strong>{date}</strong> at <strong>{time}</strong>
          </p>

          <form onSubmit={handleSubmitBooking}>
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input
                type="text"
                required
                placeholder="Jane Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="jane@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number *</label>
                <input
                  type="tel"
                  required
                  placeholder="(212) 555-0199"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Special Notes (Optional)</label>
              <textarea
                rows="3"
                placeholder="Hair condition preferences or special requests..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="form-input"
              ></textarea>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
              <button type="button" onClick={() => setStep(1)} className="btn-secondary">
                ← Back
              </button>
              <button type="submit" disabled={submitting} className="btn-gold" style={{ width: 'auto' }}>
                {submitting ? 'Confirming...' : 'Complete Reservation'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 3: CONFIRMATION SCREEN */}
      {step === 3 && bookingResult && (
        <div className="salon-card-box confirmation-box">
          <div className="success-icon">✓</div>
          <h2 style={{ color: '#34d399', marginBottom: '8px' }}>Appointment Confirmed!</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
            A confirmation email has been sent to <strong>{email}</strong>.
          </p>

          <div style={{ backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '12px', padding: '16px', textAlign: 'left', fontSize: '0.875rem', marginBottom: '24px' }}>
            <p style={{ marginBottom: '8px' }}><strong>Service:</strong> {selectedService?.name}</p>
            <p style={{ marginBottom: '8px' }}><strong>Date & Time:</strong> {date} at {time}</p>
            <p style={{ marginBottom: '8px' }}><strong>Client:</strong> {fullName} ({phone})</p>
            <p style={{ color: 'var(--accent-gold)' }}><strong>Cancellation Code:</strong> <span style={{ fontFamily: 'monospace' }}>{bookingResult.cancellation_code}</span></p>
          </div>

          <button onClick={handleReset} className="btn-secondary">
            Book Another Appointment
          </button>
        </div>
      )}

      <footer className="salon-footer">
        <p>© {new Date().getFullYear()} Le Salon NYC. 310 East 44th St, Manhattan, NY 10017.</p>
      </footer>
    </div>
  );
}