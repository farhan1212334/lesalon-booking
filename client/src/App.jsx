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
      if (!response.ok) {
        throw new Error(`Server status: ${response.status}`);
      }
      const data = await response.json();
      setServices(data);
    } catch (err) {
      console.error('Error fetching services:', err);
      setErrorMessage(
        'Connecting to live backend server. Render free tier takes ~30 seconds on cold start—please click Retry.'
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
      setErrorMessage('Network error while connecting to the booking engine. Please retry.');
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
    if (service.price_mode === 'consultation' || !service.price) {
      return 'Consultation Required';
    }
    const priceStr = `$${parseFloat(service.price).toFixed(2)}`;
    return service.price_mode === 'starting' ? `Starting at ${priceStr}` : priceStr;
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans flex flex-col justify-between selection:bg-amber-500 selection:text-neutral-950">
      
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur sticky top-0 z-50 py-6 px-4">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <div>
            <h1 className="text-3xl font-serif tracking-wider text-amber-400">LE SALON NYC</h1>
            <p className="text-xs uppercase tracking-widest text-neutral-400 mt-1">
              310 East 44th St, Manhattan • (212) 555-0199
            </p>
          </div>
          <div className="text-xs text-neutral-500 border border-neutral-800 px-3 py-1.5 rounded-full uppercase tracking-widest">
            Online Reservation System
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto w-full px-4 py-8 flex-grow">
        
        <div className="flex items-center justify-center mb-8 gap-4 text-xs font-semibold uppercase tracking-wider">
          <div className={`flex items-center gap-2 ${step >= 1 ? 'text-amber-400' : 'text-neutral-600'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step >= 1 ? 'bg-amber-400 text-neutral-950 font-bold' : 'bg-neutral-800 text-neutral-400'}`}>1</span>
            Select Service & Time
          </div>
          <div className="w-8 h-[1px] bg-neutral-800"></div>
          <div className={`flex items-center gap-2 ${step >= 2 ? 'text-amber-400' : 'text-neutral-600'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step >= 2 ? 'bg-amber-400 text-neutral-950 font-bold' : 'bg-neutral-800 text-neutral-400'}`}>2</span>
            Your Details
          </div>
          <div className="w-8 h-[1px] bg-neutral-800"></div>
          <div className={`flex items-center gap-2 ${step === 3 ? 'text-amber-400' : 'text-neutral-600'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step === 3 ? 'bg-amber-400 text-neutral-950 font-bold' : 'bg-neutral-800 text-neutral-400'}`}>3</span>
            Confirmation
          </div>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 bg-red-950/80 border border-red-800 rounded-xl text-red-200 text-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <span>{errorMessage}</span>
            <button
              onClick={fetchServices}
              className="bg-red-800 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg text-xs tracking-wider uppercase font-semibold whitespace-nowrap"
            >
              Retry Connection
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-center gap-2 pb-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-lg text-xs font-medium uppercase tracking-wider transition ${
                    selectedCategory === cat
                      ? 'bg-amber-400 text-neutral-950 font-bold shadow-md'
                      : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {loadingServices ? (
              <div className="py-16 text-center space-y-3 bg-neutral-900/50 border border-neutral-800 rounded-2xl">
                <div className="inline-block w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm text-neutral-400">Loading service catalog from cloud database...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredServices.map((service) => {
                  const isSelected = selectedService?.id === service.id;
                  return (
                    <div
                      key={service.id}
                      onClick={() => setSelectedService(service)}
                      className={`cursor-pointer p-5 rounded-2xl border transition duration-200 flex flex-col justify-between ${
                        isSelected
                          ? 'bg-neutral-900 border-amber-400 ring-1 ring-amber-400 shadow-xl'
                          : 'bg-neutral-900/60 border-neutral-800/80 hover:border-neutral-700 hover:bg-neutral-900'
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <h3 className="font-serif text-lg text-neutral-100">{service.name}</h3>
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-800 text-amber-400 whitespace-nowrap">
                            {formatPrice(service)}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-500 mt-2 flex items-center gap-1">
                          ⏱ {service.duration_minutes} Minutes • {service.category || 'General'}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-neutral-800/60 flex items-center justify-between text-xs">
                        <span className="text-neutral-400">{isSelected ? 'Selected' : 'Click to select'}</span>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'border-amber-400 bg-amber-400 text-neutral-950 font-bold' : 'border-neutral-700'}`}>
                          {isSelected && '✓'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedService && (
              <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-400">
                  Choose Appointment Date & Time
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-neutral-400 mb-2">Date</label>
                    <input
                      type="date"
                      required
                      min={new Date().toISOString().split('T')[0]}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm text-neutral-100 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-neutral-400 mb-2">Time Slot</label>
                    <input
                      type="time"
                      required
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm text-neutral-100 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    disabled={!date || !time}
                    onClick={() => setStep(2)}
                    className="w-full sm:w-auto px-8 py-3 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-neutral-950 font-semibold rounded-xl text-sm transition tracking-wide"
                  >
                    Continue to Client Details →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && selectedService && (
          <div className="max-w-2xl mx-auto bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8 space-y-6">
            <div className="border-b border-neutral-800 pb-4">
              <h2 className="text-xl font-serif text-amber-400">Client Information</h2>
              <p className="text-xs text-neutral-400 mt-1">
                Booking: <strong className="text-neutral-200">{selectedService.name}</strong> on <strong className="text-neutral-200">{date}</strong> at <strong className="text-neutral-200">{time}</strong>
              </p>
            </div>

            <form onSubmit={handleSubmitBooking} className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-400 mb-1.5">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Jane Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm text-neutral-100 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-neutral-400 mb-1.5">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="jane@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm text-neutral-100 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-neutral-400 mb-1.5">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="(212) 555-0199"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm text-neutral-100 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-400 mb-1.5">Special Notes / Requests (Optional)</label>
                <textarea
                  rows="3"
                  placeholder="Mention hair conditions, preferences, or special requests..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm text-neutral-100 focus:outline-none focus:border-amber-400"
                ></textarea>
              </div>

              <div className="pt-4 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-5 py-3 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 rounded-xl text-xs font-semibold uppercase tracking-wider"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-8 py-3 bg-amber-400 hover:bg-amber-300 text-neutral-950 font-semibold rounded-xl text-sm transition tracking-wide disabled:opacity-50"
                >
                  {submitting ? 'Confirming Reservation...' : 'Complete Reservation'}
                </button>
              </div>
            </form>
          </div>
        )}

        {step === 3 && bookingResult && (
          <div className="max-w-2xl mx-auto bg-neutral-900 border border-emerald-900/60 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
            <div className="w-16 h-16 bg-emerald-950 border border-emerald-500 text-emerald-400 rounded-full flex items-center justify-center text-2xl mx-auto">
              ✓
            </div>

            <div>
              <h2 className="text-2xl font-serif text-emerald-400">Appointment Confirmed!</h2>
              <p className="text-xs text-neutral-400 mt-1">
                A confirmation email has been dispatched to <strong className="text-neutral-200">{email}</strong>.
              </p>
            </div>

            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5 text-left text-xs space-y-2">
              <div className="flex justify-between border-b border-neutral-800/80 pb-2">
                <span className="text-neutral-400">Service:</span>
                <span className="text-neutral-200 font-semibold">{selectedService?.name}</span>
              </div>
              <div className="flex justify-between border-b border-neutral-800/80 pb-2">
                <span className="text-neutral-400">Date & Time:</span>
                <span className="text-neutral-200 font-semibold">{date} at {time}</span>
              </div>
              <div className="flex justify-between border-b border-neutral-800/80 pb-2">
                <span className="text-neutral-400">Client:</span>
                <span className="text-neutral-200 font-semibold">{fullName} ({phone})</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-neutral-400">Cancellation Code:</span>
                <span className="font-mono text-amber-400 font-bold">{bookingResult.cancellation_code}</span>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-semibold uppercase tracking-wider transition"
            >
              Book Another Appointment
            </button>
          </div>
        )}

      </main>

      <footer className="border-t border-neutral-800 py-6 text-center text-xs text-neutral-500">
        <p>© {new Date().getFullYear()} Le Salon NYC. 310 East 44th St, Manhattan, NY 10017.</p>
        <p className="mt-1 text-neutral-600">Powered by Neon PostgreSQL & Render API</p>
      </footer>
    </div>
  );
}