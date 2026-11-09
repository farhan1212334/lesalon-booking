import React, { useEffect, useState } from 'react';

const PAGE_SIZE = 50;
const CALENDAR_PAGE_SIZE = 500;
const DAY_START_MINUTE = 10 * 60;
const DAY_END_MINUTE = 20 * 60;
const MINUTES_PER_CALENDAR_ROW = 60;
const CALENDAR_ROW_HEIGHT = 64;

function getSalonToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getWeekStart(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

function formatCalendarDate(dateString, options) {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' })
    .format(new Date(`${dateString}T00:00:00.000Z`));
}

function parseAppointmentMinute(timeString) {
  const [, hourText, minuteText, period] = timeString.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  let hour = Number(hourText) % 12;
  if (period.toUpperCase() === 'PM') hour += 12;
  return hour * 60 + Number(minuteText);
}

function formatHour(hour) {
  const period = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12} ${period}`;
}

function layoutCalendarEvents(appointments) {
  const sorted = appointments
    .map((appointment) => ({
      appointment,
      start: parseAppointmentMinute(appointment.startTime),
      end: parseAppointmentMinute(appointment.startTime) + appointment.duration,
    }))
    .sort((left, right) => left.start - right.start || right.end - left.end);
  const groups = [];
  let group = [];
  let groupEnd = -1;

  sorted.forEach((event) => {
    if (group.length && event.start >= groupEnd) {
      groups.push(group);
      group = [];
      groupEnd = -1;
    }
    group.push(event);
    groupEnd = Math.max(groupEnd, event.end);
  });
  if (group.length) groups.push(group);

  return groups.flatMap((events) => {
    const laneEnds = [];
    const layouts = events.map((event) => {
      let lane = laneEnds.findIndex((end) => end <= event.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = event.end;
      return { ...event, lane };
    });
    return layouts.map(({ appointment, lane }) => ({
      appointment,
      lane,
      laneCount: laneEnds.length,
    }));
  });
}

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

function AppointmentCalendar({
  appointments,
  mode,
  date,
  selectedAppointmentId,
  onSelectAppointment,
  onCancel,
  cancelingId,
}) {
  const weekStart = getWeekStart(date);
  const days = mode === 'day'
    ? [date]
    : Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index));
  const hours = Array.from(
    { length: (DAY_END_MINUTE - DAY_START_MINUTE) / MINUTES_PER_CALENDAR_ROW },
    (_, index) => DAY_START_MINUTE / 60 + index
  );
  const appointmentsByDate = new Map(days.map((day) => [day, []]));
  appointments.forEach((appointment) => {
    appointmentsByDate.get(appointment.date)?.push(appointment);
  });
  const eventLayoutsByDate = new Map(
    [...appointmentsByDate].map(([day, events]) => [day, layoutCalendarEvents(events)])
  );
  const selectedAppointment = appointments.find(({ id }) => id === selectedAppointmentId);

  return (
    <>
      <div className={`admin-calendar-scroll ${mode === 'week' ? 'week-view' : 'day-view'}`}>
        <div className="admin-calendar">
          <div className="admin-calendar-corner" />
          {days.map((day) => (
            <div
              className={`admin-calendar-day-heading ${day === getSalonToday() ? 'today' : ''} ${day === date ? 'selected-date' : ''}`}
              key={day}
            >
              <span>{formatCalendarDate(day, { weekday: 'short' })}</span>
              <strong>{formatCalendarDate(day, { month: 'short', day: 'numeric' })}</strong>
            </div>
          ))}

          <div className="admin-calendar-time-labels">
            {hours.map((hour) => <span key={hour}>{formatHour(hour)}</span>)}
          </div>
          {days.map((day) => (
            <div className="admin-calendar-day" key={day}>
              <div className="admin-calendar-hour-lines">
                {hours.map((hour) => <span key={hour} />)}
              </div>
              {eventLayoutsByDate.get(day).map(({ appointment, lane, laneCount }) => {
                const startMinute = parseAppointmentMinute(appointment.startTime);
                const top = ((startMinute - DAY_START_MINUTE) / MINUTES_PER_CALENDAR_ROW) * CALENDAR_ROW_HEIGHT;
                const height = Math.max(
                  (appointment.duration / MINUTES_PER_CALENDAR_ROW) * CALENDAR_ROW_HEIGHT,
                  42
                );
                const laneWidth = 100 / laneCount;
                const selected = appointment.id === selectedAppointmentId;
                return (
                  <button
                    type="button"
                    key={appointment.id}
                    className={`admin-calendar-event ${appointment.status} ${selected ? 'selected' : ''}`}
                    style={{
                      top,
                      height,
                      left: `calc(${lane * laneWidth}% + 4px)`,
                      width: `calc(${laneWidth}% - 8px)`,
                      right: 'auto',
                    }}
                    aria-pressed={selected}
                    onClick={() => onSelectAppointment(selected ? null : appointment.id)}
                  >
                    <strong>{appointment.startTime} · {appointment.fullName}</strong>
                    <span>{appointment.serviceNames.join(', ')}</span>
                    <span>{appointment.stylistName}</span>
                  </button>
                );
              })}
              {new Date(`${day}T00:00:00.000Z`).getUTCDay() === 0 &&
                appointmentsByDate.get(day).length === 0 && (
                <span className="admin-calendar-closed">Closed</span>
              )}
            </div>
          ))}
        </div>
      </div>
      {selectedAppointment && (
        <AppointmentCard
          appointment={selectedAppointment}
          onCancel={onCancel}
          isCanceling={cancelingId === selectedAppointment.id}
        />
      )}
    </>
  );
}

export default function AdminPanel() {
  const [authState, setAuthState] = useState('checking');
  const [configured, setConfigured] = useState(true);
  const [pin, setPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [appointments, setAppointments] = useState([]);
  const [statusFilter, setStatusFilter] = useState('confirmed');
  const [viewMode, setViewMode] = useState('calendar');
  const [calendarMode, setCalendarMode] = useState('week');
  const [calendarDate, setCalendarDate] = useState(getSalonToday);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [calendarWarning, setCalendarWarning] = useState('');
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
    const calendarStart = calendarMode === 'day' ? calendarDate : getWeekStart(calendarDate);
    const calendarEnd = calendarMode === 'day' ? calendarDate : shiftDate(calendarStart, 6);
    const params = new URLSearchParams({
      status: statusFilter,
      search: appliedSearch,
      limit: String(viewMode === 'calendar' ? CALENDAR_PAGE_SIZE : PAGE_SIZE),
      offset: String(viewMode === 'calendar' ? 0 : offset),
    });
    if (viewMode === 'calendar') {
      params.set('fromDate', calendarStart);
      params.set('toDate', calendarEnd);
    } else {
      params.set('date', dateFilter);
    }
    setLoading(true);
    setListError('');
    setCalendarWarning('');
    adminRequest(`/api/admin-appointments?${params}`, { signal: controller.signal })
      .then((result) => {
        setAppointments(result.appointments);
        setHasMore(result.hasMore);
        setSelectedAppointmentId(null);
        if (viewMode === 'calendar' && result.hasMore) {
          setCalendarWarning('This calendar range contains more than 500 appointments. Add a search or status filter to view the full schedule.');
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setListError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [authState, statusFilter, appliedSearch, dateFilter, offset, reloadKey, viewMode, calendarMode, calendarDate]);

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

      <div className="admin-view-toolbar" aria-label="Appointment view">
        <div className="admin-view-toggle" role="group" aria-label="Choose appointment view">
          <button
            type="button"
            className={viewMode === 'calendar' ? 'active' : ''}
            aria-pressed={viewMode === 'calendar'}
            onClick={() => { setOffset(0); setViewMode('calendar'); }}
          >
            Calendar
          </button>
          <button
            type="button"
            className={viewMode === 'list' ? 'active' : ''}
            aria-pressed={viewMode === 'list'}
            onClick={() => { setOffset(0); setViewMode('list'); }}
          >
            List
          </button>
        </div>

        {viewMode === 'calendar' && (
          <div className="admin-calendar-controls">
            <div className="admin-view-toggle" role="group" aria-label="Choose calendar range">
              <button
                type="button"
                className={calendarMode === 'day' ? 'active' : ''}
                aria-pressed={calendarMode === 'day'}
                onClick={() => setCalendarMode('day')}
              >
                Day
              </button>
              <button
                type="button"
                className={calendarMode === 'week' ? 'active' : ''}
                aria-pressed={calendarMode === 'week'}
                onClick={() => setCalendarMode('week')}
              >
                Week
              </button>
            </div>
            <button
              type="button"
              className="admin-calendar-nav"
              aria-label={`Previous ${calendarMode}`}
              onClick={() => setCalendarDate((current) => shiftDate(current, calendarMode === 'day' ? -1 : -7))}
            >
              ‹
            </button>
            <label className="admin-calendar-date">
              <span className="sr-only">Calendar date</span>
              <input
                type="date"
                value={calendarDate}
                onChange={(event) => {
                  if (event.target.value) setCalendarDate(event.target.value);
                }}
              />
            </label>
            <button
              type="button"
              className="admin-calendar-nav"
              aria-label={`Next ${calendarMode}`}
              onClick={() => setCalendarDate((current) => shiftDate(current, calendarMode === 'day' ? 1 : 7))}
            >
              ›
            </button>
            <button type="button" className="admin-calendar-today" onClick={() => setCalendarDate(getSalonToday())}>
              Today
            </button>
          </div>
        )}
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
        {viewMode === 'list' && (
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
        )}
      </div>

      {feedback && <div className="status-alert alert-success" role="status">{feedback}</div>}
      {listError && <div className="status-alert alert-warning" role="alert">{listError}</div>}
      {calendarWarning && viewMode === 'calendar' && (
        <div className="status-alert alert-warning" role="status">{calendarWarning}</div>
      )}
      {loading && <p className="admin-loading" role="status">Loading appointments…</p>}
      {!loading && !listError && appointments.length === 0 && (
        <div className="card-box admin-empty">No appointments match these filters.</div>
      )}
      {!loading && !listError && viewMode === 'calendar' && (
        <AppointmentCalendar
          appointments={appointments}
          mode={calendarMode}
          date={calendarDate}
          selectedAppointmentId={selectedAppointmentId}
          onSelectAppointment={setSelectedAppointmentId}
          onCancel={handleCancel}
          cancelingId={cancelingId}
        />
      )}
      {viewMode === 'list' && (
        <>
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
        </>
      )}
    </section>
  );
}
