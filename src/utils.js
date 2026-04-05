// Epley formula: 1RM = weight × (1 + reps / 30)
export function estimate1RM(weight, reps) {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
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
