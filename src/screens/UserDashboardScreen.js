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
import { COLORS, FONTS } from '../theme';

const PAGE_SIZE = 10;

export default function UserDashboardScreen({ navigation }) {
  const { user, logout, saveProfile } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [page, setPage] = useState(0);
  const [searchFrom, setSearchFrom] = useState('');
  const [searchTo, setSearchTo] = useState('');
  const [filtering, setFiltering] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editSex, setEditSex] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editFat, setEditFat] = useState('');

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

  function parseDate(str) {
    const parts = str.split('/');
    if (parts.length !== 3) return null;
    const [m, d, y] = parts.map(Number);
    if (!m || !d || !y) return null;
    return new Date(y, m - 1, d);
  }

  function applyDateFilter() {
    const from = parseDate(searchFrom);
    const to = parseDate(searchTo);
    if (!from || !to) {
      Alert.alert('Invalid Date', 'Use MM/DD/YYYY format for both dates.');
      return;
    }
    if (to < from) {
      Alert.alert('Invalid Range', 'End date must be after start date.');
      return;
    }
    const diffDays = (to - from) / (1000 * 60 * 60 * 24);
    if (diffDays > 14) {
      Alert.alert('Range Too Large', 'Maximum search range is 2 weeks.');
      return;
    }
    setFiltering(true);
    setPage(0);
  }

  function clearFilter() {
    setSearchFrom('');
    setSearchTo('');
    setFiltering(false);
    setPage(0);
  }

  const filteredSessions = filtering
    ? sessions.filter(s => {
        if (!s.date) return false;
        const d = s.date.toDate ? s.date.toDate() : new Date(s.date);
        const from = parseDate(searchFrom);
        const to = parseDate(searchTo);
        to.setHours(23, 59, 59, 999);
        return d >= from && d <= to;
      })
    : sessions;

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
    <View style={styles.container}>
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
              <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
                <Text style={styles.logoutText}>Log Out</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.profileCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {profile.fullName?.[0]?.toUpperCase() || '?'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.profileName}>{profile.fullName || 'User'}</Text>
                <Text style={styles.profileMeta}>
                  {profile.age ? `Age: ${profile.age}` : ''}
                  {profile.sex ? ` · Sex: ${profile.sex}` : ''}
                  {profile.bodyWeight ? `\nWeight: ${profile.bodyWeight} lbs` : ''}
                  {profile.bodyFat ? ` · BF: ${profile.bodyFat}%` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={openEditProfile} style={styles.editBtn}>
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => navigation.navigate('NewSession', { clientId: user.uid, name: profile.fullName || 'My Session' })}
              >
                <Text style={styles.primaryBtnText}>+ New Session</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => navigation.navigate('Progress', { clientId: user.uid, name: profile.fullName || 'My' })}
              >
                <Text style={styles.secondaryBtnText}>View Progress</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>
              Session History ({filteredSessions.length})
            </Text>

            {/* Date Range Search */}
            <View style={styles.dateSearchRow}>
              <TextInput
                style={styles.dateInput}
                placeholder="M/D/YYYY"
                placeholderTextColor={COLORS.textMuted}
                value={searchFrom}
                onChangeText={setSearchFrom}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
              <Text style={styles.dateToText}>to</Text>
              <TextInput
                style={styles.dateInput}
                placeholder="M/D/YYYY"
                placeholderTextColor={COLORS.textMuted}
                value={searchTo}
                onChangeText={setSearchTo}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
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
                Showing {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''} from {searchFrom} to {searchTo}
              </Text>
            )}
          </View>
        }
        data={pagedSessions}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('SessionDetail', { sessionId: item.id })}
            onLongPress={() => confirmDelete(item)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.date}>{formatDate(item.date)}</Text>
              <Text style={styles.meta}>
                {item.exercises?.length || 0} exercise{item.exercises?.length !== 1 ? 's' : ''}
                {'  ·  '}
                {totalSets(item)} set{totalSets(item) !== 1 ? 's' : ''}
              </Text>
            </View>
            <Text style={styles.arrow}>›</Text>
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
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      />

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
  logoutBtn: {
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logoutText: { color: COLORS.accent, fontSize: 13, fontFamily: FONTS.semiBold },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
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
  profileName: { color: COLORS.text, fontWeight: '700', fontSize: 18, fontFamily: FONTS.bold },
  profileMeta: { color: COLORS.textMuted, fontSize: 13, marginTop: 2, fontFamily: FONTS.regular },
  editBtn: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  editBtnText: { color: COLORS.accent, fontWeight: '700', fontSize: 13, fontFamily: FONTS.bold },
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
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  date: { color: COLORS.text, fontWeight: '600', fontSize: 16, fontFamily: FONTS.semiBold },
  meta: { color: COLORS.textMuted, fontSize: 13, marginTop: 3, fontFamily: FONTS.regular },
  arrow: { color: COLORS.textMuted, fontSize: 24 },
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
    fontSize: 15,
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
