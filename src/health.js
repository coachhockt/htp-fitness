// Step-count reader. Reads from Apple HealthKit (iOS) or Health Connect (Android),
// both of which aggregate steps from connected wearables (Apple Watch, Garmin, Fitbit, etc.).
// Display-only — nothing here writes to Firestore. All calls are wrapped so the UI can
// degrade gracefully when health data is unavailable (simulator, permission denied, or
// Health Connect not installed).

import { Platform } from 'react-native';

// Native modules are required lazily so a missing/native-only module never crashes the bundle.
let _hk = null; // @kingstinct/react-native-healthkit (iOS)
let _hc = null; // react-native-health-connect (Android)

// HealthKit identifiers are plain strings in this library (no Constants enum).
const STEP_COUNT = 'HKQuantityTypeIdentifierStepCount';

function getHealthKit() {
  if (_hk === null) {
    try { const m = require('@kingstinct/react-native-healthkit'); _hk = m || false; }
    catch (e) { _hk = false; }
  }
  return _hk || null;
}

function getHealthConnect() {
  if (_hc === null) {
    try { const m = require('react-native-health-connect'); _hc = m.default || m || false; }
    catch (e) { _hc = false; }
  }
  return _hc || null;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const d = new Date(now);
  d.setDate(now.getDate() - (day === 0 ? 6 : day - 1)); // Monday
  d.setHours(0, 0, 0, 0);
  return d;
}

// --- iOS (HealthKit) ---

// One cumulative-sum statistics query replaces the old per-day sample fetch: HealthKit
// aggregates server-side, so there are no buckets to sum here. Dates go in as Date
// objects (the previous library wanted ISO strings).
async function hkStepsBetween(HK, start, end) {
  const res = await HK.queryStatisticsForQuantity(STEP_COUNT, ['cumulativeSum'], {
    filter: { date: { startDate: start, endDate: end } },
    unit: 'count',
  });
  return Math.round(res?.sumQuantity?.quantity || 0);
}

// --- Android (Health Connect) ---

async function hcStepsBetween(HC, start, end) {
  const { records } = await HC.readRecords('Steps', {
    timeRangeFilter: {
      operator: 'between',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    },
  });
  return (records || []).reduce((sum, r) => sum + (r.count || 0), 0);
}

// --- Public API ---

// Whether step tracking can work on this device at all.
export async function isStepsAvailable() {
  try {
    if (Platform.OS === 'ios') {
      const HK = getHealthKit();
      if (!HK || typeof HK.isHealthDataAvailableAsync !== 'function') return false;
      return !!(await HK.isHealthDataAvailableAsync());
    }
    if (Platform.OS === 'android') {
      const HC = getHealthConnect();
      if (!HC) return false;
      const status = await HC.getSdkStatus();
      return status === HC.SdkAvailabilityStatus.SDK_AVAILABLE;
    }
    return false;
  } catch (e) {
    return false;
  }
}

// Prompt the user for read access to step data.
// Returns { ok: boolean, error: string|null } so the UI can surface the real reason.
export async function requestStepAccess() {
  try {
    if (Platform.OS === 'ios') {
      const HK = getHealthKit();
      if (!HK) return { ok: false, error: '@kingstinct/react-native-healthkit module not found (require failed)' };
      if (typeof HK.requestAuthorization !== 'function') {
        // Module resolved but its native side is absent — the Nitro module didn't register.
        return { ok: false, error: 'native HealthKit module not registered (requestAuthorization missing)' };
      }
      // Note: HealthKit never reveals whether READ access was denied (privacy), so a
      // successful request means "ready to try reading", not a guaranteed grant.
      const ok = await HK.requestAuthorization({ toRead: [STEP_COUNT] });
      return { ok: !!ok, error: ok ? null : 'authorization request was not granted' };
    }
    if (Platform.OS === 'android') {
      const HC = getHealthConnect();
      if (!HC) return { ok: false, error: 'react-native-health-connect module not found' };
      await HC.initialize();
      const granted = await HC.requestPermission([{ accessType: 'read', recordType: 'Steps' }]);
      const ok = Array.isArray(granted) && granted.length > 0;
      return { ok, error: ok ? null : 'permission not granted' };
    }
    return { ok: false, error: 'unsupported platform' };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// Steps logged so far today. Returns a number (0 on any failure).
export async function getTodaySteps() {
  try {
    const now = new Date();
    if (Platform.OS === 'ios') {
      const HK = getHealthKit();
      if (!HK) return 0;
      return await hkStepsBetween(HK, startOfToday(), now);
    }
    if (Platform.OS === 'android') {
      const HC = getHealthConnect();
      if (!HC) return 0;
      return await hcStepsBetween(HC, startOfToday(), now);
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

// Steps since Monday (this week so far). Returns a number (0 on any failure).
export async function getWeeklySteps() {
  try {
    const now = new Date();
    if (Platform.OS === 'ios') {
      const HK = getHealthKit();
      if (!HK) return 0;
      return await hkStepsBetween(HK, startOfWeek(), now);
    }
    if (Platform.OS === 'android') {
      const HC = getHealthConnect();
      if (!HC) return 0;
      return await hcStepsBetween(HC, startOfWeek(), now);
    }
    return 0;
  } catch (e) {
    return 0;
  }
}
