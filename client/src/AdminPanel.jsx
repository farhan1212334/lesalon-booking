import React, { useEffect, useState } from 'react';

const PAGE_SIZE = 50;

async function adminRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Could not connect to the booking server. Try again when the connection is available.');
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const defaultMessage = response.status === 404
      ? 'The admin API route was not found. The Vercel deployment may still be updating; refresh the page shortly.'
      : `The request could not be completed (HTTP ${response.status}). Please try again.`;
    const requestError = new Error(result.error || defaultMessage);
    requestError.status = response.status;
    throw requestError;
  }
  return result;
}

function AppointmentCard({ appointment, onCancel, isCanceling }) {
  return (
    <article className="admin-appointment">
      <div className="admin-appointment-heading">
        <div>
          <h3>{appointment.fullName}</h3>
          <span className={`admin-status ${appointment.status}`}>
            {appointment.status === 'confirmed' ? 'Confirmed' : 'Canceled'}
          </span>
        </div>
        <strong className="admin-reference">{appointment.referenceCode}</strong>
      </div>
      <dl className="admin-appointment-details">
        <div><dt>Date & time</dt><dd>{appointment.date} · {appointment.startTime} – {appointment.endTime}</dd></div>
        <div><dt>Stylist</dt><dd>{appointment.stylistName}</dd></div>
        <div><dt>Services</dt><dd>{appointment.serviceNames.join(', ')}</dd></div>
        <div><dt>Estimate</dt><dd>${appointment.price}{appointment.consultationRequired ? ' + consultation' : ''}</dd></div>
        <div><dt>Email</dt><dd><a href={`mailto:${appointment.email}`}>{appointment.email}</a></dd></div>
        <div><dt>Phone</dt><dd><a href={`tel:${appointment.phone}`}>{appointment.phone}</a></dd></div>
        {appointment.notes && <div className="admin-notes"><dt>Notes</dt><dd>{appointment.notes}</dd></div>}
      </dl>
      {appointment.status === 'confirmed' && (
        <button
          type="button"
          className="btn-danger admin-cancel-button"
          disabled={isCanceling}
          onClick={() => onCancel(appointment)}
        >
          {isCanceling ? 'Canceling…' : 'Cancel appointment'}
        </button>
      )}
    </article>
  );
}

export default function AdminPanel() {
  const [authState, setAuthState] = useState('checking');
  const [configured, setConfigured] = useState(true);
  const [pin, setPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [appointments, setAppointments] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [cancelingId, setCancelingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    adminRequest('/api/admin-session')
      .then((result) => {
        if (!active) return;
        setConfigured(result.configured);
        setAuthState(result.authenticated ? 'authenticated' : 'signed-out');
      })
      .catch((error) => {
        if (active) {
          setAuthError(error.message);
          setAuthState('signed-out');
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setOffset(0);
      setAppliedSearch(search.trim());
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    if (authState !== 'authenticated') return undefined;
    const controller = new AbortController();
    const params = new URLSearchParams({
      status: statusFilter,
      search: appliedSearch,
      date: dateFilter,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    setLoading(true);
    setListError('');
    adminRequest(`/api/admin-appointments?${params}`, { signal: controller.signal })
      .then((result) => {
        setAppointments(result.appointments);
        setHasMore(result.hasMore);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setListError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [authState, statusFilter, appliedSearch, dateFilter, offset, reloadKey]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setAuthError('');
    try {
      await adminRequest('/api/admin-login', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      setPin('');
      setConfigured(true);
      setAuthState('authenticated');
    } catch (error) {
      if (error.status === 503) setConfigured(false);
      setAuthError(error.message);
    }
  };

  const handleLogout = async () => {
    setAuthError('');
    try {
      await adminRequest('/api/admin-logout', { method: 'POST', body: '{}' });
      setAppointments([]);
      setAuthState('signed-out');
      setFeedback('');
    } catch (error) {
      setAuthError(error.message);
    }
  };

  const handleCancel = async (appointment) => {
    if (!window.confirm(`Cancel ${appointment.referenceCode} for ${appointment.fullName}? The customer will be emailed.`)) {
      return;
    }
    setCancelingId(appointment.id);
    setFeedback('');
    try {
      const result = await adminRequest('/api/admin-cancel', {
        method: 'POST',
        body: JSON.stringify({ appointmentId: appointment.id }),
      });
      setFeedback(result.emailStatus.sent
        ? `Appointment ${appointment.referenceCode} canceled; the customer cancellation email was accepted.`
        : `Appointment ${appointment.referenceCode} canceled, but the email was not accepted: ${result.emailStatus.customer.error || result.emailStatus.message}`);
      setReloadKey((key) => key + 1);
    } catch (error) {
      setListError(error.message);
    } finally {
      setCancelingId(null);
    }
  };

  if (authState === 'checking') {
    return <section className="card-box admin-panel"><p role="status">Checking admin access…</p></section>;
  }

  if (authState !== 'authenticated') {
    return (
      <section className="card-box admin-panel admin-login">
        <h2 className="font-serif">Admin sign in</h2>
        <p>Sign in to securely view and manage salon appointments.</p>
        {authError && <div className="status-alert alert-warning" role="alert">{authError}</div>}
        {!configured && (
          <p className="admin-setup-note">
            Add <code>ADMIN_PIN</code> in your Vercel project environment variables as exactly six digits, then redeploy.
          </p>
        )}
        <form onSubmit={handleLogin}>
          <div className="form-field">
            <label className="form-label" htmlFor="adminPin">Six-digit admin PIN</label>
            <input
              id="adminPin"
              className="form-input"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              autoComplete="off"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
              required
            />
          </div>
          <button type="submit" className="btn-primary admin-login-button">Sign in</button>
        </form>
      </section>
    );
  }

  return (
    <section className="admin-panel">
      <div className="admin-toolbar">
        <div>
          <h2 className="font-serif">Appointments</h2>
          <p>Manage reservations saved in the booking database.</p>
        </div>
        <button type="button" className="btn-secondary admin-logout" onClick={handleLogout}>Sign out</button>
      </div>

      <div className="card-box admin-filters">
        <div className="admin-filter-field">
          <label className="form-label" htmlFor="adminSearch">Search reservations</label>
          <input
            id="adminSearch"
            className="form-input"
            type="search"
            placeholder="Name, email, phone, or reference"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="admin-filter-field">
          <label className="form-label" htmlFor="adminStatus">Status</label>
          <select
            id="adminStatus"
            className="form-input"
            value={statusFilter}
            onChange={(event) => { setOffset(0); setStatusFilter(event.target.value); }}
          >
            <option value="all">All appointments</option>
            <option value="confirmed">Confirmed</option>
            <option value="canceled">Canceled</option>
          </select>
        </div>
        <div className="admin-filter-field">
          <label className="form-label" htmlFor="adminDate">Appointment date</label>
          <input
            id="adminDate"
            className="form-input"
            type="date"
            value={dateFilter}
            onChange={(event) => { setOffset(0); setDateFilter(event.target.value); }}
          />
        </div>
      </div>

      {feedback && <div className="status-alert alert-success" role="status">{feedback}</div>}
      {listError && <div className="status-alert alert-warning" role="alert">{listError}</div>}
      {loading && <p className="admin-loading" role="status">Loading appointments…</p>}
      {!loading && !listError && appointments.length === 0 && (
        <div className="card-box admin-empty">No appointments match these filters.</div>
      )}
      <div className="admin-appointment-list">
        {appointments.map((appointment) => (
          <AppointmentCard
            key={appointment.id}
            appointment={appointment}
            onCancel={handleCancel}
            isCanceling={cancelingId === appointment.id}
          />
        ))}
      </div>
      <div className="admin-pagination">
        <button
          type="button"
          className="btn-secondary"
          disabled={offset === 0 || loading}
          onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
        >
          Previous
        </button>
        <span>Showing {appointments.length ? offset + 1 : 0}–{offset + appointments.length}</span>
        <button
          type="button"
          className="btn-secondary"
          disabled={!hasMore || loading}
          onClick={() => setOffset((current) => current + PAGE_SIZE)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
