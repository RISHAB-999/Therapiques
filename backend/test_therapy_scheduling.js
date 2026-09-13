import { 
  getAppointmentJoinStatus, 
  parseAppointmentDateTime, 
  normalizeSlotTime, 
  normalizeSlotDate, 
  getAppointmentTimeRange, 
  checkSlotConflict 
} from './utils/appointmentTiming.js';

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName} - ${details}`);
    failed++;
  }
}

console.log('================================================================');
console.log('   THERAPIQUE THERAPY SESSION & JOIN TIMING TEST SUITE');
console.log('================================================================\n');

// -----------------------------------------------------------------
// TEST 1 & 5: Slot generation simulation for 10:00 AM to 6:00 PM
// -----------------------------------------------------------------
console.log('--- TEST 1 & 5: Slot Generation & End-of-Day Cutoff (10:00 AM - 6:00 PM) ---');

function generateSlots(startHour, startMin, endHour, endMin) {
  const SESSION_DURATION = 60; // minutes
  const BUFFER = 30; // minutes
  const STEP = SESSION_DURATION + BUFFER; // 90 minutes

  const dayStart = new Date(2026, 8, 14, startHour, startMin, 0, 0);
  const dayEnd = new Date(2026, 8, 14, endHour, endMin, 0, 0);

  let currentSlot = new Date(dayStart);
  let generated = [];

  while (currentSlot < dayEnd) {
    const sessionEnd = new Date(currentSlot.getTime() + SESSION_DURATION * 60 * 1000);
    if (sessionEnd <= dayEnd) {
      const hours = currentSlot.getHours();
      const minutes = currentSlot.getMinutes();
      const period = hours >= 12 ? 'PM' : 'AM';
      const hour12 = hours % 12 === 0 ? 12 : hours % 12;
      const formattedTime = `${String(hour12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
      generated.push(formattedTime);
    }
    currentSlot.setMinutes(currentSlot.getMinutes() + STEP);
  }
  return generated;
}

const standardDaySlots = generateSlots(10, 0, 18, 0); // 10:00 AM to 6:00 PM (18:00)
console.log('Generated slots for 10:00 AM to 6:00 PM:', standardDaySlots);

assert(
  JSON.stringify(standardDaySlots) === JSON.stringify(['10:00 AM', '11:30 AM', '01:00 PM', '02:30 PM', '04:00 PM']),
  'Test 1: Correct 90-minute step intervals generated (10:00 AM, 11:30 AM, 01:00 PM, 02:30 PM, 04:00 PM)'
);

assert(
  !standardDaySlots.includes('05:30 PM'),
  'Test 5: 05:30 PM is NOT offered because 60-min session extends to 06:30 PM (exceeds 06:00 PM workday end)'
);

// -----------------------------------------------------------------
// TEST 4: Single hour workday (10:00 AM to 11:00 AM)
// -----------------------------------------------------------------
console.log('\n--- TEST 4: Single-Hour Workday Boundary (10:00 AM - 11:00 AM) ---');
const singleHourSlots = generateSlots(10, 0, 11, 0);
console.log('Generated slots for 10:00 AM to 11:00 AM:', singleHourSlots);
assert(
  JSON.stringify(singleHourSlots) === JSON.stringify(['10:00 AM']),
  'Test 4: Only 10:00 AM is generated for 10:00 AM - 11:00 AM workday'
);

// -----------------------------------------------------------------
// TEST 2 & 3: Slot Overlap & Buffer Conflict Checking
// -----------------------------------------------------------------
console.log('\n--- TEST 2 & 3: Slot Overlap & 30-Minute Buffer Conflict Prevention ---');

// If 10:00 AM is booked (reserves 10:00 AM - 11:30 AM):
assert(
  checkSlotConflict('10:00 AM', '10:00 AM') === true,
  'Test 2a: Exact same slot 10:00 AM conflicts'
);
assert(
  checkSlotConflict('10:00 AM', '10:30 AM') === true,
  'Test 2b: 10:30 AM conflicts with 10:00 AM session (inside 60-min session window)'
);
assert(
  checkSlotConflict('10:00 AM', '11:00 AM') === true,
  'Test 2c: 11:00 AM conflicts with 10:00 AM session (inside 30-min mandatory buffer window [11:00 - 11:30])'
);
assert(
  checkSlotConflict('10:00 AM', '11:30 AM') === false,
  'Test 2d: Next available slot is 11:30 AM (after 60 min session + 30 min buffer)'
);

// If 11:30 AM is booked (reserves 11:30 AM - 1:00 PM):
assert(
  checkSlotConflict('11:30 AM', '12:00 PM') === true,
  'Test 3a: 12:00 PM conflicts with 11:30 AM session'
);
assert(
  checkSlotConflict('11:30 AM', '12:30 PM') === true,
  'Test 3b: 12:30 PM conflicts with 11:30 AM buffer'
);
assert(
  checkSlotConflict('11:30 AM', '01:00 PM') === false,
  'Test 3c: Next available slot is 01:00 PM'
);

// -----------------------------------------------------------------
// TEST 6: Strict 10-Minute Video Join Window
// -----------------------------------------------------------------
console.log('\n--- TEST 6: Strict Video Call Join Timing Rules (10:00 AM - 11:00 AM session) ---');

const appointment = {
  _id: 'test_appt_1',
  slotDate: '14_9_2026',
  slotTime: '10:00 AM',
  duration: 60,
  cancelled: false,
  isCompleted: false
};

// 9:49 AM -> cannot join
const t_9_49 = new Date(2026, 8, 14, 9, 49, 0, 0);
const res_9_49 = getAppointmentJoinStatus(appointment, t_9_49);
assert(res_9_49.canJoin === false && res_9_49.status === 'BEFORE_WINDOW', 'Test 6.1: 09:49 AM → cannot join (BEFORE_WINDOW)');

// 9:50 AM -> can join
const t_9_50 = new Date(2026, 8, 14, 9, 50, 0, 0);
const res_9_50 = getAppointmentJoinStatus(appointment, t_9_50);
assert(res_9_50.canJoin === true && res_9_50.status === 'JOIN_WINDOW', 'Test 6.2: 09:50 AM → can join (JOIN_WINDOW begins)');

// 10:00 AM -> can join
const t_10_00 = new Date(2026, 8, 14, 10, 0, 0, 0);
const res_10_00 = getAppointmentJoinStatus(appointment, t_10_00);
assert(res_10_00.canJoin === true && res_10_00.status === 'JOIN_WINDOW', 'Test 6.3: 10:00 AM → can join (session start)');

// 10:30 AM -> can join
const t_10_30 = new Date(2026, 8, 14, 10, 30, 0, 0);
const res_10_30 = getAppointmentJoinStatus(appointment, t_10_30);
assert(res_10_30.canJoin === true && res_10_30.status === 'JOIN_WINDOW', 'Test 6.4: 10:30 AM → can join (mid-session)');

// 10:59:59 AM -> can join
const t_10_59_59 = new Date(2026, 8, 14, 10, 59, 59, 999);
const res_10_59_59 = getAppointmentJoinStatus(appointment, t_10_59_59);
assert(res_10_59_59.canJoin === true && res_10_59_59.status === 'JOIN_WINDOW', 'Test 6.5: 10:59:59 AM → can join (last second of session)');

// 11:00 AM -> CANNOT join (exact end of therapy session)
const t_11_00 = new Date(2026, 8, 14, 11, 0, 0, 0);
const res_11_00 = getAppointmentJoinStatus(appointment, t_11_00);
assert(res_11_00.canJoin === false && res_11_00.status === 'AFTER_WINDOW', 'Test 6.6: 11:00 AM → CANNOT join (session ended, buffer begins)');

// 11:01 AM -> CANNOT join
const t_11_01 = new Date(2026, 8, 14, 11, 1, 0, 0);
const res_11_01 = getAppointmentJoinStatus(appointment, t_11_01);
assert(res_11_01.canJoin === false && res_11_01.status === 'AFTER_WINDOW', 'Test 6.7: 11:01 AM → CANNOT join (inside buffer)');

// 11:15 AM -> CANNOT join
const t_11_15 = new Date(2026, 8, 14, 11, 15, 0, 0);
const res_11_15 = getAppointmentJoinStatus(appointment, t_11_15);
assert(res_11_15.canJoin === false && res_11_15.status === 'AFTER_WINDOW', 'Test 6.8: 11:15 AM → CANNOT join (mid-buffer)');

// 11:29 AM -> CANNOT join
const t_11_29 = new Date(2026, 8, 14, 11, 29, 0, 0);
const res_11_29 = getAppointmentJoinStatus(appointment, t_11_29);
assert(res_11_29.canJoin === false && res_11_29.status === 'AFTER_WINDOW', 'Test 6.9: 11:29 AM → CANNOT join (end of buffer)');

// -----------------------------------------------------------------
// TEST 7: Time Range Formatter
// -----------------------------------------------------------------
console.log('\n--- TEST 7: Appointment Time Range Formatter ---');
assert(
  getAppointmentTimeRange('10:00 AM', 60) === '10:00 AM – 11:00 AM',
  'Test 7.1: Formats 10:00 AM with 60 min duration to "10:00 AM – 11:00 AM"'
);
assert(
  getAppointmentTimeRange('11:30 AM', 60) === '11:30 AM – 12:30 PM',
  'Test 7.2: Formats 11:30 AM with 60 min duration to "11:30 AM – 12:30 PM"'
);

console.log('\n================================================================');
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
