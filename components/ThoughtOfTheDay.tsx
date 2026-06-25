import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, Pattern, Rect } from 'react-native-svg';

const THOUGHTS = [
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
    { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
    { text: "Education is the most powerful weapon you can use to change the world.", author: "Nelson Mandela" },
    { text: "The beautiful thing about learning is that no one can take it away from you.", author: "B.B. King" },
    { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
    { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
    { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
    { text: "The expert in anything was once a beginner.", author: "Helen Hayes" },
    { text: "Push yourself, because no one else is going to do it for you.", author: "Unknown" },
    { text: "Great things never come from comfort zones.", author: "Unknown" },
    { text: "Dream it. Wish it. Do it.", author: "Unknown" },
    { text: "Success doesn't just find you. You have to go out and get it.", author: "Unknown" },
    { text: "The harder you work for something, the greater you'll feel when you achieve it.", author: "Unknown" },
    { text: "Don't stop when you're tired. Stop when you're done.", author: "Unknown" },
    { text: "Wake up with determination. Go to bed with satisfaction.", author: "Unknown" },
    { text: "Do something today that your future self will thank you for.", author: "Sean Patrick Flanery" },
    { text: "Little things make big days.", author: "Unknown" },
    { text: "It's going to be hard, but hard does not mean impossible.", author: "Unknown" },
    { text: "Don't wait for opportunity. Create it.", author: "Unknown" },
    { text: "Sometimes we're tested not to show our weaknesses, but to discover our strengths.", author: "Unknown" },
    { text: "The key to success is to focus on goals, not obstacles.", author: "Unknown" },
    { text: "Dream bigger. Do bigger.", author: "Unknown" },
    { text: "You are never too old to set another goal or dream a new dream.", author: "C.S. Lewis" },
    { text: "If you can dream it, you can do it.", author: "Walt Disney" },
    { text: "Act as if what you do makes a difference. It does.", author: "William James" },
    { text: "What you get by achieving your goals is not as important as what you become.", author: "Henry David Thoreau" },
    { text: "Happiness is not something ready-made. It comes from your own actions.", author: "Dalai Lama" },
    { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
    { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
    { text: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
];

function getTodaysThought() {
    const today = new Date();
    const dayOfYear = Math.floor(
        (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
    );
    return THOUGHTS[dayOfYear % THOUGHTS.length];
}

// Wood grain texture using SVG
function WoodTexture({ width, height, color }: { width: number; height: number; color: string }) {
    return (
        <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
            <Defs>
                <Pattern id="wood" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                    <Rect width="40" height="40" fill={color} />
                    <Line x1="0" y1="5" x2="40" y2="8" stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
                    <Line x1="0" y1="12" x2="40" y2="14" stroke="rgba(0,0,0,0.05)" strokeWidth="0.5" />
                    <Line x1="0" y1="20" x2="40" y2="22" stroke="rgba(0,0,0,0.07)" strokeWidth="1" />
                    <Line x1="0" y1="28" x2="40" y2="30" stroke="rgba(0,0,0,0.04)" strokeWidth="0.5" />
                    <Line x1="0" y1="35" x2="40" y2="37" stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
                    <Circle cx="8" cy="10" r="2" fill="rgba(0,0,0,0.04)" />
                    <Circle cx="30" cy="25" r="1.5" fill="rgba(0,0,0,0.03)" />
                </Pattern>
            </Defs>
            <Rect width={width} height={height} fill="url(#wood)" />
        </Svg>
    );
}

// Board surface texture
function BoardTexture({ width, height }: { width: number; height: number }) {
    return (
        <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
            {/* Old chalk smudges */}
            <Rect x="20" y="30" width="60" height="4" rx="2" fill="rgba(255,255,255,0.04)" transform="rotate(-2, 20, 30)" />
            <Rect x="100" y="60" width="40" height="3" rx="2" fill="rgba(255,255,255,0.03)" transform="rotate(1, 100, 60)" />
            <Rect x="50" y="90" width="80" height="4" rx="2" fill="rgba(255,255,255,0.03)" transform="rotate(-1, 50, 90)" />
            <Rect x={width - 80} y="40" width="50" height="3" rx="2" fill="rgba(255,255,255,0.04)" transform={`rotate(3, ${width - 80}, 40)`} />
            <Rect x="30" y={height - 40} width="70" height="4" rx="2" fill="rgba(255,255,255,0.03)" transform={`rotate(-1, 30, ${height - 40})`} />
            {/* Worn corners */}
            <Rect x="0" y="0" width="30" height="30" fill="rgba(0,0,0,0.08)" />
            <Rect x={width - 30} y="0" width="30" height="30" fill="rgba(0,0,0,0.08)" />
            <Rect x="0" y={height - 30} width="30" height="30" fill="rgba(0,0,0,0.06)" />
            <Rect x={width - 30} y={height - 30} width="30" height="30" fill="rgba(0,0,0,0.06)" />
            {/* Chalk dust particles */}
            {[...Array(12)].map((_, i) => (
                <Circle
                    key={i}
                    cx={20 + (i * 23) % (width - 40)}
                    cy={15 + (i * 17) % (height - 30)}
                    r={1 + (i % 2)}
                    fill="rgba(255,255,255,0.06)"
                />
            ))}
        </Svg>
    );
}

export function ThoughtOfTheDay() {
    const thought = getTodaysThought();

    const flickerAnim = useRef(new Animated.Value(1)).current;
    const slideAnim = useRef(new Animated.Value(16)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(slideAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]).start();

        Animated.loop(
            Animated.sequence([
                Animated.delay(2500),
                Animated.timing(flickerAnim, { toValue: 0.82, duration: 80, useNativeDriver: true }),
                Animated.timing(flickerAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
                Animated.delay(200),
                Animated.timing(flickerAnim, { toValue: 0.88, duration: 60, useNativeDriver: true }),
                Animated.timing(flickerAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
                Animated.delay(4000),
            ])
        ).start();
    }, []);

    const FRAME_H = 16;
    const FRAME_W = 14;

    return (
        <View style={styles.outerShadow}>
            {/* ── Outer wooden frame ── */}
            <View style={styles.outerFrame}>
                <WoodTexture width={400} height={220} color="#7A4F2A" />

                {/* Frame screws */}
                {[
                    { top: 1.5, left: 1 }, { top: 1, right: 1 },
                    { bottom: 1, left: 1 }, { bottom: 1, right: 1 },
                ].map((pos, i) => (
                    <View key={i} style={[styles.screw, pos as any]} />
                ))}

                {/* Inner frame highlight */}
                <View style={styles.innerFrameHighlight} />

                {/* ── Blackboard surface ── */}
                <View style={styles.board}>
                    <BoardTexture width={400} height={190} />

                    {/* Inner border chalk line */}
                    <View style={styles.chalkBorder} />

                    {/* Header */}
                    <View style={styles.headerArea}>
                        <View style={styles.headerDivLeft} />
                        <Animated.Text style={[styles.headerText, { opacity: flickerAnim }]}>
                            ✦ Thought of the Day ✦
                        </Animated.Text>
                        <View style={styles.headerDivRight} />
                    </View>

                    {/* Date */}
                    <View style={{ position: 'absolute', top: 7, left: 14 }}>
                        <Text style={{
                            fontSize: 13,
                            color: 'rgba(255,255,255,0.5)',
                            fontFamily: 'Caveat_400Regular',
                            letterSpacing: 0.5,
                        }}>
                            {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </Text>
                    </View>

                    {/* Thought */}
                    <Animated.View style={[styles.thoughtArea, {
                        opacity: fadeAnim,
                        transform: [{ translateY: slideAnim }],
                    }]}>
                        <Animated.Text style={[styles.quoteOpen, { opacity: flickerAnim }]}>"</Animated.Text>
                        <Animated.Text style={[styles.thoughtText, { opacity: flickerAnim }]}>
                            {thought.text}
                        </Animated.Text>
                        <View style={styles.authorRow}>
                            <Animated.Text style={[styles.authorText, { opacity: flickerAnim }]}>
                                — {thought.author}
                            </Animated.Text>
                        </View>
                    </Animated.View>

                    {/* ── Chalk tray ── */}
                    <View style={styles.tray}>
                        <WoodTexture width={400} height={32} color="#5C3A1E" />
                        <View style={styles.trayInner}>
                            {/* Chalks */}
                            {[
                                { bg: '#F5F5F0', shadow: '#D0D0C8' },
                                { bg: '#FFB3B3', shadow: '#E08080' },
                                { bg: '#B3D9FF', shadow: '#80B0E0' },
                                { bg: '#C8FFB3', shadow: '#90D870' },
                                { bg: '#FFE4B3', shadow: '#E0BC70' },
                            ].map((chalk, i) => (
                                <View key={i} style={styles.chalkWrap}>
                                    <View style={[styles.chalkPiece, {
                                        backgroundColor: chalk.bg,
                                        shadowColor: chalk.shadow,
                                    }]}>
                                        {/* Chalk texture lines */}
                                        <View style={[styles.chalkLine, { top: 3 }]} />
                                        <View style={[styles.chalkLine, { top: 6 }]} />
                                    </View>
                                </View>
                            ))}
                            {/* Eraser */}
                            <View style={styles.eraser}>
                                <View style={styles.eraserFelt} />
                                <View style={styles.eraserDust} />
                            </View>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
}

const BOARD_COLOR = '#2A5225';
const CHALK_WHITE = 'rgba(255,255,255,0.90)';
const CHALK_DIM = 'rgba(255,255,255,0.55)';

const styles = StyleSheet.create({
    outerShadow: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 10,
        borderRadius: 10,
    },
    outerFrame: {
        borderRadius: 10,
        overflow: 'hidden',
        padding: 10,
        backgroundColor: '#7A4F2A',
        borderWidth: 2,
        borderColor: '#4A2E10',
        position: 'relative',
    },
    innerFrameHighlight: {
        position: 'absolute',
        top: 10, left: 10, right: 10, bottom: 10,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.12)',
        zIndex: 1,
        pointerEvents: 'none',
    },
    screw: {
        position: 'absolute',
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#C8A060',
        borderWidth: 1,
        borderColor: '#8B6030',
        zIndex: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.4,
        shadowRadius: 1,
        elevation: 2,
    },
    board: {
        backgroundColor: BOARD_COLOR,
        borderRadius: 4,
        overflow: 'hidden',
        position: 'relative',
        minHeight: 170,
        paddingBottom: 32,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.3)',
    },
    chalkBorder: {
        position: 'absolute',
        top: 6, left: 6, right: 6, bottom: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 2,
        zIndex: 0,
    },
    headerArea: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 14,
        paddingHorizontal: 14,
        gap: 8,
    },
    headerDivLeft: {
        flex: 1,
        height: 1,
        backgroundColor: CHALK_DIM,
        opacity: 0.5,
    },
    headerDivRight: {
        flex: 1,
        height: 1,
        backgroundColor: CHALK_DIM,
        opacity: 0.5,
    },
    headerText: {
        fontSize: 13,
        color: CHALK_DIM,
        fontFamily: 'Caveat_700Bold',
        letterSpacing: 1.8,
        textTransform: 'uppercase',
    },
    thoughtArea: {
        paddingHorizontal: 18,
        paddingTop: 6,
        gap: 4,
    },
    quoteOpen: {
        fontSize: 52,
        color: 'rgba(255,255,255,0.12)',
        fontFamily: 'Poppins_800ExtraBold',
        lineHeight: 42,
        marginBottom: -8,
    },
    thoughtText: {
        fontSize: 22,
        color: CHALK_WHITE,
        fontFamily: 'Caveat_400Regular',
        lineHeight: 22,
        letterSpacing: 0.4,
        textShadowColor: 'rgba(255,255,255,0.12)',
        textShadowOffset: { width: 0.5, height: 0.5 },
        textShadowRadius: 3,
    },
    authorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 6,
        justifyContent: 'flex-end',
    },
    authorDash: {
        flex: 1,
        height: 0.8,
        backgroundColor: CHALK_DIM,
        opacity: 0.4,
    },
    authorText: {
        fontSize: 15,
        color: CHALK_DIM,
        fontFamily: 'Caveat_700Bold',
        letterSpacing: 0.3,
    },

    // ── Chalk tray ──
    tray: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: 32,
        overflow: 'hidden',
    },
    trayInner: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        gap: 6,
        borderTopWidth: 1.5,
        borderTopColor: 'rgba(0,0,0,0.3)',
    },
    chalkWrap: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    chalkPiece: {
        width: 27,
        height: 6.5,
        borderRadius: 4.5,
        overflow: 'hidden',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
        elevation: 2,
    },
    chalkLine: {
        position: 'absolute',
        left: 4, right: 4,
        height: 0.5,
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    eraser: {
        marginLeft: 6,
        width: 45,
        height: 19,
        backgroundColor: '#D4956A',
        borderRadius: 3,
        borderWidth: 1,
        borderColor: '#A0603A',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
        elevation: 2,
    },
    eraserFelt: {
        position: 'absolute',
        top: 3, left: 3, right: 3,
        height: 8,
        backgroundColor: '#8B4513',
        borderRadius: 1,
        opacity: 0.6,
    },
    eraserDust: {
        position: 'absolute',
        bottom: 2, left: 4, right: 4,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 2,
    },
});