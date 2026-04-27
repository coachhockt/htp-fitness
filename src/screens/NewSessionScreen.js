import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView, Platform, BackHandler,
  Modal, Pressable,
} from 'react-native';
import { db } from '../../firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS } from '../theme';
import { compute1RMs, titleCaseExercise } from '../utils';

const COMMON_EXERCISES = [
  'Bench Press', 'Incline Bench Press', 'Decline Bench Press',
  'DB Bench Press', 'DB Incline Bench Press', 'DB Fly', 'DB Incline Fly',
  'Squat', 'Back Squat', 'Front Squat', 'Goblet Squat', 'Bulgarian Split Squat',
  'Deadlift', 'Sumo Deadlift', 'Romanian Deadlift', 'DB Romanian Deadlift',
  'Overhead Press', 'DB Shoulder Press', 'Arnold Press', 'Lateral Raise', 'DB Lateral Raise',
  'Barbell Row', 'BB Row', 'DB Row', 'Pendlay Row', 'Seated Cable Row', 'T-Bar Row',
  'Pull Up', 'Chin Up', 'Lat Pulldown',
  'Barbell Curl', 'BB Curl', 'DB Curl', 'Hammer Curl', 'Preacher Curl', 'EZ Bar Curl',
  'Tricep Pushdown', 'Skull Crusher', 'Tricep Dip', 'Overhead Tricep Extension',
  'Leg Press', 'Leg Curl', 'Leg Extension', 'Hip Thrust', 'Calf Raise',
  'Cable Fly', 'Face Pull', 'Shrug', 'DB Shrug',
];

const ABBREVIATIONS = {
  'db': 'dumbbell', 'bb': 'barbell', 'ez': 'ez bar',
  'ohp': 'overhead press', 'rdl': 'romanian deadlift',
  'bp': 'bench press', 'dl': 'deadlift', 'sq': 'squat',
};

const SET_COLORS = {
  dropset: '#D4872A',
  superset: '#4A90D9',
};

function SetBadge({ type, index, isAboveDropset }) {
  if (type === 'dropset') {
    return (
      <View style={[styles.badge, { backgroundColor: SET_COLORS.dropset + '22' }]}>
        <Text style={[styles.badgeText, { color: SET_COLORS.dropset }]}>D.S</Text>
      </View>
    );
  }
  if (type === 'superset') {
    return (
      <View style={[styles.badge, { backgroundColor: SET_COLORS.superset + '22' }]}>
        <Text style={[styles.badgeText, { color: SET_COLORS.superset }]}>S.S</Text>
      </View>
    );
  }
  return <Text style={[styles.setNum, isAboveDropset && { color: SET_COLORS.dropset }]}>{index + 1}</Text>;
}

function SetRow({ set, index, onUpdate, onDelete, onTagPress, isAboveDropset }) {
  const rowBg = set.type === 'dropset' ? SET_COLORS.dropset + '10'
    : set.type === 'superset' ? SET_COLORS.superset + '10'
    : 'transparent';

  return (
    <View style={[styles.setRow, { backgroundColor: rowBg, borderRadius: 8 }]}>
      <TouchableOpacity onPress={() => onTagPress(index)} style={styles.setNumBtn}>
        {set.type === 'dropset' && index > 0 && (
          <View style={styles.dropsetLine} />
        )}
        <SetBadge type={set.type} index={index} isAboveDropset={isAboveDropset} />
      </TouchableOpacity>
      <TextInput
        style={styles.setInput}
        placeholder="lbs"
        placeholderTextColor={COLORS.textMuted}
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
          onUpdate(index, 'weight', v);
        }}
        keyboardType="decimal-pad"
        selectTextOnFocus
      />
      <Text style={styles.x}>×</Text>
      <TextInput
        style={styles.setInput}
        placeholder="reps"
        placeholderTextColor={COLORS.textMuted}
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
          onUpdate(index, 'reps', v);
        }}
        keyboardType="number-pad"
        selectTextOnFocus
      />
      <TouchableOpacity onPress={() => onDelete(index)} style={styles.deleteSetBtn}>
        <Text style={styles.deleteSetText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function NewSessionScreen({ route, navigation }) {
  const { clientId, name } = route.params;
  const { user } = useAuth();
  const [exercises, setExercises] = useState([]);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [saving, setSaving] = useState(false);
  const [pastExercises, setPastExercises] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [tagMenu, setTagMenu] = useState(null); // { exIdx, setIdx }

  useEffect(() => {
    async function loadPast() {
      const q = query(collection(db, 'sessions'), where('clientId', '==', clientId));
      const snap = await getDocs(q);
      const names = new Set();
      snap.docs.forEach(d => d.data().exercises?.forEach(ex => names.add(ex.name)));
      setPastExercises([...names].sort());
    }
    loadPast();
  }, [clientId]);

  function updateSuggestions(text) {
    setNewExerciseName(text);
    if (!text.trim()) {
      setSuggestions([]);
      return;
    }

    const lower = text.toLowerCase();
    // Expand abbreviations for matching
    let expandedTerms = [lower];
    for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
      if (lower.includes(abbr)) {
        expandedTerms.push(lower.replace(abbr, full));
      }
    }

    const allExercises = [...new Set([...pastExercises, ...COMMON_EXERCISES])];
    const matches = allExercises.filter(ex => {
      const exLower = ex.toLowerCase();
      return expandedTerms.some(term => exLower.includes(term)) ||
        lower.split(' ').every(word => exLower.includes(word));
    });

    // Past exercises first, then common
    const sorted = matches.sort((a, b) => {
      const aIsPast = pastExercises.includes(a);
      const bIsPast = pastExercises.includes(b);
      if (aIsPast && !bIsPast) return -1;
      if (!aIsPast && bIsPast) return 1;
      return a.localeCompare(b);
    });

    setSuggestions(sorted.slice(0, 5));
  }

  function confirmGoBack() {
    if (exercises.length === 0 || saving) {
      navigation.goBack();
      return;
    }

    Alert.alert(
      'Save Session?',
      'You have unsaved exercises. Do you want to save before leaving?',
      [
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
        { text: 'Stay', style: 'cancel' },
        { text: 'Save', onPress: () => saveAndGoBack() },
      ]
    );
  }

  async function getDailySessionCount() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const q = query(
      collection(db, 'sessions'),
      where('clientId', '==', clientId),
      where('date', '>=', startOfDay),
      where('date', '<', endOfDay)
    );
    const snap = await getDocs(q);
    return snap.size;
  }

  async function saveAndGoBack() {
    if (saving) return;
    const cleaned = exercises
      .map(ex => ({
        name: titleCaseExercise(ex.name),
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
      navigation.goBack();
      return;
    }

    setSaving(true);
    try {
      if (user.role !== 'admin') {
        const count = await getDailySessionCount();
        if (count >= 10) {
          Alert.alert('Daily Limit', 'You have reached the maximum of 10 sessions per day.');
          setSaving(false);
          return;
        }
      }
      const e1rms = compute1RMs(cleaned);
      await addDoc(collection(db, 'sessions'), {
        clientId,
        trainerId: user.uid,
        date: serverTimestamp(),
        exercises: cleaned,
        estimated1RMs: e1rms.map(e => ({ name: e.name, value: e.estimated1RM })),
      });
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error saving', e.message);
      setSaving(false);
    }
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={confirmGoBack} style={{ paddingRight: 16 }}>
          <Text style={{ color: COLORS.text, fontSize: 17 }}>‹ {name}</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, exercises, saving]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmGoBack();
      return true;
    });
    return () => backHandler.remove();
  }, [exercises, saving]);

  function addExercise() {
    const trimmed = newExerciseName.trim();
    if (!trimmed) return;
    setExercises(prev => [...prev, { name: trimmed, sets: [{ weight: '', reps: '', type: null }] }]);
    setNewExerciseName('');
  }

  function addSet(exIdx) {
    setExercises(prev =>
      prev.map((ex, i) =>
        i === exIdx ? { ...ex, sets: [...ex.sets, { weight: '', reps: '', type: null }] } : ex
      )
    );
  }

  function tagSet(exIdx, setIdx, type) {
    setExercises(prev =>
      prev.map((ex, i) =>
        i === exIdx
          ? { ...ex, sets: ex.sets.map((s, j) => (j === setIdx ? { ...s, type } : s)) }
          : ex
      )
    );
    setTagMenu(null);
  }

  function updateSet(exIdx, setIdx, field, value) {
    setExercises(prev =>
      prev.map((ex, i) =>
        i === exIdx
          ? { ...ex, sets: ex.sets.map((s, j) => (j === setIdx ? { ...s, [field]: value } : s)) }
          : ex
      )
    );
  }

  function deleteSet(exIdx, setIdx) {
    setExercises(prev =>
      prev.map((ex, i) =>
        i === exIdx ? { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) } : ex
      )
    );
  }

  function deleteExercise(exIdx) {
    setExercises(prev => prev.filter((_, i) => i !== exIdx));
  }

  async function saveSession() {
    if (exercises.length === 0) {
      Alert.alert('No exercises', 'Add at least one exercise before saving.');
      return;
    }

    const cleaned = exercises
      .map(ex => ({
        name: titleCaseExercise(ex.name),
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
      Alert.alert('No data', 'Enter weight or reps for at least one set.');
      return;
    }

    setSaving(true);
    try {
      if (user.role !== 'admin') {
        const count = await getDailySessionCount();
        if (count >= 10) {
          Alert.alert('Daily Limit', 'You have reached the maximum of 10 sessions per day.');
          setSaving(false);
          return;
        }
      }
      const e1rms = compute1RMs(cleaned);
      await addDoc(collection(db, 'sessions'), {
        clientId,
        trainerId: user.uid,
        date: serverTimestamp(),
        exercises: cleaned,
        estimated1RMs: e1rms.map(e => ({ name: e.name, value: e.estimated1RM })),
      });
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e.message);
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 300 }}
      >
        <Text style={styles.clientLabel}>{name}</Text>

        {exercises.map((ex, exIdx) => (
          <View key={exIdx} style={styles.exerciseCard}>
            <View style={styles.exHeader}>
              <Text style={styles.exName}>{ex.name}</Text>
              <TouchableOpacity onPress={() => deleteExercise(exIdx)}>
                <Text style={styles.removeEx}>Remove</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.colHeaders}>
              <Text style={[styles.colHeader, { width: 28 }]}>SET</Text>
              <Text style={[styles.colHeader, { flex: 1 }]}>WEIGHT</Text>
              <Text style={styles.colHeader}> </Text>
              <Text style={[styles.colHeader, { flex: 1 }]}>REPS</Text>
              <Text style={[styles.colHeader, { width: 36 }]}> </Text>
            </View>

            {ex.sets.map((set, setIdx) => (
              <SetRow
                key={setIdx}
                set={set}
                index={setIdx}
                onUpdate={(si, field, val) => updateSet(exIdx, si, field, val)}
                onDelete={(si) => deleteSet(exIdx, si)}
                onTagPress={(si) => setTagMenu({ exIdx, setIdx: si })}
                isAboveDropset={ex.sets[setIdx + 1]?.type === 'dropset'}
              />
            ))}

            <TouchableOpacity style={styles.addSetBtn} onPress={() => addSet(exIdx)}>
              <Text style={styles.addSetText}>+ Add Set</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View>
          <View style={styles.addExRow}>
            <TextInput
              style={styles.exInput}
              placeholder="Exercise name (e.g. Bench Press)..."
              placeholderTextColor={COLORS.textMuted}
              value={newExerciseName}
              onChangeText={updateSuggestions}
              onSubmitEditing={() => {
                if (suggestions.length > 0 && !newExerciseName.trim().toLowerCase().includes(suggestions[0].toLowerCase())) {
                  setNewExerciseName(suggestions[0]);
                  setSuggestions([]);
                } else {
                  addExercise();
                }
              }}
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.addExBtn} onPress={addExercise}>
              <Text style={styles.addExBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
          {suggestions.length > 0 && (
            <View style={styles.suggestionsBox}>
              {suggestions.map((s, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.suggestionItem}
                  onPress={() => {
                    setNewExerciseName(s);
                    setSuggestions([]);
                  }}
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                  {pastExercises.includes(s) && (
                    <Text style={styles.suggestionBadge}>recent</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.5 }]}
          onPress={saveSession}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Session'}</Text>
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
              {tagMenu && exercises[tagMenu.exIdx]?.sets[tagMenu.setIdx]?.type === 'dropset' && (
                <Text style={styles.tagCheck}>✓</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.tagOption}
              onPress={() => tagSet(tagMenu.exIdx, tagMenu.setIdx, 'superset')}
            >
              <View style={[styles.tagDot, { backgroundColor: SET_COLORS.superset }]} />
              <Text style={styles.tagOptionText}>Super Set</Text>
              {tagMenu && exercises[tagMenu.exIdx]?.sets[tagMenu.setIdx]?.type === 'superset' && (
                <Text style={styles.tagCheck}>✓</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tagOption, { borderBottomWidth: 0 }]}
              onPress={() => tagSet(tagMenu.exIdx, tagMenu.setIdx, null)}
            >
              <View style={[styles.tagDot, { backgroundColor: COLORS.textMuted }]} />
              <Text style={styles.tagOptionText}>Normal</Text>
              {tagMenu && !exercises[tagMenu.exIdx]?.sets[tagMenu.setIdx]?.type && (
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
  clientLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 20,
    fontFamily: FONTS.bold,
  },
  exerciseCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  exHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  exName: { color: COLORS.text, fontWeight: '700', fontSize: 17, flex: 1, fontFamily: FONTS.bold },
  removeEx: { color: COLORS.danger, fontSize: 13, fontFamily: FONTS.regular },
  colHeaders: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  colHeader: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
    fontFamily: FONTS.bold,
  },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingVertical: 2 },
  setNumBtn: { width: 32, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  dropsetLine: { position: 'absolute', top: -12, width: 2, height: 12, backgroundColor: SET_COLORS.dropset, borderRadius: 1 },
  setNum: { color: COLORS.textMuted, textAlign: 'center', fontSize: 13, fontFamily: FONTS.regular },
  badge: { borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 9, fontWeight: '800', fontFamily: FONTS.extraBold, letterSpacing: 0.5 },
  setInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 6,
    color: COLORS.text,
    textAlign: 'center',
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontFamily: FONTS.regular,
  },
  x: { color: COLORS.textMuted, marginHorizontal: 8, fontSize: 16 },
  deleteSetBtn: { width: 36, alignItems: 'center', paddingVertical: 4 },
  deleteSetText: { color: COLORS.danger, fontSize: 14 },
  addSetBtn: { alignItems: 'center', paddingVertical: 10, marginTop: 2 },
  addSetText: { color: COLORS.accent, fontWeight: '600', fontSize: 14, fontFamily: FONTS.semiBold },
  addExRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  exInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    color: COLORS.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontFamily: FONTS.regular,
  },
  addExBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  addExBtnText: { color: COLORS.accent, fontWeight: '700', fontSize: 15, fontFamily: FONTS.bold },
  saveBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
  },
  saveBtnText: { color: '#000', fontWeight: '800', fontSize: 16, fontFamily: FONTS.extraBold },
  suggestionsBox: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
    marginTop: -12,
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
  suggestionText: { color: COLORS.text, fontSize: 15, fontFamily: FONTS.regular },
  suggestionBadge: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: FONTS.bold,
  },
  tagOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  tagMenu: { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, width: 220, borderWidth: 1, borderColor: COLORS.border },
  tagTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700', fontFamily: FONTS.bold, marginBottom: 12, textAlign: 'center' },
  tagOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: COLORS.border },
  tagDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  tagOptionText: { color: COLORS.text, fontSize: 15, fontFamily: FONTS.regular, flex: 1 },
  tagCheck: { color: COLORS.accent, fontSize: 16, fontWeight: '700', fontFamily: FONTS.bold },
});
