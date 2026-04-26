import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
  Modal, Pressable,
} from 'react-native';

const SET_COLORS = {
  dropset: '#D4872A',
  superset: '#4A90D9',
};
import { db } from '../../firebase';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { COLORS, FONTS } from '../theme';
import { estimate1RM, compute1RMs } from '../utils';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function SessionDetailScreen({ route, navigation }) {
  const { sessionId } = route.params;
  const [session, setSession] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState(null);
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [editExercises, setEditExercises] = useState([]);
  const [saving, setSaving] = useState(false);
  const [tagMenu, setTagMenu] = useState(null);

  useEffect(() => {
    getDoc(doc(db, 'sessions', sessionId)).then(d => {
      if (d.exists()) setSession({ id: d.id, ...d.data() });
    });
  }, [sessionId]);

  if (!session) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
      <ActivityIndicator size="large" color={COLORS.accent} />
    </View>
  );

  function toDate(ts) {
    if (!ts) return new Date();
    return ts.toDate ? ts.toDate() : new Date(ts);
  }

  function formatDate(ts) {
    const d = toDate(ts);
    return d.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  function formatDateInput(ts) {
    const d = toDate(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  function totalVolume(sets) {
    return sets?.reduce((sum, s) => {
      const w = typeof s.weight === 'string' ? parseFloat(s.weight) || 0 : s.weight;
      const r = typeof s.reps === 'string' ? parseInt(s.reps) || 0 : s.reps;
      return sum + w * r;
    }, 0) || 0;
  }

  function sessionVolume() {
    const exs = editing ? editExercises : session.exercises;
    return exs?.reduce((sum, ex) => sum + totalVolume(ex.sets), 0) || 0;
  }

  function startEditing() {
    setEditDate(toDate(session.date));
    setEditExercises(
      session.exercises.map(ex => ({
        name: ex.name,
        sets: ex.sets.map(s => ({ weight: String(s.weight), reps: String(s.reps), type: s.type || null })),
      }))
    );
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
  }

  function updateExName(exIdx, name) {
    setEditExercises(prev =>
      prev.map((ex, i) => (i === exIdx ? { ...ex, name } : ex))
    );
  }

  function updateSet(exIdx, setIdx, field, value) {
    setEditExercises(prev =>
      prev.map((ex, i) =>
        i === exIdx
          ? { ...ex, sets: ex.sets.map((s, j) => (j === setIdx ? { ...s, [field]: value } : s)) }
          : ex
      )
    );
  }

  function addSet(exIdx) {
    setEditExercises(prev =>
      prev.map((ex, i) =>
        i === exIdx ? { ...ex, sets: [...ex.sets, { weight: '', reps: '', type: null }] } : ex
      )
    );
  }

  function tagSet(exIdx, setIdx, type) {
    setEditExercises(prev =>
      prev.map((ex, i) =>
        i === exIdx
          ? { ...ex, sets: ex.sets.map((s, j) => (j === setIdx ? { ...s, type } : s)) }
          : ex
      )
    );
    setTagMenu(null);
  }

  function deleteSet(exIdx, setIdx) {
    setEditExercises(prev =>
      prev.map((ex, i) =>
        i === exIdx ? { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) } : ex
      )
    );
  }

  function addExercise() {
    setEditExercises(prev => [...prev, { name: '', sets: [{ weight: '', reps: '', type: null }] }]);
  }

  function deleteExercise(exIdx) {
    setEditExercises(prev => prev.filter((_, i) => i !== exIdx));
  }

  async function saveEdits() {
    if (!editDate || isNaN(editDate.getTime())) {
      Alert.alert('Invalid date', 'Please select a valid date.');
      return;
    }
    const parsedDate = editDate;

    const cleaned = editExercises
      .filter(ex => ex.name.trim())
      .map(ex => ({
        name: ex.name.trim(),
        sets: ex.sets
          .filter(s => s.weight !== '' || s.reps !== '')
          .map(s => ({
            weight: parseFloat(s.weight) || 0,
            reps: parseInt(s.reps) || 0,
            ...(s.type ? { type: s.type } : {}),
          })),
      }))
      .filter(ex => ex.sets.length > 0);

    if (cleaned.length === 0) {
      Alert.alert('No data', 'Add at least one exercise with sets.');
      return;
    }

    setSaving(true);
    try {
      const e1rms = compute1RMs(cleaned);
      await updateDoc(doc(db, 'sessions', sessionId), {
        date: Timestamp.fromDate(parsedDate),
        exercises: cleaned,
        estimated1RMs: e1rms.map(e => ({ name: e.name, value: e.estimated1RM })),
      });
      setSession(prev => ({
        ...prev,
        date: Timestamp.fromDate(parsedDate),
        exercises: cleaned,
        estimated1RMs: e1rms.map(e => ({ name: e.name, value: e.estimated1RM })),
      }));
      setEditing(false);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── VIEW MODE ──
  if (!editing) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.dateRow}>
          <Text style={styles.date}>{formatDate(session.date)}</Text>
          <TouchableOpacity onPress={startEditing}>
            <Text style={styles.editBtn}>Edit</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{session.exercises?.length || 0}</Text>
            <Text style={styles.statLabel}>Exercises</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statVal}>
              {session.exercises?.reduce((n, ex) => n + (ex.sets?.length || 0), 0) || 0}
            </Text>
            <Text style={styles.statLabel}>Sets</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{sessionVolume().toLocaleString()}</Text>
            <Text style={styles.statLabel}>Total lbs</Text>
          </View>
        </View>

        {session.exercises?.map((ex, i) => (
          <View key={i} style={styles.exerciseCard}>
            <Text style={styles.exName}>{ex.name}</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { width: 36 }]}>SET</Text>
              <Text style={[styles.th, { flex: 1 }]}>WEIGHT</Text>
              <Text style={[styles.th, { flex: 1 }]}>REPS</Text>
              <Text style={[styles.th, { flex: 1 }]}>VOLUME</Text>
            </View>
            {ex.sets?.map((set, j) => {
              const isAboveDropset = ex.sets[j + 1]?.type === 'dropset';
              const rowBg = set.type === 'dropset' ? SET_COLORS.dropset + '10'
                : set.type === 'superset' ? SET_COLORS.superset + '10'
                : 'transparent';
              return (
                <View key={j} style={[styles.tableRow, { backgroundColor: rowBg, borderRadius: 8 }]}>
                  <View style={styles.viewSetNumCol}>
                    {set.type === 'dropset' && j > 0 && (
                      <View style={styles.dropsetLine} />
                    )}
                    {set.type === 'dropset' ? (
                      <View style={[styles.viewBadge, { backgroundColor: SET_COLORS.dropset + '22' }]}>
                        <Text style={[styles.viewBadgeText, { color: SET_COLORS.dropset }]}>D.S</Text>
                      </View>
                    ) : set.type === 'superset' ? (
                      <View style={[styles.viewBadge, { backgroundColor: SET_COLORS.superset + '22' }]}>
                        <Text style={[styles.viewBadgeText, { color: SET_COLORS.superset }]}>S.S</Text>
                      </View>
                    ) : (
                      <Text style={[styles.td, isAboveDropset && { color: SET_COLORS.dropset }]}>{j + 1}</Text>
                    )}
                  </View>
                  <Text style={[styles.td, { flex: 1 }]}>{set.weight} lbs</Text>
                  <Text style={[styles.td, { flex: 1 }]}>{set.reps}</Text>
                  <Text style={[styles.td, { flex: 1 }, styles.tdMuted]}>
                    {(set.weight * set.reps).toLocaleString()}
                  </Text>
                </View>
              );
            })}
            <View style={styles.exFooter}>
              <Text style={styles.exTotal}>
                Volume: {totalVolume(ex.sets).toLocaleString()} lbs
              </Text>
              <Text style={styles.exMax}>
                Max: {Math.max(...(ex.sets?.map(s => s.weight) || [0]))} lbs
              </Text>
            </View>
            <View style={styles.e1rmRow}>
              <Text style={styles.e1rmLabel}>Est. 1RM</Text>
              <Text style={styles.e1rmVal}>
                {session.estimated1RMs?.find(e => e.name === ex.name)?.value
                  || Math.max(...(ex.sets?.map(s => estimate1RM(s.weight, s.reps)) || [0]))} lbs
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  // ── EDIT MODE ──
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 300 }}
      >
        <View style={styles.dateRow}>
          <Text style={styles.editLabel}>DATE</Text>
          <TouchableOpacity onPress={cancelEditing}>
            <Text style={styles.cancelBtn}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.dateInput} onPress={() => setShowEditDatePicker(true)}>
          <Text style={editDate ? styles.dateInputText : styles.dateInputPlaceholder}>
            {editDate ? editDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Select date'}
          </Text>
        </TouchableOpacity>
        {showEditDatePicker && (
          Platform.OS === 'ios' ? (
            <Modal transparent animationType="fade">
              <Pressable style={styles.pickerOverlay} onPress={() => setShowEditDatePicker(false)}>
                <View style={styles.pickerContainer} onStartShouldSetResponder={() => true}>
                  <DateTimePicker
                    maximumDate={new Date()}
                    value={editDate || new Date()}
                    mode="date"
                    display="inline"
                    onChange={(event, date) => {
                      if (date) setEditDate(date);
                    }}
                    themeVariant="dark"
                  />
                  <TouchableOpacity style={styles.pickerDone} onPress={() => setShowEditDatePicker(false)}>
                    <Text style={styles.pickerDoneText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Modal>
          ) : (
            <DateTimePicker
              maximumDate={new Date()}
              value={editDate || new Date()}
              mode="date"
              display="default"
              onChange={(event, date) => {
                setShowEditDatePicker(false);
                if (date) setEditDate(date);
              }}
            />
          )
        )}

        {editExercises.map((ex, exIdx) => (
          <View key={exIdx} style={styles.exerciseCard}>
            <View style={styles.editExHeader}>
              <TextInput
                style={styles.editExName}
                value={ex.name}
                onChangeText={v => updateExName(exIdx, v)}
                placeholder="Exercise name"
                placeholderTextColor={COLORS.textMuted}
              />
              <TouchableOpacity onPress={() => deleteExercise(exIdx)}>
                <Text style={styles.removeEx}>Remove</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.editColHeaders}>
              <Text style={[styles.editColHeader, { width: 28 }]}>SET</Text>
              <Text style={[styles.editColHeader, { flex: 1 }]}>WEIGHT</Text>
              <Text style={styles.editColHeader}> </Text>
              <Text style={[styles.editColHeader, { flex: 1 }]}>REPS</Text>
              <Text style={[styles.editColHeader, { width: 36 }]}> </Text>
            </View>

            {ex.sets.map((set, setIdx) => {
              const isAboveDropset = ex.sets[setIdx + 1]?.type === 'dropset';
              const rowBg = set.type === 'dropset' ? SET_COLORS.dropset + '10'
                : set.type === 'superset' ? SET_COLORS.superset + '10'
                : 'transparent';
              return (
              <View key={setIdx} style={[styles.editSetRow, { backgroundColor: rowBg, borderRadius: 8 }]}>
                <TouchableOpacity onPress={() => setTagMenu({ exIdx, setIdx })} style={styles.editSetNumBtn}>
                  {set.type === 'dropset' && setIdx > 0 && (
                    <View style={styles.dropsetLine} />
                  )}
                  {set.type === 'dropset' ? (
                    <View style={[styles.viewBadge, { backgroundColor: SET_COLORS.dropset + '22' }]}>
                      <Text style={[styles.viewBadgeText, { color: SET_COLORS.dropset }]}>D.S</Text>
                    </View>
                  ) : set.type === 'superset' ? (
                    <View style={[styles.viewBadge, { backgroundColor: SET_COLORS.superset + '22' }]}>
                      <Text style={[styles.viewBadgeText, { color: SET_COLORS.superset }]}>S.S</Text>
                    </View>
                  ) : (
                    <Text style={[styles.editSetNum, isAboveDropset && { color: SET_COLORS.dropset }]}>{setIdx + 1}</Text>
                  )}
                </TouchableOpacity>
                <TextInput
                  style={styles.editSetInput}
                  value={set.weight}
                  onChangeText={v => {
                    const num = parseFloat(v);
                    if (v !== '' && !isNaN(num) && num < 0) {
                      Alert.alert('Invalid', 'Weight cannot be negative.');
                      return;
                    }
                    if (v !== '' && !isNaN(num) && num > 1500) {
                      Alert.alert('Wow!', 'You are strong! Contact admin if you can really lift 1500!');
                      return;
                    }
                    updateSet(exIdx, setIdx, 'weight', v);
                  }}
                  placeholder="lbs"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
                <Text style={styles.editX}>×</Text>
                <TextInput
                  style={styles.editSetInput}
                  value={set.reps}
                  onChangeText={v => {
                    const num = parseInt(v);
                    if (v !== '' && !isNaN(num) && num < 0) {
                      Alert.alert('Invalid', 'Reps cannot be negative.');
                      return;
                    }
                    if (v !== '' && !isNaN(num) && num > 200) {
                      Alert.alert('Limit Reached', 'Maximum 200 reps per set.');
                      return;
                    }
                    updateSet(exIdx, setIdx, 'reps', v);
                  }}
                  placeholder="reps"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <TouchableOpacity onPress={() => deleteSet(exIdx, setIdx)} style={styles.editDeleteSet}>
                  <Text style={styles.editDeleteSetText}>✕</Text>
                </TouchableOpacity>
              </View>
              );
            })}

            <TouchableOpacity style={styles.addSetBtn} onPress={() => addSet(exIdx)}>
              <Text style={styles.addSetText}>+ Add Set</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity style={styles.addExBtn} onPress={addExercise}>
          <Text style={styles.addExBtnText}>+ Add Exercise</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.5 }]}
          onPress={saveEdits}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={tagMenu !== null} transparent animationType="fade">
        <Pressable style={styles.tagOverlay} onPress={() => setTagMenu(null)}>
          <View style={styles.tagMenu} onStartShouldSetResponder={() => true}>
            <Text style={styles.tagTitle}>Set Type</Text>
            <TouchableOpacity
              style={styles.tagOption}
              onPress={() => tagSet(tagMenu.exIdx, tagMenu.setIdx, 'dropset')}
            >
              <View style={[styles.tagDot, { backgroundColor: SET_COLORS.dropset }]} />
              <Text style={styles.tagOptionText}>Drop Set</Text>
              {tagMenu && editExercises[tagMenu.exIdx]?.sets[tagMenu.setIdx]?.type === 'dropset' && (
                <Text style={styles.tagCheck}>✓</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.tagOption}
              onPress={() => tagSet(tagMenu.exIdx, tagMenu.setIdx, 'superset')}
            >
              <View style={[styles.tagDot, { backgroundColor: SET_COLORS.superset }]} />
              <Text style={styles.tagOptionText}>Super Set</Text>
              {tagMenu && editExercises[tagMenu.exIdx]?.sets[tagMenu.setIdx]?.type === 'superset' && (
                <Text style={styles.tagCheck}>✓</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tagOption, { borderBottomWidth: 0 }]}
              onPress={() => tagSet(tagMenu.exIdx, tagMenu.setIdx, null)}
            >
              <View style={[styles.tagDot, { backgroundColor: COLORS.textMuted }]} />
              <Text style={styles.tagOptionText}>Normal</Text>
              {tagMenu && !editExercises[tagMenu.exIdx]?.sets[tagMenu.setIdx]?.type && (
                <Text style={styles.tagCheck}>✓</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 20 },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  date: { color: COLORS.text, fontSize: 15, fontWeight: '700', fontFamily: FONTS.bold },
  editBtn: { color: COLORS.accent, fontSize: 13, fontWeight: '700', fontFamily: FONTS.bold },
  cancelBtn: { color: COLORS.danger, fontSize: 13, fontWeight: '600', fontFamily: FONTS.semiBold },
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stat: { flex: 1, alignItems: 'center' },
  statVal: { color: COLORS.accent, fontSize: 16, fontWeight: '800', fontFamily: FONTS.extraBold },
  statLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: FONTS.semiBold },
  exerciseCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  exName: { color: COLORS.accent, fontWeight: '700', fontSize: 15, marginBottom: 14, fontFamily: FONTS.bold },
  tableHeader: { flexDirection: 'row', marginBottom: 8 },
  th: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', fontFamily: FONTS.bold },
  tableRow: { flexDirection: 'row', paddingVertical: 8, borderTopWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  td: { color: COLORS.text, fontSize: 16, fontFamily: FONTS.regular },
  tdMuted: { color: COLORS.textMuted },
  exFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderColor: COLORS.border },
  exTotal: { color: COLORS.textMuted, fontSize: 12, fontFamily: FONTS.regular },
  exMax: { color: COLORS.accent, fontSize: 12, fontWeight: '600', fontFamily: FONTS.semiBold },
  e1rmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 10,
  },
  e1rmLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: FONTS.bold },
  e1rmVal: { color: '#D4872A', fontSize: 14.5, fontWeight: '800', fontFamily: FONTS.extraBold },

  // Edit mode styles
  editLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: FONTS.bold },
  dateInput: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 14,
    color: COLORS.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20,
    fontFamily: FONTS.regular,
  },
  dateInputText: { color: COLORS.text, fontSize: 14, fontFamily: FONTS.regular },
  dateInputPlaceholder: { color: COLORS.textMuted, fontSize: 14, fontFamily: FONTS.regular },
  pickerOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  pickerContainer: { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, width: '90%' },
  pickerDone: { alignItems: 'center', padding: 12, marginTop: 8 },
  pickerDoneText: { color: COLORS.accent, fontSize: 15, fontWeight: '700', fontFamily: FONTS.bold },
  editExHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  editExName: { color: COLORS.accent, fontWeight: '700', fontSize: 15, flex: 1, padding: 0, fontFamily: FONTS.bold },
  removeEx: { color: COLORS.danger, fontSize: 12, fontFamily: FONTS.regular },
  editColHeaders: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  editColHeader: { color: COLORS.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1, textAlign: 'center', fontFamily: FONTS.bold },
  editSetRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  editSetNum: { color: COLORS.textMuted, width: 28, textAlign: 'center', fontSize: 12, fontFamily: FONTS.regular },
  editSetInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 6,
    color: COLORS.text,
    textAlign: 'center',
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontFamily: FONTS.regular,
  },
  editX: { color: COLORS.textMuted, marginHorizontal: 8, fontSize: 14 },
  editDeleteSet: { width: 36, alignItems: 'center', paddingVertical: 4 },
  editDeleteSetText: { color: COLORS.danger, fontSize: 12 },
  addSetBtn: { alignItems: 'center', paddingVertical: 10, marginTop: 2 },
  addSetText: { color: COLORS.accent, fontWeight: '600', fontSize: 13, fontFamily: FONTS.semiBold },
  addExBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  addExBtnText: { color: COLORS.accent, fontWeight: '700', fontSize: 13, fontFamily: FONTS.bold },
  saveBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
  },
  saveBtnText: { color: '#000', fontWeight: '800', fontSize: 15, fontFamily: FONTS.extraBold },

  // Set tag styles
  viewSetNumCol: { width: 36, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  viewBadge: { borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2, alignItems: 'center', justifyContent: 'center' },
  viewBadgeText: { fontSize: 9, fontWeight: '800', fontFamily: FONTS.extraBold, letterSpacing: 0.5 },
  dropsetLine: { position: 'absolute', top: -12, width: 2, height: 12, backgroundColor: SET_COLORS.dropset, borderRadius: 1 },
  editSetNumBtn: { width: 28, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  tagOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  tagMenu: { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, width: 220, borderWidth: 1, borderColor: COLORS.border },
  tagTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700', fontFamily: FONTS.bold, marginBottom: 12, textAlign: 'center' },
  tagOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: COLORS.border },
  tagDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  tagOptionText: { color: COLORS.text, fontSize: 15, fontFamily: FONTS.regular, flex: 1 },
  tagCheck: { color: COLORS.accent, fontSize: 16, fontWeight: '700', fontFamily: FONTS.bold },
});
