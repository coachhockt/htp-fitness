import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Image,
  Modal, Pressable, TextInput, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback, ScrollView, AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../firebase';
import {
  collection, query, where, onSnapshot, doc, setDoc,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS } from '../theme';
import { getLastBodyEditDate, formatLastEdited } from '../utils';
import { showNoAccess, handledNoAccess } from '../access';
import { isStepsAvailable, requestStepAccess, getTodaySteps, getWeeklySteps } from '../health';
import ProfileMenu from '../components/ProfileMenu';
import { SAMPLE_WORKOUTS } from '../sampleWorkouts';

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
  const [goalModal, setGoalModal] = useState(false);
  const [startPicker, setStartPicker] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [goalSaving, setGoalSaving] = useState(false);
  const [stepsAvailable, setStepsAvailable] = useState(false);
  const [stepsAuthorized, setStepsAuthorized] = useState(false);
  const [stepsToday, setStepsToday] = useState(0);
  const [weeklySteps, setWeeklySteps] = useState(0);
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

  // Step tracking (Apple Health / Health Connect) — display only, never written back.
  const stepsAuthedRef = useRef(false);
  useEffect(() => {
    let mounted = true;

    const loadSteps = async () => {
      const [today, week] = await Promise.all([getTodaySteps(), getWeeklySteps()]);
      if (!mounted) return;
      setStepsToday(today);
      setWeeklySteps(week);
    };

    (async () => {
      const available = await isStepsAvailable();
      if (!mounted) return;
      setStepsAvailable(available);
      if (!available) return;
      // If the user connected before, silently re-authorize (no prompt when already granted) and refresh.
      const connected = await AsyncStorage.getItem('stepsConnected');
      if (connected === '1') {
        const ok = await requestStepAccess();
        if (!mounted) return;
        setStepsAuthorized(ok);
        stepsAuthedRef.current = ok;
        if (ok) loadSteps();
      }
    })();

    // Refresh step counts whenever the app returns to the foreground.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && stepsAuthedRef.current) loadSteps();
    });
    return () => { mounted = false; sub.remove(); };
  }, []);

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

  function toDate(ts) {
    return ts?.toDate ? ts.toDate() : new Date(ts);
  }

  function formatDate(ts) {
    const d = toDate(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function totalSets(session) {
    return session.exercises?.reduce((n, ex) => n + (ex.sets?.length || 0), 0) || 0;
  }

  // Monday-start date for any given date, normalized to midnight.
  function startOfWeekFor(date) {
    const day = date.getDay(); // 0=Sun
    const d = new Date(date);
    d.setDate(date.getDate() - (day === 0 ? 6 : day - 1)); // Monday
    d.setHours(0, 0, 0, 0);
    return d;
  }

  const sessionsThisWeek = (() => {
    const startOfWeek = startOfWeekFor(new Date());
    return sessions.filter(s => {
      if (!s.date) return false;
      return toDate(s.date) >= startOfWeek;
    }).length;
  })();

  const recentSessions = [...sessions]
    .filter(s => s.date)
    .sort((a, b) => toDate(b.date) - toDate(a.date))
    .slice(0, 3);

  // Consecutive Mon–Sun weeks with ≥1 session. Strict: if the current week
  // has no session, the streak is 0.
  const weekStreak = (() => {
    if (sessions.length === 0) return 0;
    const weeks = new Set(
      sessions
        .filter(s => s.date)
        .map(s => startOfWeekFor(toDate(s.date)).getTime())
    );
    const cursor = startOfWeekFor(new Date());
    let count = 0;
    while (weeks.has(cursor.getTime())) {
      count++;
      cursor.setDate(cursor.getDate() - 7);
    }
    return count;
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

  function openGoalModal() {
    if (isInactive) { showNoAccess(); return; }
    const current = user.profile?.goals?.weeklySessions;
    setGoalInput(current ? String(current) : '');
    setGoalModal(true);
  }

  async function persistGoal(weeklySessions) {
    const p = user.profile || {};
    setGoalSaving(true);
    try {
      await saveProfile({ ...p, goals: { ...(p.goals || {}), weeklySessions } });
      setGoalModal(false);
    } catch (e) {
      if (!handledNoAccess(e)) Alert.alert('Error', e.message);
    } finally {
      setGoalSaving(false);
    }
  }

  function handleSaveGoal() {
    const n = parseInt(goalInput.trim(), 10);
    if (isNaN(n) || n < 1 || n > 14) {
      Alert.alert('Error', 'Enter a number of sessions per week between 1 and 14.');
      return;
    }
    persistGoal(n);
  }

  function handleClearGoal() {
    persistGoal(null);
  }

  async function connectSteps() {
    const ok = await requestStepAccess();
    setStepsAuthorized(ok);
    stepsAuthedRef.current = ok;
    if (ok) {
      setStepsAvailable(true);
      await AsyncStorage.setItem('stepsConnected', '1');
      const [today, week] = await Promise.all([getTodaySteps(), getWeeklySteps()]);
      setStepsToday(today);
      setWeeklySteps(week);
    } else {
      Alert.alert(
        'Step Tracking',
        'Could not connect to your health data. You can enable step access later in your device’s Health settings.'
      );
    }
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
  const weeklyGoal = profile.goals?.weeklySessions || null;
  const goalProgress = weeklyGoal ? Math.min(1, sessionsThisWeek / weeklyGoal) : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
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

        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <View style={styles.streakHeader}>
              <Ionicons name="flame" size={18} color={weekStreak > 0 ? COLORS.accent : COLORS.textMuted} />
              <Text style={styles.statCount}>{weekStreak}</Text>
            </View>
            <Text style={styles.statLabel}>Week streak</Text>
          </View>

          <TouchableOpacity style={styles.statCard} onPress={openGoalModal} activeOpacity={0.7}>
            {weeklyGoal ? (
              <>
                <Text style={styles.statCount}>
                  {sessionsThisWeek}<Text style={styles.statGoalTotal}>/{weeklyGoal}</Text>
                </Text>
                <Text style={styles.statLabel}>Sessions this week</Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${goalProgress * 100}%` }]} />
                </View>
              </>
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={22} color={COLORS.accent} />
                <Text style={styles.statLabel}>Set a weekly goal</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {stepsAvailable && (
          stepsAuthorized ? (
            <View style={styles.stepsCard}>
              <View style={styles.stepsIconWrap}>
                <Ionicons name="footsteps" size={22} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepsCount}>{stepsToday.toLocaleString()}</Text>
                <Text style={styles.stepsLabel}>Steps today</Text>
              </View>
              <View style={styles.stepsWeek}>
                <Text style={styles.stepsWeekCount}>{weeklySteps.toLocaleString()}</Text>
                <Text style={styles.stepsWeekLabel}>this week</Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.stepsConnect} onPress={connectSteps} activeOpacity={0.7}>
              <Ionicons name="footsteps" size={20} color={COLORS.accent} />
              <Text style={styles.stepsConnectText}>
                Connect {Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'} to track steps
              </Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          )
        )}

        <View style={{ marginBottom: 20 }}>
          <Text style={styles.upcomingTitle}>Recent Sessions</Text>
          {recentSessions.length > 0 ? (
            <>
              {recentSessions.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.upcomingCard}
                  onPress={() => navigation.navigate('SessionDetail', { sessionId: s.id })}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.upcomingDay}>{formatDate(s.date)}</Text>
                    <Text style={styles.upcomingLabel}>
                      {s.exercises?.length || 0} exercise{s.exercises?.length !== 1 ? 's' : ''}
                      {'  ·  '}
                      {totalSets(s)} set{totalSets(s) !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              ))}
              {sessions.length > 3 && (
                <TouchableOpacity
                  style={styles.seeAllBtn}
                  onPress={() => navigation.navigate('ActivityCalendar')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.seeAllText}>See all sessions</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.accent} />
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={styles.upcomingEmpty}>No sessions logged yet</Text>
          )}
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
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          if (isInactive) { showNoAccess(); return; }
          setStartPicker(true);
        }}
      >
        <Text style={styles.fabText}>Start Training</Text>
      </TouchableOpacity>

      <Modal visible={startPicker} transparent animationType="fade" onRequestClose={() => setStartPicker(false)}>
        <Pressable style={styles.centerBackdrop} onPress={() => setStartPicker(false)}>
          <View style={styles.centerModal} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Start a Workout</Text>
              <TouchableOpacity onPress={() => setStartPicker(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.pickerRow}
              onPress={() => {
                setStartPicker(false);
                navigation.navigate('NewSession', { clientId: user.uid, name: profile.fullName || 'My Session' });
              }}
            >
              <Ionicons name="add-circle-outline" size={20} color={COLORS.accent} />
              <Text style={styles.pickerRowText}>Blank Session</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>

            <Text style={styles.pickerSectionLabel}>Samples</Text>
            {SAMPLE_WORKOUTS.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={styles.pickerRow}
                onPress={() => {
                  setStartPicker(false);
                  navigation.navigate('NewSession', {
                    clientId: user.uid,
                    name: s.title,
                    initialExercises: s.exercises,
                  });
                }}
              >
                <Ionicons name="barbell-outline" size={20} color={COLORS.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerRowText}>{s.title}</Text>
                  {s.description ? <Text style={styles.pickerRowSub}>{s.description}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            ))}

            <Text style={styles.pickerSectionLabel}>From your library</Text>
            <TouchableOpacity
              style={styles.pickerRow}
              onPress={() => {
                setStartPicker(false);
                navigation.navigate('SavedWorkouts');
              }}
            >
              <Ionicons name="bookmark-outline" size={20} color={COLORS.accent} />
              <Text style={styles.pickerRowText}>Saved & Trainer Workouts</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

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
                <TouchableOpacity style={styles.settingsBtn} onPress={connectSteps}>
                  <Ionicons
                    name={stepsAuthorized ? 'checkmark-circle' : 'fitness-outline'}
                    size={18}
                    color={stepsAuthorized ? COLORS.accent : COLORS.text}
                  />
                  <Text style={styles.settingsBtnText}>
                    {stepsAuthorized
                      ? `${Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'} connected`
                      : `Connect ${Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'}`}
                  </Text>
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

      <Modal visible={goalModal} transparent animationType="fade">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.centerBackdrop} onPress={() => setGoalModal(false)}>
            <View style={styles.centerModal} onStartShouldSetResponder={() => true}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Weekly Goal</Text>
                <TouchableOpacity onPress={() => setGoalModal(false)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.fieldLabel}>Sessions per week</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 4"
                placeholderTextColor={COLORS.textMuted}
                value={goalInput}
                onChangeText={setGoalInput}
                keyboardType="number-pad"
              />
              <TouchableOpacity
                style={[styles.modalBtn, goalSaving && { opacity: 0.5 }]}
                onPress={handleSaveGoal}
                disabled={goalSaving}
              >
                <Text style={styles.modalBtnText}>{goalSaving ? 'Saving...' : 'Save Goal'}</Text>
              </TouchableOpacity>
              {profile.goals?.weeklySessions ? (
                <TouchableOpacity style={styles.settingsBack} onPress={handleClearGoal} disabled={goalSaving}>
                  <Text style={styles.settingsBackText}>Clear Goal</Text>
                </TouchableOpacity>
              ) : null}
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
  statRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 104,
  },
  streakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statCount: {
    color: COLORS.accent,
    fontSize: 36,
    fontWeight: '800',
    fontFamily: FONTS.extraBold,
  },
  statGoalTotal: {
    color: COLORS.textMuted,
    fontSize: 22,
    fontFamily: FONTS.bold,
  },
  statLabel: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: FONTS.semiBold,
    marginTop: 4,
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.border,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },

  // Steps
  stepsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepsIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accent + '1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  stepsCount: {
    color: COLORS.accent,
    fontSize: 26,
    fontWeight: '800',
    fontFamily: FONTS.extraBold,
  },
  stepsLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: FONTS.semiBold,
    marginTop: 2,
  },
  stepsWeek: {
    alignItems: 'flex-end',
  },
  stepsWeekCount: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: FONTS.bold,
  },
  stepsWeekLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  stepsConnect: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  stepsConnectText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 4,
  },
  seeAllText: {
    color: COLORS.accent,
    fontSize: 13,
    fontFamily: FONTS.semiBold,
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
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  pickerRowText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },
  pickerRowSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  pickerSectionLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: FONTS.bold,
    marginTop: 14,
    marginBottom: 2,
  },

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
