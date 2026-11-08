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

// Helper: Check Salon Operating Hours & Generate Slots
function getDaySchedule(dateString) {
  if (!dateString) return { closed: false, maxHour: 20, slots: [] };
  
  // Date parsing safety
  const parts = dateString.split('-');
  const selectedDate = new Date(parts[0], parts[1] - 1, parts[2]);
  const dayOfWeek = selectedDate.getDay(); // 0 = Sun, 6 = Sat

  if (dayOfWeek === 0) {
    return { closed: true, reason: 'Sunday Closed', slots: [] };
  }

  const startHour = 10;
  const endHour = dayOfWeek === 6 ? 18 : 20; // Sat = 6 PM (18), Mon-Fri = 8 PM (20)

  const slots = [];
  let currentMinutes = startHour * 60;
  const closingMinutes = endHour * 60;

  while (currentMinutes + 45 <= closingMinutes) {
    const h = Math.floor(currentMinutes / 60);
    const m = currentMinutes % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    const timeStr = `${h12}:${m === 0 ? '00' : m} ${ampm}`;
    slots.push(timeStr);
    currentMinutes += 30;
  }

  return { closed: false, maxHour: endHour, slots };
}

export default function App() {
  const [activeTab, setActiveTab] = useState('book'); // 'book' | 'manage'
  const [step, setStep] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState('All');
  
  // Selection States
  const [selectedService, setSelectedService] = useState(SERVICES_DATA[0]);
  const [selectedStylist, setSelectedStylist] = useState(STYLISTS_DATA[0]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  const dayInfo = getDaySchedule(selectedDate);
  const [selectedTime, setSelectedTime] = useState(dayInfo.slots[0] || '10:00 AM');
  
  // Form State
  const [guest, setGuest] = useState({ fullName: '', email: '', phone: '', notes: '' });
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [validationError, setValidationError] = useState('');
  
  // Completed Bookings Mock Storage
  const [mockBookings, setMockBookings] = useState([]);
  const [activeConfirmation, setActiveConfirmation] = useState(null);

  // Manage Tab Search Form State
  const [cancelCodeInput, setCancelCodeInput] = useState('');
  const [cancelEmailInput, setCancelEmailInput] = useState('');
  const [cancelFeedback, setCancelFeedback] = useState(null);

  // Categories list
  const categories = ['All', 'Haircuts & Styling', 'Color Services', 'Highlights', 'Treatments & Perms', 'Specialized Consultations'];

  const filteredServices = categoryFilter === 'All' 
    ? SERVICES_DATA 
    : SERVICES_DATA.filter(s => s.category === categoryFilter);

  const handleBookingConfirm = (e) => {
    e.preventDefault();
    if (!policyAccepted) {
      setValidationError('Please review and check the Le Salon NYC Policies agreement to proceed.');
      return;
    }

    setValidationError('');
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const newBooking = {
      code,
      guestName: guest.fullName,
      guestEmail: guest.email,
      guestPhone: guest.phone,
      serviceName: selectedService.name,
      priceDisplay: selectedService.price ? `$${selectedService.price} ${selectedService.priceSuffix}` : 'Upon Consultation',
      stylistName: selectedStylist.name,
      date: selectedDate,
      time: selectedTime,
      notes: guest.notes,
      status: 'Confirmed'
    };

    setMockBookings([newBooking, ...mockBookings]);
    setActiveConfirmation(newBooking);
  };

  const handleCancelSearch = (e) => {
    e.preventDefault();
    setCancelFeedback(null);

    const foundIdx = mockBookings.findIndex(
      b => b.code === cancelCodeInput.trim().toUpperCase() && 
           b.guestEmail.toLowerCase() === cancelEmailInput.trim().toLowerCase() &&
           b.status === 'Confirmed'
    );

    if (foundIdx !== -1) {
      const updated = [...mockBookings];
      updated[foundIdx].status = 'Canceled';
      setMockBookings(updated);
      setCancelFeedback({ success: true, message: `Reservation ${cancelCodeInput.toUpperCase()} has been successfully canceled and the time slot released.` });
    } else {
      setCancelFeedback({ success: false, message: 'No active reservation found matching those details. Please check your reference code and email.' });
    }
  };

  return (
    <div>
      {/* Navigation Header */}
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

      {/* Main Container */}
      <main className="main-wrapper">
        {activeTab === 'book' ? (
          activeConfirmation ? (
            /* Confirmation Screen */
            <div className="card-box" style={{ textAlign: 'center', padding: '36px 20px' }}>
              <div style={{ fontSize: '3rem', color: '#059669', marginBottom: '12px' }}>✓</div>
              <h2 className="font-serif" style={{ fontSize: '1.6rem', marginBottom: '8px' }}>Reservation Request Received</h2>
              <p style={{ color: '#666', fontSize: '0.88rem', marginBottom: '24px' }}>
                A confirmation summary has been logged for <strong>{activeConfirmation.guestEmail}</strong>.
              </p>

              <div style={{ background: '#faf9f5', border: '1px solid #e7e5e4', borderRadius: '12px', padding: '20px', textAlign: 'left', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #efece6' }}>
                  <span style={{ color: '#78716c', fontSize: '0.85rem' }}>Reference Code:</span>
                  <strong style={{ fontFamily: 'monospace', fontSize: '1.15rem', color: '#c59b27' }}>{activeConfirmation.code}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #efece6' }}>
                  <span style={{ color: '#78716c', fontSize: '0.85rem' }}>Service:</span>
                  <strong style={{ fontSize: '0.88rem' }}>{activeConfirmation.serviceName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #efece6' }}>
                  <span style={{ color: '#78716c', fontSize: '0.85rem' }}>Price:</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{activeConfirmation.priceDisplay}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #efece6' }}>
                  <span style={{ color: '#78716c', fontSize: '0.85rem' }}>Stylist:</span>
                  <span style={{ fontSize: '0.88rem' }}>{activeConfirmation.stylistName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ color: '#78716c', fontSize: '0.85rem' }}>Date & Time:</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{activeConfirmation.date} at {activeConfirmation.time}</span>
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
                  <span>Service</span>
                </div>
                <div className={`step-item ${step === 2 ? 'active' : step > 2 ? 'completed' : ''}`} onClick={() => setStep(2)}>
                  <div className="step-badge">{step > 2 ? '✓' : '2'}</div>
                  <span>Stylist</span>
                </div>
                <div className={`step-item ${step === 3 ? 'active' : step > 3 ? 'completed' : ''}`} onClick={() => setStep(3)}>
                  <div className="step-badge">{step > 3 ? '✓' : '3'}</div>
                  <span>Date & Time</span>
                </div>
                <div className={`step-item ${step === 4 ? 'active' : ''}`} onClick={() => setStep(4)}>
                  <div className="step-badge">4</div>
                  <span>Confirm</span>
                </div>
              </div>

              {/* STEP 1: Select Service */}
              {step === 1 && (
                <div>
                  {/* Category Filter Pills */}
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

                  {/* Services List */}
                  {filteredServices.map((service) => {
                    const isSelected = selectedService.id === service.id;
                    return (
                      <div key={service.id} className="service-card">
                        <div className="service-details">
                          <span className="service-title">{service.name}</span>
                          <span className="service-sub">⏱ approx. {service.duration} Mins • {service.category}</span>
                        </div>
                        <div className="service-action">
                          <span className="service-price">
                            {service.price ? `$${service.price}` : ''} {service.priceSuffix}
                          </span>
                          <button
                            className={`select-btn ${isSelected ? 'selected' : ''}`}
                            onClick={() => setSelectedService(service)}
                          >
                            {isSelected ? '✓ Selected' : 'Select'}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <div className="action-row">
                    <button className="btn-primary" onClick={() => setStep(2)}>
                      Continue to Stylist Selection →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Select Stylist */}
              {step === 2 && (
                <div>
                  <h3 className="font-serif" style={{ marginBottom: '16px', fontSize: '1.2rem' }}>Select Preferred Stylist</h3>

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
                            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{stylist.name}</div>
                            <div style={{ fontSize: '0.78rem', color: '#78716c' }}>{stylist.title}</div>
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

              {/* STEP 3: Select Date & Dynamic Hours Time Slots */}
              {step === 3 && (
                <div>
                  <h3 className="font-serif" style={{ marginBottom: '16px', fontSize: '1.2rem' }}>Select Date & Time</h3>

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
                          const sched = getDaySchedule(e.target.value);
                          if (sched.slots.length > 0) setSelectedTime(sched.slots[0]);
                        }}
                      />
                    </div>

                    {dayInfo.closed ? (
                      <div className="status-alert alert-warning">
                        <strong>Salon Closed:</strong> Le Salon NYC is closed on Sundays. Please select a date from Monday through Saturday.
                      </div>
                    ) : (
                      <div>
                        <label className="form-label" style={{ marginTop: '12px' }}>
                          Available Hours ({selectedDate.includes('-') && new Date(selectedDate.split('-')[0], selectedDate.split('-')[1]-1, selectedDate.split('-')[2]).getDay() === 6 ? 'Saturday: 10 AM – 6 PM' : 'Mon – Fri: 10 AM – 8 PM'})
                        </label>
                        <div className="grid-slots">
                          {dayInfo.slots.map((timeStr) => {
                            const isSelected = selectedTime === timeStr;
                            return (
                              <button
                                key={timeStr}
                                type="button"
                                className={`slot-btn ${isSelected ? 'selected' : ''}`}
                                onClick={() => setSelectedTime(timeStr)}
                              >
                                {timeStr}
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
                      disabled={dayInfo.closed}
                      onClick={() => setStep(4)}
                    >
                      Continue to Guest Details →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: Confirm Details & Salon Policies */}
              {step === 4 && (
                <form onSubmit={handleBookingConfirm}>
                  <h3 className="font-serif" style={{ marginBottom: '16px', fontSize: '1.2rem' }}>Review & Confirm Reservation</h3>

                  <div className="card-box">
                    <div className="card-box-header">Selected Reservation Summary</div>
                    <p style={{ fontSize: '0.88rem', marginBottom: '4px' }}>
                      <strong>Service:</strong> {selectedService.name} ({selectedService.price ? `$${selectedService.price} ${selectedService.priceSuffix}` : 'Upon Consultation'})
                    </p>
                    <p style={{ fontSize: '0.88rem', marginBottom: '4px' }}>
                      <strong>Stylist:</strong> {selectedStylist.name}
                    </p>
                    <p style={{ fontSize: '0.88rem' }}>
                      <strong>Schedule:</strong> {selectedDate} at {selectedTime}
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
                        placeholder="Mention any allergies, previous treatments, or preferences..."
                        value={guest.notes}
                        onChange={(e) => setGuest({ ...guest, notes: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Comprehensive Salon Policies */}
                  <div className="card-box">
                    <div className="card-box-header">Le Salon NYC Policies</div>
                    
                    <div className="policy-list">
                      <div className="policy-item">
                        <span>•</span>
                        <span><strong>24-Hour Notice:</strong> Cancellations or rescheduling must be requested at least 24 hours prior to your scheduled time slot.</span>
                      </div>
                      <div className="policy-item">
                        <span>•</span>
                        <span><strong>Punctuality:</strong> Please arrive 5–10 minutes prior to your appointment. Late arrivals exceeding 15 minutes may require service adjustments or rescheduling.</span>
                      </div>
                      <div className="policy-item">
                        <span>•</span>
                        <span><strong>Consultation Services:</strong> For Makeup & Keratin Protein Treatments, our concierge team will reach out directly to confirm duration & final estimate.</span>
                      </div>
                      <div className="policy-item">
                        <span>•</span>
                        <span><strong>Organic Products:</strong> We exclusively use non-toxic, eco-certified organic hair formulas.</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px' }}>
                      <input
                        type="checkbox"
                        id="policyCheck"
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        checked={policyAccepted}
                        onChange={(e) => setPolicyAccepted(e.target.checked)}
                      />
                      <label htmlFor="policyCheck" style={{ fontSize: '0.82rem', cursor: 'pointer', color: '#1c1917' }}>
                        I have read and agree to the <strong>Le Salon NYC Reservation & Cancellation Terms</strong>.
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
                      Confirm Reservation
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
              Lookup your existing booking using your 6-character reference code and registered email.
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
                Cancel Reservation & Release Time Slot
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}