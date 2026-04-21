import React, { createContext, useContext, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, app } from '../../firebase';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { initializeAuth, inMemoryPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';

const AuthContext = createContext(null);
const API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const ADMIN_EMAIL = process.env.EXPO_PUBLIC_ADMIN_EMAIL;

let _auth = null;
function getAuth() {
  if (!_auth) {
    console.log('[Auth] Initializing Firebase Auth...');
    _auth = initializeAuth(app, { persistence: inMemoryPersistence });
    console.log('[Auth] Firebase Auth initialized:', _auth.app.name);
  } else {
    console.log('[Auth] Reusing existing Firebase Auth instance');
  }
  return _auth;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    AsyncStorage.getItem('user').then(async (saved) => {
      if (saved) {
        const u = JSON.parse(saved);
        try {
          const userDoc = await getDoc(doc(db, 'users', u.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.status === 'frozen' || data.status === 'closed') {
              await AsyncStorage.removeItem('user');
              setLoading(false);
              return;
            }
            u.role = data.role;
            u.profile = data.profile || null;
          }
        } catch (e) {}
        setUser(u);
      }
      setLoading(false);
    });
  }, []);

  async function login(email, password) {
    // Authenticate first via REST API
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );
    const data = await res.json();

    if (data.error) {
      throw new Error(data.error.message.replace(/_/g, ' '));
    }

    // Sign into Firebase Auth SDK so Firestore rules can verify identity
    await signInWithEmailAndPassword(getAuth(), email, password);

    // Now that we're authenticated, check lockout and track failed attempts
    const userDocRef = doc(db, 'users', data.localId);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      const userData = userDocSnap.data();
      // Check lockout
      if (userData.lockUntil) {
        const lockTime = new Date(userData.lockUntil).getTime();
        const now = Date.now();
        if (now < lockTime) {
          const minsLeft = Math.ceil((lockTime - now) / 60000);
          await signOut(getAuth());
          throw new Error(`Account locked. Try again in ${minsLeft} minute${minsLeft !== 1 ? 's' : ''}.`);
        } else {
          await updateDoc(userDocRef, { failedAttempts: 0, lockUntil: null });
        }
      }
      if (userData.status === 'frozen') { await signOut(getAuth()); throw new Error('Your account has been frozen. Contact admin.'); }
      if (userData.status === 'closed') { await signOut(getAuth()); throw new Error('Your account has been closed.'); }
      // Reset failed attempts on successful login
      await updateDoc(userDocRef, { failedAttempts: 0, lockUntil: null });
    } else {
      const role = data.email === ADMIN_EMAIL ? 'admin' : 'user';
      await setDoc(userDocRef, {
        email: data.email,
        role,
        status: 'active',
        createdAt: new Date().toISOString(),
        failedAttempts: 0,
        lockUntil: null,
      });
    }

    const userDocFresh = await getDoc(userDocRef);
    const userData = userDocFresh.data() || {};

    const u = {
      uid: data.localId,
      email: data.email,
      role: userData.role || 'user',
      profile: userData.profile || null,
    };
    setUser(u);
    await AsyncStorage.setItem('user', JSON.stringify(u));
  }

  async function register(email, password) {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message.replace(/_/g, ' '));

    // Sign into Firebase Auth SDK so Firestore rules can verify identity
    await signInWithEmailAndPassword(getAuth(), email, password);

    const role = data.email === ADMIN_EMAIL ? 'admin' : 'user';
    const userDoc = {
      email: data.email,
      role,
      status: 'active',
      createdAt: new Date().toISOString(),
      failedAttempts: 0,
      lockUntil: null,
    };
    try {
      await setDoc(doc(db, 'users', data.localId), userDoc);
    } catch (e) {
      console.error('[Auth] Failed to write user doc:', e);
      throw e;
    }

    // Send welcome/verification email (fire-and-forget)
    try {
      await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestType: 'VERIFY_EMAIL', idToken: data.idToken }),
        }
      );
    } catch (e) {}

    const u = { uid: data.localId, email: data.email, role, profile: null };
    setUser(u);
    await AsyncStorage.setItem('user', JSON.stringify(u));
  }

  async function saveProfile(profileData) {
    await updateDoc(doc(db, 'users', user.uid), { profile: profileData });
    const updated = { ...user, profile: profileData };
    setUser(updated);
    await AsyncStorage.setItem('user', JSON.stringify(updated));
  }

  async function logout() {
    setUser(null);
    await AsyncStorage.removeItem('user');
    try { await signOut(getAuth()); } catch (e) {}
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, saveProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
