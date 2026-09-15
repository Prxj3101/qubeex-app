import api from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

async function roleBase(): Promise<'/teacher' | '/student'> {
    const role = await AsyncStorage.getItem('userRole');
    return role === 'TEACHER' ? '/teacher' : '/student';
}

// expo-notifications throws the moment it's imported when running Android
// remote push inside Expo Go (removed there since SDK 53) — a static import
// at the top of this file would crash app/_layout.tsx for every Expo Go user
// before the app even renders. Loading it lazily, only when these functions
// are actually called, keeps Expo Go usable; real builds (dev client / EAS)
// aren't Expo Go, so the module loads normally there.
function loadNotifications(): typeof import('expo-notifications') | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('expo-notifications');
    } catch {
        return null;
    }
}

/**
 * Requests permission and registers this device's Expo push token with the
 * backend. Call after login and on app launch while already logged in (token
 * rotation, reinstalls). Silently no-ops on simulators/emulators and web —
 * Expo push tokens don't exist there.
 */
export async function registerForPushNotifications(): Promise<void> {
    if (!Device.isDevice) return; // simulators/emulators can't get a real push token

    const Notifications = loadNotifications();
    if (!Notifications) return; // Expo Go — no remote push module available

    try {
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        if (finalStatus !== 'granted') return;

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.DEFAULT,
            });
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const { data: token } = await Notifications.getExpoPushTokenAsync(
            projectId ? { projectId } : undefined
        );

        const base = await roleBase();
        await api.post(`${base}/push-token`, { token, platform: Platform.OS });
    } catch (err) {
        // Never block login/app-launch on push registration failing.
        console.warn('[Push] registration failed:', err);
    }
}

/** Best-effort unregister on logout — the backend also cleans up dead tokens on send failure. */
export async function unregisterCurrentPushToken(): Promise<void> {
    if (!Device.isDevice) return;
    const Notifications = loadNotifications();
    if (!Notifications) return;
    try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const { data: token } = await Notifications.getExpoPushTokenAsync(
            projectId ? { projectId } : undefined
        );
        const base = await roleBase();
        await api.delete(`${base}/push-token`, { data: { token } });
    } catch {
        // best-effort
    }
}
