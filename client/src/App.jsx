import React, { useState, useEffect } from 'react';

const API_BASE_URL = 'https://lesalon-api.onrender.com';

export default function App() {
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedService, setSelectedService] = useState(null);
  
  // Date & Time states
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(null);
  const [bookedAppointments, setBookedAppointments] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Calendar state
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());

  // Form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  // Step state
  const [step, setStep] = useState(1);
  const [loadingServices, setLoadingServices] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchServices();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchBookedSlots(selectedDate);
    }
  }, [selectedDate]);

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
      setErrorMessage('Backend server waking up (~30s cold start). Please click Retry.');
    } finally {
      setLoadingServices(false);
    }
  };

  const fetchBookedSlots = async (dateStr) => {
    setLoadingSlots(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/booked-slots?date=${dateStr}`);
      if (res.ok) {
        const data = await res.json();
        setBookedAppointments(data);
      }
    } catch (err) {
      console.error('Error fetching booked slots:', err);
    } finally {
      setLoadingSlots(false);
    }
  };

  const categories = ['All', ...new Set(services.map((s) => s.category || 'General'))];
  const filteredServices = selectedCategory === 'All'
    ? services
    : services.filter((s) => (s.category || 'General') === selectedCategory);

  // Automatic Step Transition on Service Select
  const handleServiceSelect = (service) => {
    setSelectedService(service);
    setSelectedTimeSlot(null);
    setStep(2); // Instantly moves to Calendar page
  };

  // Dynamic Time Slot Calculation
  const generateTimeSlots = () => {
    if (!selectedDate || !selectedService) return [];
    
    const [year, month, day] = selectedDate.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay();

    if (dayOfWeek === 0) return []; // Sunday Closed

    const duration = selectedService.duration_minutes || 45;
    const startHour = 10;
    const endHour = dayOfWeek === 6 ? 18 : 20;

    const slots = [];
    let currentMins = startHour * 60;
    const endMins = endHour * 60;

    while (currentMins + duration <= endMins) {
      const slotStart = currentMins;
      const slotEnd = currentMins + duration;

      const isBooked = bookedAppointments.some((b) => {
        const bDate = new Date(b.start_time);
        const bStartMins = bDate.getHours() * 60 + bDate.getMinutes();
        const bEndMins = bStartMins + (parseInt(b.duration_minutes) || 30);
        return Math.max(slotStart, bStartMins) < Math.min(slotEnd, bEndMins);
      });

      const formatTime = (mins) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayH = h % 12 === 0 ? 12 : h % 12;
        const displayM = m < 10 ? `0${m}` : m;
        return `${displayH}:${displayM} ${ampm}`;
      };

      const startHRaw = Math.floor(slotStart / 60);
      const startMRaw = slotStart % 60;
      const timeVal = `${startHRaw < 10 ? '0' + startHRaw : startHRaw}:${startMRaw < 10 ? '0' + startMRaw : startMRaw}`;

      slots.push({
        label: `${formatTime(slotStart)} - ${formatTime(slotEnd)}`,
        timeValue: timeVal,
        isBooked: isBooked,
      });

      currentMins += duration;
    }
    return slots;
  };

  const handleSubmitBooking = async (e) => {
    e.preventDefault();
    if (!selectedService || !selectedDate || !selectedTimeSlot || !fullName || !email || !phone) {
      setErrorMessage('Please complete all required fields.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    const payload = {
      service_id: selectedService.id,
      start_time: `${selectedDate}T${selectedTimeSlot.timeValue}:00`,
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
        setErrorMessage(data.message || 'Failed to confirm booking.');
      }
    } catch (err) {
      console.error('Submission error:', err);
      setErrorMessage('Network error connecting to booking engine.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedService(null);
    setSelectedDate('');
    setSelectedTimeSlot(null);
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

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayIndex = new Date(calYear, calMonth, 1).getDay();
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(calYear - 1);
    } else {
      setCalMonth(calMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(calYear + 1);
    } else {
      setCalMonth(calMonth + 1);
    }
  };

  const availableSlots = generateTimeSlots();

  return (
    <div className="salon-container">
      {/* Header */}
      <header className="salon-header">
        <h1>LE SALON NYC</h1>
        <p>310 East 44th St, Manhattan • (212) 949-6693 • Online Reservations</p>
      </header>

      {/* Progress Bar */}
      <div className="steps-bar">
        <div className={`step-item ${step >= 1 ? 'active' : ''}`}>
          <span className="step-number">1</span> Select Service
        </div>
        <div className="step-divider"></div>
        <div className={`step-item ${step >= 2 ? 'active' : ''}`}>
          <span className="step-number">2</span> Date & Time
        </div>
        <div className="step-divider"></div>
        <div className={`step-item ${step === 3 ? 'active' : ''}`}>
          <span className="step-number">3</span> Confirmation
        </div>
      </div>

      {errorMessage && (
        <div className="alert-error">
          <span>{errorMessage}</span>
          <button onClick={fetchServices} className="btn-secondary" style={{ padding: '4px 10px' }}>
            Retry
          </button>
        </div>
      )}

      {/* STEP 1: SERVICE SELECTION */}
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
              <p style={{ color: 'var(--text-muted)' }}>Loading services catalog...</p>
            </div>
          ) : (
            <div className="services-grid">
              {filteredServices.map((service) => {
                const isSelected = selectedService?.id === service.id;
                return (
                  <div
                    key={service.id}
                    onClick={() => handleServiceSelect(service)}
                    className={`service-card ${isSelected ? 'selected' : ''}`}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <h3 className="service-title">{service.name}</h3>
                        <span className="service-price">{formatPrice(service)}</span>
                      </div>
                      <p className="service-meta">⏱ {service.duration_minutes} Mins • {service.category || 'General'}</p>
                    </div>
                    <div className="service-footer">
                      <span>Click to select & continue</span>
                      <div className="check-circle">{isSelected ? '✓' : ''}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* STEP 2: INTERACTIVE CALENDAR & TIME SLOTS */}
      {step === 2 && selectedService && (
        <div className="salon-card-box">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '1.4rem' }}>Select Date & Time Slot</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Service: <strong>{selectedService.name}</strong> ({selectedService.duration_minutes} Mins)
              </p>
            </div>
            <button onClick={() => setStep(1)} className="btn-secondary">
              ← Change Service
            </button>
          </div>

          {/* Interactive Calendar Component */}
          <div className="calendar-wrapper">
            <div className="calendar-header">
              <button onClick={handlePrevMonth} className="btn-secondary" style={{ padding: '4px 12px' }}>‹</button>
              <h3 style={{ fontSize: '1.1rem' }}>{monthNames[calMonth]} {calYear}</h3>
              <button onClick={handleNextMonth} className="btn-secondary" style={{ padding: '4px 12px' }}>›</button>
            </div>

            <div className="calendar-grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="cal-day-label">{d}</div>
              ))}

              {Array.from({ length: firstDayIndex }).map((_, i) => (
                <div key={`empty-${i}`}></div>
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const formattedM = (calMonth + 1).toString().padStart(2, '0');
                const formattedD = dayNum.toString().padStart(2, '0');
                const dateStr = `${calYear}-${formattedM}-${formattedD}`;
                
                const dateObj = new Date(calYear, calMonth, dayNum);
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const isPast = dateObj < today;
                const isSunday = dateObj.getDay() === 0;
                const isSelected = selectedDate === dateStr;

                return (
                  <button
                    key={dateStr}
                    disabled={isPast || isSunday}
                    onClick={() => {
                      setSelectedDate(dateStr);
                      setSelectedTimeSlot(null);
                    }}
                    className={`cal-date-btn ${isSelected ? 'selected' : ''}`}
                  >
                    {dayNum}
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
              * Mon–Fri: 10 AM – 8 PM | Sat: 10 AM – 6 PM | Sun: Closed
            </p>
          </div>

          {/* Available Time Slots Grid */}
          {selectedDate && (
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
              <h4 style={{ fontSize: '1rem', marginBottom: '12px' }}>
                Available Time Slots for {selectedDate} ({selectedService.duration_minutes}-min intervals):
              </h4>

              {loadingSlots ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Checking real-time slot availability...</p>
              ) : availableSlots.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No available time slots on this day.</p>
              ) : (
                <div className="slots-grid">
                  {availableSlots.map((slot) => (
                    <button
                      key={slot.timeValue}
                      disabled={slot.isBooked}
                      onClick={() => setSelectedTimeSlot(slot)}
                      className={`slot-btn ${selectedTimeSlot?.timeValue === slot.timeValue ? 'selected' : ''}`}
                    >
                      {slot.label} {slot.isBooked ? '(Reserved)' : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Proceed Button */}
          {selectedDate && selectedTimeSlot && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button onClick={() => setStep(3)} className="btn-gold">
                Continue to Client Details →
              </button>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: CLIENT DETAILS FORM */}
      {step === 3 && !bookingResult && selectedService && selectedDate && selectedTimeSlot && (
        <div className="salon-card-box">
          <h2 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>Client Details</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
            Reservation: <strong>{selectedService.name}</strong> on <strong>{selectedDate}</strong> at <strong>{selectedTimeSlot.label}</strong>
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
                  placeholder="(212) 949-6693"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Special Notes / Requests (Optional)</label>
              <textarea
                rows="3"
                placeholder="Hair condition preferences or special requests..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="form-input"
              ></textarea>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
              <button type="button" onClick={() => setStep(2)} className="btn-secondary">
                ← Back
              </button>
              <button type="submit" disabled={submitting} className="btn-gold">
                {submitting ? 'Confirming...' : 'Complete Reservation'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CONFIRMATION SCREEN */}
      {bookingResult && (
        <div className="salon-card-box" style={{ textAlign: 'center', padding: '36px' }}>
          <div style={{ width: '60px', height: '60px', backgroundColor: '#FDF9EE', border: '2px solid var(--gold-accent)', color: 'var(--gold-accent)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', margin: '0 auto 16px auto', lineHeight: '60px' }}>
            ✓
          </div>
          <h2 style={{ fontSize: '1.6rem', color: 'var(--gold-accent)', marginBottom: '8px' }}>Appointment Confirmed!</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
            A confirmation email has been sent to <strong>{email}</strong>.
          </p>

          <div style={{ backgroundColor: '#FAF8F5', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', textAlign: 'left', fontSize: '0.85rem', marginBottom: '24px', lineHeight: '1.8' }}>
            <p><strong>Service:</strong> {selectedService?.name}</p>
            <p><strong>Date & Time:</strong> {selectedDate} ({selectedTimeSlot?.label})</p>
            <p><strong>Client:</strong> {fullName} ({phone})</p>
            <p style={{ color: 'var(--gold-accent)' }}><strong>Cancellation Code:</strong> <span style={{ fontFamily: 'monospace' }}>{bookingResult.cancellation_code}</span></p>
          </div>

          <button onClick={handleReset} className="btn-secondary">
            Book Another Appointment
          </button>
        </div>
      )}

      {/* Footer */}
      <footer className="salon-footer">
        <p>© {new Date().getFullYear()} Le Salon NYC. 310 East 44th St, Manhattan, NY 10017.</p>
      </footer>
    </div>
  );
}