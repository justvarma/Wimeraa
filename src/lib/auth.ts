/**
 * auth.ts
 * -------
 * Thin wrappers around Firebase Auth.
 *
 * IMPORTANT: Passwords are managed by Firebase Auth — the plain-text
 * `password` field on the User interface is NOT written to Firestore.
 * The user profile stored in Firestore only contains identity + role.
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  type User as FirebaseUser,
} from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { auth, db } from "./firebase"
export { auth }
import type { User } from "./store"

// ─── Sign In ──────────────────────────────────────────────────────────────────

export async function signIn(
    email: string,
    password: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await signInWithEmailAndPassword(auth, email, password)
    return { success: true }
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? ""
    const map: Record<string, string> = {
      "auth/user-not-found":  "No account found with this email.",
      "auth/wrong-password":  "Incorrect password.",
      "auth/invalid-email":   "Invalid email address.",
      "auth/too-many-requests": "Too many attempts. Please try again later.",
      "auth/invalid-credential": "Invalid email or password.",
    }
    return { success: false, error: map[code] ?? "Sign-in failed. Please try again." }
  }
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth)
}

// ─── Create user (called by Admin when adding new users) ─────────────────────
// This creates the Firebase Auth account only.
// The Firestore user document is written separately via firestoreService.

export async function createAuthUser(
    email: string,
    password: string,
): Promise<{ uid: string } | { error: string }> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    return { uid: cred.user.uid }
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? ""
    const map: Record<string, string> = {
      "auth/email-already-in-use": "An account with this email already exists.",
      "auth/weak-password":        "Password must be at least 6 characters.",
      "auth/invalid-email":        "Invalid email address.",
    }
    return { error: map[code] ?? "Could not create account." }
  }
}

// ─── Change password ──────────────────────────────────────────────────────────

export async function changePassword(
    currentPassword: string,
    newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  const user = auth.currentUser
  if (!user?.email) return { success: false, error: "Not signed in." }
  try {
    const cred = EmailAuthProvider.credential(user.email, currentPassword)
    await reauthenticateWithCredential(user, cred)
    await updatePassword(user, newPassword)
    return { success: true }
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? ""
    if (code === "auth/wrong-password") return { success: false, error: "Current password is incorrect." }
    return { success: false, error: "Could not update password." }
  }
}

// ─── Fetch full user profile from Firestore ───────────────────────────────────
// Used by AppProvider after auth state changes to get role + metadata.

export async function fetchUserProfile(
    firebaseUser: FirebaseUser,
): Promise<User | null> {
  // System admins live at /users/{uid} (no clientId)
  const sysRef = doc(db, "users", firebaseUser.uid)
  const sysSnap = await getDoc(sysRef)
  if (sysSnap.exists()) {
    return { id: firebaseUser.uid, ...sysSnap.data() } as User
  }
  // Client-scoped users: we don't know clientId here, so we rely on
  // a top-level user index: /user_index/{uid} → { clientId }
  const idxRef  = doc(db, "user_index", firebaseUser.uid)
  const idxSnap = await getDoc(idxRef)
  if (!idxSnap.exists()) return null
  const { clientId } = idxSnap.data() as { clientId: string }
  const clientUserRef  = doc(db, "clients", clientId, "users", firebaseUser.uid)
  const clientUserSnap = await getDoc(clientUserRef)
  if (!clientUserSnap.exists()) return null
  return { id: firebaseUser.uid, ...clientUserSnap.data() } as User
}

// ─── Auth state listener ──────────────────────────────────────────────────────

export function onAuthStateChange(
    callback: (user: FirebaseUser | null) => void,
): () => void {
  return onAuthStateChanged(auth, callback)
}