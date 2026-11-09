import { PATIENT_CANCEL_CUTOFF_HOURS } from '../common/constants';
import { AppointmentStatus } from '../generated/prisma/enums';

const ALLOWED: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  CONFIRMED: ['CANCELLED', 'COMPLETED', 'NO_SHOW'],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function isTerminal(status: AppointmentStatus): boolean {
  return ALLOWED[status].length === 0;
}

/** Patients must cancel at least PATIENT_CANCEL_CUTOFF_HOURS before the start. */
export function patientMayCancel(startAt: Date, now: Date): boolean {
  return startAt.getTime() - now.getTime() >= PATIENT_CANCEL_CUTOFF_HOURS * 3_600_000;
}
