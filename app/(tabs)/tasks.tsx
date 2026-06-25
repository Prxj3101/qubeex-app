import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/context/ThemeContext';
import * as Linking from 'expo-linking';
import {
    AlertCircle,
    BookOpen,
    Calendar,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock,
    ExternalLink,
    FileText,
    Radio,
    Upload,
    Zap,
} from 'lucide-react-native';
import { useState } from 'react';
import {
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
type SubmissionStatus = 'pending' | 'submitted' | 'late' | 'missed';
type SubmissionType = 'assignment' | 'project';

interface TestItem {
    id: number;
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
    webLink?: string;
    color: string;
}

interface SubmissionItem {
    id: number;
    subject: string;
    title: string;
    type: SubmissionType;
    status: SubmissionStatus;
    dueDate: string;
    dueTime: string;
    marks: number;
    description: string;
    submittedFile?: string;
    color: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const TESTS: TestItem[] = [
    {
        id: 1,
        subject: 'Social Media Analytics',
        subjectShort: 'SMA',
        title: 'Unit Test 2 — Live Now',
        type: 'test',
        status: 'live',
        date: 'Today',
        time: '11:00 AM',
        duration: '45 mins',
        topics: ['Chapter 5 — Sentiment Analysis', 'Chapter 6 — Engagement Metrics'],
        marks: 20,
        webLink: 'https://qubeex.app/test/sma-ut2',
        color: '#8B5CF6',
    },
    {
        id: 2,
        subject: 'Deep Learning',
        subjectShort: 'DL',
        title: 'Unit Test 2',
        type: 'test',
        status: 'upcoming',
        date: '28 May',
        time: '9:00 AM',
        duration: '45 mins',
        topics: ['CNN Architecture', 'Transfer Learning', 'Object Detection'],
        marks: 20,
        webLink: 'https://qubeex.app/test/dl-ut2',
        color: '#2563EB',
    },
    {
        id: 3,
        subject: 'Distributed Computing',
        subjectShort: 'DC',
        title: 'Mid Semester Exam',
        type: 'exam',
        status: 'upcoming',
        date: '2 Jun',
        time: '10:00 AM',
        duration: '2 hrs',
        topics: ['MapReduce', 'HDFS', 'Spark Basics', 'CAP Theorem', 'Consistency Models'],
        marks: 80,
        webLink: 'https://qubeex.app/exam/dc-midsem',
        color: '#10B981',
    },
    {
        id: 4,
        subject: 'Deep Learning',
        subjectShort: 'DL',
        title: 'Unit Test 1',
        type: 'test',
        status: 'completed',
        date: '10 May',
        time: '9:00 AM',
        duration: '45 mins',
        topics: ['Perceptron', 'Backpropagation', 'Activation Functions'],
        marks: 20,
        scored: 17,
        color: '#2563EB',
    },
    {
        id: 5,
        subject: 'Distributed Computing',
        subjectShort: 'DC',
        title: 'Unit Test 1',
        type: 'test',
        status: 'completed',
        date: '5 May',
        time: '11:00 AM',
        duration: '45 mins',
        topics: ['Cloud Computing Basics', 'Virtualization'],
        marks: 20,
        scored: 31,
        color: '#10B981',
    },
];

const SUBMISSIONS: SubmissionItem[] = [
    {
        id: 1,
        subject: 'Deep Learning',
        title: 'CNN Implementation — MNIST Dataset',
        type: 'assignment',
        status: 'pending',
        dueDate: '26 May',
        dueTime: '11:59 PM',
        marks: 10,
        description: 'Implement a CNN from scratch using PyTorch to classify MNIST handwritten digits. Submit Jupyter notebook with accuracy > 98%.',
        color: '#2563EB',
    },
    {
        id: 2,
        subject: 'Social Media Analytics',
        title: 'Twitter Sentiment Analysis Report',
        type: 'assignment',
        status: 'submitted',
        dueDate: '20 May',
        dueTime: '11:59 PM',
        marks: 15,
        description: 'Analyse sentiment of 1000 tweets on a trending topic. Use VADER or TextBlob. Submit PDF report.',
        submittedFile: 'SMA_Sentiment_Report.pdf',
        color: '#8B5CF6',
    },
    {
        id: 3,
        subject: 'Major Project 2',
        title: 'Phase 2 — Working Prototype',
        type: 'project',
        status: 'pending',
        dueDate: '30 May',
        dueTime: '5:00 PM',
        marks: 50,
        description: 'Submit working prototype with all core features implemented. Include demo video (max 5 mins) and updated SRS document.',
        color: '#F59E0B',
    },
    {
        id: 4,
        subject: 'Distributed Computing',
        title: 'MapReduce Word Count Implementation',
        type: 'assignment',
        status: 'late',
        dueDate: '15 May',
        dueTime: '11:59 PM',
        marks: 10,
        description: 'Implement Word Count using Hadoop MapReduce. Submit source code and output screenshots.',
        color: '#10B981',
    },
    {
        id: 5,
        subject: 'Project Management',
        title: 'Agile Sprint Plan — Unit 3',
        type: 'assignment',
        status: 'missed',
        dueDate: '10 May',
        dueTime: '11:59 PM',
        marks: 10,
        description: 'Create a 2-week sprint plan for your major project using Jira or Trello. Export and submit as PDF.',
        color: '#EF4444',
    },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getDaysLeft(dateStr: string): number | null {
    if (dateStr === 'Today') return 0;
    const months: Record<string, number> = {
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
        Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };
    const parts = dateStr.split(' ');
    if (parts.length < 2) return null;
    const day = parseInt(parts[0]);
    const month = months[parts[1]];
    if (isNaN(day) || month === undefined) return null;
    const now = new Date();
    const target = new Date(now.getFullYear(), month, day);
    const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
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
    const daysLeft = getDaysLeft(item.date);

    const statusConfig = {
        live: { bg: '#FEE2E2', darkBg: '#2B0D0D', text: '#DC2626', darkText: '#F87171', label: '🔴 Live Now', pulse: true },
        upcoming: { bg: theme.blueLight, darkBg: '#0D1F3C', text: theme.blue, darkText: theme.blue, label: '⏰ Upcoming', pulse: false },
        completed: { bg: theme.greenLight, darkBg: '#0D2B20', text: theme.green, darkText: theme.green, label: '✅ Completed', pulse: false },
    };

    const s = statusConfig[item.status];

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
                {item.status === 'upcoming' && daysLeft !== null && (
                    <View style={[styles.infoChip, { backgroundColor: daysLeft <= 2 ? theme.redLight : theme.amberLight }]}>
                        <Text style={[styles.infoChipText, { color: daysLeft <= 2 ? theme.red : theme.amber, fontFamily: 'Poppins_700Bold' }]}>
                            {daysLeft === 0 ? 'Today!' : `${daysLeft}d left`}
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
                    {/* Topics */}
                    <View style={{ gap: 6 }}>
                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.muted }}>SYLLABUS</Text>
                        {item.topics.map((topic, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <View style={{ width: 5, height: 5, borderRadius: 99, backgroundColor: item.color }} />
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.subText, flex: 1 }}>{topic}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Live / Upcoming CTA */}
                    {(item.status === 'live' || item.status === 'upcoming') && item.webLink && (
                        <TouchableOpacity
                            onPress={() => Linking.openURL(item.webLink!)}
                            style={[styles.ctaBtn, {
                                backgroundColor: item.status === 'live' ? '#EF4444' : item.color,
                            }]}
                            activeOpacity={0.85}
                        >
                            {item.status === 'live'
                                ? <Radio size={15} color="white" />
                                : <ExternalLink size={15} color="white" />
                            }
                            <Text style={styles.ctaBtnText}>
                                {item.status === 'live' ? 'Start Test Now' : 'Open Test Link'}
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

// ─── Submission Card ──────────────────────────────────────────────────────────
function SubmissionCard({ item, theme, isDark }: { item: SubmissionItem; theme: typeof LIGHT; isDark: boolean }) {
    const [expanded, setExpanded] = useState(false);
    const daysLeft = getDaysLeft(item.dueDate);

    const statusConfig = {
        pending: { bg: theme.amberLight, darkBg: '#2D2010', text: theme.amber, label: '⏳ Pending', icon: <Clock size={11} color={theme.amber} /> },
        submitted: { bg: theme.greenLight, darkBg: '#0D2B20', text: theme.green, label: '✅ Submitted', icon: <CheckCircle2 size={11} color={theme.green} /> },
        late: { bg: theme.redLight, darkBg: '#2B0D0D', text: theme.red, label: '⚠️ Late', icon: <AlertCircle size={11} color={theme.red} /> },
        missed: { bg: theme.redLight, darkBg: '#2B0D0D', text: theme.red, label: '❌ Missed', icon: <AlertCircle size={11} color={theme.red} /> },
    };

    const s = statusConfig[item.status];
    const canSubmit = item.status === 'pending' || item.status === 'late';

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
                {item.status === 'pending' && daysLeft !== null && (
                    <View style={[styles.infoChip, { backgroundColor: daysLeft <= 2 ? theme.redLight : theme.amberLight }]}>
                        <Text style={[styles.infoChipText, { color: daysLeft <= 2 ? theme.red : theme.amber, fontFamily: 'Poppins_700Bold' }]}>
                            {daysLeft === 0 ? 'Due Today!' : daysLeft < 0 ? 'Overdue' : `${daysLeft}d left`}
                        </Text>
                    </View>
                )}
                {item.status === 'submitted' && item.submittedFile && (
                    <View style={[styles.infoChip, { backgroundColor: theme.greenLight }]}>
                        <FileText size={11} color={theme.green} />
                        <Text style={[styles.infoChipText, { color: theme.green }]} numberOfLines={1}>{item.submittedFile}</Text>
                    </View>
                )}
            </View>

            {/* Expanded */}
            {expanded && (
                <View style={{ gap: 10 }}>
                    <View style={{ padding: 12, backgroundColor: theme.bg, borderRadius: 12 }}>
                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 4 }}>DESCRIPTION</Text>
                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.subText, lineHeight: 18 }}>{item.description}</Text>
                    </View>

                    {canSubmit && (
                        <TouchableOpacity
                            onPress={() => Alert.alert('Upload', `Select PDF for "${item.title}"`, [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Choose File', onPress: () => Alert.alert('Coming Soon', 'File picker will open here.') },
                            ])}
                            style={[styles.ctaBtn, { backgroundColor: item.color }]}
                            activeOpacity={0.85}
                        >
                            <Upload size={15} color="white" />
                            <Text style={styles.ctaBtnText}>
                                {item.status === 'late' ? 'Submit Late (PDF)' : 'Submit PDF'}
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

    const liveCount = TESTS.filter(t => t.status === 'live').length;
    const pendingCount = SUBMISSIONS.filter(s => s.status === 'pending').length;

    const filteredTests = testFilter === 'all' ? TESTS : TESTS.filter(t => t.status === testFilter);
    const filteredSubs = subFilter === 'all' ? SUBMISSIONS : SUBMISSIONS.filter(s => s.status === subFilter);

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
                <View style={styles.body}>

                    {/* ── Summary Banner ── */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={[styles.summaryCard, { backgroundColor: isDark ? '#2B0D0D' : '#FEE2E2', flex: 1 }]}>
                            <Radio size={18} color={theme.red} />
                            <Text style={{ fontSize: 22, fontFamily: 'Poppins_800ExtraBold', color: theme.red }}>{liveCount}</Text>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.red }}>Live Now</Text>
                        </View>
                        <View style={[styles.summaryCard, { backgroundColor: isDark ? '#2D2010' : '#FEF3C7', flex: 1 }]}>
                            <Clock size={18} color={theme.amber} />
                            <Text style={{ fontSize: 22, fontFamily: 'Poppins_800ExtraBold', color: theme.amber }}>{TESTS.filter(t => t.status === 'upcoming').length}</Text>
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
                            onPress={() => setMainTab('submissions')}
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

                            {filteredTests.map(item => (
                                <TestCard key={item.id} item={item} theme={theme} isDark={isDark} />
                            ))}
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

                            {filteredSubs.map(item => (
                                <SubmissionCard key={item.id} item={item} theme={theme} isDark={isDark} />
                            ))}
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