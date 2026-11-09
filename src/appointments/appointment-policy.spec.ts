import { describe, expect, it } from 'vitest';
import { AppointmentStatus } from '../generated/prisma/enums';
import { canTransition, isTerminal, patientMayCancel } from './appointment-policy';

describe('appointment policy', () => {
  it('lets a confirmed appointment be cancelled, completed or marked no-show', () => {
    expect(canTransition('CONFIRMED', 'CANCELLED')).toBe(true);
    expect(canTransition('CONFIRMED', 'COMPLETED')).toBe(true);
    expect(canTransition('CONFIRMED', 'NO_SHOW')).toBe(true);
    expect(canTransition('CONFIRMED', 'CONFIRMED')).toBe(false);
  });

  it('never leaves a terminal state', () => {
    for (const from of ['CANCELLED', 'COMPLETED', 'NO_SHOW'] as const) {
      expect(isTerminal(from)).toBe(true);
      for (const to of Object.values(AppointmentStatus)) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it('requires 24 hours of notice from patients, to the millisecond', () => {
    const now = new Date('2026-11-09T10:00:00.000Z');
    const exactly = new Date(now.getTime() + 24 * 3_600_000);
    expect(patientMayCancel(exactly, now)).toBe(true);
    expect(patientMayCancel(new Date(exactly.getTime() - 1), now)).toBe(false);
  });
});
