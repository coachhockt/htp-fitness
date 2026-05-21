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
import { db } from '../../firebase';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc, addDoc, deleteDoc, Timestamp, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS } from '../theme';
import { estimate1RM, compute1RMs, titleCaseExercise, genSupersetGroupId, getSupersetLabel, cleanupOrphanGroups, moveExerciseInList } from '../utils';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function SessionDetailScreen({ route, navigation }) {
  const { sessionId, savedWorkout } = route.params;
  const { user } = useAuth();
  const [session, setSession] = useState(null);
  const [editing, setEditing] = useState(false);
  const [bookmarkDocId, setBookmarkDocId] = useState(null);
  const [editDate, setEditDate] = useState(null);
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [editExercises, setEditExercises] = useState([]);
  const [saving, setSaving] = useState(false);
  const [tagMenu, setTagMenu] = useState(null);
  const [exerciseMenu, setExerciseMenu] = useState(null); // { exIdx }
  const [noteModal, setNoteModal] = useState(null); // { exIdx }
  const [noteInput, setNoteInput] = useState('');
  const [supersetPicker, setSupersetPicker] = useState(null); // { exIdx }
  const [pastExercises, setPastExercises] = useState([]);
  const [pastBest, setPastBest] = useState({}); // lowercase name -> { date, weight, reps, unit }
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionIdx, setSuggestionIdx] = useState(null);

  useEffect(() => {
    if (savedWorkout && !sessionId) {
      setSession({ id: savedWorkout.id, exercises: savedWorkout.exercises, date: savedWorkout.createdAt, _isSaved: true });
      return;
    }
    getDoc(doc(db, 'sessions', sessionId)).then(d => {
      if (d.exists()) setSession({ id: d.id, ...d.data() });
    });
  }, [sessionId]);

  // Check if this session is bookmarked
  useEffect(() => {
    if (!sessionId || !user?.uid) return;
    const q = query(
      collection(db, 'savedWorkouts'),
      where('clientId', '==', user.uid),
      where('type', '==', 'bookmark'),
      where('sessionId', '==', sessionId),
    );
    getDocs(q).then(snap => {
      if (!snap.empty) setBookmarkDocId(snap.docs[0].id);
    });
  }, [sessionId, user?.uid]);

  async function toggleBookmark() {
    if (!session || !sessionId) return;
    if (!user?.uid) return;
    try {
      if (bookmarkDocId) {
        await deleteDoc(doc(db, 'savedWorkouts', bookmarkDocId));
        setBookmarkDocId(null);
      } else {
        const exerciseNames = (session.exercises || []).map(e => e.name).filter(Boolean);
        const title = exerciseNames.length > 0
          ? exerciseNames.slice(0, 3).join(', ') + (exerciseNames.length > 3 ? '...' : '')
          : 'Workout';
        const ref = await addDoc(collection(db, 'savedWorkouts'), {
          clientId: user.uid,
          type: 'bookmark',
          sessionId,
          title,
          exercises: session.exercises || [],
          assignedBy: null,
          createdAt: serverTimestamp(),
          note: null,
        });
        setBookmarkDocId(ref.id);
      }
    } catch (err) {
      console.error('[toggleBookmark]', err);
      Alert.alert('Bookmark failed', err?.message ?? 'Unknown error');
    }
  }

  useEffect(() => {
    if (!session?.clientId) return;
    (async () => {
      const q = query(collection(db, 'sessions'), where('clientId', '==', session.clientId));
      const snap = await getDocs(q);
      const names = new Set();
      const best = {};

      const sessions = snap.docs
        .filter(d => d.id !== sessionId) // exclude the session being viewed/edited
        .map(d => {
          const data = d.data();
          const date = data.date?.toDate ? data.date.toDate() : new Date(data.date);
          return { date, exercises: data.exercises || [] };
        })
        .filter(s => s.date && !isNaN(s.date.getTime()))
        .sort((a, b) => b.date - a.date);

      for (const s of sessions) {
        for (const ex of s.exercises) {
          names.add(ex.name);
          const key = ex.name?.toLowerCase().trim();
          if (!key || best[key]) continue;
          let heaviest = null;
          for (const set of (ex.sets || [])) {
            const w = set.weight == null ? 0 : set.weight;
            if (!heaviest || w > (heaviest.weight == null ? 0 : heaviest.weight)) {
              heaviest = set;
            }
          }
          if (heaviest) {
            best[key] = {
              date: s.date,
              weight: heaviest.weight,
              reps: heaviest.reps,
              unit: ex.unit || 'reps',
            };
          }
        }
      }

      // Still include current session's exercise names for the autocomplete list
      snap.docs.forEach(d => d.data().exercises?.forEach(ex => names.add(ex.name)));
      setPastExercises([...names].filter(Boolean).sort());
      setPastBest(best);
    })();
  }, [session?.clientId, sessionId]);

  function getExSuggestions(text) {
    if (!text.trim()) return [];
    const lower = text.toLowerCase();
    let expandedTerms = [lower];
    for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
      if (lower.includes(abbr)) expandedTerms.push(lower.replace(abbr, full));
    }
    const allExercises = [...new Set([...pastExercises, ...COMMON_EXERCISES])];
    const matches = allExercises.filter(ex => {
      const exLower = ex.toLowerCase();
      return expandedTerms.some(term => exLower.includes(term)) ||
        lower.split(' ').every(word => exLower.includes(word));
    });
    return matches.sort((a, b) => {
      const aIsPast = pastExercises.includes(a);
      const bIsPast = pastExercises.includes(b);
      if (aIsPast && !bIsPast) return -1;
      if (!aIsPast && bIsPast) return 1;
      return a.localeCompare(b);
    }).slice(0, 5);
  }

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
      const w = typeof s.weight === 'string' ? parseFloat(s.weight) || 0 : (s.weight || 0);
      const r = typeof s.reps === 'string' ? parseInt(s.reps) || 0 : (s.reps || 0);
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
        sets: ex.sets.map(s => ({
          weight: s.weight == null ? '' : String(s.weight),
          reps: s.reps == null ? '' : String(s.reps),
          type: s.type || null,
        })),
        ...(ex.supersetGroupId ? { supersetGroupId: ex.supersetGroupId } : {}),
        ...(ex.unit === 'seconds' ? { unit: 'seconds' } : {}),
        ...(ex.note ? { note: ex.note } : {}),
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
    const matches = getExSuggestions(name);
    setSuggestions(matches);
    setSuggestionIdx(matches.length > 0 ? exIdx : null);
  }

  function applySuggestion(exIdx, name) {
    setEditExercises(prev =>
      prev.map((ex, i) => (i === exIdx ? { ...ex, name } : ex))
    );
    setSuggestions([]);
    setSuggestionIdx(null);
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

  function moveExercise(fromIdx, dir) {
    setEditExercises(prev => moveExerciseInList(prev, fromIdx, dir));
  }

  function deleteExercise(exIdx) {
    setEditExercises(prev => cleanupOrphanGroups(prev.filter((_, i) => i !== exIdx)));
  }

  function makeSuperset(exIdx, partnerIdx) {
    setEditExercises(prev => {
      const partner = prev[partnerIdx];
      const groupId = partner.supersetGroupId || genSupersetGroupId();
      return prev.map((ex, i) => {
        if (i === exIdx) return { ...ex, supersetGroupId: groupId };
        if (i === partnerIdx && !partner.supersetGroupId) return { ...ex, supersetGroupId: groupId };
        return ex;
      });
    });
    setSupersetPicker(null);
    setExerciseMenu(null);
  }

  function removeFromSuperset(exIdx) {
    setEditExercises(prev => {
      const next = prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const { supersetGroupId, ...rest } = ex;
        return rest;
      });
      return cleanupOrphanGroups(next);
    });
    setExerciseMenu(null);
  }

  function toggleExerciseUnit(exIdx) {
    setEditExercises(prev => prev.map((ex, i) =>
      i === exIdx
        ? { ...ex, unit: ex.unit === 'seconds' ? 'reps' : 'seconds' }
        : ex
    ));
    setExerciseMenu(null);
  }

  function openNoteModal(exIdx) {
    setNoteInput(editExercises[exIdx]?.note || '');
    setExerciseMenu(null);
    setNoteModal({ exIdx });
  }

  function saveExerciseNote() {
    if (!noteModal) return;
    const idx = noteModal.exIdx;
    const trimmed = noteInput.trim();
    setEditExercises(prev => prev.map((ex, i) =>
      i === idx ? { ...ex, note: trimmed || null } : ex
    ));
    setNoteModal(null);
    setNoteInput('');
  }

  async function saveEdits() {
    if (!editDate || isNaN(editDate.getTime())) {
      Alert.alert('Invalid date', 'Please select a valid date.');
      return;
    }
    const parsedDate = editDate;

    const cleaned = cleanupOrphanGroups(
      editExercises
        .filter(ex => ex.name.trim())
        .map(ex => ({
          name: titleCaseExercise(ex.name),
          sets: ex.sets
            .filter(s => s.weight !== '' || s.reps !== '')
            .map(s => ({
              weight: s.weight === '' ? null : (parseFloat(s.weight) || 0),
              reps: parseInt(s.reps) || 0,
              ...(s.type ? { type: s.type } : {}),
            })),
          ...(ex.supersetGroupId ? { supersetGroupId: ex.supersetGroupId } : {}),
          ...(ex.unit === 'seconds' ? { unit: 'seconds' } : {}),
          ...(ex.note ? { note: ex.note } : {}),
        }))
        .filter(ex => ex.sets.length > 0)
    );

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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            {sessionId && !session._isSaved && (
              <TouchableOpacity onPress={toggleBookmark} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons
                  name={bookmarkDocId ? 'bookmark' : 'bookmark-outline'}
                  size={22}
                  color={bookmarkDocId ? COLORS.accent : COLORS.textMuted}
                />
              </TouchableOpacity>
            )}
            {!session._isSaved && (
              <TouchableOpacity onPress={startEditing}>
                <Text style={styles.editBtn}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
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

        {session.exercises?.map((ex, i) => {
          const groupLabel = getSupersetLabel(session.exercises, ex.supersetGroupId);
          return (
          <View
            key={i}
            style={[styles.exerciseCard, groupLabel && styles.supersetBorder]}
          >
            <View style={styles.viewExHeader}>
              <Text style={styles.exName}>{ex.name}</Text>
              {groupLabel && (
                <View style={styles.supersetBadge}>
                  <Text style={styles.supersetBadgeText}>SUPERSET {groupLabel}</Text>
                </View>
              )}
              {ex.note ? (
                <Text style={styles.exNote}>{ex.note}</Text>
              ) : null}
            </View>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { width: 36 }]}>SET</Text>
              <Text style={[styles.th, { flex: 1 }]}>WEIGHT</Text>
              <Text style={[styles.th, { flex: 1 }]}>{ex.unit === 'seconds' ? 'SEC' : 'REPS'}</Text>
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
                  <Text style={[styles.td, { flex: 1 }]}>
                    {set.weight == null || set.weight === 0 ? 'B.W.' : `${set.weight} lbs`}
                  </Text>
                  <Text style={[styles.td, { flex: 1 }]}>
                    {ex.unit === 'seconds' ? `${set.reps} sec` : set.reps}
                  </Text>
                  <Text style={[styles.td, { flex: 1 }, styles.tdMuted]}>
                    {((set.weight || 0) * (set.reps || 0)).toLocaleString()}
                  </Text>
                </View>
              );
            })}
            <View style={styles.exFooter}>
              <Text style={styles.exTotal}>
                Volume: {totalVolume(ex.sets).toLocaleString()} lbs
              </Text>
              <Text style={styles.exMax}>
                Max: {Math.max(...(ex.sets?.map(s => s.weight || 0) || []), 0)} lbs
              </Text>
            </View>
            {ex.unit !== 'seconds' && (
              <View style={styles.e1rmRow}>
                <Text style={styles.e1rmLabel}>Est. 1RM</Text>
                <Text style={styles.e1rmVal}>
                  {session.estimated1RMs?.find(e => e.name === ex.name)?.value
                    || Math.max(...(ex.sets?.map(s => estimate1RM(s.weight, s.reps)) || []), 0)} lbs
                </Text>
              </View>
            )}
          </View>
          );
        })}
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

        {editExercises.map((ex, exIdx) => {
          const groupLabel = getSupersetLabel(editExercises, ex.supersetGroupId);
          return (
          <View
            key={exIdx}
            style={[styles.exerciseCard, groupLabel && styles.supersetBorder]}
          >
            <View style={styles.editExHeader}>
              <TextInput
                style={styles.editExName}
                value={ex.name}
                onChangeText={v => updateExName(exIdx, v)}
                placeholder="Exercise name"
                placeholderTextColor={COLORS.textMuted}
              />
              {groupLabel && (
                <View style={styles.supersetBadge}>
                  <Text style={styles.supersetBadgeText}>SS {groupLabel}</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={() => moveExercise(exIdx, -1)}
                disabled={exIdx === 0}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                style={{ padding: 4, opacity: exIdx === 0 ? 0.3 : 1 }}
              >
                <Ionicons name="chevron-up" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => moveExercise(exIdx, 1)}
                disabled={exIdx === editExercises.length - 1}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                style={{ padding: 4, opacity: exIdx === editExercises.length - 1 ? 0.3 : 1 }}
              >
                <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setExerciseMenu({ exIdx })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteExercise(exIdx)}>
                <Text style={styles.removeEx}>Remove</Text>
              </TouchableOpacity>
            </View>
            {ex.note ? (
              <Text style={styles.exNote}>{ex.note}</Text>
            ) : null}
            {suggestionIdx === exIdx && suggestions.length > 0 && (
              <View style={styles.suggestionsBox}>
                {suggestions.map((s, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.suggestionItem}
                    onPress={() => applySuggestion(exIdx, s)}
                  >
                    <Text style={styles.suggestionText}>{s}</Text>
                    {pastExercises.includes(s) && (
                      <Text style={styles.suggestionBadge}>recent</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.editColHeaders}>
              <Text style={[styles.editColHeader, { width: 28 }]}>SET</Text>
              <Text style={[styles.editColHeader, { flex: 1 }]}>WEIGHT</Text>
              <Text style={styles.editColHeader}> </Text>
              <Text style={[styles.editColHeader, { flex: 1 }]}>{ex.unit === 'seconds' ? 'SEC' : 'REPS'}</Text>
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
                  placeholder="B.W."
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
                    const isSeconds = ex.unit === 'seconds';
                    const max = isSeconds ? 3600 : 200;
                    const label = isSeconds ? 'Seconds' : 'Reps';
                    if (v !== '' && !isNaN(num) && num < 0) {
                      Alert.alert('Invalid', `${label} cannot be negative.`);
                      return;
                    }
                    if (v !== '' && !isNaN(num) && num > max) {
                      Alert.alert('Limit Reached', `Maximum ${max} ${label.toLowerCase()} per set.`);
                      return;
                    }
                    updateSet(exIdx, setIdx, 'reps', v);
                  }}
                  placeholder={ex.unit === 'seconds' ? 'sec' : 'reps'}
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
            {(() => {
              const best = pastBest[ex.name?.toLowerCase().trim()];
              if (!best) return null;
              const wStr = best.weight == null || best.weight === 0 ? 'B.W.' : `${best.weight} lbs`;
              const rStr = best.unit === 'seconds' ? `${best.reps} sec` : best.reps;
              const dStr = best.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              return (
                <Text style={styles.lastBestText}>
                  Last: {wStr} × {rStr} · {dStr}
                </Text>
              );
            })()}
          </View>
          );
        })}

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

      <Modal visible={exerciseMenu !== null} transparent animationType="fade">
        <Pressable style={styles.tagOverlay} onPress={() => setExerciseMenu(null)}>
          <View style={styles.tagMenu} onStartShouldSetResponder={() => true}>
            <Text style={styles.tagTitle}>
              {exerciseMenu && (editExercises[exerciseMenu.exIdx]?.name || 'Exercise')}
            </Text>
            {exerciseMenu && editExercises[exerciseMenu.exIdx]?.supersetGroupId ? (
              <TouchableOpacity
                style={styles.tagOption}
                onPress={() => removeFromSuperset(exerciseMenu.exIdx)}
              >
                <View style={[styles.tagDot, { backgroundColor: SET_COLORS.superset }]} />
                <Text style={styles.tagOptionText}>Remove from Superset</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.tagOption}
                onPress={() => {
                  const idx = exerciseMenu.exIdx;
                  setExerciseMenu(null);
                  setSupersetPicker({ exIdx: idx });
                }}
              >
                <View style={[styles.tagDot, { backgroundColor: SET_COLORS.superset }]} />
                <Text style={styles.tagOptionText}>Make Superset</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.tagOption}
              onPress={() => toggleExerciseUnit(exerciseMenu.exIdx)}
            >
              <Ionicons name="timer-outline" size={16} color={COLORS.accent} style={{ marginRight: 10 }} />
              <Text style={styles.tagOptionText}>
                {exerciseMenu && editExercises[exerciseMenu.exIdx]?.unit === 'seconds'
                  ? 'Use Reps'
                  : 'Use Seconds'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tagOption, { borderBottomWidth: 0 }]}
              onPress={() => openNoteModal(exerciseMenu.exIdx)}
            >
              <Ionicons name="document-text-outline" size={16} color={COLORS.accent} style={{ marginRight: 10 }} />
              <Text style={styles.tagOptionText}>
                {exerciseMenu && editExercises[exerciseMenu.exIdx]?.note ? 'Edit Note' : 'Add Note'}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={noteModal !== null} transparent animationType="fade" onRequestClose={() => setNoteModal(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.noteOverlay} onPress={() => setNoteModal(null)}>
            <Pressable style={styles.noteModal} onPress={() => {}}>
              <Text style={styles.tagTitle}>
                {noteModal && (editExercises[noteModal.exIdx]?.name || 'Exercise')} — Note
              </Text>
              <TextInput
                style={styles.noteInput}
                placeholder="e.g. felt strong, increase next time"
                placeholderTextColor={COLORS.textMuted}
                value={noteInput}
                onChangeText={setNoteInput}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                autoFocus
              />
              <View style={styles.noteActions}>
                <TouchableOpacity style={styles.noteCancelBtn} onPress={() => setNoteModal(null)}>
                  <Text style={styles.noteCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.noteSaveBtn} onPress={saveExerciseNote}>
                  <Text style={styles.noteSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={supersetPicker !== null} transparent animationType="fade">
        <Pressable style={styles.tagOverlay} onPress={() => setSupersetPicker(null)}>
          <View style={styles.pickerMenu} onStartShouldSetResponder={() => true}>
            <Text style={styles.tagTitle}>Pair with…</Text>
            {(() => {
              if (!supersetPicker) return null;
              const others = editExercises
                .map((ex, i) => ({ ex, i }))
                .filter(({ i, ex }) => i !== supersetPicker.exIdx && ex.name?.trim());
              if (others.length === 0) {
                return <Text style={styles.pickerEmpty}>Add another exercise first.</Text>;
              }
              return others.map(({ ex, i }, n) => {
                const partnerLabel = getSupersetLabel(editExercises, ex.supersetGroupId);
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.tagOption, n === others.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => makeSuperset(supersetPicker.exIdx, i)}
                  >
                    <Text style={styles.tagOptionText}>{ex.name}</Text>
                    <Text style={styles.pickerHint}>
                      {partnerLabel ? `In Superset ${partnerLabel}` : 'Available'}
                    </Text>
                  </TouchableOpacity>
                );
              });
            })()}
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
  exerciseCardActive: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
    transform: [{ scale: 1.02 }],
    borderColor: COLORS.accent,
  },
  supersetBorder: {
    borderLeftWidth: 4,
    borderLeftColor: SET_COLORS.superset,
  },
  viewExHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  exName: { color: COLORS.accent, fontWeight: '700', fontSize: 15, fontFamily: FONTS.bold },
  exNote: { color: COLORS.textMuted, fontSize: 12, fontStyle: 'italic', marginTop: 4, fontFamily: FONTS.regular },
  lastBestText: { color: COLORS.accent, fontSize: 12, marginTop: 8, alignSelf: 'flex-start', fontFamily: FONTS.semiBold },
  supersetBadge: {
    backgroundColor: SET_COLORS.superset + '22',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  supersetBadgeText: {
    color: SET_COLORS.superset,
    fontSize: 9,
    fontWeight: '800',
    fontFamily: FONTS.extraBold,
    letterSpacing: 0.5,
  },
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
  editExHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
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
  tagMenu: { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, width: 260, borderWidth: 1, borderColor: COLORS.border },
  pickerMenu: { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, width: 280, maxHeight: '70%', borderWidth: 1, borderColor: COLORS.border },
  pickerEmpty: { color: COLORS.textMuted, fontSize: 14, fontFamily: FONTS.regular, textAlign: 'center', paddingVertical: 12 },
  pickerHint: { color: COLORS.textMuted, fontSize: 11, fontFamily: FONTS.regular, marginLeft: 8 },
  tagTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700', fontFamily: FONTS.bold, marginBottom: 12, textAlign: 'center' },
  noteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  noteModal: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noteInput: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 14,
    color: COLORS.text,
    minHeight: 90,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: 15,
    fontFamily: FONTS.regular,
    marginBottom: 14,
  },
  noteActions: { flexDirection: 'row', gap: 10 },
  noteCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  noteCancelText: { color: COLORS.textMuted, fontSize: 14, fontFamily: FONTS.semiBold },
  noteSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  noteSaveText: { color: '#000', fontSize: 14, fontFamily: FONTS.bold },
  tagOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: COLORS.border },
  tagDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  tagOptionText: { color: COLORS.text, fontSize: 15, fontFamily: FONTS.regular, flex: 1 },
  tagCheck: { color: COLORS.accent, fontSize: 16, fontWeight: '700', fontFamily: FONTS.bold },

  // Exercise suggestions
  suggestionsBox: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  suggestionText: { color: COLORS.text, fontSize: 14, fontFamily: FONTS.regular },
  suggestionBadge: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: FONTS.bold,
  },
});
