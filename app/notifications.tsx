import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/context/ThemeContext';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import api from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Bell } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LIGHT = {
    bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE',
    text: '#0F172A', subText: '#64748B', muted: '#94A3B8',
    purple: '#7C3AED', purpleLight: '#EDE9FE',
};
const DARK = {
    bg: '#000000', card: '#141414', cardBorder: '#2A2A2A',
    text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B',
    purple: '#A78BFA', purpleLight: '#2D1F50',
};

type Notif = {
    recipientId: string;
    id: string;
    title: string;
    message: string;
    tag: string;
    createdAt: string;
    isRead: boolean;
};

const TAG_EMOJI: Record<string, string> = {
    ANNOUNCEMENT: '📢', MAINTENANCE: '🛠️', UPDATE: '🔔', FEATURE: '✨',
    BUG_FIXED: '🐛', PLAN_EXPIRY: '💳', SECURITY: '🛡️',
    FEE_DUE: '💰', EXAM_REMINDER: '📅', ATTENDANCE_WARNING: '⚠️',
    RESULT_PUBLISHED: '📊', TEST_PUBLISHED: '📝', ASSIGNMENT_PUBLISHED: '📋',
    TIMETABLE_PUBLISHED: '🗓️', TIMETABLE_UPDATED: '🗓️', TIMETABLE_CHANGE: '🗓️', TIMETABLE_SUBSTITUTION: '🔁',
};

function relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

async function roleBase(): Promise<'/teacher' | '/student'> {
    const role = await AsyncStorage.getItem('userRole');
    return role === 'TEACHER' ? '/teacher' : '/student';
}

const PAGE_SIZE = 20;

export default function NotificationsScreen() {
    const { isDark, accent } = useTheme();
    const theme = { ...(isDark ? DARK : LIGHT), purple: accent.purple, purpleLight: accent.purpleLight };
    const { refresh: refreshBellCount } = useUnreadNotifications();

    const [notifs, setNotifs] = useState<Notif[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const fetchPage = useCallback(async (pageNum: number, append: boolean) => {
        const base = await roleBase();
        const res = await api.get(`${base}/notifications`, { params: { page: pageNum, limit: PAGE_SIZE } });
        const list: Notif[] = res.data?.notifications ?? [];
        setNotifs(prev => append ? [...prev, ...list] : list);
        setUnreadCount(res.data?.unreadCount ?? 0);
        setHasMore((res.data?.page ?? pageNum) < (res.data?.pages ?? 0));
        setPage(pageNum);
    }, []);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try { await fetchPage(1, false); } catch { /* shows empty state */ }
            setLoading(false);
        })();
    }, [fetchPage]);

    const onRefresh = async () => {
        setRefreshing(true);
        try { await fetchPage(1, false); } catch { /* keep previous list */ }
        setRefreshing(false);
    };

    const loadMore = async () => {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
        try { await fetchPage(page + 1, true); } catch { /* stop here */ }
        setLoadingMore(false);
    };

    const markRead = async (recipientId: string) => {
        const target = notifs.find(n => n.recipientId === recipientId);
        if (!target || target.isRead) return;
        setNotifs(prev => prev.map(n => n.recipientId === recipientId ? { ...n, isRead: true } : n));
        setUnreadCount(c => Math.max(0, c - 1));
        try {
            const base = await roleBase();
            await api.patch(`${base}/notifications/${recipientId}/read`);
            void refreshBellCount();
        } catch { /* best-effort — next fetch will reconcile */ }
    };

    const markAllRead = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
        try {
            const base = await roleBase();
            await api.patch(`${base}/notifications/read-all`);
            void refreshBellCount();
        } catch { /* best-effort */ }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}
            edges={Platform.OS === 'android' ? ['top', 'bottom'] : ['top']}>
            <ScreenHeader title="Notifications" showBack hideBell />

            {unreadCount > 0 && (
                <View style={styles.markAllRow}>
                    <Text style={[styles.unreadLabel, { color: theme.subText }]}>{unreadCount} unread</Text>
                    <Pressable onPress={markAllRead}>
                        <Text style={[styles.markAllText, { color: theme.purple }]}>Mark all read</Text>
                    </Pressable>
                </View>
            )}

            {loading ? (
                <View style={styles.centerFill}>
                    <ActivityIndicator color={theme.purple} />
                </View>
            ) : (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 36, flexGrow: 1 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.muted} />}
                    onScroll={({ nativeEvent }) => {
                        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                        if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 80) void loadMore();
                    }}
                    scrollEventThrottle={200}
                >
                    <View style={styles.body}>
                        {notifs.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Bell size={32} color={theme.muted} />
                                <Text style={[styles.emptyTitle, { color: theme.text }]}>No notifications yet</Text>
                                <Text style={[styles.emptySub, { color: theme.subText }]}>Updates and alerts will appear here</Text>
                            </View>
                        ) : (
                            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                                {notifs.map((n, i) => {
                                    const emoji = TAG_EMOJI[n.tag] ?? '🔔';
                                    return (
                                        <Pressable
                                            key={n.recipientId}
                                            onPress={() => markRead(n.recipientId)}
                                            style={[
                                                styles.row,
                                                i !== notifs.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.cardBorder },
                                                !n.isRead && { backgroundColor: theme.purpleLight },
                                            ]}
                                        >
                                            <View style={[styles.iconWrap, { backgroundColor: isDark ? '#2A2A2A' : '#F8F8F8' }]}>
                                                <Text style={{ fontSize: 16 }}>{emoji}</Text>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.title, { color: theme.text, fontFamily: n.isRead ? 'Poppins_600SemiBold' : 'Poppins_700Bold' }]}>
                                                    {n.title}
                                                </Text>
                                                <Text style={[styles.message, { color: theme.subText }]} numberOfLines={2}>
                                                    {n.message}
                                                </Text>
                                                <Text style={[styles.time, { color: theme.muted }]}>{relativeTime(n.createdAt)}</Text>
                                            </View>
                                            {!n.isRead && <View style={[styles.dot, { backgroundColor: theme.purple }]} />}
                                        </Pressable>
                                    );
                                })}
                            </View>
                        )}

                        {loadingMore && (
                            <View style={{ paddingVertical: 16 }}>
                                <ActivityIndicator color={theme.purple} />
                            </View>
                        )}
                    </View>
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    body: { padding: 14 },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    markAllRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 18, paddingTop: 4, paddingBottom: 10,
    },
    unreadLabel: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
    markAllText: { fontSize: 12, fontFamily: 'Poppins_700Bold' },
    card: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
    iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    title: { fontSize: 14, lineHeight: 19 },
    message: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', marginTop: 2, lineHeight: 17 },
    time: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 6 },
    dot: { width: 8, height: 8, borderRadius: 99, marginTop: 6 },
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 8 },
    emptyTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
    emptySub: { fontSize: 12, fontFamily: 'Poppins_400Regular' },
});
