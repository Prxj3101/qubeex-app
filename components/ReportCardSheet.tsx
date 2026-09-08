import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import { useParentModeLanguage } from '@/context/ParentModeLanguageContext';
import { useDynamicTranslation } from '@/lib/dynamicTranslate';
import { n, t } from '@/lib/parentModeI18n';
import { colorForSubject } from '@/lib/subjectColors';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Exact copy of the "Report Card" section from app/report_card.tsx, lifted into
// its own self-contained (self-fetching) component so it can be dropped
// verbatim into other screens (e.g. Parent Mode) below other content, not just
// the standalone Report Card screen. Keep this in sync with report_card.tsx if
// the sheet's visuals ever change there.

const fs = (n: number) => (Platform.OS === 'ios' ? n + 1 : n);

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
    amber: '#F59E0B', amberLight: '#2D2010',
    green: '#10B981', greenLight: '#0D2B20',
    red: '#EF4444', redLight: '#2B0D0D',
    blue: '#60A5FA', blueLight: '#0D1F3C',
};

function scoreColor(pct: number | null, theme: typeof LIGHT) {
    if (pct === null) return theme.muted;
    if (pct >= 75) return theme.green;
    if (pct >= 35) return theme.amber;
    return theme.red;
}

interface GradeScaleEntry { grade: string; minPct: number }
const DEFAULT_GRADE_SCALE: GradeScaleEntry[] = [
    { grade: 'A', minPct: 75 },
    { grade: 'B', minPct: 60 },
    { grade: 'C', minPct: 45 },
    { grade: 'D', minPct: 35 },
    { grade: 'F', minPct: 0 },
];
const GRADE_COLOR_RAMP = ['#059669', '#16A34A', '#65A30D', '#CA8A04', '#D97706', '#EA580C', '#DC2626', '#B91C1C', '#991B1B'];
function gradeColor(g: string | null, theme: typeof LIGHT, scale: GradeScaleEntry[]) {
    if (!g) return theme.muted;
    const sorted = scale.length > 0 ? [...scale].sort((a, b) => b.minPct - a.minPct) : DEFAULT_GRADE_SCALE;
    const rank = sorted.findIndex(e => e.grade.toUpperCase() === g.toUpperCase());
    if (rank === -1) return theme.muted;
    if (sorted.length <= 1) return GRADE_COLOR_RAMP[0];
    const idx = Math.round((rank / (sorted.length - 1)) * (GRADE_COLOR_RAMP.length - 1));
    return GRADE_COLOR_RAMP[idx];
}

interface ExamCol { id: string; name: string; maxMarks: number; score: number | null; isAbsent: boolean; }
interface MarksheetSubject {
    id: string; name: string; code: string; color: string | null;
    columns: ExamCol[];
    total: { scored: number; max: number };
    pct: number | null; grade: string;
    onlineColumns: ExamCol[];
    onlineTotal: { scored: number; max: number };
    onlinePct: number | null; onlineGrade: string;
}
interface GradedSubject { id: string; name: string; term1Grade: string | null; term2Grade: string | null; }
export interface MarksheetData {
    student: { name: string; rollNo: string };
    gradeScale: GradeScaleEntry[];
    subjects: MarksheetSubject[];
    grandTotal: { scored: number; max: number };
    grandPct: number | null;
    grade: string;
    onlineGrandTotal: { scored: number; max: number };
    onlineGrandPct: number | null;
    onlineGrade: string;
    combinedGrandTotal: { scored: number; max: number };
    combinedGrandPct: number | null;
    combinedGrade: string;
    classRank: number | null;
    combinedClassRank: number | null;
    classSize: number | null;
    gradedSubjects: GradedSubject[];
    conduct: string | null;
    remarks: string | null;
}

// Sheet layout constants
const ROW_H = 32;
const SUBJ_COL_W = 110;
const EXAM_COL_W = 56;
const TOTAL_COL_W = 64;
const PCT_COL_W = 46;
const GRADE_COL_W = 48;
const TESTS_MARKS_COL_W = 210;
const GRADED_NAME_W = 100;
const GRADED_TERM_W = 64;

const SHEET_HEADER_BG = '#EDE4D6';
const SHEET_BODY_BG = '#FAF5EE';
const SHEET_SUMMARY_BG = '#E8DDD0';
const SHEET_BORDER = '#D8C4A0';
const SHEET_TEXT = '#2A1F10';

interface ReportCardSheetProps {
    isDark: boolean;
    // Optional pre-fetched marksheet data. When the caller already has this
    // (e.g. ParentModeView, which fetches /student/marksheet itself to feed
    // its own Subject Performance chart), pass it here instead of leaving
    // this component to do its own redundant fetch — the standalone
    // report_card.tsx screen omits this prop entirely, which keeps this
    // component's own self-fetch behavior for that page.
    // - omitted (undefined): self-fetch mode.
    // - `null`: embed mode, caller's own fetch hasn't resolved yet.
    // - object: embed mode, ready to render.
    data?: MarksheetData | null;
}

export function ReportCardSheet({ isDark, data: providedData }: ReportCardSheetProps) {
    const { accent } = useTheme();
    const theme = { ...(isDark ? DARK : LIGHT), purple: accent.purple, purpleLight: accent.purpleLight };
    const { lang } = useParentModeLanguage();
    const [tab, setTab] = useState<'offline' | 'online'>('offline');
    const isEmbedMode = providedData !== undefined;
    const [fetchedData, setFetchedData] = useState<MarksheetData | null>(null);
    const [selfLoading, setSelfLoading] = useState(!isEmbedMode);

    useEffect(() => {
        if (isEmbedMode) return;
        api.get('/student/marksheet')
            .then(r => setFetchedData(r.data.data))
            .catch(() => {})
            .finally(() => setSelfLoading(false));
        // isEmbedMode is fixed for the lifetime of this component (it's
        // derived from whether the caller passes the prop at all), so this
        // only ever needs to run once, same as before.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const data = isEmbedMode ? providedData : fetchedData;
    const loading = isEmbedMode ? false : selfLoading;

    // Conduct/Remarks are teacher-entered free text, so they can't go through
    // the static UI dictionary — translated dynamically via Azure Translator
    // (see lib/dynamicTranslate.ts) when the parent has selected Hindi/Marathi.
    const [translatedConduct, translatedRemarks] = useDynamicTranslation(
        [data?.conduct ?? '', data?.remarks ?? ''],
        lang
    );

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
            <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={theme.purple} />
            </View>
        );
    }

    if (!data) {
        return (
            <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: theme.muted, textAlign: 'center' }}>
                    {t('resultsNotPublished', lang)}
                </Text>
            </View>
        );
    }

    return (
        <View>
            <View style={[styles.sectionHeader, { borderBottomColor: theme.cardBorder, backgroundColor: theme.card }]}>
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text }}>{t('reportCard', lang)}</Text>
                {/* Neutral gray track — theme.cardBorder is a purple-tinted lavender
                    in light mode (#EDE9FE), which made this look purple regardless
                    of the institution's actual theme color. */}
                <View style={{ flexDirection: 'row', gap: 2, backgroundColor: isDark ? '#2A2A2A' : '#F1F5F9', borderRadius: 10, padding: 2 }}>
                    {(['offline', 'online'] as const).map(tabKey => (
                        <TouchableOpacity key={tabKey} onPress={() => setTab(tabKey)}
                            style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: tab === tabKey ? theme.card : 'transparent' }}>
                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: tab === tabKey ? theme.text : theme.muted }}>{t(tabKey, lang)}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {tab === 'offline' ? (
                <View style={{ backgroundColor: SHEET_BODY_BG }}>
                    {/* Fixed header row */}
                    <View style={{ flexDirection: 'row' }}>
                        <View style={[sheetStyles.headerCell, { width: SUBJ_COL_W, alignItems: 'flex-start', paddingLeft: 8 }]}>
                            <Text style={sheetStyles.headerText}>{t('subjects', lang)}</Text>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={false} ref={offlineBodyScrollRef}>
                            <View style={{ flexDirection: 'row' }}>
                                {uniqueCols.map(col => (
                                    <View key={col.name} style={[sheetStyles.headerCell, { width: EXAM_COL_W }]}>
                                        <Text style={sheetStyles.headerText} numberOfLines={1}>{col.name}</Text>
                                        <Text style={[sheetStyles.headerText, { opacity: 0.6, fontSize: fs(8) }]}>/{n(col.maxMarks, lang)}</Text>
                                    </View>
                                ))}
                                <View style={[sheetStyles.headerCell, { width: TOTAL_COL_W }]}><Text style={sheetStyles.headerText}>{t('total', lang)}</Text></View>
                                <View style={[sheetStyles.headerCell, { width: PCT_COL_W }]}><Text style={sheetStyles.headerText}>%</Text></View>
                                <View style={[sheetStyles.headerCell, { width: GRADE_COL_W }]}><Text style={sheetStyles.headerText}>{t('grade', lang)}</Text></View>
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
                                            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colorForSubject(sub) }} />
                                            <Text style={sheetStyles.subjText} numberOfLines={1}>{sub.name}</Text>
                                        </View>
                                    </View>
                                ))}
                                {/* Grand Total */}
                                <View style={[sheetStyles.dataCell, { width: SUBJ_COL_W, alignItems: 'flex-start', paddingLeft: 8, backgroundColor: SHEET_SUMMARY_BG }]}>
                                    <Text style={[sheetStyles.subjText, { fontFamily: 'Poppins_700Bold' }]}>{t('grandTotal', lang)}</Text>
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
                                                            <Text style={[sheetStyles.valText, { color: scoreColor(cellPct, theme) }]}>{n(c.score, lang)}</Text>
                                                        </View>
                                                    );
                                                })}
                                                <View style={[sheetStyles.dataCell, { width: TOTAL_COL_W, backgroundColor: SHEET_BODY_BG }]}>
                                                    <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold' }]}>{n(sub.total.scored, lang)}/{n(sub.total.max, lang)}</Text>
                                                </View>
                                                <View style={[sheetStyles.dataCell, { width: PCT_COL_W }]}>
                                                    {sub.pct !== null && <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold', color: scoreColor(sub.pct, theme) }]}>{n(sub.pct, lang)}%</Text>}
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
                                            <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold' }]}>{n(data.grandTotal.scored, lang)}/{n(data.grandTotal.max, lang)}</Text>
                                        </View>
                                        <View style={[sheetStyles.dataCell, { width: PCT_COL_W, backgroundColor: SHEET_SUMMARY_BG }]}>
                                            {data.grandPct !== null && <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold', color: scoreColor(data.grandPct, theme) }]}>{n(data.grandPct, lang)}%</Text>}
                                        </View>
                                        <View style={[sheetStyles.dataCell, { width: GRADE_COL_W, backgroundColor: SHEET_SUMMARY_BG }]}>
                                            <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_600SemiBold', color: scoreColor(data.grandPct, theme) }]}>{data.grade}</Text>
                                        </View>
                                    </View>
                                </View>
                            </ScrollView>
                        </View>
                    </ScrollView>

                    {/* Conduct & Remarks — set by the class teacher */}
                    {(data.conduct || data.remarks) && (
                        <View style={{ borderTopWidth: 1, borderTopColor: SHEET_BORDER, marginTop: 12, backgroundColor: SHEET_HEADER_BG, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6 }}>
                            {data.conduct ? (
                                <View style={{ flexDirection: 'row', marginBottom: data.remarks ? 4 : 0 }}>
                                    <Text style={[sheetStyles.subjText, { fontFamily: 'Poppins_700Bold', width: 70 }]}>{t('conductLabel', lang)}</Text>
                                    <Text style={sheetStyles.subjText}>{translatedConduct}</Text>
                                </View>
                            ) : null}
                            {data.remarks ? (
                                <View style={{ flexDirection: 'row' }}>
                                    <Text style={[sheetStyles.subjText, { fontFamily: 'Poppins_700Bold', width: 70 }]}>{t('remarksLabel', lang)}</Text>
                                    <Text style={[sheetStyles.subjText, { fontStyle: 'italic', flex: 1 }]}>{translatedRemarks}</Text>
                                </View>
                            ) : null}
                        </View>
                    )}

                    {/* Graded subjects */}
                    {data.gradedSubjects.length > 0 && (
                        <View style={{ borderTopWidth: 1, borderTopColor: SHEET_BORDER, marginTop: 12 }}>
                            <View style={{ flexDirection: 'row', backgroundColor: SHEET_HEADER_BG }}>
                                <View style={[sheetStyles.headerCell, { width: GRADED_NAME_W, alignItems: 'flex-start', paddingLeft: 8 }]}>
                                    <Text style={sheetStyles.headerText}>{t('gradedSubjects', lang)}</Text>
                                </View>
                                <View style={[sheetStyles.headerCell, { width: GRADED_TERM_W }]}><Text style={sheetStyles.headerText}>{t('term1', lang)}</Text></View>
                                <View style={[sheetStyles.headerCell, { width: GRADED_TERM_W }]}><Text style={sheetStyles.headerText}>{t('term2', lang)}</Text></View>
                            </View>
                            {data.gradedSubjects.map(gs => (
                                <View key={gs.id} style={{ flexDirection: 'row' }}>
                                    <View style={[sheetStyles.dataCell, { width: GRADED_NAME_W, alignItems: 'flex-start', paddingLeft: 8, backgroundColor: SHEET_BODY_BG }]}>
                                        <Text style={sheetStyles.subjText}>{gs.name}</Text>
                                    </View>
                                    <View style={[sheetStyles.dataCell, { width: GRADED_TERM_W }]}>
                                        {gs.term1Grade
                                            ? <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold', color: gradeColor(gs.term1Grade, theme, data.gradeScale) }]}>{gs.term1Grade}</Text>
                                            : <Text style={[sheetStyles.valText, { color: SHEET_BORDER }]}>—</Text>}
                                    </View>
                                    <View style={[sheetStyles.dataCell, { width: GRADED_TERM_W }]}>
                                        {gs.term2Grade
                                            ? <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold', color: gradeColor(gs.term2Grade, theme, data.gradeScale) }]}>{gs.term2Grade}</Text>
                                            : <Text style={[sheetStyles.valText, { color: SHEET_BORDER }]}>—</Text>}
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            ) : data.subjects.some(s => s.onlineTotal.max > 0) ? (
                /* Online: each subject lists every completed test by name with its
                   own mark (as chips), since different subjects can have very
                   different numbers/names of tests — there's no single shared column
                   structure like offline's exam columns. Wrapped in a horizontal
                   ScrollView since the wider "Tests & Marks" column can overflow
                   narrow screens. */
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ backgroundColor: SHEET_BODY_BG }}>
                    <View style={{ flexDirection: 'row', backgroundColor: SHEET_HEADER_BG }}>
                        <View style={[sheetStyles.headerCell, { width: SUBJ_COL_W, alignItems: 'flex-start', paddingLeft: 8 }]}>
                            <Text style={sheetStyles.headerText}>{t('subjects', lang)}</Text>
                        </View>
                        <View style={[sheetStyles.headerCell, { width: TESTS_MARKS_COL_W, alignItems: 'flex-start', paddingLeft: 8 }]}><Text style={sheetStyles.headerText}>{t('testsAndMarks', lang)}</Text></View>
                        <View style={[sheetStyles.headerCell, { width: TOTAL_COL_W }]}><Text style={sheetStyles.headerText}>{t('total', lang)}</Text></View>
                        <View style={[sheetStyles.headerCell, { width: PCT_COL_W }]}><Text style={sheetStyles.headerText}>%</Text></View>
                        <View style={[sheetStyles.headerCell, { width: GRADE_COL_W }]}><Text style={sheetStyles.headerText}>{t('grade', lang)}</Text></View>
                    </View>
                    {data.subjects.map(sub => (
                        <View key={sub.id} style={{ flexDirection: 'row' }}>
                            <View style={[sheetStyles.dataCellFlexTop, { width: SUBJ_COL_W, alignItems: 'flex-start', paddingLeft: 8, backgroundColor: SHEET_BODY_BG }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colorForSubject(sub) }} />
                                    <Text style={sheetStyles.subjText} numberOfLines={1}>{sub.name}</Text>
                                </View>
                            </View>
                            {/* Tests & Marks — one chip per completed test, name + score/max
                                (or "Ab" if absent), matching the web report card exactly. */}
                            <View style={[sheetStyles.dataCellFlexTop, { width: TESTS_MARKS_COL_W, alignItems: 'flex-start', paddingLeft: 6, backgroundColor: SHEET_BODY_BG }]}>
                                {sub.onlineColumns.length > 0 ? (
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                                        {sub.onlineColumns.map(c => {
                                            const cPct = c.maxMarks > 0 && c.score !== null ? Math.round((c.score / c.maxMarks) * 100) : null;
                                            return (
                                                <View key={c.id} style={chipStyles.chip}>
                                                    <Text style={chipStyles.chipLabel} numberOfLines={1}>{c.name}</Text>
                                                    {c.isAbsent
                                                        ? <Text style={[chipStyles.chipVal, { color: theme.red }]}>Ab</Text>
                                                        : <Text style={[chipStyles.chipVal, { color: scoreColor(cPct, theme) }]}>{n(c.score ?? 0, lang)}/{n(c.maxMarks, lang)}</Text>}
                                                </View>
                                            );
                                        })}
                                    </View>
                                ) : <Text style={[sheetStyles.valText, { color: SHEET_BORDER }]}>—</Text>}
                            </View>
                            <View style={[sheetStyles.dataCellFlexTop, { width: TOTAL_COL_W, backgroundColor: SHEET_BODY_BG }]}>
                                <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold' }]}>
                                    {sub.onlineTotal.max > 0 ? `${n(sub.onlineTotal.scored, lang)}/${n(sub.onlineTotal.max, lang)}` : '—'}
                                </Text>
                            </View>
                            <View style={[sheetStyles.dataCellFlexTop, { width: PCT_COL_W, backgroundColor: SHEET_BODY_BG }]}>
                                {sub.onlinePct !== null && <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold', color: scoreColor(sub.onlinePct, theme) }]}>{n(sub.onlinePct, lang)}%</Text>}
                            </View>
                            <View style={[sheetStyles.dataCellFlexTop, { width: GRADE_COL_W, backgroundColor: SHEET_BODY_BG }]}>
                                <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_600SemiBold', color: scoreColor(sub.onlinePct, theme) }]}>{sub.onlineGrade}</Text>
                            </View>
                        </View>
                    ))}
                    {/* Grand Total row */}
                    <View style={{ flexDirection: 'row' }}>
                        <View style={[sheetStyles.dataCell, { width: SUBJ_COL_W, alignItems: 'flex-start', paddingLeft: 8, backgroundColor: SHEET_SUMMARY_BG }]}>
                            <Text style={[sheetStyles.subjText, { fontFamily: 'Poppins_700Bold' }]}>{t('grandTotal', lang)}</Text>
                        </View>
                        <View style={[sheetStyles.dataCell, { width: TESTS_MARKS_COL_W, backgroundColor: SHEET_SUMMARY_BG }]} />
                        <View style={[sheetStyles.dataCell, { width: TOTAL_COL_W, backgroundColor: SHEET_SUMMARY_BG }]}>
                            <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold' }]}>
                                {data.onlineGrandTotal.max > 0 ? `${n(data.onlineGrandTotal.scored, lang)}/${n(data.onlineGrandTotal.max, lang)}` : '—'}
                            </Text>
                        </View>
                        <View style={[sheetStyles.dataCell, { width: PCT_COL_W, backgroundColor: SHEET_SUMMARY_BG }]}>
                            {data.onlineGrandPct !== null && <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_700Bold', color: scoreColor(data.onlineGrandPct, theme) }]}>{n(data.onlineGrandPct, lang)}%</Text>}
                        </View>
                        <View style={[sheetStyles.dataCell, { width: GRADE_COL_W, backgroundColor: SHEET_SUMMARY_BG }]}>
                            <Text style={[sheetStyles.valText, { fontFamily: 'Poppins_600SemiBold', color: scoreColor(data.onlineGrandPct, theme) }]}>{data.onlineGrade}</Text>
                        </View>
                    </View>
                </View>
                </ScrollView>
            ) : (
                <View style={{ alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: theme.muted }}>{t('noCompletedTests', lang)}</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted, opacity: 0.7 }}>{t('onlineResultsAppearHere', lang)}</Text>
                </View>
            )}

            {/* Footer legend */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.cardBorder }}>
                {[
                    { label: t('legendPassGood', lang), color: theme.green, sample: 75 },
                    { label: t('legendPassOk', lang), color: theme.amber, sample: 36 },
                    { label: t('legendFail', lang), color: theme.red, sample: 17 },
                ].map(item => (
                    <View key={`${lang}-${item.label}`} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                        <Text key={`${lang}-sample`} style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: item.color }}>{n(item.sample, lang)}%</Text>
                        <Text style={{ fontSize: 9, color: theme.muted }}>{item.label}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
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
    dataCellFlexTop: {
        minHeight: ROW_H, alignItems: 'center', justifyContent: 'center', paddingVertical: 6,
        borderRightWidth: 1, borderBottomWidth: 1, borderColor: SHEET_BORDER,
    },
    subjText: { fontSize: fs(11), fontFamily: 'Poppins_600SemiBold', color: SHEET_TEXT },
    valText: { fontSize: fs(11), fontFamily: 'Poppins_600SemiBold', color: SHEET_TEXT },
});

const chipStyles = StyleSheet.create({
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: '#EDE4D6', borderWidth: 1, borderColor: SHEET_BORDER,
        borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2,
    },
    chipLabel: { fontSize: fs(9), fontFamily: 'Poppins_500Medium', color: '#7A6A55' },
    chipVal: { fontSize: fs(9), fontFamily: 'Poppins_700Bold' },
});
