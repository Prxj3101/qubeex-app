import api from '@/lib/api';
import { getDeviceClientId } from '@/lib/deviceClientId';
import { SUBJECT_PALETTE } from '@/lib/subjectColors';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TabEntryCover, useTabEntryCover } from '@/components/TabEntryCover';
import { useTheme } from '@/context/ThemeContext';
import * as DocumentPicker from 'expo-document-picker';
import { router, useFocusEffect } from 'expo-router';
import {
    AlertCircle,
    BarChart2,
    Calendar,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Eye,
    FileEdit,
    FileText,
    Layers,
    Radio,
    ShieldAlert,
    Timer,
    Upload,
    Zap,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from 'expo-router';
import {
    ActivityIndicator,
    Alert,
    Linking,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Constants from 'expo-constants';

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
    // Kept as separate raw ISO values (not merged into one "date") so the card can
    // show Started AND Ends/Ended at once, matching the web Tests & Exams card.
    startDateIso: string | null;
    validUntilIso: string | null;
    durationMinutes: number;
    topics: string[];
    marks: number;
    numberOfQuestions: number;
    maxAttempts: number;
    attemptsUsed: number;
    scored?: number | null;
    scoredPercentage?: number | null;
    lastAttemptId?: string | null;
    lastAttemptStartTime?: string | null;
    lastAttemptEndTime?: string | null;
    lastAttemptMalpracticeFlag?: boolean;
    attempts: { id: string; attemptNumber: number; totalScore: number; maxScore: number; percentage: number; startTime: string | null; endTime: string | null; malpracticeFlag: boolean }[];
    color: string;
    // True when another device is actively in the middle of this test right
    // now (single-device lock) — shown instead of "Start Test Now" so the
    // same test can't be opened simultaneously on two screens.
    lockedByOtherDevice: boolean;
}

interface SubmissionItem {
    id: string;
    subject: string;
    title: string;
    type: SubmissionType;
    status: SubmissionStatus;
    dueDate: string;
    dueDateIso: string | null;
    dueTime: string;
    marks: number;
    description: string;
    submittedFile?: string | null;
    submittedAt?: string | null;
    lateSubmission?: boolean;
    color: string;
    submissionType: 'OFFLINE' | 'ONLINE';
    reviewNote?: string | null;
    offlineReceived?: boolean;
    offlineSubmittedAt?: string | null;
    offlineMarkedLate?: boolean;
    daysLeft?: number | null;
    // Newest first — attempts[0] mirrors submittedFile above.
    attempts?: { id: string; attemptNumber: number; fileUrl: string | null; submittedAt: string; reviewStatus: string | null; reviewNote: string | null }[];
}

// ─── API Response Types ───────────────────────────────────────────────────────
interface ApiTest {
    id: string;
    title: string;
    description: string | null;
    subjectName: string;
    durationMinutes: number;
    totalMarks: number;
    numberOfQuestions: number;
    maxAttempts: number;
    startDate: string | null;
    validUntil: string | null;
    daysLeft: number | null;
    studentStatus: 'LIVE' | 'UPCOMING' | 'DONE';
    attemptsUsed: number;
    bestScore: number | null;
    bestPercentage: number | null;
    lastAttemptId: string | null;
    lastAttemptStartTime: string | null;
    lastAttemptEndTime: string | null;
    lastAttemptMalpracticeFlag: boolean;
    attempts: { id: string; attemptNumber: number; totalScore: number; maxScore: number; percentage: number; startTime: string | null; endTime: string | null; malpracticeFlag: boolean }[];
    lockedByOtherDevice: boolean;
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
    lateSubmission: boolean;
    submission: {
        fileUrl: string | null;
        submittedAt: string | null;
        reviewNote: string | null;
        offlineSubmittedAt: string | null;
        offlineMarkedLate: boolean;
    } | null;
    // Newest first — attempts[0] mirrors `submission` above.
    attempts: { id: string; attemptNumber: number; fileUrl: string | null; submittedAt: string; reviewStatus: string | null; reviewNote: string | null }[];
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

// Matches the web Tests & Exams card exactly: "30mins", "1hr 30mins", "1hr".
function fmtDuration(mins: number): string {
    if (mins < 60) return `${mins}mins`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}hr${m ? ` ${m}mins` : ''}`;
}

function mapTest(t: ApiTest): TestItem {
    return {
        id: t.id,
        subject: t.subjectName,
        subjectShort: t.subjectName.substring(0, 3).toUpperCase(),
        title: t.title,
        type: 'test',
        status: t.studentStatus === 'LIVE' ? 'live' : t.studentStatus === 'UPCOMING' ? 'upcoming' : 'completed',
        startDateIso: t.startDate,
        validUntilIso: t.validUntil,
        durationMinutes: t.durationMinutes ?? 45,
        topics: (t.description ?? '').split('\n').map(l => l.trim()).filter(Boolean),
        marks: t.totalMarks,
        numberOfQuestions: t.numberOfQuestions,
        maxAttempts: t.maxAttempts,
        attemptsUsed: t.attemptsUsed,
        scored: t.bestScore,
        scoredPercentage: t.bestPercentage,
        lastAttemptId: t.lastAttemptId,
        lastAttemptStartTime: t.lastAttemptStartTime,
        lastAttemptEndTime: t.lastAttemptEndTime,
        lastAttemptMalpracticeFlag: t.lastAttemptMalpracticeFlag,
        attempts: t.attempts,
        color: subjectColor(t.subjectName),
        lockedByOtherDevice: t.lockedByOtherDevice,
    };
}

function mapAssignment(a: ApiAssignment): SubmissionItem {
    const statusMap: Record<string, SubmissionStatus> = {
        PENDING: 'pending',
        // SUBMITTED means "awaiting teacher action" for both types, but only
        // ONLINE submissions go through an actual review — OFFLINE ones are
        // just marked received by the teacher, so they read as "Submitted"
        // (reusing the same green style as CORRECT) instead of "In Review".
        SUBMITTED: a.submissionType === 'OFFLINE' ? 'correct' : 'submitted',
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
        dueDateIso: a.dueDate,
        dueTime: fmtTime(a.dueDate),
        marks: a.totalMarks,
        description: a.description ?? '',
        submittedFile: a.submission?.fileUrl ?? null,
        submittedAt: a.submission?.submittedAt ?? null,
        lateSubmission: a.lateSubmission,
        color: subjectColor(a.subjectName),
        submissionType: a.submissionType,
        reviewNote: a.submission?.reviewNote ?? null,
        offlineReceived: !!a.submission?.offlineSubmittedAt,
        offlineSubmittedAt: a.submission?.offlineSubmittedAt ?? null,
        offlineMarkedLate: a.submission?.offlineMarkedLate ?? false,
        daysLeft: a.daysLeft,
        attempts: a.attempts,
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
// Mirrors the web Tests & Exams card exactly: same labels, same info chips
// (Started/Ends both shown when present, duration, marks, questions, attempts),
// same Score+percentage placement, same buttons — kept in sync intentionally.
function TestCard({ item, theme, isDark }: { item: TestItem; theme: typeof LIGHT; isDark: boolean }) {
    const [expanded, setExpanded] = useState(false);
    // Which attempt's result the View Result button points to — defaults to
    // the best-scoring attempt (matches the "highest counts" scoring rule),
    // chevrons let the student flip to any other attempt's result.
    const [viewedIdx, setViewedIdx] = useState(() => {
        if (item.attempts.length === 0) return -1;
        let bestI = 0;
        for (let i = 1; i < item.attempts.length; i++) {
            if (item.attempts[i].totalScore > item.attempts[bestI].totalScore) bestI = i;
        }
        return bestI;
    });

    const missed = item.status === 'completed' && item.attemptsUsed === 0;

    const statusConfig = {
        live: { bg: '#FEE2E2', darkBg: '#2B0D0D', emoji: '🔴', text: '#DC2626', darkText: '#F87171', label: 'Live Now' },
        upcoming: { bg: theme.amberLight, darkBg: '#2D2010', emoji: '⏰', text: theme.amber, darkText: theme.amber, label: 'Upcoming' },
        completed: { bg: theme.greenLight, darkBg: '#0D2B20', emoji: '✅', text: theme.green, darkText: theme.green, label: 'Completed' },
    };

    const s = missed
        ? { bg: theme.redLight, darkBg: '#2B0D0D', emoji: '❌', text: theme.red, darkText: '#F87171', label: 'Missed' }
        : statusConfig[item.status];
    const startLabel = item.status === 'upcoming' ? 'Starts' : 'Started';
    const endLabel = item.status === 'completed' ? 'Ended' : 'Ends';

    function handleStartTest() {
        router.push({ pathname: '/test-webview', params: { testId: item.id } });
    }
    const viewedAttempt = item.attempts[viewedIdx] ?? item.attempts[item.attempts.length - 1] ?? null;
    // Derived from position in the (ascending-sorted, completed-only) attempts
    // array rather than trusting the stored attemptNumber field directly — so
    // the "Attempt X/Y" label is always self-consistent with what the chevrons
    // are actually stepping through, even if a row's stored attemptNumber were
    // ever wrong/stale for any reason.
    const viewedAttemptOrdinal = viewedAttempt
        ? item.attempts.findIndex((a) => a.id === viewedAttempt.id) + 1
        : null;
    function handleViewResult() {
        const attemptId = viewedAttempt?.id ?? item.lastAttemptId ?? '';
        router.push({ pathname: '/test-webview', params: { testId: item.id, attemptId } });
    }

    return (
        // padding: 0 + overflow: hidden here so the syllabus toggle below can be a
        // full-bleed footer strip (border-top spanning the whole card, no side
        // padding) exactly like the web card — everything else moves into the
        // padded inner View instead of relying on the shared Card's padding.
        <Card theme={theme} style={{ padding: 0, overflow: 'hidden' }}>
            <View style={{ padding: 16 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <View style={{
                    width: 40, height: 40, borderRadius: 12,
                    backgroundColor: item.status === 'live' ? '#ef44441a' : item.status === 'upcoming' ? theme.amber + '20' : missed ? '#ef44441a' : '#22c55e1a',
                    alignItems: 'center', justifyContent: 'center',
                }}>
                    <FileText size={20} color={item.status === 'live' ? '#F87171' : item.status === 'upcoming' ? theme.amber : missed ? '#F87171' : '#10B981'} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>{item.title}</Text>
                    <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>{item.subject}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[styles.chip, { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isDark ? s.darkBg : s.bg }]}>
                        <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: isDark ? s.darkText : s.text }}>{s.emoji} {s.label}</Text>
                    </View>
                    {viewedAttempt ? (
                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>
                            Score: {viewedAttempt.totalScore}/{item.marks} ({viewedAttempt.percentage}%)
                        </Text>
                    ) : item.scored != null && (
                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>
                            Score: {item.scored}/{item.marks}{item.scoredPercentage != null ? ` (${item.scoredPercentage}%)` : ''}
                        </Text>
                    )}
                    {missed && (
                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>
                            Score: 0/{item.marks} (0%)
                        </Text>
                    )}
                </View>
            </View>

            {/* Info row — collapsed by default for completed/missed tests, always
                shown for live/upcoming (matches web's "View details" behavior) */}
            {(item.status !== 'completed' || expanded) && (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {item.startDateIso && (
                    <View style={[styles.infoChip, { backgroundColor: theme.bg }]}>
                        <Calendar size={11} color={theme.muted} />
                        <Text style={[styles.infoChipText, { color: theme.subText }]}>
                            <Text style={{ fontFamily: 'Poppins_600SemiBold' }}>{startLabel}: </Text>
                            {fmtDate(item.startDateIso)}, {fmtTime(item.startDateIso)}
                        </Text>
                    </View>
                )}
                {item.validUntilIso && (
                    <View style={[styles.infoChip, { backgroundColor: theme.bg }]}>
                        <Calendar size={11} color={theme.muted} />
                        <Text style={[styles.infoChipText, { color: theme.subText }]}>
                            <Text style={{ fontFamily: 'Poppins_600SemiBold' }}>{endLabel}: </Text>
                            {fmtDate(item.validUntilIso)}, {fmtTime(item.validUntilIso)}
                        </Text>
                    </View>
                )}
                <View style={[styles.infoChip, { backgroundColor: theme.bg }]}>
                    <Timer size={11} color={theme.muted} />
                    <Text style={[styles.infoChipText, { color: theme.subText }]}>{fmtDuration(item.durationMinutes)}</Text>
                </View>
                <View style={[styles.infoChip, { backgroundColor: theme.bg }]}>
                    <BarChart2 size={11} color={theme.muted} />
                    <Text style={[styles.infoChipText, { color: theme.subText }]}>{item.marks} marks</Text>
                </View>
                <View style={[styles.infoChip, { backgroundColor: theme.bg }]}>
                    <Layers size={11} color={theme.muted} />
                    <Text style={[styles.infoChipText, { color: theme.subText }]}>{item.numberOfQuestions} Ques</Text>
                </View>
                <View style={[styles.infoChip, { backgroundColor: theme.bg }]}>
                    <Text style={[styles.infoChipText, { color: theme.subText }]}>Attempt {viewedAttemptOrdinal ?? item.attemptsUsed}/{item.maxAttempts}</Text>
                </View>
                {(viewedAttempt?.startTime ?? item.lastAttemptStartTime) && (
                    <View style={[styles.infoChip, { backgroundColor: 'rgba(192,96,64,0.12)' }]}>
                        <Calendar size={11} color={theme.muted} />
                        <Text style={[styles.infoChipText, { color: theme.subText }]}>
                            <Text style={{ fontFamily: 'Poppins_600SemiBold' }}>Given at : </Text>
                            {fmtDate((viewedAttempt?.startTime ?? item.lastAttemptStartTime)!)}, {fmtTime((viewedAttempt?.startTime ?? item.lastAttemptStartTime)!)}
                        </Text>
                    </View>
                )}
                {(viewedAttempt?.endTime ?? item.lastAttemptEndTime) && (
                    <View style={[styles.infoChip, { backgroundColor: 'rgba(192,96,64,0.12)' }]}>
                        <Calendar size={11} color={theme.muted} />
                        <Text style={[styles.infoChipText, { color: theme.subText }]}>
                            <Text style={{ fontFamily: 'Poppins_600SemiBold' }}>Submitted at : </Text>
                            {fmtDate((viewedAttempt?.endTime ?? item.lastAttemptEndTime)!)}, {fmtTime((viewedAttempt?.endTime ?? item.lastAttemptEndTime)!)}
                        </Text>
                    </View>
                )}
                {(viewedAttempt ? viewedAttempt.malpracticeFlag : item.lastAttemptMalpracticeFlag) && (
                    <View style={[styles.infoChip, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                        <ShieldAlert size={11} color="#DC2626" />
                        <Text style={[styles.infoChipText, { color: '#DC2626', fontFamily: 'Poppins_600SemiBold' }]}>
                            Flagged for malpractice
                        </Text>
                    </View>
                )}
            </View>
            )}

            {/* Expanded content — syllabus only, matching web */}
            {expanded && item.topics.length > 0 && (
                <View style={{ gap: 6, marginBottom: 10 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.muted }}>SYLLABUS</Text>
                    {item.topics.map((topic, i) => (
                        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ width: 5, height: 5, borderRadius: 99, backgroundColor: theme.purple }} />
                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.subText, flex: 1 }}>{topic}</Text>
                        </View>
                    ))}
                </View>
            )}

            {item.lastAttemptId && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: item.status === 'live' ? 8 : 0 }}>
                    {item.attempts.length > 1 && (
                        <TouchableOpacity
                            onPress={() => setViewedIdx((i) => Math.max(0, i - 1))}
                            disabled={viewedIdx <= 0}
                            style={[styles.ctaBtnOutline, { width: 40, paddingVertical: 12, borderColor: theme.cardBorder, opacity: viewedIdx <= 0 ? 0.3 : 1 }]}
                            activeOpacity={0.85}
                        >
                            <ChevronLeft size={16} color={theme.text} />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        onPress={handleViewResult}
                        style={[styles.ctaBtnOutline, { flex: 1, borderColor: theme.cardBorder }]}
                        activeOpacity={0.85}
                    >
                        <Text style={[styles.ctaBtnOutlineText, { color: theme.text }]}>
                            View Result{item.attempts.length > 1 && viewedAttemptOrdinal ? ` (Attempt ${viewedAttemptOrdinal}/${item.maxAttempts})` : ''}
                        </Text>
                    </TouchableOpacity>
                    {item.attempts.length > 1 && (
                        <TouchableOpacity
                            onPress={() => setViewedIdx((i) => Math.min(item.attempts.length - 1, i + 1))}
                            disabled={viewedIdx >= item.attempts.length - 1}
                            style={[styles.ctaBtnOutline, { width: 40, paddingVertical: 12, borderColor: theme.cardBorder, opacity: viewedIdx >= item.attempts.length - 1 ? 0.3 : 1 }]}
                            activeOpacity={0.85}
                        >
                            <ChevronRight size={16} color={theme.text} />
                        </TouchableOpacity>
                    )}
                </View>
            )}
            {item.status === 'live' && item.lockedByOtherDevice && (
                <View style={[styles.ctaBtn, { backgroundColor: theme.cardBorder + '40' }]}>
                    <ShieldAlert size={15} color={theme.subText} />
                    <Text style={[styles.ctaBtnText, { color: theme.subText }]}>
                        Test in progress on another device
                    </Text>
                </View>
            )}
            {item.status === 'live' && !item.lockedByOtherDevice && (
                <TouchableOpacity
                    onPress={handleStartTest}
                    style={[styles.ctaBtn, { backgroundColor: '#EF4444' }]}
                    activeOpacity={0.85}
                >
                    <Radio size={15} color="white" />
                    <Text style={styles.ctaBtnText}>
                        Start Test Now{item.attemptsUsed > 0 ? ` (Attempt ${item.attemptsUsed + 1}/${item.maxAttempts})` : ''}
                    </Text>
                </TouchableOpacity>
            )}

            </View>

            {/* Expand toggle — full-bleed footer strip with a top border, matching
                the web card exactly, instead of sitting inline with the padding. */}
            {(item.status === 'completed' || item.topics.length > 0) && (
                <TouchableOpacity
                    onPress={() => setExpanded(!expanded)}
                    activeOpacity={0.7}
                    style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
                        paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.cardBorder,
                    }}
                >
                    {expanded ? <ChevronUp size={13} color={theme.muted} /> : <ChevronDown size={13} color={theme.muted} />}
                    <Text style={[styles.expandText, { color: theme.muted }]}>
                        {item.status === 'completed'
                            ? (expanded ? 'Hide details' : 'View details')
                            : (expanded ? 'Hide syllabus/instructions' : 'View syllabus/instructions')}
                    </Text>
                </TouchableOpacity>
            )}
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
    const [historyOpen, setHistoryOpen] = useState(false);

    const statusConfig: Record<SubmissionStatus, { bg: string; darkBg: string; text: string; label: string }> = {
        pending: { bg: theme.amberLight, darkBg: '#2D2010', text: theme.amber, label: '⏳ Pending' },
        submitted: { bg: theme.amberLight, darkBg: '#2D2010', text: theme.amber, label: '👀 In Review' },
        late: { bg: theme.redLight, darkBg: '#2B0D0D', text: theme.red, label: '⚠️ Late' },
        missed: { bg: theme.redLight, darkBg: '#2B0D0D', text: theme.red, label: '❌ Missed' },
        write_again: { bg: theme.redLight, darkBg: '#2B0D0D', text: theme.red, label: '✍️ Write Again' },
        correct: { bg: theme.greenLight, darkBg: '#0D2B20', text: theme.green, label: '✅ Submitted' },
    };

    const s = (item.status === 'correct' && item.lateSubmission) ? statusConfig.late : statusConfig[item.status];
    const canSubmit = (item.status === 'pending' || item.status === 'write_again') && item.submissionType === 'ONLINE';
    const descLines = (item.description ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

    let daysHoursLeftLabel: string | null = null;
    if (item.dueDateIso) {
        const diffMs = new Date(item.dueDateIso).getTime() - Date.now();
        if (diffMs <= 0) {
            daysHoursLeftLabel = 'Overdue';
        } else {
            const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
            const days = Math.floor(totalHours / 24);
            const hours = totalHours % 24;
            daysHoursLeftLabel = days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;
        }
    }

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
        // padding: 0 + overflow: hidden here so the toggle below can be a
        // full-bleed footer strip (border-top spanning the whole card, no side
        // padding) exactly like the test card / web card — everything else
        // moves into the padded inner View instead of relying on the shared
        // Card's padding.
        <Card theme={theme} style={{ padding: 0, overflow: 'hidden' }}>
            <View style={{ padding: 16 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <View style={{
                    width: 42, height: 42, borderRadius: 12,
                    backgroundColor: isDark ? s.darkBg : s.bg,
                    alignItems: 'center', justifyContent: 'center',
                    marginTop: 2,
                }}>
                    {item.type === 'project'
                        ? <Zap size={20} color={s.text} />
                        : <FileEdit size={20} color={s.text} />
                    }
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text, lineHeight: 18 }}>{item.title}</Text>
                    <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>{item.subject}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={[styles.chip, { backgroundColor: isDark ? s.darkBg : s.bg }]}>
                        <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: s.text }}>{s.label}</Text>
                    </View>
                    {/* Manual "Mark Late" toggle (offline only) — only shown alongside Submitted, never on its own */}
                    {item.status === 'correct' && item.submissionType === 'OFFLINE' && item.offlineMarkedLate && (
                        <View style={[styles.chip, { backgroundColor: isDark ? '#2B0D0D' : theme.redLight }]}>
                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: theme.red }}>⚠️ Late</Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Info row */}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <View style={[styles.infoChip, { backgroundColor: item.submissionType === 'ONLINE' ? (isDark ? '#132339' : '#DBEAFE') : theme.bg }]}>
                    <Text style={[styles.infoChipText, { color: item.submissionType === 'ONLINE' ? '#3B82F6' : theme.subText, fontFamily: 'Poppins_700Bold' }]}>
                        {item.submissionType === 'ONLINE' ? '📤 Online' : '📝 Offline'}
                    </Text>
                </View>
                {item.dueDateIso && (
                    <View style={[styles.infoChip, { backgroundColor: theme.bg }]}>
                        <Calendar size={11} color={theme.muted} />
                        <Text style={[styles.infoChipText, { color: theme.subText }]}>
                            <Text style={{ fontFamily: 'Poppins_600SemiBold' }}>Due: </Text>
                            {fmtDate(item.dueDateIso)}, {fmtTime(item.dueDateIso)}
                        </Text>
                    </View>
                )}
                <View style={[styles.infoChip, { backgroundColor: theme.bg }]}>
                    <BarChart2 size={11} color={theme.muted} />
                    <Text style={[styles.infoChipText, { color: theme.subText }]}>{item.marks} marks</Text>
                </View>
                {!['correct', 'submitted', 'missed'].includes(item.status) && daysHoursLeftLabel && (
                    <View style={[styles.infoChip, { backgroundColor: theme.redLight }]}>
                        <Timer size={11} color={theme.red} />
                        <Text style={[styles.infoChipText, { color: theme.red, fontFamily: 'Poppins_700Bold' }]}>
                            {daysHoursLeftLabel}
                        </Text>
                    </View>
                )}
                {(item.attempts?.[0]?.submittedAt ?? item.submittedAt) && (
                    <View style={[styles.infoChip, { backgroundColor: 'rgba(192,96,64,0.12)' }]}>
                        <Calendar size={11} color={theme.muted} />
                        <Text style={[styles.infoChipText, { color: theme.subText }]}>
                            <Text style={{ fontFamily: 'Poppins_600SemiBold' }}>Submitted at : </Text>
                            {fmtDate((item.attempts?.[0]?.submittedAt ?? item.submittedAt)!)}, {fmtTime((item.attempts?.[0]?.submittedAt ?? item.submittedAt)!)}
                        </Text>
                    </View>
                )}
            </View>

            {/* Expanded */}
            {expanded && (
                <View style={{ gap: 10 }}>
                    {descLines.length > 0 && (
                        <View style={{ gap: 4 }}>
                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted, letterSpacing: 0.4 }}>DESCRIPTION</Text>
                            <View style={{ gap: 4 }}>
                                {descLines.map((line, i) => (
                                    <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                                        <View style={{ width: 5, height: 5, borderRadius: 99, backgroundColor: theme.purple, marginTop: 5 }} />
                                        <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text, lineHeight: 17 }}>{line}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* Latest online submission — resubmitting never erases the earlier upload,
                        it just pushes it into the collapsible history below. */}
                    {item.submittedFile && (
                        <View style={{ padding: 12, backgroundColor: theme.bg, borderRadius: 12, gap: 8 }}>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.muted }}>ONLINE SUBMISSION</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.text, flexShrink: 1 }} numberOfLines={1}>
                                    {(() => {
                                        const attemptNo = item.attempts?.[0]?.attemptNumber ?? 1;
                                        return attemptNo > 1 ? `Submission #${attemptNo} · ` : `Submission · `;
                                    })()}
                                    {(() => {
                                        const ts = item.attempts?.[0]?.submittedAt ?? item.submittedAt;
                                        return ts ? new Date(ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '';
                                    })()}
                                </Text>
                                <TouchableOpacity
                                    onPress={() => Linking.openURL(item.submittedFile!).catch(() => {})}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isDark ? '#241a3a' : '#EDE9FE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                                    <FileText size={11} color="#8B5CF6" />
                                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: '#8B5CF6' }}>View PDF</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Feedback for the latest/current submission — tied to this specific
                                attempt's own review, not a global note that would vanish on resubmit. */}
                            {(item.attempts?.[0]?.reviewStatus === 'CORRECT' || item.attempts?.[0]?.reviewStatus === 'WRITE_AGAIN') && (() => {
                                const at0 = item.attempts![0];
                                const isCorrect = at0.reviewStatus === 'CORRECT';
                                return (
                                    <View style={{ marginTop: -6 }}>
                                        <View style={{
                                            alignSelf: 'flex-start', marginBottom: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
                                            backgroundColor: isCorrect ? theme.greenLight : theme.redLight,
                                        }}>
                                            <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: isCorrect ? theme.green : theme.red }}>
                                                {isCorrect ? 'Approved' : 'Write Again'}
                                            </Text>
                                        </View>
                                        {at0.reviewNote && (
                                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', fontStyle: 'italic', color: theme.text, lineHeight: 18 }}>
                                                {at0.reviewNote}
                                            </Text>
                                        )}
                                    </View>
                                );
                            })()}

                            {/* Earlier submissions — collapsed by default. */}
                            {(item.attempts?.length ?? 0) > 1 && (
                                <View style={{ borderTopWidth: 1, borderTopColor: isDark ? '#2A2440' : '#E5E7EB', paddingTop: 8, gap: 6 }}>
                                    <TouchableOpacity onPress={() => setHistoryOpen(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        {historyOpen ? <ChevronUp size={11} color={theme.muted} /> : <ChevronDown size={11} color={theme.muted} />}
                                        <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted }}>
                                            {item.attempts!.length - 1} earlier submission{item.attempts!.length - 1 > 1 ? 's' : ''}
                                        </Text>
                                    </TouchableOpacity>
                                    {historyOpen && (
                                        <View style={{ gap: 6 }}>
                                            {item.attempts!.slice(1).map(at => (
                                                <View key={at.id} style={{ backgroundColor: isDark ? '#1A1530' : '#F3F4F6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                        <View style={{ flexShrink: 1 }}>
                                                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.subText }}>
                                                                #{at.attemptNumber} · {new Date(at.submittedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                                                            </Text>
                                                            {at.reviewStatus === 'CORRECT' && (
                                                                <View style={{ alignSelf: 'flex-start', marginTop: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: theme.greenLight }}>
                                                                    <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: theme.green }}>Approved</Text>
                                                                </View>
                                                            )}
                                                            {at.reviewStatus === 'WRITE_AGAIN' && (
                                                                <View style={{ alignSelf: 'flex-start', marginTop: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: theme.redLight }}>
                                                                    <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: theme.red }}>Write Again</Text>
                                                                </View>
                                                            )}
                                                        </View>
                                                        {at.fileUrl && (
                                                            <TouchableOpacity
                                                                onPress={() => Linking.openURL(at.fileUrl!).catch(() => {})}
                                                                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isDark ? '#241a3a' : '#EDE9FE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                                                                <FileText size={11} color="#8B5CF6" />
                                                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: '#8B5CF6' }}>View PDF</Text>
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                    {at.reviewNote && (
                                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', fontStyle: 'italic', color: theme.subText, marginTop: 4 }}>
                                                            {at.reviewNote}
                                                        </Text>
                                                    )}
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>
                    )}

                    {item.submissionType === 'ONLINE' && item.submittedFile ? (
                        <View style={{ padding: 12, backgroundColor: theme.bg, borderRadius: 12 }}>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 4 }}>OFFLINE COPY</Text>
                            {item.offlineSubmittedAt ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text, flexShrink: 1 }}>
                                        {`Marked received on ${new Date(item.offlineSubmittedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`}
                                    </Text>
                                    <CheckCircle2 size={13} color={theme.green} style={{ marginTop: -4 }} />
                                </View>
                            ) : (
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text }}>Not received</Text>
                            )}
                        </View>
                    ) : (
                        item.offlineSubmittedAt && (
                            <View style={{ padding: 12, backgroundColor: theme.bg, borderRadius: 12 }}>
                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 4 }}>OFFLINE COPY</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text, flexShrink: 1 }}>
                                        {`Marked received on ${new Date(item.offlineSubmittedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`}
                                    </Text>
                                    <CheckCircle2 size={13} color={theme.green} style={{ marginTop: -4 }} />
                                </View>
                            </View>
                        )
                    )}
                </View>
            )}

            <TouchableOpacity
                onPress={() => router.push({ pathname: '/assignment-webview', params: { assignmentId: item.id } })}
                style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.cardBorder,
                    marginTop: 12, marginBottom: 10,
                }}
            >
                <Eye size={14} color={theme.subText} />
                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>View</Text>
            </TouchableOpacity>

            {canSubmit && (
                <TouchableOpacity
                    onPress={handlePickAndUpload}
                    disabled={uploading}
                    style={[styles.ctaBtn, { backgroundColor: uploading ? theme.muted : '#7C3AED', marginBottom: 10 }]}
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
            {canSubmit && (
                <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted, textAlign: 'center', marginTop: -6, marginBottom: 4 }}>
                    PDF only · max 25 MB
                </Text>
            )}
            </View>

            {/* Expand toggle — full-bleed footer strip with a top border, matching
                the test card / web card exactly, instead of sitting inline with
                the padding. */}
            <TouchableOpacity
                onPress={() => setExpanded(!expanded)}
                activeOpacity={0.7}
                style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
                    paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.cardBorder,
                }}
            >
                {expanded ? <ChevronUp size={13} color={theme.muted} /> : <ChevronDown size={13} color={theme.muted} />}
                <Text style={[styles.expandText, { color: theme.muted }]}>{expanded ? 'Show less' : 'View details'}</Text>
            </TouchableOpacity>
        </Card>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
type MainTab = 'tests' | 'submissions';
type TestFilter = 'all' | 'live' | 'upcoming' | 'completed' | 'missed';
type SubFilter = 'all' | 'pending' | 'submitted' | 'write_again' | 'correct' | 'late' | 'missed' | 'offline_type' | 'online_type';

export default function Tasks() {
    const { isDark } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const showEntryCover = useTabEntryCover();

    const [mainTab, setMainTab] = useState<MainTab>('tests');
    const [testFilter, setTestFilter] = useState<TestFilter>('all');
    const [subFilter, setSubFilter] = useState<SubFilter>('all');

    const [tests, setTests] = useState<TestItem[]>([]);
    const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
    const [loadingTests, setLoadingTests] = useState(true);
    const [loadingSubmissions, setLoadingSubmissions] = useState(false);
    const [submissionsLoaded, setSubmissionsLoaded] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const scrollRef = useRef<ScrollView>(null);
    const navigation = useNavigation<any>();

    // Tapping the active tab's own icon again (standard behavior across
    // Instagram/YouTube/etc.) scrolls back to the top instead of doing nothing.
    useEffect(() => {
        const unsubscribe = navigation.addListener('tabPress', () => {
            if (navigation.isFocused()) {
                scrollRef.current?.scrollTo({ y: 0, animated: true });
            }
        });
        return unsubscribe;
    }, [navigation]);

    async function fetchTests() {
        try {
            setLoadingTests(true);
            const clientId = await getDeviceClientId();
            const res = await api.get('/student/tasks/tests', { params: { clientId } });
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

    async function onRefresh() {
        setRefreshing(true);
        try {
            const clientId = await getDeviceClientId();
            const tasks = [
                api.get('/student/tasks/tests', { params: { clientId } }).then(res => setTests((res.data.data ?? []).map(mapTest))),
            ];
            if (submissionsLoaded) {
                tasks.push(api.get('/student/tasks/assignments').then(res => setSubmissions((res.data.data ?? []).map(mapAssignment))));
            }
            await Promise.all(tasks);
        } catch {
            // leave existing data
        } finally {
            setRefreshing(false);
        }
    }

    function handleSwitchToSubmissions() {
        setMainTab('submissions');
        if (!submissionsLoaded) fetchSubmissions();
    }

    const liveCount = tests.filter(t => t.status === 'live').length;
    const upcomingCount = tests.filter(t => t.status === 'upcoming').length;
    const doneCount = tests.filter(t => t.status === 'completed').length;
    const pendingCount = submissions.filter(s => s.status === 'pending' || s.status === 'write_again').length;
    const subPendingCount = submissions.filter(s => s.status === 'pending').length;
    const subWriteAgainCount = submissions.filter(s => s.status === 'write_again').length;
    const subSubmittedCount = submissions.filter(s => s.status === 'correct').length;

    const filteredTests = testFilter === 'all'
        ? tests
        : testFilter === 'missed'
            ? tests.filter(t => t.status === 'completed' && t.attemptsUsed === 0)
            : tests.filter(t => t.status === testFilter);
    const filteredSubs = subFilter === 'all' ? submissions
        : subFilter === 'offline_type' ? submissions.filter(s => s.submissionType === 'OFFLINE')
        : subFilter === 'online_type' ? submissions.filter(s => s.submissionType === 'ONLINE')
        : submissions.filter(s => s.status === subFilter);

    const TEST_FILTERS: { key: TestFilter; label: string }[] = [
        { key: 'all', label: 'All' },
        { key: 'live', label: '🔴 Live' },
        { key: 'upcoming', label: '⏰ Upcoming' },
        { key: 'completed', label: '✅ Done' },
        { key: 'missed', label: '❌ Missed' },
    ];

    const SUB_FILTERS: { key: SubFilter; label: string }[] = [
        { key: 'all', label: 'All' },
        { key: 'pending', label: '⏳ Pending' },
        { key: 'submitted', label: '👀 In Review' },
        { key: 'write_again', label: '✍️ Write Again' },
        { key: 'correct', label: '✅ Submitted' },
        { key: 'late', label: '⚠️ Late' },
        { key: 'missed', label: '❌ Missed' },
        { key: 'offline_type', label: '📝 Offline' },
        { key: 'online_type', label: '📤 Online' },
    ];

    return (
        <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: Constants.statusBarHeight }]}>
            <ScreenHeader title="Tasks" />
            <View style={{ flex: 1, position: 'relative' }}>

            {/* ── Sticky header: summary banner + main tabs + filter chips stay
                pinned above the list while it scrolls underneath — mirrors the
                web page's `sticky top-0` header (summary strip + tab bar +
                filter chips). Lives outside the ScrollView so it never moves. ── */}
            <View style={[styles.body, { paddingTop: 6, paddingBottom: 10, gap: 10 }]}>

                {/* ── Summary Banner — Live/Upcoming/Done, mirrors the web
                    Tests & Exams card exactly. Only meaningful for the
                    Tests tab, so (like web) it's hidden on Submissions. ── */}
                {mainTab === 'tests' && (
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={[styles.summaryCard, { backgroundColor: isDark ? '#2B0D0D' : '#FEE2E2', flex: 1 }]}>
                            <Text style={{ fontSize: 22, fontFamily: 'Poppins_800ExtraBold', color: theme.red }}>{liveCount}</Text>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.red }}>Live</Text>
                        </View>
                        <View style={[styles.summaryCard, { backgroundColor: isDark ? '#2D2010' : '#FEF3C7', flex: 1 }]}>
                            <Text style={{ fontSize: 22, fontFamily: 'Poppins_800ExtraBold', color: theme.amber }}>{upcomingCount}</Text>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.amber }}>Upcoming</Text>
                        </View>
                        <View style={[styles.summaryCard, { backgroundColor: isDark ? '#0D2B20' : theme.greenLight, flex: 1 }]}>
                            <Text style={{ fontSize: 22, fontFamily: 'Poppins_800ExtraBold', color: theme.green }}>{doneCount}</Text>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.green }}>Done</Text>
                        </View>
                    </View>
                )}

                {/* ── Summary Banner — Pending/Write Again/Submitted, mirrors the
                    web Submissions card. Only meaningful for the Submissions
                    tab, so (like web) it's hidden on Tests. ── */}
                {mainTab === 'submissions' && (
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={[styles.summaryCard, { backgroundColor: isDark ? '#2B0D0D' : '#FEE2E2', flex: 1 }]}>
                            <Text style={{ fontSize: 22, fontFamily: 'Poppins_800ExtraBold', color: theme.red }}>{subWriteAgainCount}</Text>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.red }}>Write Again</Text>
                        </View>
                        <View style={[styles.summaryCard, { backgroundColor: isDark ? '#2D2010' : '#FEF3C7', flex: 1 }]}>
                            <Text style={{ fontSize: 22, fontFamily: 'Poppins_800ExtraBold', color: theme.amber }}>{subPendingCount}</Text>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.amber }}>Pending</Text>
                        </View>
                        <View style={[styles.summaryCard, { backgroundColor: isDark ? '#0D2B20' : theme.greenLight, flex: 1 }]}>
                            <Text style={{ fontSize: 22, fontFamily: 'Poppins_800ExtraBold', color: theme.green }}>{subSubmittedCount}</Text>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.green }}>Submitted</Text>
                        </View>
                    </View>
                )}

                {/* ── Main Tabs ── */}
                <View style={[styles.mainTabRow, { backgroundColor: isDark ? 'rgba(100,116,139,0.15)' : 'rgba(148,163,184,0.12)', borderColor: theme.cardBorder }]}>
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

                {/* ── Filter chips — depends on which tab is active ── */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        {mainTab === 'tests'
                            ? TEST_FILTERS.map(f => (
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
                            ))
                            : SUB_FILTERS.map(f => (
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
                            ))
                        }
                    </View>
                </ScrollView>
            </View>

            <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 30, gap: 12 }}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.purple} colors={[theme.purple]} />
                }
            >
                {/* ══ TESTS TAB ══ */}
                {mainTab === 'tests' && (
                    loadingTests
                        ? <ActivityIndicator color={theme.purple} style={{ marginTop: 20 }} />
                        : filteredTests.length === 0
                            ? <Text style={{ textAlign: 'center', color: theme.muted, fontFamily: 'Poppins_400Regular', marginTop: 20 }}>No tests found</Text>
                            : filteredTests.map(item => (
                                <TestCard key={item.id} item={item} theme={theme} isDark={isDark} />
                            ))
                )}

                {/* ══ SUBMISSIONS TAB ══ */}
                {mainTab === 'submissions' && (
                    loadingSubmissions
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
                )}
            </ScrollView>
            <TabEntryCover visible={showEntryCover} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    body: { padding: 14, gap: 14 },

    summaryCard: {
        borderRadius: 16, paddingVertical: 8, paddingHorizontal: 14,
        alignItems: 'center', gap: 2,
    },

    mainTabRow: {
        flexDirection: 'row',
        borderRadius: 999, borderWidth: 1,
        padding: 3, gap: 4,
    },
    mainTab: {
        flex: 1, paddingVertical: 8, borderRadius: 999,
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

    ctaBtnOutline: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, paddingVertical: 12, borderRadius: 14, borderWidth: 1,
    },
    ctaBtnOutlineText: { fontSize: 13, fontFamily: 'Poppins_700Bold' },

    expandRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
    expandText: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
});
