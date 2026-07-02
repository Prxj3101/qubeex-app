import { InstitutionProvider } from '@/context/InstitutionContext';
import { StudentProvider } from '@/context/StudentContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { Caveat_400Regular, Caveat_700Bold } from '@expo-google-fonts/caveat';
import { PatrickHand_400Regular } from '@expo-google-fonts/patrick-hand';
import { Poppins_400Regular, Poppins_600SemiBold, Poppins_600SemiBold_Italic, Poppins_700Bold, Poppins_800ExtraBold, useFonts } from '@expo-google-fonts/poppins';
import { RobotoMono_600SemiBold } from '@expo-google-fonts/roboto-mono';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';

SplashScreen.preventAutoHideAsync();

function AuthGate() {
    const [ready, setReady] = useState(false);
    const router = useRouter();
    const segments = useSegments();

    useEffect(() => {
        (async () => {
            const token = await AsyncStorage.getItem('userToken');
            const mustChange = await AsyncStorage.getItem('mustChangePassword');
            const loggedIn = !!token;
            const mustChangePassword = mustChange === 'true';

            const AUTHENTICATED_SCREENS = new Set(['(tabs)', 'student_detail', 'attendance_detail', 'fees_detail', 'flags', 'report_card', 'test-webview']);
            const inTabs = segments[0] === '(tabs)';
            const inSetup = segments[0] === 'setup-required';
            const inAuthenticatedScreen = AUTHENTICATED_SCREENS.has(segments[0]);

            if (!loggedIn && (inAuthenticatedScreen || inSetup)) { router.replace('/login'); }
            else if (loggedIn && mustChangePassword && !inSetup) { router.replace('/setup-required'); }
            else if (loggedIn && !mustChangePassword && !inAuthenticatedScreen) { router.replace('/(tabs)'); }

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
        <ThemeProvider>
            <InstitutionProvider>
                <StudentProvider>
                    <AuthGate />
                </StudentProvider>
            </InstitutionProvider>
        </ThemeProvider>
    );
}