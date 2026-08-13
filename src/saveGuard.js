// Central save-failure detection and messaging.
//
// Firestore's write promises (setDoc/updateDoc/addDoc/batch.commit) only settle
// once the *server* acknowledges the write. Offline — or on the spotty gym
// Wi-Fi this app actually runs on — the write is queued locally and the promise
// never resolves and never rejects. An `await` on it hangs forever, so a screen
// that only has a try/catch shows nothing at all: no success, no error, a
// "Saving..." button stuck on, and the edit is gone if the app is closed before
// the queue drains. That is what "the data just wasn't saved" looks like.
//
// Every write goes through `guardedSave` so a write that doesn't land is always
// reported instead of vanishing silently.
import { Alert } from 'react-native';
import { isPermissionDenied, showNoAccess } from './access';

// How long to wait for the server to acknowledge a write before we stop
// claiming success.
export const SAVE_TIMEOUT_MS = 15000;

const TIMEOUT_MARKER = 'save-timeout';

export function withTimeout(promise, ms = SAVE_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(TIMEOUT_MARKER)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// True when the write was never acknowledged (vs. actively rejected).
export function isSaveTimeout(err) {
  return err?.message === TIMEOUT_MARKER;
}

// A timed-out write is still queued in the SDK and will upload on its own once
// the connection returns — so long as the app isn't force-closed first. Say
// that plainly rather than claiming a hard failure.
function pendingMessage(what) {
  return `Couldn't reach the server, so your ${what} is saved on this device only.\n\n`
    + 'Reconnect and reopen this screen to finish uploading it. Force-closing the app before then will lose it.';
}

function failedMessage(what, err) {
  return `Your ${what} was NOT saved.\n\n${err?.message || 'Unknown error'}`;
}

/**
 * Runs a Firestore write with a timeout and always tells the user what happened.
 *
 * @param write     () => Promise  the write to perform
 * @param what      noun for the message, e.g. 'session', 'client', 'edit'
 * @param onRetry   optional callback wired to a Retry button on hard failures
 * @returns 'saved'   – confirmed committed on the server
 *          'pending' – never acknowledged; queued on-device, user was warned
 *          'failed'  – rejected outright; user was shown the reason
 *          'denied'  – account deactivated; no-access prompt already shown
 */
export async function guardedSave(write, { what = 'change', onRetry, timeoutMs = SAVE_TIMEOUT_MS } = {}) {
  try {
    await withTimeout(write(), timeoutMs);
    return 'saved';
  } catch (err) {
    if (isPermissionDenied(err)) {
      showNoAccess();
      return 'denied';
    }
    if (isSaveTimeout(err)) {
      Alert.alert('Not Uploaded Yet', pendingMessage(what));
      return 'pending';
    }
    Alert.alert(
      'Not Saved',
      failedMessage(what, err),
      onRetry
        ? [{ text: 'Cancel', style: 'cancel' }, { text: 'Retry', onPress: onRetry }]
        : [{ text: 'OK' }]
    );
    return 'failed';
  }
}
