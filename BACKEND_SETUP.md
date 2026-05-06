# Wimera Backend Setup Guide

## What was built

| File | Purpose |
|---|---|
| `src/lib/firebase.ts` | Firebase app init — exports `auth` and `db` |
| `src/lib/auth.ts` | Sign-in, sign-out, create auth user, auth state listener |
| `src/lib/firestoreService.ts` | All CRUD + real-time `onSnapshot` listeners for every collection |
| `src/components/providers/AppProvider.tsx` | Replaced — now uses Firebase Auth + Firestore instead of `useState` |
| `firestore.rules` | Full security rules covering all 10 collections + multi-tenant isolation |
| `scripts/seedFirestore.ts` | One-time migration of INITIAL_* seed data into Firestore |
| `src/app/api/users/route.ts` | Server-side API route for creating/deleting Firebase Auth accounts |

---

## Step 1 — Install packages

```bash
npm install firebase firebase-admin
```

---

## Step 2 — Copy the new files into your project

Replace / create these files in your codebase:

```
src/lib/firebase.ts                         ← new
src/lib/auth.ts                             ← new
src/lib/firestoreService.ts                 ← new
src/components/providers/AppProvider.tsx    ← replace existing
firestore.rules                             ← replace existing
src/app/api/users/route.ts                  ← new
scripts/seedFirestore.ts                    ← new
```

---

## Step 3 — Enable Firebase Authentication

1. Go to [Firebase Console](https://console.firebase.google.com/) → your project
2. Authentication → Get Started → Sign-in method
3. Enable **Email/Password**

---

## Step 4 — Deploy Firestore rules

```bash
npm install -g firebase-tools   # if not already installed
firebase login
firebase deploy --only firestore:rules
```

---

## Step 5 — Run the seed script (one-time)

This creates all users in Firebase Auth and writes the seed data to Firestore.

### Get a service account key
1. Firebase Console → Project Settings → Service accounts
2. Click "Generate new private key" → download the JSON file

### Run the seed
```bash
export FIREBASE_SERVICE_ACCOUNT=$(cat /path/to/your-service-account.json)
npx tsx scripts/seedFirestore.ts
```

The script will output a **CLIENT_ID** — save it. It's the Firestore document ID
for your client, e.g. `clients/AbCdEfGhIj/...`

---

## Step 6 — Set environment variables

Create `.env.local` in your project root:

```bash
# Firebase Admin SDK (server-side, never exposed to browser)
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

The client-side Firebase config is already hardcoded in `src/lib/firebase.ts`
(it's public — Firebase API keys are safe to expose; rules protect your data).

---

## Step 7 — Fix `addUser` in your pages

The old `addUser(data)` in AppProvider no longer works. The new flow has two steps:

```ts
// In your admin/users page, replace addUser() calls with:
import { createAuthUser } from "@/lib/auth"
import { createUserProfile } from "@/lib/firestoreService"

// Option A: call the /api/users route (recommended — handles Auth server-side)
const res = await fetch("/api/users", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${await getIdToken()}`,
  },
  body: JSON.stringify({
    email, password, displayName: name,
    clientId, role, name, plant, department,
  }),
})

// Option B: client-side only (works but can't delete Auth accounts later)
const result = await createAuthUser(email, password)
if ("error" in result) { /* show error */ return }
await createUserProfile(clientId, result.uid, { name, email, role, plant, department, createdAt: "" })
```

To get the current user's ID token for the Authorization header:
```ts
import { auth } from "@/lib/firebase"
const token = await auth.currentUser?.getIdToken()
```

---

## Step 8 — Update login page

The `login()` function in AppProvider now returns a Promise. Update any login
page that calls it:

```ts
// Before (synchronous)
const result = login(email, password)

// After (async)
const result = await login(email, password)
```

---

## Data structure in Firestore

```
/users/{uid}                         ← system admin profiles
/user_index/{uid}                    ← { clientId } index for all client users
/clients/{clientId}/
    users/{uid}
    raw_materials/{id}
    schedules/{id}
    ptcs/{id}
    work_orders/{id}
    daily_entries/{id}
    process_records/{id}
    downtime_events/{id}
    qi_inspections/{id}
    fqi_inspections/{id}
```

---

## What's NOT done (future work)

- **Deleting Auth accounts**: The DELETE `/api/users` route handles this server-side.
  The Firestore profile is deleted client-side by `deleteUserProfile()` in AppProvider.
- **Email verification**: `auth.ts` exports `isEmailVerified()` check — wire up if needed.
- **File storage**: If you need to store attachments, add Firebase Storage.
- **Composite Firestore indexes**: If you filter + orderBy on multiple fields, you'll
  get a console error with a link to create the index — click it.
- **Firestore Emulator**: For local dev without hitting production:
  ```bash
  firebase emulators:start --only firestore,auth
  ```
  Then add to `firebase.ts`:
  ```ts
  if (process.env.NODE_ENV === "development") {
    connectFirestoreEmulator(db, "localhost", 8080)
    connectAuthEmulator(auth, "http://localhost:9099")
  }
  ```
