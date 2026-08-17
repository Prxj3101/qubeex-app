import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
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
    View,
    ActivityIndicator,
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

const MONTH_FULL: Record<string, string> = {
    Jun: 'June', Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October',
    Nov: 'November', Dec: 'December', Jan: 'January', Feb: 'February',
    Mar: 'March', Apr: 'April', May: 'May',
};

function getStatus(pct: number): 'safe' | 'condonation' | 'defaulter' {
    if (pct >= 75) return 'safe';
    if (pct >= 65) return 'condonation';
    return 'defaulter';
}
function pctColor(p: number, theme: typeof LIGHT) {
    return p >= 75 ? theme.green : p >= 65 ? theme.amber : theme.red;
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
const PAL_FONT_SIZE = Platform.OS === 'ios' ? 15 : 14;
const LEGEND_FONT_SIZE = Platform.OS === 'ios' ? 18 : 17;
const SUMMARY_NUM_SIZE = Platform.OS === 'ios' ? 11 : 10;

interface AttendanceMonth {
    month: string; key: number; year: number;
    present: number; absent: number; leave: number; total: number;
    pct: number | null;
}
interface AttendanceApiData {
    academicYear: string; startYear: number;
    overall: { present: number; absent: number; leave: number; total: number; pct: number | null };
    monthly: AttendanceMonth[];
    daily: Record<string, string>;
    holidays: { date: string; name: string }[];
    student: { name: string; rollNo: string };
}

export default function AttendanceDetail() {
    const { isDark } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const [activeHoliday, setActiveHoliday] = useState<{ name: string; month: string; day: number } | null>(null);
    const [data, setData] = useState<AttendanceApiData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/student/attendance')
            .then(r => setData(r.data.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const floatAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, { toValue: -8, duration: 1000, useNativeDriver: true }),
                Animated.timing(floatAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    // Holiday lookup: "YYYY-MM-DD" → name
    const holidayMap = useMemo(() => {
        const m: Record<string, string> = {};
        for (const h of data?.holidays ?? []) m[h.date] = h.name;
        return m;
    }, [data]);

    const monthData = useMemo(() => {
        if (!data) return [];
        return data.monthly.map(m => {
            const paddedM = String(m.key + 1).padStart(2, '0');
            const daysInMonth = new Date(m.year, m.key + 1, 0).getDate();
            const p = m.present, a = m.absent, l = m.leave, total = m.total;
            const sheetPct = total > 0 ? Math.round(((p + l) / total) * 100) : null;
            return { ...m, daysInMonth, p, a, l, total, sheetPct, paddedM };
        });
    }, [data]);

    const overallPct = data?.overall.pct ?? 0;
    const overallStatus = getStatus(overallPct);
    const totalPresent = data?.overall.present ?? 0;
    const totalTotal = data?.overall.total ?? 0;

    // Current month pct: find the month matching today
    const now = new Date();
    const curMonthKey = now.getMonth();
    const currentMonthEntry = data?.monthly.find(m => m.key === curMonthKey);
    const currentMonthPct = currentMonthEntry?.pct ?? 0;

    if (loading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
                <ScreenHeader title="Attendance Details" showBack />
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color={theme.purple} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
            <ScreenHeader title="Attendance Details" showBack />
            <ScrollView showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never" contentContainerStyle={{ paddingBottom: 40 }}>

                {/* Hero banner */}
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
                        <Text style={styles.bannerPct}>{overallPct > 0 ? `${overallPct}%` : '—'}</Text>
                        <Text style={styles.bannerSub}>{totalPresent} of {totalTotal} classes attended</Text>
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

                    {/* Attendance Rules */}
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

                    {/* Overall + This Month */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                            <Text style={{ fontSize: 22, fontFamily: 'Poppins_800ExtraBold', color: overallPct > 0 ? pctColor(overallPct, theme) : theme.muted }}>
                                {overallPct > 0 ? `${overallPct}%` : '—'}
                            </Text>
                            <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular', marginTop: 2 }}>Overall</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                            <Text style={{ fontSize: 22, fontFamily: 'Poppins_800ExtraBold', color: currentMonthPct > 0 ? pctColor(currentMonthPct, theme) : theme.muted }}>
                                {currentMonthPct > 0 ? `${currentMonthPct}%` : '—'}
                            </Text>
                            <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular', marginTop: 2 }}>This Month</Text>
                        </View>
                    </View>

                    {/* Month-wise Attendance */}
                    <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        <View style={[styles.sectionHeader, { backgroundColor: isDark ? '#1F1545' : '#F8F7FF', borderBottomColor: theme.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                            <CalendarDays size={16} color={theme.green} />
                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text }}>Month-wise Attendance</Text>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled style={{ maxHeight: 188 }} contentContainerStyle={{ padding: 12, gap: 10 }}>
                            {monthData.length === 0 ? (
                                <Text style={{ fontSize: 12, color: theme.muted, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingVertical: 16 }}>No attendance records yet</Text>
                            ) : monthData.map(m => (
                                <View key={m.month} style={{ gap: 4 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ fontSize: 11, color: theme.subText, fontFamily: 'Poppins_400Regular' }}>{MONTH_FULL[m.month]}</Text>
                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: m.pct !== null ? pctColor(m.pct, theme) : theme.muted }}>
                                            {m.pct !== null ? `${m.pct}%` : '—'}
                                        </Text>
                                    </View>
                                    <View style={{ height: 7, backgroundColor: theme.cardBorder, borderRadius: 99, overflow: 'hidden' }}>
                                        <View style={{ position: 'absolute', left: '75%', top: 0, bottom: 0, width: 1, backgroundColor: theme.muted, opacity: 0.5, zIndex: 1 }} />
                                        {m.pct !== null && (
                                            <View style={{ width: `${m.pct}%`, height: '100%', backgroundColor: pctColor(m.pct, theme), borderRadius: 99 }} />
                                        )}
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                    </View>

                    {/* Attendance Sheet */}
                    <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        <View style={[styles.sectionHeader, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                            <CalendarCheck size={16} color={theme.green} />
                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text }}>Attendance Sheet</Text>
                            <View style={{ flex: 1 }} />
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{data?.student.name ?? ''}</Text>
                                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Roll No. {data?.student.rollNo ?? ''}</Text>
                            </View>
                        </View>

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

                            {/* Scrollable middle — dates 1–31 */}
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <View>
                                    <View style={{ flexDirection: 'row' }}>
                                        {DATE_COLS.map(d => (
                                            <View key={d} style={[sheetStyles.headerCell, { width: DATE_COL_W }]}>
                                                <Text style={sheetStyles.headerText}>{d}</Text>
                                            </View>
                                        ))}
                                    </View>
                                    {monthData.map((m, mi) => (
                                        <View key={m.month} style={{ flexDirection: 'row', position: 'relative' }}>
                                            {DATE_COLS.map(d => {
                                                const isOutOfMonth = d > m.daysInMonth;
                                                const isSunday = !isOutOfMonth && new Date(m.year, m.key, d).getDay() === 0;
                                                const dateStr = !isOutOfMonth
                                                    ? `${m.year}-${m.paddedM}-${String(d).padStart(2, '0')}`
                                                    : '';
                                                const holName = dateStr ? holidayMap[dateStr] : undefined;
                                                const isHol = !isSunday && !!holName;
                                                const status = dateStr && data ? (data.daily[dateStr] ?? null) : null;
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
                                                        <TouchableOpacity key={d} activeOpacity={0.7}
                                                            onPress={() => {
                                                                setActiveHoliday(prev =>
                                                                    prev?.month === m.month && prev?.day === d
                                                                        ? null
                                                                        : { name: holName ?? 'Holiday', month: m.month, day: d }
                                                                );
                                                            }}
                                                            style={[sheetStyles.dataCell, { width: DATE_COL_W, backgroundColor: cellBg }]}>
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

                                            {/* Floating tooltip — anchored to the tapped holiday cell
                                                itself (inside the same scrollable row) instead of a
                                                banner pinned to the top of the card, which went out of
                                                view whenever the sheet was scrolled past the tapped row. */}
                                            {activeHoliday?.month === m.month && (
                                                <TouchableOpacity
                                                    activeOpacity={1}
                                                    onPress={() => setActiveHoliday(null)}
                                                    style={{
                                                        position: 'absolute',
                                                        // First row has no room above it, so its tooltip
                                                        // opens downward; every other row opens upward.
                                                        [mi === 0 ? 'top' : 'bottom']: SHEET_ROW_H + 4,
                                                        left: Math.max(0, (activeHoliday.day - 1) * DATE_COL_W + DATE_COL_W / 2 - 55),
                                                        zIndex: 20,
                                                        backgroundColor: theme.text,
                                                        borderRadius: 8,
                                                        paddingHorizontal: 10,
                                                        paddingVertical: 6,
                                                        minWidth: 110,
                                                        maxWidth: 160,
                                                        shadowColor: '#000',
                                                        shadowOpacity: 0.25,
                                                        shadowRadius: 6,
                                                        shadowOffset: { width: 0, height: 2 },
                                                        elevation: 6,
                                                    }}
                                                >
                                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: theme.card }}>
                                                        {activeHoliday.name}
                                                    </Text>
                                                    <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: theme.card, opacity: 0.8, marginTop: 1 }}>
                                                        {m.month} {activeHoliday.day}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
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
