import type { PartnerId } from '../types/finance';

export const SHARED_COUPLE_HOUSEHOLD_ID = 'duo-angel-silvia';

export const AUTHORIZED_COUPLE_EMAILS: [string, string] = [
  'angel2martinez92@gmail.com',
  'silviamsg27@gmail.com',
];

export interface AuthorizedPartnerConfig {
  id: PartnerId;
  email: string;
  name: string;
  initials: string;
  accentHex: string;
}

export const AUTHORIZED_PARTNERS: Record<PartnerId, AuthorizedPartnerConfig> = {
  partnerA: {
    id: 'partnerA',
    email: AUTHORIZED_COUPLE_EMAILS[0],
    name: 'Ángel',
    initials: 'AN',
    accentHex: '#10B981',
  },
  partnerB: {
    id: 'partnerB',
    email: AUTHORIZED_COUPLE_EMAILS[1],
    name: 'Silvia',
    initials: 'SI',
    accentHex: '#38BDF8',
  },
};

export interface AuthorizedPartnerMatch {
  householdId: string;
  partnerSlot: PartnerId;
  email: string;
  defaultName: string;
  defaultInitials: string;
  accentHex: string;
}

export type AuthSessionEvaluation =
  | { status: 'unauthenticated' }
  | { status: 'unverified'; email: string }
  | { status: 'unauthorized'; email: string }
  | {
      status: 'authenticated';
      email: string;
      partnerSlot: PartnerId;
      householdId: string;
    };

export function normalizeEmail(email: string | null | undefined): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function isAuthorizedCoupleEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  return (
    normalized === AUTHORIZED_COUPLE_EMAILS[0] ||
    normalized === AUTHORIZED_COUPLE_EMAILS[1]
  );
}

export function resolveAuthorizedPartner(
  email: string | null | undefined
): AuthorizedPartnerMatch | null {
  const normalized = normalizeEmail(email);
  if (normalized === AUTHORIZED_PARTNERS.partnerA.email) {
    return {
      householdId: SHARED_COUPLE_HOUSEHOLD_ID,
      partnerSlot: 'partnerA',
      email: AUTHORIZED_PARTNERS.partnerA.email,
      defaultName: AUTHORIZED_PARTNERS.partnerA.name,
      defaultInitials: AUTHORIZED_PARTNERS.partnerA.initials,
      accentHex: AUTHORIZED_PARTNERS.partnerA.accentHex,
    };
  }
  if (normalized === AUTHORIZED_PARTNERS.partnerB.email) {
    return {
      householdId: SHARED_COUPLE_HOUSEHOLD_ID,
      partnerSlot: 'partnerB',
      email: AUTHORIZED_PARTNERS.partnerB.email,
      defaultName: AUTHORIZED_PARTNERS.partnerB.name,
      defaultInitials: AUTHORIZED_PARTNERS.partnerB.initials,
      accentHex: AUTHORIZED_PARTNERS.partnerB.accentHex,
    };
  }
  return null;
}

export function evaluateAuthSession(
  user: { email?: string | null; emailVerified?: boolean } | null
): AuthSessionEvaluation {
  if (!user) {
    return { status: 'unauthenticated' };
  }
  const normalized = normalizeEmail(user.email);
  if (!normalized) {
    return { status: 'unauthenticated' };
  }
  const match = resolveAuthorizedPartner(normalized);
  if (!match) {
    return { status: 'unauthorized', email: normalized };
  }
  if (!user.emailVerified) {
    return { status: 'unverified', email: normalized };
  }
  return {
    status: 'authenticated',
    email: match.email,
    partnerSlot: match.partnerSlot,
    householdId: match.householdId,
  };
}

export function buildUnauthorizedEmailMessage(email: string): string {
  const clean = normalizeEmail(email);
  return `La cuenta "${clean}" no está autorizada para acceder a esta app privada. Inicia sesión con una de las dos cuentas de usuario configuradas.`;
}
