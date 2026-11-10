export const AUDIT_ACTIONS = {
  USER_DEACTIVATED: 'user.deactivated',
  USER_REACTIVATED: 'user.reactivated',
  APPOINTMENT_CANCELLED_BY_ADMIN: 'appointment.cancelled_by_admin',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
