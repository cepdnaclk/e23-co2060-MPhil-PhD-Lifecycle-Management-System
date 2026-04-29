import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type IdTokenResult,
  type User,
  type UserCredential,
} from "firebase/auth";

import { isAppUserRole, type AppUserRole } from "@/types/auth";

function getFirebaseClientConfig() {
  return {
    apiKey:
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? process.env.FIREBASE_API_KEY,
    authDomain:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??
      process.env.FIREBASE_AUTH_DOMAIN,
    projectId:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
      process.env.FIREBASE_PROJECT_ID,
    storageBucket:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
      process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??
      process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId:
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? process.env.FIREBASE_APP_ID,
    measurementId:
      process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ??
      process.env.FIREBASE_MEASUREMENT_ID,
  };
}

export function getFirebaseClientApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  return initializeApp(getFirebaseClientConfig());
}

export function getFirebaseClientAuth(): Auth {
  return getAuth(getFirebaseClientApp());
}

export const firebaseAuth = getFirebaseClientAuth();

export async function signInWithEmailPassword(
  email: string,
  password: string,
): Promise<UserCredential> {
  return signInWithEmailAndPassword(firebaseAuth, email, password);
}

export async function signOutUser(): Promise<void> {
  await signOut(firebaseAuth);
}

export async function getUserIdTokenResult(
  user: User,
  forceRefresh = false,
): Promise<IdTokenResult> {
  return user.getIdTokenResult(forceRefresh);
}

export async function signInAndGetRoleClaim(
  email: string,
  password: string,
): Promise<AppUserRole | null> {
  const credential = await signInWithEmailPassword(email, password);
  const tokenResult = await getUserIdTokenResult(credential.user, true);

  return isAppUserRole(tokenResult.claims.role) ? tokenResult.claims.role : null;
}
