const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDateOnly } = require('./date-format');

test('formats PostgreSQL DATE values without converting their calendar day', () => {
  const appointmentDate = new Date(2026, 10, 19);

  assert.equal(formatDateOnly(appointmentDate), '2026-11-19');
});

test('keeps date-only strings and trims timestamp strings to their date', () => {
  assert.equal(formatDateOnly('2026-11-19'), '2026-11-19');
  assert.equal(formatDateOnly('2026-11-19T00:00:00.000Z'), '2026-11-19');
});

test('rejects invalid date values rather than returning a malformed calendar key', () => {
  assert.throws(() => formatDateOnly(new Date('invalid')), /Appointment date is invalid/);
  assert.throws(() => formatDateOnly(null), /unsupported format/);
});
