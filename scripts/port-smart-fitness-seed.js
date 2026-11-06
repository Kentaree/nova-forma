/* global __dirname */
/* One-off: converts smart-fitness backend/prisma/seed.js into src/data/exercises.json.
 * Usage: node scripts/port-smart-fitness-seed.js <path-to-smart-fitness>/backend/prisma/seed.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(process.argv[2], 'utf8')
  .replace(/^const \{ PrismaClient \}.*$/m, '')
  .replace(/^const prisma = .*$/m, '')
  .replace(/^async function main[\s\S]*$/m, '');
const ctx = {};
vm.runInNewContext(src + '\nthis.out = { equipmentData, exerciseData, exerciseEquipmentData };', ctx);
const { equipmentData, exerciseData, exerciseEquipmentData } = ctx.out;

const slug = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const parse = (v) => (v ? JSON.parse(v) : []);
const BODYWEIGHT = 'None (Bodyweight)';

const equipment = equipmentData.map((e) => ({ id: slug(e.name) || 'bodyweight', name: e.name, category: e.category }));
const eqId = Object.fromEntries(equipment.map((e) => [e.name, e.id]));

// Log-type corrections where the category heuristic gets it wrong.
const DISTANCE_CARDIO = new Set(['Running', 'Stationary Bike', 'Rowing Machine', 'Treadmill Walking', 'Sprints']);
const REPS = new Set([
  'Pull-ups', 'Chin-ups', 'Assisted Pull-ups', 'Scapular Pull-ups', 'Ab Wheel Rollout', 'Kneeling Ab Rollout',
  'Face Pulls', 'Band Pull-aparts', 'Band Chest Press', 'Band Overhead Press', 'Band Rows',
  'Burpees', 'Jump Squats', 'Box Jumps', 'Step Ups', 'Russian Twists', 'Plank Shoulder Taps',
]);

// Gym staples missing from smart-fitness (it was built around home equipment).
const GYM = (name, primary, secondary, equipment, logType = 'weight_reps') => ({
  name, category: 'strength', logType, primaryMuscles: primary, secondaryMuscles: secondary,
  instructions: [], description: null, difficulty: 'intermediate', equipment,
});
const additions = [
  GYM('Romanian Deadlift', ['hamstrings', 'glutes'], ['back'], ['barbell', 'weight-plates']),
  GYM('Incline Barbell Bench Press', ['chest', 'shoulders'], ['triceps'], ['barbell', 'bench']),
  GYM('Incline Dumbbell Press', ['chest', 'shoulders'], ['triceps'], ['dumbbells', 'bench']),
  GYM('Front Squat', ['quadriceps', 'glutes'], ['core'], ['barbell', 'weight-plates', 'squat-rack']),
  GYM('Barbell Hip Thrust', ['glutes'], ['hamstrings'], ['barbell', 'bench']),
  GYM('Overhead Press', ['shoulders'], ['triceps', 'core'], ['barbell', 'weight-plates']),
  GYM('Barbell Curl', ['biceps'], ['forearms'], ['barbell']),
  GYM('Hammer Curls', ['biceps', 'forearms'], [], ['dumbbells']),
  GYM('Skull Crushers', ['triceps'], [], ['barbell', 'bench']),
  GYM('Lat Pulldown', ['back', 'biceps'], ['shoulders'], ['cable-machine']),
  GYM('Seated Cable Row', ['back'], ['biceps'], ['cable-machine']),
  GYM('Cable Tricep Pushdown', ['triceps'], [], ['cable-machine']),
  GYM('Cable Fly', ['chest'], ['shoulders'], ['cable-machine']),
  GYM('Cable Lateral Raise', ['shoulders'], [], ['cable-machine']),
  GYM('Cable Face Pull', ['shoulders', 'back'], [], ['cable-machine']),
  GYM('Leg Press', ['quadriceps', 'glutes'], ['hamstrings'], []),
  GYM('Leg Extension', ['quadriceps'], [], []),
  GYM('Lying Leg Curl', ['hamstrings'], [], []),
  GYM('Seated Calf Raise', ['calves'], [], []),
  GYM('Chest Press Machine', ['chest'], ['triceps', 'shoulders'], []),
  GYM('Pec Deck', ['chest'], [], []),
  GYM('Hack Squat', ['quadriceps', 'glutes'], [], []),
  GYM('T-Bar Row', ['back'], ['biceps'], ['barbell', 'weight-plates']),
  GYM('Rear Delt Fly', ['shoulders'], ['back'], ['dumbbells']),
  GYM('Weighted Dips', ['triceps', 'chest'], ['shoulders'], []),
  GYM('Kettlebell Swings', ['glutes', 'hamstrings'], ['core', 'back'], ['kettlebell']),
  GYM('Hanging Leg Raise', ['core'], [], ['pull-up-bar'], 'reps'),
  GYM('Cable Crunch', ['core'], [], ['cable-machine']),
  { ...GYM('Elliptical', ['quadriceps', 'glutes'], [], ['elliptical'], 'cardio'), category: 'cardio' },
  { ...GYM('Stair Climber', ['quadriceps', 'glutes', 'calves'], [], [], 'cardio'), category: 'cardio' },
];

const exercises = exerciseData.map((x) => {
  const rel = exerciseEquipmentData.filter((r) => r.exerciseName === x.name);
  const required = rel.filter((r) => r.required).map((r) => r.equipmentName);
  let logType = 'weight_reps';
  if (DISTANCE_CARDIO.has(x.name)) logType = 'cardio';
  else if (REPS.has(x.name)) logType = 'reps';
  else if (x.category === 'cardio') logType = 'time';
  else if (x.avgSecondsHold && !x.avgSecondsPerRep) logType = 'time';
  else if (x.category === 'flexibility') logType = 'time';
  else if (required.length === 0 || required.every((n) => n === BODYWEIGHT)) logType = 'reps';
  return {
    id: slug(x.name),
    name: x.name,
    category: x.category,
    logType,
    primaryMuscles: parse(x.primaryMuscles),
    secondaryMuscles: parse(x.secondaryMuscles),
    instructions: parse(x.instructions),
    description: x.description ?? null,
    difficulty: x.difficulty,
    equipment: required.filter((n) => n !== BODYWEIGHT).map((n) => eqId[n]).filter(Boolean),
  };
});

for (const a of additions) {
  if (exercises.some((e) => e.name === a.name)) throw new Error('already present: ' + a.name);
  exercises.push({ id: slug(a.name), ...a });
}

const ids = new Set();
for (const e of exercises) { if (ids.has(e.id)) throw new Error('dup id ' + e.id); ids.add(e.id); }

const out = path.join(__dirname, '..', 'src', 'data', 'exercises.json');
fs.writeFileSync(out, JSON.stringify({ equipment, exercises }, null, 2) + '\n');
console.log(`wrote ${exercises.length} exercises, ${equipment.length} equipment to ${out}`);
const counts = {}; exercises.forEach((e) => (counts[e.logType] = (counts[e.logType] || 0) + 1)); console.log(counts);
