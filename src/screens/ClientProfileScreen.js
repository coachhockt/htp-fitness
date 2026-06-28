import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
  Modal, Pressable, TextInput, KeyboardAvoidingView, Platform,
  Keyboard, TouchableWithoutFeedback, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS, TYPE, RADIUS } from '../theme';
import { getLastBodyEditDate, formatLastEdited } from '../utils';
import { handledNoAccess } from '../access';

export default function ClientProfileScreen({ route, navigation }) {
  const { clientId } = route.params;
  const { user } = useAuth();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileModal, setProfileModal] = useState(false);
  const [bodyModal, setBodyModal] = useState(false);
  const [notesModal, setNotesModal] = useState(false);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editFat, setEditFat] = useState('');
  const [editNote, setEditNote] = useState('');

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

  function openProfileModal() {
    setEditFirst(client.firstName || client.name?.split(' ')[0] || '');
    setEditLast(client.lastName || client.name?.split(' ').slice(1).join(' ') || '');
    setEditPhone(client.phone || '');
    setEditEmail(client.email || '');
    setEditAge(client.age ? String(client.age) : '');
    setProfileModal(true);
  }

  function openBodyModal() {
    setEditWeight(client.bodyWeight ? String(client.bodyWeight) : '');
    setEditFat(client.bodyFat ? String(client.bodyFat) : '');
    setBodyModal(true);
  }

  function openNotesModal() {
    setEditNote(client.note || '');
    setNotesModal(true);
  }

  async function saveProfile() {
    if (!editFirst.trim()) return;
    const fullName = editLast.trim()
      ? `${editFirst.trim()} ${editLast.trim()}`
      : editFirst.trim();
    const updated = {
      firstName: editFirst.trim(),
      lastName: editLast.trim() || null,
      name: fullName,
      phone: editPhone.trim(),
      email: editEmail.trim() || null,
      age: editAge.trim() ? parseInt(editAge.trim()) : null,
    };
    try {
      await writePatch(updated);
      setClient(prev => ({ ...prev, ...updated, _fromUser: false }));
      setProfileModal(false);
    } catch (e) {
      if (!handledNoAccess(e)) Alert.alert('Error', e.message);
    }
  }

  async function saveBodyStats() {
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
    const weightChanged = newWeight !== (client.bodyWeight || null);
    const fatChanged = newFat !== (client.bodyFat || null);

    const updated = { bodyWeight: newWeight, bodyFat: newFat };
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
    try {
      await writePatch(updated);
      setClient(prev => ({ ...prev, ...updated, _fromUser: false }));
      setBodyModal(false);
    } catch (e) {
      if (!handledNoAccess(e)) Alert.alert('Error', e.message);
    }
  }

  async function saveNotes() {
    const updated = { note: editNote.trim() || null };
    try {
      await writePatch(updated);
      setClient(prev => ({ ...prev, ...updated, _fromUser: false }));
      setNotesModal(false);
    } catch (e) {
      if (!handledNoAccess(e)) Alert.alert('Error', e.message);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  if (!client) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.empty}>Client not found.</Text>
      </View>
    );
  }

  const name = client.name || route.params?.name || 'Client';
  const initials = `${client.firstName?.[0]?.toUpperCase() || name[0].toUpperCase()}${client.lastName?.[0]?.toUpperCase() || ''}`;
  const wDate = getLastBodyEditDate(client, 'weight');
  const fDate = getLastBodyEditDate(client, 'fat');

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.headerCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{name}</Text>
          {client.age ? <Text style={styles.subtitle}>Age {client.age}</Text> : null}
          <TouchableOpacity style={styles.editBtn} onPress={openProfileModal}>
            <Ionicons name="create-outline" size={16} color={COLORS.accent} />
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Contact */}
        <Text style={styles.sectionLabel}>Contact</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoRowLabel}>Phone</Text>
            <Text style={[styles.infoRowValue, !client.phone && styles.infoRowMuted]}>
              {client.phone || 'Not set'}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoRowLabel}>Email</Text>
            <Text style={[styles.infoRowValue, !client.email && styles.infoRowMuted]}>
              {client.email || 'Not set'}
            </Text>
          </View>
        </View>

        {/* Body stats */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionLabel, styles.sectionLabelInRow]}>Body Stats</Text>
          <TouchableOpacity style={styles.sectionEditBtn} onPress={openBodyModal}>
            <Ionicons name="create-outline" size={14} color={COLORS.accent} />
            <Text style={styles.sectionEditText}>Edit</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.infoCard}>
          <View style={styles.bodyStatsRow}>
            <View style={styles.bodyStat}>
              <Text style={styles.bodyStatLabel}>Body Weight</Text>
              <Text style={styles.bodyStatValue}>
                {client.bodyWeight != null ? `${client.bodyWeight} lbs` : '—'}
              </Text>
              {wDate ? <Text style={styles.bodyStatSub}>{formatLastEdited(wDate)}</Text> : null}
            </View>
            <View style={styles.bodyStat}>
              <Text style={styles.bodyStatLabel}>Body Fat</Text>
              <Text style={styles.bodyStatValue}>
                {client.bodyFat != null ? `${client.bodyFat}%` : '—'}
              </Text>
              {fDate ? <Text style={styles.bodyStatSub}>{formatLastEdited(fDate)}</Text> : null}
            </View>
          </View>
        </View>

        {/* Notes */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionLabel, styles.sectionLabelInRow]}>Notes</Text>
          <TouchableOpacity style={styles.sectionEditBtn} onPress={openNotesModal}>
            <Ionicons name="create-outline" size={14} color={COLORS.accent} />
            <Text style={styles.sectionEditText}>Edit</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.infoCard}>
          <Text style={[styles.noteText, !client.note && styles.infoRowMuted]}>
            {client.note || 'No notes yet.'}
          </Text>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={profileModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={() => setProfileModal(false)} />
          <View style={[styles.modal, { maxHeight: '85%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Edit Profile</Text>
                    <TouchableOpacity onPress={() => setProfileModal(false)} style={styles.closeBtn}>
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
                  <Text style={styles.fieldLabel}>Email</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor={COLORS.textMuted}
                    value={editEmail}
                    onChangeText={setEditEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
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
                  <TouchableOpacity style={styles.modalBtn} onPress={saveProfile}>
                    <Text style={styles.modalBtnText}>Save Changes</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Body Stats Modal */}
      <Modal visible={bodyModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={() => setBodyModal(false)} />
          <View style={[styles.modal, { maxHeight: '85%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Body Stats</Text>
                    <TouchableOpacity onPress={() => setBodyModal(false)} style={styles.closeBtn}>
                      <Text style={styles.closeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.fieldLabel}>Body Weight (lbs)</Text>
                  {formatLastEdited(getLastBodyEditDate(client, 'weight')) ? (
                    <Text style={styles.lastUpdated}>
                      {formatLastEdited(getLastBodyEditDate(client, 'weight'))}
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
                  {formatLastEdited(getLastBodyEditDate(client, 'fat')) ? (
                    <Text style={styles.lastUpdated}>
                      {formatLastEdited(getLastBodyEditDate(client, 'fat'))}
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
                  <TouchableOpacity style={styles.modalBtn} onPress={saveBodyStats}>
                    <Text style={styles.modalBtnText}>Save Changes</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Notes Modal */}
      <Modal visible={notesModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={() => setNotesModal(false)} />
          <View style={[styles.modal, { maxHeight: '85%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Notes</Text>
                    <TouchableOpacity onPress={() => setNotesModal(false)} style={styles.closeBtn}>
                      <Text style={styles.closeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
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
                  <TouchableOpacity style={styles.modalBtn} onPress={saveNotes}>
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 40 },
  empty: { color: COLORS.textMuted, fontSize: TYPE.body, fontFamily: FONTS.regular },

  headerCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { color: '#000', fontWeight: '800', fontSize: TYPE.display, fontFamily: FONTS.extraBold },
  name: { color: COLORS.textBright, fontWeight: '700', fontSize: TYPE.title, fontFamily: FONTS.bold },
  subtitle: { color: COLORS.textMuted, fontSize: TYPE.body, marginTop: 4, fontFamily: FONTS.regular },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
    backgroundColor: COLORS.accent + '12',
  },
  editBtnText: { color: COLORS.accent, fontWeight: '700', fontSize: TYPE.body, fontFamily: FONTS.bold },

  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: TYPE.caption,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 4,
    fontFamily: FONTS.bold,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionLabelInRow: { marginBottom: 0 },
  sectionEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  sectionEditText: { color: COLORS.accent, fontWeight: '700', fontSize: TYPE.label, fontFamily: FONTS.bold },
  infoCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoRowLabel: { color: COLORS.textMuted, fontSize: TYPE.body, fontFamily: FONTS.regular },
  infoRowValue: { color: COLORS.textBright, fontSize: TYPE.body, fontFamily: FONTS.semiBold, flexShrink: 1, textAlign: 'right' },
  infoRowMuted: { color: COLORS.textMuted, fontFamily: FONTS.regular },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 12 },

  bodyStatsRow: { flexDirection: 'row', gap: 16 },
  bodyStat: { flex: 1 },
  bodyStatLabel: { color: COLORS.textMuted, fontSize: TYPE.caption, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4, fontFamily: FONTS.bold },
  bodyStatValue: { color: COLORS.textBright, fontSize: TYPE.heading, fontWeight: '700', fontFamily: FONTS.bold },
  bodyStatSub: { color: COLORS.textMuted, fontSize: TYPE.caption, marginTop: 2, fontFamily: FONTS.regular },
  noteText: { color: COLORS.textBright, fontSize: TYPE.body, lineHeight: 20, fontFamily: FONTS.regular },

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
});
