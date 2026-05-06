import { initializeApp, getApps } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"

const firebaseConfig = {
  apiKey: "AIzaSyBAATyKVqsTiiaCFrfCuqZrSMckCgd9yG0",
  authDomain: "wimera-aec36.firebaseapp.com",
  projectId: "wimera-aec36",
  storageBucket: "wimera-aec36.firebasestorage.app",
  messagingSenderId: "436668615373",
  appId: "1:436668615373:web:2d115d26d214741b00f784",
}

// Prevent re-initialization (important for Next.js)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

export const auth = getAuth(app)
export const db = getFirestore(app)