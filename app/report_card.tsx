import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const fs = (n: number) => (Platform.OS === 'ios' ? n + 1 : n);
const iosExtra = Platform.OS === 'ios' ? 1 : 0;

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
    amber: '#F59E0B', amberLight: '#2D2010',
    green: '#10B981', greenLight: '#0D2B20',
    red: '#EF4444', redLight: '#2B0D0D',
    blue: '#60A5FA', blueLight: '#0D1F3C',
};

const AVATAR_COLORS = ['#7C3AED', '#DA7756', '#0891B2', '#059669', '#D97706', '#DC2626', '#2563EB', '#8B5CF6'];
function getAvatarColor(n: string) { return AVATAR_COLORS[n.charCodeAt(0) % AVATAR_COLORS.length]; }
function getInitials(n: string) { return n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase(); }

function scoreColor(pct: number | null, theme: typeof LIGHT) {
    if (pct === null) return theme.muted;
    if (pct >= 75) return theme.green;
    if (pct >= 35) return theme.amber;
    return theme.red;
}

const GRADE_COLORS: Record<string, string> = {
    'A+': '#059669', 'A': '#10B981', 'B': '#3B82F6', 'C': '#F59E0B', 'D': '#F97316', 'F': '#EF4444',
};
function gradeColor(g: string | null, theme: typeof LIGHT) { return g ? (GRADE_COLORS[g] ?? theme.muted) : theme.muted; }

interface ExamCol { id: string; name: string; maxMarks: number; score: number | null; isAbsent: boolean; }
interface MarksheetSubject {
    id: string; name: string; code: string; color: string | null;
    columns: ExamCol[];
    total: { scored: number; max: number };
    pct: number | null; grade: string;
}
interface GradedSubject { id: string; name: string; term1Grade: string | null; term2Grade: string | null; }
interface MarksheetData {
    student: { name: string; rollNo: string };
    subjects: MarksheetSubject[];
    grandTotal: { scored: number; max: number };
    grandPct: number | null;
    grade: string;
    classRank: number | null;
    classSize: number | null;
    gradedSubjects: GradedSubject[];
}

// Sheet layout constants
const ROW_H = 32;
const SUBJ_COL_W = 110;
const EXAM_COL_W = 56;
const TOTAL_COL_W = 64;
const PCT_COL_W = 46;
const GRADE_COL_W = 48;
const GRADED_NAME_W = 100;
const GRADED_TERM_W = 64;

const SHEET_HEADER_BG = '#EDE4D6';
const SHEET_BODY_BG = '#FAF5EE';
const SHEET_SUMMARY_BG = '#E8DDD0';
const SHEET_BORDER = '#D8C4A0';
const SHEET_TEXT = '#2A1F10';

export default function ReportCard() {
    const { isDark } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const [tab, setTab] = useState<'offline' | 'online'>('offline');
    const [data, setData] = useState<MarksheetData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/student/marksheet')
            .then(r => setData(r.data.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    // Unique exam columns in order of first occurrence across all subjects
    const uniqueCols = useMemo(() => {
        if (!data) return [] as { name: string; maxMarks: number }[];
        const seen = new Set<string>();
        const cols: { name: string; maxMarks: number }[] = [];
        for (const sub of data.subjects) {
            for (const col of sub.columns) {
                if (!seen.has(col.name)) {
                    seen.add(col.name);
                    cols.push({ name: col.name, maxMarks: col.maxMarks });
                }
            }
        }
        return cols;
    }, [data]);

    // For syncing horizontal scroll between header and body in offline tab
    const offlineBodyScrollRef = useRef<ScrollView>(null);

    if (loading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
                <ScreenHeader title="Report Card" showBack />
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color={theme.purple} />
                </View>
            </SafeAreaView>
        );
    }

    if (!data) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
                <ScreenHeader title="Report Card" showBack />
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_500Medium', color: theme.muted, textAlign: 'center' }}>
                        Results not published yet.
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    const studentName = data.student.name;
    const rollNo = data.student.rollNo;
    const rank = data.classRank;
    const overallPct = data.grandPct ?? 0;

    // Offline scroll width
    const offlineScrollWidth = uniqueCols.length * EXAM_COL_W + TOTAL_COL_W + PCT_COL_W + GRADE_COL_W;
    // Graded subjects scroll width
    const gradedScrollWidth = GRADED_TERM_W * 2;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
            <ScreenHeader title="Report Card" showBack />
            <ScrollView showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never" contentContainerStyle={{ padding: 14, gap: 14 }}>

                {/* ── Name card ── */}
                <View style={[styles.nameCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: getAvatarColor(studentName) }}>
                        <Text style={{ fontSize: fs(16) + iosExtra, fontFamily: 'Poppins_700Bold', color: 'white' }}>{getInitials(studentName)}</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: fs(14) + iosExtra, fontFamily: 'Poppins_700Bold', color: theme.text }}>{studentName}</Text>
                        <Text style={{ fontSize: fs(11) + iosExtra, fontFamily: 'Poppins_400Regular', color: theme.muted, marginTop: 2 }}>Roll No. {rollNo}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', width: '100%', gap: 10 }}>
                        <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.amber + '40', backgroundColor: theme.amber + '0D' }}>
                            <Text style={{ fontSize: fs(16) + iosExtra, fontFamily: 'Poppins_800ExtraBold', color: theme.amber }}>{rank !== null ? `#${rank}` : '—'}</Text>
                            <Text style={{ fontSize: fs(8) + iosExtra, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Class Rank</Text>
                        </View>
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: fs(13) + iosExtra, fontFamily: 'Poppins_800ExtraBold', color: scoreColor(overallPct, theme) }}>{overallPct > 0 ? `${overallPct}%` : '—'}</Text>
                            <Text style={{ fontSize: fs(8) + iosExtra, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Overall</Text>
                        </View>
                    </View>
                </View>

                {/* ── Report Card ── */}
                <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                    <View style={[styles.sectionHeader, { borderBottomColor: theme.cardBorder, backgroundColor: theme.card }]}>
                        <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text }}>Report Card</Text>
                        <View style={{ flexDirection: 'row', gap: 2, backgroundColor: theme.cardBorder, borderRadius: 10, padding: 2 }}>
                            {(['offline', 'online'] as const).map(t => (
                                <TouchableOpacity key={t} onPress={() => setTab(t)}
                                    style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: tab === t ? theme.card : 'transparent' }}>
                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: tab === t ? theme.text : theme.muted, textTransform: 'capitalize' }}>{t}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {tab === 'offline' ? (
                        <View style={{ backgroundColor: SHEET_BODY_BG }}>
                            {/* Fixed header row */}
                            <View style={{ flexDirection: 'row' }}>
                                <View style={[sheetStyles.headerCell, { width: SUBJ_COL_W, alignItems: 'flex-start', paddingLeft: 8 }]}>
                                    <Text style={sheetStyles.headerText}>Subjects</Text>
                                </View>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={false} ref={offlineBodyScrollRef}>
                                    <View style={{ flexDirection: 'row' }}>
                                        {uniqueCols.map(col => (
                                            <View key={col.name} style={[sheetStyles.headerCell, { width: EXAM_COL_W }]}>
                                                <Text style={sheetStyles.headerText} numberOfLines={1}>{col.name}</Text>
                                                <Text style={[sheetStyles.headerText, { opacity: 0.6, fontSize: fs(8) }]}>/{col.maxMarks}</Text>
                                            </View>
                                        ))}
                                        <View style={[sheetStyles.headerCell, { width: TOTAL_COL_W }]}><Text style={sheetStyles.headerText}>Total</Text></View>
                                        <View style={[sheetStyles.headerCell, { width: PCT_COL_W }]}><Text style={sheetStyles.headerText}>%</Text></View>
                                        <View style={[sheetStyles.headerCell, { width: GRADE_COL_W }]}><Text style={sheetStyles.headerText}>Grade</Text></View>
                                    </View>
                                </ScrollView>
                            </View>

                            {/* Scrollable body */}
                            <ScrollView
                                showsVerticalScrollIndicator={false}
                                nestedScrollEnabled
                                bounces={false}
                                overScrollMode="never"
                                style={{ maxHeight: (data.subjects.length + 1) * ROW_H + 10 }}
                            >
                                <View style={{ flexDirection: 'row' }}>
                                    {/* Sticky left — subject names */}
                                    <View>
                                        {data.subjects.map(sub => (
                                            <View key={sub.id} style={[sheetStyles.dataCell, { width: SUBJ_COL_W, alignItems: 'flex-start', paddingLeft: 8, backgroundColor: SHEET_BODY_BG }]}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: sub.color ?? '#94A3B8' }} />
                                                    <Text style={sheetStyles.subjText} numberOfLines={1}>{sub.name}</Text>
                                                </View>
                                            </View>
                                        ))}
                                        {/* Grand Total */}
                                        <View style={[sheetStyles.dataCell, { width: SUBJ_COL_W, alignItems: 'flex-start', paddingLeft: 8, backgroundColor: SHEET_SUMMARY_BG }]}>
                                            <Text style={[sheetStyles.subjText, { fontFamily: 'Poppins_700Bold' }]}>Grand Total</Text>
                                        </View>
                                    </View>

                                    {/* Scrollable — exam scores + totals */}
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        bounces={false}
                                        overScrollMode="never"
                                        onScroll={e => offlineBodyScrollRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false })}
                                        scrollEventThrottle={16}
                                    >
                                        <View>
                                            {data.subjects.map(sub => {
                                                const byName = new Map(sub.columns.map(c => [c.name, c]));
                                                return (
                                                    <View key={sub.id} style={{ flexDirection: 'row' }}>
                                                        {uniqueCols.map(col => {
                                                            const c = byName.get(col.name);
                                                            if (!c) return (
                                                                <View key={col.name} style={[sheetStyles.dataCell, { width: EXAM_COL_W }]}>
                                                                    <Text style={[sheetStyles.valText, { color: SHEET_BORDER }]}>—</Text>
                                                                </View>
                                                            );
                                                            if (c.isAbsent) return (
                                                                <View key={col.name} style={[sheetStyles.dataCell, { width: EXAM_COL_W }]}>
                                                                    <Text style={[sheetStyles.valText, { color: theme.red }]}>Ab</Text>
                                                                </View>
                                                            );
                                                            if (c.score === null) return (
                                                                <View key={col.name} style={[sheetStyles.dataCell, { width: EXAM_COL_W }]}>
                                                                    <Text style={[sheetStyles.valText, { color: SHEET_BORDER }]}>—</Text>
                                                                </View>
                                                            );
                                                            const cellPct = c.maxMarks > 0 ? Math.round((c.score / c.maxMarks) * 100) : null;
                                                            return (
                                                                <View key={col.name} style={[sheetStyles.dataCell, { width: EXAM_COL_W }]}>
                                                                    <Text style={[sheetStyles.valText, { color: scoreColor(cellPct, theme) }]}>{c.score}</Text>
                                                                </View>
                                                            );
                                                        })}
                                                        <View style={[sheetStyles.dataCell, { width: TOTAL_COL_W, backgroundColor: SHEET_BODY_BG }]}>
                                                            <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold' }]}>{sub.total.scored}/{sub.total.max}</Text>
                                                        </View>
                                                        <View style={[sheetStyles.dataCell, { width: PCT_COL_W }]}>
                                                            {sub.pct !== null && <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold', color: scoreColor(sub.pct, theme) }]}>{sub.pct}%</Text>}
                                                        </View>
                                                        <View style={[sheetStyles.dataCell, { width: GRADE_COL_W }]}>
                                                            <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_600SemiBold', color: scoreColor(sub.pct, theme) }]}>{sub.grade}</Text>
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                            {/* Grand Total row */}
                                            <View style={{ flexDirection: 'row' }}>
                                                {uniqueCols.map(col => (
                                                    <View key={col.name} style={[sheetStyles.dataCell, { width: EXAM_COL_W, backgroundColor: SHEET_BODY_BG }]} />
                                                ))}
                                                <View style={[sheetStyles.dataCell, { width: TOTAL_COL_W, backgroundColor: SHEET_SUMMARY_BG }]}>
                                                    <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold' }]}>{data.grandTotal.scored}/{data.grandTotal.max}</Text>
                                                </View>
                                                <View style={[sheetStyles.dataCell, { width: PCT_COL_W, backgroundColor: SHEET_SUMMARY_BG }]}>
                                                    {data.grandPct !== null && <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold', color: scoreColor(data.grandPct, theme) }]}>{data.grandPct}%</Text>}
                                                </View>
                                                <View style={[sheetStyles.dataCell, { width: GRADE_COL_W, backgroundColor: SHEET_SUMMARY_BG }]}>
                                                    <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_600SemiBold', color: scoreColor(data.grandPct, theme) }]}>{data.grade}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    </ScrollView>
                                </View>
                            </ScrollView>

                            {/* Graded subjects */}
                            {data.gradedSubjects.length > 0 && (
                                <View style={{ borderTopWidth: 1, borderTopColor: SHEET_BORDER, marginTop: 12 }}>
                                    <View style={{ flexDirection: 'row', backgroundColor: SHEET_HEADER_BG }}>
                                        <View style={[sheetStyles.headerCell, { width: GRADED_NAME_W, alignItems: 'flex-start', paddingLeft: 8 }]}>
                                            <Text style={sheetStyles.headerText}>Graded Subjects</Text>
                                        </View>
                                        <View style={[sheetStyles.headerCell, { width: GRADED_TERM_W }]}><Text style={sheetStyles.headerText}>Term 1</Text></View>
                                        <View style={[sheetStyles.headerCell, { width: GRADED_TERM_W }]}><Text style={sheetStyles.headerText}>Term 2</Text></View>
                                    </View>
                                    {data.gradedSubjects.map(gs => (
                                        <View key={gs.id} style={{ flexDirection: 'row' }}>
                                            <View style={[sheetStyles.dataCell, { width: GRADED_NAME_W, alignItems: 'flex-start', paddingLeft: 8, backgroundColor: SHEET_BODY_BG }]}>
                                                <Text style={sheetStyles.subjText}>{gs.name}</Text>
                                            </View>
                                            <View style={[sheetStyles.dataCell, { width: GRADED_TERM_W }]}>
                                                {gs.term1Grade
                                                    ? <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold', color: gradeColor(gs.term1Grade, theme) }]}>{gs.term1Grade}</Text>
                                                    : <Text style={[sheetStyles.valText, { color: SHEET_BORDER }]}>—</Text>}
                                            </View>
                                            <View style={[sheetStyles.dataCell, { width: GRADED_TERM_W }]}>
                                                {gs.term2Grade
                                                    ? <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold', color: gradeColor(gs.term2Grade, theme) }]}>{gs.term2Grade}</Text>
                                                    : <Text style={[sheetStyles.valText, { color: SHEET_BORDER }]}>—</Text>}
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    ) : (
                        /* Online: placeholder */
                        <View style={{ alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 }}>
                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: theme.muted }}>Online results not yet available</Text>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted, opacity: 0.7 }}>Online exam module is coming soon</Text>
                        </View>
                    )}

                    {/* Footer legend */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.cardBorder }}>
                        {[
                            { label: '≥75% Pass', color: theme.green, sample: 75 },
                            { label: '35–74% Pass', color: theme.amber, sample: 36 },
                            { label: '<35% Fail', color: theme.red, sample: 17 },
                        ].map(item => (
                            <View key={item.label} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                                <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: item.color }}>{item.sample}%</Text>
                                <Text style={{ fontSize: 9, color: theme.muted }}>{item.label}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    nameCard: { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'column', alignItems: 'center', gap: 8 },
    sectionCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
});

const sheetStyles = StyleSheet.create({
    headerCell: {
        height: ROW_H, alignItems: 'center', justifyContent: 'center',
        backgroundColor: SHEET_HEADER_BG, borderRightWidth: 1, borderBottomWidth: 1, borderColor: SHEET_BORDER,
    },
    headerText: { fontSize: fs(10), fontFamily: 'Poppins_700Bold', color: SHEET_TEXT },
    dataCell: {
        height: ROW_H, alignItems: 'center', justifyContent: 'center',
        borderRightWidth: 1, borderBottomWidth: 1, borderColor: SHEET_BORDER,
    },
    subjText: { fontSize: fs(11), fontFamily: 'Poppins_600SemiBold', color: SHEET_TEXT },
    valText: { fontSize: fs(11), fontFamily: 'Poppins_600SemiBold', color: SHEET_TEXT },
});
