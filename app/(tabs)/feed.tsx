import { AttachmentPreview } from '@/components/AttachmentPreview';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useFeedBadge } from '@/context/FeedBadgeContext';
import { useStudent } from '@/context/StudentContext';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import { ArrowUp, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RefreshCw } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import {
    Animated,
    Easing,
    ActivityIndicator,
    Dimensions,
    Image as RNImage,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LIGHT = {
    bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE',
    text: '#0F172A', subText: '#64748B', muted: '#94A3B8',
    purple: '#7C3AED', purpleLight: '#EDE9FE',
    generalBadgeBg: '#EDE9FE', generalBadgeText: '#6D28D9',
    classBadgeBg: '#CCFBF1', classBadgeText: '#0F766E',
};
const DARK = {
    bg: '#0F0A1E', card: '#1A1030', cardBorder: '#2D1F50',
    text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B',
    purple: '#A78BFA', purpleLight: '#2D1F50',
    generalBadgeBg: '#2D1F50', generalBadgeText: '#A78BFA',
    classBadgeBg: '#134E4A', classBadgeText: '#5EEAD4',
};

// ── Types ─────────────────────────────────────────────────────────────────────
type EventType = 'holiday' | 'event' | 'sports' | 'trip' | 'meeting' | 'test' | 'termtest' | 'exam' | 'submission';

interface CalEvent {
    id: string;
    date: number;
    fullDate: string;
    type: EventType;
    label: string;
    isClassEvent: boolean;
    createdBy: { id: string; name: string } | null;
}

type PostType = 'announcement' | 'notice' | 'material' | 'result';
type FeedSource = 'general' | 'class';

interface FeedPost {
    id: string;
    type: PostType;
    source: FeedSource;
    author: { id: string; name: string; role: string; avatarUrl?: string | null };
    subject?: string | null;
    title: string;
    body: string;
    createdAt: string;
    attachmentUrl?: string | null;
    attachmentType?: string | null;
    attachmentName?: string | null;
}

// ── Config ────────────────────────────────────────────────────────────────────
const EVENT_CFG: Record<EventType, { dot: string; bg: string; darkBg: string; text: string; darkText: string; label: string; emoji: string }> = {
    holiday:    { dot: '#EF4444', bg: '#FEE2E2', darkBg: '#2B0D0D', text: '#991B1B', darkText: '#F87171', label: 'Holiday',       emoji: '🏖️' },
    event:      { dot: '#3B82F6', bg: '#DBEAFE', darkBg: '#0D1F3C', text: '#1D4ED8', darkText: '#60A5FA', label: 'Event',         emoji: '📅' },
    sports:     { dot: '#DB2777', bg: '#FCE7F3', darkBg: '#2B0D1A', text: '#9D174D', darkText: '#F9A8D4', label: 'Sports',        emoji: '🏆' },
    trip:       { dot: '#92400E', bg: '#FEF3C7', darkBg: '#2D2010', text: '#78350F', darkText: '#FCD34D', label: 'Trip',          emoji: '🚌' },
    meeting:    { dot: '#F97316', bg: '#FFEDD5', darkBg: '#2D1800', text: '#C2410C', darkText: '#FB923C', label: 'Meeting',       emoji: '🤝' },
    test:       { dot: '#8B5CF6', bg: '#EDE9FE', darkBg: '#2D1F50', text: '#5B21B6', darkText: '#A78BFA', label: 'Test',          emoji: '📝' },
    termtest:   { dot: '#10B981', bg: '#D1FAE5', darkBg: '#0D2B20', text: '#065F46', darkText: '#34D399', label: 'Term Test',     emoji: '📋' },
    exam:       { dot: '#F59E0B', bg: '#FEF3C7', darkBg: '#2D2010', text: '#92400E', darkText: '#FCD34D', label: 'Semester Exam', emoji: '🎓' },
    submission: { dot: '#0891B2', bg: '#CFFAFE', darkBg: '#0D2B30', text: '#155E75', darkText: '#67E8F9', label: 'Submission',    emoji: '📤' },
};

const POST_META = {
    announcement: { emoji: '📢', label: 'Announcement', color: '#D97706', darkColor: '#FCD34D', bg: '#FEF3C7', darkBg: '#2D2010' },
    notice:       { emoji: '📌', label: 'Notice',       color: '#DC2626', darkColor: '#F87171', bg: '#FEE2E2', darkBg: '#2B0D0D' },
    material:     { emoji: '📄', label: 'Material',     color: '#2563EB', darkColor: '#60A5FA', bg: '#DBEAFE', darkBg: '#0D1F3C' },
    result:       { emoji: '✅', label: 'Result',        color: '#059669', darkColor: '#34D399', bg: '#D1FAE5', darkBg: '#0D2B20' },
} as const;

const AVATAR_COLORS = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#0891B2'];

const { width } = Dimensions.get('window');
const CELL_SIZE = Math.floor((width - 92) / 7);

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDay(y: number, m: number) { return new Date(y, m, 1).getDay(); }

function formatRelative(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}
function formatDateTime(iso: string) {
    const d = new Date(iso);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${h12}:${m} ${ampm}`;
}

// ── Mini Calendar ─────────────────────────────────────────────────────────────
function MiniCalendar({ theme, isDark }: { theme: typeof LIGHT; isDark: boolean }) {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth());
    const [events, setEvents] = useState<CalEvent[]>([]);
    const [selectedDate, setSelectedDate] = useState<number | null>(null);
    const [modalVisible, setModalVisible] = useState(false);

    const today = now.getDate();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    const startOffset = (getFirstDay(year, month) + 6) % 7;
    const daysInMonth = getDaysInMonth(year, month);

    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const MONTHS_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    const fetchEvents = useCallback(async () => {
        try {
            const res = await api.get('/student/feed/events', { params: { year, month } });
            setEvents(res.data.data);
        } catch { /* silent */ }
    }, [year, month]);

    useEffect(() => { fetchEvents(); }, [fetchEvents]);

    const eventsOn = (d: number) => events.filter(e => e.date === d);

    const cells: (number | null)[] = [
        ...Array(startOffset).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); setSelectedDate(null); };
    const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); setSelectedDate(null); };

    return (
        <>
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, paddingBottom: 8 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <Text style={{ fontSize: 14 }}>📅</Text>
                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>Academic Calendar</Text>
                </View>

                <View style={styles.calHeader}>
                    <TouchableOpacity onPress={prevMonth} style={[styles.navBtn, { borderColor: theme.cardBorder }]} activeOpacity={0.7}>
                        <ChevronLeft size={18} color={theme.purple} />
                    </TouchableOpacity>
                    <Text style={[styles.monthTitle, { color: theme.text }]}>{MONTHS[month]} {year}</Text>
                    <TouchableOpacity onPress={nextMonth} style={[styles.navBtn, { borderColor: theme.cardBorder }]} activeOpacity={0.7}>
                        <ChevronRight size={18} color={theme.purple} />
                    </TouchableOpacity>
                </View>

                <View style={styles.dayHeaderRow}>
                    {DAYS.map((d, i) => (
                        <Text key={i} style={[styles.dayHeader, { color: i >= 5 ? '#EF4444' : theme.muted }]}>{d}</Text>
                    ))}
                </View>

                <View style={styles.grid}>
                    {cells.map((d, i) => {
                        if (!d) return <View key={i} style={styles.gridCell} />;
                        const isToday = isCurrentMonth && d === today;
                        const isSelected = d === selectedDate;
                        const evs = eventsOn(d);
                        const isWeekend = (i % 7) >= 5;
                        return (
                            <TouchableOpacity key={i}
                                style={[
                                    styles.gridCell,
                                    isSelected && { backgroundColor: theme.purpleLight, borderRadius: 99 },
                                    isToday && !isSelected && { borderWidth: 1.5, borderColor: theme.purple, borderRadius: 99 },
                                ]}
                                onPress={() => { setSelectedDate(d); if (evs.length > 0) setModalVisible(true); }}
                                activeOpacity={0.75}>
                                <Text style={[styles.dateNum, {
                                    color: isSelected ? theme.purple : isToday ? theme.purple : isWeekend ? '#EF4444' : theme.text,
                                    fontFamily: isToday ? 'Poppins_700Bold' : 'Poppins_400Regular',
                                }]}>{d}</Text>
                                {evs.length > 0 && (
                                    <View style={styles.dotRow}>
                                        {evs.slice(0, 3).map((ev, di) => {
                                            const cfg = EVENT_CFG[ev.type] ?? EVENT_CFG.event;
                                            return <View key={di} style={[styles.eventDot, { backgroundColor: cfg.dot }]} />;
                                        })}
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Legend — all event types always shown (matches web) */}
                <View style={[styles.legendRow, { borderTopColor: theme.cardBorder }]}>
                    {(Object.keys(EVENT_CFG) as EventType[]).map(type => (
                        <View key={type} style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: EVENT_CFG[type].dot }]} />
                            <Text style={[styles.legendText, { color: theme.muted }]}>{EVENT_CFG[type].label}</Text>
                        </View>
                    ))}
                </View>

                <Text style={{ fontSize: 10, color: theme.muted, opacity: 0.7, textAlign: 'center', marginTop: 12 }}>
                    Managed by Principal Office and Teachers
                </Text>

                <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
                    <Pressable style={styles.overlay} onPress={() => setModalVisible(false)}>
                        <Pressable style={[styles.modalCard, { backgroundColor: isDark ? '#1A1030' : 'white' }]} onPress={() => {}}>
                            <Text style={[styles.modalDateTitle, { color: theme.text }]}>
                                📅 {selectedDate} {MONTHS_S[month]}, {year}
                            </Text>
                            <View style={{ gap: 10 }}>
                                {selectedDate && eventsOn(selectedDate).map((ev, i) => {
                                    const c = EVENT_CFG[ev.type] ?? EVENT_CFG.event;
                                    return (
                                        <View key={i} style={[styles.modalEventRow, { backgroundColor: isDark ? c.darkBg : c.bg, borderLeftColor: c.dot }]}>
                                            <Text style={{ fontSize: 22 }}>{c.emoji}</Text>
                                            <View style={{ flex: 1 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    <Text style={[styles.modalEventType, { color: isDark ? c.darkText : c.text }]}>{c.label}</Text>
                                                    {ev.isClassEvent && (
                                                        <View style={{ backgroundColor: isDark ? '#134E4A' : '#CCFBF1', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 99 }}>
                                                            <Text style={{ fontSize: 9, fontFamily: 'Poppins_600SemiBold', color: isDark ? '#5EEAD4' : '#0F766E' }}>Class</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <Text style={[styles.modalEventLabel, { color: isDark ? c.darkText : c.text }]}>{ev.label}</Text>
                                                {ev.createdBy && (
                                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted, marginTop: 2 }}>by {ev.createdBy.name}</Text>
                                                )}
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                            <TouchableOpacity
                                style={[styles.modalCloseBtn, { backgroundColor: isDark ? '#2D1F50' : '#EDE9FE' }]}
                                onPress={() => setModalVisible(false)}>
                                <Text style={{ color: theme.purple, fontFamily: 'Poppins_600SemiBold', fontSize: 13 }}>Close</Text>
                            </TouchableOpacity>
                        </Pressable>
                    </Pressable>
                </Modal>
            </View>
        </>
    );
}

// ── Verified Badge (same as web teacher/admin feed) ────────────────────────────
function VerifiedBadge() {
    return (
        <Svg width={12} height={12} viewBox="0 0 40 40" fill="none">
            <Path d="M20 2
                L23.5 6.5 L29 5 L31.5 10.5 L37.5 12
                L36 18 L40 22 L36 26 L37.5 32
                L31.5 33.5 L29 39 L23.5 37.5
                L20 42 L16.5 37.5 L11 39
                L8.5 33.5 L2.5 32 L4 26
                L0 22 L4 18 L2.5 12
                L8.5 10.5 L11 5 L16.5 6.5 Z"
                fill="#DA7756" />
            <Path d="M13 21l5 5 9-10"
                stroke="white" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

// ── Feed Card ─────────────────────────────────────────────────────────────────
function FeedCard({ post, theme, isDark, divisionName }: { post: FeedPost; theme: typeof LIGHT; isDark: boolean; divisionName: string }) {
    const [expanded, setExpanded] = useState(false);
    const meta = POST_META[post.type];
    const initials = post.author.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
    const avatarColor = AVATAR_COLORS[post.author.name.charCodeAt(0) % AVATAR_COLORS.length];
    const sourceLabel = post.source === 'class' ? (divisionName || 'My Class') : 'General';
    const sourceBg = post.source === 'class' ? theme.classBadgeBg : theme.generalBadgeBg;
    const sourceColor = post.source === 'class' ? theme.classBadgeText : theme.generalBadgeText;

    return (
        <View style={[styles.feedCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {/* Type chip + source badge + time */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <View style={[styles.typeChip, { backgroundColor: isDark ? meta.darkBg : meta.bg }]}>
                    <Text style={{ fontSize: 12 }}>{meta.emoji}</Text>
                    <Text style={[styles.typeChipText, { color: isDark ? meta.darkColor : meta.color }]}>{meta.label}</Text>
                    {post.subject ? <Text style={[styles.subjectTag, { color: isDark ? meta.darkColor : meta.color }]}>· {post.subject}</Text> : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ backgroundColor: sourceBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 }}>
                        <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: sourceColor }}>{sourceLabel}</Text>
                    </View>
                    <Text style={[styles.authorMeta, { color: theme.muted }]}>{formatRelative(post.createdAt)}</Text>
                </View>
            </View>

            {/* Author */}
            <View style={styles.authorRow}>
                <View style={[styles.avatar, { backgroundColor: post.author.avatarUrl ? 'transparent' : avatarColor + '22', overflow: 'hidden' }]}>
                    {post.author.avatarUrl
                        ? <RNImage source={{ uri: post.author.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                        : <Text style={[styles.avatarText, { color: avatarColor }]}>{initials}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.authorName, { color: theme.text }]}>{post.author.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Platform.OS === 'ios' ? 0.5 : -4 }}>
                        <Text style={[styles.authorMeta, { color: theme.muted }]} numberOfLines={1}>
                            {post.author.role.charAt(0) + post.author.role.slice(1).toLowerCase()}
                        </Text>
                        <View style={{ marginTop: -2 }}>
                            <VerifiedBadge />
                        </View>
                    </View>
                </View>
            </View>

            <Text style={[styles.postTitle, { color: theme.text }]}>{post.title}</Text>
            {post.body ? (
                <Text style={[styles.postBody, { color: theme.subText }]} numberOfLines={expanded ? undefined : 2}>{post.body}</Text>
            ) : null}

            {post.attachmentUrl && post.attachmentName && post.attachmentType && (
                <AttachmentPreview
                    url={post.attachmentUrl}
                    name={post.attachmentName}
                    type={post.attachmentType}
                />
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <TouchableOpacity style={styles.expandRow} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
                    {expanded ? <ChevronUp size={13} color={theme.muted} /> : <ChevronDown size={13} color={theme.muted} />}
                    <Text style={[styles.expandText, { color: theme.muted }]}>{expanded ? 'Show less' : 'Read more'}</Text>
                </TouchableOpacity>
                <Text style={[styles.authorMeta, { color: theme.muted, opacity: 0.7 }]} numberOfLines={1}>
                    {formatDateTime(post.createdAt)}
                </Text>
            </View>
        </View>
    );
}

// ── Feed Skeleton ─────────────────────────────────────────────────────────────
function FeedSkeleton({ theme, isDark }: { theme: typeof LIGHT; isDark: boolean }) {
    const shimmer = isDark ? '#2D1F50' : '#E9E3FA';
    return (
        <View style={{ gap: 12 }}>
            {[1, 2, 3].map(i => (
                <View key={i} style={[styles.feedCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <View style={{ width: 110, height: 28, borderRadius: 99, backgroundColor: shimmer }} />
                        <View style={{ width: 60, height: 18, borderRadius: 99, backgroundColor: shimmer }} />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                        <View style={{ width: 38, height: 38, borderRadius: 99, backgroundColor: shimmer }} />
                        <View style={{ gap: 6 }}>
                            <View style={{ width: 100, height: 12, borderRadius: 6, backgroundColor: shimmer }} />
                            <View style={{ width: 70, height: 10, borderRadius: 5, backgroundColor: shimmer }} />
                        </View>
                    </View>
                    <View style={{ gap: 6 }}>
                        <View style={{ width: '70%', height: 14, borderRadius: 6, backgroundColor: shimmer }} />
                        <View style={{ width: '100%', height: 11, borderRadius: 5, backgroundColor: shimmer }} />
                        <View style={{ width: '85%', height: 11, borderRadius: 5, backgroundColor: shimmer }} />
                    </View>
                </View>
            ))}
        </View>
    );
}

// ── Filter types ──────────────────────────────────────────────────────────────
type FilterKey = PostType | FeedSource | 'all';

const FILTERS: { key: FilterKey; label: string; emoji: string }[] = [
    { key: 'all',          label: 'All',      emoji: '🗂️' },
    { key: 'general',      label: 'General',  emoji: '🏫' },
    { key: 'class',        label: 'My Class', emoji: '🏷️' },
    { key: 'announcement', label: 'Alerts',   emoji: '📢' },
    { key: 'notice',       label: 'Notice',   emoji: '📌' },
    { key: 'material',     label: 'Files',    emoji: '📄' },
    { key: 'result',       label: 'Results',  emoji: '✅' },
];

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function Feed() {
    const { isDark } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const { profile } = useStudent();
    const { setFeedHasNew } = useFeedBadge();
    const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
    const [posts, setPosts] = useState<FeedPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [inScreenHasNew, setInScreenHasNew] = useState(false);
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const feedScrollRef = useRef<ScrollView>(null);
    const spinAnim = useRef(new Animated.Value(0)).current;
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const latestCreatedAtRef = useRef<string | null>(null);
    const isFocusedRef = useRef(false);

    // Track focus: clear tab badge on enter, mark unfocused on leave
    useFocusEffect(useCallback(() => {
        isFocusedRef.current = true;
        setFeedHasNew(false);
        return () => { isFocusedRef.current = false; };
    }, [setFeedHasNew]));

    const fetchPosts = useCallback(async (isInitial = false) => {
        if (isInitial) setLoading(true);
        try {
            const typeParam = (activeFilter === 'general' || activeFilter === 'class' || activeFilter === 'all')
                ? undefined
                : activeFilter;
            const res = await api.get('/student/feed/posts', {
                params: { limit: 50, ...(typeParam ? { type: typeParam } : {}) },
            });
            const all: FeedPost[] = res.data.data;
            const newestAt = all[0]?.createdAt ?? null;

            if (isInitial) {
                latestCreatedAtRef.current = newestAt;
                setInScreenHasNew(false);
            } else if (newestAt && latestCreatedAtRef.current && newestAt > latestCreatedAtRef.current) {
                latestCreatedAtRef.current = newestAt;
                setInScreenHasNew(true);
                if (!isFocusedRef.current) setFeedHasNew(true);
            }

            const filtered = activeFilter === 'general'
                ? all.filter(p => p.source === 'general')
                : activeFilter === 'class'
                ? all.filter(p => p.source === 'class')
                : all;

            setPosts(filtered);
        } catch { /* silent on poll */ }
        if (isInitial) setLoading(false);
    }, [activeFilter, setFeedHasNew]);

    useEffect(() => {
        if (!isRefreshing) return;
        let stopped = false;
        const runLoop = () => {
            if (stopped) return;
            spinAnim.setValue(0);
            Animated.timing(spinAnim, {
                toValue: 1,
                duration: 650,
                easing: Easing.linear,
                useNativeDriver: true,
            }).start(({ finished }) => {
                if (finished && !stopped) runLoop();
            });
        };
        runLoop();
        return () => { stopped = true; };
    }, [isRefreshing]);

    const handleRefresh = async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        await fetchPosts(true);
        setIsRefreshing(false);
    };

    useEffect(() => {
        fetchPosts(true);
        pollRef.current = setInterval(() => fetchPosts(false), 30_000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [fetchPosts]);

    const divisionName = profile?.division ?? 'My Class';

    const filters = FILTERS.map(f =>
        f.key === 'class' ? { ...f, label: divisionName } : f
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
            <ScreenHeader title="Feed" />
            <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={{ paddingBottom: 2 }}>
                <View style={[styles.body, { paddingTop: 6 }]}>

                    <MiniCalendar theme={theme} isDark={isDark} />

                    {/* Feed — fixed-height card, header/filters stay put, posts scroll inside */}
                    <View style={{ position: 'relative' }}>
                    <View style={[styles.feedPanel, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        <View style={[styles.feedPanelHeader, { borderBottomColor: theme.cardBorder }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={{ fontSize: 14 }}>📢</Text>
                                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>Announcements & Feed</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    {inScreenHasNew && (
                                        <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: '#10B981' }} />
                                    )}
                                    <TouchableOpacity onPress={handleRefresh} activeOpacity={0.7} disabled={loading}>
                                        <Animated.View style={{ transform: [{ rotate: spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
                                            <RefreshCw size={16} color="#FFFFFF" />
                                        </Animated.View>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterRow, { marginTop: 10 }]}>
                                {filters.map(tab => {
                                    const isActive = activeFilter === tab.key;
                                    return (
                                        <TouchableOpacity key={tab.key}
                                            style={[styles.filterChip, {
                                                backgroundColor: isActive ? theme.purple : theme.bg,
                                                borderColor: isActive ? theme.purple : theme.cardBorder,
                                            }]}
                                            onPress={() => setActiveFilter(tab.key)}
                                            activeOpacity={0.75}>
                                            <Text style={{ fontSize: 12 }}>{tab.emoji}</Text>
                                            <Text style={[styles.filterChipText, { color: isActive ? 'white' : theme.subText }]}>{tab.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>

                        <ScrollView
                            ref={feedScrollRef}
                            style={{ flex: 1, backgroundColor: theme.bg }}
                            contentContainerStyle={{ padding: 14, gap: 12, flexGrow: 1 }}
                            nestedScrollEnabled
                            showsVerticalScrollIndicator={false}
                            onScroll={e => setShowScrollTop(e.nativeEvent.contentOffset.y > 200)}
                            scrollEventThrottle={16}
                        >
                            {loading ? (
                                <FeedSkeleton theme={theme} isDark={isDark} />
                            ) : posts.length === 0 ? (
                                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
                                    <Text style={{ fontFamily: 'Poppins_600SemiBold', color: theme.subText, fontSize: 14 }}>No posts here</Text>
                                    <Text style={{ fontFamily: 'Poppins_400Regular', color: theme.muted, fontSize: 12, marginTop: 4 }}>Check back later</Text>
                                </View>
                            ) : (
                                posts.map(post => (
                                    <FeedCard key={post.id} post={post} theme={theme} isDark={isDark} divisionName={divisionName} />
                                ))
                            )}
                        </ScrollView>
                    </View>

                    {showScrollTop && (
                        <View pointerEvents="box-none" style={{ position: 'absolute', bottom: 16, left: 0, right: 0, alignItems: 'center', zIndex: 20 }}>
                            <TouchableOpacity
                                style={[styles.scrollTopBtn, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                                onPress={() => feedScrollRef.current?.scrollTo({ y: 0, animated: true })}
                                activeOpacity={0.8}
                            >
                                <ArrowUp size={16} color="#FFFFFF" />
                            </TouchableOpacity>
                        </View>
                    )}
                    </View>

                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    body: { padding: 14, gap: 14 },

    card: { borderRadius: 20, borderWidth: 1, padding: 16, shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },

    calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    navBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1 },
    monthTitle: { fontSize: 15, fontFamily: 'Poppins_700Bold' },

    dayHeaderRow: { flexDirection: 'row', marginBottom: 4, width: CELL_SIZE * 7, alignSelf: 'center' },
    dayHeader: { width: CELL_SIZE, textAlign: 'center', fontSize: 11, fontFamily: 'Poppins_600SemiBold' },

    grid: { flexDirection: 'row', flexWrap: 'wrap', width: CELL_SIZE * 7, alignSelf: 'center' },
    gridCell: { width: CELL_SIZE, height: CELL_SIZE, alignItems: 'center', justifyContent: 'center', position: 'relative' },
    dateNum: { fontSize: 12, lineHeight: 16 },
    dotRow: { position: 'absolute', bottom: 3, flexDirection: 'row', gap: 2 },
    eventDot: { width: 8, height: 8, borderRadius: 99 },

    legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 12, marginTop: 10, borderTopWidth: 1 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 99 },
    legendText: { fontSize: 10, fontFamily: 'Poppins_400Regular' },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalCard: { width: '100%', borderRadius: 24, padding: 20, gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 12 },
    modalDateTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold' },
    modalEventRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderLeftWidth: 4 },
    modalEventType: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', opacity: 0.75 },
    modalEventLabel: { fontSize: 13, fontFamily: 'Poppins_700Bold' },
    modalCloseBtn: { alignItems: 'center', paddingVertical: 12, borderRadius: 14, marginTop: 4 },

    feedPanel: { height: 600, borderRadius: 20, borderWidth: 1, overflow: 'hidden', shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
    feedPanelHeader: { padding: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },

    filterRow: { gap: 8, paddingBottom: 2 },
    filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
    filterChipText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },

    feedCard: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 10, shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
    typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
    typeChipText: { fontSize: 11, fontFamily: 'Poppins_700Bold' },
    subjectTag: { fontSize: 11, fontFamily: 'Poppins_400Regular' },

    authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 38, height: 38, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 13, fontFamily: 'Poppins_700Bold' },
    authorName: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
    authorMeta: { fontSize: 11, fontFamily: 'Poppins_400Regular' },

    postTitle: { fontSize: 14, fontFamily: 'Poppins_700Bold', lineHeight: 20 },
    postBody: { fontSize: 12, fontFamily: 'Poppins_400Regular', lineHeight: 18 },

    expandRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    expandText: { fontSize: 11, fontFamily: 'Poppins_400Regular' },

    scrollTopBtn: { width: 36, height: 36, borderRadius: 99, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 6 },
});
