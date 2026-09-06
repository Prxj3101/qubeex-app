import { AnnouncementStrip } from '@/components/AnnouncementStrip';
import { BirthdayBanner } from '@/components/BirthdayBanner';
import { Header } from '@/components/Header';
import { ParentModeView } from '@/components/ParentModeView';
import { QuickStats } from '@/components/QuickStats';
import { ThoughtOfTheDay } from '@/components/ThoughtOfTheDay';
import { TopBar } from '@/components/TopBar';
import { TabEntryCover, useTabEntryCover } from '@/components/TabEntryCover';
import { useStudent } from '@/context/StudentContext';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import { useFocusEffect, useNavigation } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';

const LIGHT = { bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE', text: '#0F172A', subText: '#64748B', muted: '#94A3B8', purple: '#7C3AED' };
const DARK  = { bg: '#000000', card: '#141414', cardBorder: '#2A2A2A', text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B', purple: '#A78BFA' };

interface OverviewData {
    student: { name: string; rollNo: string; divisionName: string; standardName: string };
    attendance: { pct: number | null; present: number; total: number };
    marks: { pct: number | null; classRank: number | null; totalStudents: number };
    pendingTasks: number;
    nextEvent: { type: string; label: string; date: string; daysAway: number } | null;
    latestPost: { title: string; type: string } | null;
    leaderboard: { rank: number; name: string; rollNo: string; pct: number; isMe: boolean; avatarUrl: string | null }[];
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

function Avatar({ name, avatarUrl, color, bg, size }: { name: string; avatarUrl?: string | null; color: string; bg: string; size: number }) {
    const borderWidth = size > 40 ? 3 : 2;
    if (avatarUrl) {
        return (
            <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', borderWidth, borderColor: color }}>
                <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </View>
        );
    }
    return (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, borderWidth, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: size * 0.35, fontWeight: '700', color }}>{name[0]?.toUpperCase() ?? '?'}</Text>
        </View>
    );
}


export default function Home() {
    const [isParentView, setIsParentView] = useState(false);

    // Fire-and-forget: logs one event whenever Parent Mode is switched ON, so
    // admin insights can flag families who haven't checked in recently. Never
    // blocks or shows an error to the parent — a missed log just means this
    // one open doesn't count toward engagement, not a broken feature.
    const toggleParentView = useCallback(() => {
        setIsParentView(prev => {
            const next = !prev;
            if (next) {
                api.post('/student/parent-mode/log').catch(() => {});
            }
            return next;
        });
    }, []);
    const scrollRef = useRef<ScrollView>(null);
    const navigation = useNavigation<any>();
    const { isDark, accent } = useTheme();
    const theme = { ...(isDark ? DARK : LIGHT), purple: accent.purple, purpleLight: accent.purpleLight };
    const showEntryCover = useTabEntryCover();
    const { fetchProfile, profile } = useStudent();

    const [overview, setOverview] = useState<OverviewData | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [focusKey, setFocusKey] = useState(0);

    const fetchOverview = useCallback(async () => {
        try {
            const res = await api.get('/student/overview');
            setOverview(res.data.data);
        } catch { /* silent */ }
    }, []);

    // Re-fetch fresh data and force Header/BirthdayBanner to remount every time
    // this tab regains focus — tab screens stay mounted in the background, so a
    // plain useEffect(() => {}, []) only runs once and never refires on revisit.
    useFocusEffect(
        // eslint-disable-next-line react-hooks/exhaustive-deps
        useCallback(() => {
            setFocusKey(k => k + 1);
            fetchProfile();
            fetchOverview();
        }, [])
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([fetchProfile(), fetchOverview()]);
        setRefreshing(false);
    }, [fetchProfile, fetchOverview]);

    // Tapping the active tab's own icon again (standard behavior across
    // Instagram/YouTube/etc.) scrolls back to the top instead of doing nothing.
    useEffect(() => {
        const unsubscribe = navigation.addListener('tabPress', () => {
            if (navigation.isFocused()) {
                scrollRef.current?.scrollTo({ y: 0, animated: true });
            }
        });
        return unsubscribe;
    }, [navigation]);

    const lb = overview?.leaderboard ?? [];
    // Arrange podium: 2nd | 1st | 3rd — same layout/colors as Class > Leaderboard
    const podiumOrder = [lb[1], lb[0], lb[2]].filter(Boolean);
    const podiumMedals  = ['🥈', '🥇', '🥉'];
    const podiumHeights = [64, 96, 48];
    const podiumSizes   = [36, 44, 36];
    const podiumColors  = ['#C0C0C0', '#F59E0B', '#CD7F32'];

    if (isParentView) {
        return (
            <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: Constants.statusBarHeight }]}>
                <TopBar isParentView={isParentView} onToggle={toggleParentView} />
                <ParentModeView isDark={isDark} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: Constants.statusBarHeight }]}>
            <TopBar isParentView={isParentView} onToggle={toggleParentView} />
            <View style={{ flex: 1, position: 'relative' }}>
            <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.muted} />}
            >
                <Header key={focusKey} showPurple />
                <AnnouncementStrip title={overview?.latestPost?.title ?? null} />
                <View style={styles.body}>

                    {profile?.dob && (
                        <BirthdayBanner key={focusKey} name={profile.name || 'Student'} dob={profile.dob} />
                    )}

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
                                        ? (() => { const p = overview.student.divisionName.split('-'); const label = p.length > 1 ? `Division ${p.slice(1).join('-')}` : overview.student.divisionName; return `${label} · Offline`; })()
                                        : 'Top 5'}
                                </Text>
                            </View>

                            {/* Podium — Top 3 (same styling as Class > Leaderboard) */}
                            {lb.length >= 3 && (
                                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 12, marginBottom: 14 }}>
                                    {podiumOrder.map((student, i) => {
                                        if (!student) return null;
                                        return (
                                            <View key={student.rank} style={{ alignItems: 'center', gap: 4 }}>
                                                <Avatar
                                                    name={student.name}
                                                    avatarUrl={student.avatarUrl}
                                                    color={podiumColors[i]}
                                                    bg={isDark ? '#141414' : '#F8F4FF'}
                                                    size={podiumSizes[i]}
                                                />
                                                <View style={{ width: 66 }}>
                                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: theme.text, textAlign: 'center', lineHeight: 12 }} numberOfLines={1}>
                                                        {student.name.split(' ')[0]}
                                                    </Text>
                                                    <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: theme.text, textAlign: 'center', lineHeight: 11 }} numberOfLines={1}>
                                                        {student.name.split(' ').slice(1).join(' ')}
                                                    </Text>
                                                </View>
                                                {student.isMe && (
                                                    <View style={{ backgroundColor: theme.purple + '20', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 99 }}>
                                                        <Text style={{ fontSize: 8, fontFamily: 'Poppins_700Bold', color: theme.purple }}>You</Text>
                                                    </View>
                                                )}
                                                <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: podiumColors[i] }}>{student.pct}%</Text>
                                                <View style={{ height: podiumHeights[i], width: 52, backgroundColor: podiumColors[i], borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                                                    <ShinyMedal emoji={podiumMedals[i]} />
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            )}

                            {/* 4th & 5th — flat list rows, same as Class > Leaderboard */}
                            {lb.length > 3 && (
                                <View style={{ gap: 8 }}>
                                    {lb.slice(3).map((student, i) => (
                                        <View key={student.rank} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: student.isMe ? (isDark ? '#2D1F50' : '#EDE9FE') : theme.card, borderRadius: 14, borderWidth: 1, borderColor: student.isMe ? theme.purple + '50' : theme.cardBorder }}>
                                            <Text style={{ fontSize: 16, width: 28, textAlign: 'center' }}>{i === 0 ? '4️⃣' : '5️⃣'}</Text>
                                            <Avatar name={student.name} avatarUrl={student.avatarUrl} color={theme.purple} bg={isDark ? '#141414' : '#F8F4FF'} size={34} />
                                            <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: student.isMe ? theme.purple : theme.text }} numberOfLines={1}>
                                                {student.name}{student.isMe ? ' (You)' : ''}
                                            </Text>
                                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: theme.purple }}>{student.pct}%</Text>
                                        </View>
                                    ))}
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
            <TabEntryCover visible={showEntryCover} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    body: { padding: 14, gap: 14 },
    lbHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
    lbTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    lbTitle: { fontSize: 15, fontWeight: '700' },
    lbSub: { fontSize: 11 },
    lbEmpty: { borderRadius: 16, borderWidth: 1, padding: 24, alignItems: 'center', gap: 8 },
    lbEmptyText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
