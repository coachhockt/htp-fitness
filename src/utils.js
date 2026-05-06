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
