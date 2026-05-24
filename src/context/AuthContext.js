import React, { createContext, useContext, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { db, app } from '../../firebase';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { initializeAuth, inMemoryPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';

const AuthContext = createContext(null);
const API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
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

    // Now that we're authenticated, verify the account is still active
    const userDocRef = doc(db, 'users', data.localId);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      const userData = userDocSnap.data();
      if (userData.category === 'inactive' || userData.status === 'closed') {
        await signOut(getAuth());
        throw new Error('Your account is inactive. Contact admin.');
      }
    } else {
      const role = data.email === ADMIN_EMAIL ? 'admin' : 'user';
      await setDoc(userDocRef, {
        email: data.email,
        role,
        status: 'active',
        category: 'inPerson',
        isNew: true,
        createdAt: new Date().toISOString(),
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
    const userDoc = {
      email: data.email,
      role,
      status: 'active',
      category: 'inPerson',
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

    const u = { uid: data.localId, email: data.email, role, profile: null };
    setUser(u);
    await AsyncStorage.setItem('user', JSON.stringify(u));
    await saveCredentials(email, password);
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
    await updateDoc(doc(db, 'users', user.uid), { profile: profileData });
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

  async function logout() {
    setUser(null);
    await clearCredentials();
    try { await signOut(getAuth()); } catch (e) {}
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, saveProfile, changePassword }}>
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
