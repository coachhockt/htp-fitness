import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Modal, Pressable, KeyboardAvoidingView, Platform, Image, Alert,
  Keyboard, TouchableWithoutFeedback, ScrollView,
} from 'react-native';
import { db } from '../../firebase';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, doc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, TYPE, RADIUS } from '../theme';
import { getSessionsRemaining } from '../utils';
import { guardedSave } from '../saveGuard';
import ProfileMenu from '../components/ProfileMenu';

export default function ClientsScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newWeight, setNewWeight] = useState('');
  const [newFat, setNewFat] = useState('');
  const [newNote, setNewNote] = useState('');
  const insets = useSafeAreaInsets();

  const [sessionCounts, setSessionCounts] = useState({});
  const [appUsers, setAppUsers] = useState([]);

  useEffect(() => {
    const q = query(collection(db, 'clients'), where('trainerId', '==', user.uid));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setClients(list);
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('category', '==', 'inPerson'));
    return onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.id !== user.uid);
      setAppUsers(list);
    });
  }, []);

  useEffect(() => {
    if (clients.length === 0) return;
    const q = query(collection(db, 'sessions'), where('trainerId', '==', user.uid));
    return onSnapshot(q, (snap) => {
      const counts = {};
      snap.docs.forEach(d => {
        const cid = d.data().clientId;
        counts[cid] = (counts[cid] || 0) + 1;
      });
      setSessionCounts(counts);
    });
  }, [clients.length]);

  async function addClient() {
    if (!newFirst.trim()) return;
    const fullName = newLast.trim()
      ? `${newFirst.trim()} ${newLast.trim()}`
      : newFirst.trim();
    const result = await guardedSave(() => addDoc(collection(db, 'clients'), {
      firstName: newFirst.trim(),
      lastName: newLast.trim() || null,
      name: fullName,
      phone: newPhone.trim(),
      email: newEmail.trim() || null,
      age: newAge.trim() ? parseInt(newAge.trim()) : null,
      bodyWeight: newWeight.trim() ? parseFloat(newWeight.trim()) : null,
      bodyFat: newFat.trim() ? parseFloat(newFat.trim()) : null,
      note: newNote.trim() || null,
      trainerId: user.uid,
      createdAt: serverTimestamp(),
    }), { what: 'new client', onRetry: addClient });
    // Keep the form filled on a hard failure so nothing has to be retyped.
    if (result === 'failed' || result === 'denied') return;
    setNewFirst('');
    setNewLast('');
    setNewPhone('');
    setNewEmail('');
    setNewAge('');
    setNewWeight('');
    setNewFat('');
    setNewNote('');
    setModalVisible(false);
  }

  function handleDeleteClient(client) {
    Alert.alert(
      'Delete Client',
      `Are you sure you want to delete ${client.name}? This will also delete all their sessions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await guardedSave(async () => {
              const sessionsQuery = query(collection(db, 'sessions'), where('clientId', '==', client.id));
              const sessionsSnap = await getDocs(sessionsQuery);
              const batch = writeBatch(db);
              sessionsSnap.docs.forEach(d => batch.delete(d.ref));
              batch.delete(doc(db, 'clients', client.id));
              await batch.commit();
            }, { what: 'client deletion', onRetry: () => handleDeleteClient(client) });
          },
        },
      ]
    );
  }

  const clientIdSet = new Set(clients.map(c => c.id));
  const userIdSet = new Set(appUsers.map(u => u.id));

  const usersWithoutShadow = appUsers
    .filter(u => !clientIdSet.has(u.id))
    .map(u => ({
      id: u.id,
      isAppUser: true,
      isShadowOnly: true,
      email: u.email,
      firstName: u.profile?.firstName || null,
      lastName: u.profile?.lastName || null,
      name: u.profile?.fullName || u.email,
      age: u.profile?.age || null,
      bodyWeight: u.profile?.bodyWeight || null,
      bodyFat: u.profile?.bodyFat || null,
    }));

  const clientsWithSource = clients.map(c => ({
    ...c,
    isAppUser: userIdSet.has(c.id),
  }));

  const merged = [...clientsWithSource, ...usersWithoutShadow]
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const filtered = merged.filter(c =>
    (c.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.logoContainer}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      <View style={styles.header}>
        <Text style={styles.title}>Clients</Text>
        <ProfileMenu
          user={user}
          profileLabel="Admin"
          onProfile={() => navigation.navigate('Admin')}
          onSettings={() => {}}
          onLogout={() => Alert.alert('Log Out', 'Are you sure you want to log out?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log Out', style: 'destructive', onPress: logout }])}
          topOffset={insets.top + 130}
          extraItems={[
            { label: 'Activity History', icon: 'calendar-outline', onPress: () => navigation.navigate('ActivityCalendar') },
          ]}
        />
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search clients..."
        placeholderTextColor={COLORS.textMuted}
        value={search}
        onChangeText={setSearch}
      />

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('ClientDetail', { clientId: item.id, name: item.name })}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.firstName?.[0]?.toUpperCase() || item.name?.[0]?.toUpperCase() || '?'}{item.lastName?.[0]?.toUpperCase() || ''}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}{item.age ? `, ${item.age}` : ''}
                </Text>
                {item.isAppUser && (
                  <View style={styles.appBadge}>
                    <Text style={styles.appBadgeText}>APP</Text>
                  </View>
                )}
              </View>
              {(() => {
                const remaining = getSessionsRemaining(item, sessionCounts[item.id] || 0);
                if (typeof remaining !== 'number') return null;
                const color = remaining <= 0
                  ? COLORS.danger
                  : remaining <= 2
                    ? '#FF9800'
                    : COLORS.textMuted;
                return (
                  <Text style={[styles.sessionCount, { color }]}>
                    {remaining} session{remaining !== 1 ? 's' : ''} left
                  </Text>
                );
              })()}
            </View>
            {!item.isShadowOnly && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDeleteClient(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.deleteBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {search ? 'No clients match your search.' : 'No clients yet.\nTap "+ Add Client" to get started.'}
          </Text>
        }
        contentContainerStyle={{ paddingBottom: 120 }}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+ Add Client</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={() => setModalVisible(false)} />
          <View style={styles.modal}>
            <ScrollView keyboardShouldPersistTaps="handled">
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Client</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.nameRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="First name *"
                placeholderTextColor={COLORS.textMuted}
                value={newFirst}
                onChangeText={setNewFirst}
                autoFocus
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Last (optional)"
                placeholderTextColor={COLORS.textMuted}
                value={newLast}
                onChangeText={setNewLast}
              />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Phone (optional)"
              placeholderTextColor={COLORS.textMuted}
              value={newPhone}
              onChangeText={setNewPhone}
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              placeholder="Email (optional)"
              placeholderTextColor={COLORS.textMuted}
              value={newEmail}
              onChangeText={setNewEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              placeholder="Age (optional)"
              placeholderTextColor={COLORS.textMuted}
              value={newAge}
              onChangeText={setNewAge}
              keyboardType="number-pad"
            />
            <TextInput
              style={styles.input}
              placeholder="Body Weight (lbs)"
              placeholderTextColor={COLORS.textMuted}
              value={newWeight}
              onChangeText={setNewWeight}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={styles.input}
              placeholder="Body Fat %"
              placeholderTextColor={COLORS.textMuted}
              value={newFat}
              onChangeText={setNewFat}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={[styles.input, styles.noteInput]}
              placeholder="Notes (optional)"
              placeholderTextColor={COLORS.textMuted}
              value={newNote}
              onChangeText={setNewNote}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <TouchableOpacity style={styles.modalBtn} onPress={addClient}>
              <Text style={styles.modalBtnText}>Add Client</Text>
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
    paddingTop: 56,
    paddingBottom: 8,
    backgroundColor: COLORS.background,
  },
  logo: {
    width: '90%',
    height: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: { fontSize: TYPE.display, fontWeight: '800', color: COLORS.textBright, fontFamily: FONTS.extraBold },
  search: {
    backgroundColor: COLORS.card,
    marginHorizontal: 20,
    borderRadius: 10,
    padding: 13,
    color: COLORS.textBright,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: TYPE.body,
    fontFamily: FONTS.regular,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    marginHorizontal: 20,
    marginBottom: 9,
    borderRadius: 13,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#000', fontWeight: '800', fontSize: TYPE.heading, fontFamily: FONTS.extraBold },
  name: { color: COLORS.textBright, fontWeight: '600', fontSize: TYPE.body, fontFamily: FONTS.semiBold, flexShrink: 1 },
  appBadge: {
    backgroundColor: COLORS.accent + '22',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  appBadgeText: {
    color: COLORS.accent,
    fontSize: TYPE.caption,
    fontFamily: FONTS.extraBold,
    letterSpacing: 0.5,
  },
  sessionCount: { color: COLORS.textMuted, fontSize: TYPE.label, marginTop: 2, fontFamily: FONTS.regular },
  phone: { color: COLORS.textMuted, fontSize: TYPE.label, marginTop: 2, fontFamily: FONTS.regular },
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
    marginTop: 80,
    fontSize: TYPE.body,
    lineHeight: 24,
    fontFamily: FONTS.regular,
  },
  fab: {
    position: 'absolute',
    bottom: 36,
    right: 24,
    left: 24,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    padding: 17,
    alignItems: 'center',
  },
  fabText: { color: '#000', fontWeight: '800', fontSize: TYPE.heading, fontFamily: FONTS.extraBold },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  modal: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 48,
    maxHeight: '85%',
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
  nameRow: { flexDirection: 'row', gap: 10 },
  noteInput: {
    height: 80,
    paddingTop: 14,
  },
  modalBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  modalBtnText: { color: '#000', fontWeight: '800', fontSize: TYPE.heading, fontFamily: FONTS.extraBold },
});
