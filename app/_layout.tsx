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
import { createElement, forwardRef, useEffect, useRef, useState } from 'react';
import { LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

SplashScreen.preventAutoHideAsync();

// All of our layouts, font sizes and paddings are hand-tuned against a fixed
// text scale. By default RN scales every <Text>/<TextInput> with the device's
// OS-level "Text Size" / "Larger Text" accessibility setting — so a user who
// has that set to anything above the default gets our carefully-sized text
// blown up and clipped/overflowing everywhere (exactly what happened when the
// iPhone's text size was changed from a smaller custom value back to the
// system default). We want our sizes to stay exactly as designed regardless
// of the device's text-size setting, on both iOS and Android.
//
// Things that DON'T work here, all tried first:
//  1. `Text.defaultProps.allowFontScaling = false` — no-op on React 19,
//     which dropped defaultProps support for function/forwardRef components.
//  2. Patching `Text.render` in place — RN 0.86's Text/TextInput are plain
//     function components declared with the new `component(...)` syntax, not
//     forwardRef, so they have no `.render` to patch.
//  3. Patching via `import * as ReactNative from 'react-native'` — RN's
//     index.js is CommonJS, so that import goes through Babel's
//     `_interopRequireWildcard`, which hands back a *copy* of the exports
//     object. Patching the copy changes nothing for anyone else.
// What actually works: grab the real module object with `require()` (the
// exact same object every other file's `import { Text } from 'react-native'`
// reads `.Text` off of at render time) and redefine its Text/TextInput keys
// to wrappers that force `allowFontScaling={false}`. Those keys are declared
// as `get Text() {...}` getters, so plain assignment throws "only a getter" —
// Object.defineProperty replaces them outright, which does work. Doing this
// here, at root-layout module scope, means it lands before anything renders
// and applies to every screen without touching each one.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RNAny = require('react-native');
if (!RNAny.__fontScalingPatched) {
    const OriginalText = RNAny.Text;
    const OriginalTextInput = RNAny.TextInput;

    const PatchedText = forwardRef((props: object, ref: unknown) =>
        createElement(OriginalText, { ...props, ref, allowFontScaling: false })
    );
    const PatchedTextInput = forwardRef((props: object, ref: unknown) =>
        createElement(OriginalTextInput, { ...props, ref, allowFontScaling: false })
    );

    Object.defineProperty(RNAny, 'Text', { value: PatchedText, writable: true, configurable: true });
    Object.defineProperty(RNAny, 'TextInput', { value: PatchedTextInput, writable: true, configurable: true });

    // Animated.Text / Animated.TextInput are separate components that RN built
    // from the *original* Text/TextInput when its own Animated module loaded,
    // so replacing the exports above doesn't touch them — anything rendered
    // with <Animated.Text> (the topbar brand name, Thought of the Day, the
    // student home header) would keep scaling with the OS setting. Wrap those
    // too; the wrapper only forces the one prop, so animated styles still work.
    const Animated = RNAny.Animated;
    if (Animated) {
        const OriginalAnimatedText = Animated.Text;
        const OriginalAnimatedTextInput = Animated.TextInput;
        if (OriginalAnimatedText) {
            Object.defineProperty(Animated, 'Text', {
                value: forwardRef((props: object, ref: unknown) =>
                    createElement(OriginalAnimatedText, { ...props, ref, allowFontScaling: false })
                ),
                writable: true,
                configurable: true,
            });
        }
        if (OriginalAnimatedTextInput) {
            Object.defineProperty(Animated, 'TextInput', {
                value: forwardRef((props: object, ref: unknown) =>
                    createElement(OriginalAnimatedTextInput, { ...props, ref, allowFontScaling: false })
                ),
                writable: true,
                configurable: true,
            });
        }
    }

    RNAny.__fontScalingPatched = true;
}

// The app-icon switcher (@g9k/expo-dynamic-app-icon) resolves its native
// module the moment it's touched, which is unavailable in Expo Go and in any
// dev client built before this feature was added — lib/appIcon.ts already
// catches the throw so the app keeps working, but the underlying library
// still logs it via console.error on its way out, which Metro's LogBox would
// otherwise surface as a red screen on every load. Silencing just this one
// known, non-fatal message.
LogBox.ignoreLogs([
    "Cannot find native module 'ExpoDynamicAppIcon'",
    'expo-notifications: Android Push notifications',
]);

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

            const AUTHENTICATED_SCREENS = new Set(['(tabs)', '(teacher)', 'student_detail', 'attendance_detail', 'fees_detail', 'flags', 'report_card', 'test-webview', 'assignment-webview', 'teacher_settings', 'notifications', 'teacher_class_detail']);
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
    return (
        <Stack screenOptions={{ headerShown: false }}>
            {/* Explicit slide-from-right push/pop for the class detail screen
                (opened from the class card's arrow button in Classes) — makes
                sure it's a real slide in both directions rather than whatever
                native-stack's platform default animation happens to be. */}
            <Stack.Screen name="teacher_class_detail" options={{ animation: 'slide_from_right' }} />
        </Stack>
    );
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
        // The documented root for react-native-gesture-handler (a dependency
        // here, and what react-navigation's gestures run on). Anything from
        // that library throws "NativeViewGestureHandler must be used as a
        // descendant of GestureHandlerRootView" without this, and it has to
        // sit above the Stack rather than around an individual screen, since
        // it sets up the native gesture root the whole tree renders into.
        <GestureHandlerRootView style={{ flex: 1 }}>
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
        </GestureHandlerRootView>
    );
}