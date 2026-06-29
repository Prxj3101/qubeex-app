import { AnnouncementStrip } from '@/components/AnnouncementStrip';
import { Header } from '@/components/Header';
import { QuickStats } from '@/components/QuickStats';
import { ThoughtOfTheDay } from '@/components/ThoughtOfTheDay';
import { TopBar } from '@/components/TopBar';
import { useStudent } from '@/context/StudentContext';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import { Trophy } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LIGHT = { bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE', text: '#0F172A', subText: '#64748B', muted: '#94A3B8' };
const DARK  = { bg: '#0F0A1E', card: '#1A1030', cardBorder: '#2D1F50', text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B' };

interface OverviewData {
    student: { name: string; rollNo: string; divisionName: string; standardName: string };
    attendance: { pct: number | null; present: number; total: number };
    marks: { pct: number | null; classRank: number | null; totalStudents: number };
    pendingTasks: number;
    nextEvent: { type: string; label: string; date: string; daysAway: number } | null;
    latestPost: { title: string; type: string } | null;
    leaderboard: { rank: number; name: string; rollNo: string; pct: number; isMe: boolean }[];
}

function ShinyMedal({ emoji }: { emoji: string }) {
    const shineAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(shineAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
                Animated.timing(shineAnim, { toValue: 0.4, duration: 400, useNativeDriver: true }),
                Animated.timing(shineAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
                Animated.delay(1500),
            ])
        ).start();
    }, []);
    const scale = shineAnim.interpolate({ inputRange: [0.4, 1], outputRange: [0.9, 1.2] });
    return <Animated.Text style={{ fontSize: 28, opacity: shineAnim, transform: [{ scale }] }}>{emoji}</Animated.Text>;
}

function Avatar({ name, color, bg, size }: { name: string; color: string; bg: string; size: number }) {
    return (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, borderWidth: size > 40 ? 3 : 2, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: size * 0.35, fontWeight: '700', color }}>{name[0]?.toUpperCase() ?? '?'}</Text>
        </View>
    );
}

const RANK_COLORS = [
    { color: '#F59E0B', bg: { light: '#FEF3C7', dark: '#2D2010' } },
    { color: '#94A3B8', bg: { light: '#F1F5F9', dark: '#1E2530' } },
    { color: '#CD7C2F', bg: { light: '#FEF3C7', dark: '#2D1F10' } },
    { color: '#7C3AED', bg: { light: '#EDE9FE', dark: '#2D1F50' } },
    { color: '#0891B2', bg: { light: '#CFFAFE', dark: '#0D2B30' } },
];
const PODIUM_MEDALS = ['🥇', '🥈', '🥉'];
const PODIUM_HEIGHTS = [70, 50, 40];
const PODIUM_SIZES = [54, 44, 44];
const PODIUM_BGCOLORS = ['#F59E0B', '#94A3B8', '#CD7C2F'];

export default function Home() {
    const [isParentView, setIsParentView] = useState(false);
    const { isDark } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const { fetchProfile } = useStudent();

    const [overview, setOverview] = useState<OverviewData | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const fetchOverview = useCallback(async () => {
        try {
            const res = await api.get('/student/overview');
            setOverview(res.data.data);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchProfile();
        fetchOverview();
    }, []);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([fetchProfile(), fetchOverview()]);
        setRefreshing(false);
    }, [fetchProfile, fetchOverview]);

    const lb = overview?.leaderboard ?? [];
    // Arrange podium: 2nd | 1st | 3rd
    const podiumOrder = [lb[1], lb[0], lb[2]].filter(Boolean);
    const podiumMedals  = ['🥈', '🥇', '🥉'];
    const podiumHeights = [50, 70, 40];
    const podiumSizes   = [44, 54, 44];
    const podiumColors  = ['#94A3B8', '#F59E0B', '#CD7C2F'];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
            <TopBar isParentView={isParentView} onToggle={() => setIsParentView(!isParentView)} />
            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.muted} />}
            >
                <Header showPurple />
                <AnnouncementStrip title={overview?.latestPost?.title ?? null} />
                <View style={styles.body}>

                    <QuickStats
                        attendancePct={overview?.attendance.pct ?? null}
                        marksPct={overview?.marks.pct ?? null}
                        pendingTasks={overview?.pendingTasks ?? 0}
                        nextEvent={overview?.nextEvent ?? null}
                    />
                    <ThoughtOfTheDay />

                    {lb.length > 0 && (
                        <>
                            {/* Leaderboard header */}
                            <View style={styles.lbHeader}>
                                <View style={styles.lbTitleRow}>
                                    <Trophy size={18} color="#F59E0B" strokeWidth={2} />
                                    <Text style={[styles.lbTitle, { color: theme.text }]}>Class Leaderboard</Text>
                                </View>
                                <Text style={[styles.lbSub, { color: theme.muted }]}>
                                    {overview?.student.divisionName
                                        ? (() => { const p = overview.student.divisionName.split('-'); return p.length > 1 ? `Division ${p.slice(1).join('-')}` : overview.student.divisionName; })()
                                        : 'Top 5'}
                                </Text>
                            </View>

                            {/* Podium — Top 3 */}
                            {lb.length >= 3 && (
                                <View style={styles.podium}>
                                    {podiumOrder.map((student, i) => {
                                        if (!student) return null;
                                        const ci = student.rank - 1;
                                        const rc = RANK_COLORS[ci] ?? RANK_COLORS[3];
                                        return (
                                            <View key={student.rank} style={styles.podiumItem}>
                                                <Avatar
                                                    name={student.name}
                                                    color={podiumColors[i]}
                                                    bg={isDark ? '#1A1030' : '#F8F4FF'}
                                                    size={podiumSizes[i]}
                                                />
                                                <Text style={[styles.podiumName, { color: theme.text }]} numberOfLines={1}>
                                                    {student.name.split(' ')[0]}
                                                </Text>
                                                {student.isMe && (
                                                    <Text style={{ fontSize: 9, color: '#7C3AED', fontWeight: '700' }}>YOU</Text>
                                                )}
                                                <Text style={[styles.podiumPct, { color: podiumColors[i] }]}>{student.pct}%</Text>
                                                <View style={[styles.podiumBlock, { height: podiumHeights[i], backgroundColor: podiumColors[i] }]}>
                                                    <ShinyMedal emoji={podiumMedals[i]} />
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            )}

                            {/* 4th & 5th */}
                            {lb.length > 3 && (
                                <View style={styles.restList}>
                                    {lb.slice(3).map((student) => {
                                        const rc = RANK_COLORS[student.rank - 1] ?? RANK_COLORS[3];
                                        const bgColor = isDark ? rc.bg.dark : rc.bg.light;
                                        const rankEmoji = student.rank === 4 ? '4️⃣' : '5️⃣';
                                        return (
                                            <View key={student.rank} style={[styles.restCard, { backgroundColor: bgColor, borderColor: rc.color, borderWidth: student.isMe ? 2 : 1.5 }]}>
                                                <Text style={styles.restRankEmoji}>{rankEmoji}</Text>
                                                <Avatar name={student.name} color={rc.color} bg={bgColor} size={36} />
                                                <Text style={[styles.restName, { color: theme.text }]} numberOfLines={1}>
                                                    {student.name} {student.isMe ? '(You)' : ''}
                                                </Text>
                                                <Text style={[styles.restPct, { color: rc.color }]}>{student.pct}%</Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                        </>
                    )}

                    {lb.length === 0 && overview !== null && (
                        <View style={[styles.lbEmpty, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                            <Text style={{ fontSize: 28 }}>🏆</Text>
                            <Text style={[styles.lbEmptyText, { color: theme.muted }]}>Leaderboard available{'\n'}once marks are published</Text>
                        </View>
                    )}

                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    body: { padding: 14, gap: 14 },
    lbHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
    lbTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    lbTitle: { fontSize: 15, fontWeight: '700' },
    lbSub: { fontSize: 11 },
    podium: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 8, marginBottom: 8 },
    podiumItem: { alignItems: 'center', gap: 4 },
    podiumBlock: { width: 80, borderTopLeftRadius: 8, borderTopRightRadius: 8, alignItems: 'center', justifyContent: 'center' },
    podiumName: { fontSize: 11, fontWeight: '600', textAlign: 'center', maxWidth: 80 },
    podiumPct: { fontSize: 11, fontWeight: '700' },
    restList: { gap: 8 },
    restCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14 },
    restRankEmoji: { fontSize: 18 },
    restName: { flex: 1, fontSize: 13, fontWeight: '600' },
    restPct: { fontSize: 13, fontWeight: '700' },
    lbEmpty: { borderRadius: 16, borderWidth: 1, padding: 24, alignItems: 'center', gap: 8 },
    lbEmptyText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
