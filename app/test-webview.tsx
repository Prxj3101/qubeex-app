import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
// Only used for its action-object type; not constructed directly here.
import type { NavigationAction } from '@react-navigation/native';

// Apex domain (qubeex.in, no www) redirects to www.qubeex.in but drops the
// path/query in the process (a hosting/DNS-level "forward to www" rule, not
// something in this app's code) — landing straight on /login and losing the
// wvToken param entirely. Point at www directly so the redirect never
// happens in the first place.
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://www.qubeex.in';

export default function TestWebViewScreen() {
    const { testId, attemptId } = useLocalSearchParams<{ testId: string; attemptId?: string }>();
    const [token, setToken] = useState<string | null>(null);
    const webViewRef = useRef<WebView>(null);
    const canGoBackRef = useRef(false);
    const navigation = useNavigation();
    // Set right before we re-dispatch the original remove action once the
    // user has confirmed — lets it through instead of showing the warning
    // a second time.
    const allowLeaveRef = useRef(false);
    const pendingActionRef = useRef<NavigationAction | null>(null);

    useEffect(() => {
        AsyncStorage.getItem('userToken').then(t => setToken(t));
    }, []);

    // Catches every way this screen can be removed — header back button,
    // Android hardware back, AND iOS's edge-swipe-back gesture (which never
    // touched the old BackHandler-only setup below, so swiping out used to
    // leave without any warning or submit at all). `beforeRemove` fires for
    // all of them uniformly since they all go through the navigator's own
    // remove action.
    useEffect(() => {
        // Viewing a past result has nothing to lose by leaving — no guard needed.
        if (attemptId) return;
        const sub = navigation.addListener('beforeRemove', (e) => {
            if (allowLeaveRef.current) return;
            e.preventDefault();
            pendingActionRef.current = e.data.action;
            confirmExit();
        });
        return sub;
    }, [navigation, attemptId]);

    useEffect(() => {
        if (Platform.OS !== 'android') return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            // The WebView itself has internal forward history (e.g. it
            // navigated within the SPA) — unwind that first rather than
            // treating this press as "leave the screen" at all.
            if (canGoBackRef.current) {
                webViewRef.current?.goBack();
                return true;
            }
            // Anything else: don't intercept — let the default Android back
            // behavior run, which dispatches a normal goBack() and hits the
            // `beforeRemove` guard above, same as the header button and the
            // iOS swipe gesture.
            return false;
        });
        return () => sub.remove();
    }, []);

    function confirmExit() {
        // Viewing a past result has nothing to lose by leaving — skip the warning.
        if (attemptId) { router.back(); return; }
        Alert.alert(
            'Leave test?',
            'Going back will auto-submit your test as it currently stands. Are you sure?',
            [
                { text: 'Stay', style: 'cancel' },
                {
                    text: 'Leave & Submit', style: 'destructive', onPress: () => {
                        // The web page's own back/unload guards (popstate,
                        // beforeunload) never fire for this — this is a
                        // native-side removal, not a WebView-internal
                        // navigation. Call the page's exposed bridge hook
                        // directly instead, then give its keepalive submit
                        // request a moment to actually leave the device
                        // before tearing the WebView (and its JS context) down.
                        webViewRef.current?.injectJavaScript(
                            `(function(){ if (window.__qubeexAppExitSubmit) { window.__qubeexAppExitSubmit(); } })(); true;`
                        );
                        setTimeout(() => {
                            allowLeaveRef.current = true;
                            if (pendingActionRef.current) navigation.dispatch(pendingActionRef.current);
                            else router.back();
                        }, 300);
                    }
                },
            ]
        );
    }

    // iOS's edge-swipe-back gesture pops the screen natively before JS ever
    // gets a chance to run the `beforeRemove` guard above — React Navigation
    // doesn't support intercepting that after the fact on native-stack (the
    // "removed natively but didn't get removed from JS state" warning).
    // Disabling the gesture for the live test means the only way off this
    // screen is the header button / Android hardware back, both of which
    // dispatch a normal action that the guard above can actually intercept.
    // Viewing a past result has nothing to lose, so the gesture stays on there.
    const gestureEnabled = !!attemptId;

    if (!token) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <Stack.Screen options={{ gestureEnabled }} />
                <View style={styles.loading}>
                    <Text style={styles.loadingText}>Loading...</Text>
                </View>
            </SafeAreaView>
        );
    }

    const injectedJS = `
        (function() {
            try { window.localStorage.setItem('token', '${token}'); } catch(e) {}
            true;
        })();
    `;

    // Belt-and-suspenders: injectedJavaScriptBeforeContentLoaded isn't
    // consistently honored across RN WebView versions/platforms, which was
    // letting the page's own auth check fire before the token landed in
    // localStorage and bounce to /login. Also pass the token as a URL param
    // — the web app's student layout picks this up synchronously on render
    // (before its own data-fetching effects) and writes it to localStorage
    // itself, independent of native JS injection working at all.
    const baseUrl = attemptId
        ? `${WEB_URL}/student/tasks/tests/${testId}/result/${attemptId}`
        : `${WEB_URL}/student/tasks/tests/${testId}`;
    const url = `${baseUrl}?wvToken=${encodeURIComponent(token)}`;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <Stack.Screen options={{ gestureEnabled }} />
            <View style={styles.header}>
                <TouchableOpacity onPress={confirmExit} style={styles.backBtn}>
                    <ArrowLeft size={22} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{attemptId ? 'Result' : 'Test'}</Text>
                <View style={{ width: 38 }} />
            </View>
            <WebView
                ref={webViewRef}
                source={{ uri: url }}
                injectedJavaScriptBeforeContentLoaded={injectedJS}
                javaScriptEnabled
                domStorageEnabled
                bounces={false}
                style={{ flex: 1 }}
                onNavigationStateChange={state => {
                    canGoBackRef.current = state.canGoBack;
                }}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F0A1E' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#1A1030',
    },
    backBtn: { padding: 6 },
    headerTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#F1F5F9' },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { color: '#94A3B8', fontFamily: 'Poppins_400Regular' },
});
