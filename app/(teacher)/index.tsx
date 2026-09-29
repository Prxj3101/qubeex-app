import { AnnouncementStrip } from '@/components/AnnouncementStrip';
import { PayslipReadyStrip } from '@/components/teacher/PayslipReadyStrip';
import { TeacherHeader } from '@/components/teacher/TeacherHeader';
import { TeacherThoughtOfTheDay } from '@/components/teacher/TeacherThoughtOfTheDay';
import { TeacherNotepad, TeacherNotepadHandle } from '@/components/teacher/TeacherNotepad';
import { TeacherAiTokenUsage } from '@/components/teacher/TeacherAiTokenUsage';
import { TeacherAttendanceChart } from '@/components/teacher/TeacherAttendanceChart';
import { TeacherTopBar } from '@/components/teacher/TeacherTopBar';
import { useTeacher } from '@/context/TeacherContext';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import { useFocusEffect, useNavigation } from 'expo-router';
import Constants from 'expo-constants';
import { AlertTriangle, BookOpen, ClipboardList, LayoutGrid, TrendingUp } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

const LIGHT = { bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE', text: '#0F172A', subText: '#64748B', muted: '#94A3B8' };
const DARK = { bg: '#000000', card: '#141414', cardBorder: '#2A2A2A', text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B' };

interface OverviewData {
    teacher: { name: string; prefix: string | null; institutionName: string; classTeacherDivisionName: string | null };
    stats: { classesAssigned: number; subjectsTeaching: number; testsConducted: number; avgAttendancePct: number | null };
    attendanceTrend: { month: string; attendance: number; students: number }[];
    shortAttendance: { name: string; rollNo: string; pct: number; avatarUrl: string | null }[];
    latestPost: { title: string; type: string } | null;
}

function Avatar({ name, avatarUrl, size, color }: { name: string; avatarUrl: string | null; size: number; color: string }) {
    if (avatarUrl) {
        return <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
    }
    return (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: size * 0.4, fontFamily: 'Poppins_700Bold', color: 'white' }}>{name[0]?.toUpperCase() ?? '?'}</Text>
        </View>
    );
}

export default function TeacherHome() {
    const { isDark, accent } = useTheme();
    const theme = { ...(isDark ? DARK : LIGHT), purple: accent.purple };
    const { fetchProfile, profile } = useTeacher();

    const [overview, setOverview] = useState<OverviewData | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const notepadRef = useRef<TeacherNotepadHandle>(null);
    const scrollRef = useRef<ScrollView>(null);
    const navigation = useNavigation<any>();

    const fetchOverview = useCallback(async () => {
        try {
            const res = await api.get('/teacher/overview');
            setOverview(res.data.data);
        } catch { /* silent */ }
    }, []);

    useFocusEffect(
        useCallback(() => {
            fetchProfile();
            fetchOverview();
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([fetchProfile(), fetchOverview(), notepadRef.current?.refresh()]);
        setRefreshing(false);
    }, [fetchProfile, fetchOverview]);

    // Tapping the active Home tab's own icon again scrolls back to the top
    // and refreshes the page — same as the student app's home tab, plus a refresh.
    useEffect(() => {
        const unsubscribe = navigation.addListener('tabPress', () => {
            if (navigation.isFocused()) {
                scrollRef.current?.scrollTo({ y: 0, animated: true });
                onRefresh();
            }
        });
        return unsubscribe;
    }, [navigation, onRefresh]);

    const stats = overview ? [
        { label: 'Classes Assigned', value: String(overview.stats.classesAssigned), icon: LayoutGrid, tint: theme.purple },
        { label: 'Subjects Teaching', value: String(overview.stats.subjectsTeaching), icon: BookOpen, tint: '#D97706' },
        { label: 'Tests Conducted', value: String(overview.stats.testsConducted), icon: ClipboardList, tint: '#059669' },
        { label: 'Avg Attendance', value: overview.stats.avgAttendancePct !== null ? `${overview.stats.avgAttendancePct}%` : '—', icon: TrendingUp, tint: '#0284C7' },
    ] : [];

    return (
        <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: Constants.statusBarHeight }]}>
            <TeacherTopBar />
            <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.muted} />}
            >
                <TeacherHeader
                    name={profile?.name ?? overview?.teacher.name ?? ''}
                    prefix={profile?.prefix ?? overview?.teacher.prefix ?? null}
                    dob={profile?.dob ?? null}
                    institutionName={overview?.teacher.institutionName ?? ''}
                    classTeacherDivisionName={overview?.teacher.classTeacherDivisionName ?? null}
                    loading={!overview}
                />
                <AnnouncementStrip title={overview?.latestPost?.title ?? null} />
                <PayslipReadyStrip />

                <View style={styles.body}>

                    {/* Stat cards */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statGrid}>
                        {stats.map((s) => {
                            const Icon = s.icon;
                            return (
                                <View key={s.label} style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                                    <View style={[styles.statIconWrap, { backgroundColor: s.tint + '1A' }]}>
                                        <Icon size={16} color={s.tint} />
                                    </View>
                                    <View>
                                        <Text style={[styles.statValue, { color: theme.text }]}>{s.value}</Text>
                                        <Text style={[styles.statLabel, { color: theme.subText }]} numberOfLines={1}>{s.label}</Text>
                                    </View>
                                </View>
                            );
                        })}
                    </ScrollView>

                    {/* Thought of the Day */}
                    <TeacherThoughtOfTheDay />

                    {/* To-Do List & Notepad */}
                    <TeacherNotepad ref={notepadRef} />

                    {/* AI Token Usage */}
                    <TeacherAiTokenUsage />

                    {/* Class Attendance Trend */}
                    <TeacherAttendanceChart data={overview?.attendanceTrend ?? []} />

                    {/* Short attendance */}
                    <View style={[styles.section, styles.sectionFixedHeight, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        <View style={styles.sectionHeader}>
                            <View style={styles.sectionTitleRow}>
                                <AlertTriangle size={15} color={theme.subText} />
                                <Text style={[styles.sectionTitle, { color: theme.text }]}>Short Attendance</Text>
                            </View>
                            <View style={styles.countBadge}>
                                <Text style={styles.countBadgeText}>{(overview?.shortAttendance ?? []).length}</Text>
                            </View>
                        </View>
                        <Text style={[styles.sectionSub, { color: theme.subText }]}>Students below 75%</Text>

                        {(overview?.shortAttendance ?? []).length === 0 && overview !== null && (
                            <Text style={[styles.emptyText, { color: theme.muted }]}>No students below 75% attendance 🎉</Text>
                        )}

                        <ScrollView
                            style={{ flex: 1, marginTop: 10 }}
                            contentContainerStyle={{ gap: 8 }}
                            showsVerticalScrollIndicator={false}
                            nestedScrollEnabled
                        >
                            {(overview?.shortAttendance ?? []).map((s) => (
                                <View key={s.rollNo} style={[styles.attendanceRow, { borderColor: theme.cardBorder }]}>
                                    <Avatar name={s.name} avatarUrl={s.avatarUrl} size={30} color={s.pct >= 65 ? '#D97706' : '#DC2626'} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.attendanceName, { color: theme.text }]} numberOfLines={1}>{s.name}</Text>
                                        <Text style={[styles.attendanceRoll, { color: theme.muted }]}>Roll {s.rollNo}</Text>
                                    </View>
                                    <Text style={[styles.attendancePct, { color: s.pct >= 65 ? '#D97706' : '#DC2626' }]}>{s.pct}%</Text>
                                </View>
                            ))}
                        </ScrollView>
                    </View>

                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    body: { padding: 14, gap: 14 },
    statGrid: { flexDirection: 'row', gap: 10, paddingHorizontal: 2 },
    statCard: { width: 172, borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
    statIconWrap: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    statValue: { fontSize: 18, fontFamily: 'Poppins_700Bold', lineHeight: 20 },
    statLabel: { fontSize: 11.5, fontFamily: 'Poppins_400Regular' },
    section: { borderRadius: 16, borderWidth: 1, padding: 14 },
    sectionFixedHeight: { height: 300 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sectionTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
    sectionSub: { fontSize: 10.5, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    countBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
    countBadgeText: { fontSize: 10, fontFamily: 'Poppins_700Bold', color: '#DC2626' },
    emptyText: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 10, textAlign: 'center' },
    attendanceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12, borderWidth: 1 },
    attendanceName: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
    attendanceRoll: { fontSize: 10, fontFamily: 'Poppins_400Regular' },
    attendancePct: { fontSize: 13, fontFamily: 'Poppins_700Bold' },
});
