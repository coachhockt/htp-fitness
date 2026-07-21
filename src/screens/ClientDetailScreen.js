import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
  Modal, Pressable, TextInput, KeyboardAvoidingView, Platform,
  ScrollView, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../firebase';
import {
  collection, query, where, orderBy, onSnapshot,
  doc, getDoc, setDoc, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS, TYPE, RADIUS } from '../theme';
import { getSessionsRemaining, titleCaseExercise } from '../utils';
import { getExerciseSuggestions } from '../exercises';
import { showNoAccess, handledNoAccess } from '../access';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// How long to wait for a write to be acknowledged before we stop claiming
// success. On a dead/spotty connection the write can stay queued in the SDK;
// we keep the on-device draft instead of falsely reporting a save.
const SAVE_TIMEOUT_MS = 15000;
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('save-timeout')), ms)),
  ]);
}

export default function ClientDetailScreen({ route, navigation }) {
  const { clientId } = route.params;
  const { user, isInactive } = useAuth();
  const insets = useSafeAreaInsets();
  const [client, setClient] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionsModal, setSessionsModal] = useState(false);
  const [sessionsInput, setSessionsInput] = useState('');
  const [sessionsSaving, setSessionsSaving] = useState(false);
  const [isAppUser, setIsAppUser] = useState(false);

  // On-device backup of an in-progress "sessions remaining" edit, so a save
  // that fails/times out on a bad connection doesn't lose what was typed.
  const sessionsDraftKey = `htp:sessionsRemainingDraft:${user.uid}:${clientId}`;

  useEffect(() => {
    async function loadClient() {
      const [clientSnap, userSnap] = await Promise.all([
        getDoc(doc(db, 'clients', clientId)),
        getDoc(doc(db, 'users', clientId)),
      ]);
      // Linked to an app account iff a users/{clientId} doc exists (clientId is a UID).
      // This is independent of any clients/{uid} doc that editing an app user creates.
      setIsAppUser(userSnap.exists());
      if (clientSnap.exists()) {
        const data = { id: clientSnap.id, ...clientSnap.data() };
        setClient(data);
        navigation.setOptions({ title: data.name });
        return;
      }
      if (userSnap.exists()) {
        const u = userSnap.data();
        const p = u.profile || {};
        const synthetic = {
          id: clientId,
          _fromUser: true,
          firstName: p.firstName || null,
          lastName: p.lastName || null,
          name: p.fullName || u.email,
          email: u.email,
          phone: '',
          age: p.age || null,
          bodyWeight: p.bodyWeight || null,
          bodyFat: p.bodyFat || null,
          bodyHistory: p.bodyHistory || [],
          weightUpdatedAt: p.weightUpdatedAt || null,
          fatUpdatedAt: p.fatUpdatedAt || null,
          note: null,
        };
        setClient(synthetic);
        navigation.setOptions({ title: synthetic.name });
      }
    }
    loadClient();
    // Re-fetch when returning from the Profile screen so edits are reflected.
    const unsubscribe = navigation.addListener('focus', loadClient);
    return unsubscribe;
  }, [clientId]);

  function writePatch(patch) {
    const base = client?._fromUser
      ? { trainerId: user.uid, email: client.email || null }
      : {};
    return setDoc(doc(db, 'clients', clientId), { ...base, ...patch }, { merge: true });
  }

  useEffect(() => {
    const q = query(
      collection(db, 'sessions'),
      where('clientId', '==', clientId),
      orderBy('date', 'desc')
    );
    return onSnapshot(q, (snap) => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [clientId]);

  // Exercise names this client has logged before — used to rank Assign Workout suggestions.
  const pastExercises = useMemo(() => {
    const names = new Set();
    for (const s of sessions) {
      for (const ex of (s.exercises || [])) {
        if (ex?.name) names.add(ex.name);
      }
    }
    return [...names].sort();
  }, [sessions]);

  function formatDate(ts) {
    if (!ts) return 'In progress';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function totalSets(session) {
    return session.exercises?.reduce((n, ex) => n + (ex.sets?.length || 0), 0) || 0;
  }

  const recentSessions = sessions.slice(0, 3);

  function confirmAndNotify(method) {
    const currentRemaining = getSessionsRemaining(client, sessions.length);
    if (typeof currentRemaining !== 'number') {
      Alert.alert('No Sessions Set', 'Log a purchase or set remaining first.');
      return;
    }
    if (method === 'sms' && !client?.phone) {
      Alert.alert('No Phone Number', 'Add a phone number for this client first.');
      return;
    }
    if (method === 'email' && !client?.email) {
      Alert.alert('No Email', 'Add an email for this client first.');
      return;
    }
    Alert.alert(
      'Deduct 1 Session?',
      `This will deduct 1 session from ${client.name}'s remaining count and send a message with the new total.`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          onPress: async () => {
            const newDeductions = (client.manualDeductions || 0) + 1;
            const newRemaining = currentRemaining - 1;
            try {
              await writePatch({
                manualDeductions: newDeductions,
                manualDeductionsUpdatedAt: new Date().toISOString(),
                sessionsRemaining: newRemaining,
                sessionsRemainingUpdatedAt: new Date().toISOString(),
              });
              setClient(prev => ({
                ...prev,
                _fromUser: false,
                manualDeductions: newDeductions,
                sessionsRemaining: newRemaining,
              }));
              await sendNotification(method, newRemaining);
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  }

  async function sendNotification(method, remaining) {
    const firstName = client.firstName || client.name?.split(' ')[0] || 'there';
    const plural = remaining === 1 ? 'session' : 'sessions';
    const body = `Hi ${firstName}, Awesome Work today! You have ${remaining} training ${plural} left.\n\n-HTPerformance`;
    let url;
    if (method === 'sms') {
      const phone = client.phone.replace(/[^0-9+]/g, '');
      const sep = Platform.OS === 'ios' ? '&' : '?';
      url = `sms:${phone}${sep}body=${encodeURIComponent(body)}`;
    } else {
      const subject = 'Training Sessions Update';
      url = `mailto:${client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) {
        Alert.alert(
          'Cannot Open',
          method === 'sms'
            ? 'This device cannot send text messages.'
            : 'No email app is set up on this device.'
        );
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }

  function openSessionsModal() {
    const current = getSessionsRemaining(client, sessions.length);
    const fallback = typeof current === 'number' ? String(current) : '';
    AsyncStorage.getItem(sessionsDraftKey)
      .then(raw => {
        const draftValue = raw ? JSON.parse(raw)?.value : null;
        if (draftValue != null && draftValue.trim() !== '') {
          Alert.alert(
            'Resume unsaved edit?',
            "You started updating this client's sessions remaining but it never saved. Resume it, or discard and start fresh?",
            [
              {
                text: 'Discard',
                style: 'destructive',
                onPress: () => {
                  AsyncStorage.removeItem(sessionsDraftKey).catch(() => {});
                  setSessionsInput(fallback);
                  setSessionsModal(true);
                },
              },
              {
                text: 'Resume',
                onPress: () => {
                  setSessionsInput(draftValue);
                  setSessionsModal(true);
                },
              },
            ],
            { cancelable: false }
          );
        } else {
          setSessionsInput(fallback);
          setSessionsModal(true);
        }
      })
      .catch(() => {
        setSessionsInput(fallback);
        setSessionsModal(true);
      });
  }

  // Mirror the typed value to disk while the modal is open so a save that
  // fails/times out on a bad connection doesn't lose it.
  useEffect(() => {
    if (!sessionsModal) return;
    if (sessionsInput.trim() === '') {
      AsyncStorage.removeItem(sessionsDraftKey).catch(() => {});
      return;
    }
    AsyncStorage.setItem(sessionsDraftKey, JSON.stringify({ value: sessionsInput })).catch(() => {});
  }, [sessionsInput, sessionsModal]);

  async function saveSessionsRemaining() {
    const raw = sessionsInput.trim();
    if (raw === '') {
      Alert.alert('Error', 'Enter a number of sessions.');
      return;
    }
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 0) {
      Alert.alert('Error', 'Sessions remaining must be a non-negative whole number.');
      return;
    }
    setSessionsSaving(true);
    try {
      await withTimeout(writePatch({
        sessionsRemaining: n,
        sessionsRemainingUpdatedAt: new Date().toISOString(),
      }), SAVE_TIMEOUT_MS);
      setClient(prev => ({ ...prev, _fromUser: false, sessionsRemaining: n }));
      await AsyncStorage.removeItem(sessionsDraftKey).catch(() => {});
      setSessionsModal(false);
    } catch (e) {
      if (handledNoAccess(e)) return;
      // The typed value is already autosaved to disk (see effect above) — keep
      // it and tell the trainer instead of losing it or claiming success.
      setSessionsModal(false);
      Alert.alert(
        'Saved on this device',
        "Couldn't reach the server, so this update is saved on this device. Reopen \"Update Sessions\" for this client while you're online to finish saving it."
      );
    } finally {
      setSessionsSaving(false);
    }
  }

  function openAssignModal() {
    if (!isAppUser) return;
    navigation.navigate('AssignWorkout', { clientId, name });
  }

  const name = client?.name || route.params?.name || 'Client';

  return (
    <View style={styles.container}>
      <FlatList
        data={recentSessions}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <View>
            {/* Client Info Card */}
            <View style={styles.infoCard}>
              <View style={styles.infoHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{client?.firstName?.[0]?.toUpperCase() || name[0].toUpperCase()}{client?.lastName?.[0]?.toUpperCase() || ''}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoName}>
                    {name}{client?.age ? `, ${client.age}` : ''}
                  </Text>
                </View>
              </View>
              {(() => {
                const used = sessions.length + (client?.manualDeductions || 0);
                const remaining = getSessionsRemaining(client, sessions.length);
                const hasRemaining = typeof remaining === 'number';
                return (
                  <View style={styles.sessionsBox}>
                    <View style={styles.sessionsHeader}>
                      <Text style={styles.noteLabel}>Training Sessions</Text>
                      <TouchableOpacity onPress={openSessionsModal} style={styles.sessionsEditBtn}>
                        <Text style={styles.sessionsEditBtnText}>
                          {hasRemaining ? 'Edit' : '+ Add'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.sessionsStatsRow}>
                      <View style={styles.sessionsStat}>
                        <Text style={[
                          styles.sessionsStatValue,
                          hasRemaining && remaining <= 0 && { color: COLORS.danger },
                          hasRemaining && remaining > 0 && remaining <= 2 && { color: '#FF9800' },
                        ]}>
                          {hasRemaining ? remaining : '—'}
                        </Text>
                        <Text style={styles.sessionsStatLabel}>Remaining</Text>
                      </View>
                      <View style={styles.sessionsStat}>
                        <Text style={styles.sessionsStatValue}>{used}</Text>
                        <Text style={styles.sessionsStatLabel}>Used</Text>
                      </View>
                    </View>
                    {client?.purchases?.length > 0 ? (
                      <View style={styles.purchaseBtnRow}>
                        <TouchableOpacity
                          style={styles.viewHistoryBtn}
                          onPress={() => navigation.navigate('PurchaseHistory', { clientId, name, loggedCount: sessions.length })}
                        >
                          <Ionicons name="time-outline" size={16} color={COLORS.textBright} />
                          <Text style={styles.viewHistoryBtnText}>View Purchases</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                    {hasRemaining && (client?.phone || client?.email) ? (
                      <View style={styles.notifyRow}>
                        {client?.phone ? (
                          <TouchableOpacity style={styles.notifyBtn} onPress={() => confirmAndNotify('sms')}>
                            <Ionicons name="chatbubble-outline" size={16} color={COLORS.accent} />
                            <Text style={styles.notifyBtnText}>Text</Text>
                          </TouchableOpacity>
                        ) : null}
                        {client?.email ? (
                          <TouchableOpacity style={styles.notifyBtn} onPress={() => confirmAndNotify('email')}>
                            <Ionicons name="mail-outline" size={16} color={COLORS.accent} />
                            <Text style={styles.notifyBtnText}>Email</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })()}
            </View>

            <TouchableOpacity
              style={[styles.assignBtn, !isAppUser && styles.assignBtnDisabled]}
              onPress={openAssignModal}
              disabled={!isAppUser}
            >
              <Ionicons name="barbell-outline" size={18} color={isAppUser ? COLORS.accent : COLORS.textMuted} />
              <Text style={[styles.assignBtnText, !isAppUser && styles.assignBtnTextDisabled]}>Assign Workout</Text>
            </TouchableOpacity>
            {!isAppUser && (
              <Text style={styles.assignHint}>This client needs an app account to receive assigned workouts.</Text>
            )}
            <Text style={styles.sectionLabel}>Recent Sessions</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('SessionDetail', { sessionId: item.id })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.date}>{formatDate(item.date)}</Text>
              <Text style={styles.meta}>
                {item.exercises?.length || 0} exercise{item.exercises?.length !== 1 ? 's' : ''}
                {'  ·  '}
                {totalSets(item)} set{totalSets(item) !== 1 ? 's' : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
        ListFooterComponent={
          sessions.length > 3 ? (
            <TouchableOpacity
              style={styles.seeAllBtn}
              onPress={() => navigation.navigate('SessionHistory', { clientId, name })}
            >
              <Text style={styles.seeAllText}>See all {sessions.length} sessions</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.accent} />
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>{'No sessions logged yet.\nTap "+ New Session" to start.'}</Text>
        }
        contentContainerStyle={[styles.list, { paddingBottom: 96 + insets.bottom }]}
      />
      <View style={[styles.toolbar, { paddingBottom: insets.bottom || 12 }]}>
        <TouchableOpacity
          style={styles.toolbarItem}
          onPress={() => {
            if (isInactive) { showNoAccess(); return; }
            navigation.navigate('NewSession', { clientId, name });
          }}
        >
          <Ionicons name="add-circle" size={24} color={COLORS.accent} />
          <Text style={[styles.toolbarLabel, styles.toolbarLabelPrimary]} numberOfLines={1}>New Session</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.toolbarItem}
          onPress={() => navigation.navigate('PurchaseHistory', { clientId, name, loggedCount: sessions.length })}
        >
          <Ionicons name="cash-outline" size={24} color={COLORS.textBright} />
          <Text style={styles.toolbarLabel} numberOfLines={1}>Log Purchase</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.toolbarItem}
          onPress={() => navigation.navigate('Progress', { clientId, name })}
        >
          <Ionicons name="stats-chart-outline" size={24} color={COLORS.textBright} />
          <Text style={styles.toolbarLabel} numberOfLines={1}>Progress</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.toolbarItem}
          onPress={() => navigation.navigate('ClientProfile', { clientId, name })}
        >
          <Ionicons name="person-outline" size={24} color={COLORS.textBright} />
          <Text style={styles.toolbarLabel} numberOfLines={1}>Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Edit Sessions Remaining Modal */}
      <Modal visible={sessionsModal} transparent animationType="fade" onRequestClose={() => setSessionsModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.centerBackdrop} onPress={() => setSessionsModal(false)}>
            <Pressable style={styles.sessionsModalContent} onPress={() => {}}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Remaining</Text>
                <TouchableOpacity onPress={() => setSessionsModal(false)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.fieldLabel}>Sessions Remaining</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 10"
                placeholderTextColor={COLORS.textMuted}
                value={sessionsInput}
                onChangeText={setSessionsInput}
                keyboardType="number-pad"
                autoFocus
              />
              <Text style={styles.sessionsHint}>
                Use Log Purchase to add new sessions. This sets the remaining count directly.
              </Text>
              <TouchableOpacity
                style={styles.modalBtn}
                onPress={saveSessionsRemaining}
                disabled={sessionsSaving}
              >
                <Text style={styles.modalBtnText}>{sessionsSaving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: 20, paddingBottom: 40 },

  // Client info card
  infoCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: { color: '#000', fontWeight: '800', fontSize: TYPE.title, fontFamily: FONTS.extraBold },
  infoName: { color: COLORS.textBright, fontWeight: '700', fontSize: TYPE.heading, fontFamily: FONTS.bold },
  infoDetail: { color: COLORS.textMuted, fontSize: TYPE.body, marginTop: 2, fontFamily: FONTS.regular },
  editBtn: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  editBtnText: { color: COLORS.accent, fontWeight: '700', fontSize: TYPE.label, fontFamily: FONTS.bold },
  bodyStatsRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    gap: 16,
  },
  bodyStat: { flex: 1 },
  bodyStatLabel: { color: COLORS.textMuted, fontSize: TYPE.caption, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4, fontFamily: FONTS.bold },
  bodyStatValue: { color: COLORS.textBright, fontSize: TYPE.heading, fontWeight: '700', fontFamily: FONTS.bold },
  bodyStatSub: { color: COLORS.textMuted, fontSize: TYPE.caption, marginTop: 2, fontFamily: FONTS.regular },
  noteBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  noteLabel: { color: COLORS.textMuted, fontSize: TYPE.caption, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4, fontFamily: FONTS.bold },
  noteText: { color: COLORS.textBright, fontSize: TYPE.body, lineHeight: 20, fontFamily: FONTS.regular },
  sessionCount: { color: COLORS.textMuted, fontSize: TYPE.label, marginTop: 12, fontFamily: FONTS.regular },
  sessionsBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  sessionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sessionsEditBtn: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sessionsEditBtnText: {
    color: COLORS.accent,
    fontWeight: '700',
    fontSize: TYPE.label,
    fontFamily: FONTS.bold,
  },
  sessionsStatsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sessionsStat: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sessionsStatValue: {
    color: COLORS.textBright,
    fontSize: TYPE.title,
    fontWeight: '800',
    fontFamily: FONTS.extraBold,
  },
  sessionsStatLabel: {
    color: COLORS.textMuted,
    fontSize: TYPE.caption,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 4,
    fontFamily: FONTS.bold,
  },
  purchaseBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  logPurchaseBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent + '22',
  },
  logPurchaseBtnText: {
    color: COLORS.accent,
    fontSize: TYPE.label,
    fontFamily: FONTS.bold,
  },
  viewHistoryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  viewHistoryBtnText: {
    color: COLORS.textBright,
    fontSize: TYPE.label,
    fontFamily: FONTS.semiBold,
  },
  historyModalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 480,
    maxHeight: '80%',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  purchaseDate: {
    color: COLORS.textBright,
    fontSize: TYPE.body,
    fontFamily: FONTS.semiBold,
  },
  purchaseMeta: {
    color: COLORS.textMuted,
    fontSize: TYPE.label,
    marginTop: 3,
    fontFamily: FONTS.regular,
  },
  purchaseRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginLeft: 12,
  },
  purchaseActionBtn: {
    padding: 4,
  },
  notifyRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  notifyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
    backgroundColor: COLORS.accent + '12',
  },
  notifyBtnText: {
    color: COLORS.accent,
    fontSize: TYPE.label,
    fontFamily: FONTS.semiBold,
  },
  sessionsModalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  sessionsHint: {
    color: COLORS.textMuted,
    fontSize: TYPE.label,
    fontFamily: FONTS.regular,
    marginBottom: 16,
    marginTop: -4,
  },

  // Action buttons
  actions: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  primaryBtn: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#000', fontWeight: '800', fontSize: TYPE.body, fontFamily: FONTS.extraBold },
  secondaryBtn: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryBtnText: { color: COLORS.textBright, fontWeight: '600', fontSize: TYPE.body, fontFamily: FONTS.semiBold },

  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: TYPE.caption,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    fontFamily: FONTS.bold,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 11,
    padding: 14,
    marginBottom: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  date: { color: COLORS.textBright, fontWeight: '600', fontSize: TYPE.body, fontFamily: FONTS.semiBold },
  meta: { color: COLORS.textMuted, fontSize: TYPE.label, marginTop: 3, fontFamily: FONTS.regular },
  deleteBtn: {
    position: 'absolute',
    top: 8,
    right: 10,
    padding: 4,
  },
  deleteBtnText: {
    color: COLORS.textMuted,
    fontSize: TYPE.caption,
    fontFamily: FONTS.semiBold,
  },
  empty: {
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 48,
    fontSize: TYPE.body,
    lineHeight: 24,
    fontFamily: FONTS.regular,
  },

  // Date search
  dateSearchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  dateToText: {
    color: COLORS.textMuted,
    fontSize: TYPE.label,
    fontFamily: FONTS.regular,
    alignSelf: 'center',
  },
  dateInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 12,
    color: COLORS.textBright,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: TYPE.label,
    fontFamily: FONTS.regular,
  },
  dateSearchActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  searchBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  searchBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: TYPE.label,
    fontFamily: FONTS.bold,
  },
  clearBtn: {
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  clearBtnText: {
    color: COLORS.textMuted,
    fontWeight: '600',
    fontSize: TYPE.label,
    fontFamily: FONTS.semiBold,
  },
  filterInfo: {
    color: COLORS.accent,
    fontSize: TYPE.caption,
    fontFamily: FONTS.regular,
    marginBottom: 12,
  },
  dateInputText: { color: COLORS.textBright, fontSize: TYPE.label, fontFamily: FONTS.regular },
  dateInputPlaceholder: { color: COLORS.textMuted, fontSize: TYPE.label, fontFamily: FONTS.regular },
  pickerOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  pickerContainer: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 16, width: '90%' },
  pickerDone: { alignItems: 'center', padding: 12, marginTop: 8 },
  pickerDoneText: { color: COLORS.accent, fontSize: TYPE.body, fontWeight: '700', fontFamily: FONTS.bold },

  // Pagination
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    gap: 12,
  },
  pageBtn: {
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pageBtnDisabled: {
    opacity: 0.3,
  },
  pageBtnText: {
    color: COLORS.textBright,
    fontSize: TYPE.label,
    fontFamily: FONTS.semiBold,
  },
  pageBtnTextDisabled: {
    color: COLORS.textMuted,
  },
  currentBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  currentBtnText: {
    color: '#000',
    fontSize: TYPE.label,
    fontWeight: '700',
    fontFamily: FONTS.bold,
  },
  pageInfo: {
    color: COLORS.textMuted,
    fontSize: TYPE.label,
    fontFamily: FONTS.regular,
  },

  // Edit modal
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  modal: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 48,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: COLORS.textBright, fontSize: TYPE.title, fontWeight: '700', fontFamily: FONTS.bold },
  closeBtn: { padding: 4 },
  closeBtnText: { color: COLORS.textMuted, fontSize: TYPE.title, fontWeight: '600', fontFamily: FONTS.semiBold },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 14,
    color: COLORS.textBright,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: TYPE.body,
    fontFamily: FONTS.regular,
  },
  fieldLabel: { color: COLORS.textMuted, fontSize: TYPE.label, fontFamily: FONTS.semiBold, marginBottom: 6, marginLeft: 4 },
  lastUpdated: { color: COLORS.accent, fontSize: TYPE.caption, fontFamily: FONTS.regular, marginBottom: 6, marginLeft: 4 },
  nameRow: { flexDirection: 'row', gap: 10 },
  noteInput: { height: 80, paddingTop: 14 },
  modalBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  modalBtnText: { color: '#000', fontWeight: '800', fontSize: TYPE.heading, fontFamily: FONTS.extraBold },

  // Assign Workout
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
  },
  assignBtnText: {
    color: COLORS.accent,
    fontSize: TYPE.body,
    fontFamily: FONTS.semiBold,
  },
  assignBtnDisabled: {
    borderColor: COLORS.border,
    opacity: 0.6,
    marginBottom: 8,
  },
  assignBtnTextDisabled: {
    color: COLORS.textMuted,
  },
  assignHint: {
    color: COLORS.textMuted,
    fontSize: TYPE.label,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    marginBottom: 28,
  },
  centerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  assignModalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxHeight: '85%',
  },
  assignExBlock: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  suggestionsBox: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 6,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  suggestionText: { color: COLORS.textBright, fontSize: TYPE.body, fontFamily: FONTS.regular },
  suggestionBadge: {
    color: COLORS.accent,
    fontSize: TYPE.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: FONTS.bold,
  },
  assignSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  assignSetLabel: {
    color: COLORS.textMuted,
    fontSize: TYPE.label,
    fontFamily: FONTS.semiBold,
    width: 36,
  },
  assignSetInput: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 10,
    color: COLORS.textBright,
    fontSize: TYPE.body,
    fontFamily: FONTS.regular,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: 70,
    textAlign: 'center',
  },
  assignSetX: {
    color: COLORS.textMuted,
    fontSize: TYPE.body,
    fontFamily: FONTS.regular,
  },
  assignAddSet: {
    marginTop: 8,
    alignItems: 'center',
  },
  assignAddSetText: {
    color: COLORS.textMuted,
    fontSize: TYPE.label,
    fontFamily: FONTS.semiBold,
  },
  assignAddEx: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
    padding: 10,
  },
  assignAddExText: {
    color: COLORS.accent,
    fontSize: TYPE.body,
    fontFamily: FONTS.semiBold,
  },

  // Recent sessions footer
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 14,
    marginTop: 2,
  },
  seeAllText: {
    color: COLORS.accent,
    fontSize: TYPE.body,
    fontFamily: FONTS.semiBold,
  },

  // Pinned bottom action toolbar
  toolbar: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    paddingTop: 10,
  },
  toolbarItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  toolbarLabel: {
    color: COLORS.textBright,
    fontSize: TYPE.caption,
    fontFamily: FONTS.semiBold,
  },
  toolbarLabelPrimary: {
    color: COLORS.accent,
  },
});
