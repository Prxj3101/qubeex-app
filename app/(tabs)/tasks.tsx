import api from '@/lib/api';
import { SUBJECT_PALETTE } from '@/lib/subjectColors';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/context/ThemeContext';
import * as DocumentPicker from 'expo-document-picker';
import { router, useFocusEffect } from 'expo-router';
import {
    AlertCircle,
    BookOpen,
    Calendar,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock,
    FileText,
    Radio,
    Upload,
    Zap,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LIGHT = {
    bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE',
    text: '#0F172A', subText: '#64748B', muted: '#94A3B8',
    purple: '#7C3AED', purpleLight: '#EDE9FE',
    amber: '#F59E0B', amberLight: '#FEF3C7',
    green: '#10B981', greenLight: '#D1FAE5',
    red: '#EF4444', redLight: '#FEE2E2',
    blue: '#2563EB', blueLight: '#DBEAFE',
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

// ─── Types ───────────────────────────────────────────────────────────────────
type TestStatus = 'live' | 'upcoming' | 'completed';
type SubmissionStatus = 'pending' | 'submitted' | 'late' | 'missed' | 'write_again' | 'correct';
type SubmissionType = 'assignment' | 'project';

interface TestItem {
    id: string;
    subject: string;
    subjectShort: string;
    title: string;
    type: 'test' | 'exam';
    status: TestStatus;
    date: string;
    time: string;
    duration: string;
    topics: string[];
    marks: number;
    scored?: number;
    daysLeft?: number | null;
    color: string;
}

interface SubmissionItem {
    id: string;
    subject: string;
    title: string;
    type: SubmissionType;
    status: SubmissionStatus;
    dueDate: string;
    dueTime: string;
    marks: number;
    description: string;
    submittedFile?: string | null;
    color: string;
    submissionType: 'OFFLINE' | 'ONLINE';
    reviewNote?: string | null;
    offlineReceived?: boolean;
    daysLeft?: number | null;
}

// ─── API Response Types ───────────────────────────────────────────────────────
interface ApiTest {
    id: string;
    title: string;
    description: string | null;
    subjectName: string;
    durationMinutes: number;
    totalMarks: number;
    startDate: string | null;
    validUntil: string | null;
    daysLeft: number | null;
    studentStatus: 'LIVE' | 'UPCOMING' | 'DONE';
    bestScore: number | null;
}

interface ApiAssignment {
    id: string;
    title: string;
    description: string | null;
    subjectName: string;
    totalMarks: number;
    dueDate: string | null;
    daysLeft: number | null;
    submissionType: 'OFFLINE' | 'ONLINE';
    studentStatus: 'PENDING' | 'SUBMITTED' | 'WRITE_AGAIN' | 'CORRECT' | 'MISSED' | 'OVERDUE';
    submission: {
        fileUrl: string | null;
        reviewNote: string | null;
        offlineSubmittedAt: string | null;
    } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
// This list only has subjectName (no subject id/color from the API), so we
// hash the name into the canonical palette instead of indexing it directly.
function subjectColor(name: string): string {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
    return SUBJECT_PALETTE[Math.abs(h) % SUBJECT_PALETTE.length];
}

function fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
}

function fmtTime(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function fmtDuration(mins: number): string {
    if (mins < 60) return `${mins} mins`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h} hr ${m} mins` : `${h} hr${h > 1 ? 's' : ''}`;
}

function mapTest(t: ApiTest): TestItem {
    const dateIso = t.startDate ?? t.validUntil;
    return {
        id: t.id,
        subject: t.subjectName,
        subjectShort: t.subjectName.substring(0, 3).toUpperCase(),
        title: t.title,
        type: 'test',
        status: t.studentStatus === 'LIVE' ? 'live' : t.studentStatus === 'UPCOMING' ? 'upcoming' : 'completed',
        date: fmtDate(dateIso),
        time: fmtTime(dateIso),
        duration: fmtDuration(t.durationMinutes ?? 45),
        topics: (t.description ?? '').split('\n').map(l => l.trim()).filter(Boolean),
        marks: t.totalMarks,
        scored: t.bestScore ?? undefined,
        daysLeft: t.daysLeft,
        color: subjectColor(t.subjectName),
    };
}

function mapAssignment(a: ApiAssignment): SubmissionItem {
    const statusMap: Record<string, SubmissionStatus> = {
        PENDING: 'pending',
        SUBMITTED: 'submitted',
        WRITE_AGAIN: 'write_again',
        CORRECT: 'correct',
        MISSED: 'missed',
        OVERDUE: 'late',
    };
    return {
        id: a.id,
        subject: a.subjectName,
        title: a.title,
        type: 'assignment',
        status: statusMap[a.studentStatus] ?? 'pending',
        dueDate: fmtDate(a.dueDate),
        dueTime: '11:59 PM',
        marks: a.totalMarks,
        description: a.description ?? '',
        submittedFile: a.submission?.fileUrl ?? null,
        color: subjectColor(a.subjectName),
        submissionType: a.submissionType,
        reviewNote: a.submission?.reviewNote ?? null,
        offlineReceived: !!a.submission?.offlineSubmittedAt,
        daysLeft: a.daysLeft,
    };
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ children, theme, style }: { children: React.ReactNode; theme: typeof LIGHT; style?: object }) {
    return (
        <View style={[{
            backgroundColor: theme.card, borderRadius: 20, padding: 16,
            borderWidth: 1, borderColor: theme.cardBorder,
            shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
        }, style]}>
            {children}
        </View>
    );
}

// ─── Test Card ────────────────────────────────────────────────────────────────
function TestCard({ item, theme, isDark }: { item: TestItem; theme: typeof LIGHT; isDark: boolean }) {
    const [expanded, setExpanded] = useState(item.status === 'live');

    const statusConfig = {
        live: { bg: '#FEE2E2', darkBg: '#2B0D0D', text: '#DC2626', darkText: '#F87171', label: '🔴 Live Now', pulse: true },
        upcoming: { bg: theme.blueLight, darkBg: '#0D1F3C', text: theme.blue, darkText: theme.blue, label: '⏰ Upcoming', pulse: false },
        completed: { bg: theme.greenLight, darkBg: '#0D2B20', text: theme.green, darkText: theme.green, label: '✅ Completed', pulse: false },
    };

    const s = statusConfig[item.status];

    function handleStartTest() {
        router.push({ pathname: '/test-webview', params: { testId: item.id } });
    }

    return (
        <Card theme={theme}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <View style={{
                    width: 42, height: 42, borderRadius: 12,
                    backgroundColor: item.color + '20',
                    alignItems: 'center', justifyContent: 'center',
                }}>
                    {item.type === 'exam'
                        ? <BookOpen size={20} color={item.color} />
                        : <FileText size={20} color={item.color} />
                    }
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>{item.title}</Text>
                    <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>{item.subject}</Text>
                </View>
                <View style={[styles.chip, { backgroundColor: isDark ? s.darkBg : s.bg }]}>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: isDark ? s.darkText : s.text }}>{s.label}</Text>
                </View>
            </View>

            {/* Info row */}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <View style={[styles.infoChip, { backgroundColor: theme.bg }]}>
                    <Calendar size={11} color={theme.muted} />
                    <Text style={[styles.infoChipText, { color: theme.subText }]}>{item.date}</Text>
                </View>
                <View style={[styles.infoChip, { backgroundColor: theme.bg }]}>
                    <Clock size={11} color={theme.muted} />
                    <Text style={[styles.infoChipText, { color: theme.subText }]}>{item.time}</Text>
                </View>
                <View style={[styles.infoChip, { backgroundColor: theme.bg }]}>
                    <Zap size={11} color={theme.muted} />
                    <Text style={[styles.infoChipText, { color: theme.subText }]}>{item.duration}</Text>
                </View>
                <View style={[styles.infoChip, { backgroundColor: theme.bg }]}>
                    <Text style={[styles.infoChipText, { color: theme.subText }]}>📊 {item.marks} marks</Text>
                </View>
                {item.status === 'upcoming' && item.daysLeft != null && (
                    <View style={[styles.infoChip, { backgroundColor: item.daysLeft <= 2 ? theme.redLight : theme.amberLight }]}>
                        <Text style={[styles.infoChipText, { color: item.daysLeft <= 2 ? theme.red : theme.amber, fontFamily: 'Poppins_700Bold' }]}>
                            {item.daysLeft === 0 ? 'Today!' : `${item.daysLeft}d left`}
                        </Text>
                    </View>
                )}
                {item.status === 'completed' && item.scored !== undefined && (
                    <View style={[styles.infoChip, { backgroundColor: theme.greenLight }]}>
                        <Text style={[styles.infoChipText, { color: theme.green, fontFamily: 'Poppins_700Bold' }]}>
                            {item.scored}/{item.marks}
                        </Text>
                    </View>
                )}
            </View>

            {/* Expanded content */}
            {expanded && (
                <View style={{ gap: 10 }}>
                    {item.topics.length > 0 && (
                        <View style={{ gap: 6 }}>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.muted }}>SYLLABUS</Text>
                            {item.topics.map((topic, i) => (
                                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <View style={{ width: 5, height: 5, borderRadius: 99, backgroundColor: item.color }} />
                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.subText, flex: 1 }}>{topic}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {item.status === 'live' && (
                        <TouchableOpacity
                            onPress={handleStartTest}
                            style={[styles.ctaBtn, { backgroundColor: '#EF4444' }]}
                            activeOpacity={0.85}
                        >
                            <Radio size={15} color="white" />
                            <Text style={styles.ctaBtnText}>Start Test Now</Text>
                        </TouchableOpacity>
                    )}
                    {item.status === 'upcoming' && (
                        <TouchableOpacity
                            onPress={handleStartTest}
                            style={[styles.ctaBtn, { backgroundColor: item.color }]}
                            activeOpacity={0.85}
                        >
                            <Clock size={15} color="white" />
                            <Text style={styles.ctaBtnText}>Open Test Link</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* Expand toggle */}
            <TouchableOpacity style={styles.expandRow} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
                {expanded ? <ChevronUp size={13} color={theme.muted} /> : <ChevronDown size={13} color={theme.muted} />}
                <Text style={[styles.expandText, { color: theme.muted }]}>{expanded ? 'Show less' : 'View details'}</Text>
            </TouchableOpacity>
        </Card>
    );
}

// ─── Submission Card ──────────────────────────────────────────────────────────
function SubmissionCard({
    item, theme, isDark, onSubmitted,
}: {
    item: SubmissionItem; theme: typeof LIGHT; isDark: boolean; onSubmitted: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [uploading, setUploading] = useState(false);

    const statusConfig: Record<SubmissionStatus, { bg: string; darkBg: string; text: string; label: string }> = {
        pending: { bg: theme.amberLight, darkBg: '#2D2010', text: theme.amber, label: '⏳ Pending' },
        submitted: { bg: theme.greenLight, darkBg: '#0D2B20', text: theme.green, label: '✅ Submitted' },
        late: { bg: theme.redLight, darkBg: '#2B0D0D', text: theme.red, label: '⚠️ Late' },
        missed: { bg: theme.redLight, darkBg: '#2B0D0D', text: theme.red, label: '❌ Missed' },
        write_again: { bg: theme.amberLight, darkBg: '#2D2010', text: theme.amber, label: '✍️ Write Again' },
        correct: { bg: theme.greenLight, darkBg: '#0D2B20', text: theme.green, label: '✅ Correct' },
    };

    const s = statusConfig[item.status];
    const canSubmit = (item.status === 'pending' || item.status === 'write_again') && item.submissionType === 'ONLINE';

    async function handlePickAndUpload() {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/pdf',
                copyToCacheDirectory: true,
            });
            if (result.canceled) return;

            const asset = result.assets[0];
            setUploading(true);

            const formData = new FormData();
            formData.append('file', {
                uri: asset.uri,
                type: asset.mimeType ?? 'application/pdf',
                name: asset.name ?? 'submission.pdf',
            } as any);

            await api.post(`/student/tasks/assignments/${item.id}/submit`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                transformRequest: (data) => data,
            });

            Alert.alert('Submitted!', 'Your assignment has been submitted successfully.');
            onSubmitted();
        } catch (err: any) {
            const msg = err?.response?.data?.error ?? 'Upload failed. Please try again.';
            Alert.alert('Error', msg);
        } finally {
            setUploading(false);
        }
    }

    return (
        <Card theme={theme}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <View style={{
                    width: 42, height: 42, borderRadius: 12,
                    backgroundColor: item.color + '20',
                    alignItems: 'center', justifyContent: 'center',
                    marginTop: 2,
                }}>
                    {item.type === 'project'
                        ? <Zap size={20} color={item.color} />
                        : <FileText size={20} color={item.color} />
                    }
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text, lineHeight: 18 }}>{item.title}</Text>
                    <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>{item.subject}</Text>
                </View>
                <View style={[styles.chip, { backgroundColor: isDark ? s.darkBg : s.bg }]}>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: s.text }}>{s.label}</Text>
                </View>
            </View>

            {/* Info row */}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <View style={[styles.infoChip, { backgroundColor: theme.bg }]}>
                    <Text style={{ fontSize: 9 }}>{item.type === 'project' ? '🚀' : '📝'}</Text>
                    <Text style={[styles.infoChipText, { color: theme.subText, textTransform: 'capitalize' }]}>{item.type}</Text>
                </View>
                <View style={[styles.infoChip, { backgroundColor: theme.bg }]}>
                    <Calendar size={11} color={theme.muted} />
                    <Text style={[styles.infoChipText, { color: theme.subText }]}>Due: {item.dueDate}</Text>
                </View>
                <View style={[styles.infoChip, { backgroundColor: theme.bg }]}>
                    <Text style={[styles.infoChipText, { color: theme.subText }]}>📊 {item.marks} marks</Text>
                </View>
                {item.submissionType === 'OFFLINE' && (
                    <View style={[styles.infoChip, { backgroundColor: item.offlineReceived ? theme.greenLight : theme.bg }]}>
                        <Text style={[styles.infoChipText, { color: item.offlineReceived ? theme.green : theme.muted }]}>
                            {item.offlineReceived ? '📋 Copy received' : '📋 Offline'}
                        </Text>
                    </View>
                )}
                {item.status === 'pending' && item.daysLeft != null && (
                    <View style={[styles.infoChip, { backgroundColor: item.daysLeft <= 2 ? theme.redLight : theme.amberLight }]}>
                        <Text style={[styles.infoChipText, { color: item.daysLeft <= 2 ? theme.red : theme.amber, fontFamily: 'Poppins_700Bold' }]}>
                            {item.daysLeft === 0 ? 'Due Today!' : item.daysLeft < 0 ? 'Overdue' : `${item.daysLeft}d left`}
                        </Text>
                    </View>
                )}
                {(item.status === 'submitted' || item.status === 'correct') && item.submittedFile && (
                    <View style={[styles.infoChip, { backgroundColor: theme.greenLight }]}>
                        <FileText size={11} color={theme.green} />
                        <Text style={[styles.infoChipText, { color: theme.green }]} numberOfLines={1}>PDF submitted</Text>
                    </View>
                )}
            </View>

            {/* Expanded */}
            {expanded && (
                <View style={{ gap: 10 }}>
                    {item.description ? (
                        <View style={{ padding: 12, backgroundColor: theme.bg, borderRadius: 12 }}>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 4 }}>DESCRIPTION</Text>
                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.subText, lineHeight: 18 }}>{item.description}</Text>
                        </View>
                    ) : null}

                    {item.status === 'write_again' && item.reviewNote && (
                        <View style={{ padding: 12, backgroundColor: isDark ? '#2D2010' : theme.amberLight, borderRadius: 12 }}>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.amber, marginBottom: 4 }}>TEACHER FEEDBACK</Text>
                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: isDark ? theme.text : '#92400E', lineHeight: 18 }}>{item.reviewNote}</Text>
                        </View>
                    )}

                    {canSubmit && (
                        <TouchableOpacity
                            onPress={handlePickAndUpload}
                            disabled={uploading}
                            style={[styles.ctaBtn, { backgroundColor: uploading ? theme.muted : item.color }]}
                            activeOpacity={0.85}
                        >
                            {uploading
                                ? <ActivityIndicator size="small" color="white" />
                                : <Upload size={15} color="white" />
                            }
                            <Text style={styles.ctaBtnText}>
                                {uploading ? 'Uploading…' : item.status === 'write_again' ? 'Resubmit PDF' : 'Submit PDF'}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* Expand toggle */}
            <TouchableOpacity style={styles.expandRow} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
                {expanded ? <ChevronUp size={13} color={theme.muted} /> : <ChevronDown size={13} color={theme.muted} />}
                <Text style={[styles.expandText, { color: theme.muted }]}>{expanded ? 'Show less' : 'View details'}</Text>
            </TouchableOpacity>
        </Card>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
type MainTab = 'tests' | 'submissions';
type TestFilter = 'all' | 'live' | 'upcoming' | 'completed';
type SubFilter = 'all' | 'pending' | 'submitted' | 'late' | 'missed';

export default function Tasks() {
    const { isDark } = useTheme();
    const theme = isDark ? DARK : LIGHT;

    const [mainTab, setMainTab] = useState<MainTab>('tests');
    const [testFilter, setTestFilter] = useState<TestFilter>('all');
    const [subFilter, setSubFilter] = useState<SubFilter>('all');

    const [tests, setTests] = useState<TestItem[]>([]);
    const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
    const [loadingTests, setLoadingTests] = useState(true);
    const [loadingSubmissions, setLoadingSubmissions] = useState(false);
    const [submissionsLoaded, setSubmissionsLoaded] = useState(false);

    async function fetchTests() {
        try {
            setLoadingTests(true);
            const res = await api.get('/student/tasks/tests');
            setTests((res.data.data ?? []).map(mapTest));
        } catch {
            // leave empty
        } finally {
            setLoadingTests(false);
        }
    }

    async function fetchSubmissions() {
        try {
            setLoadingSubmissions(true);
            const res = await api.get('/student/tasks/assignments');
            setSubmissions((res.data.data ?? []).map(mapAssignment));
            setSubmissionsLoaded(true);
        } catch {
            // leave empty
        } finally {
            setLoadingSubmissions(false);
        }
    }

    useFocusEffect(useCallback(() => {
        fetchTests();
        if (submissionsLoaded) fetchSubmissions();
    }, [submissionsLoaded]));

    function handleSwitchToSubmissions() {
        setMainTab('submissions');
        if (!submissionsLoaded) fetchSubmissions();
    }

    const liveCount = tests.filter(t => t.status === 'live').length;
    const upcomingCount = tests.filter(t => t.status === 'upcoming').length;
    const pendingCount = submissions.filter(s => s.status === 'pending' || s.status === 'write_again').length;

    const filteredTests = testFilter === 'all' ? tests : tests.filter(t => t.status === testFilter);
    const filteredSubs = subFilter === 'all' ? submissions
        : subFilter === 'submitted' ? submissions.filter(s => s.status === 'submitted' || s.status === 'correct')
        : subFilter === 'late' ? submissions.filter(s => s.status === 'late' || s.status === 'write_again')
        : submissions.filter(s => s.status === subFilter);

    const TEST_FILTERS: { key: TestFilter; label: string }[] = [
        { key: 'all', label: 'All' },
        { key: 'live', label: '🔴 Live' },
        { key: 'upcoming', label: '⏰ Upcoming' },
        { key: 'completed', label: '✅ Done' },
    ];

    const SUB_FILTERS: { key: SubFilter; label: string }[] = [
        { key: 'all', label: 'All' },
        { key: 'pending', label: '⏳ Pending' },
        { key: 'submitted', label: '✅ Submitted' },
        { key: 'late', label: '⚠️ Late' },
        { key: 'missed', label: '❌ Missed' },
    ];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
            <ScreenHeader title="Tasks" />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
                <View style={[styles.body, { paddingTop: 6 }]}>

                    {/* ── Summary Banner ── */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={[styles.summaryCard, { backgroundColor: isDark ? '#2B0D0D' : '#FEE2E2', flex: 1 }]}>
                            <Radio size={18} color={theme.red} />
                            <Text style={{ fontSize: 22, fontFamily: 'Poppins_800ExtraBold', color: theme.red }}>{liveCount}</Text>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.red }}>Live Now</Text>
                        </View>
                        <View style={[styles.summaryCard, { backgroundColor: isDark ? '#2D2010' : '#FEF3C7', flex: 1 }]}>
                            <Clock size={18} color={theme.amber} />
                            <Text style={{ fontSize: 22, fontFamily: 'Poppins_800ExtraBold', color: theme.amber }}>{upcomingCount}</Text>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.amber }}>Upcoming</Text>
                        </View>
                        <View style={[styles.summaryCard, { backgroundColor: isDark ? '#2D2010' : theme.amberLight, flex: 1 }]}>
                            <Upload size={18} color={theme.amber} />
                            <Text style={{ fontSize: 22, fontFamily: 'Poppins_800ExtraBold', color: theme.amber }}>{pendingCount}</Text>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.amber }}>Pending</Text>
                        </View>
                    </View>

                    {/* ── Main Tabs ── */}
                    <View style={[styles.mainTabRow, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        <TouchableOpacity
                            onPress={() => setMainTab('tests')}
                            style={[styles.mainTab, mainTab === 'tests' && { backgroundColor: theme.purple }]}
                        >
                            <Text style={[styles.mainTabText, { color: mainTab === 'tests' ? 'white' : theme.subText }]}>
                                📝 Tests & Exams
                            </Text>
                            {liveCount > 0 && (
                                <View style={styles.liveBadge}>
                                    <Text style={styles.liveBadgeText}>{liveCount}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleSwitchToSubmissions}
                            style={[styles.mainTab, mainTab === 'submissions' && { backgroundColor: theme.purple }]}
                        >
                            <Text style={[styles.mainTabText, { color: mainTab === 'submissions' ? 'white' : theme.subText }]}>
                                📤 Submissions
                            </Text>
                            {pendingCount > 0 && (
                                <View style={styles.liveBadge}>
                                    <Text style={styles.liveBadgeText}>{pendingCount}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* ══ TESTS TAB ══ */}
                    {mainTab === 'tests' && (
                        <View style={{ gap: 12 }}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {TEST_FILTERS.map(f => (
                                        <TouchableOpacity
                                            key={f.key}
                                            onPress={() => setTestFilter(f.key)}
                                            style={[styles.filterChip, {
                                                backgroundColor: testFilter === f.key ? theme.purple : theme.card,
                                                borderColor: testFilter === f.key ? theme.purple : theme.cardBorder,
                                            }]}
                                        >
                                            <Text style={[styles.filterChipText, { color: testFilter === f.key ? 'white' : theme.subText }]}>
                                                {f.label}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>

                            {loadingTests
                                ? <ActivityIndicator color={theme.purple} style={{ marginTop: 20 }} />
                                : filteredTests.length === 0
                                    ? <Text style={{ textAlign: 'center', color: theme.muted, fontFamily: 'Poppins_400Regular', marginTop: 20 }}>No tests found</Text>
                                    : filteredTests.map(item => (
                                        <TestCard key={item.id} item={item} theme={theme} isDark={isDark} />
                                    ))
                            }
                        </View>
                    )}

                    {/* ══ SUBMISSIONS TAB ══ */}
                    {mainTab === 'submissions' && (
                        <View style={{ gap: 12 }}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {SUB_FILTERS.map(f => (
                                        <TouchableOpacity
                                            key={f.key}
                                            onPress={() => setSubFilter(f.key)}
                                            style={[styles.filterChip, {
                                                backgroundColor: subFilter === f.key ? theme.purple : theme.card,
                                                borderColor: subFilter === f.key ? theme.purple : theme.cardBorder,
                                            }]}
                                        >
                                            <Text style={[styles.filterChipText, { color: subFilter === f.key ? 'white' : theme.subText }]}>
                                                {f.label}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>

                            {loadingSubmissions
                                ? <ActivityIndicator color={theme.purple} style={{ marginTop: 20 }} />
                                : filteredSubs.length === 0
                                    ? <Text style={{ textAlign: 'center', color: theme.muted, fontFamily: 'Poppins_400Regular', marginTop: 20 }}>No assignments found</Text>
                                    : filteredSubs.map(item => (
                                        <SubmissionCard
                                            key={item.id}
                                            item={item}
                                            theme={theme}
                                            isDark={isDark}
                                            onSubmitted={fetchSubmissions}
                                        />
                                    ))
                            }
                        </View>
                    )}

                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    body: { padding: 14, gap: 14 },

    summaryCard: {
        borderRadius: 16, padding: 14,
        alignItems: 'center', gap: 4,
    },

    mainTabRow: {
        flexDirection: 'row',
        borderRadius: 14, borderWidth: 1,
        padding: 4, gap: 4,
    },
    mainTab: {
        flex: 1, paddingVertical: 8, borderRadius: 10,
        alignItems: 'center', flexDirection: 'row',
        justifyContent: 'center', gap: 6,
    },
    mainTabText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },

    liveBadge: {
        backgroundColor: '#EF4444',
        width: 18, height: 18, borderRadius: 99,
        alignItems: 'center', justifyContent: 'center',
    },
    liveBadgeText: { fontSize: 10, color: 'white', fontFamily: 'Poppins_700Bold' },

    filterChip: {
        paddingHorizontal: 14, paddingVertical: 7,
        borderRadius: 99, borderWidth: 1,
    },
    filterChipText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },

    chip: {
        paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 99, alignSelf: 'flex-start',
    },

    infoChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99,
    },
    infoChipText: { fontSize: 11, fontFamily: 'Poppins_400Regular' },

    ctaBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, paddingVertical: 12, borderRadius: 14,
    },
    ctaBtnText: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: 'white' },

    expandRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
    expandText: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
});
