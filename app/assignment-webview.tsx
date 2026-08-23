import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

// Same apex-domain redirect issue as test-webview.tsx — point straight at
// www so the wvToken query param never gets dropped mid-redirect.
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://www.qubeex.in';

// Reuses the web app's assignment paper page inside a WebView — same
// approach as test-webview.tsx for viewing a test/result, so the paper
// (built in the teacher's paper builder) renders identically without
// duplicating that layout natively. Back button/back-button hardware just
// leaves (viewing the paper has nothing to lose, unlike leaving a live test).
export default function AssignmentWebViewScreen() {
    const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
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
            router.back();
            return true;
        });
        return () => sub.remove();
    }, []);

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

    const url = `${WEB_URL}/student/tasks/assignments/${assignmentId}?wvToken=${encodeURIComponent(token)}`;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft size={22} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Submission</Text>
                <View style={{ width: 38 }} />
            </View>
            <WebView
                ref={webViewRef}
                source={{ uri: url }}
                injectedJavaScriptBeforeContentLoaded={injectedJS}
                javaScriptEnabled
                domStorageEnabled
                bounces={false}
                // Android's WebView blocks ALL mixed content (even passive
                // content like <img> tags) by default, unlike desktop
                // browsers which allow it — this is why question images
                // rendered fine on web but silently failed to load here.
                mixedContentMode="compatibility"
                // Android compositing quirk: while scrolling, the fixed
                // header layer and the scrolling page layer can repaint one
                // frame apart, briefly exposing the WebView's own default
                // white background as a thin line between them. Giving the
                // WebView the same dark background as the screen means that
                // momentary seam is invisible instead of a white flash.
                style={{ flex: 1, backgroundColor: '#0F0A1E' }}
                onNavigationStateChange={state => {
                    canGoBackRef.current = state.canGoBack;
                }}
                // The paper is a fixed A4-width document, much wider than the
                // phone screen. iOS already fits correctly purely from the
                // page's own dynamically-set viewport meta. `scalesPageToFit`
                // is Android-only (no effect on iOS) — Android's WebView
                // doesn't reliably rescale from a viewport meta tag changed
                // via JS after load, so it needs this native "fit page
                // content to the screen on load" flag turned on instead
                // (maps to loadWithOverviewMode + useWideViewPort).
                scalesPageToFit
                setBuiltInZoomControls={false}
                setDisplayZoomControls={false}
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
