import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTHORIZED_COUPLE_EMAILS,
  SHARED_COUPLE_HOUSEHOLD_ID,
  buildUnauthorizedEmailMessage,
  evaluateAuthSession,
  isAuthorizedCoupleEmail,
  normalizeEmail,
  resolveAuthorizedPartner,
} from './authPolicy';

describe('Authorized Couple Auth Policy', () => {
  it('normalizes whitespace and casing cleanly', () => {
    assert.equal(normalizeEmail('  Angel2Martinez92@Gmail.com  '), 'angel2martinez92@gmail.com');
    assert.equal(normalizeEmail('  SILVIAMSG27@GMAIL.COM'), 'silviamsg27@gmail.com');
    assert.equal(normalizeEmail(null), '');
    assert.equal(normalizeEmail(undefined), '');
  });

  it('authorizes both configured user accounts and maps them to the same shared household', () => {
    assert.deepEqual(AUTHORIZED_COUPLE_EMAILS, [
      'angel2martinez92@gmail.com',
      'silviamsg27@gmail.com',
    ]);

    assert.equal(isAuthorizedCoupleEmail('angel2martinez92@gmail.com'), true);
    assert.equal(isAuthorizedCoupleEmail('  SILVIAMSG27@GMAIL.COM '), true);

    const partnerA = resolveAuthorizedPartner('Angel2Martinez92@gmail.com');
    const partnerB = resolveAuthorizedPartner('silviamsg27@gmail.com');

    assert.ok(partnerA);
    assert.ok(partnerB);
    assert.equal(partnerA.partnerSlot, 'partnerA');
    assert.equal(partnerA.defaultName, 'Ángel');
    assert.equal(partnerB.partnerSlot, 'partnerB');
    assert.equal(partnerB.defaultName, 'Silvia');
    assert.equal(partnerA.householdId, SHARED_COUPLE_HOUSEHOLD_ID);
    assert.equal(partnerB.householdId, SHARED_COUPLE_HOUSEHOLD_ID);
  });

  it('rejects any unauthorized email addresses', () => {
    assert.equal(isAuthorizedCoupleEmail('gelo.mm92@gmail.com'), false);
    assert.equal(isAuthorizedCoupleEmail('marcos.pareja@gmail.com'), false);
    assert.equal(isAuthorizedCoupleEmail('otro@gmail.com'), false);
    assert.equal(isAuthorizedCoupleEmail(''), false);
    assert.equal(resolveAuthorizedPartner('otro@gmail.com'), null);
  });

  it('evaluates Firebase Auth sessions deterministically across all states', () => {
    assert.deepEqual(evaluateAuthSession(null), { status: 'unauthenticated' });

    assert.deepEqual(
      evaluateAuthSession({ email: 'angel2martinez92@gmail.com', emailVerified: true }),
      {
        status: 'authenticated',
        email: 'angel2martinez92@gmail.com',
        partnerSlot: 'partnerA',
        householdId: SHARED_COUPLE_HOUSEHOLD_ID,
      }
    );

    assert.deepEqual(
      evaluateAuthSession({ email: 'SILVIAMSG27@gmail.com', emailVerified: true }),
      {
        status: 'authenticated',
        email: 'silviamsg27@gmail.com',
        partnerSlot: 'partnerB',
        householdId: SHARED_COUPLE_HOUSEHOLD_ID,
      }
    );

    assert.deepEqual(
      evaluateAuthSession({ email: 'angel2martinez92@gmail.com', emailVerified: false }),
      {
        status: 'unverified',
        email: 'angel2martinez92@gmail.com',
      }
    );

    assert.deepEqual(
      evaluateAuthSession({ email: 'intruso@gmail.com', emailVerified: true }),
      {
        status: 'unauthorized',
        email: 'intruso@gmail.com',
      }
    );
  });

  it('formats a clear Spanish rejection message without exposing authorized emails', () => {
    const msg = buildUnauthorizedEmailMessage('Otro@Gmail.com');
    assert.match(msg, /otro@gmail\.com/);
    assert.match(msg, /no está autorizada/i);
    assert.ok(!msg.includes('angel2martinez92@gmail.com'));
    assert.ok(!msg.includes('silviamsg27@gmail.com'));
  });
});
