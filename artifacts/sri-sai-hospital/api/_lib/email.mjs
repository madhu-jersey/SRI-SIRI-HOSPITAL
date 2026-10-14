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

  const results = await Promise.allSettled([
    transporter.sendMail({ from: GMAIL_USER, to: DOCTOR_EMAIL, ...doctorMessage }),
    transporter.sendMail({ from: GMAIL_USER, to: appointment.email, ...patientMessage }),
  ]);
  if (results.some((result) => result.status === 'rejected')) {
    throw new Error('One or more appointment emails could not be sent.');
  }
}
