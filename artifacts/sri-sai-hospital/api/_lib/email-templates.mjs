import { formatSlotTime } from './appointments.mjs';

const hospitalAddress = 'Back Side of Padhma sri Function Hall, 34-10-4, Somanchi Vari Street, Sajjapuram, Andhra Pradesh 534211.';

export function doctorEmail(appointment) {
  return {
    subject: 'New appointment booking for Dr. Sritha',
    text: [
      'A new appointment has been booked with Dr. Sritha.',
      '',
      `Patient: ${appointment.patientName}`,
      `Phone: ${appointment.phone}`,
      `Email: ${appointment.email}`,
      `Date: ${appointment.date}`,
      `Time: ${formatSlotTime(appointment.slot.start)} - ${formatSlotTime(appointment.slot.end)} (Asia/Kolkata)`,
      `Reason for visit: ${appointment.reason || 'Not provided'}`,
    ].join('\n'),
  };
}

export function patientEmail(appointment) {
  return {
    subject: 'Your appointment with Dr. Sritha is confirmed',
    text: [
      `Hello ${appointment.patientName},`,
      '',
      'Your appointment with Dr. Sritha is confirmed.',
      `Date: ${appointment.date}`,
      `Time: ${formatSlotTime(appointment.slot.start)} - ${formatSlotTime(appointment.slot.end)} (Asia/Kolkata)`,
      '',
      `Address: ${hospitalAddress}`,
      '',
      'We look forward to seeing you.',
    ].join('\n'),
  };
}
