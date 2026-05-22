// Single source of truth for the exercise library + autocomplete logic.
// Imported by NewSessionScreen, SessionDetailScreen, and ClientDetailScreen (Assign Workout).

export const COMMON_EXERCISES = [
  // Chest
  'Bench Press', 'Incline Bench Press', 'Decline Bench Press',
  'DB Bench Press', 'DB Incline Bench Press', 'DB Decline Bench Press',
  'DB Fly', 'DB Incline Fly', 'DB Pullover', 'DB Floor Press', 'DB Squeeze Press',
  'Push Up', 'Diamond Push Up', 'Wide-Grip Push Up', 'Decline Push Up', 'Incline Push Up',
  'Pike Push Up', 'Handstand Push Up', 'Archer Push Up', 'Pseudo Planche Push Up', 'Clap Push Up',
  'Cable Crossover', 'Cable Fly', 'Cable Press', 'Cable Bench Press', 'Single-Arm Cable Fly',
  'Incline Cable Press', 'Incline Cable Fly', 'Low to High Cable Fly', 'High to Low Cable Fly',
  'Pec Deck', 'Machine Chest Press', 'Incline Machine Chest Press',
  'Dips', 'Close-Grip Bench Press', 'Incline Close-Grip Bench Press',
  'DB Incline Squeeze Press', 'Reverse-Grip Incline Bench Press', 'BB Floor Press',
  'Smith Bench Press', 'Smith Incline Bench Press', 'Smith Decline Bench Press', 'Smith Close-Grip Bench Press',
  // Legs - Squat variants
  'Squat', 'Back Squat', 'Front Squat', 'Goblet Squat', 'Bulgarian Split Squat',
  'Box Squat', 'Pause Squat', 'Pin Squat', 'Zercher Squat', 'Overhead Squat',
  'Hack Squat', 'Sissy Squat',
  'DB Squat', 'DB Sumo Squat', 'BW Squat', 'Jump Squat', 'Pistol Squat',
  'Smith Squat', 'Smith Front Squat', 'Smith Split Squat', 'Smith Bulgarian Split Squat',
  // Legs - Lunge / Step
  'Lunge', 'Walking Lunge', 'Reverse Lunge', 'Step Up',
  'BB Walking Lunge', 'BB Reverse Lunge', 'BB Step Up',
  'DB Lunge', 'DB Walking Lunge', 'DB Reverse Lunge', 'DB Bulgarian Split Squat', 'DB Step Up',
  'Smith Lunge', 'Smith Reverse Lunge',
  // Legs - Press / Curl / Extension
  'Leg Press', 'Leg Curl', 'Leg Extension',
  'Calf Raise', 'DB Calf Raise', 'BB Calf Raise', 'Smith Calf Raise',
  'Adductor', 'Abductor', 'Wall Sit', 'Broad Jump', 'Mammoth Belt Squat',
  // Glutes / Hips
  'Hip Thrust', 'BB Glute Bridge', 'Glute Bridge', 'Single-Leg Glute Bridge', 'BW Hip Thrust',
  'DB Hip Thrust', 'Smith Hip Thrust',
  'Glute Kickback', 'Cable Glute Kickback', 'Cable Hip Abduction', 'Cable Pull Through',
  'Nordic Curl', 'Good Morning', 'Smith Good Morning',
  // Posterior chain / Deadlift
  'Deadlift', 'Sumo Deadlift', 'Romanian Deadlift', 'DB Romanian Deadlift',
  'Deficit Deadlift', 'Rack Pull', 'Stiff-Leg Deadlift', 'Snatch-Grip Deadlift',
  'DB Single-Leg Deadlift', 'Smith Romanian Deadlift',
  // Shoulders
  'Overhead Press', 'DB Shoulder Press', 'DB Incline Shoulder Press', 'Arnold Press', 'Behind-the-Neck Press',
  'Smith Overhead Press', 'Smith Incline Shoulder Press', 'Smith Behind-the-Neck Press',
  'Lateral Raise', 'DB Lateral Raise', 'Cable Lateral Raise', 'Incline Lateral Raise',
  'Front Raise', 'DB Front Raise', 'BB Front Raise', 'Cable Front Raise',
  'Rear Delt Fly', 'DB Rear Delt Fly', 'Cable Rear Delt Fly', 'Cable Reverse Fly', 'Incline Rear Delt Fly',
  'Upright Row', 'Cable Upright Row', 'BB Upright Row', 'DB Upright Row', 'Smith Upright Row', 'DB High Pull',
  'DB Y-Raise', 'Incline Y-Raise', 'Incline T-Raise', 'DB Cuban Press', 'DB Push Press',
  // Back
  'Barbell Row', 'BB Row', 'DB Row', 'Single-Arm DB Row', 'Pendlay Row', 'Yates Row',
  'Reverse-Grip BB Row', 'Seated Cable Row', 'Cable Row', 'Wide-Grip Cable Row',
  'Single-Arm Cable Row', 'Machine Row', 'T-Bar Row', 'Meadows Row',
  'DB Renegade Row', 'Chest-Supported DB Row', 'Butt-Supported Row', 'Incline DB Row', 'Kroc Row', 'Judd Row',
  'Smith Bent-Over Row', 'Smith Inverted Row',
  'Pull Up', 'Chin Up', 'Wide-Grip Pull Up', 'Close-Grip Pull Up', 'Neutral-Grip Pull Up',
  'Australian Pull Up', 'Muscle Up',
  'Lat Pulldown', 'Wide-Grip Pulldown', 'Close-Grip Pulldown', 'Reverse-Grip Pulldown',
  'Straight-Arm Pulldown', 'Cable Pullover', 'Inverted Row',
  // Biceps
  'Barbell Curl', 'BB Curl', 'DB Curl', 'Hammer Curl', 'Preacher Curl',
  'EZ Bar Curl', 'Cable Curl', 'Concentration Curl', 'Spider Curl', 'Reverse Curl',
  'Drag Curl', 'Cable Hammer Curl', 'Cable Preacher Curl', 'Cable Concentration Curl',
  'Rope Hammer Curl', 'Bayesian Curl',
  'DB Preacher Curl', 'DB Incline Curl', 'Incline Hammer Curl', 'DB Spider Curl', 'Zottman Curl', 'Cross-Body Hammer Curl',
  // Triceps
  'Tricep Pushdown', 'Rope Pushdown', 'Reverse-Grip Pushdown', 'Single-Arm Cable Pushdown',
  'Skull Crusher', 'BB JM Press', 'Tricep Dip', 'Bench Dip',
  'Overhead Tricep Extension', 'Cable Overhead Tricep Extension', 'Cable Kickback',
  'DB Skull Crusher', 'Incline DB Skull Crusher', 'Incline DB Tricep Extension',
  'DB Kickback', 'DB Tate Press', 'DB JM Press',
  // Traps / other
  'Face Pull', 'Shrug', 'DB Shrug', 'Barbell Shrug', 'Smith Shrug',
  // Core / Abs
  'Plank', 'Side Plank', 'Hollow Hold', 'L-Sit',
  'Crunch', 'Cable Crunch', 'Reverse Crunch', 'Cable Reverse Crunch', 'Bicycle Crunch', 'Decline Crunch',
  'Decline Sit Up',
  'Hanging Leg Raise', 'Lying Leg Raise', 'Toes to Bar', 'Knees to Elbows',
  'Ab Wheel', 'Barbell Rollout',
  'Russian Twist', 'BB Russian Twist', 'DB Russian Twist', 'Cable Woodchopper', 'Low to High Woodchop', 'High to Low Woodchop', 'Pallof Press',
  'Cable Side Bend', 'DB Side Bend',
  'Dead Bug', 'Bird Dog', 'Sit Up', 'DB Sit Up', 'GHD Sit Up', 'V-Up', 'DB V-Up',
  'Mountain Climber', 'Flutter Kicks', 'Superman',
  'Landmine Press', 'Landmine Row', 'Landmine Twist',
  // Cardio / Conditioning
  'Treadmill', 'Bike', 'Rower', 'Stair Climber',
  'Box Jump', 'Burpee', 'Battle Ropes', 'Sled Push', 'Farmer Carry', 'DB Farmer Carry',
  'DB Thruster', 'DB Burpee', 'DB Man Maker',
  'Pike Walk', 'Bear Crawl', 'Crab Walk',
  // Olympic / Power
  'Clean', 'Power Clean', 'Hang Clean', 'Snatch', 'Power Snatch',
  'Push Press', 'Jerk', 'Clean and Jerk', 'Push Jerk', 'Clean Pull', 'Snatch Pull',
  'Kettlebell Swing', 'KB Goblet Squat',
  'DB Snatch', 'DB Clean', 'DB Clean and Press',
  // Mobility / Warm-up
  "World's Greatest Stretch", '90/90', 'Couch Stretch', 'Hip CARs', 'Banded Pull Apart',
];

export const ABBREVIATIONS = {
  'db': 'dumbbell', 'bb': 'barbell', 'ez': 'ez bar', 'kb': 'kettlebell',
  'sm': 'smith', 'cb': 'cable',
  'ohp': 'overhead press', 'rdl': 'romanian deadlift',
  'bp': 'bench press', 'dl': 'deadlift', 'sq': 'squat',
  'lr': 'lateral raise', 'bw': 'bodyweight', 'pu': 'push up', 'sl': 'single leg',
};

// Returns up to 5 suggested exercise names for the typed text.
// Recently-used exercises (passed in via pastExercises) rank first, then alphabetical.
// Pure function — no state side-effects, so every screen can share it.
export function getExerciseSuggestions(text, pastExercises = []) {
  if (!text || !text.trim()) return [];

  const lower = text.toLowerCase();
  // Expand abbreviations for matching (e.g. "db" also matches "dumbbell").
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

  // Past exercises first, then alphabetical.
  return matches.sort((a, b) => {
    const aIsPast = pastExercises.includes(a);
    const bIsPast = pastExercises.includes(b);
    if (aIsPast && !bIsPast) return -1;
    if (!aIsPast && bIsPast) return 1;
    return a.localeCompare(b);
  }).slice(0, 5);
}
