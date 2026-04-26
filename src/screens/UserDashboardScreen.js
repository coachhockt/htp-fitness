import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Image,
  Modal, Pressable, TextInput, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback, ScrollView,
} from 'react-native';
import { db } from '../../firebase';
import {
  collection, query, where, orderBy, onSnapshot, doc, deleteDoc,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS } from '../theme';
import DateTimePicker from '@react-native-community/datetimepicker';
import ProfileMenu from '../components/ProfileMenu';

const PAGE_SIZE = 10;

export default function UserDashboardScreen({ navigation }) {
  const { user, logout, saveProfile } = useAuth();
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
  const [editAge, setEditAge] = useState('');
  const [editSex, setEditSex] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editFat, setEditFat] = useState('');
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const q = query(
      collection(db, 'sessions'),
      where('clientId', '==', user.uid),
      orderBy('date', 'desc')
    );
    return onSnapshot(q, (snap) => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  function formatDate(ts) {
    if (!ts) return 'In progress';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
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
        { text: 'Delete', style: 'destructive', onPress: () => deleteDoc(doc(db, 'sessions', session.id)) },
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

  const totalPages = Math.ceil(filteredSessions.length / PAGE_SIZE);
  const pagedSessions = filteredSessions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function goToCurrentDate() {
    if (filtering) { clearFilter(); }
    setPage(0);
  }

  function openEditProfile() {
    const p = user.profile || {};
    setEditFirst(p.firstName || p.fullName?.split(' ')[0] || '');
    setEditLast(p.lastName || p.fullName?.split(' ').slice(1).join(' ') || '');
    setEditAge(p.age ? String(p.age) : '');
    setEditSex(p.sex || '');
    setEditWeight(p.bodyWeight ? String(p.bodyWeight) : '');
    setEditFat(p.bodyFat ? String(p.bodyFat) : '');
    setEditModal(true);
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
      <FlatList
        data={sessions}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <View>
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
                onProfile={openEditProfile}
                onSettings={() => {}}
                onLogout={() => Alert.alert('Log Out', 'Are you sure you want to log out?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log Out', style: 'destructive', onPress: logout }])}
                topOffset={insets.top + 110}
                extraItems={[
                  { label: 'View Progress', icon: 'trending-up-outline', onPress: () => navigation.navigate('Progress', { clientId: user.uid, name: profile.fullName || 'My' }) },
                ]}
              />
            </View>

            <View style={styles.weekCard}>
              <Text style={styles.weekCount}>{sessionsThisWeek}</Text>
              <Text style={styles.weekLabel}>Sessions trained this week</Text>
            </View>

            <Text style={styles.sectionLabel}>
              Session History ({filteredSessions.length})
            </Text>

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
          <Text style={styles.empty}>{filtering ? 'No sessions found in this date range.' : 'No sessions logged yet.\nTap "Start Training" to begin.'}</Text>
        }
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('NewSession', { clientId: user.uid, name: profile.fullName || 'My Session' })}
      >
        <Text style={styles.fabText}>Start Training</Text>
      </TouchableOpacity>

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
            {(profile.weightUpdatedAt || profile.bodyUpdatedAt) && (
              <Text style={styles.lastUpdated}>
                Last updated: {new Date(profile.weightUpdatedAt || profile.bodyUpdatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
            {(profile.fatUpdatedAt || profile.bodyUpdatedAt) && (
              <Text style={styles.lastUpdated}>
                Last updated: {new Date(profile.fatUpdatedAt || profile.bodyUpdatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
            <TouchableOpacity style={styles.modalBtn} onPress={handleSaveProfile}>
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
    fontSize: 10,
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
});
