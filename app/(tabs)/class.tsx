import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/context/ThemeContext';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import {
    BookOpen,
    Calendar,
    ChevronDown,
    ChevronUp,
    Download,
    Eye,
    FileText,
    Trophy,
    Users
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
    Dimensions,
    Image,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

const LIGHT = {
    bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE',
    text: '#0F172A', subText: '#64748B', muted: '#94A3B8',
    purple: '#8B5CF6', purpleLight: '#EDE9FE',
    amber: '#F59E0B', amberLight: '#FEF3C7',
    green: '#10B981', greenLight: '#D1FAE5',
    red: '#EF4444', redLight: '#FEE2E2',
    blue: '#2563EB', blueLight: '#EFF6FF',
};

const DARK = {
    bg: '#0F0A1E', card: '#1A1030', cardBorder: '#2D1F50',
    text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B',
    purple: '#A78BFA', purpleLight: '#2D1F50',
    amber: '#FCD34D', amberLight: '#2D2010',
    green: '#34D399', greenLight: '#0D2B20',
    red: '#F87171', redLight: '#2B0D0D',
    blue: '#60A5FA', blueLight: '#0D1F3C',
};

// ─── Mock Data ────────────────────────────────────────────────────────────────
const CURRENT_STUDENT_ID = 1; // mock — replace with auth store id

const batch = {
    name: 'Class 10 — Division A',
    grade: 'Grade 10',
    totalStudents: 12,
};

const students = [
    { id: 1,  name: 'Rahul Sharma',    rollNo: '1',  rank: 1,  pct: 98.5 },
    { id: 2,  name: 'Priya Mehta',     rollNo: '2',  rank: 2,  pct: 96.2 },
    { id: 3,  name: 'Arjun Verma',     rollNo: '3',  rank: 3,  pct: 94.8 },
    { id: 4,  name: 'Prajwal Kotian',  rollNo: '4',  rank: 4,  pct: 92.1 },
    { id: 5,  name: 'Sneha Patel',     rollNo: '5',  rank: 5,  pct: 90.4 },
    { id: 6,  name: 'Karan Singh',     rollNo: '6',  rank: 6,  pct: 87.3 },
    { id: 7,  name: 'Neha Gupta',      rollNo: '7',  rank: 7,  pct: 85.1 },
    { id: 8,  name: 'Rohan Das',       rollNo: '8',  rank: 8,  pct: 82.6 },
    { id: 9,  name: 'Amit Joshi',      rollNo: '9',  rank: 9,  pct: 80.3 },
    { id: 10, name: 'Divya Nair',      rollNo: '10', rank: 10, pct: 78.9 },
    { id: 11, name: 'Sahil Mishra',    rollNo: '11', rank: 11, pct: 76.4 },
    { id: 12, name: 'Pooja Iyer',      rollNo: '12', rank: 12, pct: 74.1 },
];

const RESULTS_FILES = [
    { title: 'Unit Test 1 — Results', ext: 'PDF', date: '12 Apr 2025' },
    { title: 'Mid Sem Results', ext: 'XLS', date: '3 Mar 2025' },
];

const subjects = [
    {
        name: 'Mathematics', short: 'Math', color: '#F59E0B',
        teacher: 'Mrs. Sunita Sharma',
        leaderboard: [
            { name: 'Arjun Verma',    score: 95 },
            { name: 'Priya Mehta',    score: 91 },
            { name: 'Prajwal Kotian', score: 88 },
            { name: 'Sneha Patel',    score: 84 },
            { name: 'Rahul Sharma',   score: 81 },
        ],
        materials: [
            { name: 'Chapter 1 — Real Numbers', type: 'PDF', size: '1.8 MB' },
            { name: 'Chapter 2 — Polynomials',  type: 'PDF', size: '2.1 MB' },
            { name: 'Practice Problems Set',     type: 'PDF', size: '1.0 MB' },
        ],
        results: [
            { test: 'Unit Test 1',  scored: 32, total: 40 },
            { test: 'Online Test 1',scored: 18, total: 20 },
            { test: 'Unit Test 2',  scored: 36, total: 40 },
            { test: 'Online Test 2',scored: 17, total: 20 },
            { test: 'Term Test',    scored: 68, total: 80 },
        ],
    },
    {
        name: 'Science', short: 'Sci', color: '#2563EB',
        teacher: 'Mr. Rakesh Nair',
        leaderboard: [
            { name: 'Rahul Sharma',   score: 97 },
            { name: 'Sneha Patel',    score: 89 },
            { name: 'Karan Singh',    score: 85 },
            { name: 'Priya Mehta',    score: 82 },
            { name: 'Arjun Verma',    score: 79 },
        ],
        materials: [
            { name: 'Chapter 1 — Chemical Reactions', type: 'PDF', size: '2.0 MB' },
            { name: 'Chapter 2 — Life Processes',     type: 'PDF', size: '2.4 MB' },
        ],
        results: [
            { test: 'Unit Test 1',  scored: 35, total: 40 },
            { test: 'Online Test 1',scored: 16, total: 20 },
            { test: 'Unit Test 2',  scored: 30, total: 40 },
            { test: 'Online Test 2',scored: 19, total: 20 },
            { test: 'Term Test',    scored: 72, total: 80 },
        ],
    },
    {
        name: 'English', short: 'Eng', color: '#10B981',
        teacher: 'Mrs. Pooja Mehta',
        leaderboard: [
            { name: 'Prajwal Kotian', score: 98 },
            { name: 'Neha Gupta',     score: 94 },
            { name: 'Rohan Das',      score: 90 },
            { name: 'Sneha Patel',    score: 87 },
            { name: 'Karan Singh',    score: 83 },
        ],
        materials: [
            { name: 'First Flight — Poem Notes',   type: 'PDF', size: '1.5 MB' },
            { name: 'Footprints Without Feet',      type: 'PDF', size: '1.2 MB' },
            { name: 'Grammar Worksheet',            type: 'PDF', size: '0.8 MB' },
        ],
        results: [
            { test: 'Unit Test 1',  scored: 39, total: 40 },
            { test: 'Online Test 1',scored: 19, total: 20 },
            { test: 'Unit Test 2',  scored: 38, total: 40 },
            { test: 'Online Test 2',scored: 18, total: 20 },
            { test: 'Term Test',    scored: 76, total: 80 },
        ],
    },
    {
        name: 'History', short: 'Hist', color: '#EF4444',
        teacher: 'Mr. Anand Roy',
        leaderboard: [
            { name: 'Priya Mehta',    score: 92 },
            { name: 'Arjun Verma',    score: 88 },
            { name: 'Rahul Sharma',   score: 85 },
            { name: 'Neha Gupta',     score: 81 },
            { name: 'Rohan Das',      score: 78 },
        ],
        materials: [
            { name: 'Nationalism in India', type: 'PDF', size: '2.3 MB' },
            { name: 'The Rise of Nationalism in Europe', type: 'PDF', size: '1.8 MB' },
        ],
        results: [
            { test: 'Unit Test 1',  scored: 28, total: 40 },
            { test: 'Online Test 1',scored: 14, total: 20 },
            { test: 'Unit Test 2',  scored: 32, total: 40 },
            { test: 'Online Test 2',scored: 16, total: 20 },
            { test: 'Term Test',    scored: 58, total: 80 },
        ],
    },
    {
        name: 'Geography', short: 'Geo', color: '#0EA5E9',
        teacher: 'Mrs. Deepa Sharma',
        leaderboard: [
            { name: 'Rahul Sharma',   score: 90 },
            { name: 'Sneha Patel',    score: 86 },
            { name: 'Priya Mehta',    score: 83 },
            { name: 'Karan Singh',    score: 79 },
            { name: 'Arjun Verma',    score: 75 },
        ],
        materials: [
            { name: 'Resources and Development', type: 'PDF', size: '1.9 MB' },
            { name: 'Water Resources', type: 'PDF', size: '1.5 MB' },
        ],
        results: [
            { test: 'Unit Test 1',  scored: 30, total: 40 },
            { test: 'Online Test 1',scored: 15, total: 20 },
            { test: 'Unit Test 2',  scored: 29, total: 40 },
            { test: 'Online Test 2',scored: 14, total: 20 },
            { test: 'Term Test',    scored: 60, total: 80 },
        ],
    },
    {
        name: 'Hindi', short: 'Hindi', color: '#EC4899',
        teacher: 'Mrs. Kavita Joshi',
        leaderboard: [
            { name: 'Sneha Patel',    score: 96 },
            { name: 'Prajwal Kotian', score: 90 },
            { name: 'Neha Gupta',     score: 87 },
            { name: 'Rahul Sharma',   score: 84 },
            { name: 'Rohan Das',      score: 80 },
        ],
        materials: [
            { name: 'Kshitij — Chapter Notes', type: 'PDF', size: '1.6 MB' },
            { name: 'Sparsh — Poem Summary',   type: 'PDF', size: '1.1 MB' },
        ],
        results: [
            { test: 'Unit Test 1',  scored: 33, total: 40 },
            { test: 'Online Test 1',scored: 17, total: 20 },
            { test: 'Unit Test 2',  scored: 34, total: 40 },
            { test: 'Online Test 2',scored: 16, total: 20 },
            { test: 'Term Test',    scored: 65, total: 80 },
        ],
    },
];

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, color, size }: { name: string; color: string; size: number }) {
    const colors = ['#7C3AED', '#2563EB', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];
    const bg = colors[name.charCodeAt(0) % colors.length];
    return (
        <View style={{
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: bg + '20',
            borderWidth: 2, borderColor: bg,
            alignItems: 'center', justifyContent: 'center',
        }}>
            <Text style={{ fontSize: size * 0.38, fontWeight: '700', color: bg }}>
                {name.split(' ').map(n => n[0]).join('')}
            </Text>
        </View>
    );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function Card({ children, theme, style }: { children: React.ReactNode; theme: typeof LIGHT; style?: object }) {
    return (
        <View style={[{
            backgroundColor: theme.card, borderRadius: 20, padding: 16,
            borderWidth: 1, borderColor: theme.cardBorder,
            shadowColor: theme.purple, shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
        }, style]}>
            {children}
        </View>
    );
}

// ─── Timetable Image Card ─────────────────────────────────────────────────────
const TIMETABLE_IMAGE = require('../../assets/images/timetable.jpeg');
function TimetableImageCard({ theme, isDark }: { theme: typeof LIGHT; isDark: boolean }) {
    const [fullscreen, setFullscreen] = useState(false);
    const [downloadMsg, setDownloadMsg] = useState('');

    const handleDownload = async () => {
        try {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') {
                setDownloadMsg('Permission denied');
                setTimeout(() => setDownloadMsg(''), 2500);
                return;
            }
            // Resolve the local asset URI
            const asset = Image.resolveAssetSource(TIMETABLE_IMAGE);
            const fileUri = FileSystem.documentDirectory + 'timetable.jpeg';
            await FileSystem.downloadAsync(asset.uri, fileUri);
            await MediaLibrary.saveToLibraryAsync(fileUri);
            setDownloadMsg('Saved to gallery! ✅');
            setTimeout(() => setDownloadMsg(''), 2500);
        } catch (e) {
            setDownloadMsg('Download failed ❌');
            setTimeout(() => setDownloadMsg(''), 2500);
        }
    };

    return (
        <>
            {/* ── Card ── */}
            <View style={[{
                backgroundColor: theme.card,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: theme.cardBorder,
                overflow: 'hidden',
                shadowColor: '#7C3AED',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 8,
                elevation: 2,
            }]}>
                {/* Header */}
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    padding: 14,
                    paddingBottom: 10,
                }}>
                    <Calendar size={16} color={theme.purple} />
                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text, flex: 1 }}>
                        Timetable
                    </Text>
                    {/* Download btn */}
                    <TouchableOpacity
                        onPress={handleDownload}
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 5,
                            backgroundColor: theme.purpleLight,
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 99,
                        }}
                        activeOpacity={0.75}
                    >
                        <Download size={13} color={theme.purple} />
                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.purple }}>
                            Save
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Download feedback */}
                {downloadMsg ? (
                    <View style={{
                        marginHorizontal: 14,
                        marginBottom: 8,
                        backgroundColor: isDark ? '#0D2B20' : '#D1FAE5',
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 10,
                    }}>
                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: isDark ? '#34D399' : '#065F46' }}>
                            {downloadMsg}
                        </Text>
                    </View>
                ) : null}

                {/* Tap hint */}
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    marginHorizontal: 14,
                    marginBottom: 8,
                }}>
                    <Eye size={12} color={theme.muted} />
                    <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>
                        Tap image to view full screen
                    </Text>
                </View>

                {/* Image — tappable */}
                <TouchableOpacity
                    onPress={() => setFullscreen(true)}
                    activeOpacity={0.9}
                    style={{ marginHorizontal: 14, marginBottom: 14 }}
                >
                    <Image
                        source={TIMETABLE_IMAGE}
                        style={{
                            width: '100%',
                            height: undefined,
                            aspectRatio: 1, // 👈 adjust kar sakta hai
                            borderRadius: 14,
                        }}
                        resizeMode="contain"
                    />
                    {/* Fullscreen icon overlay */}
                    <View style={{
                        position: 'absolute',
                        bottom: 10,
                        right: 10,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        borderRadius: 8,
                        padding: 6,
                    }}>
                        <Eye size={16} color="white" />
                    </View>
                </TouchableOpacity>
            </View>

            {/* ── Fullscreen Modal ── */}
            <Modal
                visible={fullscreen}
                transparent
                animationType="fade"
                statusBarTranslucent
                onRequestClose={() => setFullscreen(false)}
            >
                <StatusBar hidden />
                <View style={{
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.96)',
                    justifyContent: 'center',
                    alignItems: 'center',
                }}>
                    {/* Close + Download bar */}
                    <View style={{
                        position: 'absolute',
                        top: 50,
                        left: 0,
                        right: 0,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingHorizontal: 20,
                        zIndex: 10,
                    }}>
                        <TouchableOpacity
                            onPress={() => setFullscreen(false)}
                            style={{
                                backgroundColor: 'rgba(255,255,255,0.15)',
                                borderRadius: 99,
                                paddingHorizontal: 16,
                                paddingVertical: 8,
                            }}
                        >
                            <Text style={{ color: 'white', fontSize: 13, fontFamily: 'Poppins_600SemiBold' }}>✕ Close</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleDownload}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                backgroundColor: '#7C3AED',
                                borderRadius: 99,
                                paddingHorizontal: 16,
                                paddingVertical: 8,
                            }}
                        >
                            <Download size={14} color="white" />
                            <Text style={{ color: 'white', fontSize: 13, fontFamily: 'Poppins_600SemiBold' }}>Download</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Fullscreen Image — scrollable/zoomable */}
                    <ScrollView
                        style={{ flex: 1, width: '100%' }}
                        contentContainerStyle={{ justifyContent: 'center', alignItems: 'center', paddingVertical: 100 }}
                        maximumZoomScale={4}
                        minimumZoomScale={1}
                        showsVerticalScrollIndicator={false}
                        showsHorizontalScrollIndicator={false}
                        centerContent
                    >
                        <Image
                            source={TIMETABLE_IMAGE}
                            style={{
                                width: width,
                                height: height * 0.75,
                            }}
                            resizeMode="contain"
                        />
                    </ScrollView>

                    {/* Download feedback in modal */}
                    {downloadMsg ? (
                        <View style={{
                            position: 'absolute',
                            bottom: 60,
                            backgroundColor: '#065F46',
                            paddingHorizontal: 20,
                            paddingVertical: 10,
                            borderRadius: 14,
                        }}>
                            <Text style={{ color: 'white', fontFamily: 'Poppins_600SemiBold', fontSize: 13 }}>
                                {downloadMsg}
                            </Text>
                        </View>
                    ) : null}
                </View>
            </Modal>
        </>
    );
}

// ─── Inline Wheel Picker ──────────────────────────────────────────────────────
const WHEEL_ITEM_H = 22;
function InlineWheel({ options, value, onChange, isDark, theme }: {
    options: string[];
    value: string;
    onChange: (v: string) => void;
    isDark: boolean;
    theme: typeof LIGHT;
}) {
    const scrollRef = React.useRef<ScrollView>(null);
    const n = options.length;
    const REPEAT = 9;
    const middleSet = Math.floor(REPEAT / 2);
    const loopedOptions = React.useMemo(
        () => Array.from({ length: REPEAT * n }, (_, i) => options[i % n]),
        [options]
    );
    // One step per gesture, regardless of drag distance: we only look at the
    // direction the user dragged (not where they landed), advance `value` by
    // exactly one option in that direction, and always recenter afterwards.
    // `handledRef` ensures a gesture commits at most once even if both
    // onScrollEndDrag-style events fire for it.
    const startOffsetRef = React.useRef(0);
    const handledRef = React.useRef(true);

    const centerOn = (val: string, animated: boolean) => {
        const idx = middleSet * n + options.indexOf(val);
        scrollRef.current?.scrollTo({ y: idx * WHEEL_ITEM_H, animated });
    };

    React.useEffect(() => {
        centerOn(value, false);
    }, [value]);

    const onDragStart = (e: any) => {
        startOffsetRef.current = e.nativeEvent.contentOffset.y;
        handledRef.current = false;
    };

    // Shared single-step logic so both the drag gesture and the arrow
    // buttons advance exactly one option in the given direction.
    const step = (dir: 1 | -1) => {
        const curIdx = options.indexOf(value);
        const next = options[(curIdx + dir + n) % n];
        // selectionAsync's "view tick" haptic is barely perceptible on most
        // Android devices/OEMs, so use a real vibrator-driven impact there
        // (matches the impactAsync pattern already used in TopBar/ScreenHeader).
        if (Platform.OS === 'android') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else {
            Haptics.selectionAsync();
        }
        onChange(next);
    };

    const commitStep = (e: any) => {
        if (handledRef.current) return;
        handledRef.current = true;
        const delta = e.nativeEvent.contentOffset.y - startOffsetRef.current;
        if (Math.abs(delta) >= WHEEL_ITEM_H / 2) {
            step(delta > 0 ? 1 : -1);
        } else {
            centerOn(value, false);
        }
    };

    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            height: WHEEL_ITEM_H,
            width: 86,
            paddingHorizontal: 4,
            gap: 2,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: isDark ? '#2D1F50' : '#E4DCFA',
            backgroundColor: isDark ? '#1E1533' : '#F3F0FA',
        }}>
            <View style={{ flex: 1, height: WHEEL_ITEM_H, overflow: 'hidden' }}>
                <ScrollView
                    ref={scrollRef}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={WHEEL_ITEM_H}
                    decelerationRate="fast"
                    disableIntervalMomentum
                    onScrollBeginDrag={onDragStart}
                    onScrollEndDrag={commitStep}
                    onMomentumScrollEnd={commitStep}
                    nestedScrollEnabled
                >
                    {loopedOptions.map((opt, i) => (
                        <View key={i} style={{ height: WHEEL_ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{
                                fontSize: 10,
                                fontFamily: 'Poppins_600SemiBold',
                                color: theme.purple,
                                textTransform: 'capitalize',
                            }}>
                                {opt}
                            </Text>
                        </View>
                    ))}
                </ScrollView>
            </View>
            <View style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <TouchableOpacity activeOpacity={0.6} onPress={() => step(-1)} hitSlop={{ top: 6, bottom: 2, left: 6, right: 6 }}>
                    <ChevronUp size={11} color={theme.purple} />
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.6} onPress={() => step(1)} hitSlop={{ top: 2, bottom: 6, left: 6, right: 6 }}>
                    <ChevronDown size={11} color={theme.purple} style={{ marginTop: -2 }} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function Courses() {
    const { isDark } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const [activeTab, setActiveTab] = useState<'batch' | 'subjects'>('batch');
    const [activeSubject, setActiveSubject] = useState(0);
    const [activeSubTab, setActiveSubTab] = useState<'materials' | 'results' | 'top'>('results');
    const [rankTab, setRankTab] = useState<'offline' | 'online' | 'combined'>('combined');
    const [resultMode, setResultMode] = useState<'offline' | 'online' | 'combined'>('combined');

    const subject = subjects[activeSubject];
    const getRankEmoji = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
            <ScreenHeader title="Class" />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>

                {/* ── Batch Info Banner ── */}
                <View style={[styles.banner, { backgroundColor: isDark ? '#1A0A3E' : '#7C3AED' }]}>
                    <View style={styles.bannerOrb1} />
                    <View style={styles.bannerOrb2} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={styles.bannerIconBox}>
                            <BookOpen size={20} color="white" />
                        </View>
                        <View>
                            <Text style={styles.bannerTitle}>{batch.name}</Text>
                            <Text style={styles.bannerSub}>{batch.grade} · {batch.totalStudents} Students</Text>
                        </View>
                    </View>
                </View>

                {/* ── Main Tabs ── */}
                <View style={[styles.mainTabRow, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                    {(['batch', 'subjects'] as const).map((tab) => (
                        <TouchableOpacity
                            key={tab}
                            onPress={() => setActiveTab(tab)}
                            style={[styles.mainTab, activeTab === tab && { backgroundColor: theme.purple }]}
                        >
                            <Text style={[styles.mainTabText, { color: activeTab === tab ? 'white' : theme.subText }]}>
                                {tab === 'batch' ? '📋 View' : '📚 Subjects'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <View style={styles.body}>

                    {/* ══ BATCH TAB ══ */}
                    {activeTab === 'batch' && (
                        <View style={{ gap: 14 }}>
                            {/* ── Timetable ── */}
                            <TimetableImageCard theme={theme} isDark={isDark} />

                            {/* ── Subject Teachers ── */}
                            <Card theme={theme}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                    <BookOpen size={16} color={theme.purple} />
                                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>
                                        Subject Teachers
                                    </Text>
                                </View>
                                <ScrollView style={{ maxHeight: 230 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                                    <View style={{ gap: 8 }}>
                                        {subjects.map((sub) => (
                                            <View key={sub.name} style={{
                                                flexDirection: 'row', alignItems: 'center', gap: 10,
                                                paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: isDark ? '#2D1F50' : '#EDE9FE',
                                            }}>
                                                <View style={{
                                                    width: 8, height: 8, borderRadius: 4,
                                                    backgroundColor: sub.color,
                                                }} />
                                                <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>
                                                    {sub.name}
                                                </Text>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    <Avatar name={sub.teacher} color={sub.color} size={22} />
                                                    <Text style={{ fontSize: 11, color: theme.subText, fontFamily: 'Poppins_400Regular' }}>
                                                        {sub.teacher}
                                                    </Text>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                </ScrollView>
                            </Card>


                            {/* ── Leaderboard ── */}
                            <Card theme={theme}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                                    <Trophy size={16} color={theme.amber} />
                                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text, marginLeft: 8, flex: 1 }}>
                                        Leaderboard Top 5
                                    </Text>
                                    {/* Inline Wheel */}
                                    <InlineWheel
                                        options={['combined', 'offline', 'online']}
                                        value={rankTab}
                                        onChange={(v) => setRankTab(v as typeof rankTab)}
                                        isDark={isDark}
                                        theme={theme}
                                    />
                                </View>
                                {/* Podium top 3 */}
                                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 12, marginBottom: 14 }}>
                                    {[students[1], students[0], students[2]].map((s, i) => {
                                        const cfg = [
                                            { height: 64, color: '#C0C0C0', label: '2nd' },
                                            { height: 96, color: '#F59E0B', label: '1st' },
                                            { height: 48, color: '#CD7F32', label: '3rd' },
                                        ][i];
                                        return (
                                            <View key={s.id} style={{ alignItems: 'center', gap: 4 }}>
                                                <Avatar name={s.name} color={theme.purple} size={40} />
                                                <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.text, width: 64, textAlign: 'center' }} numberOfLines={2}>{s.name}</Text>
                                                <Text style={{ fontSize: 9, fontFamily: 'Poppins_400Regular', color: theme.subText }}>{s.pct}%</Text>
                                                <View style={{ height: cfg.height, width: 52, backgroundColor: cfg.color, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                                                    <Text style={{ color: 'white', fontSize: 11, fontFamily: 'Poppins_700Bold' }}>{cfg.label}</Text>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                                {/* Rank 4 & 5 */}
                                <View style={{ gap: 8 }}>
                                    {students.slice(3, 5).map((s) => (
                                        <View key={s.id} style={{
                                            flexDirection: 'row', alignItems: 'center', gap: 12,
                                            padding: 10, borderRadius: 12, backgroundColor: theme.bg,
                                        }}>
                                            <Text style={{ fontSize: 18, width: 28 }}>
                                                {students.indexOf(s) === 3 ? '4️⃣' : '5️⃣'}
                                            </Text>
                                            <Avatar name={s.name} color={theme.purple} size={36} />
                                            <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{s.name}</Text>
                                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.purple }}>{s.pct}%</Text>
                                        </View>
                                    ))}
                                </View>
                            </Card>

                            {/* ── Results ── */}
                            <Card theme={theme}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                    <FileText size={16} color={theme.purple} />
                                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>Results</Text>
                                </View>
                                <View style={{ gap: 10 }}>
                                    {RESULTS_FILES.map((r, i) => (
                                        <View key={i} style={{
                                            flexDirection: 'row', alignItems: 'center', gap: 12,
                                            paddingVertical: 10,
                                            borderBottomWidth: i < RESULTS_FILES.length - 1 ? 1 : 0,
                                            borderBottomColor: isDark ? '#2D1F50' : '#EDE9FE',
                                        }}>
                                            <View style={{
                                                width: 36, height: 36, borderRadius: 10,
                                                backgroundColor: r.ext === 'PDF' ? '#EF444420' : '#05966920',
                                                alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <Text style={{
                                                    fontSize: 9, fontFamily: 'Poppins_700Bold',
                                                    color: r.ext === 'PDF' ? '#EF4444' : '#059669',
                                                }}>{r.ext}</Text>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{r.title}</Text>
                                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.subText }}>{r.date}</Text>
                                            </View>
                                            <TouchableOpacity style={{
                                                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                                                borderWidth: 1, borderColor: isDark ? '#2D1F50' : '#DDD6FE',
                                            }}>
                                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.purple }}>View</Text>
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </View>
                            </Card>

                            {/* ── Classmates ── */}
                            <Card theme={theme}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                    <Users size={16} color={theme.purple} />
                                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>
                                        Classmates{' '}
                                        <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>
                                            ({batch.totalStudents})
                                        </Text>
                                    </Text>
                                </View>
                                <ScrollView style={{ maxHeight: 396 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                                <View style={{ gap: 8 }}>
                                    {[...students].sort((a, b) => parseInt(a.rollNo) - parseInt(b.rollNo)).map((student) => {
                                        const isMe = student.id === CURRENT_STUDENT_ID;
                                        return (
                                            <View key={student.id} style={{
                                                flexDirection: 'row', alignItems: 'center', gap: 12,
                                                padding: 10, borderRadius: 14,
                                                backgroundColor: isMe ? (isDark ? '#2D1F50' : '#EDE9FE') : theme.bg,
                                            }}>
                                                <Avatar name={student.name} color={isMe ? theme.purple : theme.purple} size={42} />
                                                <View style={{ flex: 1 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>
                                                            {student.name}
                                                        </Text>
                                                        {isMe && (
                                                            <View style={{ backgroundColor: isDark ? '#3D2A6E' : '#DDD6FE', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 99 }}>
                                                                <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: theme.purple }}>You</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                    <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>
                                                        Roll No. {student.rollNo}
                                                    </Text>
                                                </View>
                                                <View style={{ alignItems: 'center' }}>
                                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: '#7C3AED' }}>
                                                        #{student.rank}
                                                    </Text>
                                                    <Text style={{ fontSize: 9, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>rank</Text>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                                </ScrollView>
                            </Card>
                        </View>
                    )}

                    {/* ══ SUBJECTS TAB ══ */}
                    {activeTab === 'subjects' && (
                        <View style={{ gap: 14 }}>

                            {/* Subject selector — full name tags */}
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {subjects.map((s, i) => (
                                        <TouchableOpacity
                                            key={s.name}
                                            onPress={() => { setActiveSubject(i); setActiveSubTab('results'); }}
                                            style={{
                                                flexDirection: 'row', alignItems: 'center', gap: 5,
                                                paddingHorizontal: 12, paddingVertical: 7,
                                                borderRadius: 99,
                                                backgroundColor: activeSubject === i ? s.color + '20' : theme.card,
                                                borderWidth: 1,
                                                borderColor: activeSubject === i ? s.color + '60' : theme.cardBorder,
                                            }}>
                                            <BookOpen size={11} color={activeSubject === i ? s.color : theme.subText} />
                                            <Text style={{
                                                fontSize: 12, fontFamily: 'Poppins_600SemiBold',
                                                color: activeSubject === i ? s.color : theme.subText,
                                            }}>
                                                {s.name}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>

                            {/* Subject header */}
                            <Card theme={theme} style={{ padding: 14 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <View style={{
                                        width: 44, height: 44, borderRadius: 12,
                                        backgroundColor: subject.color + '20',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <BookOpen size={20} color={subject.color} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: theme.text }}>
                                            {subject.name}
                                        </Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                            <Avatar name={subject.teacher} color={subject.color} size={18} />
                                            <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>
                                                {subject.teacher}
                                            </Text>
                                        </View>
                                    </View>
                                    <InlineWheel
                                        options={['combined', 'offline', 'online']}
                                        value={resultMode}
                                        onChange={(v) => setResultMode(v as typeof resultMode)}
                                        isDark={isDark}
                                        theme={theme}
                                    />
                                </View>
                            </Card>

                            {/* Sub tabs */}
                            <View style={[styles.subTabRow, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                                {(['results', 'materials', 'top'] as const).map((tab) => (
                                    <TouchableOpacity
                                        key={tab}
                                        onPress={() => setActiveSubTab(tab)}
                                        style={[styles.subTab, activeSubTab === tab && { backgroundColor: subject.color }]}
                                    >
                                        <Text style={[styles.subTabText, { color: activeSubTab === tab ? 'white' : theme.subText }]}>
                                            {tab === 'materials' ? '📄 Materials' : tab === 'top' ? '🏆 Top' : '📊 Results'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* ── Top 5 tab ── */}
                            {activeSubTab === 'top' && (
                                <Card theme={theme}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                        <Text style={{ fontSize: 16 }}>🏆</Text>
                                        <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>
                                            {subject.name} — Top 5
                                        </Text>
                                    </View>
                                    <View style={{ gap: 10 }}>
                                        {subject.leaderboard.map((s, i) => {
                                            const isMe = s.name === students.find(st => st.id === CURRENT_STUDENT_ID)?.name;
                                            return (
                                                <View key={i} style={{
                                                    flexDirection: 'row', alignItems: 'center', gap: 12,
                                                    padding: 10, borderRadius: 14,
                                                    backgroundColor: isMe ? (isDark ? '#2D1F50' : '#EDE9FE') : i === 0 ? theme.amberLight : theme.bg,
                                                    borderWidth: i === 0 ? 1 : 0,
                                                    borderColor: i === 0 ? theme.amber + '40' : 'transparent',
                                                }}>
                                                    {getRankEmoji(i)
                                                        ? <Text style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{getRankEmoji(i)}</Text>
                                                        : <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: theme.subText, width: 28, textAlign: 'center' }}>#{i + 1}</Text>
                                                    }
                                                    <Avatar name={s.name} color={subject.color} size={38} />
                                                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>
                                                            {s.name}
                                                        </Text>
                                                        {isMe && (
                                                            <View style={{ backgroundColor: isDark ? '#3D2A6E' : '#DDD6FE', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 99 }}>
                                                                <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: theme.purple }}>You</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: subject.color }}>
                                                        {s.score}%
                                                    </Text>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </Card>
                            )}

                            {/* ── Materials ── */}
                            {activeSubTab === 'materials' && (
                                <Card theme={theme}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                        <FileText size={16} color={subject.color} />
                                        <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>
                                            Study Materials
                                        </Text>
                                    </View>
                                    <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                                    <View style={{ gap: 10 }}>
                                        {subject.materials.map((mat, i) => (
                                            <View key={i} style={{
                                                flexDirection: 'row', alignItems: 'center', gap: 12,
                                                padding: 12, backgroundColor: theme.bg, borderRadius: 14,
                                            }}>
                                                <View style={{
                                                    width: 40, height: 40, borderRadius: 10,
                                                    backgroundColor: subject.color + '20',
                                                    alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    <FileText size={18} color={subject.color} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{mat.name}</Text>
                                                    <Text style={{ fontSize: 10, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>{mat.type} · {mat.size}</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                                    <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: subject.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                                                        <Eye size={14} color={subject.color} />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: subject.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                                                        <Download size={14} color={subject.color} />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                    </ScrollView>
                                </Card>
                            )}

                            {/* ── Results ── */}
                            {activeSubTab === 'results' && (
                                <Card theme={theme}>
                                    {/* Performance Trend */}
                                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text, marginBottom: 4 }}>
                                        Performance Trend
                                    </Text>
                                    <LineChart
                                        renderDotContent={({ x, y, index, indexData }) => {
                                            const data = subject.results.map(r => Math.round((r.scored / r.total) * 100));
                                            const max = Math.max(...data);
                                            const min = Math.min(...data);
                                            if (indexData !== max && indexData !== min) return null;
                                            const isMin = indexData === min;
                                            return (
                                                <View key={index} style={{
                                                    position: 'absolute',
                                                    top: isMin ? y + 6 : y - 22,
                                                    left: x - 12,
                                                    backgroundColor: isMin ? theme.red : theme.green,
                                                    paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4,
                                                }}>
                                                    <Text style={{ fontSize: 9, color: 'white', fontFamily: 'Poppins_600SemiBold' }}>
                                                        {indexData}%
                                                    </Text>
                                                </View>
                                            );
                                        }}
                                        data={{
                                            labels: subject.results.map(r =>
                                                r.test.replace('Unit Test', 'UT').replace('Online Test', 'OT')
                                            ),
                                            datasets: [{
                                                data: subject.results.map(r => Math.round((r.scored / r.total) * 100)),
                                                color: () => subject.color,
                                                strokeWidth: 2,
                                            }],
                                        }}
                                        width={width - 80}
                                        height={180}
                                        yAxisSuffix="%"
                                        chartConfig={{
                                            backgroundColor: 'transparent',
                                            backgroundGradientFrom: theme.card,
                                            backgroundGradientTo: theme.card,
                                            decimalPlaces: 0,
                                            color: () => subject.color,
                                            fillShadowGradient: subject.color,
                                            fillShadowGradientOpacity: 0.15,
                                            labelColor: () => theme.subText,
                                            propsForDots: { r: '4', strokeWidth: '2', stroke: theme.card, fill: subject.color },
                                            propsForBackgroundLines: { stroke: theme.cardBorder, strokeWidth: 1, strokeDasharray: '' },
                                            propsForLabels: { fontSize: 9, fontFamily: 'Poppins_400Regular' },
                                        }}
                                        bezier
                                        style={{ borderRadius: 12, marginLeft: -16, marginBottom: 16 }}
                                        fromZero={true}
                                        withInnerLines={true}
                                        withHorizontalLabels={true}
                                        segments={5}
                                    />
                                    {/* Results list heading */}
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                        <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>My Results</Text>
                                    </View>
                                    <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                                    <View style={{ gap: 10 }}>
                                        {subject.results
                                            .filter(r => resultMode === 'online'
                                                ? r.test.toLowerCase().includes('online')
                                                : resultMode === 'offline'
                                                ? !r.test.toLowerCase().includes('online')
                                                : true)
                                            .map((r, i) => {
                                            const pct = Math.round((r.scored / r.total) * 100);
                                            const passed = pct >= 40;
                                            return (
                                                <View key={i} style={{ padding: 12, backgroundColor: theme.bg, borderRadius: 14, gap: 8 }}>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{r.test}</Text>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: subject.color }}>{r.scored}/{r.total}</Text>
                                                            <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: passed ? theme.greenLight : theme.redLight }}>
                                                                <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: passed ? theme.green : theme.red }}>{pct}%</Text>
                                                            </View>
                                                        </View>
                                                    </View>
                                                    <View style={{ height: 5, backgroundColor: theme.cardBorder, borderRadius: 99, overflow: 'hidden' }}>
                                                        <View style={{ width: `${pct}%` as any, height: '100%', backgroundColor: passed ? subject.color : theme.red, borderRadius: 99 }} />
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                    </ScrollView>
                                </Card>
                            )}

                        </View>
                    )}

                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    banner: {
        margin: 16, borderRadius: 20, padding: 16,
        overflow: 'hidden', position: 'relative',
    },
    bannerOrb1: {
        position: 'absolute', width: 120, height: 120, borderRadius: 60,
        backgroundColor: 'rgba(255,255,255,0.07)', top: -40, right: -30,
    },
    bannerOrb2: {
        position: 'absolute', width: 80, height: 80, borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.05)', bottom: -20, left: 20,
    },
    bannerIconBox: {
        width: 44, height: 44, borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center', justifyContent: 'center',
    },
    bannerTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: 'white' },
    bannerSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', fontFamily: 'Poppins_400Regular' },
    mainTabRow: {
        flexDirection: 'row', marginHorizontal: 16, marginBottom: 4,
        borderRadius: 14, padding: 4, borderWidth: 1,
    },
    mainTab: {
        flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10,
    },
    mainTabText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
    body: { paddingHorizontal: 16, paddingTop: 12 },
    subTabRow: {
        flexDirection: 'row', borderRadius: 14, padding: 4, borderWidth: 1,
    },
    subTab: {
        flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10,
    },
    subTabText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
});
