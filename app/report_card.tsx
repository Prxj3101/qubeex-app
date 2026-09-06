import { ReportCardSheet } from '@/components/ReportCardSheet';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/context/ThemeContext';
import { useStudent } from '@/context/StudentContext';
import api from '@/lib/api';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image as RNImage,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
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
    bg: '#000000', card: '#141414', cardBorder: '#2A2A2A',
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

interface GradeScaleEntry { grade: string; minPct: number }

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
interface MarksheetData {
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

export default function ReportCard() {
    const { isDark, accent } = useTheme();
    const theme = { ...(isDark ? DARK : LIGHT), purple: accent.purple, purpleLight: accent.purpleLight };
    const { photo } = useStudent();
    const [data, setData] = useState<MarksheetData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/student/marksheet')
            .then(r => setData(r.data.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

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
    // Class Rank / Overall on the name card show the combined (offline +
    // online pooled) figures — matching StudentProfileView's fixed "Overall"
    // tile elsewhere, not the offline-only numbers.
    const rank = data.combinedClassRank ?? null;
    // Computed client-side from grandTotal + onlineGrandTotal (both already
    // confirmed populated — they drive the offline/online tab totals) rather
    // than trusting data.combinedGrandPct directly, since that field can be
    // missing on older/cached API responses.
    const combinedMax = data.grandTotal.max + data.onlineGrandTotal.max;
    const combinedScored = data.grandTotal.scored + data.onlineGrandTotal.scored;
    const overallPct = combinedMax > 0 ? Math.round((combinedScored / combinedMax) * 100) : null;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
            <ScreenHeader title="Report Card" showBack />
            <ScrollView showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never" contentContainerStyle={{ padding: 14, gap: 14 }}>

                {/* ── Name card ── */}
                <View style={[styles.nameCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: photo ? 'transparent' : getAvatarColor(studentName), overflow: 'hidden' }}>
                        {photo
                            ? <RNImage source={{ uri: photo }} style={{ width: 56, height: 56, borderRadius: 28 }} />
                            : <Text style={{ fontSize: fs(16) + iosExtra, fontFamily: 'Poppins_700Bold', color: 'white' }}>{getInitials(studentName)}</Text>}
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
                            <Text style={{ fontSize: fs(13) + iosExtra, fontFamily: 'Poppins_800ExtraBold', color: scoreColor(overallPct, theme) }}>{overallPct !== null ? `${overallPct}%` : '—'}</Text>
                            <Text style={{ fontSize: fs(8) + iosExtra, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Overall</Text>
                        </View>
                    </View>
                </View>

                {/* ── Report Card ── */}
                <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                    <ReportCardSheet isDark={isDark} />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    nameCard: { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'column', alignItems: 'center', gap: 8 },
    sectionCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
});
