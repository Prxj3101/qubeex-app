import { ScreenHeader } from '@/components/ScreenHeader';
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
    Trophy,
    Users,
    FileText,
    X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
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
import { SafeAreaView } from 'react-native-safe-area-context';

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
    id: string; name: string; code: string; color: string; teacherName: string;
}
interface Classmate {
    id: string; name: string; rollNo: string;
    rank: number | null; attendancePct: number | null;
    marksPct: number | null; offlinePct: number | null; onlinePct: number | null;
    isMe: boolean;
}
interface SubjectScore {
    subjectId: string; subjectName: string; subjectCode: string; subjectColor: string;
    columns: { name: string; scored: number | null; max: number; isAbsent: boolean }[];
    totalScored: number; totalMax: number; pct: number | null;
}
interface LbEntry {
    name: string; combinedPct: number; offlinePct: number | null; onlinePct: number | null; isMe: boolean;
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
    division: { id: string; name: string; standardName: string; classTeacherName: string | null; totalStudents: number; subjects: Subject[] } | null;
    resultFiles: ResultFile[];
    subjectMaterials: Record<string, MaterialFile[]>;
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
function Avatar({ name, size }: { name: string; size: number }) {
    const bg = getAvatarBg(name);
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

// ── LB Mode Filter ────────────────────────────────────────────────────────────
function LbFilter({ mode, onChange, theme }: { mode: LbMode; onChange: (m: LbMode) => void; theme: typeof LIGHT }) {
    const tabs: { key: LbMode; label: string }[] = [
        { key: 'offline', label: 'Offline' },
        { key: 'online', label: 'Online' },
        { key: 'combined', label: 'Combined' },
    ];
    return (
        <View style={{ flexDirection: 'row', backgroundColor: theme.cardBorder, borderRadius: 99, padding: 2, alignSelf: 'flex-start' }}>
            {tabs.map(t => (
                <TouchableOpacity key={t.key} onPress={() => { Haptics.selectionAsync(); onChange(t.key); }}
                    style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: mode === t.key ? theme.purple : 'transparent' }}
                    activeOpacity={0.8}>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: mode === t.key ? 'white' : theme.subText }}>{t.label}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

// ── Timetable Card ────────────────────────────────────────────────────────────
const TIMETABLE_IMAGE = require('../../assets/images/timetable.jpeg');
function TimetableImageCard({ theme, isDark }: { theme: typeof LIGHT; isDark: boolean }) {
    const [fullscreen, setFullscreen] = useState(false);
    const [downloadMsg, setDownloadMsg] = useState('');

    const handleDownload = async () => {
        try {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') { setDownloadMsg('Permission denied'); setTimeout(() => setDownloadMsg(''), 2500); return; }
            const asset = Image.resolveAssetSource(TIMETABLE_IMAGE);
            const fileUri = FileSystem.documentDirectory + 'timetable.jpeg';
            await FileSystem.downloadAsync(asset.uri, fileUri);
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
                    <TouchableOpacity onPress={handleDownload} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.purpleLight, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 }} activeOpacity={0.75}>
                        <Download size={13} color={theme.purple} />
                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.purple }}>Save</Text>
                    </TouchableOpacity>
                </View>
                {downloadMsg ? (
                    <View style={{ marginHorizontal: 14, marginBottom: 8, backgroundColor: isDark ? '#0D2B20' : '#D1FAE5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}>
                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: isDark ? '#34D399' : '#065F46' }}>{downloadMsg}</Text>
                    </View>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginHorizontal: 14, marginBottom: 8 }}>
                    <Eye size={12} color={theme.muted} />
                    <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>Tap image to view full screen</Text>
                </View>
                <TouchableOpacity onPress={() => setFullscreen(true)} activeOpacity={0.9} style={{ marginHorizontal: 14, marginBottom: 14 }}>
                    <Image source={TIMETABLE_IMAGE} style={{ width: '100%', height: undefined, aspectRatio: 1, borderRadius: 14 }} resizeMode="contain" />
                    <View style={{ position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: 6 }}>
                        <Eye size={16} color="white" />
                    </View>
                </TouchableOpacity>
            </View>

            <Modal visible={fullscreen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setFullscreen(false)}>
                <StatusBar hidden />
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', justifyContent: 'center', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => setFullscreen(false)} style={{ position: 'absolute', top: Platform.OS === 'ios' ? 52 : 20, right: 18, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 8 }}>
                        <Text style={{ color: 'white', fontSize: 16, fontWeight: '700' }}>✕</Text>
                    </TouchableOpacity>
                    <ScrollView maximumZoomScale={4} minimumZoomScale={1} style={{ width, flex: 1 }} contentContainerStyle={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                        <Image source={TIMETABLE_IMAGE} style={{ width: width - 16, height: undefined, aspectRatio: 1 }} resizeMode="contain" />
                    </ScrollView>
                </View>
            </Modal>
        </>
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Courses() {
    const { isDark } = useTheme();
    const theme = isDark ? DARK : LIGHT;

    const [classData, setClassData] = useState<ClassData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [activeTab, setActiveTab] = useState<'batch' | 'subjects'>('batch');
    const [activeSubjectIdx, setActiveSubjectIdx] = useState(0);
    const [lbMode, setLbMode] = useState<LbMode>('combined');
    const [subjLbMode, setSubjLbMode] = useState<LbMode>('combined');
    const [viewerFile, setViewerFile] = useState<ViewerFile | null>(null);

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

    const top5 = [...classmates]
        .filter(c => getPct(c, lbMode) != null || c.rank != null)
        .sort((a, b) => (getPct(b, lbMode) ?? -1) - (getPct(a, lbMode) ?? -1))
        .slice(0, 5);

    const activeSubject = subjects[activeSubjectIdx];
    const activeScore = myScores.find(s => s.subjectId === activeSubject?.id);
    const activeSubjLeaderboard = activeSubject ? (subjectLeaderboards[activeSubject.id] ?? []) : [];
    const activeSubjMaterials = activeSubject ? (subjectMaterials[activeSubject.id] ?? []) : [];

    const chartLabels = (activeScore?.columns ?? []).map(c => c.name.replace('Unit Test', 'UT').replace('Online Test', 'OT').replace('Term Test', 'Term'));
    const chartValues = (activeScore?.columns ?? []).map(c => c.isAbsent ? 0 : c.scored != null ? Math.round((c.scored / c.max) * 100) : 0);
    const hasChart = chartValues.length >= 2;

    const divLabel = division ? `${division.standardName} · ${formatDivision(division.name)}` : '—';

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
            <FileViewerModal file={viewerFile} onClose={() => setViewerFile(null)} />
            <ScreenHeader title="Class" />
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 30 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.muted} />}
            >
                {loading ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
                        <ActivityIndicator size="large" color={theme.purple} />
                    </View>
                ) : (
                    <>
                        {/* ── Banner ── */}
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
                                        {division?.totalStudents ?? classmates.length} Students
                                        {division?.classTeacherName ? ` · ${division.classTeacherName}` : ''}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* ── Tab switcher ── */}
                        <View style={[styles.mainTabRow, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                            {(['batch', 'subjects'] as const).map(tab => (
                                <TouchableOpacity
                                    key={tab}
                                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab(tab); }}
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
                                    {/* Timetable */}
                                    <TimetableImageCard theme={theme} isDark={isDark} />

                                    {/* Subject teachers */}
                                    <Card theme={theme}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                            <BookOpen size={16} color={theme.purple} />
                                            <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>Subject Teachers</Text>
                                        </View>
                                        {subjects.length === 0
                                            ? <Text style={{ fontSize: 12, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>No subjects assigned yet</Text>
                                            : <View style={{ gap: 8 }}>
                                                {subjects.map(sub => (
                                                    <View key={sub.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.cardBorder }}>
                                                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sub.color }} />
                                                        <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{sub.name}</Text>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                            <Avatar name={sub.teacherName} size={22} />
                                                            <Text style={{ fontSize: 11, color: theme.subText, fontFamily: 'Poppins_400Regular', maxWidth: 130 }} numberOfLines={1}>{sub.teacherName}</Text>
                                                        </View>
                                                    </View>
                                                ))}
                                            </View>
                                        }
                                    </Card>

                                    {/* Leaderboard with filter */}
                                    <Card theme={theme}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                                            <Trophy size={16} color={theme.amber} />
                                            <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text, flex: 1 }}>Leaderboard — Top 5</Text>
                                        </View>
                                        <LbFilter mode={lbMode} onChange={setLbMode} theme={theme} />
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
                                                                            <Avatar name={s.name} size={i === 1 ? 44 : 36} />
                                                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.text, width: 66, textAlign: 'center' }} numberOfLines={2}>{s.name.split(' ')[0]}</Text>
                                                                            {s.isMe && <Text style={{ fontSize: 8, fontFamily: 'Poppins_700Bold', color: theme.purple }}>YOU</Text>}
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
                                                                        <Avatar name={s.name} size={34} />
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
                                            <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>Results</Text>
                                        </View>
                                        {resultFiles.length === 0 ? (
                                            <Text style={{ fontSize: 12, color: theme.muted, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingVertical: 8 }}>No published results yet</Text>
                                        ) : (
                                            <View style={{ gap: 8 }}>
                                                {resultFiles.map(f => (
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
                                            : <View style={{ gap: 6 }}>
                                                {classmates.map(s => (
                                                    <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: s.isMe ? (isDark ? '#2D1F50' : '#EDE9FE') : theme.bg, borderRadius: 12, borderWidth: 1, borderColor: s.isMe ? theme.purple + '40' : 'transparent' }}>
                                                        <Avatar name={s.name} size={32} />
                                                        <View style={{ flex: 1 }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: s.isMe ? theme.purple : theme.text }} numberOfLines={1}>{s.name}</Text>
                                                                {s.isMe && <Text style={{ fontSize: 8, fontFamily: 'Poppins_700Bold', color: theme.purple, backgroundColor: theme.purpleLight, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}>YOU</Text>}
                                                            </View>
                                                            <Text style={{ fontSize: 10, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>Roll {s.rollNo}</Text>
                                                        </View>
                                                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                                                            {s.rank != null && <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: theme.purple }}>#{s.rank}</Text>}
                                                            {s.attendancePct != null && <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: s.attendancePct >= 75 ? theme.green : theme.red }}>{s.attendancePct}% att</Text>}
                                                        </View>
                                                    </View>
                                                ))}
                                            </View>
                                        }
                                    </Card>
                                </View>
                            )}

                            {/* ══ SUBJECTS TAB ══ */}
                            {activeTab === 'subjects' && (
                                <View style={{ gap: 14 }}>
                                    {subjects.length === 0
                                        ? (
                                            <Card theme={theme}>
                                                <Text style={{ fontSize: 13, color: theme.muted, textAlign: 'center', paddingVertical: 20 }}>No subjects assigned to your division yet.</Text>
                                            </Card>
                                        )
                                        : (
                                            <>
                                                {/* Subject chip selector */}
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

                                                {activeSubject && (
                                                    <>
                                                        {/* Teacher + score card */}
                                                        <Card theme={theme}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                                                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: activeSubject.color + '20', borderWidth: 1.5, borderColor: activeSubject.color, alignItems: 'center', justifyContent: 'center' }}>
                                                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: activeSubject.color }}>{activeSubject.code}</Text>
                                                                </View>
                                                                <View style={{ flex: 1 }}>
                                                                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>{activeSubject.name}</Text>
                                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                                                        <Avatar name={activeSubject.teacherName} size={18} />
                                                                        <Text style={{ fontSize: 11, color: theme.subText, fontFamily: 'Poppins_400Regular' }}>{activeSubject.teacherName}</Text>
                                                                    </View>
                                                                </View>
                                                                {activeScore && (
                                                                    <View style={{ alignItems: 'flex-end' }}>
                                                                        <Text style={{ fontSize: 22, fontFamily: 'Poppins_800ExtraBold', color: activeSubject.color }}>{activeScore.pct != null ? `${activeScore.pct}%` : '—'}</Text>
                                                                        <Text style={{ fontSize: 10, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>{activeScore.totalScored}/{activeScore.totalMax}</Text>
                                                                    </View>
                                                                )}
                                                            </View>
                                                        </Card>

                                                        {/* Per-subject leaderboard */}
                                                        <Card theme={theme}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                                                                <Trophy size={15} color={theme.amber} />
                                                                <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text, flex: 1 }}>{activeSubject.code} — Top 5</Text>
                                                            </View>
                                                            <LbFilter mode={subjLbMode} onChange={setSubjLbMode} theme={theme} />
                                                            <View style={{ marginTop: 10, gap: 8 }}>
                                                                {activeSubjLeaderboard.length === 0
                                                                    ? <Text style={{ fontSize: 12, color: theme.muted, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingVertical: 12 }}>No results published yet</Text>
                                                                    : activeSubjLeaderboard.map((e, i) => {
                                                                        const pct = getLbPct(e, subjLbMode);
                                                                        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                                                                        return (
                                                                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: e.isMe ? (isDark ? '#2D1F50' : '#EDE9FE') : theme.bg, borderRadius: 12, borderWidth: 1, borderColor: e.isMe ? theme.purple + '50' : theme.cardBorder }}>
                                                                                <Text style={{ fontSize: medal ? 18 : 12, width: 28, textAlign: 'center', fontFamily: 'Poppins_700Bold', color: theme.muted }}>{medal ?? `#${i + 1}`}</Text>
                                                                                <Avatar name={e.name} size={30} />
                                                                                <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: e.isMe ? theme.purple : theme.text }} numberOfLines={1}>{e.name.split(' ')[0]}{e.isMe ? ' (You)' : ''}</Text>
                                                                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: activeSubject.color }}>{pct != null ? `${pct}%` : '—'}</Text>
                                                                            </View>
                                                                        );
                                                                    })
                                                                }
                                                            </View>
                                                        </Card>

                                                        {/* Performance chart */}
                                                        {!activeScore
                                                            ? (
                                                                <Card theme={theme}>
                                                                    <Text style={{ fontSize: 12, color: theme.muted, textAlign: 'center', paddingVertical: 16 }}>Marks not published yet</Text>
                                                                </Card>
                                                            )
                                                            : hasChart && (
                                                                <Card theme={theme}>
                                                                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text, marginBottom: 4 }}>Performance Trend</Text>
                                                                    <LineChart
                                                                        renderDotContent={({ x, y, index, indexData }) => {
                                                                            const max = Math.max(...chartValues);
                                                                            const min = Math.min(...chartValues);
                                                                            if (indexData !== max && indexData !== min) return null;
                                                                            const isMin = indexData === min;
                                                                            return (
                                                                                <View key={index} style={{ position: 'absolute', top: isMin ? y + 6 : y - 22, left: x - 12, backgroundColor: isMin ? theme.red : theme.green, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 }}>
                                                                                    <Text style={{ fontSize: 9, color: 'white', fontFamily: 'Poppins_600SemiBold' }}>{indexData}%</Text>
                                                                                </View>
                                                                            );
                                                                        }}
                                                                        data={{ labels: chartLabels, datasets: [{ data: chartValues, color: () => activeSubject.color, strokeWidth: 2 }] }}
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
                                                                </Card>
                                                            )
                                                        }

                                                        {/* Materials */}
                                                        {activeSubjMaterials.length > 0 && (
                                                            <Card theme={theme}>
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                                                    <BookOpen size={15} color={activeSubject.color} />
                                                                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text }}>Materials</Text>
                                                                </View>
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
                                                            </Card>
                                                        )}

                                                        {/* Exam results list */}
                                                        {activeScore && activeScore.columns.length > 0 && (
                                                            <Card theme={theme}>
                                                                <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text, marginBottom: 12 }}>My Results</Text>
                                                                <View style={{ gap: 10 }}>
                                                                    {activeScore.columns.map((col, i) => {
                                                                        const pct = col.isAbsent ? null : col.scored != null ? Math.round((col.scored / col.max) * 100) : null;
                                                                        const color = pct == null ? theme.muted : pct >= 75 ? theme.green : pct >= 40 ? theme.amber : theme.red;
                                                                        return (
                                                                            <View key={i} style={{ padding: 12, backgroundColor: theme.bg, borderRadius: 14, gap: 8 }}>
                                                                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text, flex: 1 }} numberOfLines={1}>{col.name}</Text>
                                                                                    {col.isAbsent
                                                                                        ? <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: theme.red, backgroundColor: isDark ? '#2B0D0D' : '#FEE2E2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 }}>Absent</Text>
                                                                                        : (
                                                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                                                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: activeSubject.color }}>{col.scored}/{col.max}</Text>
                                                                                                {pct != null && <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color, backgroundColor: color + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 }}>{pct}%</Text>}
                                                                                            </View>
                                                                                        )
                                                                                    }
                                                                                </View>
                                                                                {!col.isAbsent && pct != null && (
                                                                                    <View style={{ height: 4, backgroundColor: theme.cardBorder, borderRadius: 4, overflow: 'hidden' }}>
                                                                                        <View style={{ height: '100%', width: `${pct}%`, backgroundColor: activeSubject.color, borderRadius: 4 }} />
                                                                                    </View>
                                                                                )}
                                                                            </View>
                                                                        );
                                                                    })}
                                                                </View>
                                                            </Card>
                                                        )}
                                                    </>
                                                )}
                                            </>
                                        )
                                    }
                                </View>
                            )}
                        </View>
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    banner: { marginHorizontal: 14, marginTop: 10, borderRadius: 20, padding: 18, overflow: 'hidden', marginBottom: 4 },
    bannerOrb1: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.06)', top: -30, right: -20 },
    bannerOrb2: { position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.04)', top: 40, right: 30 },
    bannerIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
    bannerTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: 'white' },
    bannerSub: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.7)' },
    mainTabRow: { flexDirection: 'row', marginHorizontal: 14, marginTop: 12, marginBottom: 4, borderRadius: 14, padding: 4, borderWidth: 1 },
    mainTab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10 },
    mainTabText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
    body: { padding: 14, gap: 14 },
});
