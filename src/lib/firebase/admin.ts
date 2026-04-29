import { cert, getApps, initializeApp } from "firebase-admin/app";
import {
  getAuth,
  type DecodedIdToken,
  type SessionCookieOptions,
} from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

import { isAppUserRole, type AppUserRole } from "@/types/auth";

const FIREBASE_ADMIN_APP_NAME = "pgsms-firebase-admin";
export const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME ?? "pgsms_session";
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 30;
export const SESSION_COOKIE_MAX_AGE_MS = SESSION_COOKIE_MAX_AGE_SECONDS * 1000;

function normalizePrivateKey(privateKey: string) {
  return privateKey.replace(/\\n/g, "\n");
}

function getRequiredFirebaseAdminConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.",
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKey),
  };
}

export function getFirebaseAdminApp() {
  const existingApp = getApps().find((app) => app.name === FIREBASE_ADMIN_APP_NAME);

  if (existingApp) {
    return existingApp;
  }

  const config = getRequiredFirebaseAdminConfig();

  return initializeApp(
    {
      credential: cert({
        projectId: config.projectId,
        clientEmail: config.clientEmail,
        privateKey: config.privateKey,
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    },
    FIREBASE_ADMIN_APP_NAME,
  );
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminStorage() {
  return getStorage(getFirebaseAdminApp());
}

export function getFirebaseAdminBucket() {
  return getFirebaseAdminStorage().bucket();
}

export type VerifiedFirebaseToken = DecodedIdToken & {
  role?: AppUserRole;
};

export async function setCustomClaimsForUser(
  uid: string,
  role: AppUserRole,
): Promise<void> {
  await getFirebaseAdminAuth().setCustomUserClaims(uid, { role });
}

export async function verifyFirebaseToken(
  token: string,
  checkRevoked = true,
): Promise<VerifiedFirebaseToken> {
  const decodedToken = await getFirebaseAdminAuth().verifyIdToken(
    token,
    checkRevoked,
  );

  return {
    ...decodedToken,
    role: isAppUserRole(decodedToken.role) ? decodedToken.role : undefined,
  };
}

export async function createSessionCookieFromIdToken(
  idToken: string,
  options: SessionCookieOptions = { expiresIn: SESSION_COOKIE_MAX_AGE_MS },
) {
  return getFirebaseAdminAuth().createSessionCookie(idToken, options);
}

export async function verifyFirebaseSessionCookie(
  sessionCookie: string,
  checkRevoked = true,
): Promise<VerifiedFirebaseToken> {
  const decodedToken = await getFirebaseAdminAuth().verifySessionCookie(
    sessionCookie,
    checkRevoked,
  );

  return {
    ...decodedToken,
    role: isAppUserRole(decodedToken.role) ? decodedToken.role : undefined,
  };
}

export function buildSessionCookieOptions(overrides?: Partial<{
  maxAge: number;
}>): {
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: overrides?.maxAge ?? SESSION_COOKIE_MAX_AGE_SECONDS,
  };
}
