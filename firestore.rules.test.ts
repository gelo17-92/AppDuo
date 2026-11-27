import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');

const rulesSource = fs.readFileSync(rulesPath, 'utf8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));

describe('Firestore Security Rules & Blueprint Invariants', () => {
  it('enforces rules_version 2 and a global default-deny catch-all', () => {
    assert.match(rulesSource, /rules_version\s*=\s*'2';/);
    assert.match(
      rulesSource,
      /match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/
    );
  });

  it('requires verified email authentication (isVerifiedUser) restricted to the two authorized couple accounts', () => {
    assert.match(rulesSource, /function\s+isAuthorizedCoupleEmail\(\)/);
    assert.match(rulesSource, /angel2martinez92@gmail\.com/);
    assert.match(rulesSource, /silviamsg27@gmail\.com/);
    assert.match(rulesSource, /duo-angel-silvia/);
    assert.match(rulesSource, /function\s+isVerifiedUser\(\)/);
    assert.match(rulesSource, /request\.auth\.token\.email_verified\s*==\s*true/);
    assert.match(rulesSource, /request\.auth\.token\.email\s+is\s+string/);
    assert.match(rulesSource, /isAuthorizedCoupleEmail\(\)/);
  });

  it('enforces strict document ID validation and bounded lists/strings', () => {
    assert.match(rulesSource, /function\s+isValidId\(id\)/);
    assert.match(rulesSource, /id\.matches\('\^\[a-zA-Z0-9_\\\\-\]\+\$'\)/);
    assert.match(rulesSource, /function\s+isValidAllowedEmails\(arr\)/);
    assert.match(rulesSource, /arr\.size\(\)\s*<=\s*2/);
    assert.match(rulesSource, /function\s+isValidConceptsList\(arr\)/);
    assert.match(rulesSource, /arr\.size\(\)\s*<=\s*20/);
    assert.match(rulesSource, /function\s+isValidMonthlyAmountMap\(m\)/);
    assert.match(rulesSource, /m\.size\(\)\s*<=\s*120/);
    assert.ok(rulesSource.includes("'amountSchedule'"));
    assert.ok(rulesSource.includes("'manualMonthlyAmounts'"));
  });

  it('enforces strict hasAll + hasOnly schema validation for all 5 blueprint entities', () => {
    const validators = [
      'isValidUserProfile',
      'isValidHousehold',
      'isValidTransaction',
      'isValidCategory',
      'isValidFixedExpense',
    ];
    for (const fnName of validators) {
      assert.ok(
        rulesSource.includes(`function ${fnName}(`),
        `Missing validator ${fnName} in firestore.rules`
      );
    }

    // Ensure every entity defined in firebase-blueprint.json has required fields matched
    const entityKeys = Object.keys(blueprint.entities);
    assert.deepEqual(
      entityKeys.sort(),
      ['Category', 'FixedExpense', 'Household', 'Transaction', 'UserProfile']
    );
    for (const entityName of entityKeys) {
      const requiredFields: string[] = blueprint.entities[entityName].required;
      assert.ok(requiredFields.length > 0, `${entityName} must declare required fields`);
      for (const field of requiredFields) {
        assert.ok(
          rulesSource.includes(`'${field}'`),
          `Required field '${field}' from ${entityName} not referenced in firestore.rules`
        );
      }
    }
  });

  it('isolates /users/{userId} PII to owner-only with list and delete denied', () => {
    const usersBlockMatch = rulesSource.match(
      /match\s+\/users\/\{userId\}\s*\{[\s\S]*?allow\s+delete:\s*if\s+false;\s*\}/
    );
    assert.ok(usersBlockMatch, 'Missing /users/{userId} match block');
    const block = usersBlockMatch[0];
    assert.match(block, /allow\s+get:[\s\S]*request\.auth\.uid\s*==\s*userId/);
    assert.match(block, /allow\s+list:\s*if\s+false;/);
    assert.match(block, /allow\s+delete:\s*if\s+false;/);
    assert.match(block, /affectedKeys\(\)\.hasOnly\(\[/);
  });

  it('protects per-partner settings on /households/{householdId} (cannot edit other partner or drop members)', () => {
    assert.match(rulesSource, /match\s+\/households\/\{householdId\}/);
    assert.match(rulesSource, /'partnerAName',\s*'partnerAInitials',\s*'updatedAt'/);
    assert.match(rulesSource, /'partnerBName',\s*'partnerBInitials',\s*'updatedAt'/);
    assert.match(rulesSource, /incoming\(\)\.memberUids\.hasAll\(existing\(\)\.memberUids\)/);
    assert.match(rulesSource, /incoming\(\)\.ownerUid\s*==\s*existing\(\)\.ownerUid/);
    assert.match(rulesSource, /incoming\(\)\.allowedEmails\s*==\s*existing\(\)\.allowedEmails/);
  });

  it('keeps allow list rules zero-get() on subcollections and validates ownership on create', () => {
    const subcollections = ['transactions', 'categories', 'fixedExpenses'];
    for (const sub of subcollections) {
      const re = new RegExp(`match\\s+\\/${sub}\\/\\{[^}]+\\}\\s*\\{[\\s\\S]*?allow\\s+list:([^;]+);`);
      const m = rulesSource.match(re);
      assert.ok(m, `Missing allow list rule for ${sub}`);
      assert.ok(
        !m[1].includes('get(') && !m[1].includes('exists('),
        `allow list for ${sub} must not call get() or exists()`
      );
      assert.match(
        m[1],
        /userEmail\(\)\s+in\s+existing\(\)\.allowedEmails/,
        `allow list for ${sub} must enforce allowedEmails filter`
      );
    }
    assert.match(rulesSource, /matchesHouseholdOwnership\(householdId,\s*incoming\(\)\)/);
    assert.match(rulesSource, /resource\s*==\s*null/);
  });

  it('enforces temporal integrity with serverTimestamp (request.time) and immutable createdAt', () => {
    assert.match(rulesSource, /incoming\(\)\.createdAt\s*==\s*request\.time/);
    assert.match(rulesSource, /incoming\(\)\.updatedAt\s*==\s*request\.time/);
    assert.match(rulesSource, /incoming\(\)\.createdAt\s*==\s*existing\(\)\.createdAt/);
  });
});
