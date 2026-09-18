import AsyncStorage from '@react-native-async-storage/async-storage';
// A random id generated once per app install and persisted in AsyncStorage —
// NOT tied to the logged-in user account. Used only for the test-taking
// single-device lock (see backend student/tasks.controller.ts
// startTest/heartbeatAttempt/listTests): it's how the backend tells two
// different devices logged into the same student account apart, so a live
// test can't be attempted simultaneously on two screens.
//
// The SAME id is also injected into the assignment/test WebViews' own
// localStorage (see test-webview.tsx) — the WebView's `localStorage` is a
// separate storage sandbox from this app's AsyncStorage, so without that
// injection the WebView's copy of this page would generate its own different
// random id and the native tasks list would wrongly think another device
// (rather than itself) is holding the lock.
const STORAGE_KEY = 'qubeexDeviceClientId';
let cached = null;
export async function getDeviceClientId() {
    if (cached)
        return cached;
    try {
        let id = await AsyncStorage.getItem(STORAGE_KEY);
        if (!id) {
            id = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
            await AsyncStorage.setItem(STORAGE_KEY, id);
        }
        cached = id;
        return id;
    }
    catch {
        // AsyncStorage unavailable — fall back to a per-session id (not
        // persisted, so the lock feature just degrades gracefully rather
        // than crashing).
        cached = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        return cached;
    }
}
