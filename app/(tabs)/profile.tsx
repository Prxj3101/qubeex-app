import { InlineWheel } from '@/components/InlineWheel';
import { ScreenHeader } from '@/components/ScreenHeader';
import { StudentIDCard } from '@/components/StudentIDCard';
import { TabEntryCover, useTabEntryCover } from '@/components/TabEntryCover';
import { useBranding } from '@/context/BrandingContext';
import { useInstitution } from '@/context/InstitutionContext';
import { useStudent } from '@/context/StudentContext';
import { useTheme } from '@/context/ThemeContext';
import { Flag as FlagItem } from '@/data/flags';
import api from '@/lib/api';
import { unregisterCurrentPushToken } from '@/lib/pushNotifications';
import { assignSubjectColor } from '@/lib/subjectColors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter, useNavigation } from 'expo-router';
import {
    Award,
    BarChart2, Bell, CalendarDays,
    ChevronRight,
    Flag, IndianRupee, LogOut,
    Star,
    Trophy,
    User
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

import Constants from 'expo-constants';

const { width } = Dimensions.get('window');


// Per-theme light-mode page background — mirrors app/(tabs)/feed.tsx's LIGHT_BG.
const LIGHT_BG: Record<string, string> = {
    purple: '#FBFBFF', blue: '#F7FBFE', teal: '#F0F7F3', amber: '#FEFBF7',
    rose: '#FBF7F7', indigo: '#F3F7FE', slate: '#FBFEFE',
};

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
    bg: '#000000', card: '#141414', cardBorder: '#2A2A2A',
    text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B',
    purple: '#A78BFA', purpleLight: '#2D1F50',
    amber: '#FCD34D', amberLight: '#2D2010',
    green: '#34D399', greenLight: '#0D2B20',
    red: '#F87171', redLight: '#2B0D0D',
    blue: '#60A5FA', blueLight: '#0D1F3C',
};

// ─── Fees: same data model & derivation logic as /student/fees ─────────────────
type FeeStructureType = 'REGULAR' | 'ADDON' | 'PENALTY' | 'ONE_TIME' | 'BUS' | 'LATE_FEE';
interface FeeSubItem { id: string; label: string; amount: number; }
interface FeeItem { id: string; label: string; amount: number; subItems: FeeSubItem[]; }
interface FeeStructure { id: string; name: string; type: FeeStructureType; color: string; items: FeeItem[]; }
interface FeeMonth { id: string; month: string; dueDate: string; assignedStructureIds: string[]; remark: string; }
interface FeePayment { feeMonthId: string; status: 'PAID' | 'PENDING'; paidDate: string | null; remark: string | null; extraFields: Record<string, string> | null; extraStructureIds: string[] | null; }
type StudentDetailField = { id: string; kind: 'default' | 'custom'; defaultKey?: 'name' | 'rollNo' | 'studentId' | 'class' | 'division' | 'bus'; label: string; value?: string; };

const FEE_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Parses flexible free-text dates like "10 Aug 26", "Aug 10 2026", "10 August"
// (year defaults to current year if omitted) into a comparable Date.
function parseFlexDate(input: string | null | undefined): Date | null {
    if (!input) return null;
    const str = input.trim();
    if (!str) return null;
    const monthIdx = FEE_MONTHS.findIndex(m => new RegExp(`\\b${m.slice(0, 3)}`, 'i').test(str));
    if (monthIdx === -1) return null;
    const nums = str.match(/\d+/g);
    if (!nums || nums.length === 0) return null;
    const day = parseInt(nums[0], 10);
    if (Number.isNaN(day) || day < 1 || day > 31) return null;
    let year = new Date().getFullYear();
    if (nums.length > 1) {
        const y = parseInt(nums[1], 10);
        if (!Number.isNaN(y)) year = y < 100 ? 2000 + y : y;
    }
    const d = new Date(year, monthIdx, day);
    return Number.isNaN(d.getTime()) ? null : d;
}

// Same "late fee stays applied" rule as the Fee Details screen: applies once
// today is past the due date and either no paid date is set yet, or the
// paid date entered is itself after the due date.
function isLateFeeApplicable(dueDate: string | null | undefined, paidDate: string | null | undefined): boolean {
    const due = parseFlexDate(dueDate);
    if (!due) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    if (today.getTime() <= due.getTime()) return false;
    if (!paidDate || !paidDate.trim()) return true;
    const paid = parseFlexDate(paidDate);
    if (!paid) return true;
    paid.setHours(0, 0, 0, 0);
    return paid.getTime() > due.getTime();
}

function feeStructureTotal(s: FeeStructure) {
    return s.items.reduce((n, item) => {
        const sub = item.subItems.reduce((m, si) => m + si.amount, 0);
        return n + (sub > 0 ? sub : item.amount);
    }, 0);
}

const TERM1_MONTHS = ['June', 'July', 'August', 'September', 'October'];
const TERM2_MONTHS = ['November', 'December', 'January', 'February', 'March', 'April', 'May'];

// Backend sends remark dates like "5 Aug 2026, 10:15 AM" — Hermes (React
// Native's JS engine) doesn't reliably parse this free-form format the way
// a browser's V8 engine does (new Date(str) can come back Invalid Date),
// which silently broke "most recent" selection below. Parse it explicitly
// (same helper as app/flags.tsx).
const REMARK_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function parseRemarkDate(input: string): number {
    const m = input.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return 0;
    const [, dayStr, monStr, yearStr, hourStr, minStr, ampm] = m;
    const monthIdx = REMARK_MONTHS.findIndex(mo => mo.toLowerCase() === monStr.slice(0, 3).toLowerCase());
    if (monthIdx === -1) return 0;
    let hour = parseInt(hourStr, 10) % 12;
    if (ampm.toUpperCase() === 'PM') hour += 12;
    const d = new Date(parseInt(yearStr, 10), monthIdx, parseInt(dayStr, 10), hour, parseInt(minStr, 10));
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

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


interface MarksheetSubject {
    id: string; name: string; code: string; color: string | null;
    total: { scored: number; max: number }; pct: number | null; grade: string;
    onlineTotal?: { scored: number; max: number }; onlinePct?: number | null;
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
    const maxBarHeight = 140;
    const topPad = 16;
    const barColWidth = 36;
    const gap = 10;
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
                        <Text key={t} style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.subText, textAlign: 'right' }}>
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
                                            style={{ width: '65%', height: barHeight, borderRadius: 4 }}
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
    const { isDark, accent, themeColor } = useTheme();
    const theme = { ...(isDark ? DARK : LIGHT), bg: isDark ? DARK.bg : (LIGHT_BG[themeColor] ?? LIGHT_BG.purple), purple: accent.purple, purpleLight: accent.purpleLight };
    const showEntryCover = useTabEntryCover();
    const [marksMode, setMarksMode] = useState<MarksMode>('combined');
    const router = useRouter();
    const { clearInstitution } = useInstitution();
    const { branding, clearBranding } = useBranding();
    const { profile, fetchProfile } = useStudent();
    const [attendanceVisible, setAttendanceVisible] = useState(false);
    const [activeTrendPoint, setActiveTrendPoint] = useState<number | null>(null);
    const [attendanceApiData, setAttendanceApiData] = useState<AttendanceData | null>(null);
    const [marksheetData, setMarksheetData] = useState<{ subjects: MarksheetSubject[]; grandPct: number | null; classRank: number | null; offlineClassRank?: number | null; onlineClassRank?: number | null; combinedClassRank?: number | null; classSize: number | null } | null>(null);
    const [flags, setFlags] = useState<FlagItem[]>([]);

    // ── Fees overview — same derivation as the Fee Details screen ──
    const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
    const [feeMonths, setFeeMonths] = useState<FeeMonth[]>([]);
    const [feePayments, setFeePayments] = useState<FeePayment[]>([]);
    const [studentFields, setStudentFields] = useState<StudentDetailField[]>([]);
    const [extraDetailFields, setExtraDetailFields] = useState<Record<string, string> | null>(null);

    const fadeAnim = useRef(new Animated.Value(0)).current;
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

    useFocusEffect(
        React.useCallback(() => {
            fetchProfile();
            api.get('/student/attendance')
                .then(r => setAttendanceApiData(r.data.data))
                .catch(() => {});
            api.get('/student/marksheet')
                .then(r => setMarksheetData(r.data.data))
                .catch(() => {});
            api.get('/student/remarks')
                .then(r => setFlags(r.data.data))
                .catch(() => {});
            api.get('/student/fees')
                .then(r => {
                    const structure = r.data?.data?.structure;
                    setFeeStructures(structure?.feeStructures ?? []);
                    setFeeMonths(structure?.feeMonths ?? []);
                    setStudentFields(structure?.studentFields ?? []);
                    setExtraDetailFields(r.data?.data?.extraDetailFields ?? null);
                    setFeePayments(r.data?.data?.payments ?? []);
                })
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


    const getFeePayment = (feeMonthId: string): FeePayment =>
        feePayments.find(p => p.feeMonthId === feeMonthId) ?? { feeMonthId, status: 'PENDING', paidDate: null, remark: null, extraFields: null, extraStructureIds: null };

    const feeMonthTotal = (m: FeeMonth) =>
        feeStructures.filter(s => m.assignedStructureIds.includes(s.id)).reduce((n, s) => n + feeStructureTotal(s), 0);

    const getAutoLateFee = (m: FeeMonth): FeeStructure | null => {
        const payment = getFeePayment(m.id);
        if (!isLateFeeApplicable(m.dueDate, payment.paidDate)) return null;
        const lateFee = feeStructures.find(s => s.type === 'LATE_FEE');
        if (!lateFee) return null;
        if (m.assignedStructureIds.includes(lateFee.id)) return null;
        if ((payment.extraStructureIds ?? []).includes(lateFee.id)) return null;
        return lateFee;
    };

    const getAutoBusFee = (m: FeeMonth): { structure: FeeStructure; amount: number } | null => {
        const busField = studentFields.find(f => f.kind === 'default' && f.defaultKey === 'bus');
        if (!busField) return null;
        if (extraDetailFields?.[`${busField.id}-enabled`] !== 'true') return null;
        const rawMonths = extraDetailFields?.[`${busField.id}-months`];
        let monthIds: string[] = [];
        if (rawMonths) {
            try {
                const parsed = JSON.parse(rawMonths);
                if (Array.isArray(parsed)) monthIds = parsed.filter((x): x is string => typeof x === 'string');
            } catch { /* ignore malformed value */ }
        }
        if (!monthIds.includes(m.id)) return null;
        const busStructure = feeStructures.find(s => s.type === 'BUS');
        if (!busStructure) return null;
        if (m.assignedStructureIds.includes(busStructure.id)) return null;
        const amount = Number(extraDetailFields?.[`${busField.id}-fee`]) || 0;
        return { structure: busStructure, amount };
    };

    const studentFeeMonthTotal = (m: FeeMonth) => {
        const extraIds = (getFeePayment(m.id).extraStructureIds ?? []).filter(id => !m.assignedStructureIds.includes(id));
        const extra = feeStructures.filter(s => extraIds.includes(s.id)).reduce((n, s) => n + feeStructureTotal(s), 0);
        const autoLateFee = getAutoLateFee(m);
        const autoBusFee = getAutoBusFee(m);
        return feeMonthTotal(m) + extra + (autoLateFee ? feeStructureTotal(autoLateFee) : 0) + (autoBusFee ? autoBusFee.amount : 0);
    };

    // No re-sorting — keep the exact same order as configured in the fee
    // card (e.g. starting from the academic year's first month), same as
    // the Fee Details screen's Monthly Payment Schedule table.
    const feeMonthsProfile = feeMonths.map(m => {
        const payment = getFeePayment(m.id);
        return {
            month: m.month,
            dueDate: m.dueDate,
            amount: studentFeeMonthTotal(m),
            status: payment.status,
            paidDate: payment.paidDate ?? undefined,
        };
    });
    const feeTerm1 = feeMonthsProfile.filter(m => TERM1_MONTHS.includes(m.month));
    const feeTerm2 = feeMonthsProfile.filter(m => TERM2_MONTHS.includes(m.month));
    const feeTermData = [
        { label: 'Term 1', range: 'June – October', months: feeTerm1 },
        { label: 'Term 2', range: 'November – May', months: feeTerm2 },
    ];

    const subjectChartData = (marksheetData?.subjects ?? []).map((s, i) => {
        const offline = s.pct ?? 0;
        const online = s.onlinePct ?? 0;
        const offMax = s.total?.max ?? 0;
        const onMax = s.onlineTotal?.max ?? 0;
        const combMax = offMax + onMax;
        const combinedPct = combMax > 0
            ? Math.round((((s.total?.scored ?? 0) + (s.onlineTotal?.scored ?? 0)) / combMax) * 100)
            : offline;
        const pct = marksMode === 'offline' ? offline : marksMode === 'online' ? online : combinedPct;
        return { code: s.code, name: s.name, color: s.color ?? assignSubjectColor(i), pct };
    });
    // "Overall Score" — pooled scored/max across every subject for the active
    // mode, not a naive average of each subject's own %. A plain average
    // weighs a subject with 1 recorded mark the same as one with a full
    // published set, which skews it badly (e.g. mostly-empty subjects
    // dragging a real ~75% down to something like 7%).
    const overallScore = (() => {
        const subjects = marksheetData?.subjects ?? [];
        let scored = 0, max = 0;
        for (const s of subjects) {
            if (marksMode === 'offline' || marksMode === 'combined') {
                scored += s.total?.scored ?? 0;
                max += s.total?.max ?? 0;
            }
            if (marksMode === 'online' || marksMode === 'combined') {
                scored += s.onlineTotal?.scored ?? 0;
                max += s.onlineTotal?.max ?? 0;
            }
        }
        return max > 0 ? Math.round((scored / max) * 100) : 0;
    })();
    const overallRank: number | null = marksMode === 'offline'
        ? (marksheetData?.offlineClassRank ?? marksheetData?.classRank ?? null)
        : marksMode === 'online'
            ? (marksheetData?.onlineClassRank ?? null)
            : (marksheetData?.combinedClassRank ?? null);

    // Full school-year attendance trend derived from real API data. A month
    // with no records yet comes back as pct: null from the backend.
    const attendanceTrend = React.useMemo(() => {
        const MONTHS = ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'];
        return MONTHS.map(m => {
            const found = attendanceApiData?.monthly.find(x => x.month === m);
            return { month: m, value: found?.pct ?? null as number | null };
        });
    }, [attendanceApiData]);
    // react-native-chart-kit needs a single continuous numeric array (no
    // null/gap support like recharts), so the actual line only gets fed
    // months up to the last one with real data — but every month name still
    // needs to stay visible on the x-axis, so the remaining future months
    // are appended after the chart as plain (non-plotted) labels, keeping
    // the full Jun–May sequence visible while scrolling.
    const lastDataIdx = (() => {
        let last = -1;
        attendanceTrend.forEach((d, i) => { if (d.value != null) last = i; });
        return last;
    })();
    const attendanceTrendPlotted = attendanceTrend
        .slice(0, lastDataIdx + 1)
        .map(d => ({ month: d.month, value: d.value ?? 0 }));
    const attendanceTrendFuture = attendanceTrend.slice(lastDataIdx + 1);

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

    // Same percentage-range scheme the marksheet screens use (report_card.tsx's
    // scoreColor) — Overall Rank/Score should reflect how the student is
    // actually doing, not the institution's chosen theme color.
    const scoreColor = (pct: number | null) => {
        if (pct === null) return theme.subText;
        if (pct >= 75) return theme.green;
        if (pct >= 35) return theme.amber;
        return theme.red;
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: Constants.statusBarHeight }]}>
            <ScreenHeader title="Profile" />
            <View style={{ flex: 1, position: 'relative' }}>
            <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>

                <View style={{ paddingTop: 6 }}>
                    <StudentIDCard isDark={isDark} />
                </View>

                <View style={styles.body}>

                    {/* Rank + Score */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Card theme={theme} style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <Trophy size={14} color={theme.amber} />
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Overall Rank</Text>
                            </View>
                            <Text style={{ fontSize: 32, fontFamily: 'Poppins_800ExtraBold', color: scoreColor(overallScore) }}>{overallRank === null ? '—' : `#${overallRank}`}</Text>
                            <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>Overall rank</Text>
                        </Card>

                        <Card theme={theme} style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <Star size={14} color={theme.amber} fill={theme.amber} />
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Overall Score</Text>
                            </View>
                            <Text style={{ fontSize: 32, fontFamily: 'Poppins_800ExtraBold', color: scoreColor(overallScore) }}>{overallScore}%</Text>
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
                                    // Neutral gray pill — theme.cardBorder is a purple-tinted
                                    // lavender in light mode, which looked colored regardless
                                    // of the institution's actual theme.
                                    backgroundColor: isDark ? '#2A2A2A' : '#F1F5F9',
                                    paddingHorizontal: 10,
                                    paddingVertical: 5,
                                    borderRadius: 99,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4,
                                    flexShrink: 0,
                                }}
                            >
                                <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 13, includeFontPadding: false, fontFamily: 'Poppins_600SemiBold', color: theme.text, top: 1 }}>View Report Card</Text>
                                <ChevronRight size={12} color={theme.text} />
                            </TouchableOpacity>
                        </View>

                        <View style={{ marginBottom: 6 }}>
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
                                    backgroundColor: isDark ? '#2A2A2A' : '#F1F5F9',
                                    paddingHorizontal: 10,
                                    paddingVertical: 5,
                                    borderRadius: 99,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4,
                                    flexShrink: 0,
                                }}
                            >
                                <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 13, includeFontPadding: false, fontFamily: 'Poppins_600SemiBold', color: theme.text, top: 1 }}>View Details</Text>
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
                            {attendanceTrendPlotted.length === 0 ? (
                                // No attendance marked at all yet this year — chart-kit throws on
                                // an empty dataset (divides by data.length internally), so skip
                                // the chart entirely rather than feeding it a 0-length array.
                                <View style={{ height: 180, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.subText }}>
                                        No attendance marked yet
                                    </Text>
                                </View>
                            ) : (
                            <Animated.View style={{ opacity: fadeAnim, flexDirection: 'row' }}>
                                {/* Fixed Y axis — a ghost chart-kit chart with an invisible line,
                                    clipped to just its label gutter, so the numbers never move. */}
                                <View style={{ width: 34, height: 180, overflow: 'hidden' }}>
                                    <LineChart
                                        data={{
                                            labels: attendanceTrendPlotted.map(d => d.month),
                                            datasets: [{ data: attendanceTrendPlotted.map(d => d.value), color: () => 'transparent', strokeWidth: 0 }],
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
                                <View style={{ flexDirection: 'row' }}>
                                <View style={{ width: attendanceTrendPlotted.length * 56 }}>
                                    <LineChart
                                        onDataPointClick={({ index }) => {
                                            setActiveTrendPoint(prev => prev === index ? null : index);
                                        }}
                                        renderDotContent={({ x, y, index, indexData }) => {
                                            // Tapped point — like hovering a point on the web graph,
                                            // shows that month's exact detail.
                                            if (activeTrendPoint === index) {
                                                const chartWidth = attendanceTrendPlotted.length * 56;
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
                                                            {attendanceTrendPlotted[index].month}
                                                        </Text>
                                                        <Text style={{ fontSize: 11, color: theme.card, fontFamily: 'Poppins_700Bold' }}>
                                                            {indexData}%
                                                        </Text>
                                                    </View>
                                                );
                                            }

                                            const data = attendanceTrendPlotted.map(d => d.value);
                                            const max = Math.max(...data);
                                            const min = Math.min(...data);
                                            if (indexData !== max && indexData !== min) return null;
                                            const isMin = indexData === min;
                                            return (
                                                <View
                                                    key={index}
                                                    style={{
                                                        position: 'absolute',
                                                        top: y - 22,
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
                                            labels: attendanceTrendPlotted.map(d => d.month),
                                            datasets: [{
                                                data: attendanceTrendPlotted.map(d => d.value),
                                                color: () => theme.green,
                                                strokeWidth: 2,
                                            }],
                                        }}
                                        width={attendanceTrendPlotted.length * 56}
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
                                        {attendanceTrendPlotted.map((d, i) => (
                                            <TouchableOpacity
                                                key={i}
                                                activeOpacity={1}
                                                style={{ width: 56, height: '100%' }}
                                                onPress={() => setActiveTrendPoint(prev => prev === i ? null : i)}
                                            />
                                        ))}
                                    </View>
                                </View>
                                {/* Remaining months with no attendance marked yet — kept visible
                                    in the same Jun–May sequence (matches the request that all
                                    months stay on the axis), just without a plotted line since
                                    chart-kit can't render a partial/broken line like recharts. */}
                                {attendanceTrendFuture.length > 0 && (
                                    <View style={{ width: attendanceTrendFuture.length * 56, flexDirection: 'row', height: 180, alignItems: 'flex-end', paddingBottom: 4 }}>
                                        {attendanceTrendFuture.map((d) => (
                                            <View key={d.month} style={{ width: 56, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 9, fontFamily: 'Poppins_400Regular', color: theme.subText, opacity: 0.5 }}>{d.month}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                                </View>
                                </ScrollView>
                            </Animated.View>
                            )}

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
                                    backgroundColor: isDark ? '#2A2A2A' : '#F1F5F9',
                                    paddingHorizontal: 10,
                                    paddingVertical: 5,
                                    borderRadius: 99,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4,
                                    flexShrink: 0,
                                }}
                            >
                                <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 13, includeFontPadding: false, fontFamily: 'Poppins_600SemiBold', color: theme.text, top: 1 }}>View All</Text>
                                <ChevronRight size={12} color={theme.text} />
                            </TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: theme.amberLight, borderRadius: 12 }}>
                                <View style={{ width: 12, height: 18, borderRadius: 2, backgroundColor: '#FCFF38', transform: [{ rotate: '-5deg' }], shadowColor: '#000', shadowOffset: { width: 1, height: 2 }, shadowOpacity: 0.4, shadowRadius: 2, elevation: 4 }} />
                                <View>
                                    <Text style={{ fontSize: 18, fontFamily: 'Poppins_800ExtraBold', color: theme.amber }}>
                                        {flags.filter(f => f.type === 'yellow').length}
                                    </Text>
                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.amber }}>Yellow Cards</Text>
                                </View>
                            </View>
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: theme.redLight, borderRadius: 12 }}>
                                <View style={{ width: 12, height: 18, borderRadius: 2, backgroundColor: '#DC2626', transform: [{ rotate: '-5deg' }], shadowColor: '#000', shadowOffset: { width: 1, height: 2 }, shadowOpacity: 0.4, shadowRadius: 2, elevation: 4 }} />
                                <View>
                                    <Text style={{ fontSize: 18, fontFamily: 'Poppins_800ExtraBold', color: theme.red }}>
                                        {flags.filter(f => f.type === 'red').length}
                                    </Text>
                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.red }}>Red Cards</Text>
                                </View>
                            </View>
                        </View>
                        {flags.length === 0 ? (
                            <View style={{ alignItems: 'center', padding: 16 }}>
                                <Text style={{ fontSize: 28 }}>✅</Text>
                                <Text style={{ fontSize: 12, color: theme.muted, fontFamily: 'Poppins_400Regular', marginTop: 4 }}>No FLAGS! Keep it up.</Text>
                            </View>
                        ) : (
                            <View style={{ gap: 8 }}>
                                {[
                                    [...flags].filter(f => f.type === 'yellow').sort((a, b) => parseRemarkDate(b.date) - parseRemarkDate(a.date))[0],
                                    [...flags].filter(f => f.type === 'red').sort((a, b) => parseRemarkDate(b.date) - parseRemarkDate(a.date))[0],
                                ].filter((f): f is FlagItem => f !== undefined).map((flag, i) => (
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
                                style={{ backgroundColor: isDark ? '#2A2A2A' : '#F1F5F9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}
                            >
                                <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 13, includeFontPadding: false, fontFamily: 'Poppins_600SemiBold', color: theme.text, top: 1 }}>Pay Fees</Text>
                                <ChevronRight size={12} color={theme.text} />
                            </TouchableOpacity>
                        </View>

                        {/* Term progress bars */}
                        {feeTermData.map((term, i) => {
                            const paidMonths = term.months.filter(m => m.status === 'PAID').length;
                            const totalMonths = term.months.length;
                            const pct = totalMonths > 0 ? Math.round((paidMonths / totalMonths) * 100) : 0;
                            const cleared = totalMonths > 0 && paidMonths === totalMonths;
                            return (
                                <View key={i} style={{ padding: 10, backgroundColor: theme.bg, borderRadius: 14, marginBottom: 8, gap: 6 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <View>
                                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{term.label}</Text>
                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{term.range}</Text>
                                        </View>
                                        <View style={{ backgroundColor: cleared ? theme.greenLight : paidMonths === 0 ? theme.redLight : theme.amberLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 }}>
                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: cleared ? theme.green : paidMonths === 0 ? theme.red : theme.amber }}>
                                                {cleared ? '✅ Paid' : `${paidMonths}/${totalMonths} paid`}
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
                                        {feeMonthsProfile.length === 0 ? (
                                            <View style={{ paddingVertical: 28, alignItems: 'center', justifyContent: 'center' }}>
                                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted }}>No fee months configured yet</Text>
                                            </View>
                                        ) : feeMonthsProfile.map((m, i, arr) => (
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
                            <View style={{ backgroundColor: isDark ? '#2A2A2A' : '#F1F5F9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, opacity: 0.7, flexShrink: 0 }}>
                                <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 13, includeFontPadding: false, fontFamily: 'Poppins_600SemiBold', color: theme.text, top: 1 }}>Coming Soon</Text>
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

                        <TouchableOpacity onPress={() => router.push('/notifications')} style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 12,
                            padding: 4,
                        }}>
                            <View style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                backgroundColor: theme.blue + '20',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <Bell size={16} color={theme.blue} />
                            </View>
                            <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>
                                Notifications
                            </Text>
                            <ChevronRight size={16} color={theme.muted} />
                        </TouchableOpacity>

                        {/* Logout */}
                        <TouchableOpacity
                            onPress={() => {
                                Alert.alert('Logout', 'Are you sure you want to logout?', [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                        text: 'Logout',
                                        style: 'destructive',
                                        onPress: async () => {
                                            await unregisterCurrentPushToken();
                                            await AsyncStorage.removeItem('userToken');
                                            await AsyncStorage.removeItem('institutionType');
                                            clearInstitution();
                                            clearBranding();
                                            router.replace('/login');
                                        },
                                    },
                                ]);
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
                            {branding.enabled ? branding.brandName : 'QubeEx v1.0'}
                        </Text>
                        <Text style={{
                            fontSize: 11,
                            fontFamily: 'Poppins_400Regular',
                            color: theme.muted,
                            opacity: 0.7,
                        }}>
                            © 2026 All rights reserved.
                        </Text>
                        {branding.enabled && (
                            <Text style={{
                                fontSize: 10,
                                fontFamily: 'Poppins_400Regular',
                                color: theme.muted,
                                opacity: 0.5,
                                marginTop: 2,
                            }}>
                                Powered by QubeEx
                            </Text>
                        )}
                    </View>
                </View>
            </ScrollView>
            <TabEntryCover visible={showEntryCover} />
            </View>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    body: { padding: 14, gap: 14 },
    chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 }, // yeh add karo
});