// Shared "no access" messaging for accounts that have been deactivated.
// Firestore's isActive() rule denies writes to sessions/savedWorkouts/schedules
// for inactive accounts; this turns the raw permission error into a friendly prompt.
import { Alert } from 'react-native';

export const NO_ACCESS_TITLE = 'No Access';
export const NO_ACCESS_MESSAGE =
  'You do not have access. Please contact HTPerformance to continue using the app.';

// True when an error is a Firestore permission-denied (account deactivated mid-session).
export function isPermissionDenied(err) {
  return err?.code === 'permission-denied'
    || /permission|insufficient/i.test(err?.message || '');
}

export function showNoAccess() {
  Alert.alert(NO_ACCESS_TITLE, NO_ACCESS_MESSAGE);
}

// Use inside a catch block: shows the friendly prompt and returns true if the
// error was a permission denial, so callers can skip their generic error alert.
export function handledNoAccess(err) {
  if (isPermissionDenied(err)) {
    showNoAccess();
    return true;
  }
  return false;
}
