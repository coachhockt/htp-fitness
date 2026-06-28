import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, Image, ActivityIndicator,
  Modal, Pressable, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth, getSavedEmail } from '../context/AuthContext';
import { COLORS, FONTS, TYPE, RADIUS } from '../theme';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const { login, register } = useAuth();
  const API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;

  useEffect(() => {
    (async () => {
      const remembered = await AsyncStorage.getItem('remember_email');
      if (remembered) {
        setEmail(remembered);
        setRememberMe(true);
      } else {
        const saved = await getSavedEmail();
        if (saved) setEmail(saved);
      }
    })();
  }, []);

  const EMAIL_DOMAINS = [
    { prefix: 'g', domain: '@gmail.com' },
    { prefix: 'y', domain: '@yahoo.com' },
    { prefix: 'h', domain: '@hotmail.com' },
    { prefix: 'o', domain: '@outlook.com' },
    { prefix: 'i', domain: '@icloud.com' },
  ];

  function getMatchingDomains() {
    const atIndex = email.indexOf('@');
    if (atIndex < 1) return [];
    const typed = email.substring(atIndex);
    return EMAIL_DOMAINS.filter(d =>
      d.domain.startsWith(typed) && typed !== d.domain
    );
  }

  function handleEmailChange(text) {
    setEmail(text);
  }

  function applySuggestion(domain) {
    const atIndex = email.indexOf('@');
    setEmail(email.substring(0, atIndex) + domain);
  }

  const suggestions = getMatchingDomains();

  async function handleSubmit() {
    if (!email.trim() && !password) {
      Alert.alert('Error', 'Email and password are required');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Error', 'Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address.');
      return;
    }
    if (!password) {
      Alert.alert('Error', 'Password is required');
      return;
    }
    if (!isLogin) {
      if (password.length < 8) {
        Alert.alert('Error', 'Password must be at least 8 characters');
        return;
      }
      if (!/[A-Z]/.test(password)) {
        Alert.alert('Error', 'Password must contain at least one capital letter');
        return;
      }
      if (!/[0-9]/.test(password)) {
        Alert.alert('Error', 'Password must contain at least one number');
        return;
      }
      if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        Alert.alert('Error', 'Password must contain at least one special character');
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert('Error', 'Passwords do not match');
        return;
      }
    }
    setLoading(true);
    try {
      if (isLogin) {
        await login(email.trim(), password);
        if (rememberMe) {
          await AsyncStorage.setItem('remember_email', email.trim());
        } else {
          await AsyncStorage.removeItem('remember_email');
        }
      } else {
        const result = await register(email.trim(), password);
        if (result?.pending) {
          setIsLogin(true);
          setPassword('');
          setConfirmPassword('');
          Alert.alert(
            'Account created',
            "Your account is awaiting approval. HTPerformance will activate it shortly — you'll be able to log in once it's active."
          );
        }
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
      <Image
        source={require('../../assets/logo.png')}
        style={styles.logoImage}
        resizeMode="contain"
      />

      <View>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={COLORS.textMuted}
          value={email}
          onChangeText={handleEmailChange}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="next"
        />
        {suggestions.length > 0 && (
          <View style={styles.suggestionRow}>
            {suggestions.map(s => (
              <TouchableOpacity key={s.domain} style={styles.suggestion} onPress={() => applySuggestion(s.domain)}>
                <Text style={styles.suggestionText}>{s.domain}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      <View style={styles.passwordContainer}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          placeholder="Password"
          placeholderTextColor={COLORS.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          maxLength={!isLogin ? 20 : undefined}
          returnKeyType={!isLogin ? 'next' : 'done'}
          onSubmitEditing={isLogin ? handleSubmit : undefined}
        />
        <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {!isLogin && (
        <>
          <View style={styles.reqRow}>
            <View style={styles.reqLeft}>
              <Text style={[styles.reqText, password.length >= 8 && styles.reqMet]}>
                {password.length >= 8 ? '✓' : '•'} At least 8 characters
              </Text>
              <Text style={[styles.reqText, /[A-Z]/.test(password) && styles.reqMet]}>
                {/[A-Z]/.test(password) ? '✓' : '•'} 1 capital letter
              </Text>
              <Text style={[styles.reqText, /[0-9]/.test(password) && styles.reqMet]}>
                {/[0-9]/.test(password) ? '✓' : '•'} 1 number
              </Text>
              <Text style={[styles.reqText, /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) && styles.reqMet]}>
                {/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) ? '✓' : '•'} 1 special character
              </Text>
            </View>
            <View style={styles.reqRight}>
              <Text style={[styles.charCount, password.length >= 20 && styles.charCountMax]}>
                {20 - password.length} remaining
              </Text>
            </View>
          </View>

          <View style={styles.passwordContainer}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Confirm Password"
              placeholderTextColor={COLORS.textMuted}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              maxLength={20}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </>
      )}

      {isLogin && (
        <TouchableOpacity style={styles.rememberRow} onPress={() => setRememberMe(!rememberMe)}>
          <Ionicons
            name={rememberMe ? 'checkbox' : 'square-outline'}
            size={20}
            color={rememberMe ? COLORS.accent : COLORS.textMuted}
          />
          <Text style={styles.rememberText}>Remember me</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.buttonText}>{isLogin ? 'Log In' : 'Sign Up'}</Text>
        )}
      </TouchableOpacity>

      {isLogin && (
        <TouchableOpacity onPress={() => { setForgotEmail(email); setForgotModalVisible(true); }}>
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </TouchableOpacity>
      )}

      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.toggleButton} onPress={() => { setIsLogin(!isLogin); setConfirmPassword(''); }}>
          <Text style={styles.toggleText}>
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal visible={forgotModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={() => setForgotModalVisible(false)} />
          <View style={styles.forgotModal}>
            <View style={styles.forgotHeader}>
              <Text style={styles.forgotTitle}>Reset Password</Text>
              <TouchableOpacity onPress={() => setForgotModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.forgotDesc}>
              Enter your email and we'll send you a link to reset your password.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={COLORS.textMuted}
              value={forgotEmail}
              onChangeText={setForgotEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoFocus
            />
            <TouchableOpacity
              style={styles.button}
              disabled={forgotLoading}
              onPress={async () => {
                if (!forgotEmail.trim()) {
                  Alert.alert('Error', 'Please enter your email');
                  return;
                }
                setForgotLoading(true);
                try {
                  const res = await fetch(
                    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${API_KEY}`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email: forgotEmail.trim() }),
                    }
                  );
                  const data = await res.json();
                  if (data.error) {
                    const msg = data.error.message;
                    if (msg === 'EMAIL_NOT_FOUND') {
                      Alert.alert('Error', 'This email is not registered.');
                    } else {
                      Alert.alert('Error', msg.replace(/_/g, ' '));
                    }
                  } else {
                    Alert.alert('Success', `Reset link sent to ${data.email || forgotEmail.trim()}! Check your email.`);
                    setForgotModalVisible(false);
                  }
                } catch (e) {
                  Alert.alert('Error', 'Something went wrong. Please try again.');
                } finally {
                  setForgotLoading(false);
                }
              }}
            >
              {forgotLoading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.buttonText}>Send Reset Link</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 32,
  },
  logoImage: {
    width: '100%',
    height: 80,
    alignSelf: 'center',
    marginBottom: 48,
  },
  input: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    color: COLORS.textBright,
    fontSize: TYPE.heading,
    marginBottom: 12,
    fontFamily: FONTS.regular,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    padding: 4,
  },
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  buttonText: {
    color: '#000',
    fontWeight: '800',
    fontSize: TYPE.heading,
    fontFamily: FONTS.extraBold,
  },
  bottomBar: {
    paddingHorizontal: 32,
    paddingBottom: 36,
    paddingTop: 12,
  },
  toggleButton: {
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: 24,
  },
  toggleText: {
    color: COLORS.accent,
    fontSize: TYPE.label,
    fontFamily: FONTS.semiBold,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    marginBottom: 6,
  },
  suggestion: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  suggestionText: {
    color: '#000',
    fontSize: TYPE.body,
    fontFamily: FONTS.semiBold,
  },
  reqRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  reqLeft: {
    flex: 1,
  },
  reqRight: {
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  reqText: {
    color: COLORS.textMuted,
    fontSize: TYPE.caption,
    fontFamily: FONTS.regular,
    marginBottom: 2,
  },
  reqMet: {
    color: COLORS.accent,
  },
  charCount: {
    color: COLORS.textMuted,
    fontSize: TYPE.caption,
    fontFamily: FONTS.regular,
  },
  charCountMax: {
    color: COLORS.danger,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    marginTop: 4,
  },
  rememberText: {
    color: COLORS.textMuted,
    fontSize: TYPE.body,
    fontFamily: FONTS.regular,
  },
  forgotText: {
    color: COLORS.accent,
    fontSize: TYPE.label,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
    marginBottom: 16,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  forgotModal: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 48,
  },
  forgotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  forgotTitle: {
    color: COLORS.textBright,
    fontSize: TYPE.title,
    fontWeight: '700',
    fontFamily: FONTS.bold,
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    color: COLORS.textMuted,
    fontSize: TYPE.title,
    fontWeight: '600',
    fontFamily: FONTS.semiBold,
  },
  forgotDesc: {
    color: COLORS.textMuted,
    fontSize: TYPE.label,
    fontFamily: FONTS.regular,
    marginBottom: 16,
    lineHeight: 20,
  },
});
