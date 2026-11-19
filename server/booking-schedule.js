function intervalsOverlap(startMinute, endMinute, appointment) {
  return startMinute < appointment.end_minute && endMinute > appointment.start_minute;
}

function hasTimeConflict(startMinute, endMinute, appointments) {
  return appointments.some((appointment) =>
    intervalsOverlap(startMinute, endMinute, appointment)
  );
}

function getSlotAvailability(schedule, appointments) {
  const bookedSlots = [];
  const overlappingSlots = [];

  for (const slot of schedule) {
    if (appointments.some((appointment) => appointment.start_minute === slot.startMinute)) {
      bookedSlots.push(slot.start);
    } else if (hasTimeConflict(slot.startMinute, slot.endMinute, appointments)) {
      overlappingSlots.push(slot.start);
    }
  }

  return { bookedSlots, overlappingSlots };
}

module.exports = { getSlotAvailability, hasTimeConflict };
