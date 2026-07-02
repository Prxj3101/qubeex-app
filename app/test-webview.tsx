import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://qubeex.in';

export default function TestWebViewScreen() {
    const { testId } = useLocalSearchParams<{ testId: string }>();
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

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={confirmExit} style={styles.backBtn}>
                    <ArrowLeft size={22} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Test</Text>
                <View style={{ width: 38 }} />
            </View>
            <WebView
                ref={webViewRef}
                source={{ uri: `${WEB_URL}/student/tasks/tests/${testId}` }}
                injectedJavaScriptBeforeContentLoaded={injectedJS}
                javaScriptEnabled
                domStorageEnabled
                style={{ flex: 1 }}
                onNavigationStateChange={state => { canGoBackRef.current = state.canGoBack; }}
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
