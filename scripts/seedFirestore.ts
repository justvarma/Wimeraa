/**
 * scripts/seedFirestore.ts
 * ─────────────────────────
 * One-time migration: writes all INITIAL_* seed data from store.ts into
 * Firestore under a new client document.
 *
 * Usage (run from project root after `npm install`):
 *
 *   npx ts-node --project tsconfig.json scripts/seedFirestore.ts
 *
 * Or with tsx:
 *   npx tsx scripts/seedFirestore.ts
 *
 * BEFORE RUNNING:
 *  1. Set GOOGLE_APPLICATION_CREDENTIALS to your Firebase service account JSON.
 *     OR set FIREBASE_SERVICE_ACCOUNT env var to the JSON string.
 *  2. Set CLIENT_NAME to identify this client (default: "Wimera Plant A")
 *
 * IMPORTANT: This script uses the Firebase Admin SDK so it bypasses
 * Firestore security rules. Run once, then delete or gate behind a flag.
 */

import * as admin from "firebase-admin"
import {
  INITIAL_USERS, INITIAL_MATERIALS, INITIAL_SCHEDULES, INITIAL_PTCS,
  INITIAL_WORK_ORDERS, INITIAL_DAILY_ENTRIES, INITIAL_PROCESS_RECORDS,
  INITIAL_DOWNTIME_EVENTS, INITIAL_QI_INSPECTIONS, INITIAL_FQI_INSPECTIONS,
} from "../src/lib/store"

// ─── Init Admin SDK ───────────────────────────────────────────────────────────

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);

admin.initializeApp({
  credential: serviceAccount
      ? admin.credential.cert(serviceAccount)
      : admin.credential.applicationDefault(),
  databaseURL: "https://gen-lang-client-0204242096.firebaseio.com",
})

const db = admin.firestore()

// ─── Config ───────────────────────────────────────────────────────────────────

const CLIENT_NAME = process.env.CLIENT_NAME ?? "Wimera Plant A"

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function seedCollection<T extends { id: string }>(
    colRef: admin.firestore.CollectionReference,
    items: T[],
    label: string,
) {
  const batch = db.batch()
  for (const item of items) {
    const { id, ...data } = item
    batch.set(colRef.doc(id), data)
  }
  await batch.commit()
  console.log(`  ✓  ${label}: ${items.length} documents`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🌱 Wimera Firestore Seed Script")
  console.log("================================")

  // 1. Create client document
  const clientRef = db.collection("clients").doc()
  const clientId  = clientRef.id
  await clientRef.set({
    name:         CLIENT_NAME,
    contactEmail: "admin@wimera.com",
    createdAt:    new Date().toISOString().split("T")[0],
  })
  console.log(`\n✅ Created client: "${CLIENT_NAME}" → clientId: ${clientId}`)

  const col = (name: string) => clientRef.collection(name)

  // 2. Seed sub-collections
  console.log("\nSeeding collections...")

  // Users — strip password before writing to Firestore
  const firestoreUsers = INITIAL_USERS.map(({ password: _pw, ...u }) => ({
    ...u,
    clientId, // attach clientId so fetchUserProfile can locate the client
  }))
  await seedCollection(col("users"), firestoreUsers as (typeof firestoreUsers[0] & { id: string })[], "users")

  // Also write user_index entries for each user
  const indexBatch = db.batch()
  for (const u of INITIAL_USERS) {
    indexBatch.set(db.collection("user_index").doc(u.id), { clientId })
  }
  await indexBatch.commit()
  console.log(`  ✓  user_index: ${INITIAL_USERS.length} entries`)

  await seedCollection(col("raw_materials"),  INITIAL_MATERIALS,       "raw_materials")
  await seedCollection(col("schedules"),       INITIAL_SCHEDULES,       "schedules")
  await seedCollection(col("ptcs"),            INITIAL_PTCS,            "ptcs")
  await seedCollection(col("work_orders"),     INITIAL_WORK_ORDERS,     "work_orders")
  await seedCollection(col("daily_entries"),   INITIAL_DAILY_ENTRIES,   "daily_entries")
  await seedCollection(col("process_records"), INITIAL_PROCESS_RECORDS, "process_records")
  await seedCollection(col("downtime_events"), INITIAL_DOWNTIME_EVENTS, "downtime_events")
  await seedCollection(col("qi_inspections"),  INITIAL_QI_INSPECTIONS,  "qi_inspections")
  await seedCollection(col("fqi_inspections"), INITIAL_FQI_INSPECTIONS, "fqi_inspections")

  // 3. Create Firebase Auth accounts for seed users
  console.log("\nCreating Firebase Auth accounts for seed users...")
  const seedPasswords: Record<string, string> = {
    "u-000": "wimera123",
    "u-001": "admin123",
    "u-002": "store123",
    "u-003": "ptc123",
    "u-004": "ptcdc123",
    "u-005": "ptcco123",
    "u-006": "ptccnc123",
    "u-007": "qi1234",
    "u-007a":"qidc123",
    "u-007b":"qico123",
    "u-007c":"qicnc123",
    "u-008": "fqi123",
    "u-009": "invqi123",
  }

  for (const user of INITIAL_USERS) {
    try {
      console.log(user.id, seedPasswords[user.id]) // ✅ correct placement

      await admin.auth().createUser({
        uid: user.id,
        email: user.email,
        password: seedPasswords[user.id] ?? "changeme123",
        displayName: user.name,
      })

      console.log(`  ✓  Auth user: ${user.email}`)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === "auth/uid-already-exists" || code === "auth/email-already-exists") {
        console.log(`  –  Auth user already exists: ${user.email}`)
      } else {
        console.error(`  ✗  Failed to create auth user ${user.email}:`, err)
      }
    }
  }

  console.log("\n✅ Seed complete!")
  console.log(`\n   CLIENT_ID to save: ${clientId}`)
  console.log("   Add this to your .env.local as NEXT_PUBLIC_DEFAULT_CLIENT_ID if needed.\n")

  process.exit(0)
}

main().catch(err => {
  console.error("Seed failed:", err)
  process.exit(1)
})
