import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

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

    useEffect(() => {
        AsyncStorage.getItem('userToken').then(t => setToken(t));
    }, []);

    useEffect(() => {
        if (Platform.OS !== 'android') return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            if (canGoBackRef.current) {
                webViewRef.current?.goBack();
                return true;
            }
            confirmExit();
            return true;
        });
        return () => sub.remove();
    }, []);

    function confirmExit() {
        // Viewing a past result has nothing to lose by leaving — skip the warning.
        if (attemptId) { router.back(); return; }
        Alert.alert(
            'Leave test?',
            'Going back will not submit your test. Are you sure?',
            [
                { text: 'Stay', style: 'cancel' },
                { text: 'Leave', style: 'destructive', onPress: () => router.back() },
            ]
        );
    }

    if (!token) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
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
