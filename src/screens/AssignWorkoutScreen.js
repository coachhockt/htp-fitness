import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView, Platform, BackHandler,
  Modal, Pressable, Dimensions,
} from 'react-native';
import { db } from '../../firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS, TYPE, RADIUS } from '../theme';
import { estimate1RM, exerciseKey, titleCaseExercise, genSupersetGroupId, getSupersetLabel, cleanupOrphanGroups, moveExerciseInList } from '../utils';
import { Ionicons } from '@expo/vector-icons';
import { getExerciseSuggestions } from '../exercises';
import { showNoAccess } from '../access';
import { guardedSave } from '../saveGuard';

const POPUP_SCROLL_MAX = Math.round(Dimensions.get('window').height * 0.6);

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

function SetRow({ set, index, onUpdate, onToggleBW, onDelete, onTagPress, isAboveDropset, unit }) {
  const rowBg = set.type === 'dropset' ? SET_COLORS.dropset + '10'
    : set.type === 'superset' ? SET_COLORS.superset + '10'
    : 'transparent';
  const isSeconds = unit === 'seconds';
  const repsPlaceholder = isSeconds ? 'sec' : 'reps';
  const repsMax = isSeconds ? 3600 : 200;
  const repsLabel = isSeconds ? 'Seconds' : 'Reps';

  return (
    <View style={[styles.setRow, { backgroundColor: rowBg, borderRadius: 8 }]}>
      <TouchableOpacity onPress={() => onTagPress(index)} style={styles.setNumBtn}>
        {set.type === 'dropset' && index > 0 && (
          <View style={styles.dropsetLine} />
        )}
        <SetBadge type={set.type} index={index} isAboveDropset={isAboveDropset} />
      </TouchableOpacity>
      {set.bw ? (
        <View style={[styles.setInput, styles.setInputLocked]}>
          <Text style={styles.setInputLockedText}>B.W.</Text>
        </View>
      ) : (
        <TextInput
          style={styles.setInput}
          placeholder="weight"
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
      )}
      <TouchableOpacity
        onPress={() => onToggleBW(index)}
        style={[styles.bwBtn, set.bw && styles.bwBtnActive]}
        hitSlop={{ top: 6, bottom: 6 }}
      >
        <Text style={[styles.bwBtnText, set.bw && styles.bwBtnTextActive]}>BW</Text>
      </TouchableOpacity>
      <Text style={styles.x}>×</Text>
      <TextInput
        style={styles.setInput}
        placeholder={repsPlaceholder}
        placeholderTextColor={COLORS.textMuted}
        value={set.reps}
        onChangeText={v => {
          const num = parseInt(v);
          if (v !== '' && !isNaN(num) && num < 0) {
            Alert.alert('Invalid', `${repsLabel} cannot be negative.`);
            return;
          }
          if (v !== '' && !isNaN(num) && num > repsMax) {
            Alert.alert('Limit Reached', `Maximum ${repsMax} ${repsLabel.toLowerCase()} per set.`);
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

function seedFromInitial(initial) {
  if (!Array.isArray(initial) || initial.length === 0) return [];
  return initial.map(ex => ({
    name: ex.name || '',
    sets: (ex.sets || []).map(s => ({
      weight: s.weight && s.weight > 0 ? String(s.weight) : '',
      reps: s.reps && s.reps > 0 ? String(s.reps) : '',
      type: s.type || null,
      bw: !!s.bw,
    })),
    ...(ex.supersetGroupId ? { supersetGroupId: ex.supersetGroupId } : {}),
    ...(ex.unit ? { unit: ex.unit } : {}),
    ...(ex.note ? { note: ex.note } : {}),
  }));
}

export default function AssignWorkoutScreen({ route, navigation }) {
  const { clientId, name, initialExercises } = route.params;
  const { user, isInactive } = useAuth();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [exercises, setExercises] = useState(() => seedFromInitial(initialExercises));
  const [newExerciseName, setNewExerciseName] = useState('');
  const [saving, setSaving] = useState(false);
  const [pastExercises, setPastExercises] = useState([]);
  const [pastBest, setPastBest] = useState({});
  const [pastLast, setPastLast] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [tagMenu, setTagMenu] = useState(null); // { exIdx, setIdx }
  const [exerciseMenu, setExerciseMenu] = useState(null); // { exIdx }
  const [supersetPicker, setSupersetPicker] = useState(null); // { exIdx }
  const [noteModal, setNoteModal] = useState(null); // { exIdx }
  const [lastSetsModal, setLastSetsModal] = useState(null); // { name, date, sets, unit }
  const [noteInput, setNoteInput] = useState('');

  useEffect(() => {
    async function loadPast() {
      const q = query(collection(db, 'sessions'), where('clientId', '==', clientId));
      const snap = await getDocs(q);
      const names = new Set();
      const best = {};
      const last = {};

      const sessions = snap.docs
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
          const key = exerciseKey(ex.name);
          if (!key) continue;

          if (!last[key]) {
            let h = null;
            for (const set of (ex.sets || [])) {
              const w = set.weight == null ? 0 : set.weight;
              const cur = h == null ? -1 : (h.weight == null ? 0 : h.weight);
              if (w > cur) h = set;
            }
            if (h) {
              last[key] = {
                date: s.date,
                weight: h.weight,
                reps: h.reps,
                unit: ex.unit || 'reps',
                sets: ex.sets || [],
              };
            }
          }

          // All-time, ranked by heaviest weight lifted — same basis as the Best
          // chip on the current-session screen, so one lift can't show two
          // different "Best" values depending on which screen you're looking at.
          // Ties break toward more reps at that weight.
          const unit = ex.unit || 'reps';
          let top = null;
          for (const set of (ex.sets || [])) {
            const w = set.weight == null ? 0 : set.weight;
            if (w <= 0) continue;
            const reps = set.reps || 0;
            if (!top || w > top.weight || (w === top.weight && reps > top.reps)) {
              top = { weight: w, reps };
            }
          }
          if (top) {
            const prev = best[key];
            if (!prev || top.weight > prev.weight || (top.weight === prev.weight && top.reps > prev.reps)) {
              best[key] = {
                date: s.date,
                weight: top.weight,
                reps: top.reps,
                unit,
              };
            }
          }
        }
      }

      setPastExercises([...names].filter(Boolean).sort());
      setPastBest(best);
      setPastLast(last);
    }
    loadPast();
  }, [clientId]);

  function updateSuggestions(text) {
    setNewExerciseName(text);
    setSuggestions(getExerciseSuggestions(text, pastExercises));
  }

  const hasContent = title.trim() || exercises.length > 0;

  function confirmGoBack() {
    if (!hasContent || saving) {
      navigation.goBack();
      return;
    }
    Alert.alert(
      'Save Workout?',
      'You have an unsaved workout. Do you want to save before leaving?',
      [
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
        { text: 'Stay', style: 'cancel' },
        { text: 'Save', onPress: () => saveAssignedWorkout() },
      ]
    );
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={confirmGoBack} style={{ paddingHorizontal: 4 }} disabled={saving}>
          <Ionicons name="chevron-back" size={26} color={COLORS.accent} />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={saveAssignedWorkout} style={{ paddingHorizontal: 4 }} disabled={saving}>
          <Text style={{ color: COLORS.accent, fontSize: TYPE.heading, fontFamily: FONTS.bold }}>
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, exercises, saving, title, note]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmGoBack();
      return true;
    });
    return () => backHandler.remove();
  }, [exercises, saving, title]);

  function addExercise() {
    const trimmed = newExerciseName.trim();
    if (!trimmed) return;
    setExercises(prev => [...prev, { name: trimmed, sets: [{ weight: '', reps: '', type: null, bw: false }] }]);
    setNewExerciseName('');
  }

  function moveExercise(fromIdx, dir) {
    setExercises(prev => moveExerciseInList(prev, fromIdx, dir));
  }

  function addSet(exIdx) {
    setExercises(prev =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const last = ex.sets[ex.sets.length - 1];
        const newSet = {
          weight: last?.weight || '',
          reps: last?.reps || '',
          type: null,
          bw: !!last?.bw,
        };
        return { ...ex, sets: [...ex.sets, newSet] };
      })
    );
  }

  function toggleSetBW(exIdx, setIdx) {
    setExercises(prev =>
      prev.map((ex, i) =>
        i === exIdx
          ? { ...ex, sets: ex.sets.map((s, j) => {
              if (j !== setIdx) return s;
              const next = !s.bw;
              return { ...s, bw: next, weight: next ? '' : s.weight };
            }) }
          : ex
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
    setExercises(prev => cleanupOrphanGroups(prev.filter((_, i) => i !== exIdx)));
  }

  function makeSuperset(exIdx, partnerIdx) {
    setExercises(prev => {
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
    setExercises(prev => {
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
    setExercises(prev => prev.map((ex, i) =>
      i === exIdx
        ? { ...ex, unit: ex.unit === 'seconds' ? 'reps' : 'seconds' }
        : ex
    ));
    setExerciseMenu(null);
  }

  function openNoteModal(exIdx) {
    setNoteInput(exercises[exIdx]?.note || '');
    setExerciseMenu(null);
    setNoteModal({ exIdx });
  }

  function saveExerciseNote() {
    if (!noteModal) return;
    const idx = noteModal.exIdx;
    const trimmed = noteInput.trim();
    setExercises(prev => prev.map((ex, i) =>
      i === idx ? { ...ex, note: trimmed || null } : ex
    ));
    setNoteModal(null);
    setNoteInput('');
  }

  async function saveAssignedWorkout() {
    if (isInactive) { showNoAccess(); return; }
    if (!title.trim()) {
      Alert.alert('Title required', 'Give this workout a title before assigning.');
      return;
    }
    if (exercises.length === 0) {
      Alert.alert('No exercises', 'Add at least one exercise.');
      return;
    }
    // Keep prescribed sets even when weight/reps are blank (e.g. "3 sets, pick your weight").
    const cleaned = cleanupOrphanGroups(
      exercises
        .filter(ex => ex.name.trim())
        .map(ex => ({
          name: titleCaseExercise(ex.name),
          sets: ex.sets.map(s => ({
            weight: s.bw ? 0 : (s.weight === '' ? null : (parseFloat(s.weight) || 0)),
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
      Alert.alert('No exercises', 'Add at least one exercise with a set.');
      return;
    }

    setSaving(true);
    const result = await guardedSave(() => addDoc(collection(db, 'savedWorkouts'), {
      clientId,
      type: 'assigned',
      sessionId: null,
      title: title.trim(),
      exercises: cleaned,
      assignedBy: user.uid,
      createdAt: serverTimestamp(),
      note: note.trim() || null,
    }), { what: 'assigned workout' });
    // Stay on the editor unless it actually landed, so the work isn't lost.
    if (result !== 'saved') {
      setSaving(false);
      return;
    }
    navigation.goBack();
    Alert.alert('Assigned', `Workout assigned to ${name}.`);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        <Text style={styles.clientLabel}>Assign to {name}</Text>

        <Text style={styles.fieldLabel}>WORKOUT TITLE</Text>
        <TextInput
          style={styles.titleInput}
          placeholder="e.g. Upper Body A"
          placeholderTextColor={COLORS.textMuted}
          value={title}
          onChangeText={setTitle}
          returnKeyType="done"
        />

        <Text style={styles.fieldLabel}>NOTE (OPTIONAL)</Text>
        <TextInput
          style={styles.noteFieldInput}
          placeholder="Instructions for the client…"
          placeholderTextColor={COLORS.textMuted}
          value={note}
          onChangeText={setNote}
          multiline
          textAlignVertical="top"
        />

        {exercises.map((ex, exIdx) => {
          const groupLabel = getSupersetLabel(exercises, ex.supersetGroupId);
          return (
          <View
            key={exIdx}
            style={[styles.exerciseCard, groupLabel && styles.supersetBorder]}
          >
            {groupLabel && (
              <View style={styles.supersetBadge}>
                <Text style={styles.supersetBadgeText}>SUPERSET {groupLabel}</Text>
              </View>
            )}
            <View style={styles.exHeader}>
              <TouchableOpacity
                style={styles.exNameBtn}
                onPress={() => setExerciseMenu({ exIdx })}
                hitSlop={{ top: 6, bottom: 6 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.exName}>{ex.name}</Text>
                  <Ionicons name="chevron-down" size={14} color={COLORS.textMuted} />
                </View>
                {ex.note ? (
                  <Text style={styles.exNote}>{ex.note}</Text>
                ) : null}
              </TouchableOpacity>
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
                disabled={exIdx === exercises.length - 1}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                style={{ padding: 4, opacity: exIdx === exercises.length - 1 ? 0.3 : 1 }}
              >
                <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteExercise(exIdx)}>
                <Text style={styles.removeEx}>Remove</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.colHeaders}>
              <Text style={[styles.colHeader, { width: 28 }]}>SET</Text>
              <Text style={[styles.colHeader, { flex: 1 }]}>WEIGHT</Text>
              <Text style={styles.colHeader}> </Text>
              <Text style={[styles.colHeader, { flex: 1 }]}>{ex.unit === 'seconds' ? 'SEC' : 'REPS'}</Text>
              <Text style={[styles.colHeader, { width: 36 }]}> </Text>
            </View>

            {ex.sets.map((set, setIdx) => (
              <SetRow
                key={setIdx}
                set={set}
                index={setIdx}
                onUpdate={(si, field, val) => updateSet(exIdx, si, field, val)}
                onToggleBW={(si) => toggleSetBW(exIdx, si)}
                onDelete={(si) => deleteSet(exIdx, si)}
                onTagPress={(si) => setTagMenu({ exIdx, setIdx: si })}
                isAboveDropset={ex.sets[setIdx + 1]?.type === 'dropset'}
                unit={ex.unit}
              />
            ))}

            <TouchableOpacity style={styles.addSetBtn} onPress={() => addSet(exIdx)}>
              <Text style={styles.addSetText}>+ Add Set</Text>
            </TouchableOpacity>
            {(() => {
              const k = exerciseKey(ex.name);
              const last = pastLast[k];
              const best = pastBest[k];
              if (!last && !best) return null;

              let lastStr = '';
              if (last) {
                const w = last.weight == null || last.weight === 0 ? 'B.W.' : last.weight;
                const r = last.unit === 'seconds' ? `${last.reps} sec` : last.reps;
                const d = last.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                lastStr = `Last ${w}×${r} · ${d}`;
              }
              let bestStr = '';
              if (best) {
                const isSeconds = best.unit === 'seconds';
                const r = isSeconds ? `${best.reps} sec` : best.reps;
                // Informational only — ranking is by weight. Derived from the winning
                // set so it can't disagree with the weight×reps beside it.
                const oneRm = isSeconds ? null : estimate1RM(best.weight, best.reps);
                bestStr = `Best ${best.weight}×${r}${oneRm ? `  ·  ${oneRm} 1RM` : ''}`;
              }

              return (
                <View style={styles.statsRow}>
                  {last ? (
                    <TouchableOpacity
                      style={styles.statLastBtn}
                      activeOpacity={0.6}
                      onPress={() => setLastSetsModal({
                        name: ex.name,
                        date: last.date,
                        sets: last.sets || [],
                        unit: last.unit,
                      })}
                    >
                      <Text style={styles.statLast} numberOfLines={1}>{lastStr}</Text>
                      <Ionicons name="chevron-forward" size={12} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.statLastBtn} />
                  )}
                  <Text style={styles.statBest} numberOfLines={1}>{bestStr}</Text>
                </View>
              );
            })()}
          </View>
          );
        })}

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

      <Modal visible={exerciseMenu !== null} transparent animationType="fade">
        <Pressable style={styles.tagOverlay} onPress={() => setExerciseMenu(null)}>
          <View style={styles.tagMenu} onStartShouldSetResponder={() => true}>
            <Text style={styles.tagTitle}>
              {exerciseMenu && exercises[exerciseMenu.exIdx]?.name}
            </Text>
            {exerciseMenu && exercises[exerciseMenu.exIdx]?.supersetGroupId ? (
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
                {exerciseMenu && exercises[exerciseMenu.exIdx]?.unit === 'seconds'
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
                {exerciseMenu && exercises[exerciseMenu.exIdx]?.note ? 'Edit Note' : 'Add Note'}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={supersetPicker !== null} transparent animationType="fade">
        <Pressable style={styles.tagOverlay} onPress={() => setSupersetPicker(null)}>
          <View style={styles.pickerMenu} onStartShouldSetResponder={() => true}>
            <Text style={styles.tagTitle}>Pair with…</Text>
            {(() => {
              if (!supersetPicker) return null;
              const others = exercises
                .map((ex, i) => ({ ex, i }))
                .filter(({ i }) => i !== supersetPicker.exIdx);
              if (others.length === 0) {
                return <Text style={styles.pickerEmpty}>Add another exercise first.</Text>;
              }
              return others.map(({ ex, i }, n) => {
                const partnerLabel = getSupersetLabel(exercises, ex.supersetGroupId);
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

      <Modal visible={noteModal !== null} transparent animationType="fade" onRequestClose={() => setNoteModal(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.noteOverlay} onPress={() => setNoteModal(null)}>
            <Pressable style={styles.noteModal} onPress={() => {}}>
              <Text style={styles.tagTitle}>
                {noteModal && exercises[noteModal.exIdx]?.name} — Note
              </Text>
              <TextInput
                style={styles.noteInput}
                placeholder="e.g. tempo 3-1-1, increase next week"
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

      <Modal visible={lastSetsModal !== null} transparent animationType="fade" onRequestClose={() => setLastSetsModal(null)}>
        <View style={styles.noteOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setLastSetsModal(null)} />
          <View style={styles.noteModal}>
            <View style={styles.lastGrabHandle} />
            <TouchableOpacity style={styles.lastCloseX} onPress={() => setLastSetsModal(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
            <ScrollView style={{ maxHeight: POPUP_SCROLL_MAX }} nestedScrollEnabled>
              <Text style={styles.lastModalHeader}>{titleCaseExercise(lastSetsModal?.name || '')}</Text>
              {lastSetsModal?.date ? (
                <Text style={styles.lastModalDate}>
                  {lastSetsModal.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              ) : null}
              <View style={styles.lastHeaderDivider} />
              {(lastSetsModal?.sets || []).map((set, i) => {
                const isSeconds = lastSetsModal.unit === 'seconds';
                const w = set.weight == null || set.weight === 0 ? 'B.W.' : set.weight;
                const r = isSeconds ? `${set.reps} sec` : `${set.reps} reps`;
                const tag = set.type === 'dropset' ? 'Drop set' : set.type === 'superset' ? 'Superset' : null;
                return (
                  <View key={i} style={styles.lastSetRow}>
                    <View style={styles.lastSetNumBadge}>
                      <Text style={styles.lastSetNum}>{i + 1}</Text>
                    </View>
                    <Text style={styles.lastSetText}>{w} × {r}</Text>
                    {tag ? (
                      <View style={styles.lastSetTagPill}>
                        <Text style={styles.lastSetTag}>{tag}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
              {(!lastSetsModal?.sets || lastSetsModal.sets.length === 0) && (
                <Text style={styles.pickerEmpty}>No sets recorded.</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.lastCloseBtn} onPress={() => setLastSetsModal(null)}>
              <Text style={styles.lastCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 20 },
  clientLabel: {
    color: COLORS.textMuted,
    fontSize: TYPE.label,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 20,
    fontFamily: FONTS.bold,
  },
  fieldLabel: {
    color: COLORS.textMuted,
    fontSize: TYPE.caption,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: FONTS.bold,
    marginBottom: 6,
  },
  titleInput: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    color: COLORS.textBright,
    fontSize: TYPE.body,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontFamily: FONTS.semiBold,
    marginBottom: 16,
  },
  noteFieldInput: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    color: COLORS.textBright,
    fontSize: TYPE.body,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontFamily: FONTS.regular,
    minHeight: 60,
    marginBottom: 24,
  },
  exerciseCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  supersetBorder: {
    borderLeftWidth: 4,
    borderLeftColor: SET_COLORS.superset,
  },
  exHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  exNameBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  exName: { color: COLORS.textBright, fontWeight: '700', fontSize: TYPE.heading, fontFamily: FONTS.bold },
  exNote: {
    color: COLORS.textMuted,
    fontSize: TYPE.label,
    fontStyle: 'italic',
    marginTop: 4,
    fontFamily: FONTS.regular,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
  },
  statLastBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  statLast: {
    flexShrink: 1,
    color: COLORS.textMuted,
    fontSize: TYPE.label,
    fontFamily: FONTS.semiBold,
  },
  statBest: {
    flex: 1,
    color: COLORS.accent,
    fontSize: TYPE.label,
    fontFamily: FONTS.semiBold,
    textAlign: 'right',
  },
  lastGrabHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.textMuted,
    marginBottom: 12,
  },
  lastCloseX: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
    padding: 4,
  },
  lastModalHeader: {
    color: COLORS.textBright,
    fontSize: TYPE.heading,
    fontFamily: FONTS.bold,
    textAlign: 'center',
  },
  lastModalDate: {
    color: COLORS.textMuted,
    fontSize: TYPE.label,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
    marginTop: 3,
  },
  lastHeaderDivider: {
    height: 2,
    backgroundColor: COLORS.accent,
    opacity: 0.5,
    borderRadius: 1,
    marginTop: 12,
    marginBottom: 4,
  },
  lastSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  lastSetNumBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accent + '1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastSetNum: {
    color: COLORS.accent,
    fontSize: TYPE.label,
    fontFamily: FONTS.bold,
  },
  lastSetText: {
    flex: 1,
    color: COLORS.textBright,
    fontSize: TYPE.body,
    fontFamily: FONTS.semiBold,
  },
  lastSetTagPill: {
    backgroundColor: COLORS.accent + '1A',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  lastSetTag: {
    color: COLORS.accent,
    fontSize: TYPE.caption,
    fontFamily: FONTS.semiBold,
  },
  lastCloseBtn: {
    marginTop: 16,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  lastCloseText: {
    color: '#000',
    fontSize: TYPE.body,
    fontFamily: FONTS.bold,
  },
  supersetBadge: {
    alignSelf: 'flex-start',
    backgroundColor: SET_COLORS.superset + '22',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 8,
  },
  supersetBadgeText: {
    color: SET_COLORS.superset,
    fontSize: TYPE.caption,
    fontWeight: '800',
    fontFamily: FONTS.extraBold,
    letterSpacing: 0.5,
  },
  removeEx: { color: COLORS.danger, fontSize: TYPE.label, fontFamily: FONTS.regular },
  colHeaders: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  colHeader: {
    color: COLORS.textMuted,
    fontSize: TYPE.caption,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
    fontFamily: FONTS.bold,
  },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingVertical: 2 },
  setNumBtn: { width: 32, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  dropsetLine: { position: 'absolute', top: -12, width: 2, height: 12, backgroundColor: SET_COLORS.dropset, borderRadius: 1 },
  setNum: { color: COLORS.textMuted, textAlign: 'center', fontSize: TYPE.label, fontFamily: FONTS.regular },
  badge: { borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: TYPE.caption, fontWeight: '800', fontFamily: FONTS.extraBold, letterSpacing: 0.5 },
  setInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 6,
    color: COLORS.textBright,
    textAlign: 'center',
    fontSize: TYPE.heading,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontFamily: FONTS.regular,
  },
  setInputLocked: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  setInputLockedText: {
    color: COLORS.accent,
    fontSize: TYPE.body,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontFamily: FONTS.bold,
  },
  bwBtn: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bwBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent + '22',
  },
  bwBtnText: {
    color: COLORS.textMuted,
    fontSize: TYPE.caption,
    fontWeight: '700',
    fontFamily: FONTS.bold,
    letterSpacing: 0.5,
  },
  bwBtnTextActive: {
    color: COLORS.accent,
  },
  x: { color: COLORS.textMuted, marginHorizontal: 8, fontSize: TYPE.heading },
  deleteSetBtn: { width: 36, alignItems: 'center', paddingVertical: 4 },
  deleteSetText: { color: COLORS.danger, fontSize: TYPE.body },
  addSetBtn: { alignItems: 'center', paddingVertical: 10, marginTop: 2 },
  addSetText: { color: COLORS.accent, fontWeight: '600', fontSize: TYPE.body, fontFamily: FONTS.semiBold },
  addExRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  exInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    color: COLORS.textBright,
    fontSize: TYPE.body,
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
  addExBtnText: { color: COLORS.accent, fontWeight: '700', fontSize: TYPE.body, fontFamily: FONTS.bold },
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
  suggestionText: { color: COLORS.textBright, fontSize: TYPE.body, fontFamily: FONTS.regular },
  suggestionBadge: {
    color: COLORS.accent,
    fontSize: TYPE.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: FONTS.bold,
  },
  tagOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  tagMenu: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 16, width: 260, borderWidth: 1, borderColor: COLORS.border },
  pickerMenu: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 16, width: 280, maxHeight: '70%', borderWidth: 1, borderColor: COLORS.border },
  pickerEmpty: { color: COLORS.textMuted, fontSize: TYPE.body, fontFamily: FONTS.regular, textAlign: 'center', paddingVertical: 12 },
  pickerHint: { color: COLORS.textMuted, fontSize: TYPE.caption, fontFamily: FONTS.regular, marginLeft: 8 },
  tagTitle: { color: COLORS.textBright, fontSize: TYPE.body, fontWeight: '700', fontFamily: FONTS.bold, marginBottom: 12, textAlign: 'center' },
  noteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  noteModal: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noteInput: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 14,
    color: COLORS.textBright,
    minHeight: 90,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: TYPE.body,
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
  noteCancelText: { color: COLORS.textMuted, fontSize: TYPE.body, fontFamily: FONTS.semiBold },
  noteSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  noteSaveText: { color: '#000', fontSize: TYPE.body, fontFamily: FONTS.bold },
  tagOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: COLORS.border },
  tagDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  tagOptionText: { color: COLORS.textBright, fontSize: TYPE.body, fontFamily: FONTS.regular, flex: 1 },
  tagCheck: { color: COLORS.accent, fontSize: TYPE.heading, fontWeight: '700', fontFamily: FONTS.bold },
});
