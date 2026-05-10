const UPPER_WORDS = new Set(['db', 'bb', 'ez', 'ohp', 'rdl']);

export function titleCaseExercise(name) {
  return name.trim().split(/\s+/).map(word => {
    if (UPPER_WORDS.has(word.toLowerCase())) return word.toUpperCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

// Epley formula: 1RM = weight × (1 + reps / 30)
export function estimate1RM(weight, reps) {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

export function genSupersetGroupId() {
  return 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// Returns 'A', 'B', 'C'... in order of first appearance, or null if not in a group
export function getSupersetLabel(exercises, groupId) {
  if (!groupId) return null;
  const seen = [];
  for (const ex of exercises) {
    const gid = ex.supersetGroupId;
    if (gid && !seen.includes(gid)) seen.push(gid);
  }
  const idx = seen.indexOf(groupId);
  return idx === -1 ? null : String.fromCharCode(65 + idx);
}

// Returns a new exercises array where any superset group with only one member is cleared.
// Use after deleting/removing an exercise from a group.
export function cleanupOrphanGroups(exercises) {
  const counts = {};
  for (const ex of exercises) {
    if (ex.supersetGroupId) counts[ex.supersetGroupId] = (counts[ex.supersetGroupId] || 0) + 1;
  }
  return exercises.map(ex => {
    if (ex.supersetGroupId && counts[ex.supersetGroupId] < 2) {
      const { supersetGroupId, ...rest } = ex;
      return rest;
    }
    return ex;
  });
}

// Reorder one exercise by direction (-1 up, +1 down), respecting superset groups.
// Within a group, swaps members. At a group boundary, swaps the entire block
// with its neighbor block (so grouped exercises never get separated).
export function moveExerciseInList(exercises, fromIdx, dir) {
  if (fromIdx < 0 || fromIdx >= exercises.length) return exercises;
  const neighborIdx = fromIdx + dir;
  if (neighborIdx < 0 || neighborIdx >= exercises.length) return exercises;

  const ex = exercises[fromIdx];
  const neighbor = exercises[neighborIdx];

  if (ex.supersetGroupId && ex.supersetGroupId === neighbor.supersetGroupId) {
    const next = [...exercises];
    [next[fromIdx], next[neighborIdx]] = [next[neighborIdx], next[fromIdx]];
    return next;
  }

  const blockOf = (idx) => {
    const gid = exercises[idx].supersetGroupId;
    if (!gid) return [idx, idx];
    let s = idx, e = idx;
    while (s > 0 && exercises[s - 1].supersetGroupId === gid) s--;
    while (e < exercises.length - 1 && exercises[e + 1].supersetGroupId === gid) e++;
    return [s, e];
  };

  const [aStart, aEnd] = blockOf(fromIdx);
  const [bStart, bEnd] = blockOf(neighborIdx);

  if (dir === 1) {
    return [
      ...exercises.slice(0, aStart),
      ...exercises.slice(bStart, bEnd + 1),
      ...exercises.slice(aStart, aEnd + 1),
      ...exercises.slice(bEnd + 1),
    ];
  }
  return [
    ...exercises.slice(0, bStart),
    ...exercises.slice(aStart, aEnd + 1),
    ...exercises.slice(bStart, bEnd + 1),
    ...exercises.slice(aEnd + 1),
  ];
}

export function getLastBodyEditDate(obj, kind) {
  if (!obj) return null;
  const explicitField = kind === 'weight' ? 'weightUpdatedAt' : 'fatUpdatedAt';
  const valueField = kind === 'weight' ? 'bodyWeight' : 'bodyFat';
  if (obj[explicitField]) return obj[explicitField];
  if (obj.bodyUpdatedAt) return obj.bodyUpdatedAt;
  const history = Array.isArray(obj.bodyHistory) ? obj.bodyHistory : [];
  const matching = history
    .filter(e => e && e[valueField] != null && e.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  return matching.length > 0 ? matching[0].date : null;
}

export function formatLastEdited(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `Last edited: ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

// For each exercise, compute the best estimated 1RM from all sets
export function compute1RMs(exercises) {
  return exercises.map(ex => ({
    name: ex.name,
    estimated1RM: Math.max(...ex.sets.map(s => estimate1RM(s.weight, s.reps)), 0),
    heaviestSet: ex.sets.reduce((best, s) => {
      const e1rm = estimate1RM(s.weight, s.reps);
      return e1rm > estimate1RM(best.weight, best.reps) ? s : best;
    }, ex.sets[0]),
  }));
}
