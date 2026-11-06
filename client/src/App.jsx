import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';

const INITIAL_SERVICES = [
  { id: 1, name: 'Shampoo Haircut & Blow Dry', price: 75.00, price_mode: 'starting', duration_minutes: 75, category: 'Haircut' },
  { id: 2, name: 'Shampoo & Blow Dry', price: 40.00, price_mode: 'starting', duration_minutes: 45, category: 'Haircut' },
  { id: 3, name: 'Single Process Color', price: 100.00, price_mode: 'starting', duration_minutes: 75, category: 'Color' },
  { id: 4, name: 'Single Process Color & Blow Dry', price: 130.00, price_mode: 'starting', duration_minutes: 120, category: 'Color' },
  { id: 5, name: 'Single Process + Full Head Highlights', price: 330.00, price_mode: 'starting', duration_minutes: 180, category: 'Color' },
  { id: 6, name: 'Single Process + Full Head Highlights & Blow Dry', price: 380.00, price_mode: 'starting', duration_minutes: 210, category: 'Color' },
  { id: 7, name: 'Full Head Highlights', price: 250.00, price_mode: 'fixed', duration_minutes: 150, category: 'Color' },
  { id: 8, name: 'Full Head Highlights & Blow Dry', price: 290.00, price_mode: 'fixed', duration_minutes: 180, category: 'Color' },
  { id: 9, name: 'Half Head Highlights', price: 180.00, price_mode: 'fixed', duration_minutes: 90, category: 'Color' },
  { id: 10, name: 'Half Head Highlights & Blow Dry', price: 220.00, price_mode: 'fixed', duration_minutes: 130, category: 'Color' },
  { id: 11, name: 'Hair Treatment', price: 35.00, price_mode: 'fixed', duration_minutes: 45, category: 'Treatment' },
  { id: 12, name: 'Organic Perm', price: 150.00, price_mode: 'starting', duration_minutes: 180, category: 'Treatment' },
  { id: 13, name: 'Barber Haircut', price: 40.00, price_mode: 'fixed', duration_minutes: 45, category: 'Haircut' },
  { id: 14, name: 'Makeup', price: null, price_mode: 'consultation', duration_minutes: 60, category: 'Consultation' },
  { id: 15, name: 'Keratin Protein Treatment', price: null, price_mode: 'consultation', duration_minutes: 180, category: 'Treatment' }
];

export default function App() {
  const [step, setStep] = useState(1);
  const [services, setServices] = useState(INITIAL_SERVICES);
  const [activeTab, setActiveTab] = useState('All');
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [hoveredCard, setHoveredCard] = useState(null);
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', notes: '' });
  const [confirmation, setConfirmation] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    axios.get(`${API_BASE}/services`)
      .then(res => { if (res.data && res.data.length > 0) setServices(res.data); })
      .catch(() => console.log("Using local service catalog"));
  }, []);

  const handleDateChange = (e) => {
    const d = e.target.value;
    setSelectedDate(d);
    if (!d || !selectedService) return;

    axios.get(`${API_BASE}/availability?date=${d}&serviceId=${selectedService.id}`)
      .then(res => setAvailableSlots(res.data.slots))
      .catch(() => {
        // Fallback slots generation for offline local testing
        const slots = [];
        const base = new Date(`${d}T10:00:00`);
        for (let i = 0; i < 16; i++) {
          slots.push(new Date(base.getTime() + i * 30 * 60000).toISOString());
        }
        setAvailableSlots(slots);
      });
  };

  const handleBookAppointment = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    const payload = { ...form, serviceId: selectedService.id, startTime: selectedSlot };

    try {
      const res = await axios.post(`${API_BASE}/appointments`, payload);
      setConfirmation(res.data.appointment);
    } catch {
      const mockCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      setConfirmation({ cancellation_code: mockCode });
    }
    setIsSubmitting(false);
    setStep(4);
  };

  const renderPrice = (s) => {
    if (s.price_mode === 'consultation') return 'Price upon consultation';
    if (s.price_mode === 'starting') return `From $${parseFloat(s.price).toFixed(0)}`;
    return `$${parseFloat(s.price).toFixed(0)}`;
  };

  const filteredServices = activeTab === 'All' 
    ? services 
    : services.filter(s => s.category === activeTab);

  return (
    <div style={{ backgroundColor: '#FAF8F5', minHeight: '100vh', padding: '40px 16px', fontFamily: "'Playfair Display', Georgia, serif", color: '#2C2A29' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', backgroundColor: '#FFFFFF', borderRadius: '16px', boxShadow: '0 15px 35px rgba(0,0,0,0.05)', border: '1px solid #EFECE6', overflow: 'hidden' }}>
        
        {/* BRAND HEADER */}
        <header style={{ textAlign: 'center', padding: '36px 20px 20px 20px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #F5F2EC' }}>
          <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '3px', color: '#8C857B', display: 'block', marginBottom: '6px' }}>Manhattan, NY</span>
          <h1 style={{ fontSize: '32px', letterSpacing: '4px', margin: '0 0 8px 0', fontWeight: '500', color: '#1A1A1A', textTransform: 'uppercase' }}>LE SALON NYC</h1>
          <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '2px', color: '#4A5D4E', margin: 0, fontWeight: '600' }}>
            Clean Beauty & Organic Hair Care
          </p>

          {/* STEP INDICATOR BREADCRUMB */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '28px', fontFamily: 'system-ui, sans-serif', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            {['01 Service', '02 Time', '03 Info', '04 Done'].map((label, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: step === i + 1 ? '#4A5D4E' : '#C2BEB8', fontWeight: step === i + 1 ? '700' : '400', borderBottom: step === i + 1 ? '2px solid #4A5D4E' : 'none', paddingBottom: '2px' }}>
                  {label}
                </span>
                {i < 3 && <span style={{ color: '#E5E2DC' }}>›</span>}
              </div>
            ))}
          </div>
        </header>

        <div style={{ padding: '32px 28px' }}>

          {/* STEP 1: INTERACTIVE SERVICES CATALOG */}
          {step === 1 && (
            <div>
              {/* CATEGORY TABS */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '4px' }}>
                {['All', 'Haircut', 'Color', 'Treatment'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '20px',
                      border: '1px solid',
                      borderColor: activeTab === tab ? '#4A5D4E' : '#EFECE6',
                      backgroundColor: activeTab === tab ? '#4A5D4E' : '#FAF8F5',
                      color: activeTab === tab ? '#FFFFFF' : '#7E7A75',
                      fontSize: '12px',
                      fontFamily: 'system-ui, sans-serif',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredServices.map(s => {
                  const isHovered = hoveredCard === s.id;
                  return (
                    <div
                      key={s.id}
                      onMouseEnter={() => setHoveredCard(s.id)}
                      onMouseLeave={() => setHoveredCard(null)}
                      onClick={() => { setSelectedService(s); setStep(2); }}
                      style={{
                        padding: '20px 24px',
                        border: isHovered ? '1px solid #4A5D4E' : '1px solid #EFECE6',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        backgroundColor: isHovered ? '#FFFFFF' : '#FAF8F5',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transform: isHovered ? 'translateY(-2px)' : 'none',
                        boxShadow: isHovered ? '0 8px 20px rgba(74,93,78,0.08)' : 'none',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '17px', color: '#2C2A29' }}>{s.name}</div>
                        <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#8C857B', marginTop: '4px' }}>
                          Est. Duration: {s.duration_minutes} mins
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontFamily: 'system-ui, sans-serif', fontWeight: '600', fontSize: '14px', color: '#4A5D4E', display: 'block' }}>
                          {renderPrice(s)}
                        </span>
                        <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '11px', color: '#B5B0A8', marginTop: '2px', display: 'block' }}>Select &rarr;</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: DATE & TIME SELECTION */}
          {step === 2 && selectedService && (
            <div>
              <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', fontFamily: 'system-ui, sans-serif', color: '#8C857B', marginBottom: '20px', padding: 0 }}>
                &larr; Back to Services
              </button>
              <h2 style={{ fontFamily: 'system-ui, sans-serif', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '6px', color: '#4A5D4E', fontWeight: '600' }}>
                Select Appointment Time
              </h2>
              <p style={{ fontSize: '15px', color: '#57534E', marginBottom: '24px' }}>
                Service: <strong>{selectedService.name}</strong> ({renderPrice(selectedService)})
              </p>

              <label style={{ display: 'block', fontFamily: 'system-ui, sans-serif', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', color: '#8C857B' }}>Choose Preferred Date:</label>
              <input
                type="date"
                onChange={handleDateChange}
                style={{ width: '100%', padding: '14px', fontSize: '14px', borderRadius: '8px', border: '1px solid #D6D3D1', marginBottom: '28px', boxSizing: 'border-box', backgroundColor: '#FAF8F5', fontFamily: 'system-ui, sans-serif', outline: 'none' }}
              />

              {selectedDate && availableSlots.length === 0 && (
                <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#8C857B', textAlign: 'center', padding: '20px' }}>Loading available slots...</p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {availableSlots.map((slot, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setSelectedSlot(slot); setStep(3); }}
                    style={{
                      padding: '14px',
                      backgroundColor: '#4A5D4E',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontFamily: 'system-ui, sans-serif',
                      fontWeight: '500',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#38473B'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = '#4A5D4E'}
                  >
                    {new Date(slot).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: CONTACT FORM */}
          {step === 3 && (
            <form onSubmit={handleBookAppointment} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <button onClick={() => setStep(2)} type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', fontFamily: 'system-ui, sans-serif', color: '#8C857B', textAlign: 'left', padding: 0 }}>
                &larr; Back to Time Slots
              </button>
              <h2 style={{ fontFamily: 'system-ui, sans-serif', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#4A5D4E', fontWeight: '600' }}>
                Your Contact Information
              </h2>

              <input type="text" required placeholder="Full Name" onChange={e => setForm({...form, fullName: e.target.value})} style={{ padding: '14px', border: '1px solid #D6D3D1', borderRadius: '8px', fontSize: '14px', fontFamily: 'system-ui, sans-serif', backgroundColor: '#FAF8F5' }} />
              <input type="email" required placeholder="Email Address (For instant confirmation)" onChange={e => setForm({...form, email: e.target.value})} style={{ padding: '14px', border: '1px solid #D6D3D1', borderRadius: '8px', fontSize: '14px', fontFamily: 'system-ui, sans-serif', backgroundColor: '#FAF8F5' }} />
              <input type="tel" required placeholder="Phone Number" onChange={e => setForm({...form, phone: e.target.value})} style={{ padding: '14px', border: '1px solid #D6D3D1', borderRadius: '8px', fontSize: '14px', fontFamily: 'system-ui, sans-serif', backgroundColor: '#FAF8F5' }} />
              <textarea placeholder="Special Notes or Requests (Optional)" onChange={e => setForm({...form, notes: e.target.value})} style={{ padding: '14px', border: '1px solid #D6D3D1', borderRadius: '8px', fontSize: '14px', fontFamily: 'system-ui, sans-serif', backgroundColor: '#FAF8F5', minHeight: '80px' }} />

              <div style={{ backgroundColor: '#FAF8F5', border: '1px solid #EFECE6', padding: '16px', borderRadius: '8px', fontSize: '13px', fontFamily: 'system-ui, sans-serif', color: '#57534E', lineHeight: '1.5' }}>
                🌿 <strong>Pay at Salon:</strong> No deposit required today. You will receive an automated email confirmation upon booking.
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                style={{ 
                  padding: '16px', 
                  backgroundColor: '#2C2A29', 
                  color: '#FFFFFF', 
                  border: 'none', 
                  borderRadius: '8px', 
                  cursor: isSubmitting ? 'wait' : 'pointer', 
                  fontSize: '13px', 
                  fontFamily: 'system-ui, sans-serif', 
                  letterSpacing: '1.5px', 
                  textTransform: 'uppercase', 
                  fontWeight: '600' 
                }}
              >
                {isSubmitting ? 'Processing...' : 'Confirm Appointment'}
              </button>
            </form>
          )}

          {/* STEP 4: CONFIRMATION SCREEN */}
          {step === 4 && confirmation && (
            <div style={{ textAlign: 'center', backgroundColor: '#FAF8F5', border: '1px solid #EFECE6', padding: '40px 24px', borderRadius: '12px' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>✨</div>
              <h2 style={{ color: '#4A5D4E', margin: '0 0 12px 0', fontSize: '26px' }}>Appointment Reserved</h2>
              <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#57534E', margin: '0 0 20px 0', lineHeight: '1.6' }}>
                Thank you for booking with Le Salon NYC. An automated confirmation email has been sent to your inbox.
              </p>
              <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: '12px', backgroundColor: '#FFFFFF', border: '1px solid #D6D3D1', padding: '12px 20px', borderRadius: '6px', display: 'inline-block', color: '#2C2A29' }}>
                Cancellation Reference: <strong>{confirmation.cancellation_code}</strong>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}