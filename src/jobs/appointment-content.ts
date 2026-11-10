import { DateTime } from 'luxon';
import { APP_TIMEZONE } from '../common/constants';
import type { MailMessage } from '../mail/mail.transport';
import type { AppointmentInfo, RecipientRole } from './appointment-info';
import type { AppointmentTemplate } from './appointment-templates';

export interface Rendered {
  title: string;
  subject: string;
  paragraphs: string[];
}

const doctorLabel = (name: string): string => (/^dr\.?\s/i.test(name) ? name : `Dr ${name}`);

const CANCELLED_BY = {
  PATIENT: 'par le patient',
  DOCTOR: 'par le médecin',
  ADMIN: "par l'administration",
} as const;

export function renderAppointment(
  template: AppointmentTemplate,
  info: AppointmentInfo,
  role: RecipientRole,
): Rendered {
  const when = DateTime.fromJSDate(info.startAt, { zone: APP_TIMEZONE }).setLocale('fr');
  const date = when.toFormat('cccc d LLLL yyyy');
  const time = when.toFormat("HH'h'mm");
  const doctor = doctorLabel(info.doctor.user.name);
  const patient = info.patient.name;
  const clinic = info.doctor.clinic.name;

  switch (template) {
    case 'appointment.booked':
      if (role === 'patient') {
        return {
          title: 'Rendez-vous confirmé',
          subject: `Rendez-vous confirmé le ${date} à ${time}`,
          paragraphs: [
            `Votre rendez-vous avec ${doctor} est confirmé le ${date} à ${time} (${clinic}).`,
            "Vous pouvez l'annuler jusqu'à 24 heures avant l'heure prévue.",
          ],
        };
      }
      return {
        title: 'Nouveau rendez-vous',
        subject: `Nouveau rendez-vous le ${date} à ${time}`,
        paragraphs: [
          `${patient} a réservé un rendez-vous le ${date} à ${time}.`,
          ...(info.reason ? [`Motif : ${info.reason}`] : []),
        ],
      };

    case 'appointment.cancelled': {
      const other = role === 'patient' ? doctor : patient;
      const by = info.cancelledByRole ? ` ${CANCELLED_BY[info.cancelledByRole]}` : '';
      return {
        title: 'Rendez-vous annulé',
        subject: `Rendez-vous annulé : ${date} à ${time}`,
        paragraphs: [
          `Le rendez-vous du ${date} à ${time} avec ${other} a été annulé${by}.`,
          ...(info.cancellationReason ? [`Motif : ${info.cancellationReason}`] : []),
        ],
      };
    }

    case 'appointment.reminder_24h':
      return {
        title: 'Rappel de rendez-vous',
        subject: `Rappel : votre rendez-vous demain à ${time}`,
        paragraphs: [
          `Nous vous rappelons votre rendez-vous avec ${doctor} demain, ${date} à ${time} (${clinic}).`,
        ],
      };

    case 'appointment.reminder_1h':
      return {
        title: 'Rendez-vous dans une heure',
        subject: `Rappel : votre rendez-vous dans une heure (${time})`,
        paragraphs: [
          `Votre rendez-vous avec ${doctor} commence dans une heure, à ${time} (${clinic}).`,
        ],
      };
  }
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export function composeEmail(rendered: Rendered, recipientName: string, to: string): MailMessage {
  const text = [
    `Bonjour ${recipientName},`,
    '',
    ...rendered.paragraphs.flatMap((paragraph) => [paragraph, '']),
    "L'équipe Doctor Booking",
  ].join('\n');

  const html =
    `<p>Bonjour ${escapeHtml(recipientName)},</p>` +
    rendered.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('') +
    "<p>L'équipe Doctor Booking</p>";

  return { to, subject: rendered.subject, text, html };
}
