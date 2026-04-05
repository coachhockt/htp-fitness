import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Modal, Pressable, KeyboardAvoidingView, Platform, Image, Alert,
  Keyboard, TouchableWithoutFeedback, ScrollView,
} from 'react-native';
import { db } from '../../firebase';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, doc, deleteDoc, getDocs } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS } from '../theme';

export default function ClientsScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newWeight, setNewWeight] = useState('');
  const [newFat, setNewFat] = useState('');
  const [newNote, setNewNote] = useState('');

  const [sessionCounts, setSessionCounts] = useState({});

  useEffect(() => {
    const q = query(collection(db, 'clients'), where('trainerId', '==', user.uid));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      setClients(list);
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
    await addDoc(collection(db, 'clients'), {
      firstName: newFirst.trim(),
      lastName: newLast.trim() || null,
      name: fullName,
      phone: newPhone.trim(),
      age: newAge.trim() ? parseInt(newAge.trim()) : null,
      bodyWeight: newWeight.trim() ? parseFloat(newWeight.trim()) : null,
      bodyFat: newFat.trim() ? parseFloat(newFat.trim()) : null,
      note: newNote.trim() || null,
      trainerId: user.uid,
      createdAt: serverTimestamp(),
    });
    setNewFirst('');
    setNewLast('');
    setNewPhone('');
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
            const sessionsQuery = query(collection(db, 'sessions'), where('clientId', '==', client.id));
            const sessionsSnap = await getDocs(sessionsQuery);
            const deletes = sessionsSnap.docs.map(d => deleteDoc(d.ref));
            await Promise.all(deletes);
            await deleteDoc(doc(db, 'clients', client.id));
          },
        },
      ]
    );
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      <View style={styles.header}>
        <Text style={styles.title}>Clients</Text>
        <View style={styles.headerRight}>
          {user.role === 'admin' && (
            <TouchableOpacity style={styles.adminBtn} onPress={() => navigation.navigate('Admin')}>
              <Text style={styles.adminBtnText}>Admin</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>
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
            onLongPress={() => handleDeleteClient(item)}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.firstName?.[0]?.toUpperCase() || item.name[0].toUpperCase()}{item.lastName?.[0]?.toUpperCase() || ''}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {item.name}{item.age ? `, ${item.age}` : ''}
              </Text>
              <Text style={styles.sessionCount}>
                {sessionCounts[item.id] || 0} session{(sessionCounts[item.id] || 0) !== 1 ? 's' : ''} logged
              </Text>
            </View>
            <Text style={styles.arrow}>›</Text>
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
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text, fontFamily: FONTS.extraBold },
  headerRight: {
    flexDirection: 'row',
    gap: 10,
  },
  adminBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  adminBtnText: { color: '#000', fontSize: 13, fontFamily: FONTS.semiBold },
  logoutBtn: {
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logoutText: { color: COLORS.accent, fontSize: 13, fontFamily: FONTS.semiBold },
  search: {
    backgroundColor: COLORS.card,
    marginHorizontal: 20,
    borderRadius: 10,
    padding: 13,
    color: COLORS.text,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: 15,
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
  avatarText: { color: '#000', fontWeight: '800', fontSize: 16, fontFamily: FONTS.extraBold },
  name: { color: COLORS.text, fontWeight: '600', fontSize: 14.5, fontFamily: FONTS.semiBold },
  sessionCount: { color: COLORS.textMuted, fontSize: 12, marginTop: 2, fontFamily: FONTS.regular },
  phone: { color: COLORS.textMuted, fontSize: 12, marginTop: 2, fontFamily: FONTS.regular },
  arrow: { color: COLORS.textMuted, fontSize: 24 },
  empty: {
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 80,
    fontSize: 15,
    lineHeight: 24,
    fontFamily: FONTS.regular,
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
  modalBtnText: { color: '#000', fontWeight: '800', fontSize: 16, fontFamily: FONTS.extraBold },
});
