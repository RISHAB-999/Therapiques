import appointmentModel from '../models/appointmentModel.js';
import doctorModel from '../models/doctorModel.js';
import userModel from '../models/userModel.js';
import { parseAppointmentDateTime } from '../utils/appointmentTiming.js';
import {
  sendAppointmentTenMinReminderPatient,
  sendAppointmentTenMinReminderDoctor
} from './emailService.js';

let reminderInterval = null;

/**
 * Checks upcoming appointments and sends automated 10-minute pre-join reminders
 * to both patient and doctor.
 */
export const checkAndSendAppointmentReminders = async () => {
  try {
    const now = Date.now();

    // Query active non-cancelled, non-completed appointments that haven't received reminder
    const upcomingAppointments = await appointmentModel.find({
      cancelled: false,
      isCompleted: false,
      reminderSent: { $ne: true }
    });

    if (!upcomingAppointments || upcomingAppointments.length === 0) return;

    for (const appointment of upcomingAppointments) {
      const startTime = parseAppointmentDateTime(appointment.slotDate, appointment.slotTime);
      if (!startTime || isNaN(startTime.getTime())) continue;

      const timeDiffMs = startTime.getTime() - now;
      const minutesUntilStart = timeDiffMs / (60 * 1000);

      // Check if we are in the 10-minute window before the appointment
      // (Trigger when minutesUntilStart <= 10.5 minutes and appointment is not expired, e.g. within session duration)
      const duration = appointment.duration || 30;
      if (minutesUntilStart <= 10.5 && minutesUntilStart >= -duration) {
        console.log(`[Appointment Reminder] Triggering 10-min reminder for appointment: ${appointment._id} (${appointment.slotDate} @ ${appointment.slotTime})`);

        // Fetch fresh email addresses if needed
        let patientEmail = appointment.userData?.email;
        let doctorEmail = appointment.docData?.email;

        if (!patientEmail && appointment.userId) {
          const user = await userModel.findById(appointment.userId).select('email name');
          if (user) patientEmail = user.email;
        }

        if (!doctorEmail && appointment.docId) {
          const doc = await doctorModel.findById(appointment.docId).select('email name');
          if (doc) doctorEmail = doc.email;
        }

        // Mark reminderSent immediately to avoid race conditions or double sends
        await appointmentModel.findByIdAndUpdate(appointment._id, { reminderSent: true });

        // 1. Send Email to Patient
        if (patientEmail) {
          sendAppointmentTenMinReminderPatient({
            appointmentId: appointment._id,
            patientEmail,
            patientName: appointment.userData?.name || 'Patient',
            doctorName: appointment.docData?.name || 'Doctor',
            doctorSpeciality: appointment.docData?.speciality,
            slotDate: appointment.slotDate,
            slotTime: appointment.slotTime
          }).catch((err) => console.log(`[Reminder Error] Patient email failed for ${appointment._id}:`, err.message));
        }

        // 2. Send Email to Doctor
        if (doctorEmail) {
          sendAppointmentTenMinReminderDoctor({
            appointmentId: appointment._id,
            doctorEmail,
            doctorName: appointment.docData?.name || 'Doctor',
            patientName: appointment.userData?.name || 'Patient',
            slotDate: appointment.slotDate,
            slotTime: appointment.slotTime
          }).catch((err) => console.log(`[Reminder Error] Doctor email failed for ${appointment._id}:`, err.message));
        }
      }
    }
  } catch (error) {
    console.error('[Appointment Reminder Service Error]:', error.message);
  }
};

/**
 * Starts the background appointment reminder runner.
 * Checks every 45 seconds.
 */
export const startAppointmentReminderService = () => {
  if (reminderInterval) return;

  console.log('[Appointment Reminder Service] Started background runner (polling every 45s)');
  
  // Run initial check after 5 seconds
  setTimeout(checkAndSendAppointmentReminders, 5000);

  // Poll every 45 seconds
  reminderInterval = setInterval(checkAndSendAppointmentReminders, 45000);
};

export const stopAppointmentReminderService = () => {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    console.log('[Appointment Reminder Service] Stopped background runner');
  }
};
