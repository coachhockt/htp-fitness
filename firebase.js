import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const prodConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const devConfig = {
  apiKey: process.env.EXPO_PUBLIC_DEV_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_DEV_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_DEV_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_DEV_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_DEV_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_DEV_FIREBASE_APP_ID,
};

// Use the dev project only in development bundles (Expo Go / dev builds) and only
// when dev config is present. Production builds and OTA updates (__DEV__ === false)
// always use production. This keeps live client data isolated from testing.
export const IS_DEV_BACKEND = __DEV__ && !!devConfig.projectId;
const firebaseConfig = IS_DEV_BACKEND ? devConfig : prodConfig;
export const FIREBASE_API_KEY = firebaseConfig.apiKey;

const app = initializeApp(firebaseConfig);
console.log('[Firebase] App initialized:', app.name, '| project:', firebaseConfig.projectId, IS_DEV_BACKEND ? '(DEV)' : '(PROD)');
export const db = getFirestore(app);
export { app };
