import { AttachmentPreview } from '@/components/AttachmentPreview';
import { LinkifiedText } from '@/components/LinkifiedText';
import { useTheme } from '@/context/ThemeContext';
import { formatDisplayName, resolveDisplayTitle } from '@/lib/displayName';
import api from '@/lib/api';
import * as DocumentPicker from 'expo-document-picker';
import { ArrowUp, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Paperclip, RefreshCw, Send, Tag, X } from 'lucide-react-native';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Easing,
    Image,
    Keyboard,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import type { ScrollViewInstance, ViewInstance } from 'react-native';
import Svg, { Path } from 'react-native-svg';

// Same cell-sizing formula as the student app's MiniCalendar — card padding
// (16*2) + screen padding (14*2) = 60, plus a little slack to land on the
// same 92 constant the student version uses.
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 92) / 7);

// ── Types ────────────────────────────────────────────────────────────────────
type EventType = 'holiday' | 'event' | 'sports' | 'trip' | 'meeting' | string;
interface CalEvent { id: string; date: number; type: EventType; label: string; fullDate: string; }

type PostType = 'announcement' | 'notice' | 'material' | 'result';
interface FeedPost {
    id: string; type: PostType;
    author: { id: string; name: string; role: string; avatarUrl?: string | null; prefix?: string | null; title?: string | null };
    subject?: string | null; title: string; body: string; createdAt: string;
    attachmentUrl?: string | null; attachmentType?: string | null; attachmentName?: string | null;
}

// ── Config ───────────────────────────────────────────────────────────────────
const EVENT_CFG: Record<string, { dot: string; label: string; emoji: string }> = {
    holiday: { dot: '#EF4444', label: 'Holiday', emoji: '🏖️' },
    event: { dot: '#3B82F6', label: 'Event', emoji: '🎉' },
    sports: { dot: '#DB2777', label: 'Sports', emoji: '🏆' },
    trip: { dot: '#92400E', label: 'Trip', emoji: '🚌' },
    meeting: { dot: '#F97316', label: 'Meeting', emoji: '🤝' },
};

const POST_META: Record<PostType, { emoji: string; label: string; bg: string; text: string }> = {
    announcement: { emoji: '📢', label: 'Announcement', bg: '#FEF3C7', text: '#B45309' },
    notice: { emoji: '📌', label: 'Notice', bg: '#FEE2E2', text: '#B91C1C' },
    material: { emoji: '📄', label: 'Material', bg: '#DBEAFE', text: '#1D4ED8' },
    result: { emoji: '✅', label: 'Result', bg: '#D1FAE5', text: '#047857' },
};
const POST_META_DARK: Record<PostType, { bg: string; text: string }> = {
    announcement: { bg: 'rgba(245,158,11,0.15)', text: '#FBBF24' },
    notice: { bg: 'rgba(239,68,68,0.15)', text: '#F87171' },
    material: { bg: 'rgba(59,130,246,0.15)', text: '#60A5FA' },
    result: { bg: 'rgba(16,185,129,0.15)', text: '#34D399' },
};

const AVATAR_COLORS = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#0891B2'];
const FILTERS: { key: PostType | 'all'; label: string; emoji: string }[] = [
    { key: 'all', label: 'All', emoji: '🗂️' },
    { key: 'announcement', label: 'Announcement', emoji: '📢' },
    { key: 'notice', label: 'Notice', emoji: '📌' },
    { key: 'material', label: 'Material', emoji: '📄' },
    { key: 'result', label: 'Results', emoji: '✅' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
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
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${h12}:${m} ${ampm}`;
}
function getInitials(name: string) {
    return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function VerifiedBadge() {
    return (
        <Svg width={11} height={11} viewBox="0 0 40 40" style={Platform.OS === 'android' ? { marginTop: -2 } : undefined}>
            <Path
                d="M20 2 L23.5 6.5 L29 5 L31.5 10.5 L37.5 12 L36 18 L40 22 L36 26 L37.5 32 L31.5 33.5 L29 39 L23.5 37.5 L20 42 L16.5 37.5 L11 39 L8.5 33.5 L2.5 32 L4 26 L0 22 L4 18 L2.5 12 L8.5 10.5 L11 5 L16.5 6.5 Z"
                fill="#DA7756"
            />
            <Path d="M13 21l5 5 9-10" fill="none" stroke="white" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

// ── Academic Calendar (view-only) ────────────────────────────────────────────
function AcademicCalendar() {
    const { isDark, accent } = useTheme();
    const cardBg = isDark ? '#141414' : '#FFFFFF';
    const cardBorder = isDark ? '#2A2A2A' : '#EDE9FE';
    const text = isDark ? '#F1F5F9' : '#0F172A';
    const subText = isDark ? '#94A3B8' : '#64748B';

    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth());
    const [selectedDate, setSelectedDate] = useState<number | null>(null);
    const [showEventModal, setShowEventModal] = useState(false);

    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const MONTHS_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    const today = now.getDate();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    const startOffset = (getFirstDay(year, month) + 6) % 7;
    const daysInMonth = getDaysInMonth(year, month);
    const cells: (number | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
    while (cells.length % 7 !== 0) cells.push(null);

    // Same fix as the student app's MiniCalendar: a plain `events` state that
    // gets cleared/refetched on month change flashes the OLD month's dots for
    // one frame after the grid has already repainted for the NEW month (the
    // state update from the effect only lands after that first render). Keyed
    // per-month cache read synchronously during render avoids that window —
    // there's never a render where month and events can disagree.
    const eventsCacheRef = useRef<Map<string, CalEvent[]>>(new Map());
    const fetchedKeysRef = useRef<Set<string>>(new Set());
    const requestIdRef = useRef(0);
    const [, setCacheVersion] = useState(0);
    const cacheKey = `${year}-${month}`;
    const events = eventsCacheRef.current.get(cacheKey) ?? [];

    useEffect(() => {
        if (fetchedKeysRef.current.has(cacheKey)) return; // already fetched fresh this session
        const requestId = ++requestIdRef.current;
        (async () => {
            try {
                const res = await api.get('/teacher/campus/feed/events', { params: { year, month } });
                if (requestIdRef.current !== requestId) return; // a newer request has since started
                fetchedKeysRef.current.add(cacheKey);
                eventsCacheRef.current.set(cacheKey, res.data.data);
                setCacheVersion((v) => v + 1);
            } catch { /* silent */ }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [year, month]);

    const eventsOn = (d: number) => events.filter((e) => e.date === d);
    const prevMonth = () => { if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1); setSelectedDate(null); };
    const nextMonth = () => { if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1); setSelectedDate(null); };
    const cfgFor = (t: string) => EVENT_CFG[t] ?? EVENT_CFG.event;

    return (
        <View style={[styles.calCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Text style={{ fontSize: 14 }}>📅</Text>
                <Text style={[styles.calCardTitle, { color: text }]}>Academic Calendar</Text>
            </View>

            <View style={styles.calHeader}>
                <TouchableOpacity onPress={prevMonth} style={[styles.calNavBtn, { borderColor: cardBorder }]} activeOpacity={0.7}>
                    <ChevronLeft size={18} color={accent.purple} />
                </TouchableOpacity>
                <Text style={[styles.calMonthLabel, { color: text }]}>{MONTHS[month]} {year}</Text>
                <TouchableOpacity onPress={nextMonth} style={[styles.calNavBtn, { borderColor: cardBorder }]} activeOpacity={0.7}>
                    <ChevronRight size={18} color={accent.purple} />
                </TouchableOpacity>
            </View>

            <View style={styles.calDayHeaderRow}>
                {DAYS.map((d, i) => (
                    <Text key={i} style={[styles.calDayLabel, { color: i >= 5 ? '#EF4444' : subText }]}>{d}</Text>
                ))}
            </View>

            <View style={styles.calGrid}>
                {cells.map((d, i) => {
                    if (!d) return <View key={i} style={styles.calGridCell} />;
                    const isToday = isCurrentMonth && d === today;
                    const isSelected = d === selectedDate;
                    const evs = eventsOn(d);
                    const isWeekend = (i % 7) >= 5;
                    return (
                        <TouchableOpacity
                            key={i}
                            style={[
                                styles.calGridCell,
                                isSelected && { backgroundColor: accent.purpleLight, borderRadius: 99 },
                                isToday && !isSelected && { borderWidth: 1.5, borderColor: accent.purple, borderRadius: 99 },
                            ]}
                            onPress={() => { setSelectedDate(d); if (evs.length > 0) setShowEventModal(true); }}
                            activeOpacity={0.75}
                        >
                            <Text style={[styles.calDateNum, {
                                color: isSelected ? accent.purple : isToday ? accent.purple : isWeekend ? '#EF4444' : text,
                                fontFamily: isToday ? 'Poppins_700Bold' : 'Poppins_400Regular',
                            }]}>{d}</Text>
                            {evs.length > 0 && (
                                <View style={styles.calDotRow}>
                                    {evs.slice(0, 3).map((ev, di) => (
                                        <View key={di} style={[styles.calEventDot, { backgroundColor: cfgFor(ev.type).dot }]} />
                                    ))}
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>

            <View style={[styles.calLegendRow, { borderTopColor: cardBorder }]}>
                {Object.keys(EVENT_CFG).map((type) => (
                    <View key={type} style={styles.calLegendItem}>
                        <View style={[styles.calLegendDot, { backgroundColor: EVENT_CFG[type].dot }]} />
                        <Text style={[styles.calLegendText, { color: subText }]}>{EVENT_CFG[type].label}</Text>
                    </View>
                ))}
            </View>

            <Text style={{ fontSize: 10, color: subText, opacity: 0.7, textAlign: 'center', marginTop: 12, fontFamily: 'Poppins_400Regular' }}>
                This calendar is managed by admin
            </Text>

            <Modal visible={showEventModal} transparent animationType="fade" onRequestClose={() => setShowEventModal(false)}>
                <Pressable style={styles.calOverlay} onPress={() => setShowEventModal(false)}>
                    <Pressable style={[styles.calModalCard, { backgroundColor: isDark ? '#141414' : 'white' }]} onPress={() => {}}>
                        <Text style={[styles.calModalDateTitle, { color: text }]}>
                            📅 {selectedDate} {MONTHS_S[month]}, {year}
                        </Text>
                        <View style={{ gap: 10 }}>
                            {selectedDate != null && eventsOn(selectedDate).map((ev) => {
                                const c = cfgFor(ev.type);
                                return (
                                    <View key={ev.id} style={[styles.calModalEventRow, { backgroundColor: isDark ? '#1A1A1A' : '#F8FAFC', borderLeftColor: c.dot }]}>
                                        <Text style={{ fontSize: 22 }}>{c.emoji}</Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.calModalEventType, { color: c.dot }]}>{c.label}</Text>
                                            <Text style={[styles.calModalEventLabel, { color: text }]}>{ev.label}</Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                        <TouchableOpacity
                            style={[styles.calModalCloseBtn, { backgroundColor: accent.purpleLight }]}
                            onPress={() => setShowEventModal(false)}
                        >
                            <Text style={{ color: accent.purple, fontFamily: 'Poppins_600SemiBold', fontSize: 13 }}>Close</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

// ── Feed Post Card ────────────────────────────────────────────────────────────
function FeedCard({ post, myUserId, onDelete }: { post: FeedPost; myUserId: string; onDelete: (id: string) => void }) {
    const { isDark } = useTheme();
    const cardBg = isDark ? '#141414' : '#FFFFFF';
    const cardBorder = isDark ? '#2A2A2A' : '#EDE9FE';
    const text = isDark ? '#F1F5F9' : '#0F172A';
    const subText = isDark ? '#94A3B8' : '#64748B';

    const [expanded, setExpanded] = useState(false);
    const isLongBody = (post.body?.length ?? 0) > 100;
    const meta = POST_META[post.type];
    const metaColors = isDark ? POST_META_DARK[post.type] : { bg: meta.bg, text: meta.text };
    const name = post.author.name;
    const displayName = formatDisplayName(name, post.author.prefix);
    const initials = getInitials(name);
    const avatarColor = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
    const canDelete = post.author.id === myUserId;

    const confirmDelete = () => {
        Alert.alert('Delete post?', 'This post will be permanently deleted. Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Yes, Delete', style: 'destructive', onPress: () => onDelete(post.id) },
        ]);
    };

    return (
        <View style={[styles.feedCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={[styles.postBadge, { backgroundColor: metaColors.bg }]}>
                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: metaColors.text }}>
                        {meta.emoji} {meta.label}{post.subject ? ` · ${post.subject}` : ''}
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: subText }}>{formatRelative(post.createdAt)}</Text>
                    {canDelete && (
                        <TouchableOpacity onPress={confirmDelete} style={{ padding: 2 }}>
                            <X size={13} color={subText} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <View style={[styles.avatarCircle, { backgroundColor: post.author.avatarUrl ? 'transparent' : avatarColor }]}>
                    {post.author.avatarUrl
                        ? <Image source={{ uri: post.author.avatarUrl }} style={styles.avatarImg} />
                        : <Text style={styles.avatarInitials}>{initials}</Text>}
                </View>
                <View>
                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: text }}>{displayName}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
                        <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: subText }}>{resolveDisplayTitle(post.author.role, post.author.title)}</Text>
                        <VerifiedBadge />
                    </View>
                </View>
            </View>

            <View style={{ marginTop: 10 }}>
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: text, marginBottom: 3 }}>{post.title}</Text>
                {!!post.body && (
                    <LinkifiedText
                        text={post.body}
                        style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: subText, lineHeight: 17 }}
                        numberOfLines={!isLongBody || expanded ? undefined : 2}
                        onPress={isLongBody ? () => setExpanded((v) => !v) : undefined}
                    />
                )}
            </View>

            {post.attachmentUrl && post.attachmentName && post.attachmentType && (
                <View style={{ marginTop: 10 }}>
                    <AttachmentPreview url={post.attachmentUrl} name={post.attachmentName} type={post.attachmentType} />
                </View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                {isLongBody ? (
                    <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {expanded ? <ChevronUp size={12} color={subText} /> : <ChevronDown size={12} color={subText} />}
                        <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: subText }}>{expanded ? 'Show less' : 'Read more'}</Text>
                    </TouchableOpacity>
                ) : <View />}
                <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: subText, opacity: 0.7 }}>{formatDateTime(post.createdAt)}</Text>
            </View>
        </View>
    );
}

// ── Main Export ──────────────────────────────────────────────────────────────
// Exposed to campus.tsx so tapping the active Campus footer tab again — same
// as the Home tab's tap-to-refresh — scrolls this whole page back to the top
// and refetches the feed posts.
export type CampusFeedHandle = { scrollToTopAndRefresh: () => void };

export const CampusFeed = forwardRef<CampusFeedHandle>(function CampusFeed(_props, ref) {
    const { isDark, accent } = useTheme();
    const cardBg = isDark ? '#141414' : '#FFFFFF';
    const cardBorder = isDark ? '#2A2A2A' : '#EDE9FE';
    const text = isDark ? '#F1F5F9' : '#0F172A';
    const subText = isDark ? '#94A3B8' : '#64748B';

    const [myUserId, setMyUserId] = useState('');
    const [activeFilter, setActiveFilter] = useState<PostType | 'all'>('all');
    const [posts, setPosts] = useState<FeedPost[]>([]);
    const [loadingPosts, setLoadingPosts] = useState(true);
    const [postInput, setPostInput] = useState('');
    const [postType, setPostType] = useState<PostType | null>(null);
    const [typePickerOpen, setTypePickerOpen] = useState(false);
    const [postSubject, setPostSubject] = useState('');
    const [postBody, setPostBody] = useState('');
    // Bumped after every successful post to force the description TextInput
    // to remount — RN's multiline auto-grow doesn't reliably shrink its
    // native height back down just because the controlled value cleared, so
    // a fresh instance is the reliable way to reset it to minHeight.
    const [bodyInputKey, setBodyInputKey] = useState(0);
    const [posting, setPosting] = useState(false);
    const [postAttachment, setPostAttachment] = useState<{ url: string; name: string; type: string; mimeType: string } | null>(null);
    const [uploadingAttachment, setUploadingAttachment] = useState(false);
    const fetchedRef = useRef(false);

    const mainScrollRef = useRef<ScrollViewInstance | null>(null);
    const mainScrollYRef = useRef(0);
    const composerRef = useRef<ViewInstance | null>(null);

    // WhatsApp-style composer lift.
    //
    // The composer is the LAST thing in the page scroll, so on its own the
    // ScrollView physically cannot scroll any further than "composer bottom
    // at container bottom" — every scrollTo past that gets clamped, which is
    // why earlier attempts looked like nothing moved at all. So we first grow
    // the content by the keyboard's height (giving real room to scroll into),
    // and only once that taller content has laid out do we measure the
    // composer and scroll it so its BOTTOM sits just above the keyboard —
    // which puts the whole composer (title, subject, type picker,
    // description, attachment, send) in the visible strip above it.
    // Extra bottom padding is added ONLY as much as the scroll actually falls
    // short by — padding the full keyboard height would leave a dead gap the
    // user can scroll into, pushing the card away from the keyboard.
    const [kbPad, setKbPad] = useState(0);
    const kbHeightRef = useRef(0);
    const contentHRef = useRef(0);
    const containerHRef = useRef(0);
    const pendingScrollRef = useRef<number | null>(null);

    const runPendingScroll = useCallback(() => {
        const delta = pendingScrollRef.current;
        if (delta == null) return;
        pendingScrollRef.current = null;
        if (Math.abs(delta) > 2) {
            mainScrollRef.current?.scrollTo({
                y: Math.max(0, mainScrollYRef.current + delta),
                animated: true,
            });
        }
    }, []);

    // Re-measures the composer and re-pins it above the keyboard. Called both
    // when the keyboard first opens AND whenever the composer's own height
    // changes afterward (its description field grows as the user types) —
    // otherwise a growing composer pushes itself further down behind the
    // keyboard instead of the whole block staying anchored just above it.
    const pinComposer = useCallback(() => {
        const kb = kbHeightRef.current;
        if (!kb) return;
        composerRef.current?.measureInWindow((_x, y, _w, h) => {
            if (!h) return;
            // Composer's bottom edge should land 8px above the keyboard,
            // without pushing its own top off the top of the screen.
            const target = Math.max(60, SCREEN_HEIGHT - kb - h - 8);
            const delta = y - target;
            // How much further the scroll can already travel on its own.
            const roomLeft = Math.max(0, contentHRef.current - containerHRef.current - mainScrollYRef.current);
            const shortfall = Math.max(0, Math.ceil(delta - roomLeft));
            pendingScrollRef.current = delta;
            if (shortfall > 0) {
                setKbPad(shortfall);
                // onContentSizeChange fires once the padding lands; this
                // is just a safety net if it doesn't.
                setTimeout(runPendingScroll, 160);
            } else {
                runPendingScroll();
            }
        });
    }, [runPendingScroll]);

    useEffect(() => {
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const show = Keyboard.addListener(showEvt, (e) => {
            kbHeightRef.current = e.endCoordinates?.height ?? 0;
            pinComposer();
        });
        const hide = Keyboard.addListener(hideEvt, () => {
            kbHeightRef.current = 0;
            pendingScrollRef.current = null;
            setKbPad(0);
        });
        return () => { show.remove(); hide.remove(); };
    }, [pinComposer]);

    // Scroll-to-top button inside the posts area — exact copy of the student
    // app's feed panel behavior.
    const [showScrollTop, setShowScrollTop] = useState(false);
    const postsScrollRef = useRef<ScrollViewInstance | null>(null);
    // Tracks where the CURRENT gesture's finger first went down: inside the
    // posts list, or somewhere else on the page. Only finger-down matters —
    // never touch-end and never the scrolls' own events, because when the
    // posts list hits its top/bottom edge the drag hands off to the outer
    // page scroll mid-gesture, and anything derived from the inner scroll's
    // lifecycle flips at exactly that moment and closes the keyboard.
    // Every drag starts with a finger-down on one side or the other, so this
    // flag is always correct by the time the outer scroll begins dragging.
    const touchInsidePostsRef = useRef(false);
    const lastPostsScrollAtRef = useRef(0);

    // Refresh button in the panel header — same spin-while-loading treatment
    // as the student app's feed panel.
    const [isRefreshing, setIsRefreshing] = useState(false);
    const spinAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (!isRefreshing) return;
        let stopped = false;
        const runLoop = () => {
            if (stopped) return;
            spinAnim.setValue(0);
            Animated.timing(spinAnim, {
                toValue: 1,
                duration: 800,
                easing: Easing.linear,
                useNativeDriver: true,
            }).start(({ finished }) => {
                if (finished && !stopped) runLoop();
            });
        };
        runLoop();
        return () => { stopped = true; };
    }, [isRefreshing, spinAnim]);

    useEffect(() => {
        api.get('/teacher/me').then((res) => {
            setMyUserId(res.data.data?.userId ?? res.data.data?.user?.id ?? '');
        }).catch(() => {});
    }, []);

    const fetchPosts = useCallback(async (filter: PostType | 'all' = 'all') => {
        setLoadingPosts(true);
        try {
            const res = await api.get('/teacher/campus/feed/posts', {
                params: { limit: 50, ...(filter !== 'all' ? { type: filter } : {}) },
            });
            setPosts(res.data.data);
        } catch {
            // silent
        } finally {
            setLoadingPosts(false);
        }
    }, []);

    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;
        fetchPosts();
    }, [fetchPosts]);

    const handleFilterChange = (f: PostType | 'all') => { setActiveFilter(f); fetchPosts(f); };

    const handleRefresh = async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        await fetchPosts(activeFilter);
        setIsRefreshing(false);
    };

    // No deps array — re-created every render so the closure always sees the
    // latest handleRefresh/activeFilter, same reasoning as elsewhere in this
    // file that trades a little re-work for never going stale.
    useImperativeHandle(ref, () => ({
        scrollToTopAndRefresh: () => {
            mainScrollRef.current?.scrollTo({ y: 0, animated: true });
            postsScrollRef.current?.scrollTo({ y: 0, animated: true });
            handleRefresh();
        },
    }));

    const handlePickAttachment = async () => {
        const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        if (asset.size && asset.size > 15 * 1024 * 1024) {
            Alert.alert('File too large', 'Please pick a file under 15MB.');
            return;
        }
        setUploadingAttachment(true);
        try {
            const form = new FormData();
            form.append('file', { uri: asset.uri, name: asset.name ?? 'file', type: asset.mimeType ?? 'application/octet-stream' } as unknown as Blob);
            const res = await api.post('/teacher/campus/feed/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
            setPostAttachment(res.data.data);
        } catch {
            Alert.alert('Error', 'Upload failed');
        } finally {
            setUploadingAttachment(false);
        }
    };

    const handlePost = async () => {
        if (!postInput.trim() || !postType) return;
        setPosting(true);
        try {
            const res = await api.post('/teacher/campus/feed/posts', {
                type: postType.toUpperCase(),
                title: postInput.trim(),
                body: postBody.trim(),
                subject: postSubject.trim() || undefined,
                ...(postAttachment ? {
                    attachmentUrl: postAttachment.url,
                    attachmentType: postAttachment.mimeType,
                    attachmentName: postAttachment.name,
                } : {}),
            });
            setPosts((prev) => [res.data.data, ...prev]);
            setPostInput(''); setPostBody(''); setPostSubject(''); setPostAttachment(null); setPostType(null);
            setBodyInputKey((k) => k + 1);
        } catch {
            Alert.alert('Error', 'Failed to post');
        } finally {
            setPosting(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/teacher/campus/feed/posts/${id}`);
            setPosts((prev) => prev.filter((p) => p.id !== id));
        } catch {
            Alert.alert('Error', 'Failed to delete post');
        }
    };

    const filtered = activeFilter === 'all' ? posts : posts.filter((p) => p.type === activeFilter);
    // No type selected yet at composer start — selection is mandatory before
    // posting, so the button shows a neutral empty/unselected state until then.
    const typePickerColors = postType
        ? (isDark ? POST_META_DARK[postType] : { bg: POST_META[postType].bg, text: POST_META[postType].text })
        : { bg: isDark ? '#1E1E1E' : '#F1F5F9', text: subText };

    return (
        <ScrollView
            ref={mainScrollRef}
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={[styles.scrollContent, kbPad > 0 && { paddingBottom: 10 + kbPad }]}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="none"
            onScrollBeginDrag={() => {
                // Dragging the page itself dismisses the keyboard — but NOT
                // when the drag started inside the posts list (at its top/bottom
                // edge the gesture hands off to this outer scroll, which would
                // otherwise close the keyboard mid-scroll).
                // Second guard, independent of touch tracking: if the posts
                // list itself was scrolling a moment ago, this outer drag is
                // just the tail of that same gesture spilling over the posts
                // list's edge — not the user grabbing the page.
                const postsJustScrolled = Date.now() - lastPostsScrollAtRef.current < 400;
                if (!touchInsidePostsRef.current && !postsJustScrolled) Keyboard.dismiss();
            }}
            onScroll={(e) => { mainScrollYRef.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
            onLayout={(e) => { containerHRef.current = e.nativeEvent.layout.height; }}
            onContentSizeChange={(_w, h) => {
                contentHRef.current = h;
                // Fires right after the keyboard shortfall padding lands —
                // the exact moment there's finally room to scroll into.
                runPendingScroll();
            }}
        >
            {/* Calendar — shown first, matching student app's feed order */}
            <View onTouchStart={() => { touchInsidePostsRef.current = false; }}>
                <AcademicCalendar />
            </View>

            {/* Announcements & Feed panel — fixed height like the student app's
                feed panel: header/filters stay put, posts scroll inside. */}
            <View style={[styles.panelWrap, { position: 'relative' }]}>
                <View style={[styles.panelCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <View
                        style={[styles.panelHeader, { borderBottomColor: cardBorder }]}
                        onTouchStart={() => { touchInsidePostsRef.current = false; }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: text }}>📢 Announcements & Feed</Text>
                            <TouchableOpacity onPress={handleRefresh} activeOpacity={0.7} disabled={isRefreshing || loadingPosts}>
                                <Animated.View style={{ transform: [{ rotate: spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
                                    <RefreshCw size={16} color={subText} />
                                </Animated.View>
                            </TouchableOpacity>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ marginTop: 10, gap: 6 }}>
                            {FILTERS.map((tab) => {
                                const isActive = activeFilter === tab.key;
                                return (
                                    <TouchableOpacity
                                        key={tab.key}
                                        onPress={() => handleFilterChange(tab.key)}
                                        style={[
                                            styles.filterChip,
                                            { borderColor: cardBorder },
                                            isActive && { backgroundColor: accent.purple, borderColor: accent.purple },
                                        ]}
                                    >
                                        <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: isActive ? '#fff' : subText }}>
                                            {tab.emoji} {tab.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>

                    <View style={{ position: 'relative' }}>
                        <ScrollView
                            ref={postsScrollRef}
                            onTouchStart={() => { touchInsidePostsRef.current = true; }}
                            style={styles.panelPostsScroll}
                            contentContainerStyle={{ paddingHorizontal: 11, paddingTop: 10, paddingBottom: 10, gap: 12, flexGrow: 1 }}
                            nestedScrollEnabled
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="none"
                            onScroll={(e) => {
                                lastPostsScrollAtRef.current = Date.now();
                                setShowScrollTop(e.nativeEvent.contentOffset.y > 200);
                            }}
                            scrollEventThrottle={16}
                        >
                            {loadingPosts ? (
                                <ActivityIndicator color={accent.purple} style={{ marginVertical: 20 }} />
                            ) : filtered.length === 0 ? (
                                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 32 }}>
                                    <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: subText }}>No posts yet</Text>
                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: subText, marginTop: 3, opacity: 0.7 }}>Write the first announcement below</Text>
                                </View>
                            ) : (
                                filtered.map((post) => <FeedCard key={post.id} post={post} myUserId={myUserId} onDelete={handleDelete} />)
                            )}
                        </ScrollView>

                        {showScrollTop && (
                            <View pointerEvents="box-none" style={{ position: 'absolute', bottom: 8, left: 0, right: 0, alignItems: 'center', zIndex: 20 }}>
                                <TouchableOpacity
                                    style={[styles.scrollTopBtn, { backgroundColor: cardBg, borderColor: cardBorder }]}
                                    onPress={() => postsScrollRef.current?.scrollTo({ y: 0, animated: true })}
                                    activeOpacity={0.8}
                                >
                                    <ArrowUp size={16} color={text} />
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    {/* Composer — attached to the same card, right below the
                        fixed-height posts area, since teachers (unlike
                        students) can post here */}
                    <View
                        ref={composerRef}
                        style={[styles.composer, { borderTopColor: cardBorder }]}
                        onTouchStart={() => { touchInsidePostsRef.current = true; }}
                        onLayout={() => { if (kbHeightRef.current) pinComposer(); }}
                    >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={[styles.composerRow, { flex: 1, backgroundColor: isDark ? '#1E1E1E' : '#F8FAFC', borderColor: cardBorder }]}>
                            <TextInput
                                value={postInput}
                                onChangeText={setPostInput}
                                placeholder="Title..."
                                placeholderTextColor={subText}
                                style={[styles.composerTitleInput, { color: text }]}
                            />
                            <TextInput
                                value={postSubject}
                                onChangeText={setPostSubject}
                                placeholder="Subject (optional)"
                                placeholderTextColor={subText}
                                style={[styles.composerSubjectInput, { color: subText }]}
                            />
                        </View>

                        {/* Type picker — a single button instead of 4 always-visible
                            chips, to save space; sits outside the title/subject box,
                            dropdown opens upward so it doesn't get clipped below */}
                        <View style={{ position: 'relative' }}>
                            <TouchableOpacity
                                onPress={() => setTypePickerOpen((v) => !v)}
                                style={[styles.typePickerBtn, { borderColor: postType ? typePickerColors.text : cardBorder, backgroundColor: typePickerColors.bg }]}
                            >
                                {postType
                                    ? <Text style={{ fontSize: 13 }}>{POST_META[postType].emoji}</Text>
                                    : <Tag size={13} color={subText} />}
                                {typePickerOpen
                                    ? <ChevronUp size={11} color={typePickerColors.text} />
                                    : <ChevronDown size={11} color={typePickerColors.text} />}
                            </TouchableOpacity>
                            {typePickerOpen && (
                                <View style={[styles.typePickerDropdown, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                                    {(['announcement', 'notice', 'material', 'result'] as PostType[]).map((type) => {
                                        const meta = POST_META[type];
                                        const metaColors = isDark ? POST_META_DARK[type] : { bg: meta.bg, text: meta.text };
                                        const active = postType === type;
                                        return (
                                            <TouchableOpacity
                                                key={type}
                                                onPress={() => { setPostType(type); setTypePickerOpen(false); }}
                                                style={[styles.typePickerOption, active && { backgroundColor: metaColors.bg }]}
                                            >
                                                <Text style={{ fontSize: 13 }}>{meta.emoji}</Text>
                                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: active ? metaColors.text : text }}>{meta.label}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8 }}>
                        <View style={[styles.composerBodyWrap, { flex: 1, marginTop: 0, backgroundColor: isDark ? '#1E1E1E' : '#F8FAFC', borderColor: cardBorder }]}>
                            <TextInput
                                key={bodyInputKey}
                                value={postBody}
                                onChangeText={setPostBody}
                                placeholder="Write description (optional)..."
                                placeholderTextColor={subText}
                                multiline
                                scrollEnabled
                                style={[styles.composerBodyInput, { color: subText }]}
                            />
                        </View>
                        <TouchableOpacity onPress={handlePickAttachment} disabled={uploadingAttachment} style={[styles.iconBtn, { borderColor: cardBorder }]}>
                            <Paperclip size={15} color={subText} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handlePost}
                            disabled={!postInput.trim() || !postType || posting || uploadingAttachment}
                            style={[styles.sendBtn, { opacity: (!postInput.trim() || !postType || posting || uploadingAttachment) ? 0.4 : 1 }]}
                        >
                            {posting ? <ActivityIndicator size="small" color="#fff" /> : <Send size={14} color="#fff" />}
                        </TouchableOpacity>
                    </View>

                    {uploadingAttachment && (
                        <View style={styles.attachmentPill}>
                            <ActivityIndicator size="small" color={subText} />
                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: subText }}>Uploading...</Text>
                        </View>
                    )}
                    {postAttachment && !uploadingAttachment && (
                        <View style={styles.attachmentPill}>
                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: subText, flex: 1 }} numberOfLines={1}>📎 {postAttachment.name}</Text>
                            <TouchableOpacity onPress={() => setPostAttachment(null)}>
                                <X size={11} color={subText} />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>
            </View>
        </ScrollView>
    );
});

const styles = StyleSheet.create({
    scrollContent: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 8, gap: 14 },
    // Shadow lives on a non-clipping wrapper (matches student app's
    // feedPanelWrap) — overflow:'hidden' on panelCard itself (needed to round
    // the scrolling content) also clips iOS shadows, so it sits one level up.
    panelWrap: { borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 18, elevation: 10 },
    scrollTopBtn: { width: 36, height: 36, borderRadius: 99, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 6 },
    // Card auto-sizes to header + fixed-height posts scroller + composer, all
    // in one attached card — only the posts area itself has a fixed height.
    panelCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
    panelHeader: { padding: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    panelPostsScroll: { height: 410 },
    filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1 },
    feedCard: { borderRadius: 16, borderWidth: 1, padding: 12 },
    postBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 },
    avatarCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatarImg: { width: '100%', height: '100%' },
    avatarInitials: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#fff' },
    composer: { paddingHorizontal: 6, paddingTop: 6, paddingBottom: 6, borderTopWidth: StyleSheet.hairlineWidth },
    composerRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, height: 38 },
    composerTitleInput: {
        flex: 1,
        fontSize: Platform.OS === 'android' ? 11.5 : 12.5,
        fontFamily: 'Poppins_600SemiBold',
        ...(Platform.OS === 'android' ? { textAlignVertical: 'center', includeFontPadding: false, paddingTop: 0, paddingBottom: 0 } : null),
    },
    composerSubjectInput: {
        width: 110,
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'right',
        ...(Platform.OS === 'android' ? { textAlignVertical: 'center', includeFontPadding: false, paddingTop: 0, paddingBottom: 0 } : null),
    },
    typePickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 30, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1 },
    typePickerDropdown: { position: 'absolute', bottom: 36, right: 0, borderRadius: 12, borderWidth: 1, paddingVertical: 4, minWidth: 140, zIndex: 20, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 8 },
    typePickerOption: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
    composerBodyWrap: { borderRadius: 12, borderWidth: 1, marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, minHeight: 50 },
    composerBodyInput: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', lineHeight: 16, minHeight: 40, maxHeight: 80, textAlignVertical: 'top' },
    attachmentPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(148,163,184,0.15)' },
    iconBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    sendBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DA7756' },
    // Exact copy of the student app's MiniCalendar card — plain neutral shadow,
    // 20px radius, 16px padding — instead of teacher's old header+content split.
    calCard: { borderRadius: 20, borderWidth: 1, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 18, elevation: 10 },
    calCardTitle: { fontSize: 14, fontFamily: 'Poppins_700Bold' },
    calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    calNavBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1 },
    calMonthLabel: { fontSize: 15, fontFamily: 'Poppins_700Bold' },
    calDayHeaderRow: { flexDirection: 'row', marginBottom: 4, width: CELL_SIZE * 7, alignSelf: 'center' },
    calDayLabel: { width: CELL_SIZE, textAlign: 'center', fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
    calGrid: { flexDirection: 'row', flexWrap: 'wrap', width: CELL_SIZE * 7, alignSelf: 'center' },
    calGridCell: { width: CELL_SIZE, height: CELL_SIZE, alignItems: 'center', justifyContent: 'center', position: 'relative' },
    calDateNum: { fontSize: 12, lineHeight: 16 },
    calDotRow: { position: 'absolute', bottom: 3, flexDirection: 'row', gap: 2 },
    calEventDot: { width: 8, height: 8, borderRadius: 99 },
    calLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 12, marginTop: 10, borderTopWidth: 1 },
    calLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    calLegendDot: { width: 8, height: 8, borderRadius: 99 },
    calLegendText: { fontSize: 10, fontFamily: 'Poppins_400Regular' },
    calOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    calModalCard: { width: '100%', borderRadius: 24, padding: 20, gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 12 },
    calModalDateTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold' },
    calModalEventRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderLeftWidth: 4 },
    calModalEventType: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', opacity: 0.75 },
    calModalEventLabel: { fontSize: 13, fontFamily: 'Poppins_700Bold' },
    calModalCloseBtn: { alignItems: 'center', paddingVertical: 12, borderRadius: 14, marginTop: 4 },
});
