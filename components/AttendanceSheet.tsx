import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import { useParentModeLanguage } from '@/context/ParentModeLanguageContext';
import { n, t } from '@/lib/parentModeI18n';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Exact copy of the "Attendance Sheet" section from app/attendance_detail.tsx
// (the register-style month x date grid), lifted into its own self-contained
// (optionally self-fetching) component so it can be dropped verbatim into
// other screens — e.g. Parent Mode — not just the standalone Attendance
// Details screen. Keep this in sync with attendance_detail.tsx if the sheet's
// visuals ever change there.

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
    bg: '#000000', card: '#0A0A0A', cardBorder: '#1F1F1F',
    text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B',
    purple: '#A78BFA', purpleLight: '#2D1F50',
    amber: '#FCD34D', amberLight: '#2D2010',
    green: '#34D399', greenLight: '#0D2B20',
    red: '#F87171', redLight: '#2B0D0D',
    blue: '#60A5FA', blueLight: '#0D1F3C',
};

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

export interface AttendanceMonth {
    month: string; key: number; year: number;
    present: number; absent: number; leave: number; total: number;
    pct: number | null;
}
export interface AttendanceApiData {
    academicYear: string; startYear: number;
    overall: { present: number; absent: number; leave: number; total: number; pct: number | null };
    monthly: AttendanceMonth[];
    daily: Record<string, string>;
    holidays: { date: string; name: string }[];
    student: { name: string; rollNo: string };
}

interface AttendanceSheetProps {
    isDark: boolean;
    // Optional pre-fetched attendance data — same pattern as ReportCardSheet's
    // `data` prop. Omitted: self-fetch mode (used by the standalone
    // attendance_detail.tsx screen). `null`: embed mode, caller's own fetch
    // hasn't resolved yet. Object: embed mode, ready to render.
    data?: AttendanceApiData | null;
}

export function AttendanceSheet({ isDark, data: providedData }: AttendanceSheetProps) {
    const { accent } = useTheme();
    const theme = { ...(isDark ? DARK : LIGHT), purple: accent.purple, purpleLight: accent.purpleLight };
    const { lang } = useParentModeLanguage();
    const isEmbedMode = providedData !== undefined;
    const [fetchedData, setFetchedData] = useState<AttendanceApiData | null>(null);
    const [selfLoading, setSelfLoading] = useState(!isEmbedMode);
    const [activeHoliday, setActiveHoliday] = useState<{ name: string; month: string; day: number } | null>(null);

    useEffect(() => {
        if (isEmbedMode) return;
        api.get('/student/attendance')
            .then(r => setFetchedData(r.data.data))
            .catch(() => {})
            .finally(() => setSelfLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const data = isEmbedMode ? providedData : fetchedData;
    const loading = isEmbedMode ? false : selfLoading;

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

    if (loading) {
        return (
            <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={theme.purple} />
            </View>
        );
    }

    if (!data) {
        return (
            <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: theme.muted, textAlign: 'center' }}>
                    {t('noAttendanceRecords', lang)}
                </Text>
            </View>
        );
    }

    return (
        <View>
            <View style={[styles.sectionHeader, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text }}>{t('attendanceSheet', lang)}</Text>
                <View style={{ flex: 1 }} />
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{data.student.name ?? ''}</Text>
                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{t('rollNo', lang)} {data.student.rollNo ?? ''}</Text>
                </View>
            </View>

            <View style={{ flexDirection: 'row', backgroundColor: SHEET_BODY_BG }}>
                {/* Sticky left — Month */}
                <View>
                    <View style={[sheetStyles.headerCell, { width: MONTH_COL_W }]}>
                        <Text style={[sheetStyles.headerText, { fontSize: Platform.OS === 'ios' ? 10 : 9 }]}>{t('month', lang)}</Text>
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
                                    <Text style={sheetStyles.headerText}>{n(d, lang)}</Text>
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
                                <Text style={{ fontSize: SUMMARY_NUM_SIZE, fontFamily: 'Poppins_700Bold', color: '#16a34a' }}>{m.p ? n(m.p, lang) : '—'}</Text>
                            </View>
                            <View style={[sheetStyles.dataCell, { width: SUMMARY_COL_W }]}>
                                <Text style={{ fontSize: SUMMARY_NUM_SIZE, fontFamily: 'Poppins_700Bold', color: '#dc2626' }}>{m.a ? n(m.a, lang) : '—'}</Text>
                            </View>
                            <View style={[sheetStyles.dataCell, { width: SUMMARY_COL_W }]}>
                                <Text style={{ fontSize: SUMMARY_NUM_SIZE, fontFamily: 'Poppins_700Bold', color: '#d97706' }}>{m.l ? n(m.l, lang) : '—'}</Text>
                            </View>
                            <View style={[sheetStyles.dataCell, { width: SUMMARY_COL_W }]}>
                                <Text style={{ fontSize: SUMMARY_NUM_SIZE, fontFamily: 'Poppins_700Bold', color: SHEET_TEXT }}>{m.total ? n(m.total, lang) : '—'}</Text>
                            </View>
                            <View style={[sheetStyles.dataCell, { width: PCT_COL_W }]}>
                                <Text style={{ fontSize: SUMMARY_NUM_SIZE, fontFamily: 'Poppins_800ExtraBold', color: m.sheetPct !== null ? pctColor(m.sheetPct, theme) : SHEET_BORDER }}>
                                    {m.sheetPct !== null ? `${n(m.sheetPct, lang)}%` : '—'}
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
                        <Text style={{ fontSize: 10, color: theme.muted }}>
                            {t(label === 'Present' ? 'present' : label === 'Absent' ? 'absent' : 'late', lang)}
                        </Text>
                    </View>
                ))}
                <Text style={{ fontSize: 9, color: theme.muted, marginLeft: 'auto', fontStyle: 'italic' }}>% = (P + L) / Total</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
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
