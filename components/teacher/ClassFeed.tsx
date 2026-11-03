import { AttachmentPreview } from '@/components/AttachmentPreview';
import { LinkifiedText } from '@/components/LinkifiedText';
import { useTheme } from '@/context/ThemeContext';
import { formatDisplayName, resolveDisplayTitle } from '@/lib/displayName';
import api from '@/lib/api';
import * as DocumentPicker from 'expo-document-picker';
import { ArrowUp, ChevronDown, ChevronUp, Megaphone, Paperclip, RefreshCw, Send, Tag, X } from 'lucide-react-native';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Easing,
    Keyboard,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import type { ScrollViewInstance, ViewInstance } from 'react-native';
import type { MutableRefObject, RefObject } from 'react';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
import Svg, { Path } from 'react-native-svg';

// ── Types — same shape as qubeex-web's ViewTab.tsx DivAnnouncement ─────────────
type PostType = 'announcement' | 'notice' | 'material' | 'result';
interface FeedPost {
    id: string; type: PostType;
    author: { id: string; name: string; role: string; avatarUrl?: string | null; prefix?: string | null; title?: string | null };
    subject?: string | null; subjectId?: string | null;
    title: string; body: string; createdAt: string;
    attachmentUrl?: string | null; attachmentType?: string | null; attachmentName?: string | null;
}

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
// The class's own scoped feed — same backend (`/teacher/campus/feed/posts`
// and `/feed/events`) as the school-wide Campus tab feed (CampusFeed.tsx),
// just filtered/tagged with this division's id, matching qubeex-web's
// ViewTab.tsx feed panel. Kept as its own component (rather than reusing
// CampusFeed directly) since the composer here picks a real subject from
// this division's subject list instead of freeform text, and there's no
// embedded calendar — the class detail screen renders ClassCalendar
// separately, in its own card, like the web page does.
type ClassFeedProps = {
    divisionId: string;
    divisionName: string;
    subjects: { id: string; name: string }[];
    // The screen that hosts this card owns the real page ScrollView (this
    // card is just one of several sections in it — Subject Teachers,
    // Leaderboard, Timetable, Calendar all come after it), so the WhatsApp-
    // style "lift composer above keyboard" trick has to scroll THAT view
    // instead of one this component owns itself, unlike CampusFeed.tsx where
    // the feed IS the whole page's scroll.
    mainScrollRef: RefObject<ScrollViewInstance | null>;
    mainScrollYRef: MutableRefObject<number>;
    mainContentHRef: MutableRefObject<number>;
    mainContainerHRef: MutableRefObject<number>;
    setKbPad: (v: number) => void;
    // Set for a subject-teacher (their own subjectId) — mirrors web's
    // ViewTab.tsx restrictToSubjectId: the composer's subject locks to this
    // one subject (shown as plain text, not a picker) instead of defaulting
    // to General with a free choice of any subject in the division.
    restrictToSubjectId?: string | null;
};

export type ClassFeedHandle = {
    // Used by the Materials/Results cards below the feed: switches the feed's
    // own filter chip to the matching type and scrolls its post list back to
    // top, so tapping "open in feed" on a material/result surfaces it without
    // the caller needing to know about individual post positions.
    jumpToType: (type: PostType) => void;
};

export const ClassFeed = forwardRef<ClassFeedHandle, ClassFeedProps>(function ClassFeed(
    { divisionId, divisionName, subjects, mainScrollRef, mainScrollYRef, mainContentHRef, mainContainerHRef, setKbPad, restrictToSubjectId },
    ref
) {
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
    const [postSubjectId, setPostSubjectId] = useState<string>(restrictToSubjectId ?? '');
    const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
    const [postBody, setPostBody] = useState('');
    const [bodyInputKey, setBodyInputKey] = useState(0);
    const [posting, setPosting] = useState(false);
    const [postAttachment, setPostAttachment] = useState<{ url: string; name: string; type: string; mimeType: string } | null>(null);
    const [uploadingAttachment, setUploadingAttachment] = useState(false);
    const fetchedRef = useRef(false);

    const composerRef = useRef<ViewInstance | null>(null);
    const kbHeightRef = useRef(0);
    const pendingScrollRef = useRef<number | null>(null);

    // Same WhatsApp-style composer lift as CampusFeed.tsx: grow the page
    // scroll's content by however much it falls short, then scroll it so the
    // composer's bottom edge lands just above the keyboard. See CampusFeed's
    // pinComposer for the full reasoning — this is the same algorithm, just
    // aimed at the parent screen's ScrollView (passed in via props) instead
    // of one this component owns.
    const runPendingScroll = useCallback(() => {
        const delta = pendingScrollRef.current;
        if (delta == null) return;
        pendingScrollRef.current = null;
        if (Math.abs(delta) > 2) {
            mainScrollRef.current?.scrollTo({ y: Math.max(0, mainScrollYRef.current + delta), animated: true });
        }
    }, [mainScrollRef, mainScrollYRef]);

    const pinComposer = useCallback(() => {
        const kb = kbHeightRef.current;
        if (!kb) return;
        composerRef.current?.measureInWindow((_x, y, _w, h) => {
            if (!h) return;
            const target = Math.max(60, SCREEN_HEIGHT - kb - h - 8);
            const delta = y - target;
            const roomLeft = Math.max(0, mainContentHRef.current - mainContainerHRef.current - mainScrollYRef.current);
            const shortfall = Math.max(0, Math.ceil(delta - roomLeft));
            pendingScrollRef.current = delta;
            if (shortfall > 0) {
                setKbPad(shortfall);
                setTimeout(runPendingScroll, 160);
            } else {
                runPendingScroll();
            }
        });
    }, [mainContainerHRef, mainContentHRef, mainScrollYRef, runPendingScroll, setKbPad]);

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
    }, [pinComposer, setKbPad]);

    const [showScrollTop, setShowScrollTop] = useState(false);
    const postsScrollRef = useRef<ScrollViewInstance | null>(null);

    const [isRefreshing, setIsRefreshing] = useState(false);
    const spinAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (!isRefreshing) return;
        let stopped = false;
        const runLoop = () => {
            if (stopped) return;
            spinAnim.setValue(0);
            Animated.timing(spinAnim, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true })
                .start(({ finished }) => { if (finished && !stopped) runLoop(); });
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
                params: { divisionId, limit: 50, ...(filter !== 'all' ? { type: filter } : {}) },
            });
            setPosts(res.data.data);
        } catch {
            // silent
        } finally {
            setLoadingPosts(false);
        }
    }, [divisionId]);

    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;
        fetchPosts();
    }, [fetchPosts]);

    const handleFilterChange = (f: PostType | 'all') => { setActiveFilter(f); fetchPosts(f); };

    useImperativeHandle(ref, () => ({
        jumpToType: (type: PostType) => {
            handleFilterChange(type);
            postsScrollRef.current?.scrollTo({ y: 0, animated: true });
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);

    const handleRefresh = async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        await fetchPosts(activeFilter);
        setIsRefreshing(false);
    };

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
                divisionId,
                subjectId: postSubjectId || undefined,
                ...(postAttachment ? {
                    attachmentUrl: postAttachment.url,
                    attachmentType: postAttachment.mimeType,
                    attachmentName: postAttachment.name,
                } : {}),
            });
            setPosts((prev) => [res.data.data, ...prev]);
            setPostInput(''); setPostBody(''); setPostSubjectId(restrictToSubjectId ?? ''); setPostAttachment(null); setPostType(null);
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
    const typePickerColors = postType
        ? (isDark ? POST_META_DARK[postType] : { bg: POST_META[postType].bg, text: POST_META[postType].text })
        : { bg: isDark ? '#1E1E1E' : '#F1F5F9', text: subText };
    const selectedSubjectName = subjects.find((s) => s.id === postSubjectId)?.name ?? 'General';

    return (
        <View style={[styles.panelWrap, { position: 'relative' }]}>
            <View style={[styles.panelCard, styles.panelCardTop, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <View style={[styles.panelHeader, { borderBottomColor: cardBorder }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Megaphone size={16} color={text} style={Platform.OS === 'android' ? { marginTop: -1 } : undefined} />
                            <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: text }}>{divisionName} Announcements & Feed</Text>
                        </View>
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
                        style={styles.panelPostsScroll}
                        contentContainerStyle={{ paddingHorizontal: 11, paddingTop: 10, paddingBottom: 10, gap: 12, flexGrow: 1 }}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        onScroll={(e) => setShowScrollTop(e.nativeEvent.contentOffset.y > 200)}
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
            </View>

            {/* Composer — deliberately a sibling of panelCard (not nested inside
                it) so its subject/type dropdowns, which pop upward past the
                composer's own bounds, aren't clipped by panelCard's
                overflow:'hidden' (that clipping is what rounds off the card's
                top corners over the scrollable post list). Styled to look like
                a seamless continuation of the card below it. */}
            <View
                ref={composerRef}
                onLayout={() => { if (kbHeightRef.current) pinComposer(); }}
                style={[styles.composer, styles.panelCardBottom, { backgroundColor: cardBg, borderColor: cardBorder }]}
            >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ flex: 1, position: 'relative' }}>
                            <View style={[styles.composerRow, { backgroundColor: isDark ? '#1E1E1E' : '#F8FAFC', borderColor: cardBorder }]}>
                                <TextInput
                                    value={postInput}
                                    onChangeText={setPostInput}
                                    placeholder="Title..."
                                    placeholderTextColor={subText}
                                    style={[styles.composerTitleInput, { color: text }]}
                                />
                                {restrictToSubjectId ? (
                                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: subText }} numberOfLines={1}>{selectedSubjectName}</Text>
                                ) : (
                                    <TouchableOpacity onPress={() => setSubjectPickerOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: subText }} numberOfLines={1}>{selectedSubjectName}</Text>
                                        {subjectPickerOpen ? <ChevronUp size={11} color={subText} /> : <ChevronDown size={11} color={subText} />}
                                    </TouchableOpacity>
                                )}
                            </View>
                            {!restrictToSubjectId && subjectPickerOpen && (
                                <View style={[styles.subjectPickerDropdown, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                    <TouchableOpacity
                                        onPress={() => { setPostSubjectId(''); setSubjectPickerOpen(false); }}
                                        style={styles.typePickerOption}
                                    >
                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: text }}>General (no subject)</Text>
                                    </TouchableOpacity>
                                    {subjects.map((s) => (
                                        <TouchableOpacity
                                            key={s.id}
                                            onPress={() => { setPostSubjectId(s.id); setSubjectPickerOpen(false); }}
                                            style={styles.typePickerOption}
                                        >
                                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: text }}>{s.name}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                                </View>
                            )}
                        </View>

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
    );
});

const styles = StyleSheet.create({
    panelWrap: { borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 18, elevation: 10 },
    scrollTopBtn: { width: 36, height: 36, borderRadius: 99, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 6 },
    panelCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
    // panelCard keeps its rounded top corners + clipping for the scrollable
    // post list; the bottom border/radius move to the composer below (see
    // panelCardBottom) since the composer is now rendered as panelCard's
    // sibling rather than its child.
    panelCardTop: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0 },
    panelCardBottom: { borderBottomLeftRadius: 20, borderBottomRightRadius: 20, borderWidth: 1, borderTopWidth: 0 },
    panelHeader: { padding: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    panelPostsScroll: { height: 410 },
    filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1 },
    feedCard: { borderRadius: 16, borderWidth: 1, padding: 12 },
    postBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 },
    avatarCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatarImg: { width: '100%', height: '100%' },
    avatarInitials: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#fff' },
    composer: { paddingHorizontal: 6, paddingTop: 6, paddingBottom: 6 },
    composerRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, height: 38 },
    composerTitleInput: {
        flex: 1,
        fontSize: Platform.OS === 'android' ? 11.5 : 12.5,
        fontFamily: 'Poppins_600SemiBold',
        ...(Platform.OS === 'android' ? { textAlignVertical: 'center', includeFontPadding: false, paddingTop: 0, paddingBottom: 0 } : null),
    },
    typePickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 30, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1 },
    typePickerDropdown: { position: 'absolute', bottom: 36, right: 0, borderRadius: 12, borderWidth: 1, paddingVertical: 4, minWidth: 140, zIndex: 20, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 8 },
    subjectPickerDropdown: { position: 'absolute', bottom: '100%', marginBottom: 6, right: 0, borderRadius: 12, borderWidth: 1, paddingVertical: 4, minWidth: 160, maxHeight: 180, zIndex: 20, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 8 },
    typePickerOption: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
    composerBodyWrap: { borderRadius: 12, borderWidth: 1, marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, minHeight: 50 },
    composerBodyInput: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', lineHeight: 16, minHeight: 40, maxHeight: 80, textAlignVertical: 'top' },
    attachmentPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(148,163,184,0.15)' },
    iconBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    sendBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DA7756' },
});
