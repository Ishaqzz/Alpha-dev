import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, getFirestore } from "firebase/firestore";
import { initializeAuth, inMemoryPersistence, getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let app;
let db;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} else {
  app = getApp();
  db = getFirestore(app);
}

export { db };
export default app;

let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: inMemoryPersistence
  });
} catch (error) {
  authInstance = getAuth(app);
}
export const auth = authInstance;