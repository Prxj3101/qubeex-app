import api from '@/lib/api';
import { InstitutionType, useInstitution } from '@/context/InstitutionContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { registerForPushNotifications } from '@/lib/pushNotifications';
import { AtSign, ChevronRight, Eye, EyeOff, Lock, LogIn } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─ Background grid — mirrors web's CursorWave in its resting (no-cursor)
// state: a faint static grid, since there's no mouse on mobile to lift it. ──
const GRID_COLS = 22;
const GRID_ROWS = 15;

function BackgroundGrid() {
    const lines: React.ReactElement[] = [];
    for (let r = 0; r <= GRID_ROWS; r++) {
        const y = (r / GRID_ROWS) * SCREEN_H;
        lines.push(<Line key={`h${r}`} x1={0} y1={y} x2={SCREEN_W} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} />);
    }
    for (let c = 0; c <= GRID_COLS; c++) {
        const x = (c / GRID_COLS) * SCREEN_W;
        lines.push(<Line key={`v${c}`} x1={x} y1={0} x2={x} y2={SCREEN_H} stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} />);
    }
    return <Svg width={SCREEN_W} height={SCREEN_H} style={StyleSheet.absoluteFill}>{lines}</Svg>;
}

// ── Floating ambient particles (mirrors web's 18 drifting dots) ──
interface ParticleSpec { id: number; x: number; y: number; size: number; opacity: number; duration: number; delay: number }

const PARTICLES: ParticleSpec[] = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    opacity: Math.random() * 0.15 + 0.05,
    duration: Math.random() * 8 + 6,
    delay: Math.random() * 4,
}));

function Particle({ x, y, size, opacity, duration, delay }: ParticleSpec) {
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.delay(delay * 1000),
                Animated.timing(anim, { toValue: 1, duration: duration * 500, useNativeDriver: true }),
                Animated.timing(anim, { toValue: 0, duration: duration * 500, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);

    const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -24] });
    const op = anim.interpolate({ inputRange: [0, 1], outputRange: [opacity, Math.min(1, opacity * 2.5)] });

    return (
        <Animated.View
            pointerEvents="none"
            style={{
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: '#fff',
                opacity: op,
                transform: [{ translateY }],
            }}
        />
    );
}

export default function LoginScreen() {
    const { setInstitution } = useInstitution();
    const router = useRouter();

    const [identifier, setIdentifier] = useState('');
    // Tracks the identifier exactly as typed (original casing), so backspacing
    // past the ID pattern (e.g. deleting the "-0" back off "SKPS-0") reverts
    // the display to the original as-typed casing instead of staying uppercase.
    const [rawIdentifier, setRawIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [focused, setFocused] = useState<'id' | 'pw' | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Entry + shake animation
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;
    const shakeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
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

    const isEmail = identifier.includes('@');
    const canSubmit = identifier.trim().length > 0 && password.length >= 1 && !loading;

    // Once the user has typed a 4-letter institution code, a dash, and started
    // the next segment with a digit (e.g. "SKPS-0..."), we're confident it's an
    // ID (not an email) — from that point on, force-uppercase everything so
    // students never have to hit caps lock to type IDs like SKPS-01A2-0001.
    const ID_DETECT_RE = /^[A-Za-z]{4}-\d/;
    const handleIdentifierChange = (newDisplayed: string) => {
        // Reconstruct the as-typed (raw) string: for an append, the newly
        // typed tail arrives in its natural case (our transform hasn't run
        // on it yet); for a deletion, just truncate the existing raw value
        // to match — this preserves original casing so removing the "-0"
        // reverts display back to whatever was typed before it.
        const newRaw = newDisplayed.length >= rawIdentifier.length
            ? rawIdentifier + newDisplayed.slice(rawIdentifier.length)
            : rawIdentifier.slice(0, newDisplayed.length);
        setRawIdentifier(newRaw);
        setIdentifier(ID_DETECT_RE.test(newRaw) ? newRaw.toUpperCase() : newRaw);
        setError('');
    };

    const handleLogin = async () => {
        setError('');
        if (!identifier.trim()) { setError('Please enter your Student ID or email'); shake(); return; }
        if (!password) { setError('Please enter your password'); shake(); return; }

        setLoading(true);
        try {
            const res = await api.post('/auth/login', {
                email: identifier.trim(),
                password,
            });

            const { token, user, institution } = res.data.data as {
                token: string;
                user: { role: string; mustChangePassword: boolean; name?: string; institutionId?: string };
                institution: { type?: InstitutionType | null } | null;
            };

            if (user.role !== 'STUDENT' && user.role !== 'TEACHER') {
                setError('This app is for students and teachers only. Please use the web portal.');
                shake();
                return;
            }

            await AsyncStorage.setItem('userToken', token);
            await AsyncStorage.setItem('mustChangePassword', user.mustChangePassword ? 'true' : 'false');
            await AsyncStorage.setItem('userRole', user.role);

            // Fire-and-forget — permission prompt/registration must never block login navigation.
            void registerForPushNotifications();

            if (institution?.type) setInstitution(institution.type);

            const homeRoute = user.role === 'TEACHER' ? '/(teacher)' : '/(tabs)';

            if (user.mustChangePassword) {
                router.replace('/setup-required');
            } else {
                router.replace(homeRoute);
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
        <View style={styles.root}>
            {/* ── Background ── */}
            <BackgroundGrid />
            <Svg width={SCREEN_W} height={SCREEN_H} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Defs>
                    <RadialGradient id="blobViolet" cx="30%" cy="8%" r="50%">
                        <Stop offset="0%" stopColor="#71717A" stopOpacity={0.20} />
                        <Stop offset="60%" stopColor="#71717A" stopOpacity={0} />
                    </RadialGradient>
                    <RadialGradient id="blobOrange" cx="78%" cy="98%" r="45%">
                        <Stop offset="0%" stopColor="#DA7756" stopOpacity={0.15} />
                        <Stop offset="60%" stopColor="#DA7756" stopOpacity={0} />
                    </RadialGradient>
                </Defs>
                <Circle cx={SCREEN_W * 0.25} cy={SCREEN_H * 0.06} r={SCREEN_W * 0.55} fill="url(#blobViolet)" />
                <Circle cx={SCREEN_W * 0.82} cy={SCREEN_H} r={SCREEN_W * 0.5} fill="url(#blobOrange)" />
            </Svg>
            {PARTICLES.map(p => <Particle key={p.id} {...p} />)}

            <SafeAreaView style={{ flex: 1 }}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
                        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

                            {/* ── Card ── */}
                            <Animated.View style={[styles.cardWrap, { transform: [{ translateX: shakeAnim }] }]}>
                                <LinearGradient
                                    colors={['transparent', '#7C3AED', '#6946EB', '#5652EA', '#425EE8', '#2F6AE6', '#5A6DC2', '#85719E', '#AF747A', '#DA7756', 'transparent']}
                                    locations={[0, 0.33, 0.40, 0.44, 0.48, 0.52, 0.56, 0.60, 0.63, 0.66, 1]}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={styles.topAccent}
                                />
                                <BlurView intensity={40} tint="dark" style={styles.cardBlur}>
                                    <View style={styles.cardInner}>

                                        {/* Logo */}
                                        <View style={styles.logoArea}>
                                            <Image
                                                source={require('../assets/images/QubeEx_darkmode_DA7756.png')}
                                                style={styles.logoImg}
                                                resizeMode="contain"
                                            />
                                            <Text style={styles.brandName}>QubeEx</Text>
                                            <Text style={styles.brandSub}>Sign in to your account</Text>
                                        </View>

                                        {/* Identifier field */}
                                        <View style={styles.fieldGroup}>
                                            <Text style={styles.label}>Email or ID</Text>
                                            <View style={[styles.inputWrap, focused === 'id' && styles.inputWrapFocused]}>
                                                <AtSign size={15} color={focused === 'id' ? '#71717A' : 'rgba(255,255,255,0.25)'} style={styles.leftIcon} />
                                                <TextInput
                                                    style={styles.input}
                                                    placeholder="you@example.com or INST-0001"
                                                    placeholderTextColor="rgba(255,255,255,0.2)"
                                                    value={identifier}
                                                    onChangeText={handleIdentifierChange}
                                                    onFocus={() => setFocused('id')}
                                                    onBlur={() => setFocused(null)}
                                                    autoCapitalize="none"
                                                    autoCorrect={false}
                                                />
                                                {identifier.length > 0 && (
                                                    <View style={[styles.badge, { backgroundColor: isEmail ? 'rgba(113,113,122,0.15)' : 'rgba(218,119,86,0.15)' }]}>
                                                        <Text style={[styles.badgeText, { color: isEmail ? '#A1A1AA' : '#DA7756' }]}>
                                                            {isEmail ? 'EMAIL' : 'ID'}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>

                                        {/* Password field */}
                                        <View style={styles.fieldGroup}>
                                            <Text style={styles.label}>Password</Text>
                                            <View style={[styles.inputWrap, focused === 'pw' && styles.inputWrapFocused]}>
                                                <Lock size={15} color={focused === 'pw' ? '#71717A' : 'rgba(255,255,255,0.25)'} style={styles.leftIcon} />
                                                <TextInput
                                                    style={[styles.input, { flex: 1 }]}
                                                    placeholder="••••••••••"
                                                    placeholderTextColor="rgba(255,255,255,0.2)"
                                                    value={password}
                                                    onChangeText={(t) => { setPassword(t); setError(''); }}
                                                    onFocus={() => setFocused('pw')}
                                                    onBlur={() => setFocused(null)}
                                                    secureTextEntry={!showPassword}
                                                />
                                                <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={{ paddingHorizontal: 12 }}>
                                                    {showPassword
                                                        ? <EyeOff size={15} color="rgba(255,255,255,0.4)" />
                                                        : <Eye size={15} color="rgba(255,255,255,0.4)" />}
                                                </TouchableOpacity>
                                            </View>
                                        </View>

                                        {error ? <Text style={styles.errorText}>⚠ {error}</Text> : null}

                                        {/* Submit */}
                                        <TouchableOpacity onPress={handleLogin} disabled={!canSubmit} activeOpacity={0.85} style={styles.submitWrap}>
                                            <LinearGradient
                                                colors={canSubmit ? ['#E8876A', '#DA7756', '#C06040'] : ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.06)']}
                                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                                style={styles.submitBtn}
                                            >
                                                {loading ? (
                                                    <>
                                                        <ActivityIndicator size="small" color="#fff" />
                                                        <Text style={styles.submitText}>Signing in…</Text>
                                                    </>
                                                ) : (
                                                    <>
                                                        <LogIn size={16} color="#fff" />
                                                        <Text style={styles.submitText}>Sign In</Text>
                                                        <ChevronRight size={14} color="rgba(255,255,255,0.6)" />
                                                    </>
                                                )}
                                            </LinearGradient>
                                        </TouchableOpacity>

                                    </View>
                                </BlurView>
                            </Animated.View>

                            {/* Footer */}
                            <Text style={styles.footer}>Forgot your credentials? Contact your administrator.</Text>

                        </Animated.View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#0B0B0F' },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },

    cardWrap: {
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.09)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.4,
        shadowRadius: 24,
        elevation: 10,
    },
    topAccent: { height: 2, width: '100%' },
    cardBlur: { backgroundColor: 'rgba(255,255,255,0.04)' },
    cardInner: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 28, gap: 16 },

    logoArea: { alignItems: 'center', gap: 4, marginBottom: 12 },
    logoImg: { width: 56, height: 56, marginBottom: 6 },
    brandName: { fontSize: 26, fontFamily: 'Poppins_800ExtraBold', color: '#FAE5D9', letterSpacing: -0.5 },
    brandSub: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.4)' },

    fieldGroup: { gap: 6 },
    label: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: 'rgba(255,255,255,0.5)', letterSpacing: 0.6, textTransform: 'uppercase' },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 48,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        paddingHorizontal: 12,
        gap: 10,
    },
    inputWrapFocused: {
        borderColor: 'rgba(113,113,122,0.7)',
        backgroundColor: 'rgba(113,113,122,0.08)',
    },
    leftIcon: { marginLeft: 2 },
    input: { flex: 1, fontSize: 14, fontFamily: 'Poppins_400Regular', color: '#fff', paddingVertical: 0 },
    badge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
    badgeText: { fontSize: 9, fontFamily: 'Poppins_800ExtraBold' },
    helperText: { fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.25)', marginTop: 2, paddingHorizontal: 2 },

    errorText: { color: '#EF4444', fontSize: 11, fontFamily: 'Poppins_400Regular' },

    submitWrap: { marginTop: 4, borderRadius: 12, overflow: 'hidden' },
    submitBtn: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    submitText: { color: '#fff', fontSize: 14, fontFamily: 'Poppins_600SemiBold' },

    footer: { textAlign: 'center', fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.2)', marginTop: 20 },
});
