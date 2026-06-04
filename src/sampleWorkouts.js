function emptySets(n) {
  return Array.from({ length: n }, () => ({ weight: 0, reps: 0 }));
}

export const SAMPLE_WORKOUTS = [
  {
    id: 'sample-push',
    title: 'Push Day',
    description: 'Chest, shoulders, triceps',
    exercises: [
      { name: 'Bench Press', sets: emptySets(4) },
      { name: 'Overhead Press', sets: emptySets(3) },
      { name: 'Incline Dumbbell Press', sets: emptySets(3) },
      { name: 'Lateral Raise', sets: emptySets(3) },
      { name: 'Tricep Pushdown', sets: emptySets(3) },
    ],
  },
  {
    id: 'sample-pull',
    title: 'Pull Day',
    description: 'Back and biceps',
    exercises: [
      { name: 'Pull Up', sets: emptySets(4) },
      { name: 'Barbell Row', sets: emptySets(4) },
      { name: 'Lat Pulldown', sets: emptySets(3) },
      { name: 'Face Pull', sets: emptySets(3) },
      { name: 'Bicep Curl', sets: emptySets(3) },
    ],
  },
  {
    id: 'sample-legs',
    title: 'Leg Day',
    description: 'Quads, hamstrings, glutes, calves',
    exercises: [
      { name: 'Back Squat', sets: emptySets(5) },
      { name: 'Romanian Deadlift', sets: emptySets(4) },
      { name: 'Leg Press', sets: emptySets(3) },
      { name: 'Leg Curl', sets: emptySets(3) },
      { name: 'Calf Raise', sets: emptySets(4) },
    ],
  },
  {
    id: 'sample-shoulders-arms',
    title: 'Shoulders & Arms',
    description: 'Delts, biceps, triceps',
    exercises: [
      { name: 'Overhead Press', sets: emptySets(4) },
      { name: 'Lateral Raise', sets: emptySets(4) },
      { name: 'Rear Delt Fly', sets: emptySets(3) },
      { name: 'Bicep Curl', sets: emptySets(4) },
      { name: 'Tricep Extension', sets: emptySets(4) },
    ],
  },
];

export function getSampleById(id) {
  return SAMPLE_WORKOUTS.find(s => s.id === id) || null;
}
