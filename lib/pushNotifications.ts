import api from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

async function roleBase(): Promise<'/teacher' | '/student'> {
    const role = await AsyncStorage.getItem('userRole');
    return role === 'TEACHER' ? '/teacher' : '/student';
}

/**
 * Requests permission and registers this device's Expo push token with the
 * backend. Call after login and on app launch while already logged in (token
 * rotation, reinstalls). Silently no-ops on simulators/emulators and web —
 * Expo push tokens don't exist there.
 */
export async function registerForPushNotifications(): Promise<void> {
    if (!Device.isDevice) return; // simulators/emulators can't get a real push token

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
