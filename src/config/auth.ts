import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import appletFirebaseConfig from '../../firebase-applet-config.json';

export interface FirebaseConfigShape {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  storageBucket?: string;
  messagingSenderId?: string;
  oAuthClientId?: string;
}

function resolveFirebaseConfig(): FirebaseConfigShape {
  const envRaw = import.meta.env.VITE_FIREBASE_CONFIG as string | undefined;
  if (envRaw && envRaw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(envRaw) as FirebaseConfigShape;
      if (parsed.apiKey && parsed.projectId) {
        return {
          ...appletFirebaseConfig,
          ...parsed,
        };
      }
    } catch {
      // Fallback to provisioned firebase-applet-config.json if VITE_FIREBASE_CONFIG is invalid JSON
    }
  }
  return appletFirebaseConfig as FirebaseConfigShape;
}

export const firebaseConfig = resolveFirebaseConfig();

export const GOOGLE_CLIENT_ID: string =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
  firebaseConfig.oAuthClientId ||
  '';

export const firebaseApp: FirebaseApp =
  getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

export const auth: Auth = getAuth(firebaseApp);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function isAuthConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain);
}

export async function signInWithRealGoogle(): Promise<User> {
  if (!isAuthConfigured()) {
    throw new Error(
      'Google Authentication is not configured. Provide VITE_FIREBASE_CONFIG or firebase-applet-config.json.'
    );
  }
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutRealGoogle(): Promise<void> {
  await signOut(auth);
}
