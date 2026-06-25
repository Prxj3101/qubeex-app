import api from '@/lib/api';
import { InstitutionType, useInstitution } from '@/context/InstitutionContext';
import { useTheme } from '@/context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, Moon, Sun } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Theme ───────────────────────────────────────────────────────────────────
const LIGHT = {
    bg: '#FAF8FF',
    card: '#FFFFFF',
    cardBorder: '#EDE9FE',
    text: '#0F172A',
    subText: '#64748B',
    muted: '#94A3B8',
    input: '#F8F7FF',
    inputBorder: '#DDD6FE',
};

const DARK = {
    bg: '#0F0A1E',
    card: '#1A1030',
    cardBorder: '#2D1F50',
    text: '#F1F5F9',
    subText: '#94A3B8',
    muted: '#64748B',
    input: '#160D2E',
    inputBorder: '#2D1F50',
};

export default function LoginScreen() {
    const { isDark, toggleTheme } = useTheme();
    const { setInstitution } = useInstitution();
    const router = useRouter();
    const theme = isDark ? DARK : LIGHT;

    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Entry animation
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;
    const shakeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]).start();
    }, []);

    const shake = () => {
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
        ]).start();
    };

    const handleLogin = async () => {
        setError('');

        if (!loginId.trim()) { setError('Please enter your Student ID'); shake(); return; }
        if (!password) { setError('Please enter your password'); shake(); return; }

        setLoading(true);
        try {
            const res = await api.post('/auth/login', {
                email: loginId.trim(),
                password,
            });

            const { token, user, institution } = res.data.data as {
                token: string;
                user: { role: string; mustChangePassword: boolean; name?: string; institutionId?: string };
                institution: { type?: InstitutionType | null } | null;
            };

            if (user.role !== 'STUDENT') {
                setError('This app is for students only. Please use the web portal.');
                shake();
                return;
            }

            await AsyncStorage.setItem('userToken', token);
            await AsyncStorage.setItem('mustChangePassword', user.mustChangePassword ? 'true' : 'false');

            if (institution?.type) setInstitution(institution.type);

            if (user.mustChangePassword) {
                router.replace('/setup-required');
            } else {
                router.replace('/(tabs)');
            }
        } catch (err: unknown) {
            const e = err as { response?: { data?: { error?: string } }; message?: string };
            const msg = e.response?.data?.error
                ?? (e.message?.includes('Network') || e.message?.includes('connect')
                    ? 'Cannot reach server. Check your network or API URL.'
                    : 'Invalid credentials');
            setError(msg);
            shake();
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                    {/* Theme Toggle */}
                    <TouchableOpacity
                        onPress={toggleTheme}
                        style={[styles.themeBtn, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                    >
                        {isDark
                            ? <Sun size={18} color="#F59E0B" />
                            : <Moon size={18} color="#6D28D9" />
                        }
                    </TouchableOpacity>

                    <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

                        {/* Logo */}
                        <View style={styles.logoArea}>
                            <Image
                                source={require('../assets/images/QubeEx_logo_claude_transparent.png')}
                                style={styles.logoImg}
                                resizeMode="contain"
                            />
                            <Text style={[styles.brandName, { color: theme.text }]}>QubeEx</Text>
                            <Text style={[styles.brandSub, { color: theme.muted }]}>Student Assessment System</Text>
                        </View>

                        {/* Card */}
                        <Animated.View style={[
                            styles.card,
                            { backgroundColor: theme.card, borderColor: theme.cardBorder, transform: [{ translateX: shakeAnim }] }
                        ]}>
                            <Text style={[styles.cardTitle, { color: theme.text }]}>Welcome Back</Text>
                            <Text style={[styles.cardSub, { color: theme.subText }]}>Enter your Student ID and password</Text>

                            {/* Student ID Field */}
                            <View style={styles.fieldGroup}>
                                <Text style={[styles.label, { color: theme.subText }]}>Student ID</Text>
                                <View style={[styles.inputWrap, { backgroundColor: theme.input, borderColor: theme.inputBorder }]}>
                                    <TextInput
                                        style={[styles.input, { color: theme.text }]}
                                        placeholder="e.g. MHS-2026-0001"
                                        placeholderTextColor={theme.muted}
                                        value={loginId}
                                        onChangeText={(t) => { setLoginId(t); setError(''); }}
                                        autoCapitalize="characters"
                                        autoCorrect={false}
                                    />
                                </View>
                            </View>

                            {/* Password Field */}
                            <View style={styles.fieldGroup}>
                                <Text style={[styles.label, { color: theme.subText }]}>Password</Text>
                                <View style={[styles.inputWrap, { backgroundColor: theme.input, borderColor: theme.inputBorder }]}>
                                    <TextInput
                                        style={[styles.input, { color: theme.text, flex: 1 }]}
                                        placeholder="Enter your password"
                                        placeholderTextColor={theme.muted}
                                        value={password}
                                        onChangeText={(t) => { setPassword(t); setError(''); }}
                                        secureTextEntry={!showPassword}
                                    />
                                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ paddingHorizontal: 12 }}>
                                        {showPassword
                                            ? <EyeOff size={18} color={theme.muted} />
                                            : <Eye size={18} color={theme.muted} />
                                        }
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Error */}
                            {error ? <Text style={styles.errorText}>⚠ {error}</Text> : null}

                            {/* Login Button */}
                            <TouchableOpacity
                                onPress={handleLogin}
                                disabled={loading}
                                style={[styles.loginBtn, { opacity: loading ? 0.7 : 1 }]}
                                activeOpacity={0.85}
                            >
                                <Text style={styles.loginBtnText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
                            </TouchableOpacity>

                        </Animated.View>

                        {/* Footer */}
                        <Text style={[styles.footer, { color: theme.muted }]}>
                            QubeEx © 2025 · All rights reserved
                        </Text>

                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
    content: { gap: 24 },
    themeBtn: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    logoArea: { alignItems: 'center', gap: 8 },
    logoImg: {
        width: 80,
        height: 80,
    },
    brandName: {
        fontSize: 28,
        fontFamily: 'Poppins_800ExtraBold',
        letterSpacing: -0.5,
    },
    brandSub: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
    card: {
        borderRadius: 24,
        borderWidth: 1.5,
        padding: 24,
        gap: 16,
    },
    cardTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
    },
    cardSub: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginTop: -10,
    },
    fieldGroup: { gap: 6 },
    label: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        borderWidth: 1.5,
    },
    input: {
        flex: 1,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    errorText: {
        color: '#EF4444',
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
    loginBtn: {
        backgroundColor: '#7C3AED',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 4,
    },
    loginBtnText: {
        color: 'white',
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
    },
    footer: {
        textAlign: 'center',
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
});
