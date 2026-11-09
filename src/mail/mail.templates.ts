import { OTP_TTL_SECONDS } from '../common/constants';
import type { MailMessage } from './mail.transport';

export type OtpPurpose = 'register' | 'login';

export function otpMessage(to: string, code: string, purpose: OtpPurpose): MailMessage {
  const minutes = Math.round(OTP_TTL_SECONDS / 60);
  const subject =
    purpose === 'register' ? 'Confirmez votre adresse e-mail' : 'Votre code de connexion';
  const intro =
    purpose === 'register'
      ? 'Bienvenue sur Doctor Booking. Voici votre code pour confirmer votre adresse e-mail :'
      : 'Voici votre code de connexion à Doctor Booking :';
  const validity = `Ce code est valable ${minutes} minutes et ne peut être utilisé qu'une seule fois.`;
  const ignore = "Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message.";

  const text = [
    'Bonjour,',
    '',
    intro,
    '',
    code,
    '',
    validity,
    ignore,
    '',
    "L'équipe Doctor Booking",
  ].join('\n');

  // The code is digits only, so nothing user-supplied is interpolated into the HTML.
  const html =
    `<p>Bonjour,</p><p>${intro}</p>` +
    `<p style="font-size:24px;letter-spacing:4px"><strong>${code}</strong></p>` +
    `<p>${validity}</p><p>${ignore}</p><p>L'équipe Doctor Booking</p>`;

  return { to, subject, text, html };
}
