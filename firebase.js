import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBZPGeWgw6lXE6rXrvLBTvzq7SCIhWz0GE",
  authDomain: "htp-fitness.firebaseapp.com",
  projectId: "htp-fitness",
  storageBucket: "htp-fitness.firebasestorage.app",
  messagingSenderId: "196650596292",
  appId: "1:196650596292:web:946f6222fbc77cf4815691",
};

const app = initializeApp(firebaseConfig);
console.log('[Firebase] App initialized:', app.name);
export const db = getFirestore(app);
console.log('[Firebase] Firestore db initialized:', db.app.name);
export { app };
