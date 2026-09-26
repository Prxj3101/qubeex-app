import { useTheme } from '@/context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { LogOut, ShieldCheck } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, WebViewNavigation } from 'react-native-webview';

// Same origin used everywhere else the app opens web pages in a WebView
// (see app/test-webview.tsx) — www directly, so the apex-domain redirect
// never drops the wvToken query param.
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://www.qubeex.in';

// This is the exact same "set your initial password" screen the web portal
// shows a student — previously this screen sent the student out to their
// phone's browser to reach it (Linking.openURL). Opening it here in an
// in-app WebView instead means they never leave the app at all. The web
// page already has a wvToken bridge built for this (see
// qubeex-web/app/student/layout.tsx's bridgeWebViewToken — it even has a
// dedicated isSetPasswordPage nav-lock case), so this reuses the same
// pattern test-webview.tsx uses for tests/results.
export default function SetupRequired() {
    const { isDark } = useTheme();
    const router = useRouter();
    const [token, setToken] = useState<string | null>(null);
    const [webviewDone, setWebviewDone] = useState(false);
    const handledSuccessRef = useRef(false);

    const bg = isDark ? '#000000' : '#FAF8FF';
    const text = isDark ? '#F1F5F9' : '#0F172A';
    const sub = isDark ? '#94A3B8' : '#64748B';
    const headerBg = isDark ? '#141414' : '#FFFFFF';
    const headerBorder = isDark ? '#2A2A2A' : '#EDE9FE';

    useEffect(() => {
        AsyncStorage.getItem('userToken').then(setToken);
    }, []);

    const handleLogout = async () => {
        try {
            await AsyncStorage.multiRemove(['userToken', 'mustChangePassword']);
        } finally {
            router.replace('/login');
        }
    };

    // The web page sets its new password then, on its own, redirects to
    // /student/overview a couple seconds later — that redirect is the
    // signal the flow finished. Catch it here, clear the app's own
    // mustChangePassword flag, and hand off to the app's real home screen
    // instead of leaving the student staring at the web page's dashboard
    // rendered inside a WebView.
    const handleNavStateChange = (nav: WebViewNavigation) => {
        if (handledSuccessRef.current) return;
        if (nav.url.includes('/student/overview')) {
            handledSuccessRef.current = true;
            setWebviewDone(true);
            AsyncStorage.setItem('mustChangePassword', 'false').finally(() => {
                router.replace('/(tabs)');
            });
        }
    };

    if (!token) {
        return (
            <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
                <View style={styles.loading}>
                    <ActivityIndicator color={isDark ? '#DA7756' : '#7C3AED'} />
                </View>
            </SafeAreaView>
        );
    }

    const url = `${WEB_URL}/student/set-password?wvToken=${encodeURIComponent(token)}`;

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: headerBg, borderBottomColor: headerBorder }]}>
                <View style={styles.headerTitleWrap}>
                    <ShieldCheck size={16} color="#7C3AED" />
                    <Text style={[styles.headerTitle, { color: text }]}>Set Your Password</Text>
                </View>
                <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} activeOpacity={0.7}>
                    <LogOut size={14} color={sub} />
                    <Text style={[styles.logoutText, { color: sub }]}>Log out</Text>
                </TouchableOpacity>
            </View>
            {/* Stays mounted (just hidden) once done, rather than unmounting —
                avoids a flash of the WebView reappearing if router.replace
                above hasn't finished swapping screens yet. */}
            <View style={{ flex: 1, opacity: webviewDone ? 0 : 1 }} pointerEvents={webviewDone ? 'none' : 'auto'}>
                <WebView
                    source={{ uri: url }}
                    javaScriptEnabled
                    domStorageEnabled
                    bounces={false}
                    mixedContentMode="compatibility"
                    style={{ flex: 1 }}
                    onNavigationStateChange={handleNavStateChange}
                    startInLoadingState
                    renderLoading={() => (
                        <View style={[StyleSheet.absoluteFill, styles.loading, { backgroundColor: bg }]}>
                            <ActivityIndicator color={isDark ? '#DA7756' : '#7C3AED'} />
                        </View>
                    )}
                />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    headerTitle: { fontSize: 15, fontFamily: 'Poppins_700Bold' },
    logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 6 },
    logoutText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
});
