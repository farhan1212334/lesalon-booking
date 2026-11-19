const test = require('node:test');
const assert = require('node:assert/strict');
const { getSlotAvailability, hasTimeConflict } = require('./booking-schedule');

test('marks only the exact start as booked and marks intersecting windows unavailable', () => {
  const schedule = [
    { start: '11:00 AM', startMinute: 660, endMinute: 705 },
    { start: '11:30 AM', startMinute: 690, endMinute: 735 },
    { start: '12:00 PM', startMinute: 720, endMinute: 765 },
    { start: '12:30 PM', startMinute: 750, endMinute: 795 },
  ];
  const appointments = [{ start_minute: 690, end_minute: 735 }];

  assert.deepEqual(getSlotAvailability(schedule, appointments), {
    bookedSlots: ['11:30 AM'],
    overlappingSlots: ['11:00 AM', '12:00 PM'],
  });
});

test('allows back-to-back appointments when one ends as the next begins', () => {
  assert.equal(hasTimeConflict(735, 780, [{ start_minute: 690, end_minute: 735 }]), false);
});

test('uses the requested service duration when checking long windows', () => {
  const booking = [{ start_minute: 900, end_minute: 975 }];

  assert.equal(hasTimeConflict(840, 1020, booking), true);
  assert.equal(hasTimeConflict(780, 900, booking), false);
});

test('leaves every slot available when there are no confirmed appointments', () => {
  const schedule = [
    { start: '10:00 AM', startMinute: 600, endMinute: 645 },
    { start: '10:30 AM', startMinute: 630, endMinute: 675 },
  ];

  assert.deepEqual(getSlotAvailability(schedule, []), {
    bookedSlots: [],
    overlappingSlots: [],
  });
});
