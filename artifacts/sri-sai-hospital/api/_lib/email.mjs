import nodemailer from 'nodemailer';
import { doctorEmail, patientEmail } from './email-templates.mjs';

export async function sendAppointmentEmails(appointment) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD, DOCTOR_EMAIL } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !DOCTOR_EMAIL) {
    throw new Error('Email service is not configured.');
  }
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  const doctorMessage = doctorEmail(appointment);
  const patientMessage = patientEmail(appointment);

  // The doctor must be notified first: if this fails the booking is rolled back,
  // and the patient has not yet been told it is confirmed.
  await transporter.sendMail({ from: GMAIL_USER, to: DOCTOR_EMAIL, ...doctorMessage });

  try {
    await transporter.sendMail({ from: GMAIL_USER, to: appointment.email, ...patientMessage });
    return { patientEmailSent: true };
  } catch {
    return { patientEmailSent: false };
  }
}
