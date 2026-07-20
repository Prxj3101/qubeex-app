import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';
import LottieView from 'lottie-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import confettiAnimation from '../assets/lottie/confetti.json';

export function isTodayBirthday(dob: string): boolean {
    if (!dob) return false;
    try {
        const today = new Date();
        const d = new Date(dob);
        if (isNaN(d.getTime())) return false;
        return today.getMonth() === d.getMonth() && today.getDate() === d.getDate();
    } catch {
        return false;
    }
}

const GREETING = (name: string) => `Happy Birthday 🥳, ${name}!`;
const SUBTITLE = 'Today is all about you — make it count!';
const LINES: [string, string] = [
    'Take a break from the books and enjoy every moment of your special day!',
    'Another year older, another year wiser, another year closer to your dreams.',
];
const CONFETTI_COLORS = ['#FFF', '#FECDD3', '#FDA4AF', '#FFF1F2', '#FB7185'];

const CAKE_IMAGE = require('../assets/images/birthday_cake.png');

// ── Candle flame flicker (mirrors web's glow + flame flicker on each candle) ──
function FlameFlicker({ delay = 0 }: { delay?: number }) {
    const flicker = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.delay(delay * 1000),
                Animated.timing(flicker, { toValue: 1, duration: 260, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(flicker, { toValue: 0.3, duration: 260, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(flicker, { toValue: 1, duration: 260, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(flicker, { toValue: 0, duration: 260, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);

    const scaleX = flicker.interpolate({ inputRange: [0, 1], outputRange: [1, 0.72] });
    const scaleY = flicker.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] });
    const rotate = flicker.interpolate({ inputRange: [0, 1], outputRange: ['-5deg', '6deg'] });
    const glowOpacity = flicker.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });

    return (
        <View style={styles.flameWrap}>
            <Animated.View style={[styles.flameGlow, { opacity: glowOpacity, transform: [{ scaleX }, { scaleY }] }]} />
            <Animated.View style={[styles.flameCore, { transform: [{ scaleX }, { scaleY }, { rotate }] }]}>
                <LinearGradient
                    colors={['#fffde7', '#FFD600', '#FF8F00', '#E53935']}
                    locations={[0, 0.28, 0.65, 1]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>
        </View>
    );
}

// ── Confetti piece ─────────────────────────────────────────────────────────
function ConfettiPiece({ left, delay, dur, size, color, shape }: { left: number; delay: number; dur: number; size: number; color: string; shape: 'circle' | 'square' | 'rect' }) {
    const progress = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.delay(delay * 1000),
                Animated.timing(progress, { toValue: 1, duration: dur * 1000, easing: Easing.in(Easing.quad), useNativeDriver: true }),
                Animated.delay(1500),
                Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);

    const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 130] });
    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [left % 2 === 0 ? 8 : -8, left % 2 === 0 ? -8 : 8] });
    const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${left % 2 === 0 ? 1 : -1 * (120 + left)}deg`] });
    const opacity = progress.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 0.9, 0.9, 0] });

    return (
        <Animated.View
            style={{
                position: 'absolute',
                left: `${left}%`,
                top: -8,
                width: shape === 'rect' ? size * 2 : size,
                height: size,
                borderRadius: shape === 'circle' ? size / 2 : 1,
                backgroundColor: color,
                opacity,
                transform: [{ translateY }, { translateX }, { rotate }],
            }}
        />
    );
}

const CONFETTI_PIECES = Array.from({ length: 10 }, (_, i) => ({
    left: (i * 9.4 + 3) % 94,
    delay: (i * 0.25) % 2.2,
    dur: 2.8 + ((i * 0.21) % 1.8),
    size: 3 + (i % 3),
    shape: (i % 3 === 0 ? 'circle' : i % 3 === 1 ? 'square' : 'rect') as 'circle' | 'square' | 'rect',
}));

// ── Main ────────────────────────────────────────────────────────────────────
interface BirthdayBannerProps {
    name: string;
    dob: string;
}

export function BirthdayBanner({ name, dob }: BirthdayBannerProps) {
    const [visible, setVisible] = useState(true);
    const emojiScale = useRef(new Animated.Value(0)).current;
    const emojiRotate = useRef(new Animated.Value(-30)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.sequence([
                Animated.timing(emojiScale, { toValue: 1.5, duration: 250, useNativeDriver: true }),
                Animated.timing(emojiScale, { toValue: 0.85, duration: 180, useNativeDriver: true }),
                Animated.timing(emojiScale, { toValue: 1.25, duration: 180, useNativeDriver: true }),
                Animated.timing(emojiScale, { toValue: 1, duration: 180, useNativeDriver: true }),
            ]),
            Animated.sequence([
                Animated.timing(emojiRotate, { toValue: 15, duration: 250, useNativeDriver: true }),
                Animated.timing(emojiRotate, { toValue: -10, duration: 180, useNativeDriver: true }),
                Animated.timing(emojiRotate, { toValue: 6, duration: 180, useNativeDriver: true }),
                Animated.timing(emojiRotate, { toValue: 0, duration: 180, useNativeDriver: true }),
            ]),
        ]).start();
    }, []);

    if (!isTodayBirthday(dob) || !visible) return null;

    const rotateStr = emojiRotate.interpolate({ inputRange: [-30, 30], outputRange: ['-30deg', '30deg'] });

    return (
        <View style={styles.wrap}>
            <LinearGradient
                colors={['rgba(251,113,133,0.72)', 'rgba(244,63,94,0.82)', 'rgba(225,29,72,0.88)', 'rgba(190,18,60,0.92)']}
                locations={[0, 0.4, 0.75, 1]}
                start={{ x: 0, y: 0.15 }}
                end={{ x: 1, y: 0.85 }}
                style={styles.gradient}
            >
                {/* Confetti */}
                <View style={[StyleSheet.absoluteFill, { zIndex: 1 }]} pointerEvents="none">
                    {CONFETTI_PIECES.map((p, i) => (
                        <ConfettiPiece key={i} {...p} color={CONFETTI_COLORS[i % CONFETTI_COLORS.length]} />
                    ))}
                </View>

                {/* Glow blobs — soft radial glow (matches web's blurred blobs, not hard-edged circles) */}
                <Svg width={160} height={160} style={styles.blobTopLeft} pointerEvents="none">
                    <Defs>
                        <RadialGradient id="glowTL" cx="50%" cy="50%" r="50%">
                            <Stop offset="0%" stopColor="#fff" stopOpacity={0.16} />
                            <Stop offset="60%" stopColor="#fff" stopOpacity={0.06} />
                            <Stop offset="100%" stopColor="#fff" stopOpacity={0} />
                        </RadialGradient>
                    </Defs>
                    <Circle cx={80} cy={80} r={80} fill="url(#glowTL)" />
                </Svg>
                <Svg width={128} height={128} style={styles.blobBottomRight} pointerEvents="none">
                    <Defs>
                        <RadialGradient id="glowBR" cx="50%" cy="50%" r="50%">
                            <Stop offset="0%" stopColor="#000" stopOpacity={0.16} />
                            <Stop offset="60%" stopColor="#000" stopOpacity={0.06} />
                            <Stop offset="100%" stopColor="#000" stopOpacity={0} />
                        </RadialGradient>
                    </Defs>
                    <Circle cx={64} cy={64} r={64} fill="url(#glowBR)" />
                </Svg>

                {/* Cracker confetti — top-left and mirrored top-right, same Lottie as web */}
                <View style={styles.lottieLeft} pointerEvents="none">
                    <LottieView source={confettiAnimation} autoPlay loop style={styles.lottieAnim} />
                </View>
                <View style={styles.lottieRight} pointerEvents="none">
                    <LottieView source={confettiAnimation} autoPlay loop style={[styles.lottieAnim, { transform: [{ scaleX: -1 }] }]} />
                </View>

                {/* Dismiss */}
                <Pressable onPress={() => setVisible(false)} style={styles.dismiss} hitSlop={8}>
                    <X size={13} color="#fff" />
                </Pressable>

                {/* Content */}
                <View style={styles.content}>
                    <View style={styles.emojiBox}>
                        <Animated.View style={[styles.cakeWrap, { transform: [{ scale: emojiScale }, { rotate: rotateStr }] }]}>
                            <Image source={CAKE_IMAGE} style={styles.emoji} resizeMode="contain" />
                            <View style={[styles.candleSlot, { left: 15, top: 3 }]}><FlameFlicker delay={0} /></View>
                            <View style={[styles.candleSlot, { left: 27, top: 2 }]}><FlameFlicker delay={0.13} /></View>
                            <View style={[styles.candleSlot, { left: 39, top: 3 }]}><FlameFlicker delay={0.07} /></View>
                        </Animated.View>
                    </View>

                    <View style={styles.textCol}>
                        <Text style={styles.greeting}>{GREETING(name)}</Text>
                        <Text style={styles.subtitle}>{SUBTITLE}</Text>
                        <View style={{ gap: 3 }}>
                            {LINES.map((line, i) => (
                                <View key={i} style={styles.lineRow}>
                                    <Text style={styles.lineDot}>✦</Text>
                                    <Text style={styles.line}>{line}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                </View>

                <Text style={styles.signature}>~ Team QubeEx</Text>
            </LinearGradient>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { borderRadius: 16, overflow: 'hidden' },
    gradient: { paddingTop: 14, paddingBottom: 7, paddingHorizontal: 14, position: 'relative', overflow: 'hidden' },
    blobTopLeft: { position: 'absolute', top: -40, left: -40 },
    blobBottomRight: { position: 'absolute', bottom: -32, right: 32 },
    lottieLeft: { position: 'absolute', top: Platform.select({ android: 60, default: 55 }), left: -14, width: 100, height: 100, zIndex: 2 },
    lottieRight: { position: 'absolute', top: Platform.select({ android: 60, default: 55 }), right: -14, width: 100, height: 100, zIndex: 2 },
    lottieAnim: { width: 100, height: 100 },
    dismiss: {
        position: 'absolute', top: 8, right: 8, zIndex: 20,
        width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.18)',
    },
    content: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 24, zIndex: 10 },
    emojiBox: { width: 64, alignItems: 'center', justifyContent: 'center' },
    cakeWrap: { width: 60, height: 60, position: 'relative' },
    emoji: { width: 60, height: 60 },
    candleSlot: { position: 'absolute' },
    flameWrap: { width: 7, height: 9 },
    flameGlow: {
        position: 'absolute', width: 7, height: 9, borderRadius: 4,
        backgroundColor: 'rgba(255,200,50,0.6)',
    },
    flameCore: {
        position: 'absolute', width: 7, height: 9, borderRadius: 4, overflow: 'hidden',
    },
    textCol: { flex: 1, minWidth: 0 },
    greeting: { fontSize: 15.5, fontWeight: '800', color: '#fff', lineHeight: 19 },
    subtitle: { fontSize: 11, marginTop: 3, marginBottom: 6, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
    lineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
    lineDot: { fontSize: 8, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
    line: { flex: 1, fontSize: 10.5, color: 'rgba(255,255,255,0.75)', lineHeight: 14 },
    signature: {
        marginTop: 13, marginRight: 40, textAlign: 'right', fontSize: 11.5, fontWeight: '700',
        color: 'rgba(255,255,255,0.65)', zIndex: 10,
    },
});
