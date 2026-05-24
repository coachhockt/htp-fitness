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
import { compute1RMs, titleCaseExercise, genSupersetGroupId, getSupersetLabel, cleanupOrphanGroups, moveExerciseInList } from '../utils';
import { Ionicons } from '@expo/vector-icons';
import { getExerciseSuggestions } from '../exercises';
import { showNoAccess, handledNoAccess } from '../access';

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

function SetRow({ set, index, onUpdate, onDelete, onTagPress, isAboveDropset, unit }) {
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
      <TextInput
        style={styles.setInput}
        placeholder="B.W."
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

export default function NewSessionScreen({ route, navigation }) {
  const { clientId, name } = route.params;
  const { user, isInactive } = useAuth();
  const [exercises, setExercises] = useState([]);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [saving, setSaving] = useState(false);
  const [pastExercises, setPastExercises] = useState([]);
  const [pastBest, setPastBest] = useState({}); // lowercase name -> { date, weight, reps, unit }
  const [suggestions, setSuggestions] = useState([]);
  const [tagMenu, setTagMenu] = useState(null); // { exIdx, setIdx }
  const [exerciseMenu, setExerciseMenu] = useState(null); // { exIdx }
  const [supersetPicker, setSupersetPicker] = useState(null); // { exIdx }
  const [noteModal, setNoteModal] = useState(null); // { exIdx }
  const [noteInput, setNoteInput] = useState('');

  useEffect(() => {
    async function loadPast() {
      const q = query(collection(db, 'sessions'), where('clientId', '==', clientId));
      const snap = await getDocs(q);
      const names = new Set();
      const best = {};

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

      setPastExercises([...names].filter(Boolean).sort());
      setPastBest(best);
    }
    loadPast();
  }, [clientId]);

  function updateSuggestions(text) {
    setNewExerciseName(text);
    setSuggestions(getExerciseSuggestions(text, pastExercises));
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
    // Deactivated mid-session: can't save, so just leave (don't trap them on the screen).
    if (isInactive) { navigation.goBack(); return; }
    const cleaned = cleanupOrphanGroups(
      exercises
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
      if (!handledNoAccess(e)) Alert.alert('Error saving', e.message);
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
        };
        return { ...ex, sets: [...ex.sets, newSet] };
      })
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

  async function saveSession() {
    if (isInactive) { showNoAccess(); return; }
    if (exercises.length === 0) {
      Alert.alert('No exercises', 'Add at least one exercise before saving.');
      return;
    }

    const cleaned = cleanupOrphanGroups(
      exercises
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
      if (!handledNoAccess(e)) Alert.alert('Error', e.message);
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
  exHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  exNameBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  exName: { color: COLORS.text, fontWeight: '700', fontSize: 17, fontFamily: FONTS.bold },
  exNote: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
    fontFamily: FONTS.regular,
  },
  lastBestText: {
    color: COLORS.accent,
    fontSize: 12,
    marginTop: 8,
    alignSelf: 'flex-start',
    fontFamily: FONTS.semiBold,
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
    fontSize: 9,
    fontWeight: '800',
    fontFamily: FONTS.extraBold,
    letterSpacing: 0.5,
  },
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
});
