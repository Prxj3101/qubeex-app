import { InlineWheel } from '@/components/InlineWheel';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TabEntryCover, useTabEntryCover } from '@/components/TabEntryCover';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import {
    BookOpen,
    Calendar,
    Download,
    Eye,
    GraduationCap,
    Trophy,
    Users,
    FileText,
    X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Image,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { LineChart } from 'react-native-chart-kit';
import Constants from 'expo-constants';

const { width } = Dimensions.get('window');

const LIGHT = {
    bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE',
    text: '#0F172A', subText: '#64748B', muted: '#94A3B8',
    purple: '#8B5CF6', purpleLight: '#EDE9FE',
    amber: '#F59E0B', amberLight: '#FEF3C7',
    green: '#10B981', greenLight: '#D1FAE5',
    red: '#EF4444', redLight: '#FEE2E2',
};
const DARK = {
    bg: '#0F0A1E', card: '#1A1030', cardBorder: '#2D1F50',
    text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B',
    purple: '#A78BFA', purpleLight: '#2D1F50',
    amber: '#FCD34D', amberLight: '#2D2010',
    green: '#34D399', greenLight: '#0D2B20',
    red: '#F87171', redLight: '#2B0D0D',
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface Subject {
    id: string; name: string; code: string; color: string; teacherName: string; teacherAvatarUrl: string | null;
}
interface Classmate {
    id: string; name: string; rollNo: string;
    rank: number | null; attendancePct: number | null;
    marksPct: number | null; offlinePct: number | null; onlinePct: number | null;
    isMe: boolean; avatarUrl: string | null;
}
interface ScoreCol { name: string; scored: number | null; max: number; isAbsent: boolean }
interface SubjectScore {
    subjectId: string; subjectName: string; subjectCode: string; subjectColor: string;
    columns: ScoreCol[];
    totalScored: number; totalMax: number; pct: number | null;
    offlineColumns: ScoreCol[]; offlineTotalScored: number; offlineTotalMax: number; offlinePct: number | null;
    onlineColumns: ScoreCol[]; onlineTotalScored: number; onlineTotalMax: number; onlinePct: number | null;
}
interface LbEntry {
    name: string; avatarUrl: string | null; combinedPct: number; offlinePct: number | null; onlinePct: number | null; isMe: boolean;
}
interface ResultFile {
    id: string; title: string;
    attachmentUrl: string | null; attachmentType: string | null; attachmentName: string | null;
    postedBy: string; createdAt: string;
}
interface MaterialFile {
    id: string; title: string;
    attachmentUrl: string | null; attachmentType: string | null; attachmentName: string | null;
    postedBy: string; createdAt: string;
}
interface ClassData {
    division: { id: string; name: string; standardName: string; classTeacherName: string | null; classTeacherAvatarUrl: string | null; totalStudents: number; subjects: Subject[]; timetableUrl: string | null } | null;
    resultFiles: ResultFile[];
    subjectMaterials: Record<string, MaterialFile[]>;
    generalMaterials?: MaterialFile[];
    classmates: Classmate[];
    myScores: SubjectScore[];
    subjectLeaderboards: Record<string, LbEntry[]>;
}

type LbMode = 'combined' | 'offline' | 'online';

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#7C3AED', '#2563EB', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#0891B2', '#059669'];
function getAvatarBg(name: string) { return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]; }
function getInitials(name: string) { return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase(); }
function formatDivision(n: string) {
    const p = n.split('-');
    return p.length > 1 ? `Division ${p.slice(1).join('-')}` : n;
}
function getPct(c: Classmate, mode: LbMode) {
    if (mode === 'offline') return c.offlinePct;
    if (mode === 'online') return c.onlinePct;
    return c.marksPct;
}
function getLbPct(e: LbEntry, mode: LbMode) {
    if (mode === 'offline') return e.offlinePct;
    if (mode === 'online') return e.onlinePct;
    return e.combinedPct;
}

// ── In-App File Viewer ────────────────────────────────────────────────────────
interface ViewerFile { title: string; url: string; type: string | null }

function FileViewerModal({ file, onClose }: { file: ViewerFile | null; onClose: () => void }) {
    const [webViewLoading, setWebViewLoading] = useState(true);
    if (!file) return null;
    return (
        <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
            <StatusBar barStyle="light-content" backgroundColor="#0F0A1E" />
            <View style={{ flex: 1, backgroundColor: '#0F0A1E' }}>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#2D1F50' }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#F1F5F9' }} numberOfLines={1}>{file.title}</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#2D1F50', alignItems: 'center', justifyContent: 'center' }} activeOpacity={0.75}>
                        <X size={16} color="#F1F5F9" />
                    </TouchableOpacity>
                </View>
                {/* WebView */}
                <View style={{ flex: 1 }}>
                    {webViewLoading && (
                        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                            <ActivityIndicator size="large" color="#8B5CF6" />
                        </View>
                    )}
                    <WebView
                        source={{ uri: file.url }}
                        style={{ flex: 1, backgroundColor: '#0F0A1E' }}
                        onLoadEnd={() => setWebViewLoading(false)}
                        onLoadStart={() => setWebViewLoading(true)}
                        scalesPageToFit
                        allowsInlineMediaPlayback
                    />
                </View>
            </View>
        </Modal>
    );
}

// ── Small Avatar ──────────────────────────────────────────────────────────────
function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
    const bg = getAvatarBg(name);
    if (avatarUrl) {
        return (
            <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', borderWidth: 1.5, borderColor: bg }}>
                <Image source={{ uri: avatarUrl }} style={{ width: size, height: size }} resizeMode="cover" />
            </View>
        );
    }
    return (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg + '20', borderWidth: 1.5, borderColor: bg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: size * 0.36, fontWeight: '700', color: bg }}>{getInitials(name)}</Text>
        </View>
    );
}

// ── Card ──────────────────────────────────────────────────────────────────────
function Card({ children, theme, style }: { children: React.ReactNode; theme: typeof LIGHT; style?: object }) {
    return (
        <View style={[{ backgroundColor: theme.card, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: theme.cardBorder, shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }, style]}>
            {children}
        </View>
    );
}

// LB mode filter now uses the shared InlineWheel picker (components/InlineWheel.tsx) —
// same exact control as the Subject Performance wheel on the Profile screen.
const LB_MODE_OPTIONS = ['combined', 'offline', 'online'];

// ── Timetable Card ────────────────────────────────────────────────────────────
// Shows the class teacher's uploaded timetable (division.timetableUrl from the
// backend). Nothing uploaded yet → empty state, not a shared placeholder image.
function TimetableImageCard({ theme, isDark, timetableUrl }: { theme: typeof LIGHT; isDark: boolean; timetableUrl: string | null }) {
    const [fullscreen, setFullscreen] = useState(false);
    const [downloadMsg, setDownloadMsg] = useState('');

    const handleDownload = async () => {
        if (!timetableUrl) return;
        try {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') { setDownloadMsg('Permission denied'); setTimeout(() => setDownloadMsg(''), 2500); return; }
            const fileUri = FileSystem.documentDirectory + 'timetable.jpg';
            await FileSystem.downloadAsync(timetableUrl, fileUri);
            await MediaLibrary.saveToLibraryAsync(fileUri);
            setDownloadMsg('Saved to gallery! ✅');
            setTimeout(() => setDownloadMsg(''), 2500);
        } catch { setDownloadMsg('Download failed ❌'); setTimeout(() => setDownloadMsg(''), 2500); }
    };

    return (
        <>
            <View style={{ backgroundColor: theme.card, borderRadius: 20, borderWidth: 1, borderColor: theme.cardBorder, overflow: 'hidden', shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, paddingBottom: 10 }}>
                    <Calendar size={16} color={theme.purple} />
                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text, flex: 1 }}>Timetable</Text>
                    {timetableUrl && (
                        <TouchableOpacity onPress={handleDownload} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.purpleLight, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 }} activeOpacity={0.75}>
                            <Download size={13} color={theme.purple} />
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.purple }}>Save</Text>
                        </TouchableOpacity>
                    )}
                </View>
                {downloadMsg ? (
                    <View style={{ marginHorizontal: 14, marginBottom: 8, backgroundColor: isDark ? '#0D2B20' : '#D1FAE5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}>
                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: isDark ? '#34D399' : '#065F46' }}>{downloadMsg}</Text>
                    </View>
                ) : null}
                {timetableUrl ? (
                    <>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginHorizontal: 14, marginBottom: 8 }}>
                            <Eye size={12} color={theme.muted} />
                            <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>Tap image to view full screen</Text>
                        </View>
                        <TouchableOpacity onPress={() => setFullscreen(true)} activeOpacity={0.9} style={{ marginHorizontal: 14, marginBottom: 14 }}>
                            <Image source={{ uri: timetableUrl }} style={{ width: '100%', height: undefined, aspectRatio: 1, borderRadius: 14 }} resizeMode="contain" />
                            <View style={{ position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: 6 }}>
                                <Eye size={16} color="white" />
                            </View>
                        </TouchableOpacity>
                    </>
                ) : (
                    <View style={{ paddingVertical: 28, alignItems: 'center', gap: 6 }}>
                        <Calendar size={22} color={theme.muted} />
                        <Text style={{ fontSize: 12, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>Timetable not uploaded yet</Text>
                    </View>
                )}
            </View>

            <Modal visible={fullscreen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setFullscreen(false)}>
                <StatusBar hidden />
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', justifyContent: 'center', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => setFullscreen(false)} style={{ position: 'absolute', top: Platform.OS === 'ios' ? 52 : 20, right: 18, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 8 }}>
                        <Text style={{ color: 'white', fontSize: 16, fontWeight: '700' }}>✕</Text>
                    </TouchableOpacity>
                    <ScrollView maximumZoomScale={4} minimumZoomScale={1} style={{ width, flex: 1 }} contentContainerStyle={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                        {timetableUrl && <Image source={{ uri: timetableUrl }} style={{ width: width - 16, height: undefined, aspectRatio: 1 }} resizeMode="contain" />}
                    </ScrollView>
                </View>
            </Modal>
        </>
    );
}

// ── Tab Switcher (reused inline + in sticky overlay) ─────────────────────────
function TabSwitcher({ activeTab, setActiveTab, theme }: { activeTab: 'batch' | 'subjects'; setActiveTab: (t: 'batch' | 'subjects') => void; theme: typeof LIGHT }) {
    // Sliding pill indicator (like web's framer-motion layoutId tab animation) —
    // one shared background pill that animates its position instead of each
    // button toggling its own background on/off.
    const [containerWidth, setContainerWidth] = useState(0);
    const indicatorPos = useRef(new Animated.Value(activeTab === 'batch' ? 0 : 1)).current;

    useEffect(() => {
        Animated.spring(indicatorPos, {
            toValue: activeTab === 'batch' ? 0 : 1,
            useNativeDriver: true,
            bounciness: 8,
            speed: 14,
        }).start();
    }, [activeTab]);

    const pillWidth = containerWidth > 8 ? (containerWidth - 8) / 2 : 0;
    const translateX = indicatorPos.interpolate({ inputRange: [0, 1], outputRange: [0, pillWidth] });

    return (
        <View
            style={[styles.mainTabRow, { backgroundColor: theme.card, borderColor: theme.cardBorder, marginHorizontal: 0, marginTop: 0, marginBottom: 0 }]}
            onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
            {pillWidth > 0 && (
                <Animated.View
                    style={{
                        position: 'absolute', top: 4, bottom: 4, left: 4,
                        width: pillWidth, borderRadius: 99, backgroundColor: theme.purple,
                        transform: [{ translateX }],
                    }}
                />
            )}
            {(['batch', 'subjects'] as const).map(tab => (
                <TouchableOpacity
                    key={tab}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab(tab); }}
                    style={styles.mainTab}
                >
                    <Text style={[styles.mainTabText, { color: activeTab === tab ? 'white' : theme.subText }]}>
                        {tab === 'batch' ? '📋 View' : '📚 Subjects'}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

// ── Animated Pill Toggle (sliding-indicator toggle, for unequal-width labels
//    like "Results"/"Materials" — same web-style animation as TabSwitcher above) ──
function AnimatedPillToggle<T extends string>({ options, activeKey, onChange, activeColor, theme }: {
    options: { key: T; label: string; emoji: string }[];
    activeKey: T;
    onChange: (key: T) => void;
    activeColor: string;
    theme: { subText: string; cardBorder: string; bg: string };
}) {
    const [layouts, setLayouts] = useState<Partial<Record<string, { x: number; width: number }>>>({});
    const activeLayout = layouts[activeKey];
    const translateX = useRef(new Animated.Value(0)).current;
    const widthAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!activeLayout) return;
        Animated.spring(translateX, { toValue: activeLayout.x, useNativeDriver: false, bounciness: 8, speed: 14 }).start();
        Animated.spring(widthAnim, { toValue: activeLayout.width, useNativeDriver: false, bounciness: 8, speed: 14 }).start();
    }, [activeKey, activeLayout?.x, activeLayout?.width]);

    return (
        <View style={{ flexDirection: 'row', backgroundColor: theme.bg, borderRadius: 15, padding: 2, borderWidth: 1, borderColor: theme.cardBorder, alignSelf: 'flex-start' }}>
            {activeLayout && (
                <Animated.View
                    style={{
                        position: 'absolute', top: 2, bottom: 2, left: 0,
                        width: widthAnim, borderRadius: 13, backgroundColor: activeColor,
                        transform: [{ translateX }],
                    }}
                />
            )}
            {options.map(o => {
                const active = o.key === activeKey;
                return (
                    <TouchableOpacity
                        key={o.key}
                        onLayout={(e) => {
                            const { x, width } = e.nativeEvent.layout;
                            setLayouts(prev => ({ ...prev, [o.key]: { x, width } }));
                        }}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange(o.key); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 13 }}
                        activeOpacity={0.85}
                    >
                        <Text style={{ fontSize: 10 }}>{o.emoji}</Text>
                        <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: active ? 'white' : theme.subText }}>{o.label}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

// ── Subject Chip Selector (reused inline-spacer + sticky-overlay) ────────────
function SubjectChipSelector({ subjects, activeSubjectIdx, setActiveSubjectIdx, theme }: {
    subjects: Subject[]; activeSubjectIdx: number; setActiveSubjectIdx: (i: number) => void; theme: typeof LIGHT;
}) {
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
            {subjects.map((sub, i) => {
                const active = i === activeSubjectIdx;
                return (
                    <TouchableOpacity key={sub.id} onPress={() => { Haptics.selectionAsync(); setActiveSubjectIdx(i); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: active ? sub.color : theme.cardBorder, backgroundColor: active ? sub.color + '20' : theme.card }}
                        activeOpacity={0.8}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sub.color }} />
                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: active ? sub.color : theme.subText }}>{sub.name}</Text>
                    </TouchableOpacity>
                );
            })}
        </ScrollView>
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Courses() {
    const { isDark } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const showEntryCover = useTabEntryCover();

    const [classData, setClassData] = useState<ClassData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [activeTab, setActiveTab] = useState<'batch' | 'subjects'>('batch');
    // Keep a tab's content mounted once visited, and just toggle its visibility afterwards.
    // Unmount/remount on every switch is what caused the noticeable lag (Subjects tab has a
    // LineChart + images, which are expensive to recreate every tap).
    const [hasVisitedSubjects, setHasVisitedSubjects] = useState(false);
    useEffect(() => { if (activeTab === 'subjects') setHasVisitedSubjects(true); }, [activeTab]);
    const [activeSubjectIdx, setActiveSubjectIdx] = useState(0);
    const [subjectCenterTab, setSubjectCenterTab] = useState<'results' | 'materials'>('results');
    const [lbMode, setLbMode] = useState<LbMode>('combined');
    const [subjLbMode, setSubjLbMode] = useState<LbMode>('combined');
    const [viewerFile, setViewerFile] = useState<ViewerFile | null>(null);
    const [chartTooltip, setChartTooltip] = useState<number | null>(null);
    useEffect(() => { setChartTooltip(null); }, [activeSubjectIdx]);

    // Sticky-toggle-on-scroll (manual, native-driver Animated — not stickyHeaderIndices,
    // which has a known Android bug where the stuck header stops receiving taps).
    // The overlay's translateY is animated frame-by-frame in native code (no React re-render
    // lag), so it tracks the scroll in perfect lockstep and "catches" at the top with zero pop.
    const scrollY = useRef(new Animated.Value(0)).current;
    const currentScrollY = useRef(0); // plain JS mirror of scrollY, for reading synchronously on tab switch
    const scrollRef = useRef<any>(null);
    const [switcherY, setSwitcherY] = useState(0);
    const overlayTranslateY = switcherY > 0
        ? scrollY.interpolate({ inputRange: [0, switcherY], outputRange: [switcherY, 0], extrapolate: 'clamp' })
        : 0;

    // Switching tabs: only snap scroll if we were already scrolled past the sticky-catch
    // point (switcherY) — in that case snap to exactly switcherY so the new tab's content
    // starts at its own top without re-revealing the banner. If we hadn't scrolled that far
    // yet, leave the scroll position alone — it's already showing the banner correctly.
    useEffect(() => {
        if (currentScrollY.current > switcherY) {
            scrollRef.current?.scrollTo({ y: switcherY, animated: false });
        }
    }, [activeTab]);

    const fetchData = useCallback(async () => {
        try {
            const res = await api.get('/student/class');
            setClassData(res.data.data);
        } catch { /* silent */ }
    }, []);

    useEffect(() => { fetchData().finally(() => setLoading(false)); }, []);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchData();
        setRefreshing(false);
    }, [fetchData]);

    const division = classData?.division;
    const classmates = classData?.classmates ?? [];
    const myScores = classData?.myScores ?? [];
    const subjects = division?.subjects ?? [];
    const subjectLeaderboards = classData?.subjectLeaderboards ?? {};
    const resultFiles = classData?.resultFiles ?? [];
    const subjectMaterials = classData?.subjectMaterials ?? {};
    const generalMaterials = classData?.generalMaterials ?? [];
    const resultsAndGeneralMaterials = [...resultFiles, ...generalMaterials];

    const top5 = [...classmates]
        .filter(c => getPct(c, lbMode) != null || c.rank != null)
        .sort((a, b) => (getPct(b, lbMode) ?? -1) - (getPct(a, lbMode) ?? -1))
        .slice(0, 5);

    const activeSubject = subjects[activeSubjectIdx];
    const activeScore = myScores.find(s => s.subjectId === activeSubject?.id);
    const activeSubjLeaderboard = activeSubject ? (subjectLeaderboards[activeSubject.id] ?? []) : [];
    const activeSubjMaterials = activeSubject ? (subjectMaterials[activeSubject.id] ?? []) : [];

    // Trend chart + "My Results" list follow the same offline/online/combined
    // toggle the subject leaderboard uses (subjLbMode), instead of always
    // showing the merged list.
    const activeModeColumns: ScoreCol[] = activeScore
        ? (subjLbMode === 'offline' ? activeScore.offlineColumns : subjLbMode === 'online' ? activeScore.onlineColumns : activeScore.columns)
        : [];
    // A column with no marks entered yet isn't a real data point — it must
    // not appear on the graph at all (not even as a 0%), unlike "My Results"
    // below which still lists it with a dash. Matches web's chartData filter.
    const chartCols = activeModeColumns.filter(c => !c.isAbsent && c.scored != null);
    const chartLabels = chartCols.map(c => c.name.replace('Unit Test', 'UT').replace('Online Test', 'OT').replace('Term Test', 'Term'));
    // X-axis labels must stay short — online test titles are free-typed by
    // teachers and can be long, which overlaps neighbouring labels on a
    // narrow mobile chart. Axis shows a clipped version; the tap tooltip
    // still shows the full label via chartLabels.
    const axisLabels = chartLabels.map(l => (l.length > 6 ? `${l.slice(0, 5)}…` : l));
    const chartValues = chartCols.map(c => Math.round(((c.scored ?? 0) / c.max) * 100));
    const hasChart = chartValues.length >= 1;

    const divLabel = division ? `${division.standardName} · ${formatDivision(division.name)}` : '—';

    return (
        <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: Constants.statusBarHeight }]}>
            <FileViewerModal file={viewerFile} onClose={() => setViewerFile(null)} />
            <ScreenHeader title="Class" />

            <View style={{ flex: 1, position: 'relative' }}>
            <Animated.ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                bounces={false}
                contentContainerStyle={{ paddingBottom: 2 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.muted} />}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: true, listener: (e: any) => { currentScrollY.current = e.nativeEvent.contentOffset.y; } }
                )}
                scrollEventThrottle={16}
            >
                {/* ── Banner (scrolls away normally) ── */}
                <View style={[styles.banner, { backgroundColor: isDark ? '#1A0A3E' : '#7C3AED' }]}>
                    <View style={styles.bannerOrb1} />
                    <View style={styles.bannerOrb2} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={styles.bannerIconBox}>
                            <BookOpen size={20} color="white" />
                        </View>
                        <View>
                            <Text style={styles.bannerTitle}>{divLabel}</Text>
                            <Text style={styles.bannerSub}>
                                {division?.classTeacherName ? `Class Teacher - ${division.classTeacherName}` : `${division?.totalStudents ?? classmates.length} Students`}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ── Tab switcher spacer (layout/measurement only — NOT interactive.
                     The overlay below is the sole tappable copy; keeping both touchable caused
                     overlapping hit-targets and made taps feel laggy/missed. ── */}
                <View
                    onLayout={(e) => setSwitcherY(e.nativeEvent.layout.y)}
                    pointerEvents="none"
                    style={{ backgroundColor: theme.bg, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 4 }}
                >
                    <TabSwitcher activeTab={activeTab} setActiveTab={setActiveTab} theme={theme} />
                    {activeTab === 'subjects' && subjects.length > 0 && (
                        <View style={{ marginTop: 6 }}>
                            <SubjectChipSelector subjects={subjects} activeSubjectIdx={activeSubjectIdx} setActiveSubjectIdx={setActiveSubjectIdx} theme={theme} />
                        </View>
                    )}
                </View>

                {loading ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
                        <ActivityIndicator size="large" color={theme.purple} />
                    </View>
                ) : (
                        <View style={styles.body}>

                            {/* ══ BATCH TAB ══ (always mounted — it's the default tab) */}
                            <View style={{ gap: 14, marginTop: -8, display: activeTab === 'batch' ? 'flex' : 'none' }}>
                                    {/* Timetable */}
                                    <TimetableImageCard theme={theme} isDark={isDark} timetableUrl={division?.timetableUrl ?? null} />

                                    {/* Subject teachers */}
                                    <Card theme={theme}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                            <GraduationCap size={17} color={theme.green} />
                                            <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>Teachers</Text>
                                        </View>
                                        {subjects.length === 0 && !division?.classTeacherName
                                            ? <Text style={{ fontSize: 12, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>No subjects assigned yet</Text>
                                            : <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                              <View style={{ gap: 8 }}>
                                                {division?.classTeacherName && (
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.cardBorder }}>
                                                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B' }} />
                                                        <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>Class Teacher</Text>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                            <Avatar name={division.classTeacherName} avatarUrl={division.classTeacherAvatarUrl} size={22} />
                                                            <Text style={{ fontSize: 11, color: theme.subText, fontFamily: 'Poppins_400Regular', maxWidth: 130 }} numberOfLines={1}>{division.classTeacherName}</Text>
                                                        </View>
                                                    </View>
                                                )}
                                                {subjects.map(sub => (
                                                    <View key={sub.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.cardBorder }}>
                                                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sub.color }} />
                                                        <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{sub.name}</Text>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                            <Avatar name={sub.teacherName} avatarUrl={sub.teacherAvatarUrl} size={22} />
                                                            <Text style={{ fontSize: 11, color: theme.subText, fontFamily: 'Poppins_400Regular', maxWidth: 130 }} numberOfLines={1}>{sub.teacherName}</Text>
                                                        </View>
                                                    </View>
                                                ))}
                                              </View>
                                              </ScrollView>
                                        }
                                    </Card>

                                    {/* Leaderboard with filter */}
                                    <Card theme={theme}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                                            <Trophy size={16} color={theme.amber} />
                                            <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text, flex: 1 }}>Leaderboard — Top 5</Text>
                                            <InlineWheel options={LB_MODE_OPTIONS} value={lbMode} onChange={(v) => setLbMode(v as LbMode)} isDark={isDark} theme={theme} />
                                        </View>
                                        <View style={{ marginTop: 12 }}>

                                            {top5.length === 0
                                                ? <Text style={{ fontSize: 12, color: theme.muted, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingVertical: 16 }}>Leaderboard available once marks are published</Text>
                                                : (
                                                    <>
                                                        {/* Podium (top 3) */}
                                                        {top5.length >= 3 && (
                                                            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 12, marginBottom: 14 }}>
                                                                {[top5[1], top5[0], top5[2]].map((s, i) => {
                                                                    const cfg = [
                                                                        { height: 64, color: '#C0C0C0', medal: '🥈' },
                                                                        { height: 96, color: '#F59E0B', medal: '🥇' },
                                                                        { height: 48, color: '#CD7F32', medal: '🥉' },
                                                                    ][i];
                                                                    const pct = getPct(s, lbMode);
                                                                    return (
                                                                        <View key={s.id} style={{ alignItems: 'center', gap: 4 }}>
                                                                            <Avatar name={s.name} avatarUrl={s.avatarUrl} size={i === 1 ? 44 : 36} />
                                                                            <View style={{ width: 66 }}>
                                                                                <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: theme.text, textAlign: 'center', lineHeight: 12 }} numberOfLines={1}>{s.name.split(' ')[0]}</Text>
                                                                                <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: theme.text, textAlign: 'center', lineHeight: 11, marginTop: 0 }} numberOfLines={1}>{s.name.split(' ').slice(1).join(' ')}</Text>
                                                                            </View>
                                                                            {s.isMe && (
                                                                                <View style={{ backgroundColor: theme.purple + '20', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 99 }}>
                                                                                    <Text style={{ fontSize: 8, fontFamily: 'Poppins_700Bold', color: theme.purple }}>You</Text>
                                                                                </View>
                                                                            )}
                                                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: cfg.color }}>{pct != null ? `${pct}%` : '—'}</Text>
                                                                            <View style={{ height: cfg.height, width: 52, backgroundColor: cfg.color, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                                                                                <Text style={{ fontSize: 22 }}>{cfg.medal}</Text>
                                                                            </View>
                                                                        </View>
                                                                    );
                                                                })}
                                                            </View>
                                                        )}

                                                        {/* 4th & 5th */}
                                                        <View style={{ gap: 8 }}>
                                                            {top5.slice(3).map((s, i) => {
                                                                const pct = getPct(s, lbMode);
                                                                return (
                                                                    <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: s.isMe ? (isDark ? '#2D1F50' : '#EDE9FE') : theme.bg, borderRadius: 14, borderWidth: 1, borderColor: s.isMe ? theme.purple + '50' : theme.cardBorder }}>
                                                                        <Text style={{ fontSize: 16, width: 28, textAlign: 'center' }}>{i === 0 ? '4️⃣' : '5️⃣'}</Text>
                                                                        <Avatar name={s.name} avatarUrl={s.avatarUrl} size={34} />
                                                                        <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: s.isMe ? theme.purple : theme.text }} numberOfLines={1}>{s.name}{s.isMe ? ' (You)' : ''}</Text>
                                                                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: theme.purple }}>{pct != null ? `${pct}%` : '—'}</Text>
                                                                    </View>
                                                                );
                                                            })}
                                                        </View>
                                                    </>
                                                )
                                            }
                                        </View>
                                    </Card>

                                    {/* Results files */}
                                    <Card theme={theme}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                            <FileText size={16} color={theme.red} />
                                            <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>Results &amp; Materials</Text>
                                        </View>
                                        {resultsAndGeneralMaterials.length === 0 ? (
                                            <Text style={{ fontSize: 12, color: theme.muted, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingVertical: 8 }}>No results or materials yet</Text>
                                        ) : (
                                            <ScrollView
                                                style={{ maxHeight: 264 }}
                                                nestedScrollEnabled
                                                showsVerticalScrollIndicator={false}
                                            >
                                                <View style={{ gap: 8 }}>
                                                    {resultsAndGeneralMaterials.map(f => (
                                                        <TouchableOpacity key={f.id}
                                                            onPress={() => f.attachmentUrl && setViewerFile({ title: f.title, url: f.attachmentUrl, type: f.attachmentType })}
                                                            activeOpacity={f.attachmentUrl ? 0.75 : 1}
                                                            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: theme.bg, borderRadius: 14, borderWidth: 1, borderColor: theme.cardBorder }}>
                                                            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? '#2B0D0D' : '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
                                                                <FileText size={18} color={theme.red} />
                                                            </View>
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{f.title}</Text>
                                                                <Text style={{ fontSize: 10, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>
                                                                    {f.postedBy} · {new Date(f.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                                </Text>
                                                            </View>
                                                            {f.attachmentUrl && <Eye size={14} color={theme.muted} />}
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                            </ScrollView>
                                        )}
                                    </Card>

                                    {/* Classmates list */}
                                    <Card theme={theme}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                            <Users size={16} color={theme.purple} />
                                            <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text, flex: 1 }}>Classmates</Text>
                                            <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>{classmates.length} students</Text>
                                        </View>
                                        {classmates.length === 0
                                            ? <Text style={{ fontSize: 12, color: theme.muted, textAlign: 'center', paddingVertical: 16 }}>No classmates found</Text>
                                            : (
                                                <ScrollView
                                                    style={{ maxHeight: 342 }}
                                                    nestedScrollEnabled
                                                    showsVerticalScrollIndicator={false}
                                                >
                                                    <View style={{ gap: 6 }}>
                                                        {classmates.map(s => (
                                                            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: s.isMe ? (isDark ? '#2D1F50' : '#EDE9FE') : theme.bg, borderRadius: 12, borderWidth: 1, borderColor: s.isMe ? theme.purple + '40' : 'transparent' }}>
                                                                <Avatar name={s.name} avatarUrl={s.avatarUrl} size={32} />
                                                                <View style={{ flex: 1 }}>
                                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: s.isMe ? theme.purple : theme.text }} numberOfLines={1}>{s.name}</Text>
                                                                        {s.isMe && (
                                                                            <View style={{ backgroundColor: theme.purple + '20', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 99 }}>
                                                                                <Text style={{ fontSize: 8, fontFamily: 'Poppins_700Bold', color: theme.purple }}>You</Text>
                                                                            </View>
                                                                        )}
                                                                    </View>
                                                                    <Text style={{ fontSize: 10, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>Roll {s.rollNo}</Text>
                                                                </View>
                                                                {s.rank != null && (
                                                                    <View style={{ alignItems: 'center' }}>
                                                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: s.rank === 1 ? '#F59E0B' : s.rank === 2 ? '#94A3B8' : s.rank === 3 ? '#CD7C2F' : theme.purple }}>
                                                                            #{s.rank}
                                                                        </Text>
                                                                        <Text style={{ fontSize: 10, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>rank</Text>
                                                                    </View>
                                                                )}
                                                            </View>
                                                        ))}
                                                    </View>
                                                </ScrollView>
                                            )
                                        }
                                    </Card>
                                </View>

                            {/* ══ SUBJECTS TAB ══ (mounted after first visit, then kept alive) */}
                            {hasVisitedSubjects && (
                                <View style={{ gap: 14, marginTop: -8, display: activeTab === 'subjects' ? 'flex' : 'none' }}>
                                    {subjects.length === 0
                                        ? (
                                            <Card theme={theme}>
                                                <Text style={{ fontSize: 13, color: theme.muted, textAlign: 'center', paddingVertical: 20 }}>No subjects assigned to your division yet.</Text>
                                            </Card>
                                        )
                                        : (
                                            <>
                                                {activeSubject && (
                                                    <>
                                                        {/* Teacher + score card */}
                                                        <Card theme={theme}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                                                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: activeSubject.color, alignItems: 'center', justifyContent: 'center' }}>
                                                                    <Text style={{ fontSize: 15, fontFamily: 'Poppins_800ExtraBold', color: 'white' }}>{activeSubject.code || activeSubject.name.slice(0, 2).toUpperCase()}</Text>
                                                                </View>
                                                                <View style={{ flex: 1 }}>
                                                                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>{activeSubject.name}</Text>
                                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                                                        <Avatar name={activeSubject.teacherName} avatarUrl={activeSubject.teacherAvatarUrl} size={18} />
                                                                        <Text style={{ fontSize: 11, color: theme.subText, fontFamily: 'Poppins_400Regular' }}>{activeSubject.teacherName}</Text>
                                                                    </View>
                                                                </View>
                                                            </View>
                                                        </Card>

                                                        {/* Per-subject leaderboard */}
                                                        <Card theme={theme}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                                                                <Trophy size={15} color={theme.amber} />
                                                                <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text, flex: 1 }}>{activeSubject.name} — Top 5</Text>
                                                                <InlineWheel options={LB_MODE_OPTIONS} value={subjLbMode} onChange={(v) => setSubjLbMode(v as LbMode)} isDark={isDark} theme={theme} />
                                                            </View>
                                                            <View style={{ marginTop: 10, gap: 8 }}>
                                                                {activeSubjLeaderboard.length === 0
                                                                    ? <Text style={{ fontSize: 12, color: theme.muted, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingVertical: 12 }}>No results published yet</Text>
                                                                    : activeSubjLeaderboard.map((e, i) => {
                                                                        const pct = getLbPct(e, subjLbMode);
                                                                        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                                                                        return (
                                                                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: e.isMe ? (isDark ? '#2D1F50' : '#EDE9FE') : theme.bg, borderRadius: 12, borderWidth: 1, borderColor: e.isMe ? theme.purple + '50' : theme.cardBorder }}>
                                                                                <Text style={{ fontSize: medal ? 18 : 12, width: 28, textAlign: 'center', fontFamily: 'Poppins_700Bold', color: theme.muted }}>{medal ?? `#${i + 1}`}</Text>
                                                                                <Avatar name={e.name} avatarUrl={e.avatarUrl} size={30} />
                                                                                <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: e.isMe ? theme.purple : theme.text }} numberOfLines={1}>{e.name.split(' ')[0]}{e.isMe ? ' (You)' : ''}</Text>
                                                                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: i === 0 ? '#F59E0B' : i === 1 ? '#94A3B8' : i === 2 ? '#CD7F32' : activeSubject.color }}>{pct != null ? `${pct}%` : '—'}</Text>
                                                                            </View>
                                                                        );
                                                                    })
                                                                }
                                                            </View>
                                                        </Card>

                                                        {/* Results / Materials — one card, toggle inside at the top (matches web) */}
                                                        <Card theme={theme}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
                                                                <AnimatedPillToggle
                                                                    options={[
                                                                        { key: 'results' as const, label: 'Results', emoji: '📊' },
                                                                        { key: 'materials' as const, label: 'Materials', emoji: '📄' },
                                                                    ]}
                                                                    activeKey={subjectCenterTab}
                                                                    onChange={setSubjectCenterTab}
                                                                    activeColor={activeSubject.color}
                                                                    theme={theme}
                                                                />
                                                                {subjectCenterTab === 'results' && (
                                                                    <InlineWheel options={LB_MODE_OPTIONS} value={subjLbMode} onChange={(v) => setSubjLbMode(v as LbMode)} isDark={isDark} theme={theme} />
                                                                )}
                                                            </View>

                                                            <View style={{ minHeight: 480 }}>
                                                            {subjectCenterTab === 'results' ? (
                                                                !activeScore ? (
                                                                    <Text style={{ fontSize: 12, color: theme.muted, textAlign: 'center', paddingVertical: 16 }}>Marks not published yet</Text>
                                                                ) : (
                                                                    <>
                                                                        {hasChart && (
                                                                            <>
                                                                                <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text, marginBottom: 4 }}>Performance Trend</Text>
                                                                                <View style={{ position: 'relative' }}>
                                                                                <LineChart
                                                                                    renderDotContent={({ x, y, index, indexData }) => {
                                                                                        const max = Math.max(...chartValues);
                                                                                        const min = Math.min(...chartValues);
                                                                                        if (chartTooltip === index) {
                                                                                            const chartWidth = width - 80;
                                                                                            const tooltipW = 60;
                                                                                            const clampedLeft = Math.max(2, Math.min(x - tooltipW / 2, chartWidth - tooltipW - 2));
                                                                                            const showBelow = y - 38 < 4;
                                                                                            return (
                                                                                                <View
                                                                                                    key={index}
                                                                                                    style={{
                                                                                                        position: 'absolute',
                                                                                                        top: showBelow ? y + 10 : y - 38,
                                                                                                        left: clampedLeft,
                                                                                                        backgroundColor: theme.text,
                                                                                                        paddingHorizontal: 8,
                                                                                                        paddingVertical: 5,
                                                                                                        borderRadius: 6,
                                                                                                        alignItems: 'center',
                                                                                                        minWidth: 52,
                                                                                                    }}
                                                                                                >
                                                                                                    <Text style={{ fontSize: 9, color: theme.card, fontFamily: 'Poppins_600SemiBold' }} numberOfLines={1}>
                                                                                                        {chartLabels[index]}
                                                                                                    </Text>
                                                                                                    <Text style={{ fontSize: 11, color: theme.card, fontFamily: 'Poppins_700Bold' }}>
                                                                                                        {indexData}%
                                                                                                    </Text>
                                                                                                </View>
                                                                                            );
                                                                                        }
                                                                                        if (indexData !== max && indexData !== min) return null;
                                                                                        const isMin = indexData === min;
                                                                                        return (
                                                                                            <View key={index} style={{ position: 'absolute', top: isMin ? y + 6 : y - 22, left: x - 12, backgroundColor: isMin ? theme.red : theme.green, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 }}>
                                                                                                <Text style={{ fontSize: 9, color: 'white', fontFamily: 'Poppins_600SemiBold' }}>{indexData}%</Text>
                                                                                            </View>
                                                                                        );
                                                                                    }}
                                                                                    onDataPointClick={({ index }) => {
                                                                                        setChartTooltip(prev => prev === index ? null : index);
                                                                                    }}
                                                                                    data={{ labels: axisLabels, datasets: [{ data: chartValues, color: () => activeSubject.color, strokeWidth: 2 }] }}
                                                                                    width={width - 80}
                                                                                    height={180}
                                                                                    yAxisSuffix="%"
                                                                                    chartConfig={{
                                                                                        backgroundColor: 'transparent',
                                                                                        backgroundGradientFrom: theme.card,
                                                                                        backgroundGradientTo: theme.card,
                                                                                        decimalPlaces: 0,
                                                                                        color: () => activeSubject.color,
                                                                                        fillShadowGradient: activeSubject.color,
                                                                                        fillShadowGradientOpacity: 0.15,
                                                                                        labelColor: () => theme.subText,
                                                                                        propsForDots: { r: '4', strokeWidth: '2', stroke: theme.card, fill: activeSubject.color },
                                                                                        propsForBackgroundLines: { stroke: theme.cardBorder, strokeWidth: 1, strokeDasharray: '' },
                                                                                        propsForLabels: { fontSize: 9, fontFamily: 'Poppins_400Regular' },
                                                                                    }}
                                                                                    bezier
                                                                                    style={{ borderRadius: 12, marginLeft: -16, marginBottom: 4 }}
                                                                                    fromZero
                                                                                    withInnerLines
                                                                                    withHorizontalLabels
                                                                                    segments={5}
                                                                                />
                                                                                {/* Explicit tap targets — chart-kit's own SVG onPress only
                                                                                    registers on an exact dot hit, so we detect column taps
                                                                                    ourselves (same fix as the attendance chart on Profile). */}
                                                                                {/* Tap zones are centered on chart-kit's actual x-axis label
                                                                                    positions (paddingRight gutter + i * binWidth, chart-kit's
                                                                                    own formula) rather than a naive equal split of the full
                                                                                    width — the y-axis number gutter on the left otherwise
                                                                                    throws off a plain flex division, so taps landed on the
                                                                                    wrong (truncated) label. This is what makes tapping a
                                                                                    clipped title reliably reveal its full name below. */}
                                                                                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                                                                                    {(() => {
                                                                                        const chartAreaWidth = width - 80;
                                                                                        const gutter = 64; // chart-kit's default y-axis label gutter (paddingRight)
                                                                                        const n = axisLabels.length;
                                                                                        const binWidth = n > 0 ? (chartAreaWidth - gutter) / n : 0;
                                                                                        const tapWidth = Math.max(28, Math.min(binWidth, 56));
                                                                                        return axisLabels.map((_, i) => {
                                                                                            const cx = gutter + i * binWidth;
                                                                                            return (
                                                                                                <TouchableOpacity
                                                                                                    key={i}
                                                                                                    activeOpacity={1}
                                                                                                    style={{ position: 'absolute', top: 0, bottom: 0, left: cx - tapWidth / 2, width: tapWidth }}
                                                                                                    onPress={() => setChartTooltip(prev => prev === i ? null : i)}
                                                                                                />
                                                                                            );
                                                                                        });
                                                                                    })()}
                                                                                </View>
                                                                                </View>
                                                                            </>
                                                                        )}

                                                                        {activeModeColumns.length > 0 && (
                                                                            <View style={{ marginTop: hasChart ? 16 : 0 }}>
                                                                                <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text, marginBottom: 12 }}>My Results</Text>
                                                                                <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                                                                <View style={{ gap: 10 }}>
                                                                                    {activeModeColumns.map((col, i) => {
                                                                                        const pct = col.isAbsent ? null : col.scored != null ? Math.round((col.scored / col.max) * 100) : null;
                                                                                        const color = pct == null ? theme.muted : pct >= 75 ? theme.green : pct >= 40 ? theme.amber : theme.red;
                                                                                        return (
                                                                                            <View key={i} style={{ padding: 12, backgroundColor: theme.bg, borderRadius: 14, borderWidth: 1, borderColor: theme.cardBorder, gap: 8 }}>
                                                                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                                                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text, flex: 1 }} numberOfLines={1}>{col.name}</Text>
                                                                                                    {col.isAbsent
                                                                                                        ? <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: theme.red, backgroundColor: theme.red + '20', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99 }}>Absent</Text>
                                                                                                        : (
                                                                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                                                                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: theme.muted }}>{col.scored}/{col.max}</Text>
                                                                                                                {pct != null && <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color, backgroundColor: color + '25', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99 }}>{pct}%</Text>}
                                                                                                            </View>
                                                                                                        )
                                                                                                    }
                                                                                                </View>
                                                                                                {!col.isAbsent && pct != null && (
                                                                                                    <View style={{ height: 4, borderRadius: 99, backgroundColor: theme.cardBorder, overflow: 'hidden' }}>
                                                                                                        <View style={{ height: '100%', width: `${pct}%`, borderRadius: 99, backgroundColor: color }} />
                                                                                                    </View>
                                                                                                )}
                                                                                            </View>
                                                                                        );
                                                                                    })}
                                                                                </View>
                                                                                </ScrollView>
                                                                            </View>
                                                                        )}
                                                                        {activeModeColumns.length === 0 && (
                                                                            <Text style={{ fontSize: 12, color: theme.muted, textAlign: 'center', paddingVertical: 16 }}>
                                                                                {subjLbMode === 'online' ? 'No completed tests yet' : subjLbMode === 'offline' ? 'No offline marks yet' : 'No results yet'}
                                                                            </Text>
                                                                        )}
                                                                    </>
                                                                )
                                                            ) : (
                                                                activeSubjMaterials.length === 0 ? (
                                                                    <Text style={{ fontSize: 12, color: theme.muted, textAlign: 'center', paddingVertical: 16 }}>No materials uploaded yet</Text>
                                                                ) : (
                                                                    <View style={{ gap: 8 }}>
                                                                        {activeSubjMaterials.map(m => (
                                                                            <TouchableOpacity key={m.id}
                                                                                onPress={() => m.attachmentUrl && setViewerFile({ title: m.title, url: m.attachmentUrl, type: m.attachmentType })}
                                                                                activeOpacity={m.attachmentUrl ? 0.75 : 1}
                                                                                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: theme.bg, borderRadius: 12, borderWidth: 1, borderColor: theme.cardBorder }}>
                                                                                <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: activeSubject.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                                                                                    <FileText size={16} color={activeSubject.color} />
                                                                                </View>
                                                                                <View style={{ flex: 1 }}>
                                                                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }} numberOfLines={1}>{m.title}</Text>
                                                                                    <Text style={{ fontSize: 10, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>
                                                                                        {m.postedBy} · {new Date(m.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                                                    </Text>
                                                                                </View>
                                                                                {m.attachmentUrl && <Eye size={13} color={theme.muted} />}
                                                                            </TouchableOpacity>
                                                                        ))}
                                                                    </View>
                                                                )
                                                            )}
                                                            </View>
                                                        </Card>
                                                    </>
                                                )}
                                            </>
                                        )
                                    }
                                </View>
                            )}
                        </View>
                )}
            </Animated.ScrollView>

            {/* ── Sticky overlay: a real, separate, always-tappable copy of the switcher.
                 Its translateY is driven by the native-animated interpolation above, so it
                 tracks the scroll in perfect lockstep — moves with content, then "catches"
                 and holds at the top with zero pop, and (unlike stickyHeaderIndices) still
                 receives taps reliably. ── */}
            {switcherY > 0 && (
                <Animated.View
                    style={{
                        position: 'absolute', top: 0, left: 0, right: 0,
                        transform: [{ translateY: overlayTranslateY }],
                        backgroundColor: theme.bg, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 4,
                    }}
                >
                    <TabSwitcher activeTab={activeTab} setActiveTab={setActiveTab} theme={theme} />
                    {activeTab === 'subjects' && subjects.length > 0 && (
                        <View style={{ marginTop: 6 }}>
                            <SubjectChipSelector subjects={subjects} activeSubjectIdx={activeSubjectIdx} setActiveSubjectIdx={setActiveSubjectIdx} theme={theme} />
                        </View>
                    )}
                </Animated.View>
            )}
            <TabEntryCover visible={showEntryCover} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    banner: { marginHorizontal: 14, marginTop: 4, borderRadius: 20, padding: 18, overflow: 'hidden', marginBottom: 4 },
    bannerOrb1: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.06)', top: -30, right: -20 },
    bannerOrb2: { position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.04)', top: 40, right: 30 },
    bannerIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
    bannerTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: 'white' },
    bannerSub: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.7)' },
    mainTabRow: { flexDirection: 'row', marginHorizontal: 14, marginTop: 12, marginBottom: 4, borderRadius: 99, padding: 4, borderWidth: 1 },
    mainTab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 99 },
    mainTabText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
    body: { padding: 14, gap: 14 },
});
