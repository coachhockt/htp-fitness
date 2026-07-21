import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
  Modal, Pressable, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS, TYPE, RADIUS } from '../theme';
import { getSessionsRemaining } from '../utils';
import { handledNoAccess } from '../access';
import DateTimePicker from '@react-native-community/datetimepicker';

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

export default function PurchaseHistoryScreen({ route, navigation }) {
  const { clientId } = route.params;
  const loggedCount = route.params?.loggedCount || 0;
  const { user } = useAuth();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);

  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [filtering, setFiltering] = useState(false);

  const [purchaseModal, setPurchaseModal] = useState(false);
  const [purchaseDate, setPurchaseDate] = useState(new Date());
  const [showPurchaseDatePicker, setShowPurchaseDatePicker] = useState(false);
  const [purchaseSessions, setPurchaseSessions] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseSaving, setPurchaseSaving] = useState(false);
  const [editingPurchaseIndex, setEditingPurchaseIndex] = useState(null);

  // On-device backup of an in-progress purchase entry, so a save that
  // fails/times out on a bad connection doesn't lose what was typed.
  const purchaseDraftKey = `htp:purchaseDraft:${user.uid}:${clientId}`;

  useEffect(() => {
    (async () => {
      const [clientSnap, userSnap] = await Promise.all([
        getDoc(doc(db, 'clients', clientId)),
        getDoc(doc(db, 'users', clientId)),
      ]);
      if (clientSnap.exists()) {
        setClient({ id: clientSnap.id, ...clientSnap.data() });
      } else if (userSnap.exists()) {
        const u = userSnap.data();
        const p = u.profile || {};
        setClient({
          id: clientId,
          _fromUser: true,
          name: p.fullName || u.email,
          email: u.email,
          purchases: [],
        });
      }
      setLoading(false);
    })();
  }, [clientId]);

  function writePatch(patch) {
    const base = client?._fromUser
      ? { trainerId: user.uid, email: client.email || null }
      : {};
    return setDoc(doc(db, 'clients', clientId), { ...base, ...patch }, { merge: true });
  }

  // Applies the given fields and opens the modal (shared by the fresh-open
  // and resume-draft paths so they can't drift).
  function applyPurchaseFields(index, { date, sessions, price }) {
    setEditingPurchaseIndex(index);
    setPurchaseDate(date);
    setPurchaseSessions(sessions);
    setPurchasePrice(price);
    setPurchaseModal(true);
  }

  // Before opening the modal, check for an on-device draft left behind by a
  // save that failed/timed out on a bad connection, and offer to resume it.
  function checkDraftThenOpenPurchase(index, fallback) {
    AsyncStorage.getItem(purchaseDraftKey)
      .then(raw => {
        const draft = raw ? JSON.parse(raw) : null;
        const hasContent = draft && (draft.sessions?.trim() || draft.price?.trim());
        if (draft && draft.editingPurchaseIndex === index && hasContent) {
          Alert.alert(
            'Resume unsaved entry?',
            'You started logging a purchase for this client but it never saved. Resume it, or discard and start fresh?',
            [
              {
                text: 'Discard',
                style: 'destructive',
                onPress: () => {
                  AsyncStorage.removeItem(purchaseDraftKey).catch(() => {});
                  applyPurchaseFields(index, fallback);
                },
              },
              {
                text: 'Resume',
                onPress: () => {
                  const d = new Date(draft.date);
                  applyPurchaseFields(index, {
                    date: isNaN(d.getTime()) ? fallback.date : d,
                    sessions: draft.sessions || '',
                    price: draft.price || '',
                  });
                },
              },
            ],
            { cancelable: false }
          );
        } else {
          applyPurchaseFields(index, fallback);
        }
      })
      .catch(() => applyPurchaseFields(index, fallback));
  }

  function openPurchaseModal() {
    checkDraftThenOpenPurchase(null, { date: new Date(), sessions: '', price: '' });
  }

  function openEditPurchaseModal(index) {
    const p = client?.purchases?.[index];
    if (!p) return;
    const d = new Date(p.date);
    checkDraftThenOpenPurchase(index, {
      date: isNaN(d.getTime()) ? new Date() : d,
      sessions: p.sessions != null ? String(p.sessions) : '',
      price: p.pricePerSession != null ? String(p.pricePerSession) : '',
    });
  }

  // Mirror the in-progress entry to disk while the modal is open.
  useEffect(() => {
    if (!purchaseModal) return;
    if (purchaseSessions.trim() === '' && purchasePrice.trim() === '') {
      AsyncStorage.removeItem(purchaseDraftKey).catch(() => {});
      return;
    }
    AsyncStorage.setItem(purchaseDraftKey, JSON.stringify({
      editingPurchaseIndex,
      date: purchaseDate.toISOString(),
      sessions: purchaseSessions,
      price: purchasePrice,
    })).catch(() => {});
  }, [purchaseDate, purchaseSessions, purchasePrice, editingPurchaseIndex, purchaseModal]);

  // Closing without saving (X button, backdrop tap, hardware back) is an
  // explicit cancel — discard the field state and the on-device draft.
  function closePurchaseModal() {
    setPurchaseModal(false);
    setEditingPurchaseIndex(null);
    AsyncStorage.removeItem(purchaseDraftKey).catch(() => {});
  }

  async function savePurchase() {
    const sessionsCount = parseInt(purchaseSessions.trim(), 10);
    if (isNaN(sessionsCount) || sessionsCount <= 0) {
      Alert.alert('Error', 'Enter a valid number of sessions.');
      return;
    }
    const price = parseFloat(purchasePrice.trim());
    if (isNaN(price) || price < 0) {
      Alert.alert('Error', 'Enter a valid price per session.');
      return;
    }
    setPurchaseSaving(true);
    try {
      const currentRemaining = getSessionsRemaining(client, loggedCount) || 0;
      let newPurchases, newRemaining;
      if (editingPurchaseIndex === null) {
        const entry = {
          date: purchaseDate.toISOString(),
          sessions: sessionsCount,
          pricePerSession: price,
          createdAt: new Date().toISOString(),
        };
        newPurchases = [...(client.purchases || []), entry];
        newRemaining = currentRemaining + sessionsCount;
      } else {
        const old = client.purchases[editingPurchaseIndex];
        const entry = {
          date: purchaseDate.toISOString(),
          sessions: sessionsCount,
          pricePerSession: price,
          createdAt: old?.createdAt || new Date().toISOString(),
        };
        newPurchases = client.purchases.map((p, i) => i === editingPurchaseIndex ? entry : p);
        newRemaining = currentRemaining + (sessionsCount - (old?.sessions || 0));
      }
      await withTimeout(writePatch({
        purchases: newPurchases,
        sessionsRemaining: newRemaining,
        sessionsRemainingUpdatedAt: new Date().toISOString(),
      }), SAVE_TIMEOUT_MS);
      setClient(prev => ({ ...prev, _fromUser: false, purchases: newPurchases, sessionsRemaining: newRemaining }));
      await AsyncStorage.removeItem(purchaseDraftKey).catch(() => {});
      setPurchaseModal(false);
      setEditingPurchaseIndex(null);
    } catch (e) {
      if (handledNoAccess(e)) return;
      // The entry is already autosaved to disk (see effect above) — keep it
      // and tell the trainer instead of losing it or claiming success.
      setPurchaseModal(false);
      Alert.alert(
        'Saved on this device',
        "Couldn't reach the server, so this entry is saved on this device. Reopen \"Log Purchase\" for this client while you're online to finish saving it."
      );
    } finally {
      setPurchaseSaving(false);
    }
  }

  function confirmDeletePurchase(index) {
    const p = client?.purchases?.[index];
    if (!p) return;
    const d = new Date(p.date);
    const dateStr = isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const summary = `${dateStr ? dateStr + ' · ' : ''}${p.sessions} session${p.sessions !== 1 ? 's' : ''} @ $${p.pricePerSession}`;
    Alert.alert(
      'Delete Purchase?',
      summary,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deletePurchase(index) },
      ]
    );
  }

  async function deletePurchase(index) {
    const old = client?.purchases?.[index];
    if (!old) return;
    try {
      const newPurchases = client.purchases.filter((_, i) => i !== index);
      const currentRemaining = getSessionsRemaining(client, loggedCount) || 0;
      const newRemaining = currentRemaining - (old.sessions || 0);
      await writePatch({
        purchases: newPurchases,
        sessionsRemaining: newRemaining,
        sessionsRemainingUpdatedAt: new Date().toISOString(),
      });
      setClient(prev => ({ ...prev, _fromUser: false, purchases: newPurchases, sessionsRemaining: newRemaining }));
    } catch (e) {
      if (!handledNoAccess(e)) Alert.alert('Error', e.message);
    }
  }

  function applyDateFilter() {
    if (!fromDate || !toDate) {
      Alert.alert('Select Dates', 'Please select both a start and end date.');
      return;
    }
    if (toDate < fromDate) {
      Alert.alert('Invalid Range', 'End date must be after start date.');
      return;
    }
    setFiltering(true);
  }

  function clearFilter() {
    setFromDate(null);
    setToDate(null);
    setFiltering(false);
  }

  function formatPickedDate(date) {
    if (!date) return 'Select date';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const indexed = (client?.purchases || []).map((p, i) => ({ ...p, _originalIndex: i }));
  const filteredPurchases = (filtering
    ? indexed.filter(p => {
        if (!p.date) return false;
        const d = new Date(p.date);
        if (isNaN(d.getTime())) return false;
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        return d >= fromDate && d <= to;
      })
    : indexed
  ).sort((a, b) => new Date(b.date) - new Date(a.date));

  const remaining = getSessionsRemaining(client, loggedCount);
  const totalSpent = (client?.purchases || []).reduce(
    (sum, p) => sum + (p.sessions || 0) * (p.pricePerSession || 0), 0
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredPurchases}
        keyExtractor={item => String(item._originalIndex)}
        ListHeaderComponent={
          <View>
            {/* Summary */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryValue}>{typeof remaining === 'number' ? remaining : '—'}</Text>
                <Text style={styles.summaryLabel}>Remaining</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryStat}>
                <Text style={styles.summaryValue}>${totalSpent.toFixed(0)}</Text>
                <Text style={styles.summaryLabel}>Total Spent</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.logBtn} onPress={openPurchaseModal}>
              <Ionicons name="add-circle-outline" size={18} color="#000" />
              <Text style={styles.logBtnText}>Log Purchase</Text>
            </TouchableOpacity>

            {/* Date Range Search */}
            <View style={styles.dateSearchRow}>
              <TouchableOpacity style={styles.dateInput} onPress={() => setShowFromPicker(true)}>
                <Text style={fromDate ? styles.dateInputText : styles.dateInputPlaceholder}>
                  {formatPickedDate(fromDate)}
                </Text>
              </TouchableOpacity>
              <Text style={styles.dateToText}>to</Text>
              <TouchableOpacity style={styles.dateInput} onPress={() => setShowToPicker(true)}>
                <Text style={toDate ? styles.dateInputText : styles.dateInputPlaceholder}>
                  {formatPickedDate(toDate)}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dateSearchActions}>
              <TouchableOpacity style={styles.searchBtn} onPress={applyDateFilter}>
                <Text style={styles.searchBtnText}>Search</Text>
              </TouchableOpacity>
              {filtering && (
                <TouchableOpacity style={styles.clearBtn} onPress={clearFilter}>
                  <Text style={styles.clearBtnText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            {filtering && (
              <Text style={styles.filterInfo}>
                Showing {filteredPurchases.length} purchase{filteredPurchases.length !== 1 ? 's' : ''} from {formatPickedDate(fromDate)} to {formatPickedDate(toDate)}
              </Text>
            )}
            {showFromPicker && (
              Platform.OS === 'ios' ? (
                <Modal transparent animationType="fade">
                  <Pressable style={styles.pickerOverlay} onPress={() => setShowFromPicker(false)}>
                    <View style={styles.pickerContainer} onStartShouldSetResponder={() => true}>
                      <DateTimePicker
                        maximumDate={new Date()}
                        value={fromDate || new Date()}
                        mode="date"
                        display="inline"
                        onChange={(event, date) => { if (date) setFromDate(date); }}
                        themeVariant="dark"
                      />
                      <TouchableOpacity style={styles.pickerDone} onPress={() => setShowFromPicker(false)}>
                        <Text style={styles.pickerDoneText}>Done</Text>
                      </TouchableOpacity>
                    </View>
                  </Pressable>
                </Modal>
              ) : (
                <DateTimePicker
                  maximumDate={new Date()}
                  value={fromDate || new Date()}
                  mode="date"
                  display="default"
                  onChange={(event, date) => { setShowFromPicker(false); if (date) setFromDate(date); }}
                />
              )
            )}
            {showToPicker && (
              Platform.OS === 'ios' ? (
                <Modal transparent animationType="fade">
                  <Pressable style={styles.pickerOverlay} onPress={() => setShowToPicker(false)}>
                    <View style={styles.pickerContainer} onStartShouldSetResponder={() => true}>
                      <DateTimePicker
                        maximumDate={new Date()}
                        value={toDate || new Date()}
                        mode="date"
                        display="inline"
                        onChange={(event, date) => { if (date) setToDate(date); }}
                        themeVariant="dark"
                      />
                      <TouchableOpacity style={styles.pickerDone} onPress={() => setShowToPicker(false)}>
                        <Text style={styles.pickerDoneText}>Done</Text>
                      </TouchableOpacity>
                    </View>
                  </Pressable>
                </Modal>
              ) : (
                <DateTimePicker
                  maximumDate={new Date()}
                  value={toDate || new Date()}
                  mode="date"
                  display="default"
                  onChange={(event, date) => { setShowToPicker(false); if (date) setToDate(date); }}
                />
              )
            )}
          </View>
        }
        renderItem={({ item }) => {
          const d = new Date(item.date);
          const dateStr = isNaN(d.getTime())
            ? '—'
            : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const total = (item.sessions || 0) * (item.pricePerSession || 0);
          return (
            <View style={styles.purchaseRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.purchaseDate}>{dateStr}</Text>
                <Text style={styles.purchaseMeta}>
                  {item.sessions} session{item.sessions !== 1 ? 's' : ''} @ ${item.pricePerSession} = ${total}
                </Text>
              </View>
              <View style={styles.purchaseRowActions}>
                <TouchableOpacity
                  style={styles.purchaseActionBtn}
                  onPress={() => openEditPurchaseModal(item._originalIndex)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="pencil-outline" size={18} color={COLORS.accent} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.purchaseActionBtn}
                  onPress={() => confirmDeletePurchase(item._originalIndex)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>{filtering ? 'No purchases in this date range.' : 'No purchases logged yet.'}</Text>
        }
        contentContainerStyle={styles.list}
      />

      {/* Log / Edit Purchase Modal */}
      <Modal visible={purchaseModal} transparent animationType="fade" onRequestClose={closePurchaseModal}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.centerBackdrop} onPress={closePurchaseModal}>
            <Pressable style={styles.modalContent} onPress={() => {}}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingPurchaseIndex === null ? 'Log Purchase' : 'Edit Purchase'}</Text>
                <TouchableOpacity onPress={closePurchaseModal} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.fieldLabel}>Date</Text>
              <TouchableOpacity style={styles.input} onPress={() => setShowPurchaseDatePicker(true)}>
                <Text style={{ color: COLORS.textBright, fontSize: TYPE.body, fontFamily: FONTS.regular }}>
                  {purchaseDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </TouchableOpacity>
              {showPurchaseDatePicker && (
                Platform.OS === 'ios' ? (
                  <Modal transparent animationType="fade">
                    <Pressable style={styles.pickerOverlay} onPress={() => setShowPurchaseDatePicker(false)}>
                      <View style={styles.pickerContainer} onStartShouldSetResponder={() => true}>
                        <DateTimePicker
                          maximumDate={new Date()}
                          value={purchaseDate}
                          mode="date"
                          display="inline"
                          onChange={(event, date) => { if (date) setPurchaseDate(date); }}
                          themeVariant="dark"
                        />
                        <TouchableOpacity style={styles.pickerDone} onPress={() => setShowPurchaseDatePicker(false)}>
                          <Text style={styles.pickerDoneText}>Done</Text>
                        </TouchableOpacity>
                      </View>
                    </Pressable>
                  </Modal>
                ) : (
                  <DateTimePicker
                    maximumDate={new Date()}
                    value={purchaseDate}
                    mode="date"
                    display="default"
                    onChange={(event, date) => { setShowPurchaseDatePicker(false); if (date) setPurchaseDate(date); }}
                  />
                )
              )}
              <Text style={styles.fieldLabel}>Number of Sessions</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 10"
                placeholderTextColor={COLORS.textMuted}
                value={purchaseSessions}
                onChangeText={setPurchaseSessions}
                keyboardType="number-pad"
              />
              <Text style={styles.fieldLabel}>Price per Session ($)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 80"
                placeholderTextColor={COLORS.textMuted}
                value={purchasePrice}
                onChangeText={setPurchasePrice}
                keyboardType="decimal-pad"
              />
              {(() => {
                const s = parseInt(purchaseSessions, 10);
                const p = parseFloat(purchasePrice);
                if (!isNaN(s) && !isNaN(p) && s > 0 && p >= 0) {
                  return <Text style={styles.sessionsHint}>Total: ${(s * p).toFixed(2)}</Text>;
                }
                return null;
              })()}
              <TouchableOpacity style={styles.modalBtn} onPress={savePurchase} disabled={purchaseSaving}>
                <Text style={styles.modalBtnText}>
                  {purchaseSaving ? 'Saving...' : editingPurchaseIndex === null ? 'Save Purchase' : 'Save Changes'}
                </Text>
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  list: { padding: 20, paddingBottom: 40 },
  empty: { color: COLORS.textMuted, textAlign: 'center', marginTop: 48, fontSize: TYPE.body, lineHeight: 24, fontFamily: FONTS.regular },

  // Summary
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: COLORS.border },
  summaryValue: { color: COLORS.textBright, fontSize: TYPE.title, fontWeight: '800', fontFamily: FONTS.extraBold },
  summaryLabel: { color: COLORS.textMuted, fontSize: TYPE.caption, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4, fontFamily: FONTS.bold },

  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 20,
  },
  logBtnText: { color: '#000', fontWeight: '800', fontSize: TYPE.body, fontFamily: FONTS.extraBold },

  // Date search
  dateSearchRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  dateToText: { color: COLORS.textMuted, fontSize: TYPE.label, fontFamily: FONTS.regular, alignSelf: 'center' },
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
  dateSearchActions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  searchBtn: { backgroundColor: COLORS.accent, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  searchBtnText: { color: '#000', fontWeight: '700', fontSize: TYPE.label, fontFamily: FONTS.bold },
  clearBtn: { borderColor: COLORS.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  clearBtnText: { color: COLORS.textMuted, fontWeight: '600', fontSize: TYPE.label, fontFamily: FONTS.semiBold },
  filterInfo: { color: COLORS.accent, fontSize: TYPE.caption, fontFamily: FONTS.regular, marginBottom: 12 },
  dateInputText: { color: COLORS.textBright, fontSize: TYPE.label, fontFamily: FONTS.regular },
  dateInputPlaceholder: { color: COLORS.textMuted, fontSize: TYPE.label, fontFamily: FONTS.regular },
  pickerOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  pickerContainer: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 16, width: '90%' },
  pickerDone: { alignItems: 'center', padding: 12, marginTop: 8 },
  pickerDoneText: { color: COLORS.accent, fontSize: TYPE.body, fontWeight: '700', fontFamily: FONTS.bold },

  // Purchase rows
  purchaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 11,
    padding: 14,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  purchaseDate: { color: COLORS.textBright, fontSize: TYPE.body, fontFamily: FONTS.semiBold },
  purchaseMeta: { color: COLORS.textMuted, fontSize: TYPE.label, marginTop: 3, fontFamily: FONTS.regular },
  purchaseRowActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 12 },
  purchaseActionBtn: { padding: 4 },

  // Modal
  centerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: COLORS.card, borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: COLORS.textBright, fontSize: TYPE.title, fontWeight: '700', fontFamily: FONTS.bold },
  closeBtn: { padding: 4 },
  closeBtnText: { color: COLORS.textMuted, fontSize: TYPE.title, fontWeight: '600', fontFamily: FONTS.semiBold },
  fieldLabel: { color: COLORS.textMuted, fontSize: TYPE.label, fontFamily: FONTS.semiBold, marginBottom: 6, marginLeft: 4 },
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
  sessionsHint: { color: COLORS.textMuted, fontSize: TYPE.label, fontFamily: FONTS.regular, marginBottom: 16, marginTop: -4 },
  modalBtn: { backgroundColor: COLORS.accent, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
  modalBtnText: { color: '#000', fontWeight: '800', fontSize: TYPE.heading, fontFamily: FONTS.extraBold },
});
