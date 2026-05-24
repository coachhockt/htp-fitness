import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Image,
  Modal, Pressable, TextInput, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../firebase';
import {
  collection, query, where, onSnapshot, doc, setDoc,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS } from '../theme';
import { getLastBodyEditDate, formatLastEdited } from '../utils';
import { showNoAccess, handledNoAccess } from '../access';
import ProfileMenu from '../components/ProfileMenu';

export default function UserDashboardScreen({ navigation }) {
  const { user, isInactive, logout, saveProfile, changePassword } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [profileModal, setProfileModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [settingsView, setSettingsView] = useState('main'); // 'main' | 'password'
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editSex, setEditSex] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editFat, setEditFat] = useState('');
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const q = query(
      collection(db, 'sessions'),
      where('clientId', '==', user.uid)
    );
    return onSnapshot(q, (snap) => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, 'schedules', user.uid), (snap) => {
      if (snap.exists()) setSchedule(snap.data());
    });
  }, [user.uid]);

  const upcomingWorkouts = (() => {
    if (!schedule) return [];
    const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const skipped = new Set(schedule.skippedDates || []);
    const results = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Collect next 21 days worth of candidates
    for (let i = 0; i < 21 && results.length < 3; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayKey = DAY_KEYS[d.getDay()];

      const isRecurring = schedule.days?.[dayKey]?.enabled;
      const specific = schedule.specificDates || {};
      const isSpecific = Array.isArray(specific) ? specific.includes(dateStr) : dateStr in specific;

      // Specific dates always show. Recurring days are skipped if dateStr is in skippedDates.
      const include = isSpecific || (isRecurring && !skipped.has(dateStr));
      if (include) {
        const specificEntry = !Array.isArray(specific) ? specific[dateStr] : null;
        const specificLabel = typeof specificEntry === 'string'
          ? specificEntry
          : specificEntry?.label || null;
        const label = specificLabel || schedule.days?.[dayKey]?.label || null;
        results.push({ date: d, dateStr, label, isSpecific: isSpecific && !isRecurring });
      }
    }
    return results.slice(0, 3);
  })();

  function handleUpcomingPress(w) {
    const dateLabel = w.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    Alert.alert(
      dateLabel,
      w.label || 'Scheduled workout',
      [
        { text: 'Dismiss', style: 'cancel' },
        { text: 'Edit', onPress: () => navigation.navigate('ActivityCalendar', { openDate: w.dateStr }) },
        { text: 'Cancel Session', style: 'destructive', onPress: () => confirmCancelUpcoming(w, dateLabel) },
      ]
    );
  }

  function confirmCancelUpcoming(w, dateLabel) {
    Alert.alert(
      'Cancel Session?',
      `Skip your scheduled workout on ${dateLabel}?`,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', style: 'destructive', onPress: () => cancelUpcoming(w) },
      ]
    );
  }

  async function cancelUpcoming(w) {
    if (!schedule) return;
    const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = DAY_KEYS[w.date.getDay()];
    try {
      const updated = { ...schedule };
      const specific = schedule.specificDates || {};
      const isInSpecific = !Array.isArray(specific) && w.dateStr in specific;
      const isRecurring = schedule.days?.[dayKey]?.enabled;

      if (isInSpecific) {
        const newSpecific = { ...specific };
        delete newSpecific[w.dateStr];
        updated.specificDates = newSpecific;
      }
      if (isRecurring) {
        const skipped = new Set(schedule.skippedDates || []);
        skipped.add(w.dateStr);
        updated.skippedDates = Array.from(skipped);
      }
      updated.updatedAt = new Date().toISOString();
      await setDoc(doc(db, 'schedules', user.uid), updated);
    } catch (e) {
      if (!handledNoAccess(e)) Alert.alert('Error', e.message);
    }
  }

  const sessionsThisWeek = (() => {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - (day === 0 ? 6 : day - 1)); // Monday
    startOfWeek.setHours(0, 0, 0, 0);
    return sessions.filter(s => {
      if (!s.date) return false;
      const d = s.date.toDate ? s.date.toDate() : new Date(s.date);
      return d >= startOfWeek;
    }).length;
  })();

  function openProfileView() {
    setProfileModal(true);
  }

  function openEditProfile() {
    const p = user.profile || {};
    setEditFirst(p.firstName || p.fullName?.split(' ')[0] || '');
    setEditLast(p.lastName || p.fullName?.split(' ').slice(1).join(' ') || '');
    setEditAge(p.age ? String(p.age) : '');
    setEditSex(p.sex || '');
    setEditWeight(p.bodyWeight ? String(p.bodyWeight) : '');
    setEditFat(p.bodyFat ? String(p.bodyFat) : '');
    setProfileModal(false);
    setEditModal(true);
  }

  function openSettings() {
    setSettingsView('main');
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setSettingsModal(true);
  }

  async function handleChangePassword() {
    if (!currentPw) { Alert.alert('Error', 'Enter your current password'); return; }
    if (newPw.length < 6) { Alert.alert('Error', 'New password must be at least 6 characters'); return; }
    if (newPw !== confirmPw) { Alert.alert('Error', 'Passwords do not match'); return; }
    setSettingsSaving(true);
    try {
      await changePassword(currentPw, newPw);
      Alert.alert('Success', 'Password updated successfully');
      setSettingsView('main');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleSaveProfile() {
    if (!editFirst.trim()) { Alert.alert('Error', 'First name is required'); return; }
    if (!editAge.trim()) { Alert.alert('Error', 'Age is required'); return; }
    const fullName = editLast.trim()
      ? `${editFirst.trim()} ${editLast.trim()}`
      : editFirst.trim();
    const newWeight = editWeight.trim() ? parseFloat(editWeight.trim()) : null;
    const newFat = editFat.trim() ? parseFloat(editFat.trim()) : null;
    if (newWeight !== null && isNaN(newWeight)) {
      Alert.alert('Error', 'Body weight must be a number.');
      return;
    }
    if (newFat !== null && isNaN(newFat)) {
      Alert.alert('Error', 'Body fat must be a number.');
      return;
    }
    const weightChanged = newWeight !== (profile.bodyWeight || null);
    const fatChanged = newFat !== (profile.bodyFat || null);

    const profileData = {
      firstName: editFirst.trim(),
      lastName: editLast.trim() || null,
      fullName,
      age: parseInt(editAge.trim()),
      sex: editSex || null,
      bodyWeight: newWeight,
      bodyFat: newFat,
      bodyHistory: profile.bodyHistory || [],
    };

    if (weightChanged) {
      profileData.weightUpdatedAt = new Date().toISOString();
    } else {
      profileData.weightUpdatedAt = profile.weightUpdatedAt || null;
    }
    if (fatChanged) {
      profileData.fatUpdatedAt = new Date().toISOString();
    } else {
      profileData.fatUpdatedAt = profile.fatUpdatedAt || null;
    }
    if (weightChanged || fatChanged) {
      const today = new Date().toISOString().split('T')[0];
      const history = [...(profile.bodyHistory || [])];
      const todayIdx = history.findIndex(e => e.date.split('T')[0] === today);
      const entry = todayIdx >= 0 ? { ...history[todayIdx] } : { date: new Date().toISOString() };
      if (weightChanged && newWeight !== null) entry.bodyWeight = newWeight;
      if (fatChanged && newFat !== null) entry.bodyFat = newFat;
      if (todayIdx >= 0) {
        history[todayIdx] = entry;
      } else {
        history.push(entry);
      }
      profileData.bodyHistory = history;
    }

    await saveProfile(profileData);
    setEditModal(false);
  }

  const profile = user.profile || {};

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={{ flex: 1, padding: 20 }}>
        <View style={styles.logoContainer}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.header}>
          <Text style={styles.greeting}>Hey, {profile.fullName?.split(' ')[0] || 'there'}</Text>
          <ProfileMenu
            user={user}
            onProfile={openProfileView}
            onSettings={openSettings}
            onLogout={() => Alert.alert('Log Out', 'Are you sure you want to log out?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log Out', style: 'destructive', onPress: logout }])}
            topOffset={insets.top + 110}
            extraItems={[
              { label: 'Activity History', icon: 'calendar-outline', onPress: () => navigation.navigate('ActivityCalendar') },
              { label: 'Saved Workouts', icon: 'bookmark-outline', onPress: () => navigation.navigate('SavedWorkouts') },
              { label: 'View Progress', icon: 'trending-up-outline', onPress: () => navigation.navigate('Progress', { clientId: user.uid, name: profile.fullName || 'My' }) },
            ]}
          />
        </View>

        <View style={styles.weekCard}>
          <Text style={styles.weekCount}>{sessionsThisWeek}</Text>
          <Text style={styles.weekLabel}>Sessions trained this week</Text>
        </View>

        <View>
          <Text style={styles.upcomingTitle}>Upcoming</Text>
          {upcomingWorkouts.length > 0 ? (
            upcomingWorkouts.map((w) => {
              const isToday = w.date.toDateString() === new Date().toDateString();
              const isTomorrow = (() => {
                const tmr = new Date();
                tmr.setDate(tmr.getDate() + 1);
                return w.date.toDateString() === tmr.toDateString();
              })();
              const dayLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : w.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              return (
                <TouchableOpacity
                  key={w.dateStr}
                  style={styles.upcomingCard}
                  onPress={() => handleUpcomingPress(w)}
                  activeOpacity={0.7}
                >
                  <View style={styles.upcomingDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.upcomingDay}>{dayLabel}</Text>
                    {w.label ? <Text style={styles.upcomingLabel}>{w.label}</Text> : null}
                  </View>
                  <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              );
            })
          ) : (
            <Text style={styles.upcomingEmpty}>No upcoming workouts scheduled</Text>
          )}
        </View>
      </View>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          if (isInactive) { showNoAccess(); return; }
          navigation.navigate('NewSession', { clientId: user.uid, name: profile.fullName || 'My Session' });
        }}
      >
        <Text style={styles.fabText}>Start Training</Text>
      </TouchableOpacity>

      <Modal visible={profileModal} transparent animationType="fade">
        <Pressable style={styles.centerBackdrop} onPress={() => setProfileModal(false)}>
          <View style={styles.centerModal} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Profile</Text>
              <TouchableOpacity onPress={() => setProfileModal(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Name</Text>
              <Text style={styles.profileValue}>{profile.fullName || '—'}</Text>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Age</Text>
              <Text style={styles.profileValue}>{profile.age || '—'}</Text>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Sex</Text>
              <Text style={styles.profileValue}>{profile.sex || '—'}</Text>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Body Weight</Text>
              <View style={styles.profileValueCol}>
                <Text style={styles.profileValue}>{profile.bodyWeight ? `${profile.bodyWeight} lbs` : '—'}</Text>
                {getLastBodyEditDate(profile, 'weight') && (
                  <Text style={styles.profileSub}>{formatLastEdited(getLastBodyEditDate(profile, 'weight'))}</Text>
                )}
              </View>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Body Fat</Text>
              <View style={styles.profileValueCol}>
                <Text style={styles.profileValue}>{profile.bodyFat ? `${profile.bodyFat}%` : '—'}</Text>
                {getLastBodyEditDate(profile, 'fat') && (
                  <Text style={styles.profileSub}>{formatLastEdited(getLastBodyEditDate(profile, 'fat'))}</Text>
                )}
              </View>
            </View>

            <TouchableOpacity style={styles.modalBtn} onPress={openEditProfile}>
              <Text style={styles.modalBtnText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={editModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={() => setEditModal(false)} />
          <View style={styles.modal}>
            <ScrollView keyboardShouldPersistTaps="handled">
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModal(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>Name</Text>
            <View style={styles.nameRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="First Name *"
                placeholderTextColor={COLORS.textMuted}
                value={editFirst}
                onChangeText={setEditFirst}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Last Name"
                placeholderTextColor={COLORS.textMuted}
                value={editLast}
                onChangeText={setEditLast}
              />
            </View>
            <Text style={styles.fieldLabel}>Age *</Text>
            <TextInput
              style={styles.input}
              placeholder="Age"
              placeholderTextColor={COLORS.textMuted}
              value={editAge}
              onChangeText={setEditAge}
              keyboardType="number-pad"
            />
            <Text style={styles.fieldLabel}>Sex</Text>
            <View style={styles.sexRow}>
              {['Male', 'Female'].map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.sexBtn, editSex === opt && styles.sexBtnActive]}
                  onPress={() => setEditSex(editSex === opt ? '' : opt)}
                >
                  <Text style={[styles.sexBtnTxt, editSex === opt && styles.sexBtnTxtActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Body Weight (lbs)</Text>
            {formatLastEdited(getLastBodyEditDate(profile, 'weight')) ? (
              <Text style={styles.lastUpdated}>
                {formatLastEdited(getLastBodyEditDate(profile, 'weight'))}
              </Text>
            ) : null}
            <TextInput
              style={styles.input}
              placeholder="Enter weight"
              placeholderTextColor={COLORS.textMuted}
              value={editWeight}
              onChangeText={setEditWeight}
              keyboardType="decimal-pad"
            />
            <Text style={styles.fieldLabel}>Body Fat %</Text>
            {formatLastEdited(getLastBodyEditDate(profile, 'fat')) ? (
              <Text style={styles.lastUpdated}>
                {formatLastEdited(getLastBodyEditDate(profile, 'fat'))}
              </Text>
            ) : null}
            <TextInput
              style={styles.input}
              placeholder="Enter body fat"
              placeholderTextColor={COLORS.textMuted}
              value={editFat}
              onChangeText={setEditFat}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity style={styles.modalBtn} onPress={handleSaveProfile}>
              <Text style={styles.modalBtnText}>Save Changes</Text>
            </TouchableOpacity>
            </View>
            </TouchableWithoutFeedback>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={settingsModal} transparent animationType="fade">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.centerBackdrop} onPress={() => setSettingsModal(false)}>
            <View style={styles.centerModal} onStartShouldSetResponder={() => true}>
            <ScrollView keyboardShouldPersistTaps="handled">
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {settingsView === 'main' ? 'Settings' : 'Change Password'}
              </Text>
              <TouchableOpacity onPress={() => setSettingsModal(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {settingsView === 'main' ? (
              <>
                <View style={styles.settingsItem}>
                  <Text style={styles.settingsLabel}>Email</Text>
                  <Text style={styles.settingsValue}>{user.email}</Text>
                </View>
                <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsView('password')}>
                  <Ionicons name="lock-closed-outline" size={18} color={COLORS.text} />
                  <Text style={styles.settingsBtnText}>Change Password</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Current Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter current password"
                  placeholderTextColor={COLORS.textMuted}
                  value={currentPw}
                  onChangeText={setCurrentPw}
                  secureTextEntry
                />
                <Text style={styles.fieldLabel}>New Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="At least 6 characters"
                  placeholderTextColor={COLORS.textMuted}
                  value={newPw}
                  onChangeText={setNewPw}
                  secureTextEntry
                />
                <Text style={styles.fieldLabel}>Confirm New Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter new password"
                  placeholderTextColor={COLORS.textMuted}
                  value={confirmPw}
                  onChangeText={setConfirmPw}
                  secureTextEntry
                />
                <TouchableOpacity style={[styles.modalBtn, settingsSaving && { opacity: 0.5 }]} onPress={handleChangePassword} disabled={settingsSaving}>
                  <Text style={styles.modalBtnText}>{settingsSaving ? 'Updating...' : 'Update Password'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.settingsBack} onPress={() => setSettingsView('main')}>
                  <Text style={styles.settingsBackText}>Back</Text>
                </TouchableOpacity>
              </>
            )}
            </View>
            </TouchableWithoutFeedback>
            </ScrollView>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  logoContainer: {
    alignItems: 'center',
    paddingTop: 36,
    paddingBottom: 8,
  },
  logo: {
    width: '90%',
    height: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: 17,
    fontFamily: FONTS.bold,
    color: COLORS.text,
  },
  weekCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  weekCount: {
    color: COLORS.accent,
    fontSize: 36,
    fontWeight: '800',
    fontFamily: FONTS.extraBold,
  },
  weekLabel: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: FONTS.semiBold,
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 36,
    right: 24,
    left: 24,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    padding: 17,
    alignItems: 'center',
  },
  fabText: { color: '#000', fontWeight: '800', fontSize: 16, fontFamily: FONTS.extraBold },

  // Upcoming
  upcomingTitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
    fontFamily: FONTS.bold,
  },
  upcomingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 11,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  upcomingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
    marginRight: 12,
  },
  upcomingDay: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: FONTS.semiBold,
  },
  upcomingLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  upcomingEmpty: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    paddingVertical: 16,
  },

  // Profile View
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  profileLabel: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: FONTS.regular,
  },
  profileValue: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },
  profileValueCol: {
    alignItems: 'flex-end',
  },
  profileSub: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },

  centerBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  centerModal: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxHeight: '80%',
  },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  modal: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 48,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: '700', fontFamily: FONTS.bold },
  closeBtn: { padding: 4 },
  closeBtnText: { color: COLORS.textMuted, fontSize: 20, fontWeight: '600', fontFamily: FONTS.semiBold },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 14,
    color: COLORS.text,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: 10,
    fontFamily: FONTS.regular,
  },
  fieldLabel: { color: COLORS.textMuted, fontSize: 12, fontFamily: FONTS.semiBold, marginBottom: 6, marginLeft: 4 },
  lastUpdated: { color: COLORS.accent, fontSize: 11, fontFamily: FONTS.regular, marginBottom: 6, marginLeft: 4 },
  nameRow: { flexDirection: 'row', gap: 10 },
  sexRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  sexBtn: {
    flex: 1,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  sexBtnActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '1A' },
  sexBtnTxt: { color: COLORS.textMuted, fontSize: 15, fontFamily: FONTS.semiBold },
  sexBtnTxtActive: { color: COLORS.accent },
  modalBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  modalBtnText: { color: '#000', fontWeight: '800', fontSize: 16, fontFamily: FONTS.extraBold },

  // Settings
  settingsItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 12,
  },
  settingsLabel: { color: COLORS.textMuted, fontSize: 12, fontFamily: FONTS.regular, marginBottom: 4 },
  settingsValue: { color: COLORS.text, fontSize: 15, fontFamily: FONTS.semiBold },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  settingsBtnText: { flex: 1, color: COLORS.text, fontSize: 14, fontFamily: FONTS.semiBold },
  settingsBack: { alignItems: 'center', padding: 12, marginTop: 4 },
  settingsBackText: { color: COLORS.textMuted, fontSize: 14, fontFamily: FONTS.regular },
});
