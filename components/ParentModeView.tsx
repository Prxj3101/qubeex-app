import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import { AttendanceSheet, type AttendanceApiData } from '@/components/AttendanceSheet';
import { FlagsSheet } from '@/components/FlagsSheet';
import { ParentChatEntry } from '@/components/ParentChat';
import { ParentFormsEntry } from '@/components/ParentForms';
import { ParentPtmEntry } from '@/components/ParentPtm';
import { ReportCardSheet, type MarksheetData as ReportCardMarksheetData } from '@/components/ReportCardSheet';
import { StudentIDCard } from '@/components/StudentIDCard';
import { ParentModeLanguageContext } from '@/context/ParentModeLanguageContext';
import { Flag as FlagItem } from '@/data/flags';
import { useStudent } from '@/context/StudentContext';
import { useDynamicTranslation } from '@/lib/dynamicTranslate';
import { n, PARENT_LANGUAGES, ParentLang, t } from '@/lib/parentModeI18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import {
    BarChart2,
    CalendarCheck,
    CalendarDays,
    CalendarX,
    Check,
    CheckCircle2,
    ClipboardList,
    Clock3,
    Flag,
    Globe,
    Share2,
    Sparkles,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

const PARENT_LANG_STORAGE_KEY = 'parentModeLang';

interface MarksheetSubject {
    id: string;
    name: string;
    color?: string | null;
    pct: number | null;
    grade: string;
    combinedPct?: number | null;
}

interface MarksheetData {
    student: { name: string; rollNo: string };
    subjects: MarksheetSubject[];
    grandPct: number | null;
    grade: string;
    combinedGrandPct: number | null;
    classRank: number | null;
    combinedClassRank: number | null;
    classSize: number | null;
    conduct: string | null;
    remarks: string | null;
    pdfUrl?: string | null;
}

// Reuse AttendanceSheet's own full type instead of a narrower local one — the
// real /student/attendance response already includes monthly/daily/holidays,
// and the embedded AttendanceSheet below needs all of it.
type AttendanceData = AttendanceApiData;

interface PTMNote {
    id: string;
    note: string;
    createdByName: string;
    createdAt: string;
    acknowledgedAt: string | null;
}

const LIGHT = { bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE', text: '#0F172A', subText: '#64748B', muted: '#94A3B8', purple: '#7C3AED', amber: '#F59E0B' };
const DARK = { bg: '#000000', card: '#141414', cardBorder: '#2A2A2A', text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B', purple: '#A78BFA', amber: '#FBBF24' };

// Per-language sentence templates for the tier verdict, keyed the same way
// across en/hinglish/hi/mr. Hindi/Marathi entries are phrased as noun
// phrases ("उत्कृष्ट प्रदर्शन" rather than a conjugated verb) specifically to
// dodge gendered verb agreement (राहा/रही, केला/केली) that a single template
// can't correctly pick for an unknown student — this "report style" phrasing
// is standard in Indian report cards for exactly this reason.
const TIER_LABELS: Record<'excelling' | 'doingWell' | 'moderate' | 'challenging', Record<ParentLang, string>> = {
    excelling: { en: 'excelling', hinglish: 'bahot badhiya performance', hi: 'उत्कृष्ट प्रदर्शन', mr: 'उत्कृष्ट कामगिरी' },
    doingWell: { en: 'doing well overall', hinglish: 'overall achha performance', hi: 'समग्र रूप से अच्छा प्रदर्शन', mr: 'एकंदरीत चांगली कामगिरी' },
    moderate: { en: 'performing at a moderate level', hinglish: 'moderate level ka performance', hi: 'मध्यम स्तर का प्रदर्शन', mr: 'मध्यम पातळीची कामगिरी' },
    challenging: { en: 'finding this term challenging', hinglish: 'is term mein thoda challenging performance', hi: 'इस टर्म में चुनौतीपूर्ण स्थिति', mr: 'या टर्ममध्ये आव्हानात्मक स्थिती' },
};

// Rule-based (non-AI-call) narrative summary generated purely from data
// already on the page. A real LLM-generated summary would need a backend AI
// endpoint; this is written to read like one — a holistic, name-led verdict
// on the student — while actually being a template stitched from strongest/
// weakest subject, attendance category, and rank position. Now built
// per-language so the whole snapshot reads naturally in whichever of the 4
// languages the parent has selected.
function buildSummary(marksheet: MarksheetData | null, attendance: AttendanceData | null, studentName: string | null | undefined, lang: ParentLang): string {
    if (!marksheet) return '';

    const name = (studentName || marksheet.student?.name || 'The student').split(' ')[0];
    const overallPct = marksheet.combinedGrandPct ?? marksheet.grandPct;
    const attPct = attendance?.overall.pct ?? null;

    const gradedSubjects = marksheet.subjects.filter(s => (s.combinedPct ?? s.pct) !== null);
    const sorted = [...gradedSubjects].sort((a, b) => (b.combinedPct ?? b.pct ?? 0) - (a.combinedPct ?? a.pct ?? 0));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const hasSpread = best && worst && best.id !== worst.id;

    const tierKey: 'excelling' | 'doingWell' | 'moderate' | 'challenging' | null = overallPct == null
        ? null
        : overallPct >= 85 ? 'excelling'
        : overallPct >= 70 ? 'doingWell'
        : overallPct >= 50 ? 'moderate'
        : 'challenging';

    const sentences: string[] = [];

    // Opening verdict — the "AI read" on the student, not a raw stat.
    if (tierKey) {
        const tier = TIER_LABELS[tierKey][lang];
        const pct = n(Math.round(overallPct!), lang);
        const hasRank = !!(marksheet.combinedClassRank && marksheet.classSize);
        const classSize = n(marksheet.classSize ?? 0, lang);
        const classRank = n(marksheet.combinedClassRank ?? 0, lang);
        if (lang === 'hi') {
            const rankClause = hasRank ? `, कक्षा में ${classSize} में से ${classRank}वां स्थान` : '';
            sentences.push(`${name} का इस टर्म में ${tier} है, कुल मिलाकर ${pct}% अंक${rankClause}.`);
        } else if (lang === 'mr') {
            const rankClause = hasRank ? `, वर्गात ${classSize} पैकी ${classRank} वा क्रमांक` : '';
            sentences.push(`${name} चे या टर्ममध्ये ${tier} आहे, एकूण ${pct}%${rankClause}.`);
        } else if (lang === 'hinglish') {
            const rankClause = hasRank ? `, class mein ${marksheet.classSize} mein se ${marksheet.combinedClassRank} rank` : '';
            sentences.push(`${name} ka is term mein ${tier} hai, overall ${pct}%${rankClause}.`);
        } else {
            const rankClause = hasRank ? `, ranked ${marksheet.combinedClassRank} of ${marksheet.classSize} in class` : '';
            sentences.push(`${name} is ${tier} this term, currently at ${pct}% overall${rankClause}.`);
        }
    }

    // Strength vs. growth area, framed as an observation rather than a stat dump.
    if (hasSpread) {
        const bestPct = n(Math.round(best.combinedPct ?? best.pct ?? 0), lang);
        const worstPct = n(Math.round(worst.combinedPct ?? worst.pct ?? 0), lang);
        if (lang === 'hi') sentences.push(`${name} का सबसे मज़बूत विषय ${best.name} है (${bestPct}%), जबकि ${worst.name} पर अधिक ध्यान देने की आवश्यकता है (${worstPct}%).`);
        else if (lang === 'mr') sentences.push(`${name} चा सर्वात मजबूत विषय ${best.name} आहे (${bestPct}%), तर ${worst.name} वर अधिक लक्ष देण्याची गरज आहे (${worstPct}%).`);
        else if (lang === 'hinglish') sentences.push(`${name} ka sabse strong subject ${best.name} hai (${bestPct}%), jabki ${worst.name} pe thoda aur focus karne ki zaroorat hai (${worstPct}%).`);
        else sentences.push(`${name}'s strongest subject is ${best.name} at ${bestPct}%, while ${worst.name} stands out as an area to focus on at ${worstPct}%.`);
    } else if (best) {
        const pct = n(Math.round(best.combinedPct ?? best.pct ?? 0), lang);
        if (lang === 'hi') sentences.push(`${name} का सभी विषयों में लगातार प्रदर्शन है, लगभग ${pct}%.`);
        else if (lang === 'mr') sentences.push(`${name} ची सर्व विषयांमध्ये सातत्यपूर्ण कामगिरी आहे, अंदाजे ${pct}%.`);
        else if (lang === 'hinglish') sentences.push(`${name} ka sabhi subjects mein consistent performance hai, lagbhag ${pct}%.`);
        else sentences.push(`${name} is performing consistently across subjects, around ${pct}%.`);
    }

    // Attendance woven in as context for the overall picture, not a bare number.
    if (attPct != null) {
        const pct = n(Math.round(attPct), lang);
        if (attPct >= 90) {
            if (lang === 'hi') sentences.push(`उपस्थिति ${pct}% के साथ उत्कृष्ट रही है, जिससे नियमित कक्षा में भागीदारी सुनिश्चित हुई है.`);
            else if (lang === 'mr') sentences.push(`उपस्थिती ${pct}% सह उत्कृष्ट राहिली आहे, ज्यामुळे नियमित वर्ग सहभाग सुनिश्चित झाला आहे.`);
            else if (lang === 'hinglish') sentences.push(`Attendance ${pct}% ke saath excellent raha hai, jisse regular classroom exposure mila hai.`);
            else sentences.push(`Attendance has been excellent at ${pct}%, giving consistent classroom exposure.`);
        } else if (attPct >= 75) {
            if (lang === 'hi') sentences.push(`उपस्थिति ${pct}% पर स्थिर है.`);
            else if (lang === 'mr') sentences.push(`उपस्थिती ${pct}% वर स्थिर आहे.`);
            else if (lang === 'hinglish') sentences.push(`Attendance ${pct}% par steady hai.`);
            else sentences.push(`Attendance is steady at ${pct}%.`);
        } else {
            if (lang === 'hi') sentences.push(`उपस्थिति ${pct}% के साथ थोड़ी कम है, इस पर ध्यान देना ज़रूरी है.`);
            else if (lang === 'mr') sentences.push(`उपस्थिती ${pct}% सह थोडी कमी आहे, यावर लक्ष ठेवणे गरजेचे आहे.`);
            else if (lang === 'hinglish') sentences.push(`Attendance ${pct}% thoda kam hai, isper dhyaan dena zaroori hai.`);
            else sentences.push(`Attendance is on the lower side at ${pct}%, which is worth keeping an eye on.`);
        }
    }

    // A closing, forward-looking line — what an assistant would flag for the meeting.
    if (hasSpread) {
        if (lang === 'hi') sentences.push(`आज चर्चा के लिए: ${worst.name} में अतिरिक्त अभ्यास, ताकि यह अच्छा टर्म और बेहतर बने.`);
        else if (lang === 'mr') sentences.push(`आज चर्चेसाठी: ${worst.name} मध्ये अतिरिक्त सराव, जेणेकरून हा चांगला टर्म आणखी चांगला होईल.`);
        else if (lang === 'hinglish') sentences.push(`Aaj discuss karne layak: ${worst.name} mein extra practice, taaki ye achha term aur behtar bane.`);
        else sentences.push(`Worth discussing today: extra practice in ${worst.name} to build on an otherwise solid term.`);
    } else if (tierKey === 'excelling' || tierKey === 'doingWell') {
        if (lang === 'hi') sentences.push(`कुल मिलाकर, यह एक अच्छा और सुसंगत टर्म रहा है, इसी तरह आगे बढ़ते रहें.`);
        else if (lang === 'mr') sentences.push(`एकूणच, हा एक चांगला आणि सातत्यपूर्ण टर्म राहिला आहे, याच पद्धतीने पुढे जा.`);
        else if (lang === 'hinglish') sentences.push(`Overall, ek achha aur consistent term raha hai, isi tarah aage badhte rahein.`);
        else sentences.push(`Overall, a good, consistent term to build on.`);
    }

    return sentences.join(' ');
}

// Same thresholds/colors as the marksheet elsewhere in the app (report_card.tsx's
// scoreColor): >=75% emerald, >=35% amber, else red — kept in sync so a subject
// reads the same "good/okay/needs attention" at a glance everywhere it appears.
function scoreColor(pct: number | null): string {
    if (pct === null) return '#94A3B8';
    if (pct >= 75) return '#10B981';
    if (pct >= 35) return '#F59E0B';
    return '#EF4444';
}

// Same 75%/65% attendance-eligibility thresholds and "Good / Condonation Zone
// / Defaulter" wording used app-wide in attendance_detail.tsx, so a parent
// sees the exact same verdict here as the student does elsewhere in the app —
// just presented as a clear headline badge instead of a legend chip.
function attendanceStatus(pct: number | null, lang: ParentLang): { label: string; emoji: string; color: string } {
    if (pct === null) return { label: t('statusNoData', lang), emoji: '—', color: '#94A3B8' };
    if (pct >= 75) return { label: t('statusGood', lang), emoji: '✅', color: '#10B981' };
    if (pct >= 65) return { label: t('statusCondonation', lang), emoji: '⚠️', color: '#F59E0B' };
    return { label: t('statusDefaulter', lang), emoji: '🚫', color: '#EF4444' };
}

// A parent-specific, actionable read on attendance that doesn't exist
// anywhere else in the app: instead of just a %, tell the parent where they
// stand against the 75% eligibility line. Deliberately worded to never read
// as "permission" to take another day off (e.g. never says "can miss X more
// days") — it's framed as a cushion/caution level, or as a recovery target
// when below the line.
function attendanceSafetyNote(present: number, leave: number, total: number, lang: ParentLang): string | null {
    if (total <= 0) return null;
    const effective = present + leave;
    const pct = (effective / total) * 100;
    if (pct >= 75) {
        const buffer = Math.floor(effective / 0.75 - total);
        if (buffer <= 0) {
            if (lang === 'hi') return `यह बिल्कुल गुड ज़ोन की सीमा पर है — एक और अनुपस्थिति से ${n(75, lang)}% से नीचे जा सकता है.`;
            if (lang === 'mr') return `हे अगदी गुड झोनच्या सीमेवर आहे — आणखी एक अनुपस्थिती ${n(75, lang)}% च्या खाली आणू शकते.`;
            if (lang === 'hinglish') return 'Bilkul Good zone ke edge par hai — ek aur absent hone se 75% se neeche ja sakta hai.';
            return 'Right at the edge of the Good zone — another absence could drop below 75%.';
        }
        if (buffer <= 4) {
            if (lang === 'hi') return `यह गुड ज़ोन में है, लेकिन ${n(75, lang)}% के ऊपर मार्जिन कम है — अब से अनावश्यक अनुपस्थिति से बचना बेहतर होगा.`;
            if (lang === 'mr') return `हे गुड झोनमध्ये आहे, पण ${n(75, lang)}% च्या वर मार्जिन कमी आहे — यापुढे अनावश्यक गैरहजेरी टाळणे चांगले.`;
            if (lang === 'hinglish') return 'Good zone mein hai, lekin 75% ke upar cushion kam hai — ab se bematlab ki absence avoid karna behtar hoga.';
            return 'In the Good zone, but the cushion above 75% is thin — best to avoid unnecessary absences from here.';
        }
        if (lang === 'hi') return `यह गुड ज़ोन में आराम से है, ${n(75, lang)}% रेखा के ऊपर पर्याप्त मार्जिन मौजूद है.`;
        if (lang === 'mr') return `हे गुड झोनमध्ये आरामात आहे, ${n(75, lang)}% रेषेच्या वर पुरेसे मार्जिन आहे.`;
        if (lang === 'hinglish') return 'Good zone mein comfortably hai, 75% line ke upar achha khaasa cushion maujood hai.';
        return 'Comfortably placed in the Good zone with a healthy cushion above the 75% line.';
    }
    const needed = Math.ceil((0.75 * total - effective) / 0.25);
    if (lang === 'hi') return `गुड ज़ोन में वापस आने के लिए ${n(needed, lang)} और दिनों की पूरी उपस्थिति चाहिए.`;
    if (lang === 'mr') return `गुड झोनमध्ये परत येण्यासाठी आणखी ${n(needed, lang)} दिवसांची पूर्ण उपस्थिती आवश्यक आहे.`;
    if (lang === 'hinglish') return `Good zone mein wapas aane ke liye ${needed} aur din ki poori attendance chahiye.`;
    return `Needs ${needed} more day${needed === 1 ? '' : 's'} of full attendance to climb back into the Good zone.`;
}

// Same green/red used by profile.tsx's Overall Attendance Trend graph (its
// theme has theme.green/theme.red; ParentModeView's theme doesn't, so these
// are kept as plain constants to match it exactly).
const TREND_GREEN = '#10B981';
const TREND_RED = '#EF4444';

export function ParentModeView({ isDark }: { isDark: boolean }) {
    const { accent } = useTheme();
    const theme = { ...(isDark ? DARK : LIGHT), purple: accent.purple, purpleLight: accent.purpleLight };
    // Same red as profile.tsx's own theme (ParentModeView's own LIGHT/DARK
    // above doesn't define one), just for the Flag icon color.
    const flagRed = isDark ? '#F87171' : '#EF4444';
    const { profile } = useStudent();

    const [marksheet, setMarksheet] = useState<MarksheetData | null>(null);
    const [flags, setFlags] = useState<FlagItem[]>([]);
    // Same /student/marksheet response as `marksheet` above, just kept in its
    // full (richer) shape so it can be handed straight to ReportCardSheet —
    // that way the embedded report card doesn't fire its own separate
    // /student/marksheet request (which was the cause of it visibly popping
    // in 4-5s after the rest of the page, since it was a second full
    // round-trip stacked after this screen's own load()).
    const [reportCardMarksheet, setReportCardMarksheet] = useState<ReportCardMarksheetData | null>(null);
    const [attendance, setAttendance] = useState<AttendanceData | null>(null);
    const [notes, setNotes] = useState<PTMNote[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [acking, setAcking] = useState<string | null>(null);
    const [activeSubjectPoint, setActiveSubjectPoint] = useState<number | null>(null);
    // chart-kit doesn't expose the real pixel spacing between points — it depends
    // on internal padding we don't control — so the first render captures each
    // point's actual x from renderDotContent and derives the true spacing from
    // that, instead of assuming a fixed 56px. Every label/tap-target box below
    // then sizes itself to this measured spacing so it can never bleed into its
    // neighbor, however many subjects there are.
    const [subjectPointSpacing, setSubjectPointSpacing] = useState(66);
    const subjectPointXsRef = useRef<number[]>([]);
    const [headerWidth, setHeaderWidth] = useState(0);
    const [titleWidth, setTitleWidth] = useState(0);
    const [activeAttendanceTrendPoint, setActiveAttendanceTrendPoint] = useState<number | null>(null);
    const [lang, setLangState] = useState<ParentLang>('en');
    const [langMenuOpen, setLangMenuOpen] = useState(false);

    useEffect(() => {
        AsyncStorage.getItem(PARENT_LANG_STORAGE_KEY)
            .then(saved => { if (saved) setLangState(saved as ParentLang); })
            .catch(() => {});
    }, []);

    const setLang = (l: ParentLang) => {
        setLangState(l);
        setLangMenuOpen(false);
        AsyncStorage.setItem(PARENT_LANG_STORAGE_KEY, l).catch(() => {});
    };

    // PTM note text is teacher-entered free text — not covered by the static
    // UI dictionary, so translated dynamically (see lib/dynamicTranslate.ts)
    // when the parent has selected Hindi/Marathi.
    const translatedNoteTexts = useDynamicTranslation(useMemo(() => notes.map(n => n.note), [notes]), lang);

    // `silent` skips the full-screen spinner — used by pull-to-refresh, which
    // shows its own spinner via RefreshControl instead of blanking the page.
    const load = useCallback(async (silent = false) => {
        if (silent) setRefreshing(true); else setLoading(true);
        try {
            const [mRes, aRes, nRes, fRes] = await Promise.allSettled([
                api.get('/student/marksheet'),
                api.get('/student/attendance'),
                api.get('/student/ptm-notes'),
                api.get('/student/remarks'),
            ]);
            if (mRes.status === 'fulfilled') {
                setMarksheet(mRes.value.data.data);
                setReportCardMarksheet(mRes.value.data.data);
            }
            if (aRes.status === 'fulfilled') setAttendance(aRes.value.data.data);
            if (nRes.status === 'fulfilled') setNotes(nRes.value.data.data);
            if (fRes.status === 'fulfilled') setFlags(fRes.value.data.data);
        } finally {
            if (silent) setRefreshing(false); else setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const onRefresh = useCallback(() => { load(true); }, [load]);

    const acknowledge = async (noteId: string) => {
        setAcking(noteId);
        try {
            await api.patch(`/student/ptm-notes/${noteId}/acknowledge`);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setNotes(prev => prev.map(n => n.id === noteId ? { ...n, acknowledgedAt: new Date().toISOString() } : n));
        } catch {
            Alert.alert('Could not update', 'Please try again.');
        } finally {
            setAcking(null);
        }
    };

    const onShare = async () => {
        const summary = buildSummary(marksheet, attendance, profile?.name, lang);
        const lines = [
            `${profile?.name ?? 'Student'} — Parent Summary`,
            marksheet?.combinedGrandPct != null ? `Overall: ${Math.round(marksheet.combinedGrandPct)}% (Grade ${marksheet.grade})` : null,
            attendance?.overall.pct != null ? `Attendance: ${Math.round(attendance.overall.pct)}%` : null,
            marksheet?.combinedClassRank && marksheet?.classSize ? `Rank: ${marksheet.combinedClassRank} of ${marksheet.classSize}` : null,
            summary,
        ].filter(Boolean).join('\n');

        try {
            await Share.share({ message: lines });
        } catch { /* user cancelled */ }
    };

    const summary = buildSummary(marksheet, attendance, profile?.name, lang);

    const sortedSubjects = marksheet
        ? [...marksheet.subjects].sort((a, b) => (b.combinedPct ?? b.pct ?? -1) - (a.combinedPct ?? a.pct ?? -1))
        : [];

    const att = attendance?.overall;
    const attTotal = att ? Math.max(att.present + att.absent + att.leave, 1) : 1;
    const attStatus = attendanceStatus(att?.pct ?? null, lang);
    const attSafetyNote = att ? attendanceSafetyNote(att.present, att.leave, att.total, lang) : null;

    // Full school-year (Jun–May) trend, identical logic to profile.tsx's
    // "Overall Attendance Trend": a month with no records yet comes back as
    // pct: null, and chart-kit can't render a broken/gapped line, so only
    // months up to the last one with real data are plotted — the rest stay
    // visible as plain future labels after the line.
    const attendanceTrend = useMemo(() => {
        const MONTHS = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
        return MONTHS.map(m => {
            const found = attendance?.monthly?.find(x => x.month === m);
            return { month: m, value: found?.pct ?? null as number | null };
        });
    }, [attendance]);
    const attendanceLastDataIdx = (() => {
        let last = -1;
        attendanceTrend.forEach((d, i) => { if (d.value != null) last = i; });
        return last;
    })();
    const attendanceTrendPlotted = attendanceTrend
        .slice(0, attendanceLastDataIdx + 1)
        .map(d => ({ month: d.month, value: d.value ?? 0 }));
    const attendanceTrendFuture = attendanceTrend.slice(attendanceLastDataIdx + 1);

    return (
        <ParentModeLanguageContext.Provider value={{ lang, setLang }}>
        <View style={{ flex: 1, backgroundColor: theme.bg }}>
            {/* Header — "Parent Mode" text is measured and kept exactly centered;
                the icon is positioned right against its measured left edge. A
                language-switch button sits at the header's right end; tapping it
                opens a dropdown with the 4 supported languages. */}
            <View
                style={[styles.header, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                onLayout={e => setHeaderWidth(e.nativeEvent.layout.width)}
            >
                <Text
                    style={[styles.headerTitle, { color: theme.text, fontSize: 18 }]}
                    onLayout={e => setTitleWidth(e.nativeEvent.layout.width)}
                >
                    {t('parentMode', lang)}
                </Text>
                {headerWidth > 0 && titleWidth > 0 && (
                    <Text style={[styles.headerIcon, { left: (headerWidth - titleWidth) / 2 - 28 }]}>
                        👨‍👩‍👦
                    </Text>
                )}
                <TouchableOpacity
                    onPress={() => setLangMenuOpen(o => !o)}
                    style={[styles.langBtn, { backgroundColor: theme.cardBorder }]}
                >
                    <Globe size={16} color={theme.purple} />
                </TouchableOpacity>
            </View>

            {langMenuOpen && (
                <>
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={() => setLangMenuOpen(false)}
                    />
                    <View style={[styles.langMenu, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        {PARENT_LANGUAGES.map(l => (
                            <TouchableOpacity
                                key={l.code}
                                onPress={() => setLang(l.code)}
                                style={styles.langMenuItem}
                            >
                                <Text style={{ fontSize: 13, fontWeight: l.code === lang ? '700' : '500', color: l.code === lang ? theme.purple : theme.text }}>
                                    {l.label}
                                </Text>
                                {l.code === lang && <Check size={14} color={theme.purple} />}
                            </TouchableOpacity>
                        ))}
                    </View>
                </>
            )}

            {loading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color={theme.purple} />
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={{ padding: 14, gap: 14 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.purple} colors={[theme.purple]} />
                    }
                >

                    {/* Student identity — same ID card as the Profile tab */}
                    <StudentIDCard isDark={isDark} noHorizontalPadding />

                    {/* Parent ↔ teacher chat */}
                    <ParentChatEntry isDark={isDark} />
                    <ParentFormsEntry isDark={isDark} />
                    <ParentPtmEntry isDark={isDark} />

                    {/* Rule-based summary */}
                    {summary ? (
                        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                <Sparkles size={14} color="#DA7756" />
                                <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('aiSnapshot', lang)}</Text>
                            </View>
                            <Text style={{ fontSize: 13, color: theme.text, lineHeight: 19 }}>{summary}</Text>
                        </View>
                    ) : null}

                    {/* Subject-wise scores — same bar-chart family as the Profile tab's
                        Attendance Trend graph: a fixed left %-axis gutter (a transparent
                        ghost chart clipped to just its labels) plus a scrollable line,
                        exactly like the Profile tab's Overall Attendance Trend graph. */}
                    {sortedSubjects.length > 0 && (
                        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <BarChart2 size={16} color={theme.purple} />
                                <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('subjectPerformance', lang)}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', marginTop: 12 }}>
                                {/* Fixed Y axis — a ghost chart-kit chart with an invisible line,
                                    clipped to just its label gutter, so the numbers never move. */}
                                <View style={{ width: 34, height: 210, overflow: 'hidden' }}>
                                    <LineChart
                                        data={{
                                            labels: sortedSubjects.map(s => s.name),
                                            datasets: [{ data: sortedSubjects.map(s => Math.max(0, Math.round(s.combinedPct ?? s.pct ?? 0))), color: () => 'transparent', strokeWidth: 0 }],
                                        }}
                                        width={120}
                                        height={180}
                                        yAxisSuffix="%"
                                        formatYLabel={y => n(y, lang)}
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
                                        fromZero
                                        segments={4}
                                    />
                                </View>

                                {/* Scrollable line */}
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, marginLeft: -11, height: 210 }}>
                                    <View style={{ width: Math.max(sortedSubjects.length * 66, 200) }}>
                                        <LineChart
                                            onDataPointClick={({ index }) => {
                                                setActiveSubjectPoint(prev => prev === index ? null : index);
                                            }}
                                            renderDotContent={({ x, y, index, indexData }) => {
                                                // Measure the real gap between adjacent points from their
                                                // actual reported x — chart-kit's internal padding means this
                                                // is rarely exactly 56px, and using a wrong fixed number is
                                                // exactly what let long names spill into their neighbor.
                                                subjectPointXsRef.current[index] = x;
                                                if (index === sortedSubjects.length - 1) {
                                                    const xs = subjectPointXsRef.current.slice(0, sortedSubjects.length);
                                                    if (xs.length >= 2 && xs.every(v => typeof v === 'number')) {
                                                        const gaps = xs.slice(1).map((v, i) => v - xs[i]);
                                                        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
                                                        const measured = Math.max(28, Math.round(avgGap));
                                                        if (Math.abs(measured - subjectPointSpacing) > 1) {
                                                            // Deferred: LineChart is a class component still mid-render
                                                            // when this callback fires, so calling setState here directly
                                                            // trips React's "Cannot update a component while rendering a
                                                            // different component" warning. Pushing it to a microtask lets
                                                            // LineChart finish its own render first.
                                                            setTimeout(() => setSubjectPointSpacing(measured), 0);
                                                        }
                                                    }
                                                }

                                                // Subject name, straight (no tilt) and wrapping onto 2 lines,
                                                // same style as the Profile tab's Subject Performance chart —
                                                // anchored to chart-kit's own reported `x` for this point, and
                                                // sized to the measured gap above, so it can't bleed into the
                                                // next subject's label regardless of the chart's own padding.
                                                const label = (
                                                    <View
                                                        key={`label-${index}`}
                                                        style={{
                                                            position: 'absolute',
                                                            top: 166,
                                                            left: x - subjectPointSpacing / 2,
                                                            width: subjectPointSpacing,
                                                            height: 22,
                                                            overflow: 'hidden',
                                                        }}
                                                    >
                                                        <Text
                                                            numberOfLines={2}
                                                            ellipsizeMode="tail"
                                                            style={{
                                                                textAlign: 'center',
                                                                fontSize: 9,
                                                                fontFamily: 'Poppins_400Regular',
                                                                color: theme.subText,
                                                            }}
                                                        >
                                                            {sortedSubjects[index].name}
                                                        </Text>
                                                    </View>
                                                );

                                                // A custom dot colored per the marksheet's own thresholds —
                                                // chart-kit's propsForDots only supports one fixed color for
                                                // every point, so the real dots are hidden (withDots={false})
                                                // and drawn here instead.
                                                const dotColor = scoreColor(indexData);
                                                const dot = (
                                                    <View
                                                        key={`dot-${index}`}
                                                        style={{
                                                            position: 'absolute',
                                                            top: y - 4,
                                                            left: x - 4,
                                                            width: 8,
                                                            height: 8,
                                                            borderRadius: 4,
                                                            backgroundColor: dotColor,
                                                            borderWidth: 1.5,
                                                            borderColor: theme.card,
                                                        }}
                                                    />
                                                );

                                                // The % is always shown now (not just for the best/worst
                                                // point), colored the same emerald/amber/red as the marksheet.
                                                const pctLabel = (
                                                    <Text
                                                        key={`pct-${index}`}
                                                        style={{
                                                            position: 'absolute',
                                                            top: y - 20,
                                                            left: x - subjectPointSpacing / 2,
                                                            width: subjectPointSpacing,
                                                            textAlign: 'center',
                                                            fontSize: 10,
                                                            fontWeight: '800',
                                                            color: dotColor,
                                                        }}
                                                    >
                                                        {n(indexData, lang)}%
                                                    </Text>
                                                );

                                                if (activeSubjectPoint === index) {
                                                    const chartWidth = Math.max(sortedSubjects.length * 66, 200);
                                                    const tooltipW = 70;
                                                    const clampedLeft = Math.max(2, Math.min(x - tooltipW / 2, chartWidth - tooltipW - 2));
                                                    const showBelow = y - 38 < 4;
                                                    return (
                                                        <View key={index}>
                                                            <View
                                                                style={{
                                                                    position: 'absolute',
                                                                    top: showBelow ? y + 10 : y - 38,
                                                                    left: clampedLeft,
                                                                    backgroundColor: theme.text,
                                                                    paddingHorizontal: 8,
                                                                    paddingVertical: 5,
                                                                    borderRadius: 6,
                                                                    alignItems: 'center',
                                                                    minWidth: 62,
                                                                }}
                                                            >
                                                                <Text style={{ fontSize: 9, color: theme.card, fontWeight: '600' }} numberOfLines={1}>
                                                                    {sortedSubjects[index].name}
                                                                </Text>
                                                                <Text style={{ fontSize: 11, color: theme.card, fontWeight: '800' }}>
                                                                    {n(indexData, lang)}%
                                                                </Text>
                                                            </View>
                                                            {dot}
                                                            {label}
                                                        </View>
                                                    );
                                                }

                                                return (
                                                    <View key={index}>
                                                        {dot}
                                                        {pctLabel}
                                                        {label}
                                                    </View>
                                                );
                                            }}
                                            data={{
                                                labels: sortedSubjects.map(s => s.name),
                                                datasets: [{
                                                    data: sortedSubjects.map(s => Math.max(0, Math.round(s.combinedPct ?? s.pct ?? 0))),
                                                    color: () => theme.purple,
                                                    strokeWidth: 2,
                                                }],
                                            }}
                                            width={Math.max(sortedSubjects.length * 66, 200)}
                                            height={180}
                                            yAxisSuffix="%"
                                            formatYLabel={y => n(y, lang)}
                                            chartConfig={{
                                                backgroundColor: 'transparent',
                                                backgroundGradientFrom: theme.card,
                                                backgroundGradientTo: theme.card,
                                                decimalPlaces: 0,
                                                color: () => theme.purple,
                                                fillShadowGradient: theme.purple,
                                                fillShadowGradientOpacity: 0.15,
                                                labelColor: () => theme.subText,
                                                // The library's own dots are invisible (r: '0') — a colored
                                                // custom dot is drawn per point in renderDotContent instead,
                                                // which needs withDots left true to even fire.
                                                propsForDots: { r: '0' },
                                                propsForBackgroundLines: {
                                                    stroke: theme.cardBorder,
                                                    strokeWidth: 1,
                                                    strokeDasharray: '',
                                                },
                                                propsForLabels: { fontSize: 9, fontFamily: 'Poppins_400Regular' },
                                            }}
                                            bezier
                                            style={{ borderRadius: 12, paddingRight: 16, paddingTop: 16 }}
                                            fromZero
                                            withInnerLines
                                            withHorizontalLabels={false}
                                            withVerticalLabels={false}
                                            segments={4}
                                        />

                                        {/* Explicit tap targets — chart-kit's own SVG onPress can get
                                            swallowed by the horizontal ScrollView's gesture handling,
                                            so we detect taps ourselves, one column per subject. */}
                                        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 24, flexDirection: 'row' }}>
                                            {sortedSubjects.map((s, i) => (
                                                <TouchableOpacity
                                                    key={s.id}
                                                    activeOpacity={1}
                                                    style={{ width: subjectPointSpacing, height: '100%' }}
                                                    onPress={() => setActiveSubjectPoint(prev => prev === i ? null : i)}
                                                />
                                            ))}
                                        </View>
                                    </View>
                                </ScrollView>
                            </View>

                            {/* Full report card — exact same sheet as the standalone Report
                                Card screen, embedded right below the graph inside this same
                                card (not a separate card of its own). */}
                            <View style={{ marginTop: 14, marginHorizontal: -14, borderTopWidth: 1, borderTopColor: theme.cardBorder }}>
                                <ReportCardSheet isDark={isDark} data={reportCardMarksheet} />
                            </View>
                        </View>
                    )}

                    {/* Attendance — headline eligibility badge + a parent-only "safety
                        margin" callout (how many days can still be missed, or how many
                        are needed to recover), a 4-month trend so a parent can see the
                        trajectory at a glance, then the familiar stat boxes + bar. */}
                    {att && (
                        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <CalendarDays size={16} color="#10B981" />
                                    <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('attendance', lang)}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: attStatus.color + '18', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99 }}>
                                    <Text style={{ fontSize: 11 }}>{attStatus.emoji}</Text>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: attStatus.color }}>{attStatus.label}</Text>
                                </View>
                            </View>

                            {/* Hero % + safety-margin sentence */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 }}>
                                <Text style={{ fontSize: 32, fontWeight: '800', color: attStatus.color }}>
                                    {att.pct !== null ? `${n(att.pct, lang)}%` : '—'}
                                </Text>
                                {attSafetyNote ? (
                                    <View style={{ flex: 1, backgroundColor: attStatus.color + '12', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
                                        <Text style={{ fontSize: 11.5, color: theme.text, lineHeight: 16 }}>{attSafetyNote}</Text>
                                    </View>
                                ) : null}
                            </View>

                            {/* Overall Attendance Trend — exact same graph as the Profile tab:
                                a fixed ghost Y-axis gutter + a scrollable bezier line covering
                                the full Jun–May school year, with min/max badges and a tap
                                tooltip per point. */}
                            {attendanceTrendPlotted.length > 0 && (
                                <>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text, marginTop: 16, marginBottom: 4 }}>
                                        {t('overallAttendanceTrend', lang)}
                                    </Text>
                                    <View style={{ flexDirection: 'row' }}>
                                        {/* Fixed Y axis — ghost transparent LineChart, clipped to its label gutter */}
                                        <View style={{ width: 34, height: 180, overflow: 'hidden' }}>
                                            <LineChart
                                                data={{
                                                    labels: attendanceTrendPlotted.map(d => d.month),
                                                    datasets: [{ data: attendanceTrendPlotted.map(d => d.value), color: () => 'transparent', strokeWidth: 0 }],
                                                }}
                                                width={120}
                                                height={180}
                                                yAxisSuffix="%"
                                                formatYLabel={y => n(y, lang)}
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
                                                fromZero
                                                segments={5}
                                            />
                                        </View>

                                        {/* Scrollable line */}
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, marginLeft: -11 }}>
                                            <View style={{ flexDirection: 'row' }}>
                                                <View style={{ width: attendanceTrendPlotted.length * 56 }}>
                                                    <LineChart
                                                        onDataPointClick={({ index }) => {
                                                            setActiveAttendanceTrendPoint(prev => prev === index ? null : index);
                                                        }}
                                                        renderDotContent={({ x, y, index, indexData }) => {
                                                            if (activeAttendanceTrendPoint === index) {
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
                                                                        <Text style={{ fontSize: 9, color: theme.card, fontWeight: '600' }}>
                                                                            {attendanceTrendPlotted[index].month}
                                                                        </Text>
                                                                        <Text style={{ fontSize: 11, color: theme.card, fontWeight: '800' }}>
                                                                            {n(indexData, lang)}%
                                                                        </Text>
                                                                    </View>
                                                                );
                                                            }

                                                            // Every month's % is always shown now (not just the
                                                            // best/worst month), colored by the same Good/
                                                            // Condonation/Defaulter thresholds (75/65) used
                                                            // everywhere else attendance is displayed.
                                                            const dotColor = indexData >= 75 ? TREND_GREEN : indexData >= 65 ? theme.amber : TREND_RED;
                                                            return (
                                                                <View key={index}>
                                                                    {/* Custom dot — colored to match its own % (the
                                                                        library's own dots are hidden via propsForDots
                                                                        r: '0' below), instead of every dot being a
                                                                        fixed green regardless of the month's value. */}
                                                                    <View
                                                                        style={{
                                                                            position: 'absolute',
                                                                            top: y - 4,
                                                                            left: x - 4,
                                                                            width: 8,
                                                                            height: 8,
                                                                            borderRadius: 4,
                                                                            backgroundColor: dotColor,
                                                                            borderWidth: 1.5,
                                                                            borderColor: theme.card,
                                                                        }}
                                                                    />
                                                                    <Text
                                                                        style={{
                                                                            position: 'absolute',
                                                                            top: y - 20,
                                                                            left: x - 18,
                                                                            width: 36,
                                                                            textAlign: 'center',
                                                                            fontSize: 9,
                                                                            fontWeight: '800',
                                                                            color: dotColor,
                                                                        }}
                                                                    >
                                                                        {n(indexData, lang)}%
                                                                    </Text>
                                                                </View>
                                                            );
                                                        }}
                                                        data={{
                                                            labels: attendanceTrendPlotted.map(d => d.month),
                                                            datasets: [{
                                                                data: attendanceTrendPlotted.map(d => d.value),
                                                                color: () => TREND_GREEN,
                                                                strokeWidth: 2,
                                                            }],
                                                        }}
                                                        width={attendanceTrendPlotted.length * 56}
                                                        height={180}
                                                        yAxisSuffix="%"
                                                        formatYLabel={y => n(y, lang)}
                                                        chartConfig={{
                                                            backgroundColor: 'transparent',
                                                            backgroundGradientFrom: theme.card,
                                                            backgroundGradientTo: theme.card,
                                                            decimalPlaces: 0,
                                                            color: () => TREND_GREEN,
                                                            fillShadowGradient: TREND_GREEN,
                                                            fillShadowGradientOpacity: 0.15,
                                                            labelColor: () => theme.subText,
                                                            // The library's own dots are invisible (r: '0') — a
                                                            // custom dot colored per its own % is drawn in
                                                            // renderDotContent instead, which needs withDots left
                                                            // at its true default to even fire.
                                                            propsForDots: { r: '0' },
                                                            propsForBackgroundLines: {
                                                                stroke: theme.cardBorder,
                                                                strokeWidth: 1,
                                                                strokeDasharray: '',
                                                            },
                                                            propsForLabels: { fontSize: 9, fontFamily: 'Poppins_400Regular' },
                                                        }}
                                                        bezier
                                                        style={{ borderRadius: 12, paddingRight: 16, paddingTop: 16 }}
                                                        fromZero
                                                        withInnerLines
                                                        withHorizontalLabels={false}
                                                        segments={5}
                                                    />

                                                    {/* Explicit tap targets — one column per month */}
                                                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' }}>
                                                        {attendanceTrendPlotted.map((d, i) => (
                                                            <TouchableOpacity
                                                                key={i}
                                                                activeOpacity={1}
                                                                style={{ width: 56, height: '100%' }}
                                                                onPress={() => setActiveAttendanceTrendPoint(prev => prev === i ? null : i)}
                                                            />
                                                        ))}
                                                    </View>
                                                </View>

                                                {/* Remaining months with no attendance marked yet — kept
                                                    visible in the same Jun–May sequence, without a plotted
                                                    line since chart-kit can't render a partial line. */}
                                                {attendanceTrendFuture.length > 0 && (
                                                    <View style={{ width: attendanceTrendFuture.length * 56, flexDirection: 'row', height: 180, alignItems: 'flex-end', paddingBottom: 4 }}>
                                                        {attendanceTrendFuture.map(d => (
                                                            <View key={d.month} style={{ width: 56, alignItems: 'center' }}>
                                                                <Text style={{ fontSize: 9, color: theme.subText, opacity: 0.5 }}>{d.month}</Text>
                                                            </View>
                                                        ))}
                                                    </View>
                                                )}
                                            </View>
                                        </ScrollView>
                                    </View>

                                    {/* Legend — same Good/Condonation/Defaulter thresholds as the web app */}
                                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                                        {[
                                            { label: t('legendGood', lang), color: '#10B981' },
                                            { label: t('legendCondonation', lang), color: theme.amber },
                                            { label: t('legendDefaulter', lang), color: '#EF4444' },
                                        ].map(l => (
                                            <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: l.color }} />
                                                <Text style={{ fontSize: 9, color: theme.subText }}>{l.label}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </>
                            )}

                            {/* Present / Absent / Late breakdown — the "L" status means Late
                                (tardy arrival, still counted toward the % same as Present),
                                not Leave. The `leave` field name is a holdover from earlier
                                naming, but "Late" is what teachers mark it as on the web app
                                and what the backend's own comments call it, so this label is
                                the one that must match, not the variable name. */}
                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                                <View style={[styles.attBox, { backgroundColor: '#22C55E15' }]}>
                                    <CalendarCheck size={16} color="#22C55E" />
                                    <Text style={[styles.attValue, { color: '#22C55E' }]}>{n(att.present, lang)}</Text>
                                    <Text style={[styles.attLabel, { color: theme.subText }]}>{t('present', lang)}</Text>
                                </View>
                                <View style={[styles.attBox, { backgroundColor: '#EF444415' }]}>
                                    <CalendarX size={16} color="#EF4444" />
                                    <Text style={[styles.attValue, { color: '#EF4444' }]}>{n(att.absent, lang)}</Text>
                                    <Text style={[styles.attLabel, { color: theme.subText }]}>{t('absent', lang)}</Text>
                                </View>
                                <View style={[styles.attBox, { backgroundColor: theme.amber + '15' }]}>
                                    <Clock3 size={16} color={theme.amber} />
                                    <Text style={[styles.attValue, { color: theme.amber }]}>{n(att.leave, lang)}</Text>
                                    <Text style={[styles.attLabel, { color: theme.subText }]}>{t('late', lang)}</Text>
                                </View>
                            </View>
                            <View style={[styles.stackedBar, { backgroundColor: isDark ? '#241a3f' : '#F1EDFB' }]}>
                                <View style={{ width: `${(att.present / attTotal) * 100}%`, backgroundColor: '#22C55E' }} />
                                <View style={{ width: `${(att.absent / attTotal) * 100}%`, backgroundColor: '#EF4444' }} />
                                <View style={{ width: `${(att.leave / attTotal) * 100}%`, backgroundColor: theme.amber }} />
                            </View>

                            {/* Full attendance sheet — exact same register-style month x date
                                grid as the Attendance Details screen's "Attendance Sheet" card,
                                embedded right here inside this same Attendance card. */}
                            <View style={{ marginTop: 14, marginHorizontal: -14, borderTopWidth: 1, borderTopColor: theme.cardBorder }}>
                                <AttendanceSheet isDark={isDark} data={attendance} />
                            </View>
                        </View>
                    )}

                    {/* Remarks: Flags & Warnings — the full "View All" screen's content
                        (yellow/red tabs, full flag cards, appeal note) embedded directly
                        here, not just a summary behind a "View All" button. */}
                    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <Flag size={16} color={flagRed} />
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('remarksFlagsWarnings', lang)}</Text>
                        </View>
                        <FlagsSheet isDark={isDark} data={flags} showAppealNote={false} />
                    </View>

                    {/* PTM meeting notes — timeline style */}
                    {notes.length > 0 && (
                        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <ClipboardList size={16} color={theme.purple} />
                                <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('meetingNotes', lang)}</Text>
                            </View>
                            <View style={{ marginTop: 12 }}>
                                {notes.map((n, idx) => (
                                    <View key={n.id} style={{ flexDirection: 'row' }}>
                                        <View style={{ width: 22, alignItems: 'center' }}>
                                            <View style={[styles.timelineDot, {
                                                backgroundColor: n.acknowledgedAt ? '#22C55E' : (isDark ? '#2DD4BF' : '#0D9488'),
                                            }]} />
                                            {idx < notes.length - 1 && (
                                                <View style={[styles.timelineLine, { backgroundColor: theme.cardBorder }]} />
                                            )}
                                        </View>
                                        <View style={[styles.noteBubble, {
                                            backgroundColor: theme.purple + (isDark ? '26' : '14'),
                                            borderColor: theme.cardBorder,
                                            marginBottom: idx < notes.length - 1 ? 12 : 0,
                                        }]}>
                                            <Text style={{ fontSize: 11, color: theme.muted, marginBottom: 3, fontWeight: '600' }}>
                                                {n.createdByName} · {new Date(n.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                            </Text>
                                            <Text style={{ fontSize: 13, color: theme.text, lineHeight: 18 }}>{translatedNoteTexts[idx] ?? n.note}</Text>
                                            <View style={{ marginTop: 8, alignItems: 'flex-end' }}>
                                                {n.acknowledgedAt ? (
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                        <CheckCircle2 size={14} color="#22C55E" />
                                                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#22C55E' }}>{t('acknowledged', lang)}</Text>
                                                    </View>
                                                ) : (
                                                    <TouchableOpacity
                                                        onPress={() => acknowledge(n.id)}
                                                        disabled={acking === n.id}
                                                        activeOpacity={0.85}
                                                        style={[styles.ackBtn, { backgroundColor: '#16A34A', flexDirection: 'row', alignItems: 'center', gap: 5 }]}
                                                    >
                                                        {acking !== n.id && <Check size={12} color="#fff" />}
                                                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>
                                                            {acking === n.id ? '...' : t('discussedAcknowledge', lang)}
                                                        </Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* Share / export */}
                    <TouchableOpacity onPress={onShare} style={[styles.shareBtn, { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.cardBorder }]}>
                        <Share2 size={16} color={theme.purple} />
                        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{t('shareSummary', lang)}</Text>
                    </TouchableOpacity>
                    {marksheet?.pdfUrl ? (
                        <TouchableOpacity onPress={() => Linking.openURL(marksheet.pdfUrl!)} style={{ alignItems: 'center', paddingVertical: 4 }}>
                            <Text style={{ fontSize: 12, color: theme.purple, fontWeight: '600' }}>{t('viewFullReportCardPdf', lang)}</Text>
                        </TouchableOpacity>
                    ) : null}

                </ScrollView>
            )}
        </View>
        </ParentModeLanguageContext.Provider>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        position: 'relative',
    },
    headerIcon: { position: 'absolute', fontSize: 20 },
    headerTitle: { fontSize: 15, fontWeight: '700' },
    langBtn: {
        position: 'absolute', right: 14, width: 30, height: 30, borderRadius: 15,
        alignItems: 'center', justifyContent: 'center',
    },
    langMenu: {
        position: 'absolute', top: 54, right: 14, zIndex: 50, elevation: 8,
        borderRadius: 12, borderWidth: 1, paddingVertical: 4, minWidth: 140,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8,
    },
    langMenuItem: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 14, paddingVertical: 10,
    },
    // Raised look (matches StudentIDCard's own shadow) — these cards used to
    // sit flat against the screen background with no shadow/elevation at all.
    card: {
        borderRadius: 16, borderWidth: 1, padding: 14,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.14, shadowRadius: 12, elevation: 5,
    },
    sectionTitle: { fontSize: 13, fontWeight: '700' },
    attBox: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', gap: 3 },
    attValue: { fontSize: 15, fontWeight: '800' },
    attLabel: { fontSize: 10, fontWeight: '600' },
    stackedBar: { flexDirection: 'row', height: 8, borderRadius: 99, overflow: 'hidden', marginTop: 12 },
    timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
    timelineLine: { width: 2, flex: 1, marginTop: 4 },
    noteBubble: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12 },
    ackBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99 },
    shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 13, marginTop: 4 },
});
