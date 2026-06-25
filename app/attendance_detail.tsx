import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarCheck, CalendarDays, Info } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Platform,
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

// ── Mock data — same monthly values as the attendance trend on the profile screen ──
const MONTHLY = [
    { month: 'Jun', key: 5, pct: 62 },
    { month: 'Jul', key: 6, pct: 70 },
    { month: 'Aug', key: 7, pct: 88 },
    { month: 'Sep', key: 8, pct: 95 },
    { month: 'Oct', key: 9, pct: 82 },
    { month: 'Nov', key: 10, pct: 80 },
    { month: 'Dec', key: 11, pct: 65 },
    { month: 'Jan', key: 0, pct: 72 },
    { month: 'Feb', key: 1, pct: 82 },
    { month: 'Mar', key: 2, pct: 90 },
    { month: 'Apr', key: 3, pct: 76 },
    { month: 'May', key: 4, pct: 84 },
];
const SHEET_YEAR = 2025; // academic year 2025-26 (Jun 2025 – May 2026) for the sheet grid

const MONTH_FULL: Record<string, string> = {
    Jun: 'June', Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November',
    Dec: 'December', Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May',
};

// Mock holiday calendar — keyed by month (0-indexed) then day, value is the
// holiday name shown when the cell is tapped.
const HOLIDAYS_BY_MONTH_DAY: Record<number, Record<number, string>> = {
    7: { 15: 'Independence Day' },   // Aug
    9: { 2: 'Gandhi Jayanti' },      // Oct
    10: { 1: 'Diwali' },             // Nov
    11: { 25: 'Christmas' },        // Dec
    0: { 26: 'Republic Day' },       // Jan
    4: { 1: 'Maharashtra Day' },     // May
};

function getStatus(pct: number): 'safe' | 'condonation' | 'defaulter' {
    if (pct >= 75) return 'safe';
    if (pct >= 65) return 'condonation';
    return 'defaulter';
}

function pctColor(p: number, theme: typeof LIGHT) {
    return p >= 75 ? theme.green : p >= 65 ? theme.amber : theme.red;
}

// Deterministic mock day-status generator — distributes P/A/L across a
// month's non-Sunday, non-holiday days so the totals roughly match the
// target % above.
function makeMonthStatuses(year: number, monthKey: number, targetPct: number) {
    const daysInMonth = new Date(year, monthKey + 1, 0).getDate();
    const workDays: number[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const isSunday = new Date(year, monthKey, d).getDay() === 0;
        const isHol = !!HOLIDAYS_BY_MONTH_DAY[monthKey]?.[d];
        if (!isSunday && !isHol) workDays.push(d);
    }
    const presentCount = Math.round((targetPct / 100) * workDays.length);
    const lateCount = Math.min(2, workDays.length - presentCount);
    const statuses: Record<number, 'P' | 'A' | 'L'> = {};
    workDays.forEach((d, i) => {
        if (i < presentCount) statuses[d] = 'P';
        else if (i < presentCount + lateCount) statuses[d] = 'L';
        else statuses[d] = 'A';
    });
    return statuses;
}

const DATE_COLS = Array.from({ length: 31 }, (_, i) => i + 1);

const SHEET_ROW_H = 26;
const MONTH_COL_W = 44;
const DATE_COL_W = 23;
const SUMMARY_COL_W = 26;
const PCT_COL_W = 32;

const SHEET_HEADER_BG = '#ECF3D0';
const SHEET_BODY_BG = '#F5F8EE';
const SHEET_BORDER = '#BACE85';
const SHEET_TEXT = '#2A3A10';
const SHEET_SUNDAY_BG = '#FFF0F0';
const SHEET_HOLIDAY_BG = '#FEF2F2';

const STUDENT_NAME = 'Prajwal Jagdish Kotian';
const ROLL_NO = '09';

// PatrickHand renders slightly smaller on Android than iOS, so bump it up a
// point on iOS to look the same size on both.
const PAL_FONT_SIZE = Platform.OS === 'ios' ? 15 : 14;
const LEGEND_FONT_SIZE = Platform.OS === 'ios' ? 18 : 17;
const SUMMARY_NUM_SIZE = Platform.OS === 'ios' ? 11 : 10;

export default function AttendanceDetail() {
    const { isDark } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const [activeHoliday, setActiveHoliday] = useState<{ name: string; label: string } | null>(null);

    // Overall hero numbers — averaged from the monthly trend, same approach
    // as the web app's attendance details page.
    const overallPct = Math.round(MONTHLY.reduce((s, m) => s + m.pct, 0) / MONTHLY.length);
    const overallStatus = getStatus(overallPct);
    const totalClasses = 620;
    const totalAttended = Math.round((overallPct / 100) * totalClasses);
    const currentMonthPct = MONTHLY[0].pct;

    const monthData = useMemo(() => MONTHLY.map(m => {
        const statuses = makeMonthStatuses(SHEET_YEAR, m.key, m.pct);
        const counts = Object.values(statuses);
        const p = counts.filter(s => s === 'P').length;
        const a = counts.filter(s => s === 'A').length;
        const l = counts.filter(s => s === 'L').length;
        const total = p + a + l;
        const sheetPct = total > 0 ? Math.round(((p + l) / total) * 100) : null;
        return {
            ...m,
            statuses,
            daysInMonth: new Date(SHEET_YEAR, m.key + 1, 0).getDate(),
            p, a, l, total, sheetPct,
        };
    }), []);

    const floatAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, { toValue: -8, duration: 1000, useNativeDriver: true }),
                Animated.timing(floatAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
            <ScreenHeader title="Attendance Details" showBack />
            <ScrollView showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never" contentContainerStyle={{ paddingBottom: 40 }}>

                {/* ── Hero (unchanged) ── */}
                <LinearGradient
                    colors={
                        overallStatus === 'safe'
                            ? isDark ? ['#064E3B', '#065F46'] : ['#10B981', '#059669']
                            : overallStatus === 'condonation'
                                ? isDark ? ['#78350F', '#92400E'] : ['#F59E0B', '#D97706']
                                : isDark ? ['#7F1D1D', '#991B1B'] : ['#EF4444', '#DC2626']
                    }
                    style={styles.banner}
                >
                    <Animated.Image
                        source={require('../assets/images/attendance.png')}
                        style={{ width: 160, height: 160, marginBottom: -5, transform: [{ translateY: floatAnim }] }}
                        resizeMode="contain"
                    />
                    <View style={{ flex: 1, alignItems: 'center', paddingBottom: 16 }}>
                        <Text style={styles.bannerLabel}>Overall Attendance</Text>
                        <Text style={styles.bannerPct}>{overallPct}%</Text>
                        <Text style={styles.bannerSub}>{totalAttended} of {totalClasses} classes attended</Text>
                        <View style={styles.bannerChipRow}>
                            <View style={styles.bannerChip}>
                                <Text style={styles.bannerChipText}>
                                    {overallStatus === 'safe' ? '✅ Good' : overallStatus === 'condonation' ? '⚠️ Condonation Zone' : '🚫 Defaulter'}
                                </Text>
                            </View>
                        </View>
                    </View>
                </LinearGradient>

                <View style={styles.body}>

                    {/* ── Attendance Rules (unchanged) ── */}
                    <View style={[styles.legendCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        <TouchableOpacity
                            onPress={() => Alert.alert('Attendance Rules', '✅ Good: 75% or above\n⚠️ Condonation: 65–74% (need principal approval)\n🚫 Defaulter: Below 65% (not allowed to appear in exam)')}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                            activeOpacity={0.75}
                        >
                            <Info size={13} color={theme.purple} />
                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.purple }}>Attendance Rules</Text>
                        </TouchableOpacity>
                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                            {[
                                { label: 'Good', color: theme.green, bg: theme.greenLight, emoji: '✅', range: '≥ 75%' },
                                { label: 'Condonation', color: theme.amber, bg: theme.amberLight, emoji: '⚠️', range: '65–74%' },
                                { label: 'Defaulter', color: theme.red, bg: theme.redLight, emoji: '🚫', range: '< 65%' },
                            ].map(item => (
                                <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: item.bg, paddingHorizontal: 4, paddingVertical: 4, borderRadius: 99 }}>
                                    <Text style={{ fontSize: 12 }}>{item.emoji}</Text>
                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: item.color }}>{item.label} ({item.range})</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* ── Overall + This Month (side by side) ── */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                            <Text style={{ fontSize: 22, fontFamily: 'Poppins_800ExtraBold', color: pctColor(overallPct, theme) }}>{overallPct}%</Text>
                            <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular', marginTop: 2 }}>Overall</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                            <Text style={{ fontSize: 22, fontFamily: 'Poppins_800ExtraBold', color: pctColor(currentMonthPct, theme) }}>{currentMonthPct}%</Text>
                            <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular', marginTop: 2 }}>This Month</Text>
                        </View>
                    </View>

                    {/* ── Month-wise Attendance ── */}
                    <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        <View style={[styles.sectionHeader, { backgroundColor: isDark ? '#1F1545' : '#F8F7FF', borderBottomColor: theme.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                            <CalendarDays size={16} color={theme.green} />
                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text }}>Month-wise Attendance</Text>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled style={{ maxHeight: 188 }} contentContainerStyle={{ padding: 12, gap: 10 }}>
                            {MONTHLY.map(m => (
                                <View key={m.key} style={{ gap: 4 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ fontSize: 11, color: theme.subText, fontFamily: 'Poppins_400Regular' }}>{MONTH_FULL[m.month]}</Text>
                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: pctColor(m.pct, theme) }}>{m.pct}%</Text>
                                    </View>
                                    <View style={{ height: 7, backgroundColor: theme.cardBorder, borderRadius: 99, overflow: 'hidden' }}>
                                        <View style={{ position: 'absolute', left: '75%', top: 0, bottom: 0, width: 1, backgroundColor: theme.muted, opacity: 0.5, zIndex: 1 }} />
                                        <View style={{ width: `${m.pct}%`, height: '100%', backgroundColor: pctColor(m.pct, theme), borderRadius: 99 }} />
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                    </View>

                    {/* ── Attendance Sheet ── */}
                    <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        <View style={[styles.sectionHeader, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                            <CalendarCheck size={16} color={theme.green} />
                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text }}>Attendance Sheet</Text>
                            <View style={{ flex: 1 }} />
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{STUDENT_NAME}</Text>
                                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Roll No. {ROLL_NO}</Text>
                            </View>
                        </View>

                        {activeHoliday && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.redLight, borderBottomWidth: 1, borderBottomColor: theme.cardBorder }}>
                                <Text style={{ fontSize: 12 }}>📅</Text>
                                <Text style={{ flex: 1, fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.red }}>
                                    {activeHoliday.name} · {activeHoliday.label}
                                </Text>
                                <TouchableOpacity onPress={() => setActiveHoliday(null)} activeOpacity={0.7}>
                                    <Text style={{ fontSize: 13, color: theme.red, fontFamily: 'Poppins_700Bold' }}>✕</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        <View style={{ flexDirection: 'row', backgroundColor: SHEET_BODY_BG }}>
                            {/* Sticky left — Month */}
                            <View>
                                <View style={[sheetStyles.headerCell, { width: MONTH_COL_W }]}>
                                    <Text style={[sheetStyles.headerText, { fontSize: Platform.OS === 'ios' ? 10 : 9 }]}>Month</Text>
                                </View>
                                {monthData.map(m => (
                                    <View key={m.month} style={[sheetStyles.dataCell, { width: MONTH_COL_W, backgroundColor: SHEET_HEADER_BG }]}>
                                        <Text style={sheetStyles.monthText}>{m.month}</Text>
                                    </View>
                                ))}
                            </View>

                            {/* Scrollable middle — dates 1-31 */}
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <View>
                                    <View style={{ flexDirection: 'row' }}>
                                        {DATE_COLS.map(d => (
                                            <View key={d} style={[sheetStyles.headerCell, { width: DATE_COL_W }]}>
                                                <Text style={sheetStyles.headerText}>{d}</Text>
                                            </View>
                                        ))}
                                    </View>
                                    {monthData.map(m => (
                                        <View key={m.month} style={{ flexDirection: 'row' }}>
                                            {DATE_COLS.map(d => {
                                                const isOutOfMonth = d > m.daysInMonth;
                                                const isSunday = !isOutOfMonth && new Date(SHEET_YEAR, m.key, d).getDay() === 0;
                                                const holName = !isOutOfMonth ? HOLIDAYS_BY_MONTH_DAY[m.key]?.[d] : undefined;
                                                const isHol = !isSunday && !!holName;
                                                const status = m.statuses[d] ?? null;
                                                const cellBg = isOutOfMonth ? 'transparent' : isSunday ? SHEET_SUNDAY_BG : isHol ? SHEET_HOLIDAY_BG : 'transparent';

                                                const content = isOutOfMonth ? (
                                                    <Text style={{ color: SHEET_BORDER, fontSize: 10 }}>·</Text>
                                                ) : isHol ? (
                                                    <Text style={{ color: '#FCA5A5', fontSize: 13 }}>×</Text>
                                                ) : status ? (
                                                    <Text style={{
                                                        fontFamily: 'PatrickHand_400Regular', fontSize: PAL_FONT_SIZE, fontWeight: '700',
                                                        textShadowColor: status === 'P' ? '#16a34a' : status === 'A' ? '#dc2626' : '#d97706',
                                                        textShadowOffset: { width: 0.6, height: 0 }, textShadowRadius: 0,
                                                        color: status === 'P' ? '#16a34a' : status === 'A' ? '#dc2626' : '#d97706',
                                                    }}>{status}</Text>
                                                ) : (
                                                    <Text style={{ color: SHEET_BORDER, fontSize: 10 }}>—</Text>
                                                );

                                                if (isHol) {
                                                    return (
                                                        <TouchableOpacity
                                                            key={d}
                                                            activeOpacity={0.7}
                                                            onPress={() => {
                                                                const label = `${m.month} ${d}`;
                                                                setActiveHoliday(prev => prev?.label === label ? null : { name: holName ?? 'Holiday', label });
                                                            }}
                                                            style={[sheetStyles.dataCell, { width: DATE_COL_W, backgroundColor: cellBg }]}
                                                        >
                                                            {content}
                                                        </TouchableOpacity>
                                                    );
                                                }
                                                return (
                                                    <View key={d} style={[sheetStyles.dataCell, { width: DATE_COL_W, backgroundColor: cellBg }]}>
                                                        {content}
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    ))}
                                </View>
                            </ScrollView>

                            {/* Sticky right — P A L T % */}
                            <View>
                                <View style={{ flexDirection: 'row' }}>
                                    {['P', 'A', 'L', 'T', '%'].map(h => {
                                        const headerColor = h === 'P' ? '#047857' : h === 'A' ? '#EF4444' : h === 'L' ? '#D97706' : SHEET_TEXT;
                                        return (
                                            <View key={h} style={[sheetStyles.headerCell, { width: h === '%' ? PCT_COL_W : SUMMARY_COL_W }]}>
                                                <Text style={[sheetStyles.headerText, { color: headerColor }]}>{h}</Text>
                                            </View>
                                        );
                                    })}
                                </View>
                                {monthData.map(m => (
                                    <View key={m.month} style={{ flexDirection: 'row' }}>
                                        <View style={[sheetStyles.dataCell, { width: SUMMARY_COL_W }]}>
                                            <Text style={{ fontSize: SUMMARY_NUM_SIZE, fontFamily: 'Poppins_700Bold', color: '#16a34a' }}>{m.p || '—'}</Text>
                                        </View>
                                        <View style={[sheetStyles.dataCell, { width: SUMMARY_COL_W }]}>
                                            <Text style={{ fontSize: SUMMARY_NUM_SIZE, fontFamily: 'Poppins_700Bold', color: '#dc2626' }}>{m.a || '—'}</Text>
                                        </View>
                                        <View style={[sheetStyles.dataCell, { width: SUMMARY_COL_W }]}>
                                            <Text style={{ fontSize: SUMMARY_NUM_SIZE, fontFamily: 'Poppins_700Bold', color: '#d97706' }}>{m.l || '—'}</Text>
                                        </View>
                                        <View style={[sheetStyles.dataCell, { width: SUMMARY_COL_W }]}>
                                            <Text style={{ fontSize: SUMMARY_NUM_SIZE, fontFamily: 'Poppins_700Bold', color: SHEET_TEXT }}>{m.total || '—'}</Text>
                                        </View>
                                        <View style={[sheetStyles.dataCell, { width: PCT_COL_W }]}>
                                            <Text style={{ fontSize: SUMMARY_NUM_SIZE, fontFamily: 'Poppins_800ExtraBold', color: m.sheetPct !== null ? pctColor(m.sheetPct, theme) : SHEET_BORDER }}>
                                                {m.sheetPct !== null ? `${m.sheetPct}%` : '—'}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        </View>

                        {/* Footer legend */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.cardBorder, backgroundColor: theme.card }}>
                            {(['Present', 'Absent', 'Late'] as const).map(label => (
                                <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                    <Text style={{
                                        fontFamily: 'PatrickHand_400Regular', fontSize: LEGEND_FONT_SIZE, fontWeight: '700',
                                        textShadowColor: label === 'Present' ? '#16a34a' : label === 'Absent' ? '#dc2626' : '#d97706',
                                        textShadowOffset: { width: 0.6, height: 0 }, textShadowRadius: 0,
                                        color: label === 'Present' ? '#16a34a' : label === 'Absent' ? '#dc2626' : '#d97706',
                                    }}>{label[0]}</Text>
                                    <Text style={{ fontSize: 10, color: theme.muted }}>{label}</Text>
                                </View>
                            ))}
                            <Text style={{ fontSize: 9, color: theme.muted, marginLeft: 'auto', fontStyle: 'italic' }}>% = (P + L) / Total</Text>
                        </View>
                    </View>

                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    banner: { paddingTop: 28, paddingBottom: 0, flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
    bannerLabel: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: 'rgba(255,255,255,0.75)' },
    bannerPct: { fontSize: 52, fontFamily: 'Poppins_800ExtraBold', color: 'white', lineHeight: 60 },
    bannerSub: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.75)' },
    bannerChipRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    bannerChip: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99 },
    bannerChipText: { fontSize: 12, fontFamily: 'Poppins_700Bold', color: 'white' },
    body: { padding: 14, gap: 14 },
    legendCard: { borderRadius: 16, padding: 14, borderWidth: 1 },
    statCard: { flex: 1, borderRadius: 16, padding: 14, borderWidth: 1, alignItems: 'center' },
    sectionCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    sectionHeader: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
});

const sheetStyles = StyleSheet.create({
    headerCell: {
        height: SHEET_ROW_H, alignItems: 'center', justifyContent: 'center',
        backgroundColor: SHEET_HEADER_BG, borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: SHEET_BORDER + '80',
    },
    headerText: { fontSize: 10, fontFamily: 'Poppins_700Bold', color: SHEET_TEXT },
    dataCell: {
        height: SHEET_ROW_H, alignItems: 'center', justifyContent: 'center',
        borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: SHEET_BORDER + '80',
    },
    monthText: { fontSize: Platform.OS === 'ios' ? 10 : 9, fontFamily: 'Poppins_700Bold', color: SHEET_TEXT },
});
