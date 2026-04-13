import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
  Modal, Pressable, TextInput, KeyboardAvoidingView, Platform,
  Keyboard, TouchableWithoutFeedback, ScrollView,
} from 'react-native';
import { db } from '../../firebase';
import {
  collection, query, where, orderBy, onSnapshot,
  doc, deleteDoc, getDoc, updateDoc,
} from 'firebase/firestore';
import { COLORS, FONTS } from '../theme';
import DateTimePicker from '@react-native-community/datetimepicker';

const PAGE_SIZE = 10;

export default function ClientDetailScreen({ route, navigation }) {
  const { clientId } = route.params;
  const [client, setClient] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [page, setPage] = useState(0);
  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editFat, setEditFat] = useState('');
  const [editNote, setEditNote] = useState('');

  useEffect(() => {
    getDoc(doc(db, 'clients', clientId)).then(d => {
      if (d.exists()) {
        const data = { id: d.id, ...d.data() };
        setClient(data);
        navigation.setOptions({ title: data.name });
      }
    });
  }, [clientId]);

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

  function formatDate(ts) {
    if (!ts) return 'In progress';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function totalSets(session) {
    return session.exercises?.reduce((n, ex) => n + (ex.sets?.length || 0), 0) || 0;
  }

  function confirmDelete(session) {
    Alert.alert(
      'Delete Session',
      `Delete the session from ${formatDate(session.date)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteDoc(doc(db, 'sessions', session.id)),
        },
      ]
    );
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
    const diffDays = (toDate - fromDate) / (1000 * 60 * 60 * 24);
    if (diffDays > 14) {
      Alert.alert('Range Too Large', 'Maximum search range is 2 weeks.');
      return;
    }
    setFiltering(true);
    setPage(0);
  }

  function clearFilter() {
    setFromDate(null);
    setToDate(null);
    setFiltering(false);
    setPage(0);
  }

  function formatPickedDate(date) {
    if (!date) return 'Select date';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const filteredSessions = filtering
    ? sessions.filter(s => {
        if (!s.date) return false;
        const d = s.date.toDate ? s.date.toDate() : new Date(s.date);
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        return d >= fromDate && d <= to;
      })
    : sessions;

  const totalPages = Math.ceil(filteredSessions.length / PAGE_SIZE);
  const pagedSessions = filteredSessions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function goToCurrentDate() {
    if (filtering) { clearFilter(); }
    setPage(0);
  }

  function openEditModal() {
    setEditFirst(client.firstName || client.name?.split(' ')[0] || '');
    setEditLast(client.lastName || client.name?.split(' ').slice(1).join(' ') || '');
    setEditPhone(client.phone || '');
    setEditAge(client.age ? String(client.age) : '');
    setEditWeight(client.bodyWeight ? String(client.bodyWeight) : '');
    setEditFat(client.bodyFat ? String(client.bodyFat) : '');
    setEditNote(client.note || '');
    setEditModal(true);
  }

  async function saveClientEdit() {
    if (!editFirst.trim()) return;
    const fullName = editLast.trim()
      ? `${editFirst.trim()} ${editLast.trim()}`
      : editFirst.trim();
    const newWeight = editWeight.trim() ? parseFloat(editWeight.trim()) : null;
    const newFat = editFat.trim() ? parseFloat(editFat.trim()) : null;
    const weightChanged = newWeight !== (client.bodyWeight || null);
    const fatChanged = newFat !== (client.bodyFat || null);

    const updated = {
      firstName: editFirst.trim(),
      lastName: editLast.trim() || null,
      name: fullName,
      phone: editPhone.trim(),
      age: editAge.trim() ? parseInt(editAge.trim()) : null,
      bodyWeight: newWeight,
      bodyFat: newFat,
      note: editNote.trim() || null,
    };

    if (weightChanged) {
      updated.weightUpdatedAt = new Date().toISOString();
    }
    if (fatChanged) {
      updated.fatUpdatedAt = new Date().toISOString();
    }
    if (weightChanged || fatChanged) {
      const today = new Date().toISOString().split('T')[0];
      const history = [...(client.bodyHistory || [])];
      const todayIdx = history.findIndex(e => e.date.split('T')[0] === today);
      const entry = todayIdx >= 0 ? { ...history[todayIdx] } : { date: new Date().toISOString() };
      if (weightChanged && newWeight !== null) entry.bodyWeight = newWeight;
      if (fatChanged && newFat !== null) entry.bodyFat = newFat;
      if (todayIdx >= 0) {
        history[todayIdx] = entry;
      } else {
        history.push(entry);
      }
      updated.bodyHistory = history;
    }
    await updateDoc(doc(db, 'clients', clientId), updated);
    setClient(prev => ({ ...prev, ...updated }));
    navigation.setOptions({ title: updated.name });
    setEditModal(false);
  }

  const name = client?.name || route.params?.name || 'Client';

  return (
    <View style={styles.container}>
      <FlatList
        data={sessions}
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
                <TouchableOpacity onPress={openEditModal} style={styles.editBtn}>
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
              </View>
              {client?.note ? (
                <View style={styles.noteBox}>
                  <Text style={styles.noteLabel}>Notes</Text>
                  <Text style={styles.noteText}>{client.note}</Text>
                </View>
              ) : null}
              <Text style={styles.sessionCount}>
                {sessions.length} session{sessions.length !== 1 ? 's' : ''} logged
              </Text>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => navigation.navigate('NewSession', { clientId, name })}
              >
                <Text style={styles.primaryBtnText}>+ New Session</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => navigation.navigate('Progress', { clientId, name })}
              >
                <Text style={styles.secondaryBtnText}>View Progress</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionLabel}>Session History</Text>

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
                Showing {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''} from {formatPickedDate(fromDate)} to {formatPickedDate(toDate)}
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
                        onChange={(event, date) => {
                          if (date) setFromDate(date);
                        }}
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
                  onChange={(event, date) => {
                    setShowFromPicker(false);
                    if (date) setFromDate(date);
                  }}
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
                        onChange={(event, date) => {
                          if (date) setToDate(date);
                        }}
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
                  onChange={(event, date) => {
                    setShowToPicker(false);
                    if (date) setToDate(date);
                  }}
                />
              )
            )}
          </View>
        }
        data={pagedSessions}
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
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => confirmDelete(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.deleteBtnText}>✕</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}
        ListFooterComponent={
          filteredSessions.length > 0 ? (
            <View style={styles.pagination}>
              <TouchableOpacity
                style={[styles.pageBtn, page === 0 && styles.pageBtnDisabled]}
                onPress={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <Text style={[styles.pageBtnText, page === 0 && styles.pageBtnTextDisabled]}>‹ Prev</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.currentBtn} onPress={goToCurrentDate}>
                <Text style={styles.currentBtnText}>Latest</Text>
              </TouchableOpacity>
              <Text style={styles.pageInfo}>{page + 1} / {totalPages}</Text>
              <TouchableOpacity
                style={[styles.pageBtn, page >= totalPages - 1 && styles.pageBtnDisabled]}
                onPress={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <Text style={[styles.pageBtnText, page >= totalPages - 1 && styles.pageBtnTextDisabled]}>Next ›</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>{filtering ? 'No sessions found in this date range.' : 'No sessions logged yet.\nTap "+ New Session" to start.'}</Text>
        }
        contentContainerStyle={styles.list}
      />

      {/* Edit Client Modal */}
      <Modal visible={editModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={() => setEditModal(false)} />
          <View style={[styles.modal, { maxHeight: '85%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Client</Text>
              <TouchableOpacity onPress={() => setEditModal(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>Name</Text>
            <View style={styles.nameRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="First name *"
                placeholderTextColor={COLORS.textMuted}
                value={editFirst}
                onChangeText={setEditFirst}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Last (optional)"
                placeholderTextColor={COLORS.textMuted}
                value={editLast}
                onChangeText={setEditLast}
              />
            </View>
            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput
              style={styles.input}
              placeholder="Phone"
              placeholderTextColor={COLORS.textMuted}
              value={editPhone}
              onChangeText={setEditPhone}
              keyboardType="phone-pad"
            />
            <Text style={styles.fieldLabel}>Age</Text>
            <TextInput
              style={styles.input}
              placeholder="Age"
              placeholderTextColor={COLORS.textMuted}
              value={editAge}
              onChangeText={setEditAge}
              keyboardType="number-pad"
            />
            <Text style={styles.fieldLabel}>Body Weight (lbs)</Text>
            {(client?.weightUpdatedAt || client?.bodyUpdatedAt) && (
              <Text style={styles.lastUpdated}>
                Last updated: {new Date(client.weightUpdatedAt || client.bodyUpdatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            )}
            <TextInput
              style={styles.input}
              placeholder="Enter weight"
              placeholderTextColor={COLORS.textMuted}
              value={editWeight}
              onChangeText={setEditWeight}
              keyboardType="decimal-pad"
            />
            <Text style={styles.fieldLabel}>Body Fat %</Text>
            {(client?.fatUpdatedAt || client?.bodyUpdatedAt) && (
              <Text style={styles.lastUpdated}>
                Last updated: {new Date(client.fatUpdatedAt || client.bodyUpdatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            )}
            <TextInput
              style={styles.input}
              placeholder="Enter body fat"
              placeholderTextColor={COLORS.textMuted}
              value={editFat}
              onChangeText={setEditFat}
              keyboardType="decimal-pad"
            />
            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              placeholder="Notes"
              placeholderTextColor={COLORS.textMuted}
              value={editNote}
              onChangeText={setEditNote}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <TouchableOpacity style={styles.modalBtn} onPress={saveClientEdit}>
              <Text style={styles.modalBtnText}>Save Changes</Text>
            </TouchableOpacity>
            </View>
            </TouchableWithoutFeedback>
            </ScrollView>
          </View>
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
    borderRadius: 14,
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
  avatarText: { color: '#000', fontWeight: '800', fontSize: 20, fontFamily: FONTS.extraBold },
  infoName: { color: COLORS.text, fontWeight: '700', fontSize: 18, fontFamily: FONTS.bold },
  infoDetail: { color: COLORS.textMuted, fontSize: 14, marginTop: 2, fontFamily: FONTS.regular },
  editBtn: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  editBtnText: { color: COLORS.accent, fontWeight: '700', fontSize: 13, fontFamily: FONTS.bold },
  noteBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  noteLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4, fontFamily: FONTS.bold },
  noteText: { color: COLORS.text, fontSize: 14, lineHeight: 20, fontFamily: FONTS.regular },
  sessionCount: { color: COLORS.textMuted, fontSize: 12, marginTop: 12, fontFamily: FONTS.regular },

  // Action buttons
  actions: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  primaryBtn: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#000', fontWeight: '800', fontSize: 15, fontFamily: FONTS.extraBold },
  secondaryBtn: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryBtnText: { color: COLORS.text, fontWeight: '600', fontSize: 15, fontFamily: FONTS.semiBold },

  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
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
  date: { color: COLORS.text, fontWeight: '600', fontSize: 14.5, fontFamily: FONTS.semiBold },
  meta: { color: COLORS.textMuted, fontSize: 12, marginTop: 3, fontFamily: FONTS.regular },
  deleteBtn: {
    position: 'absolute',
    top: 8,
    right: 10,
    padding: 4,
  },
  deleteBtnText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontFamily: FONTS.semiBold,
  },
  empty: {
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 48,
    fontSize: 15,
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
    fontSize: 13,
    fontFamily: FONTS.regular,
    alignSelf: 'center',
  },
  dateInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 12,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: 13,
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
    fontSize: 13,
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
    fontSize: 13,
    fontFamily: FONTS.semiBold,
  },
  filterInfo: {
    color: COLORS.accent,
    fontSize: 11,
    fontFamily: FONTS.regular,
    marginBottom: 12,
  },
  dateInputText: { color: COLORS.text, fontSize: 13, fontFamily: FONTS.regular },
  dateInputPlaceholder: { color: COLORS.textMuted, fontSize: 13, fontFamily: FONTS.regular },
  pickerOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  pickerContainer: { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, width: '90%' },
  pickerDone: { alignItems: 'center', padding: 12, marginTop: 8 },
  pickerDoneText: { color: COLORS.accent, fontSize: 15, fontWeight: '700', fontFamily: FONTS.bold },

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
    color: COLORS.text,
    fontSize: 13,
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
    fontSize: 13,
    fontWeight: '700',
    fontFamily: FONTS.bold,
  },
  pageInfo: {
    color: COLORS.textMuted,
    fontSize: 12,
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
    fontSize: 15,
    fontFamily: FONTS.regular,
  },
  fieldLabel: { color: COLORS.textMuted, fontSize: 12, fontFamily: FONTS.semiBold, marginBottom: 6, marginLeft: 4 },
  lastUpdated: { color: COLORS.accent, fontSize: 11, fontFamily: FONTS.regular, marginBottom: 6, marginLeft: 4 },
  nameRow: { flexDirection: 'row', gap: 10 },
  noteInput: { height: 80, paddingTop: 14 },
  modalBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  modalBtnText: { color: '#000', fontWeight: '800', fontSize: 16, fontFamily: FONTS.extraBold },
});
