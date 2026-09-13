/**
 * Shared Appointment Timing & Join-Window Calculator for Therapique (Admin / Doctor Portal)
 *
 * Rules:
 * - Join window begins exactly 10 minutes before scheduled start time.
 * - Join window ends when the appointment duration expires (default 30 minutes).
 * - Outside this window, joining is strictly prohibited.
 */

export const parseAppointmentDateTime = (slotDate, slotTime) => {
  if (!slotDate || !slotTime) return null;

  let day, month, year;
  if (typeof slotDate === 'string' && slotDate.includes('_')) {
    const parts = slotDate.split('_').map((p) => parseInt(p, 10));
    if (parts.length >= 3) {
      day = parts[0];
      month = parts[1]; // 1-indexed (1 = Jan, 12 = Dec)
      year = parts[2];
    }
  } else if (typeof slotDate === 'string' && slotDate.includes('-')) {
    const parts = slotDate.split('-').map((p) => parseInt(p, 10));
    if (parts.length >= 3) {
      year = parts[0];
      month = parts[1];
      day = parts[2];
    }
  }

  if (!day || !month || !year || isNaN(day) || isNaN(month) || isNaN(year)) {
    return null;
  }

  let hours = 0;
  let minutes = 0;
  const timeStr = String(slotTime).trim();
  const match = timeStr.match(/^(\d{1,2}):(\d{2})(?:\s*([a-zA-Z]+))?$/i);

  if (match) {
    hours = parseInt(match[1], 10);
    minutes = parseInt(match[2], 10);
    const modifier = match[3] ? match[3].toUpperCase() : null;

    if (modifier === 'PM' && hours < 12) {
      hours += 12;
    } else if (modifier === 'AM' && hours === 12) {
      hours = 0;
    }
  } else {
    return null;
  }

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

export const formatTimeOnly = (date) => {
  if (!date || isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
};

/**
 * Calculates appointment window and UI eligibility state for Doctor view.
 *
 * @param {Object} appointment
 * @param {Date|number} [currentDate=new Date()]
 * @returns {Object}
 */
export const getAppointmentJoinStatus = (appointment, currentDate = new Date()) => {
  if (!appointment) {
    return {
      canJoin: false,
      status: 'INVALID',
      buttonText: 'Invalid Appointment',
      badgeText: 'Invalid',
      reason: 'Appointment details not available'
    };
  }

  if (appointment.cancelled) {
    return {
      canJoin: false,
      status: 'CANCELLED',
      buttonText: 'Cancelled',
      badgeText: 'Cancelled',
      reason: 'This appointment has been cancelled'
    };
  }

  if (appointment.isCompleted) {
    return {
      canJoin: false,
      status: 'COMPLETED',
      buttonText: 'Completed',
      badgeText: 'Completed',
      reason: 'This consultation is already completed'
    };
  }

  const startTime = parseAppointmentDateTime(appointment.slotDate, appointment.slotTime);
  if (!startTime || isNaN(startTime.getTime())) {
    return {
      canJoin: false,
      status: 'INVALID_TIME',
      buttonText: 'Join Unavailable',
      badgeText: 'Invalid Time',
      reason: 'Invalid appointment date or time'
    };
  }

  const durationMinutes = appointment.duration || 30;
  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
  const joinStartTime = new Date(startTime.getTime() - 10 * 60 * 1000); // 10 min before

  const now = currentDate instanceof Date ? currentDate.getTime() : new Date(currentDate).getTime();

  // 1. Before Join Window (more than 10 mins before start)
  if (now < joinStartTime.getTime()) {
    const formattedJoinTime = formatTimeOnly(joinStartTime);
    const formattedStartTime = formatTimeOnly(startTime);
    const msUntilOpen = joinStartTime.getTime() - now;
    return {
      canJoin: false,
      status: 'BEFORE_WINDOW',
      buttonText: `Available at ${formattedJoinTime}`,
      badgeText: `Opens at ${formattedJoinTime}`,
      joinStartTime,
      startTime,
      endTime,
      formattedJoinTime,
      formattedStartTime,
      msUntilOpen,
      reason: `Join window opens 10 minutes before scheduled start (at ${formattedJoinTime})`
    };
  }

  // 2. Active Join Window (between 10 mins before start and end time)
  if (now >= joinStartTime.getTime() && now <= endTime.getTime()) {
    return {
      canJoin: true,
      status: 'JOIN_WINDOW',
      buttonText: 'Join Consultation',
      badgeText: 'Session Open',
      joinStartTime,
      startTime,
      endTime,
      formattedJoinTime: formatTimeOnly(joinStartTime),
      formattedStartTime: formatTimeOnly(startTime),
      reason: 'Appointment is currently active and open for joining'
    };
  }

  // 3. After Appointment Ended
  return {
    canJoin: false,
    status: 'AFTER_WINDOW',
    buttonText: 'Appointment Ended',
    badgeText: 'Ended',
    joinStartTime,
    startTime,
    endTime,
    formattedJoinTime: formatTimeOnly(joinStartTime),
    formattedStartTime: formatTimeOnly(startTime),
    reason: 'The scheduled appointment time has ended'
  };
};
