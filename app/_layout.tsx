import { BrandingProvider, useBranding } from '@/context/BrandingContext';
import { InstitutionProvider } from '@/context/InstitutionContext';
import { StudentProvider } from '@/context/StudentContext';
import { TeacherProvider } from '@/context/TeacherContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { Caveat_400Regular, Caveat_700Bold } from '@expo-google-fonts/caveat';
import { PatrickHand_400Regular } from '@expo-google-fonts/patrick-hand';
import { Poppins_400Regular, Poppins_600SemiBold, Poppins_600SemiBold_Italic, Poppins_700Bold, Poppins_800ExtraBold, useFonts } from '@expo-google-fonts/poppins';
import { RobotoMono_600SemiBold } from '@expo-google-fonts/roboto-mono';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { registerForPushNotifications } from '@/lib/pushNotifications';
import { useEffect, useRef, useState } from 'react';
import { LogBox } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

SplashScreen.preventAutoHideAsync();

// The app-icon switcher (@g9k/expo-dynamic-app-icon) resolves its native
// module the moment it's touched, which is unavailable in Expo Go and in any
// dev client built before this feature was added — lib/appIcon.ts already
// catches the throw so the app keeps working, but the underlying library
// still logs it via console.error on its way out, which Metro's LogBox would
// otherwise surface as a red screen on every load. Silencing just this one
// known, non-fatal message.
LogBox.ignoreLogs(["Cannot find native module 'ExpoDynamicAppIcon'"]);

function AuthGate() {
    const [ready, setReady] = useState(false);
    const router = useRouter();
    const segments = useSegments();
    const { refreshBranding } = useBranding();
    const pushRegistered = useRef(false);

    // Re-register the push token once per app session on launch (not on every
    // navigation, unlike the effect below) — covers token rotation and
    // reinstalls for a user who's already logged in from a previous session.
    useEffect(() => {
        (async () => {
            if (pushRegistered.current) return;
            const token = await AsyncStorage.getItem('userToken');
            if (!token) return;
            pushRegistered.current = true;
            void registerForPushNotifications();
        })();
    }, []);

    useEffect(() => {
        (async () => {
            const token = await AsyncStorage.getItem('userToken');
            const mustChange = await AsyncStorage.getItem('mustChangePassword');
            const role = await AsyncStorage.getItem('userRole');
            const loggedIn = !!token;
            const mustChangePassword = mustChange === 'true';
            const homeRoute = role === 'TEACHER' ? '/(teacher)' : '/(tabs)';

            const AUTHENTICATED_SCREENS = new Set(['(tabs)', '(teacher)', 'student_detail', 'attendance_detail', 'fees_detail', 'flags', 'report_card', 'test-webview', 'assignment-webview', 'teacher_settings', 'notifications']);
            const inSetup = segments[0] === 'setup-required';
            const inAuthenticatedScreen = AUTHENTICATED_SCREENS.has(segments[0]);

            if (!loggedIn && (inAuthenticatedScreen || inSetup)) { router.replace('/login'); }
            else if (loggedIn && mustChangePassword && !inSetup) { router.replace('/setup-required'); }
            else if (loggedIn && !mustChangePassword && !inAuthenticatedScreen) { router.replace(homeRoute); }

            // Institution branding is only meaningful once authenticated
            // (the /branding endpoint derives it from the JWT's institutionId).
            if (loggedIn) refreshBranding();

            setReady(true);
        })();
    }, [segments]);

    if (!ready) return null;
    return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
    const [fontsLoaded, fontError] = useFonts({
        Poppins_400Regular, Poppins_600SemiBold, Poppins_600SemiBold_Italic, Poppins_700Bold, Poppins_800ExtraBold, Caveat_400Regular,
        Caveat_700Bold, RobotoMono_600SemiBold, PatrickHand_400Regular,
    });

    useEffect(() => {
        if (fontError) console.warn('Font load error:', fontError);
        if (fontsLoaded) SplashScreen.hideAsync();
    }, [fontsLoaded, fontError]);

    if (!fontsLoaded) return null;

    return (
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <ThemeProvider>
                <BrandingProvider>
                    <InstitutionProvider>
                        <StudentProvider>
                            <TeacherProvider>
                                <AuthGate />
                            </TeacherProvider>
                        </StudentProvider>
                    </InstitutionProvider>
                </BrandingProvider>
            </ThemeProvider>
        </SafeAreaProvider>
    );
}