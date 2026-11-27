# Security Specification — Dúo (Finanzas en Pareja)

## 1. Data Invariants & Relationship Mapping
- **Master Source of Truth**: `/households/{householdId}` owns all shared bank account data (`transactions`, `categories`, `fixedExpenses`).
- **PII Isolation**: `/users/{userId}` stores personal preferences & email strictly readable/writable only by `request.auth.uid == userId`. No `list` access exists on `/users` or `/households`.
- **Per-User Profile Protection**: Inside `/households/{householdId}`, Partner A can only modify Partner A's profile fields (`partnerAName`, `partnerAInitials`) and Partner B can only modify Partner B's profile fields (`partnerBName`, `partnerBInitials`). Neither can edit the other partner's settings.
- **Verified Identity**: Every operation requires `request.auth != null && request.auth.token.email_verified == true`.
- **Temporal & Ownership Integrity**: `createdAt == request.time` on create and is immutable on update; `updatedAt == request.time` on create/update; `authorUid == request.auth.uid` on transaction create and is immutable on update.
- **Secure List Queries**: Subcollection `allow list` rules inspect `resource.data.allowedEmails` directly without any `get()` or `exists()` lookups.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated read**: Unauthenticated user tries `get` on `/households/duo-cuenta-principal` -> DENIED.
2. **Unverified email spoof**: Authenticated user with `email: 'gelo.mm92@gmail.com'` and `email_verified: false` tries `get` -> DENIED.
3. **Cross-user PII read**: Partner A tries `get` on `/users/{partnerBUid}` -> DENIED.
4. **Cross-partner profile hijack**: Partner A attempts to update `partnerBName` on `/households/duo-cuenta-principal` -> DENIED.
5. **Shadow field injection**: Partner A creates a transaction with ghost field `isAdmin: true` -> DENIED (`hasOnly` check).
6. **Author UID spoofing**: Partner A creates a transaction with `authorUid: partnerBUid` -> DENIED (`authorUid == request.auth.uid`).
7. **Client timestamp forgery**: Partner A creates a transaction with backdated `createdAt` instead of `request.time` -> DENIED.
8. **Immutable field tampering**: Partner A updates a transaction trying to alter `createdAt` or `authorUid` -> DENIED (`affectedKeys().hasOnly(...)`).
9. **ID poisoning**: Partner A creates a transaction with 200-char or slash-injected ID -> DENIED (`isValidId`).
10. **Amount / type poisoning**: Partner A updates transaction `amount` to `-50` or string `"100"` -> DENIED (`isValidTransaction`).
11. **Unbounded array DoW**: Partner A creates a category with 50 items in `defaultConcepts` -> DENIED (`size() <= 20`).
12. **Blanket list scraping**: Unauthorized user executes `list` on `/households/duo-cuenta-principal/transactions` -> DENIED (`request.auth.token.email in resource.data.allowedEmails`).
