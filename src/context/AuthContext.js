import React, { createContext, useContext, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { db, app, FIREBASE_API_KEY } from '../../firebase';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { initializeAuth, inMemoryPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { withTimeout } from '../saveGuard';

const AuthContext = createContext(null);
const API_KEY = FIREBASE_API_KEY;
const ADMIN_EMAIL = process.env.EXPO_PUBLIC_ADMIN_EMAIL;
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

let _auth = null;
function getAuth() {
  if (!_auth) {
    _auth = initializeAuth(app, { persistence: inMemoryPersistence });
  }
  return _auth;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isInactive, setIsInactive] = useState(false);

  // Watch the logged-in user's own account doc so a mid-session deactivation
  // (admin moves them to the 'inactive' category) is detected in real time.
  // Mirrors the server-side isActive() rule so the client prediction matches.
  React.useEffect(() => {
    if (!user?.uid) {
      setIsInactive(false);
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        const d = snap.data() || {};
        setIsInactive(
          d.category === 'inactive' || d.category === 'pending' || d.status === 'closed'
        );
      },
      () => {} // ignore listener errors (e.g. transient permission blips)
    );
    return unsub;
  }, [user?.uid]);

  React.useEffect(() => {
    (async () => {
      try {
        const savedEmail = await SecureStore.getItemAsync('auth_email');
        const savedPassword = await SecureStore.getItemAsync('auth_password');
        const savedLoginAt = await SecureStore.getItemAsync('auth_loginAt');

        if (savedEmail && savedPassword && savedLoginAt) {
          const age = Date.now() - parseInt(savedLoginAt, 10);
          if (age < SESSION_MAX_AGE) {
            // Auto-login with stored credentials
            await login(savedEmail, savedPassword);
            setLoading(false);
            return;
          }
          // Session expired — clear credentials
          await clearCredentials();
        }
      } catch (e) {
        // Auto-login failed — fall through to login screen
        await clearCredentials();
      }
      setLoading(false);
    })();
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

    // Now that we're authenticated, load (or create) the account doc.
    const userDocRef = doc(db, 'users', data.localId);
    let userDocSnap = await getDoc(userDocRef);
    if (!userDocSnap.exists()) {
      // First login for an auth account with no Firestore doc. Non-admins start
      // 'pending' and must be approved before they can use the app.
      const role = data.email === ADMIN_EMAIL ? 'admin' : 'user';
      await setDoc(userDocRef, {
        email: data.email,
        role,
        status: 'active',
        category: role === 'admin' ? 'inPerson' : 'pending',
        isNew: true,
        createdAt: new Date().toISOString(),
      });
      userDocSnap = await getDoc(userDocRef);
    }

    const userData = userDocSnap.data() || {};

    // Gate access: pending awaits approval, inactive/closed is deactivated.
    if (userData.category === 'pending') {
      await signOut(getAuth());
      throw new Error("Your account is awaiting approval. HTPerformance will activate it shortly.");
    }
    if (userData.category === 'inactive' || userData.status === 'closed') {
      await signOut(getAuth());
      throw new Error('Your account is inactive. Contact HTPerformance.');
    }

    const u = {
      uid: data.localId,
      email: data.email,
      role: userData.role || 'user',
      profile: userData.profile || null,
    };
    setUser(u);
    await AsyncStorage.setItem('user', JSON.stringify(u));
    await saveCredentials(email, password);
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
    // New non-admin accounts start 'pending' — no access until the trainer approves.
    const isPending = role !== 'admin';
    const userDoc = {
      email: data.email,
      role,
      status: 'active',
      category: isPending ? 'pending' : 'inPerson',
      isNew: true,
      createdAt: new Date().toISOString(),
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

    if (isPending) {
      // Don't grant access or persist a session — bounce back to the login
      // screen. The caller surfaces the "awaiting approval" message.
      try { await signOut(getAuth()); } catch (e) {}
      return { pending: true };
    }

    const u = { uid: data.localId, email: data.email, role, profile: null };
    setUser(u);
    await AsyncStorage.setItem('user', JSON.stringify(u));
    await saveCredentials(email, password);
    return { pending: false };
  }

  async function saveCredentials(email, password) {
    await SecureStore.setItemAsync('auth_email', email);
    await SecureStore.setItemAsync('auth_password', password);
    await SecureStore.setItemAsync('auth_loginAt', Date.now().toString());
  }

  async function clearCredentials() {
    await SecureStore.deleteItemAsync('auth_email');
    await SecureStore.deleteItemAsync('auth_password');
    await SecureStore.deleteItemAsync('auth_loginAt');
    await AsyncStorage.removeItem('user');
  }

  async function saveProfile(profileData) {
    // Timed out rather than bare-awaited: offline, the write is queued and the
    // promise never settles, which would hang every caller with no feedback.
    // Throwing lets callers report the failure instead of appearing to succeed.
    await withTimeout(updateDoc(doc(db, 'users', user.uid), { profile: profileData }));
    const updated = { ...user, profile: profileData };
    setUser(updated);
    await AsyncStorage.setItem('user', JSON.stringify(updated));
  }

  async function changePassword(currentPassword, newPassword) {
    // Re-authenticate first
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, password: currentPassword, returnSecureToken: true }),
      }
    );
    const data = await res.json();
    if (data.error) throw new Error('Incorrect current password');

    // Update password
    const updateRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: data.idToken, password: newPassword, returnSecureToken: true }),
      }
    );
    const updateData = await updateRes.json();
    if (updateData.error) throw new Error(updateData.error.message.replace(/_/g, ' '));

    // Update stored credentials
    await saveCredentials(user.email, newPassword);
  }

  // Permanently delete the signed-in account. App Store guideline 5.1.1(v)
  // requires this in-app for any app that offers account creation; deactivating
  // instead of deleting is explicitly not accepted.
  //
  // Runs entirely client-side — there is no Cloud Functions backend — so the
  // order is load-bearing. The delete rules on sessions and savedWorkouts call
  // isActive(), which reads users/{uid}; dropping the user doc first would
  // revoke the very permission needed to clear everything else. Owned documents
  // go first, then the schedule, then the user doc, and the auth account last,
  // since losing it ends Firestore access outright.
  async function deleteAccount(password) {
    const uid = user.uid;

    // Re-authenticate: proves ownership and yields a fresh idToken, which
    // Firebase requires for deletion. Same shape as changePassword.
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, password, returnSecureToken: true }),
      }
    );
    const data = await res.json();
    if (data.error) throw new Error('Incorrect password');

    // Both collections key the owner as clientId, which for an app user is
    // their own uid. A clients doc is the trainer's own record and carries an
    // auto-generated id, so none is owned by the user being deleted.
    for (const name of ['sessions', 'savedWorkouts']) {
      const snap = await getDocs(query(collection(db, name), where('clientId', '==', uid)));
      // writeBatch caps at 500 operations — chunk rather than assume a short
      // training history.
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await withTimeout(batch.commit());
      }
    }

    // schedules/{uid} may not exist; deleting a missing doc is a no-op.
    await withTimeout(deleteDoc(doc(db, 'schedules', uid)));
    await withTimeout(deleteDoc(doc(db, 'users', uid)));

    const delRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: data.idToken }),
      }
    );
    const delData = await delRes.json();
    if (delData.error) throw new Error(delData.error.message.replace(/_/g, ' '));

    // Tear down the local session exactly as logout does.
    setUser(null);
    await clearCredentials();
    try { await signOut(getAuth()); } catch (e) {}
  }

  async function logout() {
    setUser(null);
    await clearCredentials();
    try { await signOut(getAuth()); } catch (e) {}
  }

  return (
    <AuthContext.Provider value={{ user, loading, isInactive, login, register, logout, saveProfile, changePassword, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export async function getSavedEmail() {
  try {
    return await SecureStore.getItemAsync('auth_email');
  } catch {
    return null;
  }
}
