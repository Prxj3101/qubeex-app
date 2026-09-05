import { useTheme } from '@/context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { AlertTriangle, Globe } from 'lucide-react-native';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://app.qubeex.in';

export default function SetupRequired() {
    const { isDark } = useTheme();
    const router = useRouter();
    const bg = isDark ? '#000000' : '#FAF8FF';
    const text = isDark ? '#F1F5F9' : '#0F172A';
    const sub = isDark ? '#94A3B8' : '#64748B';
    const card = isDark ? '#0A0A0A' : '#FFFFFF';
    const border = isDark ? '#2D1F50' : '#EDE9FE';

    const handleLogout = async () => {
        try {
            await AsyncStorage.multiRemove(['userToken', 'mustChangePassword']);
        } finally {
            router.replace('/login');
        }
    };

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
            <View style={styles.container}>
                <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
                    <View style={[styles.iconBox, { backgroundColor: isDark ? '#2D1F1040' : '#FEF3C7' }]}>
                        <AlertTriangle size={32} color="#F59E0B" />
                    </View>
                    <Text style={[styles.title, { color: text }]}>Setup Required</Text>
                    <Text style={[styles.body, { color: sub }]}>
                        Before you can use the QubeEx app, you need to set your permanent password on the web portal.
                    </Text>
                    <Text style={[styles.body, { color: sub, marginTop: 8 }]}>
                        Open the QubeEx web portal, log in with your Student ID and temporary password, then set your new password.
                    </Text>
                    <TouchableOpacity
                        onPress={() => Linking.openURL(WEB_URL).catch(() => {})}
                        style={styles.primaryBtn}
                        activeOpacity={0.85}
                    >
                        <Globe size={16} color="white" />
                        <Text style={styles.primaryBtnText}>Open Web Portal</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleLogout} style={styles.secondaryBtn} activeOpacity={0.7}>
                        <Text style={[styles.secondaryBtnText, { color: sub }]}>Log out</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    container: { flex: 1, justifyContent: 'center', padding: 24 },
    card: {
        borderRadius: 24, borderWidth: 1.5, padding: 28,
        alignItems: 'center', gap: 12,
    },
    iconBox: {
        width: 72, height: 72, borderRadius: 22,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 4,
    },
    title: { fontSize: 22, fontFamily: 'Poppins_700Bold', textAlign: 'center' },
    body: { fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center', lineHeight: 20 },
    primaryBtn: {
        marginTop: 8, backgroundColor: '#7C3AED', borderRadius: 14,
        paddingVertical: 13, paddingHorizontal: 24,
        flexDirection: 'row', alignItems: 'center', gap: 8,
    },
    primaryBtnText: { color: 'white', fontSize: 14, fontFamily: 'Poppins_700Bold' },
    secondaryBtn: { paddingVertical: 8 },
    secondaryBtnText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
});
