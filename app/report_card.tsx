import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/context/ThemeContext';
import { useRef, useState } from 'react';
import {
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// iPhone text renders slightly smaller than Android at the same fontSize,
// so bump every Report Card text size by 1pt on iOS only.
const fs = (n: number) => (Platform.OS === 'ios' ? n + 1 : n);
// One more bump, iOS-only, for the name card specifically.
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

const STUDENT_NAME = 'Prajwal Jagdish Kotian';
const ROLL_NO = '09';

// Same subjects/colors/percentages as the Subject Performance card & web report card.
const SUBJECTS = [
    { id: 'eng', name: 'English', color: '#DA7756', offline: 78, online: 82 },
    { id: 'hin', name: 'Hindi', color: '#EC4899', offline: 70, online: 75 },
    { id: 'mar', name: 'Marathi', color: '#0891B2', offline: 65, online: 70 },
    { id: 'alg', name: 'Algebra', color: '#7C3AED', offline: 80, online: 85 },
    { id: 'geo', name: 'Geometry', color: '#059669', offline: 72, online: 78 },
    { id: 'sc1', name: 'Science 1', color: '#0EA5E9', offline: 68, online: 74 },
    { id: 'sc2', name: 'Science 2', color: '#6366F1', offline: 75, online: 80 },
    { id: 'his', name: 'History', color: '#D97706', offline: 60, online: 66 },
    { id: 'geog', name: 'Geography', color: '#16A34A', offline: 73, online: 77 },
];

const OVERALL_RANK = { offline: 6, online: 3 };

const OFFLINE_EXAMS = [
    { id: 'ut1', name: 'Unit Test', maxMarks: 20 },
    { id: 'oral', name: 'Oral', maxMarks: 40 },
    { id: 'mid', name: 'Mid Sem', maxMarks: 40 },
    { id: 'ut2', name: 'Unit Test II', maxMarks: 40 },
    { id: 'final', name: 'Final Sem', maxMarks: 80 },
];

const ONLINE_EXAMS = [
    { id: 'ot1', name: 'Online Test 1', maxMarks: 20 },
    { id: 'ot2', name: 'Online Test 2', maxMarks: 20 },
    { id: 'ot3', name: 'Online Test 3', maxMarks: 20 },
];

const GRADED_SUBS = [
    { id: 'gs1', name: 'PT' }, { id: 'gs2', name: 'SG' }, { id: 'gs3', name: 'ICT' },
    { id: 'gs4', name: 'GK' }, { id: 'gs5', name: 'ART' }, { id: 'gs6', name: 'EVS' }, { id: 'gs7', name: 'VE' },
];

const AVATAR_COLORS = ['#7C3AED', '#DA7756', '#0891B2', '#059669', '#D97706', '#DC2626', '#2563EB', '#8B5CF6'];

function getAvatarColor(n: string) { return AVATAR_COLORS[n.charCodeAt(0) % AVATAR_COLORS.length]; }
function getInitials(n: string) { return n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase(); }

function scoreColor(pct: number, theme: typeof LIGHT) {
    if (pct >= 75) return theme.green;
    if (pct >= 35) return theme.amber;
    return theme.red;
}

function gradeLabel(pct: number) {
    if (pct >= 75) return 'A';
    if (pct >= 60) return 'B';
    if (pct >= 45) return 'C';
    if (pct >= 35) return 'D';
    return 'F';
}

// ── Sheet layout constants (same idea as the Attendance Sheet) ─────────────────
const ROW_H = 32;
const SUBJ_COL_W = 92;
const EXAM_COL_W = 56;
const TOTAL_COL_W = 58;
const PCT_COL_W = 46;
const GRADE_COL_W = 48;

const SHEET_HEADER_BG = '#EDE4D6';
const SHEET_BODY_BG = '#FAF5EE';
const SHEET_SUMMARY_BG = '#E8DDD0';
const SHEET_BORDER = '#D8C4A0';
const SHEET_TEXT = '#2A1F10';

export default function ReportCard() {
    const { isDark } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const [tab, setTab] = useState<'offline' | 'online'>('offline');
    const isOffline = tab === 'offline';
    const examList = isOffline ? OFFLINE_EXAMS : ONLINE_EXAMS;

    // Online table: the body is the only draggable surface. The header and
    // footer are pure visual mirrors (scrollEnabled=false) so dragging the
    // body just pushes its x-offset onto them — no two-way echo to fight with.
    const onlineHeaderScrollRef = useRef<ScrollView>(null);
    const onlineFooterScrollRef = useRef<ScrollView>(null);

    const overallPct = Math.round(SUBJECTS.reduce((s, sub) => s + sub[tab], 0) / SUBJECTS.length);
    const rank = OVERALL_RANK[tab];

    let grandScored = 0, grandMax = 0;
    const subjectData = SUBJECTS.map(sub => {
        const pct = sub[tab];
        let scored = 0;
        const cells = examList.map(ex => {
            const val = Math.round((pct / 100) * ex.maxMarks);
            scored += val;
            const cellPct = ex.maxMarks > 0 ? Math.round((val / ex.maxMarks) * 100) : null;
            return { ex, val, pct: cellPct };
        });
        const maxTotal = examList.reduce((s, ex) => s + ex.maxMarks, 0);
        const totalPct = maxTotal > 0 ? Math.round((scored / maxTotal) * 100) : null;
        grandScored += scored;
        grandMax += maxTotal;
        return { sub, cells, scored, maxTotal, totalPct };
    });
    const grandPct = grandMax > 0 ? Math.round((grandScored / grandMax) * 100) : null;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
            <ScreenHeader title="Report Card" showBack />
            <ScrollView showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never" contentContainerStyle={{ padding: 14, gap: 14 }}>

                {/* ── Name card ── */}
                <View style={[styles.nameCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: getAvatarColor(STUDENT_NAME) }}>
                        <Text style={{ fontSize: fs(16) + iosExtra, fontFamily: 'Poppins_700Bold', color: 'white' }}>{getInitials(STUDENT_NAME)}</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: fs(14) + iosExtra, fontFamily: 'Poppins_700Bold', color: theme.text }}>{STUDENT_NAME}</Text>
                        <Text style={{ fontSize: fs(11) + iosExtra, fontFamily: 'Poppins_400Regular', color: theme.muted, marginTop: 2 }}>Roll No. {ROLL_NO}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', width: '100%', gap: 10 }}>
                        <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.amber + '40', backgroundColor: theme.amber + '0D' }}>
                            <Text style={{ fontSize: fs(16) + iosExtra, fontFamily: 'Poppins_800ExtraBold', color: theme.amber }}>#{rank}</Text>
                            <Text style={{ fontSize: fs(8) + iosExtra, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Class Rank</Text>
                        </View>
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: fs(13) + iosExtra, fontFamily: 'Poppins_800ExtraBold', color: scoreColor(overallPct, theme) }}>{overallPct}%</Text>
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
                                    style={{
                                        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
                                        backgroundColor: tab === t ? theme.card : 'transparent',
                                    }}>
                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: tab === t ? theme.text : theme.muted, textTransform: 'capitalize' }}>{t}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={{ height: (1 + SUBJECTS.length + 1 + 1) * ROW_H }}>
                    {isOffline ? (
                    <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled bounces={false} overScrollMode="never">
                    {(() => {
                        const mainScrollWidth = OFFLINE_EXAMS.length * EXAM_COL_W + TOTAL_COL_W + PCT_COL_W + GRADE_COL_W;
                        return (
                            <View style={{ flexDirection: 'row', backgroundColor: SHEET_BODY_BG }}>
                                {/* Sticky left — Subjects (covers the main table only, same as web) */}
                                <View>
                                    <View style={[sheetStyles.headerCell, { width: SUBJ_COL_W, alignItems: 'flex-start', paddingLeft: 8 }]}>
                                        <Text style={sheetStyles.headerText}>Subjects</Text>
                                    </View>
                                    {subjectData.map(({ sub }) => (
                                        <View key={sub.id} style={[sheetStyles.dataCell, { width: SUBJ_COL_W, alignItems: 'flex-start', paddingLeft: 8, backgroundColor: SHEET_BODY_BG }]}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: sub.color }} />
                                                <Text style={sheetStyles.subjText} numberOfLines={1}>{sub.name}</Text>
                                            </View>
                                        </View>
                                    ))}
                                    <View style={[sheetStyles.dataCell, { width: SUBJ_COL_W, alignItems: 'flex-start', paddingLeft: 8, backgroundColor: SHEET_BODY_BG }]}>
                                        <Text style={[sheetStyles.subjText, { fontFamily: 'Poppins_700Bold' }]}>Grand Total</Text>
                                    </View>
                                    <View style={[sheetStyles.dataCell, { width: SUBJ_COL_W, alignItems: 'flex-start', paddingLeft: 8, backgroundColor: SHEET_HEADER_BG }]}>
                                        <Text style={[sheetStyles.subjText, { fontFamily: 'Poppins_700Bold' }]}>Conduct</Text>
                                    </View>
                                </View>

                                {/* Scrollable — main table's exams/total/%/grade, then Graded Subjects right beside it, exactly like web */}
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false} overScrollMode="never">
                                    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                        {/* Main table */}
                                        <View>
                                            <View style={{ flexDirection: 'row' }}>
                                                {OFFLINE_EXAMS.map(ex => (
                                                    <View key={ex.id} style={[sheetStyles.headerCell, { width: EXAM_COL_W }]}>
                                                        <Text style={sheetStyles.headerText}>{ex.name}</Text>
                                                        <Text style={[sheetStyles.headerText, { opacity: 0.6, fontSize: fs(8) }]}>/{ex.maxMarks}</Text>
                                                    </View>
                                                ))}
                                                <View style={[sheetStyles.headerCell, { width: TOTAL_COL_W }]}><Text style={sheetStyles.headerText}>Total</Text></View>
                                                <View style={[sheetStyles.headerCell, { width: PCT_COL_W }]}><Text style={sheetStyles.headerText}>%</Text></View>
                                                <View style={[sheetStyles.headerCell, { width: GRADE_COL_W }]}><Text style={sheetStyles.headerText}>Grade</Text></View>
                                            </View>
                                            {subjectData.map(({ sub, cells, scored, maxTotal, totalPct }) => (
                                                <View key={sub.id} style={{ flexDirection: 'row' }}>
                                                    {cells.map(({ ex, val, pct }) => (
                                                        <View key={ex.id} style={[sheetStyles.dataCell, { width: EXAM_COL_W }]}>
                                                            <Text style={[sheetStyles.valText, { color: scoreColor(pct ?? 0, theme) }]}>{val}</Text>
                                                        </View>
                                                    ))}
                                                    <View style={[sheetStyles.dataCell, { width: TOTAL_COL_W }]}>
                                                        <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold' }]}>{scored}/{maxTotal}</Text>
                                                    </View>
                                                    <View style={[sheetStyles.dataCell, { width: PCT_COL_W }]}>
                                                        {totalPct !== null && <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold', color: scoreColor(totalPct, theme) }]}>{totalPct}%</Text>}
                                                    </View>
                                                    <View style={[sheetStyles.dataCell, { width: GRADE_COL_W }]}>
                                                        {totalPct !== null && <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_600SemiBold', color: scoreColor(totalPct, theme) }]}>{gradeLabel(totalPct)}</Text>}
                                                    </View>
                                                </View>
                                            ))}
                                            {/* Grand Total row */}
                                            <View style={{ flexDirection: 'row' }}>
                                                {OFFLINE_EXAMS.map(ex => (
                                                    <View key={ex.id} style={[sheetStyles.dataCell, { width: EXAM_COL_W, backgroundColor: SHEET_BODY_BG }]} />
                                                ))}
                                                <View style={[sheetStyles.dataCell, { width: TOTAL_COL_W, backgroundColor: SHEET_SUMMARY_BG }]}>
                                                    <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold' }]}>{grandScored}/{grandMax}</Text>
                                                </View>
                                                <View style={[sheetStyles.dataCell, { width: PCT_COL_W, backgroundColor: SHEET_SUMMARY_BG }]}>
                                                    {grandPct !== null && <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold', color: scoreColor(grandPct, theme) }]}>{grandPct}%</Text>}
                                                </View>
                                                <View style={[sheetStyles.dataCell, { width: GRADE_COL_W, backgroundColor: SHEET_SUMMARY_BG }]}>
                                                    {grandPct !== null && <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_600SemiBold', color: scoreColor(grandPct, theme) }]}>{gradeLabel(grandPct)}</Text>}
                                                </View>
                                            </View>
                                            {/* Conduct & Remarks row */}
                                            <View style={{ flexDirection: 'row', width: mainScrollWidth, height: ROW_H, borderBottomWidth: 1, borderColor: SHEET_BORDER }}>
                                                <View style={{ width: 90, justifyContent: 'center', paddingLeft: 8, borderRightWidth: 1, borderColor: SHEET_BORDER }}>
                                                    <Text style={sheetStyles.subjText}>Excellent</Text>
                                                </View>
                                                <View style={{ width: 90, justifyContent: 'center', paddingLeft: 8, borderRightWidth: 1, borderColor: SHEET_BORDER, backgroundColor: SHEET_HEADER_BG }}>
                                                    <Text style={[sheetStyles.subjText, { fontFamily: 'Poppins_700Bold' }]}>Remarks</Text>
                                                </View>
                                                <View style={{ flex: 1, justifyContent: 'center', paddingLeft: 8 }}>
                                                    <Text style={[sheetStyles.subjText, { fontFamily: 'Poppins_400Regular', fontStyle: 'italic' }]}>Good keep it up</Text>
                                                </View>
                                            </View>
                                        </View>

                                        {/* Graded Subjects table — right beside the main table, same scroll */}
                                        <View style={{ marginLeft: 12, borderLeftWidth: 1, borderLeftColor: SHEET_BORDER }}>
                                            <View style={{ flexDirection: 'row' }}>
                                                <View style={[sheetStyles.headerCell, { width: 100, alignItems: 'flex-start', paddingLeft: 8 }]}>
                                                    <Text style={sheetStyles.headerText}>Graded Subjects</Text>
                                                </View>
                                                <View style={[sheetStyles.headerCell, { width: 70 }]}><Text style={sheetStyles.headerText}>Term 1</Text></View>
                                                <View style={[sheetStyles.headerCell, { width: 70 }]}><Text style={sheetStyles.headerText}>Term 2</Text></View>
                                            </View>
                                            {GRADED_SUBS.map(gs => (
                                                <View key={gs.id} style={{ flexDirection: 'row' }}>
                                                    <View style={[sheetStyles.dataCell, { width: 100, alignItems: 'flex-start', paddingLeft: 8 }]}>
                                                        <Text style={sheetStyles.subjText}>{gs.name}</Text>
                                                    </View>
                                                    <View style={[sheetStyles.dataCell, { width: 70 }]}><Text style={[sheetStyles.valText, { color: SHEET_BORDER }]}>—</Text></View>
                                                    <View style={[sheetStyles.dataCell, { width: 70 }]}><Text style={[sheetStyles.valText, { color: SHEET_BORDER }]}>—</Text></View>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                </ScrollView>
                            </View>
                        );
                    })()}
                    </ScrollView>
                    ) : (
                        /* Online: grouped by subject */
                        <View style={{ flex: 1, flexDirection: 'column' }}>

                        {/* Fixed header row — sits outside the scroll area, so it never moves */}
                        <View style={{ flexDirection: 'row', backgroundColor: SHEET_BODY_BG }}>
                            <View style={[sheetStyles.headerCell, { width: 130, alignItems: 'flex-start', paddingLeft: 8 }]}>
                                <Text style={sheetStyles.headerText}>Subject / Exam</Text>
                            </View>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={false} ref={onlineHeaderScrollRef}>
                                <View style={{ flexDirection: 'row' }}>
                                    <View style={[sheetStyles.headerCell, { width: EXAM_COL_W }]}><Text style={sheetStyles.headerText}>Score</Text></View>
                                    <View style={[sheetStyles.headerCell, { width: EXAM_COL_W }]}><Text style={sheetStyles.headerText}>Max</Text></View>
                                    <View style={[sheetStyles.headerCell, { width: PCT_COL_W }]}><Text style={sheetStyles.headerText}>%</Text></View>
                                    <View style={[sheetStyles.headerCell, { width: GRADE_COL_W }]}><Text style={sheetStyles.headerText}>Grade</Text></View>
                                </View>
                            </ScrollView>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled bounces={false} overScrollMode="never" style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', backgroundColor: SHEET_BODY_BG }}>
                            <View>
                                {subjectData.map(({ sub, cells, scored, totalPct }) => (
                                    <View key={sub.id}>
                                        <View style={[sheetStyles.dataCell, { width: 130, alignItems: 'flex-start', paddingLeft: 8, backgroundColor: SHEET_HEADER_BG }]}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sub.color }} />
                                                <Text style={[sheetStyles.subjText, { fontFamily: 'Poppins_700Bold' }]} numberOfLines={1}>{sub.name}</Text>
                                            </View>
                                        </View>
                                        {cells.map(({ ex }) => (
                                            <View key={ex.id} style={[sheetStyles.dataCell, { width: 130, alignItems: 'flex-start', paddingLeft: 18 }]}>
                                                <Text style={sheetStyles.subjText} numberOfLines={1}>{ex.name}</Text>
                                            </View>
                                        ))}
                                        <View style={[sheetStyles.dataCell, { width: 130, alignItems: 'flex-start', paddingLeft: 18, backgroundColor: SHEET_BODY_BG }]}>
                                            <Text style={[sheetStyles.subjText, { fontFamily: 'Poppins_600SemiBold_Italic' }]}>Total</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>

                            <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false} overScrollMode="never"
                                onScroll={(e) => {
                                    onlineHeaderScrollRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false });
                                    onlineFooterScrollRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false });
                                }}
                                scrollEventThrottle={16}>
                                <View>
                                    {subjectData.map(({ sub, cells, scored, maxTotal, totalPct }) => (
                                        <View key={sub.id}>
                                            <View style={{
                                                height: ROW_H, width: EXAM_COL_W * 2 + PCT_COL_W + GRADE_COL_W,
                                                backgroundColor: SHEET_HEADER_BG,
                                                borderRightWidth: 1, borderBottomWidth: 1, borderColor: SHEET_BORDER,
                                            }} />
                                            {cells.map(({ ex, val, pct }) => (
                                                <View key={ex.id} style={{ flexDirection: 'row' }}>
                                                    <View style={[sheetStyles.dataCell, { width: EXAM_COL_W }]}>
                                                        <Text style={[sheetStyles.valText, { color: scoreColor(pct ?? 0, theme) }]}>{val}</Text>
                                                    </View>
                                                    <View style={[sheetStyles.dataCell, { width: EXAM_COL_W }]}>
                                                        <Text style={sheetStyles.valText}>{ex.maxMarks}</Text>
                                                    </View>
                                                    <View style={[sheetStyles.dataCell, { width: PCT_COL_W }]}>
                                                        {pct !== null && <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_600SemiBold', color: scoreColor(pct, theme) }]}>{pct}%</Text>}
                                                    </View>
                                                    <View style={[sheetStyles.dataCell, { width: GRADE_COL_W }]}>
                                                        <Text style={[sheetStyles.valText, { color: SHEET_BORDER }]}>—</Text>
                                                    </View>
                                                </View>
                                            ))}
                                            <View style={{ flexDirection: 'row' }}>
                                                <View style={[sheetStyles.dataCell, { width: EXAM_COL_W, backgroundColor: SHEET_BODY_BG }]}>
                                                    <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold' }]}>{scored}</Text>
                                                </View>
                                                <View style={[sheetStyles.dataCell, { width: EXAM_COL_W, backgroundColor: SHEET_BODY_BG }]}>
                                                    <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold' }]}>{maxTotal}</Text>
                                                </View>
                                                <View style={[sheetStyles.dataCell, { width: PCT_COL_W, backgroundColor: SHEET_BODY_BG }]}>
                                                    {totalPct !== null && <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold', color: scoreColor(totalPct, theme) }]}>{totalPct}%</Text>}
                                                </View>
                                                <View style={[sheetStyles.dataCell, { width: GRADE_COL_W, backgroundColor: SHEET_BODY_BG }]}>
                                                    {totalPct !== null && <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_600SemiBold', color: scoreColor(totalPct, theme) }]}>{gradeLabel(totalPct)}</Text>}
                                                </View>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            </ScrollView>
                        </View>
                        </ScrollView>

                        {/* Fixed footer row — Grand Total, same horizontal sync as the header */}
                        <View style={{ flexDirection: 'row', backgroundColor: SHEET_BODY_BG }}>
                            <View style={[sheetStyles.dataCell, { width: 130, alignItems: 'flex-start', paddingLeft: 8, backgroundColor: SHEET_SUMMARY_BG }]}>
                                <Text style={[sheetStyles.subjText, { fontFamily: 'Poppins_700Bold' }]}>Grand Total</Text>
                            </View>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={false} ref={onlineFooterScrollRef}>
                                <View style={{ flexDirection: 'row' }}>
                                    <View style={[sheetStyles.dataCell, { width: EXAM_COL_W, backgroundColor: SHEET_SUMMARY_BG }]}>
                                        <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold' }]}>{grandScored}</Text>
                                    </View>
                                    <View style={[sheetStyles.dataCell, { width: EXAM_COL_W, backgroundColor: SHEET_SUMMARY_BG }]}>
                                        <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold' }]}>{grandMax}</Text>
                                    </View>
                                    <View style={[sheetStyles.dataCell, { width: PCT_COL_W, backgroundColor: SHEET_SUMMARY_BG }]}>
                                        {grandPct !== null && <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold', color: scoreColor(grandPct, theme) }]}>{grandPct}%</Text>}
                                    </View>
                                    <View style={[sheetStyles.dataCell, { width: GRADE_COL_W, backgroundColor: SHEET_SUMMARY_BG }]}>
                                        {grandPct !== null && <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_600SemiBold', color: scoreColor(grandPct, theme) }]}>{gradeLabel(grandPct)}</Text>}
                                    </View>
                                </View>
                            </ScrollView>
                        </View>
                        </View>
                    )}
                    </View>

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
    nameCard: {
        borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'column', alignItems: 'center', gap: 8,
    },
    sectionCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    sectionHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1,
    },
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
