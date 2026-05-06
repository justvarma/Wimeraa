# Security Specification - Wimera Systems Inventory

## Data Invariants
1. Users must have a profile in the `users` collection to access the dashboard.
2. Only `superadmin` role can approve material requests.
3. `storekeeper` can only create materials with `pending_approval` status.
4. Document IDs must be valid strings.

## The Dirty Dozen Payloads (Target: raw_materials)

1. **Identity Spoofing**: A storekeeper tries to create a material marking it as `approved`.
2. **Access Violation**: A storekeeper tries to update a material's name after it was approved.
3. **Privilege Escalation**: A storekeeper tries to change their own role to `superadmin`.
4. **Unauthorized Read**: An unauthenticated user tries to list all materials.
5. **PII Leak**: A storekeeper tries to read the full user profile of another user.
6. **Malicious ID**: Using a 2KB string as a document ID.
7. **Type Mismatch**: Sending `quantity` as a string instead of a number.
8. **Field Injection**: Adding a `ghostField` to a material document.
9. **Timestamp Fraud**: Providing a manual `createdAt` string instead of `serverTimestamp`.
10. **Role Bypass**: A guest user tries to create a material.
11. **State Shortcut**: Updating a `rejected` material directly to `approved` without going through `pending`.
12. **Admin Spoofing**: Trying to create a document in the `admins` collection (if it existed) or modifying the `users` profile to add custom claims (not possible via client but check rules).

## Test Runner
Testing is performed via security logic blocks in `firestore.rules`.
