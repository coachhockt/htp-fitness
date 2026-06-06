// Step-count reader. Reads from Apple HealthKit (iOS) or Health Connect (Android),
// both of which aggregate steps from connected wearables (Apple Watch, Garmin, Fitbit, etc.).
// Display-only — nothing here writes to Firestore. All calls are wrapped so the UI can
// degrade gracefully when health data is unavailable (simulator, permission denied, or
// Health Connect not installed).

import { Platform } from 'react-native';

// Native modules are required lazily so a missing/native-only module never crashes the bundle.
let _hk = null; // react-native-health (iOS)
let _hc = null; // react-native-health-connect (Android)

function getHealthKit() {
  if (_hk === null) {
    // react-native-health uses `module.exports = HealthKit` (no `.default`).
    try { const m = require('react-native-health'); _hk = m.default || m || false; }
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

function hkPermissions(HK) {
  return { permissions: { read: [HK.Constants.Permissions.Steps], write: [] } };
}

function hkInit(HK) {
  return new Promise((resolve) => {
    HK.initHealthKit(hkPermissions(HK), (err) => {
      resolve({ ok: !err, error: err ? (typeof err === 'string' ? err : JSON.stringify(err)) : null });
    });
  });
}

function hkStepsBetween(HK, start, end) {
  // getDailyStepCountSamples returns one bucket per day; sum the values.
  return new Promise((resolve) => {
    HK.getDailyStepCountSamples(
      { startDate: start.toISOString(), endDate: end.toISOString() },
      (err, results) => {
        if (err || !Array.isArray(results)) { resolve(0); return; }
        resolve(Math.round(results.reduce((sum, r) => sum + (r.value || 0), 0)));
      }
    );
  });
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
      if (!HK) return false;
      return new Promise((resolve) => {
        HK.isAvailable((err, available) => resolve(!err && !!available));
      });
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
      if (!HK) return { ok: false, error: 'react-native-health module not found (require failed)' };
      if (typeof HK.initHealthKit !== 'function') {
        // Object exists (Constants present) but native methods are missing — the native
        // module didn't register, typically the New Architecture not loading an old module.
        return { ok: false, error: 'native HealthKit module not registered (initHealthKit missing — likely New Architecture)' };
      }
      // Note: HealthKit never reveals whether READ access was denied (privacy), so a
      // successful init means "ready to try reading", not a guaranteed grant.
      return await hkInit(HK);
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
