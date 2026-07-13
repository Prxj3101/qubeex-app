import { InlineWheel } from '@/components/InlineWheel';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useInstitution } from '@/context/InstitutionContext';
import { useStudent } from '@/context/StudentContext';
import { useTheme } from '@/context/ThemeContext';
import { FLAGS } from '@/data/flags';
import api from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
    Award,
    BarChart2, Bell, CalendarDays,
    ChevronRight, Copy,
    Flag, Hash, IndianRupee, LogOut,
    Settings, Star,
    Trophy,
    User
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');


const LIGHT = {
    bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE',
    text: '#0F172A', subText: '#64748B', muted: '#94A3B8',
    purple: '#7C3AED', purpleLight: '#EDE9FE',
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

// ─── Attendance Bar ───────────────────────────────────────────────────────────
// Same Safe/Condonation/Defaulter thresholds as the web app: >=75 green,
// 65-74 amber, <65 red.
function getAttendanceBarColor(value: number, theme: typeof LIGHT) {
    return value >= 75 ? theme.green : value >= 65 ? theme.amber : theme.red;
}

function AttendanceChart({ data, color, theme }: { data: { label: string; value: number; max: number; color?: string }[]; color: string; theme: typeof LIGHT }) {
    return (
        <View style={{ gap: 8, marginTop: 8 }}>
            {data.map((item) => {
                const barColor = item.color ?? color;
                return (
                    <View key={item.label} style={{ gap: 4 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 11, color: theme.subText, fontFamily: 'Poppins_400Regular' }}>{item.label}</Text>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: barColor }}>{item.value}%</Text>
                        </View>
                        <View style={{ height: 7, backgroundColor: theme.cardBorder, borderRadius: 99, overflow: 'hidden' }}>
                            <View style={{ width: `${(item.value / item.max) * 100}%`, height: '100%', backgroundColor: barColor, borderRadius: 99 }} />
                            {/* 75% threshold marker — same as the web app's bars */}
                            <View style={{ position: 'absolute', left: '75%', top: 0, bottom: 0, width: 1, backgroundColor: theme.subText, opacity: 0.3 }} />
                        </View>
                    </View>
                );
            })}
        </View>
    );
}

// School attendance tracking starts in June (0-indexed month 5). The
// attendance card shows a rolling 4-month window: it stays pinned at
// [Jun, Jul, Aug, Sep] until the school year is more than 3 months in, then
// slides forward one month at a time (current month + previous 3) — e.g.
// Oct -> [Jul..Oct], Nov -> [Aug..Nov]. Same logic as the web app.
const SCHOOL_START_MONTH = 5;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getAttendanceWindowMonths(date: Date) {
    const currentMonthIdx = date.getMonth();
    let monthsSinceStart = currentMonthIdx - SCHOOL_START_MONTH;
    if (monthsSinceStart < 0) monthsSinceStart += 12;
    const windowStartOffset = monthsSinceStart <= 3 ? 0 : monthsSinceStart - 3;
    return Array.from({ length: 4 }, (_, i) => MONTH_NAMES[(SCHOOL_START_MONTH + windowStartOffset + i) % 12]);
}

// ─── Subject Performance Data ─────────────────────────────────────────────────
type MarksMode = 'offline' | 'online' | 'combined';

const SUBJECT_COLORS = ['#DA7756','#EC4899','#0891B2','#7C3AED','#059669','#0EA5E9','#6366F1','#D97706','#16A34A','#E11D48','#7C3AED','#0284C7'];

interface MarksheetSubject {
    id: string; name: string; code: string; color: string | null;
    total: { scored: number; max: number }; pct: number | null; grade: string;
}

// InlineWheel picker now lives in components/InlineWheel.tsx (shared with class.tsx).

// ─── Subject Performance Chart ────────────────────────────────────────────────
function SubjectPerformanceChart({
    data, theme, avg,
}: {
    data: { code: string; name: string; color: string; pct: number }[];
    theme: typeof LIGHT;
    avg: number;
}) {
    const maxBarHeight = 110;
    const topPad = 16;
    const barColWidth = 30;
    const gap = 8;
    const totalBarsWidth = data.length * barColWidth + (data.length - 1) * gap;
    const yTicks = [100, 75, 50, 25, 0];

    if (data.length === 0) {
        return (
            <View style={{ height: 140, alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
                <BarChart2 size={32} color={theme.subText} />
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: theme.subText, marginTop: 8 }}>No results published yet</Text>
            </View>
        );
    }

    return (
        <View style={{ marginTop: 4 }}>
            <View style={{ flexDirection: 'row' }}>
                {/* Y axis */}
                <View style={{ width: 22, height: maxBarHeight, marginTop: topPad, justifyContent: 'space-between' }}>
                    {yTicks.map(t => (
                        <Text key={t} style={{ fontSize: 8, fontFamily: 'Poppins_400Regular', color: theme.subText, textAlign: 'right' }}>
                            {t}
                        </Text>
                    ))}
                </View>

                {/* Scrollable bars + x-axis */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, marginLeft: 4 }}>
                    <View>
                        <View style={{ width: totalBarsWidth, height: topPad + maxBarHeight, flexDirection: 'row', alignItems: 'flex-end', gap }}>
                            {/* Grid lines */}
                            {yTicks.map(t => (
                                <View key={t} pointerEvents="none" style={{
                                    position: 'absolute', left: 0, right: 0,
                                    top: topPad + maxBarHeight - (t / 100) * maxBarHeight,
                                    height: 1, backgroundColor: theme.cardBorder, opacity: t === 0 ? 0 : 0.7,
                                }} />
                            ))}
                            {data.map((d, i) => {
                                const barHeight = Math.max(4, (d.pct / 100) * maxBarHeight);
                                return (
                                    <View key={i} style={{ width: barColWidth, alignItems: 'center' }}>
                                        <Text style={{ fontSize: 9, fontFamily: 'Poppins_600SemiBold', color: theme.text, marginBottom: 3 }}>
                                            {d.pct}%
                                        </Text>
                                        <LinearGradient
                                            colors={[d.color, d.color + '73']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 0, y: 1 }}
                                            style={{ width: '60%', height: barHeight, borderRadius: 4 }}
                                        />
                                    </View>
                                );
                            })}
                        </View>

                        {/* X axis labels — full subject name, wrapping in 2 lines */}
                        <View style={{ width: totalBarsWidth, flexDirection: 'row', gap, marginTop: 6 }}>
                            {data.map((d, i) => (
                                <View key={i} style={{ width: barColWidth, alignItems: 'center' }}>
                                    <Text style={{ fontSize: 8, fontFamily: 'Poppins_600SemiBold', color: theme.subText, textAlign: 'center' }} numberOfLines={2}>
                                        {d.name}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>
                </ScrollView>
            </View>

            {/* Avg dashed line */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
                    {Array.from({ length: 20 }).map((_, i) => (
                        <View key={i} style={{ flex: 1, height: 1.5, backgroundColor: theme.purple, opacity: 0.6 }} />
                    ))}
                </View>
                <Text style={{ fontSize: 10, color: theme.purple, fontFamily: 'Poppins_600SemiBold' }}>
                    Avg {avg}%
                </Text>
            </View>
        </View>
    );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, theme }: { icon: React.ReactNode; title: string; theme: typeof LIGHT }) {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            {icon}
            <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>{title}</Text>
        </View>
    );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function Card({ children, theme, style }: { children: React.ReactNode; theme: typeof LIGHT; style?: object }) {
    return (
        <View style={[{ backgroundColor: theme.card, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: theme.cardBorder, shadowColor: theme.purple, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }, style]}>
            {children}
        </View>
    );
}

// ─── ID Card ──────────────────────────────────────────────────────────────────
function IDCard({ student, theme, isDark, router }: { student: any; theme: typeof LIGHT; isDark: boolean; router: any }) {
    const [copied, setCopied] = useState(false);
    const { photo } = useStudent();
    const dobDate = new Date(student.dob);
    const age = new Date().getFullYear() - dobDate.getFullYear();
    const dobDisplay = dobDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const classNum = student.standard.replace(/^Class\s*/i, '');
    const divLetter = student.div.replace(/^Division\s*/i, '');
    const classDiv = `${classNum}-${divLetter}`;

    return (
        <View style={{ paddingHorizontal: 14, paddingTop: 6 }}>
            <View style={[idStyles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, shadowColor: theme.purple }]}>
                <LinearGradient
                    colors={isDark ? ['#4C1D95', '#2D1F50'] : ['#7C3AED', '#5B21B6']}
                    style={idStyles.strip}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                >
                    <View>
                        <Text style={idStyles.instituteName}>{student.institutionName || 'School'}</Text>
                        <Text style={idStyles.instituteTag}>Student ID Card</Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => router.push('/student_detail')}
                        style={{
                            backgroundColor: 'rgba(255,255,255,0.2)',
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 99,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                        }}
                    >
                        <Text style={{ fontSize: 11, lineHeight: 13, includeFontPadding: false, fontFamily: 'Poppins_600SemiBold', color: 'white' }}>
                            View
                        </Text>
                        <ChevronRight size={12} color="white" />
                    </TouchableOpacity>
                </LinearGradient>

                <View style={idStyles.body}>
                    <View style={idStyles.avatarSection}>
                        <View style={idStyles.avatarWrap}>
                            <LinearGradient colors={['#A78BFA', '#7C3AED']} style={idStyles.avatar}>
                                {photo
                                    ? <Image source={{ uri: photo }} style={idStyles.avatarImage} />
                                    : (
                                        <Text style={idStyles.avatarText}>
                                            {student.name.split(' ').map((n: string) => n[0]).join('')}
                                        </Text>
                                    )
                                }
                            </LinearGradient>
                            <View style={[idStyles.onlineDot, { backgroundColor: theme.green, borderColor: theme.card }]} />
                        </View>
                        <View style={[idStyles.batchBadge, { backgroundColor: theme.purpleLight }]}>
                            <Text style={[idStyles.batchBadgeText, { color: theme.purple }]}>
                                {student.standard}
                            </Text>
                        </View>
                    </View>

                    <View style={idStyles.infoSection}>
                        <Text style={[idStyles.name, { color: theme.text }]}>{student.name}</Text>
                        <Text style={[idStyles.semDiv, { color: theme.purple }]}>
                            {student.standard} · {student.div}
                        </Text>
                        <View style={[idStyles.divider, { backgroundColor: theme.cardBorder }]} />
                        {[
                            { label: 'Roll No', value: student.rollNo },
                            { label: 'Class', value: classDiv },
                            { label: 'Admission Year', value: student.admissionYear },
                            { label: 'Date of Birth', value: `${dobDisplay} (${age} yrs)` },
                            { label: 'Email', value: student.email },
                        ].map((item) => (
                            <View key={item.label} style={idStyles.infoRow}>
                                <Text style={[idStyles.infoLabel, { color: theme.muted }]}>{item.label}</Text>
                                <Text style={[idStyles.infoValue, { color: theme.text }]}>{item.value}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                <View style={[idStyles.dot1, { backgroundColor: theme.cardBorder }]} />
                <View style={[idStyles.dot2, { backgroundColor: theme.cardBorder }]} />

                {/* UID strip */}
                <View style={[idStyles.uidStrip, { backgroundColor: theme.purpleLight, borderTopColor: theme.cardBorder }]}>
                    <Hash size={14} color={theme.muted} />
                    <Text style={[idStyles.uidText, { color: '#DA7756' }]}>{student.uid}</Text>
                    <TouchableOpacity
                        onPress={async () => {
                            await Clipboard.setStringAsync(student.uid);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                        }}
                        style={[idStyles.copyBtn, { backgroundColor: theme.card }]}
                    >
                        <Copy size={11} color={theme.muted} />
                        <Text style={[idStyles.copyBtnText, { color: theme.muted }]}>{copied ? 'Copied!' : 'Copy'}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const idStyles = StyleSheet.create({
    card: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 },
    strip: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    instituteName: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: 'white' },
    instituteTag: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.75)' },
    body: { flexDirection: 'row', padding: 16, gap: 16 },
    avatarSection: { alignItems: 'center', gap: 8 },
    avatarWrap: { width: 72, height: 72, position: 'relative' },
    avatar: { width: 72, height: 72, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatarImage: { width: '100%', height: '100%' },
    avatarText: { fontSize: 24, fontFamily: 'Poppins_700Bold', color: 'white' },
    onlineDot: { position: 'absolute', bottom: -4, right: -4, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: 'white' },
    batchBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 },
    batchBadgeText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold' },
    infoSection: { flex: 1, gap: 3 },
    name: { fontSize: 15, fontFamily: 'Poppins_700Bold', lineHeight: 20 },
    semDiv: { fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
    divider: { height: 1, marginVertical: 6 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    infoLabel: { fontSize: 10, fontFamily: 'Poppins_400Regular' },
    infoValue: { fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
    dot1: { position: 'absolute', width: 60, height: 60, borderRadius: 30, top: -20, right: -20, opacity: 0.3 },
    dot2: { position: 'absolute', width: 40, height: 40, borderRadius: 20, bottom: 30, left: -15, opacity: 0.2 },
    uidStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
    uidText: { flex: 1, fontSize: 13, fontFamily: 'RobotoMono_600SemiBold', letterSpacing: 0.8 },
    copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    copyBtnText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold' },
});

// ─── Attendance types ─────────────────────────────────────────────────────────
interface AttendanceMonth {
    month: string; key: number; year: number;
    present: number; absent: number; leave: number; total: number;
    pct: number | null;
}
interface AttendanceData {
    academicYear: string; startYear: number;
    overall: { present: number; absent: number; leave: number; total: number; pct: number | null };
    monthly: AttendanceMonth[];
    daily: Record<string, string>;
    holidays: { date: string; name: string }[];
    student: { name: string; rollNo: string };
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function Profile() {
    const { isDark } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const [marksMode, setMarksMode] = useState<MarksMode>('combined');
    const router = useRouter();
    const { clearInstitution } = useInstitution();
    const { profile, fetchProfile } = useStudent();
    const [attendanceVisible, setAttendanceVisible] = useState(false);
    const [activeTrendPoint, setActiveTrendPoint] = useState<number | null>(null);
    const [attendanceApiData, setAttendanceApiData] = useState<AttendanceData | null>(null);
    const [marksheetData, setMarksheetData] = useState<{ subjects: MarksheetSubject[]; grandPct: number | null; classRank: number | null; classSize: number | null } | null>(null);

    const fadeAnim = useRef(new Animated.Value(0)).current;

    useFocusEffect(
        React.useCallback(() => {
            fetchProfile();
            api.get('/student/attendance')
                .then(r => setAttendanceApiData(r.data.data))
                .catch(() => {});
            api.get('/student/marksheet')
                .then(r => setMarksheetData(r.data.data))
                .catch(() => {});
            setAttendanceVisible(false);
            fadeAnim.setValue(0);
            setTimeout(() => setAttendanceVisible(true), 500);
            return () => { };
        }, [])
    );
    useEffect(() => {
        if (attendanceVisible) {
            Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
        }
    }, [attendanceVisible]);

    const student = {
        name: profile?.name ?? '',
        rollNo: profile?.rollNo ?? '',
        standard: profile?.standard ?? '',
        div: (() => { const d = profile?.division ?? ''; const parts = d.split('-'); return parts.length > 1 ? `Division ${parts.slice(1).join('-')}` : d ? `Division ${d}` : ''; })(),
        dob: profile?.dob ?? '',
        email: profile?.email ?? '',
        uid: profile?.studentId ?? '',
        institutionName: profile?.institutionName ?? '',
        admissionYear: profile?.admissionYear ?? '',
    };

    const subjectChartData = (marksheetData?.subjects ?? []).map((s, i) => {
        const offline = s.pct ?? 0;
        const online = 0; // online marks not yet implemented
        const pct = marksMode === 'offline' ? offline : marksMode === 'online' ? online : Math.round((offline + online) / 2);
        return { code: s.code, name: s.name, color: s.color ?? SUBJECT_COLORS[i % SUBJECT_COLORS.length], pct };
    });
    const overallScore = subjectChartData.length > 0
        ? Math.round(subjectChartData.reduce((a, b) => a + b.pct, 0) / subjectChartData.length)
        : 0;
    const overallRank: number | null = marksheetData?.classRank ?? null;

    // Full school-year attendance trend derived from real API data.
    // Future months (no records yet) show 0 so the graph maintains its shape.
    const attendanceTrend = React.useMemo(() => {
        const MONTHS = ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'];
        return MONTHS.map(m => {
            const found = attendanceApiData?.monthly.find(x => x.month === m);
            return { month: m, value: found?.pct ?? 0 };
        });
    }, [attendanceApiData]);

    const overallAttendancePct = attendanceApiData?.overall.pct ?? null;

    // Rolling 4-month window bars — current window of months, real pct values.
    const attendanceData = getAttendanceWindowMonths(new Date()).map(month => {
        const found = attendanceApiData?.monthly.find(x => x.month === month);
        const value = found?.pct ?? 0;
        return { label: month, value, max: 100, color: getAttendanceBarColor(value, theme) };
    });

    const achievements = [
        { icon: '🏆', title: 'Top 5 Overall', desc: 'Ranked 4th in batch', date: 'Mar 2025' },
        { icon: '🎯', title: 'Perfect Score', desc: '100% in DBMS Quiz 1', date: 'Jan 2025' },
        { icon: '📜', title: 'Hackathon Winner', desc: 'Smart India Hackathon 2024', date: 'Dec 2024' },
    ];

    const getRankColor = (rank: number | null) => {
        if (rank === null) return theme.subText;
        if (rank === 1) return theme.amber;
        if (rank <= 3) return theme.purple;
        if (rank <= 10) return theme.blue;
        return theme.subText;
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
            <ScreenHeader title="Profile" />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>

                <IDCard student={student} theme={theme} isDark={isDark} router={router} />

                <View style={styles.body}>

                    {/* Rank + Score */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Card theme={theme} style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <Trophy size={14} color={theme.amber} />
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Overall Rank</Text>
                            </View>
                            <Text style={{ fontSize: 32, fontFamily: 'Poppins_800ExtraBold', color: getRankColor(overallRank) }}>{overallRank === null ? '—' : `#${overallRank}`}</Text>
                            <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>Overall rank</Text>
                        </Card>

                        <Card theme={theme} style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <Star size={14} color={theme.amber} fill={theme.amber} />
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Overall Score</Text>
                            </View>
                            <Text style={{ fontSize: 32, fontFamily: 'Poppins_800ExtraBold', color: theme.purple }}>{overallScore}%</Text>
                            <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>across all subjects</Text>
                        </Card>
                    </View>

                    {/* Subject Performance */}
                    <Card theme={theme}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <BarChart2 size={16} color={theme.purple} />
                                <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>Subject Performance</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => router.push('/report_card')}
                                style={{
                                    backgroundColor: theme.cardBorder,
                                    paddingHorizontal: 10,
                                    paddingVertical: 5,
                                    borderRadius: 99,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4,
                                }}
                            >
                                <Text style={{ fontSize: 11, lineHeight: 13, includeFontPadding: false, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>View Report Card</Text>
                                <ChevronRight size={12} color={theme.text} />
                            </TouchableOpacity>
                        </View>

                        <View style={{ marginBottom: 12 }}>
                            <InlineWheel
                                options={['combined', 'offline', 'online']}
                                value={marksMode}
                                onChange={(v) => setMarksMode(v as MarksMode)}
                                isDark={isDark}
                                theme={theme}
                            />
                        </View>

                        <SubjectPerformanceChart data={subjectChartData} theme={theme} avg={overallScore} />
                    </Card>

                    {/* Attendance */}
                    <Card theme={theme}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <CalendarDays size={16} color={theme.green} />
                                <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}> Attendance</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => router.push('/attendance_detail')}
                                style={{
                                    backgroundColor: theme.cardBorder,
                                    paddingHorizontal: 10,
                                    paddingVertical: 5,
                                    borderRadius: 99,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4,
                                }}
                            >
                                <Text style={{ fontSize: 11, lineHeight: 13, includeFontPadding: false, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>View Details</Text>
                                <ChevronRight size={12} color={theme.text} />
                            </TouchableOpacity>
                        </View>
                        <AttendanceChart data={attendanceData} color={theme.green} theme={theme} />

                        {/* Overall attendance */}
                        <View style={{ marginTop: 12, padding: 10, backgroundColor: theme.greenLight, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.green }}>Overall Attendance</Text>
                            <Text style={{ fontSize: 16, fontFamily: 'Poppins_800ExtraBold', color: theme.green }}>
                                {overallAttendancePct !== null ? `${overallAttendancePct}%` : '—'}
                            </Text>
                        </View>

                        {/* Trend Graph */}
                        <View onLayout={() => {
                            setTimeout(() => setAttendanceVisible(true), 1000);
                        }}>
                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text, marginTop: 16, marginBottom: 4 }}>
                                Overall Attendance Trend
                            </Text>
                            <Animated.View style={{ opacity: fadeAnim, flexDirection: 'row' }}>
                                {/* Fixed Y axis — a ghost chart-kit chart with an invisible line,
                                    clipped to just its label gutter, so the numbers never move. */}
                                <View style={{ width: 34, height: 180, overflow: 'hidden' }}>
                                    <LineChart
                                        data={{
                                            labels: attendanceTrend.map(d => d.month),
                                            datasets: [{ data: attendanceTrend.map(d => d.value), color: () => 'transparent', strokeWidth: 0 }],
                                        }}
                                        width={120}
                                        height={180}
                                        yAxisSuffix="%"
                                        chartConfig={{
                                            backgroundColor: 'transparent',
                                            backgroundGradientFrom: theme.card,
                                            backgroundGradientTo: theme.card,
                                            decimalPlaces: 0,
                                            color: () => 'transparent',
                                            labelColor: () => theme.subText,
                                            propsForDots: { r: '0' },
                                            propsForBackgroundLines: { stroke: 'transparent' },
                                            propsForLabels: { fontSize: 9, fontFamily: 'Poppins_400Regular' },
                                        }}
                                        style={{ paddingRight: 34, paddingTop: 16 }}
                                        withVerticalLabels={false}
                                        withInnerLines={false}
                                        withOuterLines={false}
                                        withShadow={false}
                                        withDots={false}
                                        fromZero={true}
                                        segments={5}
                                    />
                                </View>

                                {/* Scrollable line — exact same style as the Performance Trend
                                    chart in Class > Subjects, just hiding its own y-axis since
                                    the ghost chart above already provides it. */}
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, marginLeft: -11 }}>
                                <View style={{ width: attendanceTrend.length * 56 }}>
                                    <LineChart
                                        onDataPointClick={({ index }) => {
                                            setActiveTrendPoint(prev => prev === index ? null : index);
                                        }}
                                        renderDotContent={({ x, y, index, indexData }) => {
                                            // Tapped point — like hovering a point on the web graph,
                                            // shows that month's exact detail.
                                            if (activeTrendPoint === index) {
                                                const chartWidth = attendanceTrend.length * 56;
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
                                                        <Text style={{ fontSize: 9, color: theme.card, fontFamily: 'Poppins_600SemiBold' }}>
                                                            {attendanceTrend[index].month}
                                                        </Text>
                                                        <Text style={{ fontSize: 11, color: theme.card, fontFamily: 'Poppins_700Bold' }}>
                                                            {indexData}%
                                                        </Text>
                                                    </View>
                                                );
                                            }

                                            const data = attendanceTrend.map(d => d.value);
                                            const max = Math.max(...data);
                                            const min = Math.min(...data);
                                            if (indexData !== max && indexData !== min) return null;
                                            const isMin = indexData === min;
                                            return (
                                                <View
                                                    key={index}
                                                    style={{
                                                        position: 'absolute',
                                                        top: isMin ? y + 6 : y - 22,
                                                        left: x - 12,
                                                        backgroundColor: isMin ? theme.red : theme.green,
                                                        paddingHorizontal: 4,
                                                        paddingVertical: 2,
                                                        borderRadius: 4,
                                                    }}
                                                >
                                                    <Text style={{
                                                        fontSize: 9,
                                                        color: 'white',
                                                        fontFamily: 'Poppins_600SemiBold',
                                                    }}>
                                                        {indexData}%
                                                    </Text>
                                                </View>
                                            );
                                        }}
                                        data={{
                                            labels: attendanceTrend.map(d => d.month),
                                            datasets: [{
                                                data: attendanceTrend.map(d => d.value),
                                                color: () => theme.green,
                                                strokeWidth: 2,
                                            }],
                                        }}
                                        width={attendanceTrend.length * 56}
                                        height={180}
                                        yAxisSuffix="%"
                                        chartConfig={{
                                            backgroundColor: 'transparent',
                                            backgroundGradientFrom: theme.card,
                                            backgroundGradientTo: theme.card,
                                            decimalPlaces: 0,
                                            color: () => theme.green,
                                            fillShadowGradient: theme.green,
                                            fillShadowGradientOpacity: 0.15,
                                            labelColor: () => theme.subText,
                                            propsForDots: {
                                                r: '4',
                                                strokeWidth: '2',
                                                stroke: theme.card,
                                                fill: theme.green,
                                            },
                                            propsForBackgroundLines: {
                                                stroke: theme.cardBorder,
                                                strokeWidth: 1,
                                                strokeDasharray: '',
                                            },
                                            propsForLabels: {
                                                fontSize: 9,
                                                fontFamily: 'Poppins_400Regular',
                                            },
                                        }}
                                        bezier
                                        style={{
                                            borderRadius: 12,
                                            paddingRight: 16,
                                            paddingTop: 16,
                                        }}
                                        fromZero={true}
                                        withInnerLines={true}
                                        withHorizontalLabels={false}
                                        segments={5}
                                    />

                                    {/* Explicit tap targets — chart-kit's own SVG onPress can get
                                        swallowed by the horizontal ScrollView's gesture handling,
                                        so we detect taps ourselves, one column per month. */}
                                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' }}>
                                        {attendanceTrend.map((d, i) => (
                                            <TouchableOpacity
                                                key={i}
                                                activeOpacity={1}
                                                style={{ width: 56, height: '100%' }}
                                                onPress={() => setActiveTrendPoint(prev => prev === i ? null : i)}
                                            />
                                        ))}
                                    </View>
                                </View>
                                </ScrollView>
                            </Animated.View>

                            {/* Legend — same Good/Condonation/Defaulter thresholds as the web app */}
                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                                {[
                                    { label: 'Good ≥75%', color: theme.green },
                                    { label: 'Condonation 65–74%', color: theme.amber },
                                    { label: 'Defaulter <65%', color: theme.red },
                                ].map(l => (
                                    <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: l.color }} />
                                        <Text style={{ fontSize: 9, color: theme.subText, fontFamily: 'Poppins_400Regular' }}>{l.label}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    </Card>


                    {/* FLAGS */}
                    <Card theme={theme}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Flag size={16} color={theme.red} />
                                <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>Remarks: Flags & Warnings</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => router.push('/flags')}
                                style={{
                                    backgroundColor: theme.cardBorder,
                                    paddingHorizontal: 10,
                                    paddingVertical: 5,
                                    borderRadius: 99,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4,
                                }}
                            >
                                <Text style={{ fontSize: 11, lineHeight: 13, includeFontPadding: false, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>View All</Text>
                                <ChevronRight size={12} color={theme.text} />
                            </TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: theme.amberLight, borderRadius: 12 }}>
                                <View style={{ width: 12, height: 18, borderRadius: 2, backgroundColor: '#FCFF38', transform: [{ rotate: '-5deg' }], shadowColor: '#000', shadowOffset: { width: 1, height: 2 }, shadowOpacity: 0.4, shadowRadius: 2, elevation: 4 }} />
                                <View>
                                    <Text style={{ fontSize: 18, fontFamily: 'Poppins_800ExtraBold', color: theme.amber }}>
                                        {FLAGS.filter(f => f.type === 'yellow').length}
                                    </Text>
                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.amber }}>Yellow Cards</Text>
                                </View>
                            </View>
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: theme.redLight, borderRadius: 12 }}>
                                <View style={{ width: 12, height: 18, borderRadius: 2, backgroundColor: '#DC2626', transform: [{ rotate: '-5deg' }], shadowColor: '#000', shadowOffset: { width: 1, height: 2 }, shadowOpacity: 0.4, shadowRadius: 2, elevation: 4 }} />
                                <View>
                                    <Text style={{ fontSize: 18, fontFamily: 'Poppins_800ExtraBold', color: theme.red }}>
                                        {FLAGS.filter(f => f.type === 'red').length}
                                    </Text>
                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.red }}>Red Cards</Text>
                                </View>
                            </View>
                        </View>
                        {FLAGS.length === 0 ? (
                            <View style={{ alignItems: 'center', padding: 16 }}>
                                <Text style={{ fontSize: 28 }}>✅</Text>
                                <Text style={{ fontSize: 12, color: theme.muted, fontFamily: 'Poppins_400Regular', marginTop: 4 }}>No FLAGS! Keep it up.</Text>
                            </View>
                        ) : (
                            <View style={{ gap: 8 }}>
                                {[
                                    [...FLAGS].filter(f => f.type === 'yellow').sort((a, b) => new Date(a.date).getTime() < new Date(b.date).getTime() ? 1 : -1)[0],
                                    [...FLAGS].filter(f => f.type === 'red').sort((a, b) => new Date(a.date).getTime() < new Date(b.date).getTime() ? 1 : -1)[0],
                                ].filter((f): f is typeof FLAGS[0] => f !== undefined).map((flag, i) => (
                                    <View key={i} style={{ flexDirection: 'row', gap: 10, padding: 10, backgroundColor: flag.type === 'yellow' ? theme.amberLight : theme.redLight, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: flag.type === 'yellow' ? theme.amber : theme.red }}>
                                        <View style={{
                                            width: 14,
                                            height: 20,
                                            borderRadius: 2,
                                            backgroundColor: flag.type === 'yellow' ? '#fcff38ff' : '#DC2626', transform: [{ rotate: '-5deg' }],
                                            marginTop: 1,
                                            shadowColor: '#000',
                                            shadowOffset: { width: 1, height: 2 },
                                            shadowOpacity: 0.4,
                                            shadowRadius: 2,
                                            elevation: 4,

                                        }} >
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{flag.title}</Text>
                                            <Text style={{ fontSize: 10, color: theme.muted, fontFamily: 'Poppins_400Regular', marginTop: 2 }}>{flag.date}</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}
                    </Card>

                    {/* ── Fees Summary ── */}
                    <Card theme={theme}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <IndianRupee size={16} color={theme.green} />
                                <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>Fees</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => router.push('/fees_detail')}
                                style={{ backgroundColor: theme.cardBorder, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                            >
                                <Text style={{ fontSize: 11, lineHeight: 13, includeFontPadding: false, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>Pay Fees</Text>
                                <ChevronRight size={12} color={theme.text} />
                            </TouchableOpacity>
                        </View>

                        {/* Term progress bars */}
                        {[
                            { label: 'Term 1', range: 'June – October',  paidMonths: 5, totalMonths: 5  },
                            { label: 'Term 2', range: 'November – May',   paidMonths: 2, totalMonths: 7  },
                        ].map((term, i) => {
                            const pct = Math.round((term.paidMonths / term.totalMonths) * 100);
                            const cleared = term.paidMonths === term.totalMonths;
                            return (
                                <View key={i} style={{ padding: 10, backgroundColor: theme.bg, borderRadius: 14, marginBottom: 8, gap: 6 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <View>
                                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{term.label}</Text>
                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{term.range}</Text>
                                        </View>
                                        <View style={{ backgroundColor: cleared ? theme.greenLight : term.paidMonths === 0 ? theme.redLight : theme.amberLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 }}>
                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: cleared ? theme.green : term.paidMonths === 0 ? theme.red : theme.amber }}>
                                                {cleared ? '✅ Paid' : `${term.paidMonths}/${term.totalMonths} paid`}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={{ height: 5, backgroundColor: theme.cardBorder, borderRadius: 99, overflow: 'hidden' }}>
                                        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: cleared ? theme.green : theme.amber, borderRadius: 99 }} />
                                    </View>
                                </View>
                            );
                        })}

                        {/* Monthly payment schedule table */}
                        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: theme.cardBorder, overflow: 'hidden', marginTop: 4 }}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
                                <View>
                                    {/* Header — fixed */}
                                    <View style={{ flexDirection: 'row', backgroundColor: theme.bg, borderBottomWidth: 1, borderBottomColor: theme.cardBorder }}>
                                        {[['Month', 75], ['Amount', 75], ['Due Date', 95], ['Paid Date', 95], ['Status', 100]].map(([col, w], i) => (
                                            <Text key={i} style={{ width: w as number, paddingHorizontal: 8, paddingVertical: 8, fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted }}>{col}</Text>
                                        ))}
                                    </View>
                                    {/* Body — fixed height vertical scroll */}
                                    <ScrollView style={{ height: 280 }} showsVerticalScrollIndicator nestedScrollEnabled bounces={false}>
                                        {[
                                            { month: 'June',      dueDate: '10 Jun 2025', amount: 6700, status: 'PAID',    paidDate: '8 Jun 2025'  },
                                            { month: 'July',      dueDate: '10 Jul 2025', amount: 6700, status: 'PAID',    paidDate: '9 Jul 2025'  },
                                            { month: 'August',    dueDate: '10 Aug 2025', amount: 6700, status: 'PAID',    paidDate: '7 Aug 2025'  },
                                            { month: 'September', dueDate: '10 Sep 2025', amount: 6700, status: 'PAID',    paidDate: '9 Sep 2025'  },
                                            { month: 'October',   dueDate: '10 Oct 2025', amount: 6700, status: 'PAID',    paidDate: '8 Oct 2025'  },
                                            { month: 'November',  dueDate: '10 Nov 2025', amount: 6700, status: 'PAID',    paidDate: '10 Nov 2025' },
                                            { month: 'December',  dueDate: '10 Dec 2025', amount: 6700, status: 'PAID',    paidDate: '9 Dec 2025'  },
                                            { month: 'January',   dueDate: '10 Jan 2026', amount: 6700, status: 'PENDING', paidDate: undefined      },
                                            { month: 'February',  dueDate: '10 Feb 2026', amount: 6700, status: 'PENDING', paidDate: undefined      },
                                            { month: 'March',     dueDate: '10 Mar 2026', amount: 6700, status: 'PENDING', paidDate: undefined      },
                                            { month: 'April',     dueDate: '10 Apr 2026', amount: 6700, status: 'PENDING', paidDate: undefined      },
                                            { month: 'May',       dueDate: '10 May 2026', amount: 6700, status: 'PENDING', paidDate: undefined      },
                                        ].map((m, i, arr) => (
                                            <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: theme.cardBorder }}>
                                                <Text style={{ width: 75,  paddingHorizontal: 8, paddingVertical: 8, fontSize: Platform.OS === 'ios' ? 12 : 11, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{m.month}</Text>
                                                <Text style={{ width: 75,  paddingHorizontal: 8, paddingVertical: 8, fontSize: Platform.OS === 'ios' ? 12 : 11, fontFamily: 'Poppins_400Regular',  color: theme.text }}>₹{m.amount.toLocaleString()}</Text>
                                                <Text style={{ width: 95,  paddingHorizontal: 8, paddingVertical: 8, fontSize: Platform.OS === 'ios' ? 12 : 11, fontFamily: 'Poppins_400Regular',  color: theme.muted }}>{m.dueDate}</Text>
                                                <Text style={{ width: 95,  paddingHorizontal: 8, paddingVertical: 8, fontSize: Platform.OS === 'ios' ? 12 : 11, fontFamily: 'Poppins_400Regular',  color: theme.muted }}>{m.paidDate ?? '—'}</Text>
                                                <View style={{ width: 100, paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'center' }}>
                                                    <View style={{ backgroundColor: m.status === 'PAID' ? theme.greenLight : theme.redLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, alignSelf: 'flex-start' }}>
                                                        {m.status === 'PAID' ? (
                                                            <Text style={{ fontSize: Platform.OS === 'ios' ? 11 : 10, fontFamily: 'Poppins_700Bold', color: theme.green }}>✓ Paid</Text>
                                                        ) : (
                                                            <Text style={{ fontSize: Platform.OS === 'ios' ? 11 : 10, fontFamily: 'Poppins_700Bold', color: theme.red }}>
                                                                <Text style={{ fontSize: Platform.OS === 'ios' ? 9 : 8 }}>⏳</Text>
                                                                {' Pending'}
                                                            </Text>
                                                        )}
                                                    </View>
                                                </View>
                                            </View>
                                        ))}
                                    </ScrollView>
                                </View>
                            </ScrollView>
                        </View>
                    </Card>


                    {/* Achievements */}
                    <Card theme={theme}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Award size={16} color={theme.amber} />
                                <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>Projects & Achievements</Text>
                            </View>
                            <View style={{ backgroundColor: theme.cardBorder, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, opacity: 0.7 }}>
                                <Text style={{ fontSize: 11, lineHeight: 13, includeFontPadding: false, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>Coming Soon</Text>
                            </View>
                        </View>
                        <View style={{ gap: 8 }}>
                            {achievements.map((ach, i) => (
                                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, backgroundColor: theme.amberLight, borderRadius: 14 }}>
                                    <Text style={{ fontSize: 26 }}>{ach.icon}</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text }}>{ach.title}</Text>
                                        <Text style={{ fontSize: 11, color: theme.subText, fontFamily: 'Poppins_400Regular' }}>{ach.desc}</Text>
                                    </View>
                                    <Text style={{ fontSize: 10, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>{ach.date}</Text>
                                </View>
                            ))}
                        </View>
                        <View style={{ marginTop: 12, padding: 10, backgroundColor: theme.purpleLight, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <User size={14} color={theme.purple} />
                            <Text style={{ fontSize: 11, color: theme.purple, fontFamily: 'Poppins_400Regular', flex: 1 }}>
                                Share your projects & certificates to build your academic profile
                            </Text>
                        </View>
                    </Card>

                    {/* ── Settings & Logout ── */}
                    <View style={{ gap: 4 }}>
                        {/* Heading */}
                        <Text style={{
                            fontSize: 14,
                            fontFamily: 'Poppins_700Bold',
                            color: theme.text,
                            paddingHorizontal: 14,
                            marginBottom: 4,
                        }}>
                            Settings
                        </Text>


                        {[
                            { icon: <Bell size={16} color={theme.blue} />, label: 'Notifications', color: theme.blue },
                            { icon: <Settings size={16} color={theme.purple} />, label: 'App Settings', color: theme.purple },
                        ].map((item) => (
                            <TouchableOpacity key={item.label} style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 12,
                                padding: 4,
                            }}>
                                <View style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 10,
                                    backgroundColor: item.color + '20',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}>
                                    {item.icon}
                                </View>
                                <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>
                                    {item.label}
                                </Text>
                                <ChevronRight size={16} color={theme.muted} />
                            </TouchableOpacity>
                        ))}

                        {/* Logout */}
                        <TouchableOpacity
                            onPress={async () => {
                                await AsyncStorage.removeItem('userToken');
                                await AsyncStorage.removeItem('institutionType');
                                clearInstitution();
                                router.replace('/login');
                            }}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 12,
                                padding: 4,
                            }}>

                            <View style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                backgroundColor: theme.red + '20',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <LogOut size={16} color={theme.red} />
                            </View>
                            <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: theme.red }}>
                                Logout
                            </Text>
                            <ChevronRight size={16} color={theme.red} />
                        </TouchableOpacity>
                    </View>

                    {/* Watermark */}
                    <View style={{ alignItems: 'center', paddingVertical: 0, gap: 2 }}>
                        <Text style={{
                            fontSize: 15,
                            fontFamily: 'Poppins_600SemiBold',
                            color: theme.muted,
                            opacity: 0.7,
                            letterSpacing: 0.5,
                        }}>
                            QubeEx v1.0
                        </Text>
                        <Text style={{
                            fontSize: 11,
                            fontFamily: 'Poppins_400Regular',
                            color: theme.muted,
                            opacity: 0.7,
                        }}>
                            © 2026 All rights reserved.
                        </Text>
                    </View>
                </View>
            </ScrollView>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    body: { padding: 14, gap: 14 },
    chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 }, // yeh add karo
});