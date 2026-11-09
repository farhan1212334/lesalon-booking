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

function formatHistoryDate(dateString) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dateString}T00:00:00.000Z`));
}

function CustomerHistoryView() {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [customerOffset, setCustomerOffset] = useState(0);
  const [customersHaveMore, setCustomersHaveMore] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [appointmentOffset, setAppointmentOffset] = useState(0);
  const [appointmentsHaveMore, setAppointmentsHaveMore] = useState(false);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState('');

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setCustomerOffset(0);
      setSelectedCustomer(null);
      setAppliedSearch(search.trim());
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    if (appliedSearch.length < 2) {
      setCustomers([]);
      setCustomersHaveMore(false);
      setCustomersLoading(false);
      setCustomersError('');
      return undefined;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      search: appliedSearch,
      limit: String(PAGE_SIZE),
      offset: String(customerOffset),
    });
    setCustomersLoading(true);
    setCustomersError('');
    setCustomers([]);
    adminRequest(`/api/admin-customers?${params}`, { signal: controller.signal })
      .then((result) => {
        setCustomers(result.customers);
        setCustomersHaveMore(result.hasMore);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setCustomersError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCustomersLoading(false);
      });
    return () => controller.abort();
  }, [appliedSearch, customerOffset]);

  useEffect(() => {
    if (!selectedCustomer) {
      setAppointments([]);
      setAppointmentsHaveMore(false);
      setAppointmentsLoading(false);
      setAppointmentsError('');
      return undefined;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      email: selectedCustomer.email,
      limit: String(PAGE_SIZE),
      offset: String(appointmentOffset),
    });
    setAppointmentsLoading(true);
    setAppointmentsError('');
    setAppointments([]);
    adminRequest(`/api/admin-customer-appointments?${params}`, { signal: controller.signal })
      .then((result) => {
        setAppointments(result.appointments);
        setAppointmentsHaveMore(result.hasMore);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setAppointmentsError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setAppointmentsLoading(false);
      });
    return () => controller.abort();
  }, [selectedCustomer, appointmentOffset]);

  return (
    <div className="admin-customer-history">
      <div className="card-box admin-customer-search">
        <label className="form-label" htmlFor="adminCustomerSearch">Search customers</label>
        <input
          id="adminCustomerSearch"
          className="form-input"
          type="search"
          placeholder="Enter at least 2 characters of name, email, or phone"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <p>Appointment history is grouped by customer email address.</p>
      </div>

      {customersError && <div className="status-alert alert-warning" role="alert">{customersError}</div>}
      {customersLoading && <p className="admin-loading" role="status">Searching customers…</p>}
      {!customersLoading && !customersError && appliedSearch.length < 2 && (
        <div className="card-box admin-empty">Search by customer name, email, or phone to view appointment history.</div>
      )}
      {!customersLoading && !customersError && appliedSearch.length >= 2 && customers.length === 0 && (
        <div className="card-box admin-empty">No customers match this search.</div>
      )}

      {customers.length > 0 && (
        <div className="admin-customer-results">
          <div className="admin-customer-list" aria-label="Customer search results">
            {customers.map((customer) => (
              <button
                type="button"
                key={customer.email}
                className={`admin-customer-result ${selectedCustomer?.email === customer.email ? 'selected' : ''}`}
                aria-pressed={selectedCustomer?.email === customer.email}
                onClick={() => {
                  setSelectedCustomer(customer);
                  setAppointmentOffset(0);
                }}
              >
                <strong>{customer.fullName}</strong>
                <span>{customer.email}</span>
                <span>{customer.phone}</span>
                <span>{customer.appointmentCount} appointment{customer.appointmentCount === 1 ? '' : 's'} · Last visit {formatHistoryDate(customer.lastAppointment)}</span>
              </button>
            ))}
          </div>
          <div className="admin-pagination">
            <button
              type="button"
              className="btn-secondary"
              disabled={customerOffset === 0 || customersLoading}
              onClick={() => {
                setSelectedCustomer(null);
                setCustomerOffset((current) => Math.max(0, current - PAGE_SIZE));
              }}
            >
              Previous customers
            </button>
            <span>Showing {customerOffset + 1}–{customerOffset + customers.length}</span>
            <button
              type="button"
              className="btn-secondary"
              disabled={!customersHaveMore || customersLoading}
              onClick={() => {
                setSelectedCustomer(null);
                setCustomerOffset((current) => current + PAGE_SIZE);
              }}
            >
              Next customers
            </button>
          </div>
        </div>
      )}

      {selectedCustomer && (
        <section className="admin-customer-detail" aria-label={`Appointment history for ${selectedCustomer.fullName}`}>
          <div className="admin-customer-detail-heading">
            <div>
              <h3 className="font-serif">{selectedCustomer.fullName}</h3>
              <p>
                <a href={`mailto:${selectedCustomer.email}`}>{selectedCustomer.email}</a>
                {' · '}
                <a href={`tel:${selectedCustomer.phone}`}>{selectedCustomer.phone}</a>
              </p>
            </div>
            <button type="button" className="btn-secondary" onClick={() => setSelectedCustomer(null)}>
              Close history
            </button>
          </div>
          {appointmentsError && <div className="status-alert alert-warning" role="alert">{appointmentsError}</div>}
          {appointmentsLoading && <p className="admin-loading" role="status">Loading appointment history…</p>}
          {!appointmentsLoading && !appointmentsError && appointments.length === 0 && (
            <div className="card-box admin-empty">No appointments were found for this customer.</div>
          )}
          {!appointmentsLoading && appointments.length > 0 && (
            <>
              <div className="admin-customer-appointments">
                {appointments.map((appointment) => {
                  const upcoming = appointment.status === 'confirmed' && appointment.date >= getSalonToday();
                  const statusLabel = appointment.status === 'canceled'
                    ? 'Canceled'
                    : upcoming ? 'Confirmed · Upcoming' : 'Confirmed · Past';
                  return (
                    <article className="admin-customer-appointment" key={appointment.id}>
                      <div>
                        <strong>{formatHistoryDate(appointment.date)} · {appointment.startTime}–{appointment.endTime}</strong>
                        <span className={`admin-status ${appointment.status}`}>{statusLabel}</span>
                      </div>
                      <p>{appointment.serviceNames.join(', ')}</p>
                      <p>{appointment.stylistName} · Reference {appointment.referenceCode}</p>
                      <p>Estimate: ${appointment.price}{appointment.consultationRequired ? ' + consultation' : ''}</p>
                    </article>
                  );
                })}
              </div>
              <div className="admin-pagination">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={appointmentOffset === 0 || appointmentsLoading}
                  onClick={() => setAppointmentOffset((current) => Math.max(0, current - PAGE_SIZE))}
                >
                  Previous appointments
                </button>
                <span>Showing {appointmentOffset + 1}–{appointmentOffset + appointments.length}</span>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!appointmentsHaveMore || appointmentsLoading}
                  onClick={() => setAppointmentOffset((current) => current + PAGE_SIZE)}
                >
                  Next appointments
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function ServiceManagementView() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState({
    name: '',
    category: '',
    price: '',
    priceSuffix: '',
    duration: '60',
    active: true,
  });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    adminRequest('/api/admin-services', { signal: controller.signal })
      .then((result) => setServices(result.services))
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const resetForm = () => {
    setEditingId(null);
    setFormError('');
    setForm({
      name: '',
      category: '',
      price: '',
      priceSuffix: '',
      duration: '60',
      active: true,
    });
  };

  const editService = (service) => {
    setEditingId(service.id);
    setFormError('');
    setForm({
      name: service.name,
      category: service.category,
      price: service.price === null ? '' : String(service.price),
      priceSuffix: service.priceSuffix,
      duration: String(service.duration),
      active: service.active,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setFeedback('');
    const payload = {
      ...form,
      price: form.price === '' ? null : Number(form.price),
      duration: Number(form.duration),
    };
    try {
      await adminRequest(editingId ? `/api/admin-services/${editingId}` : '/api/admin-services', {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      setFeedback(editingId
        ? 'Service updated. The change applies to new bookings; existing appointments keep their saved details.'
        : 'Service added to the customer booking menu.');
      resetForm();
      setReloadKey((key) => key + 1);
    } catch (requestError) {
      setFormError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (service) => {
    if (!window.confirm(`Archive "${service.name}"? It will no longer appear in new customer bookings. Existing appointments will remain unchanged.`)) {
      return;
    }
    setError('');
    setFeedback('');
    try {
      await adminRequest(`/api/admin-services/${service.id}/archive`, { method: 'PATCH' });
      setFeedback('Service archived. Existing appointments keep their saved details.');
      if (editingId === service.id) resetForm();
      setReloadKey((key) => key + 1);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <div className="admin-service-management">
      <div className="card-box admin-service-form-card">
        <h3 className="font-serif">{editingId ? 'Edit service' : 'Add service'}</h3>
        <p>Changes affect new bookings only. Existing appointments retain their saved service, price, and duration.</p>
        {formError && <div className="status-alert alert-warning" role="alert">{formError}</div>}
        <form className="admin-service-form" onSubmit={handleSubmit}>
          <div className="admin-service-form-grid">
            <div className="form-field">
              <label className="form-label" htmlFor="serviceName">Service name</label>
              <input
                id="serviceName"
                className="form-input"
                value={form.name}
                maxLength={120}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="serviceCategory">Category</label>
              <input
                id="serviceCategory"
                className="form-input"
                value={form.category}
                maxLength={60}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                required
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="servicePrice">Starting price (leave blank for consultation)</label>
              <input
                id="servicePrice"
                className="form-input"
                type="number"
                min="0"
                max="100000"
                step="0.01"
                value={form.price}
                onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="servicePriceSuffix">Price label (optional)</label>
              <input
                id="servicePriceSuffix"
                className="form-input"
                placeholder="e.g. and up"
                maxLength={40}
                value={form.priceSuffix}
                onChange={(event) => setForm((current) => ({ ...current, priceSuffix: event.target.value }))}
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="serviceDuration">Appointment duration (minutes)</label>
              <input
                id="serviceDuration"
                className="form-input"
                type="number"
                min="15"
                max="600"
                step="15"
                value={form.duration}
                onChange={(event) => setForm((current) => ({ ...current, duration: event.target.value }))}
                required
              />
            </div>
          </div>
          {editingId && (
            <label className="admin-service-active">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
              />
              Available to customers for new bookings
            </label>
          )}
          <div className="admin-service-form-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add service'}
            </button>
            {editingId && (
              <button type="button" className="btn-secondary" disabled={saving} onClick={resetForm}>
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </div>

      {feedback && <div className="status-alert alert-success" role="status">{feedback}</div>}
      {error && <div className="status-alert alert-warning" role="alert">{error}</div>}
      {loading && <p className="admin-loading" role="status">Loading service catalog…</p>}
      {!loading && !error && services.length === 0 && (
        <div className="card-box admin-empty">No services are configured.</div>
      )}
      {!loading && !error && services.length > 0 && (
        <div className="admin-service-list">
          {services.map((service) => (
            <article className={`admin-service-item ${service.active ? '' : 'archived'}`} key={service.id}>
              <div className="admin-service-item-details">
                <div className="admin-service-item-heading">
                  <h4>{service.name}</h4>
                  <span className={`admin-status ${service.active ? 'confirmed' : 'canceled'}`}>
                    {service.active ? 'Active' : 'Archived'}
                  </span>
                </div>
                <p>{service.category}</p>
                <p>
                  {service.price === null ? 'Upon consultation' : `$${service.price}${service.priceSuffix ? ` ${service.priceSuffix}` : ''}`}
                  {' · '}
                  {service.duration} minutes
                </p>
              </div>
              <div className="admin-service-item-actions">
                <button type="button" className="btn-secondary" onClick={() => editService(service)}>
                  Edit
                </button>
                {service.active && (
                  <button type="button" className="btn-danger" onClick={() => handleArchive(service)}>
                    Archive
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
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
  const [adminSection, setAdminSection] = useState('appointments');
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
    if (authState !== 'authenticated' || adminSection !== 'appointments') return undefined;
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
  }, [authState, adminSection, statusFilter, appliedSearch, dateFilter, offset, reloadKey, viewMode, calendarMode, calendarDate]);

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
      setAdminSection('appointments');
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
          <h2 className="font-serif">
            {adminSection === 'customers' ? 'Customer history' : adminSection === 'services' ? 'Service catalog' : 'Appointments'}
          </h2>
          <p>
            {adminSection === 'customers'
              ? 'Search customer records and review their appointment history.'
              : adminSection === 'services'
                ? 'Manage the service menu shown to customers when they book.'
                : 'Manage reservations saved in the booking database.'}
          </p>
        </div>
        <button type="button" className="btn-secondary admin-logout" onClick={handleLogout}>Sign out</button>
      </div>

      <div className="admin-module-nav" role="group" aria-label="Admin section">
        <button
          type="button"
          className={adminSection === 'appointments' ? 'active' : ''}
          aria-pressed={adminSection === 'appointments'}
          onClick={() => setAdminSection('appointments')}
        >
          Appointments
        </button>
        <button
          type="button"
          className={adminSection === 'customers' ? 'active' : ''}
          aria-pressed={adminSection === 'customers'}
          onClick={() => setAdminSection('customers')}
        >
          Customers
        </button>
        <button
          type="button"
          className={adminSection === 'services' ? 'active' : ''}
          aria-pressed={adminSection === 'services'}
          onClick={() => setAdminSection('services')}
        >
          Services
        </button>
      </div>

      {adminSection === 'customers' && <CustomerHistoryView />}
      {adminSection === 'services' && <ServiceManagementView />}

      {adminSection === 'appointments' && (
        <>
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
        </>
      )}
    </section>
  );
}
