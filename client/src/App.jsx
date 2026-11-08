import React, { useState } from 'react';

// Exact Services & Pricing Menu
const SERVICES_DATA = [
  { id: 1, name: 'Shampoo haircut and blow dry', price: 75, priceSuffix: 'and up', duration: 75, category: 'Haircuts & Styling' },
  { id: 2, name: 'Shampoo and blow dry', price: 40, priceSuffix: 'and up', duration: 45, category: 'Haircuts & Styling' },
  { id: 3, name: 'Barber Haircut', price: 40, priceSuffix: '', duration: 45, category: 'Haircuts & Styling' },
  { id: 4, name: 'Single process color', price: 100, priceSuffix: 'and up', duration: 75, category: 'Color Services' },
  { id: 5, name: 'Single process color and blow dry', price: 130, priceSuffix: 'and up', duration: 120, category: 'Color Services' },
  { id: 6, name: 'Single process and full head of highlights', price: 330, priceSuffix: 'and up', duration: 150, category: 'Color & Highlights' },
  { id: 7, name: 'Single process with full head of highlights and blow dry', price: 380, priceSuffix: 'and up', duration: 180, category: 'Color & Highlights' },
  { id: 8, name: 'Full head highlights', price: 250, priceSuffix: '', duration: 120, category: 'Highlights' },
  { id: 9, name: 'Full head highlights and blow dry', price: 290, priceSuffix: '', duration: 150, category: 'Highlights' },
  { id: 10, name: 'Half head highlights', price: 180, priceSuffix: '', duration: 90, category: 'Highlights' },
  { id: 11, name: 'Half head highlights and blow dry', price: 220, priceSuffix: '', duration: 120, category: 'Highlights' },
  { id: 12, name: 'Hair treatment', price: 35, priceSuffix: '', duration: 45, category: 'Treatments & Perms' },
  { id: 13, name: 'Organic Perm', price: 150, priceSuffix: 'and up', duration: 120, category: 'Treatments & Perms' },
  { id: 14, name: 'Makeup', price: null, priceSuffix: 'upon consultation', duration: 60, category: 'Specialized Consultations' },
  { id: 15, name: 'Keratin Protein Treatment', price: null, priceSuffix: 'upon consultation', duration: 120, category: 'Specialized Consultations' }
];

const STYLISTS_DATA = [
  { id: 'any', name: 'Any Available Stylist', title: 'First available professional' },
  { id: 'ashraf', name: 'Ashraf', title: 'Master Stylist & Founder' },
  { id: 'ricardo', name: 'Ricardo', title: 'Senior Color Specialist' }
];

// Time Helper: Format minutes into 12-hour string (e.g. 600 -> "10:00 AM")
function formatMinutesTo12H(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const mStr = m < 10 ? `0${m}` : m;
  return `${h12}:${mStr} ${ampm}`;
}

// Generate Start & End Time Slots based on Total Service Duration & Salon Hours
function generateStartAndEndSlots(dateString, totalDurationMinutes) {
  if (!dateString) return { closed: false, slots: [] };
  
  const parts = dateString.split('-');
  const selectedDate = new Date(parts[0], parts[1] - 1, parts[2]);
  const dayOfWeek = selectedDate.getDay(); // 0 = Sun, 6 = Sat

  if (dayOfWeek === 0) {
    return { closed: true, reason: 'Sunday Closed', slots: [] };
  }

  const startHourMins = 10 * 60; // 10:00 AM
  const closingHourMins = (dayOfWeek === 6 ? 18 : 20) * 60; // Sat = 6 PM (18:00), Mon-Fri = 8 PM (20:00)

  const slots = [];
  let currentMins = startHourMins;

  while (currentMins + totalDurationMinutes <= closingHourMins) {
    const startTimeStr = formatMinutesTo12H(currentMins);
    const endTimeStr = formatMinutesTo12H(currentMins + totalDurationMinutes);
    
    slots.push({
      start: startTimeStr,
      end: endTimeStr,
      label: `${startTimeStr} – ${endTimeStr}`,
      duration: totalDurationMinutes
    });

    currentMins += 30; // 30-minute interval increments
  }

  return { closed: false, slots };
}

export default function App() {
  const [activeTab, setActiveTab] = useState('book');
  const [step, setStep] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState('All');
  
  // Multi-Service Selection Array
  const [selectedServices, setSelectedServices] = useState([SERVICES_DATA[0]]);
  const [selectedStylist, setSelectedStylist] = useState(STYLISTS_DATA[0]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Calculate Combined Totals
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0);
  const totalPrice = selectedServices.reduce((sum, s) => sum + (s.price || 0), 0);
  const hasConsultationService = selectedServices.some(s => s.price === null);

  // Dynamic Slot Generation based on combined duration
  const scheduleInfo = generateStartAndEndSlots(selectedDate, totalDuration);
  const [selectedSlotObj, setSelectedSlotObj] = useState(scheduleInfo.slots[0] || null);

  // Form State
  const [guest, setGuest] = useState({ fullName: '', email: '', phone: '', notes: '' });
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [validationError, setValidationError] = useState('');
  
  // Real-time Mock Booking State
  const [mockBookings, setMockBookings] = useState([]);
  const [activeConfirmation, setActiveConfirmation] = useState(null);

  // Manage Tab Search Form State
  const [cancelCodeInput, setCancelCodeInput] = useState('');
  const [cancelEmailInput, setCancelEmailInput] = useState('');
  const [cancelFeedback, setCancelFeedback] = useState(null);

  const categories = ['All', 'Haircuts & Styling', 'Color Services', 'Highlights', 'Treatments & Perms', 'Specialized Consultations'];

  const filteredServices = categoryFilter === 'All' 
    ? SERVICES_DATA 
    : SERVICES_DATA.filter(s => s.category === categoryFilter);

  // Toggle multi-service selection
  const toggleService = (service) => {
    const exists = selectedServices.some(s => s.id === service.id);
    if (exists) {
      if (selectedServices.length > 1) {
        setSelectedServices(selectedServices.filter(s => s.id !== service.id));
      }
    } else {
      setSelectedServices([...selectedServices, service]);
    }
  };

  const handleBookingConfirm = (e) => {
    e.preventDefault();
    if (!policyAccepted) {
      setValidationError('Please review and check the Le Salon NYC Terms & Policies to confirm.');
      return;
    }

    setValidationError('');
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const newBooking = {
      code,
      guestName: guest.fullName,
      guestEmail: guest.email,
      guestPhone: guest.phone,
      servicesList: selectedServices.map(s => s.name).join(', '),
      totalPriceDisplay: hasConsultationService ? `$${totalPrice} + Consultation Services` : `$${totalPrice}`,
      totalDuration,
      stylistName: selectedStylist.name,
      date: selectedDate,
      timeLabel: selectedSlotObj ? selectedSlotObj.label : '10:00 AM',
      startTime: selectedSlotObj ? selectedSlotObj.start : '10:00 AM',
      status: 'Confirmed'
    };

    setMockBookings([newBooking, ...mockBookings]);
    setActiveConfirmation(newBooking);
  };

  // Real-time Cancellation: Marks booking status as 'Canceled' to immediately free slot
  const handleCancelSearch = (e) => {
    e.preventDefault();
    setCancelFeedback(null);

    const codeClean = cancelCodeInput.trim().toUpperCase();
    const emailClean = cancelEmailInput.trim().toLowerCase();

    const foundIdx = mockBookings.findIndex(
      b => b.code === codeClean && 
           b.guestEmail.toLowerCase() === emailClean &&
           b.status === 'Confirmed'
    );

    if (foundIdx !== -1) {
      const updated = [...mockBookings];
      updated[foundIdx].status = 'Canceled'; // Slot becomes free in real-time
      setMockBookings(updated);
      setCancelFeedback({
        success: true,
        message: `Reservation ${codeClean} canceled successfully! The time slot (${updated[foundIdx].date} at ${updated[foundIdx].timeLabel}) has been released back into real-time availability.`
      });
    } else {
      setCancelFeedback({
        success: false,
        message: 'No active reservation found matching that Reference Code and Email.'
      });
    }
  };

  return (
    <div>
      {/* Header */}
      <header className="app-header">
        <div className="header-container">
          <div className="brand-block">
            <span className="brand-title">LE SALON NYC</span>
            <span className="brand-subtitle">Exclusively Organic</span>
          </div>

          <div className="tab-nav">
            <button
              className={`tab-btn ${activeTab === 'book' ? 'active' : ''}`}
              onClick={() => { setActiveTab('book'); setActiveConfirmation(null); }}
            >
              Book Service
            </button>
            <button
              className={`tab-btn ${activeTab === 'manage' ? 'active' : ''}`}
              onClick={() => { setActiveTab('manage'); setCancelFeedback(null); }}
            >
              Manage / Cancel
            </button>
          </div>
        </div>
      </header>

      {/* Main Wrapper */}
      <main className="main-wrapper">
        {activeTab === 'book' ? (
          activeConfirmation ? (
            /* Confirmation Screen */
            <div className="card-box" style={{ textAlign: 'center', padding: '36px 20px' }}>
              <div style={{ fontSize: '3rem', color: '#059669', marginBottom: '12px' }}>✓</div>
              <h2 className="font-serif" style={{ fontSize: '1.6rem', marginBottom: '8px' }}>Reservation Request Received</h2>
              <p style={{ color: '#666', fontSize: '0.88rem', marginBottom: '24px' }}>
                A confirmation summary has been sent to <strong>{activeConfirmation.guestEmail}</strong>.
              </p>

              <div style={{ background: '#faf9f5', border: '1px solid #e7e5e4', borderRadius: '14px', padding: '20px', textAlign: 'left', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #efece6' }}>
                  <span style={{ color: '#78716c', fontSize: '0.88rem' }}>Reference Code:</span>
                  <strong style={{ fontFamily: 'monospace', fontSize: '1.2rem', color: '#c59b27' }}>{activeConfirmation.code}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #efece6' }}>
                  <span style={{ color: '#78716c', fontSize: '0.88rem' }}>Selected Services:</span>
                  <strong style={{ fontSize: '0.88rem', maxWidth: '60%', textAlign: 'right' }}>{activeConfirmation.servicesList}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #efece6' }}>
                  <span style={{ color: '#78716c', fontSize: '0.88rem' }}>Total Duration:</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{activeConfirmation.totalDuration} Mins</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #efece6' }}>
                  <span style={{ color: '#78716c', fontSize: '0.88rem' }}>Total Estimate:</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>{activeConfirmation.totalPriceDisplay}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                  <span style={{ color: '#78716c', fontSize: '0.88rem' }}>Schedule Window:</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>{activeConfirmation.date} ({activeConfirmation.timeLabel})</span>
                </div>
              </div>

              <button className="btn-primary" onClick={() => { setActiveConfirmation(null); setStep(1); }}>
                Book Another Service
              </button>
            </div>
          ) : (
            <div>
              {/* Stepper Progress */}
              <div className="stepper-container">
                <div className={`step-item ${step === 1 ? 'active' : step > 1 ? 'completed' : ''}`} onClick={() => setStep(1)}>
                  <div className="step-badge">{step > 1 ? '✓' : '1'}</div>
                  <span>1. Services ({selectedServices.length})</span>
                </div>
                <div className={`step-item ${step === 2 ? 'active' : step > 2 ? 'completed' : ''}`} onClick={() => setStep(2)}>
                  <div className="step-badge">{step > 2 ? '✓' : '2'}</div>
                  <span>2. Stylist</span>
                </div>
                <div className={`step-item ${step === 3 ? 'active' : step > 3 ? 'completed' : ''}`} onClick={() => setStep(3)}>
                  <div className="step-badge">{step > 3 ? '✓' : '3'}</div>
                  <span>3. Time Slots</span>
                </div>
                <div className={`step-item ${step === 4 ? 'active' : ''}`} onClick={() => setStep(4)}>
                  <div className="step-badge">4</div>
                  <span>4. Confirm</span>
                </div>
              </div>

              {/* STEP 1: Multi-Service Selection */}
              {step === 1 && (
                <div>
                  <div className="summary-drawer">
                    <div>
                      <div style={{ fontSize: '0.82rem', opacity: 0.8 }}>Selected Services ({selectedServices.length})</div>
                      <div className="summary-tags">
                        {selectedServices.map(s => (
                          <span key={s.id} className="summary-tag">{s.name} ({s.duration}m)</span>
                        ))}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>${totalPrice} {hasConsultationService ? '+' : ''}</div>
                      <div style={{ fontSize: '0.78rem', color: '#c59b27' }}>⏱ {totalDuration} Mins Total</div>
                    </div>
                  </div>

                  {/* Category Pills */}
                  <div className="category-pills">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        className={`cat-pill ${categoryFilter === cat ? 'active' : ''}`}
                        onClick={() => setCategoryFilter(cat)}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Service Cards List */}
                  {filteredServices.map((service) => {
                    const isSelected = selectedServices.some(s => s.id === service.id);
                    return (
                      <div key={service.id} className={`service-card ${isSelected ? 'selected' : ''}`}>
                        <div className="service-details">
                          <span className="service-title">{service.name}</span>
                          <span className="service-sub">⏱ {service.duration} Mins • {service.category}</span>
                        </div>
                        <div className="service-action">
                          <span className="service-price">
                            {service.price ? `$${service.price}` : ''} {service.priceSuffix}
                          </span>
                          <button
                            className={`select-btn ${isSelected ? 'selected' : ''}`}
                            onClick={() => toggleService(service)}
                          >
                            {isSelected ? '✓ Added' : '+ Add'}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <div className="action-row">
                    <button className="btn-primary" onClick={() => setStep(2)}>
                      Continue with {selectedServices.length} Service{selectedServices.length > 1 ? 's' : ''} ({totalDuration} Mins) →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Stylist Selection */}
              {step === 2 && (
                <div>
                  <h3 className="font-serif" style={{ marginBottom: '16px', fontSize: '1.25rem' }}>Select Preferred Stylist</h3>

                  <div className="grid-2">
                    {STYLISTS_DATA.map((stylist) => {
                      const isSelected = selectedStylist.id === stylist.id;
                      return (
                        <div
                          key={stylist.id}
                          className="service-card"
                          style={{ cursor: 'pointer', border: isSelected ? '2px solid #c59b27' : '1px solid #e7e5e4' }}
                          onClick={() => setSelectedStylist(stylist)}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.98rem' }}>{stylist.name}</div>
                            <div style={{ fontSize: '0.8rem', color: '#78716c' }}>{stylist.title}</div>
                          </div>
                          <button className={`select-btn ${isSelected ? 'selected' : ''}`}>
                            {isSelected ? 'Selected' : 'Select'}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="action-row">
                    <button className="btn-secondary" onClick={() => setStep(1)}>
                      ← Back
                    </button>
                    <button className="btn-primary" onClick={() => setStep(3)}>
                      Continue to Schedule →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: Date & Start/End Time Slots */}
              {step === 3 && (
                <div>
                  <h3 className="font-serif" style={{ marginBottom: '16px', fontSize: '1.25rem' }}>Select Schedule Window</h3>

                  <div className="card-box">
                    <div className="form-field">
                      <label className="form-label">Appointment Date</label>
                      <input
                        type="date"
                        className="form-input"
                        min={new Date().toISOString().split('T')[0]}
                        value={selectedDate}
                        onChange={(e) => {
                          setSelectedDate(e.target.value);
                          const sched = generateStartAndEndSlots(e.target.value, totalDuration);
                          if (sched.slots.length > 0) setSelectedSlotObj(sched.slots[0]);
                        }}
                      />
                    </div>

                    {scheduleInfo.closed ? (
                      <div className="status-alert alert-warning">
                        <strong>Salon Closed:</strong> Le Salon NYC is closed on Sundays. Please select a date between Monday and Saturday.
                      </div>
                    ) : (
                      <div>
                        <label className="form-label" style={{ marginTop: '14px' }}>
                          Available Windows for {totalDuration} Mins Combined Duration ({selectedDate.includes('-') && new Date(selectedDate.split('-')[0], selectedDate.split('-')[1]-1, selectedDate.split('-')[2]).getDay() === 6 ? 'Saturday: 10 AM – 6 PM' : 'Mon – Fri: 10 AM – 8 PM'})
                        </label>

                        <div className="grid-slots-wide">
                          {scheduleInfo.slots.map((slot) => {
                            const isBooked = mockBookings.some(
                              b => b.date === selectedDate && b.startTime === slot.start && b.status === 'Confirmed'
                            );
                            const isSelected = selectedSlotObj && selectedSlotObj.start === slot.start;

                            return (
                              <button
                                key={slot.start}
                                type="button"
                                disabled={isBooked}
                                className={`slot-btn-wide ${isSelected ? 'selected' : ''}`}
                                onClick={() => setSelectedSlotObj(slot)}
                              >
                                <span>{slot.label}</span>
                                <span className="slot-duration-text">
                                  {isBooked ? 'Already Reserved' : `Full ${totalDuration} min appointment`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="action-row">
                    <button className="btn-secondary" onClick={() => setStep(2)}>
                      ← Back
                    </button>
                    <button
                      className="btn-primary"
                      disabled={scheduleInfo.closed || !selectedSlotObj}
                      onClick={() => setStep(4)}
                    >
                      Continue to Guest Details →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: Review & Policies */}
              {step === 4 && (
                <form onSubmit={handleBookingConfirm}>
                  <h3 className="font-serif" style={{ marginBottom: '16px', fontSize: '1.25rem' }}>Review & Complete Reservation</h3>

                  <div className="card-box">
                    <div className="card-box-header">Reservation Summary</div>
                    <p style={{ fontSize: '0.9rem', marginBottom: '6px' }}>
                      <strong>Services:</strong> {selectedServices.map(s => s.name).join(', ')}
                    </p>
                    <p style={{ fontSize: '0.9rem', marginBottom: '6px' }}>
                      <strong>Combined Duration & Cost:</strong> {totalDuration} Mins (${totalPrice} {hasConsultationService ? '+ Consultation' : ''})
                    </p>
                    <p style={{ fontSize: '0.9rem', marginBottom: '6px' }}>
                      <strong>Stylist:</strong> {selectedStylist.name}
                    </p>
                    <p style={{ fontSize: '0.9rem' }}>
                      <strong>Time Window:</strong> {selectedDate} ({selectedSlotObj?.label})
                    </p>
                  </div>

                  <div className="card-box">
                    <div className="card-box-header">Guest Contact Details</div>
                    <div className="form-field">
                      <label className="form-label">Full Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Jane Doe"
                        value={guest.fullName}
                        onChange={(e) => setGuest({ ...guest, fullName: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Email Address *</label>
                      <input
                        type="email"
                        className="form-input"
                        placeholder="jane@example.com"
                        value={guest.email}
                        onChange={(e) => setGuest({ ...guest, email: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Phone Number *</label>
                      <input
                        type="tel"
                        className="form-input"
                        placeholder="(212) 555-0199"
                        value={guest.phone}
                        onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Special Requests / Hair Notes</label>
                      <textarea
                        className="form-textarea"
                        placeholder="Mention any hair goals, allergies, or special requests..."
                        value={guest.notes}
                        onChange={(e) => setGuest({ ...guest, notes: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="card-box">
                    <div className="card-box-header">Le Salon NYC Terms & Policies</div>
                    
                    <div className="policy-list">
                      <div className="policy-item">
                        <span>•</span>
                        <span><strong>24-Hour Notice:</strong> Free cancellations or appointment adjustments can be completed up to 24 hours prior using your reference code.</span>
                      </div>
                      <div className="policy-item">
                        <span>•</span>
                        <span><strong>Punctuality Policy:</strong> Please arrive 5–10 minutes before your scheduled start time. Arrivals after 15 minutes may require rescheduling.</span>
                      </div>
                      <div className="policy-item">
                        <span>•</span>
                        <span><strong>Special Consultations:</strong> Final pricing for consultations (Makeup & Keratin Treatments) will be confirmed in salon prior to service.</span>
                      </div>
                      <div className="policy-item">
                        <span>•</span>
                        <span><strong>Exclusively Organic:</strong> We exclusively use certified organic, non-toxic hair products.</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px' }}>
                      <input
                        type="checkbox"
                        id="policyCheck"
                        style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                        checked={policyAccepted}
                        onChange={(e) => setPolicyAccepted(e.target.checked)}
                      />
                      <label htmlFor="policyCheck" style={{ fontSize: '0.85rem', cursor: 'pointer', color: '#1c1917' }}>
                        I agree to the <strong>Le Salon NYC Reservation Policies</strong>.
                      </label>
                    </div>
                  </div>

                  {validationError && (
                    <div className="status-alert alert-warning" style={{ color: '#b91c1c', background: '#fef2f2', borderColor: '#fecaca' }}>
                      {validationError}
                    </div>
                  )}

                  <div className="action-row">
                    <button type="button" className="btn-secondary" onClick={() => setStep(3)}>
                      ← Back
                    </button>
                    <button type="submit" className="btn-primary">
                      Confirm Reservation — ${totalPrice}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )
        ) : (
          /* MANAGE / CANCEL TAB */
          <div className="card-box">
            <h3 className="font-serif" style={{ marginBottom: '8px', fontSize: '1.3rem' }}>Manage / Cancel Reservation</h3>
            <p style={{ fontSize: '0.85rem', color: '#78716c', marginBottom: '20px' }}>
              Enter your Reference Code and Email to release your reservation slot in real-time.
            </p>

            {cancelFeedback && (
              <div className={`status-alert ${cancelFeedback.success ? 'alert-success' : 'alert-warning'}`}>
                {cancelFeedback.message}
              </div>
            )}

            <form onSubmit={handleCancelSearch}>
              <div className="form-field">
                <label className="form-label">Reference Code</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. X7K9A2"
                  value={cancelCodeInput}
                  onChange={(e) => setCancelCodeInput(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label className="form-label">Registered Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="jane@example.com"
                  value={cancelEmailInput}
                  onChange={(e) => setCancelEmailInput(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-danger" style={{ marginTop: '12px' }}>
                Cancel Reservation & Release Slot Immediately
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}