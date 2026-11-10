export const APPOINTMENT_TEMPLATES = [
  'appointment.booked',
  'appointment.cancelled',
  'appointment.reminder_24h',
  'appointment.reminder_1h',
] as const;

export type AppointmentTemplate = (typeof APPOINTMENT_TEMPLATES)[number];
