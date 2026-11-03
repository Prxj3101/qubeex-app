import { AttachmentPreview } from '@/components/AttachmentPreview';
import { LinkifiedText } from '@/components/LinkifiedText';
import { useTheme } from '@/context/ThemeContext';
import { formatDisplayName, resolveDisplayTitle } from '@/lib/displayName';
import api from '@/lib/api';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
    ArrowDown,
    ChevronLeft,
    Copy,
    Image as ImageIcon,
    MessageCircle,
    MessageSquare,
    MoreVertical,
    Paperclip,
    Search,
    Send,
    ThumbsUp,
    Trash2,
    User,
    Users,
    X,
} from 'lucide-react-native';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ActivityIndicator,
    Alert,
    Animated,
    BackHandler,
    Dimensions,
    PanResponder,
    FlatList,
    Image,
    Keyboard,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import type { ScrollViewInstance, ViewInstance } from 'react-native';

// ── Types ────────────────────────────────────────────────────────────────────
interface PostAuthor { id: string; name: string; role: 'ADMIN' | 'TEACHER'; avatarUrl?: string | null; prefix?: string | null; title?: string | null; }
interface StaffroomPost {
    id: string; text: string;
    attachments: { url: string; type: string; name: string }[];
    createdAt: string; author: PostAuthor;
    likeCount: number; liked: boolean;
    comments: { id: string; text: string; createdAt: string; author: PostAuthor }[];
}
interface DmThread {
    teacherId: string; teacherUserId: string; name: string;
    avatarUrl: string | null; isActive: boolean;
    lastMessage: string | null; lastMessageAt: string | null;
    lastMessageIsMe: boolean; unread: number;
    prefix?: string | null; title?: string | null;
}
interface DmMessage {
    id: string; isMe: boolean; text: string | null;
    attachments: { url: string; type: string; name: string }[];
    createdAt: string;
}
interface PendingAttachment { url: string; name: string; type: 'image' | 'file'; localUri?: string; }

// ── Helpers ──────────────────────────────────────────────────────────────────
const UNSEND_WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTACHMENTS = 10;
function canUnsend(msg: DmMessage) { return msg.isMe && Date.now() - new Date(msg.createdAt).getTime() < UNSEND_WINDOW_MS; }
const AVATAR_COLORS = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626'];
function getAvatarColor(id: string) { return AVATAR_COLORS[id.charCodeAt(id.length - 1) % AVATAR_COLORS.length]; }
function getInitials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase(); }

// WhatsApp-style oversized emoji: a message that's only emoji (up to a
// handful of them, no other text) renders much bigger than normal text.
const EMOJI_ONLY_REGEX = /^[\p{Extended_Pictographic}‍️\s]+$/u;
function isEmojiOnlyMessage(text: string) {
    if (!text || !text.trim()) return false;
    return EMOJI_ONLY_REGEX.test(text.trim());
}
function fmtTime(iso: string) {
    const d = new Date(iso); const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function fmtDateTime(iso: string) {
    const d = new Date(iso); const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 0) return `Today, ${time}`;
    if (diffDays === 1) return `Yesterday, ${time}`;
    return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${time}`;
}

async function pickAttachment(kind: 'any' | 'image'): Promise<{ uri: string; name: string; mimeType: string } | null> {
    const result = await DocumentPicker.getDocumentAsync({
        type: kind === 'image' ? 'image/*' : '*/*',
        copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    if (asset.size && asset.size > 15 * 1024 * 1024) {
        Alert.alert('File too large', 'Please pick a file under 15MB.');
        return null;
    }
    return { uri: asset.uri, name: asset.name ?? 'file', mimeType: asset.mimeType ?? 'application/octet-stream' };
}

// Multi-select variant — only used for images in the announcement composer.
// Uses the Photos library picker (expo-image-picker), not the Files browser
// (DocumentPicker), since "pick an image" should open Photos on iOS just
// like every other image-attach button in the app.
async function pickMultipleImages(): Promise<{ uri: string; name: string; mimeType: string }[]> {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
        Alert.alert('Permission needed', 'Please allow photo library access to attach images.');
        return [];
    }
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.9,
    });
    if (result.canceled || !result.assets?.length) return [];
    const picked: { uri: string; name: string; mimeType: string }[] = [];
    for (const asset of result.assets) {
        if (asset.fileSize && asset.fileSize > 15 * 1024 * 1024) continue;
        picked.push({
            uri: asset.uri,
            name: asset.fileName ?? asset.uri.split('/').pop() ?? 'image.jpg',
            mimeType: asset.mimeType ?? 'image/jpeg',
        });
    }
    if (picked.length < result.assets.length) {
        Alert.alert('Some files skipped', 'Files over 15MB were skipped.');
    }
    return picked;
}

// ── Attachment chip (composer preview) ───────────────────────────────────────
function AttachmentChip({ attachment, onRemove }: { attachment: PendingAttachment; onRemove: () => void }) {
    const { isDark } = useTheme();
    const isImage = attachment.type === 'image';
    if (isImage) {
        // Small thumbnail preview above the composer, instead of just a
        // name chip, so the user can see what they're about to send. Prefer
        // the local file URI — it's instant — over the remote uploaded URL.
        return (
            <View style={styles.attachImagePreviewWrap}>
                <Image source={{ uri: attachment.localUri || attachment.url }} style={styles.attachImagePreview} />
                <TouchableOpacity onPress={onRemove} style={styles.attachImagePreviewRemove}>
                    <X size={11} color="#fff" />
                </TouchableOpacity>
            </View>
        );
    }
    return (
        <View style={[styles.attachChip, { backgroundColor: isDark ? '#1E1E1E' : '#F1F5F9' }]}>
            <MessageSquare size={12} color={isDark ? '#94A3B8' : '#64748B'} />
            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: isDark ? '#94A3B8' : '#64748B', flex: 1 }} numberOfLines={1}>{attachment.name}</Text>
            <TouchableOpacity onPress={onRemove}><X size={11} color={isDark ? '#94A3B8' : '#64748B'} /></TouchableOpacity>
        </View>
    );
}

// ── Staffroom Post Card ──────────────────────────────────────────────────────
function PostCard({ post, myUserId, onLike, onDelete, onAddComment, onDeleteComment }: {
    post: StaffroomPost; myUserId: string;
    onLike: (id: string) => void; onDelete: (id: string) => void;
    onAddComment: (postId: string, text: string) => Promise<void>;
    onDeleteComment: (postId: string, commentId: string) => void;
}) {
    const { isDark, accent } = useTheme();
    const text = isDark ? '#F1F5F9' : '#0F172A';
    const subText = isDark ? '#94A3B8' : '#64748B';
    const cardBg = isDark ? '#141414' : '#FFFFFF';
    const cardBorder = isDark ? '#2A2A2A' : '#EDE9FE';

    const [showComments, setShowComments] = useState(false);
    const [commentInput, setCommentInput] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    const isMe = post.author.id === myUserId;
    const avatarColor = post.author.role === 'ADMIN' ? accent.purple : getAvatarColor(post.author.id);

    const handleComment = async () => {
        if (!commentInput.trim() || submittingComment) return;
        setSubmittingComment(true);
        try { await onAddComment(post.id, commentInput.trim()); setCommentInput(''); }
        finally { setSubmittingComment(false); }
    };

    const confirmDelete = () => {
        Alert.alert('Delete post?', 'This post will be permanently deleted. Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => onDelete(post.id) },
        ]);
    };

    const postEmojiOnly = isEmojiOnlyMessage(post.text) && !post.attachments?.length;

    return (
        <View style={{ flexDirection: isMe ? 'row-reverse' : 'row', gap: 8, marginBottom: 14 }}>
            <View style={[styles.miniAvatar, { backgroundColor: post.author.avatarUrl ? 'transparent' : avatarColor }]}>
                {post.author.avatarUrl
                    ? <Image source={{ uri: post.author.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                    : <Text style={styles.miniAvatarText}>{getInitials(post.author.name)}</Text>}
            </View>
            <View style={{ flex: 1, alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '84%' }}>
                <View style={{ flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: text }}>{formatDisplayName(post.author.name, post.author.prefix)}</Text>
                    <View style={[styles.roleTag, { backgroundColor: post.author.role === 'ADMIN' ? accent.purpleLight : (isDark ? '#1E1E1E' : '#F1F5F9') }]}>
                        <Text style={{ fontSize: 8, fontFamily: 'Poppins_700Bold', color: post.author.role === 'ADMIN' ? accent.purple : subText }}>
                            {resolveDisplayTitle(post.author.role, post.author.title)}
                        </Text>
                    </View>
                    <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: subText }}>{fmtDateTime(post.createdAt)}</Text>
                    {isMe && (
                        <TouchableOpacity onPress={confirmDelete} style={{ padding: 2 }}>
                            <Trash2 size={11} color={subText} />
                        </TouchableOpacity>
                    )}
                </View>
                <View style={
                    postEmojiOnly
                        ? { paddingHorizontal: 2, paddingVertical: 2 }
                        : [styles.bubble, isMe ? { backgroundColor: '#E8CBB5', borderTopRightRadius: 4 } : { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1, borderTopLeftRadius: 4 }]
                }>
                    {!!post.text && (
                        <LinkifiedText
                            text={post.text}
                            style={postEmojiOnly
                                ? { fontSize: 40, lineHeight: 48 }
                                : { fontSize: 14.5, color: isMe ? '#3A322C' : text, lineHeight: 19.5 }}
                            linkStyle={{ color: isMe ? '#3A322C' : accent.purple, textDecorationLine: 'underline' }}
                        />
                    )}
                    {post.attachments?.length > 0 && (
                        <View style={{ marginTop: post.text ? 6 : 0, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {post.attachments.map((att, i) => (
                                <AttachmentPreview key={i} url={att.url} name={att.name} type={att.type} />
                            ))}
                        </View>
                    )}
                </View>
                <View style={{ flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                    <TouchableOpacity onPress={() => onLike(post.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <ThumbsUp size={12} color={post.liked ? '#3B82F6' : subText} fill={post.liked ? '#3B82F6' : 'none'} />
                        {post.likeCount > 0 && <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: post.liked ? '#3B82F6' : subText }}>{post.likeCount}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowComments((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <MessageCircle size={12} color={subText} />
                        {post.comments.length > 0 && <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: subText }}>{post.comments.length}</Text>}
                    </TouchableOpacity>
                </View>

                {showComments && (
                    <View style={{ width: '100%', marginTop: 8, gap: 6 }}>
                        {post.comments.map((c) => (
                            <View key={c.id} style={{ flexDirection: isMe ? 'row-reverse' : 'row', gap: 6, alignItems: 'flex-start' }}>
                                <View style={[styles.tinyAvatar, { backgroundColor: c.author.role === 'ADMIN' ? accent.purpleLight : (isDark ? '#1E1E1E' : '#F1F5F9') }]}>
                                    <Text style={{ fontSize: 7, fontFamily: 'Poppins_700Bold', color: c.author.role === 'ADMIN' ? accent.purple : subText }}>{getInitials(c.author.name)}</Text>
                                </View>
                                <View style={{ backgroundColor: isDark ? '#1E1E1E' : '#F1F5F9', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '80%' }}>
                                    <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_600SemiBold', color: subText }}>{formatDisplayName(c.author.name, c.author.prefix)}</Text>
                                    <LinkifiedText text={c.text} style={{ fontSize: 11.5, color: text }} />
                                </View>
                                {c.author.id === myUserId && (
                                    <TouchableOpacity onPress={() => onDeleteComment(post.id, c.id)} style={{ padding: 4 }}>
                                        <Trash2 size={10} color={subText} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))}
                        <View style={{ flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>
                            <TextInput
                                value={commentInput}
                                onChangeText={setCommentInput}
                                placeholder="Reply..."
                                placeholderTextColor={subText}
                                onSubmitEditing={handleComment}
                                style={[styles.commentInput, { backgroundColor: isDark ? '#1E1E1E' : '#F1F5F9', color: text }]}
                            />
                            <TouchableOpacity onPress={handleComment} disabled={!commentInput.trim() || submittingComment} style={[styles.commentSendBtn, { opacity: (!commentInput.trim() || submittingComment) ? 0.4 : 1 }]}>
                                {submittingComment ? <ActivityIndicator size="small" color="#fff" /> : <Send size={11} color="#fff" />}
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>
        </View>
    );
}

// ── DM chat screen ───────────────────────────────────────────────────────────
// Exposed to CampusStaffroom (and up through it to campus.tsx) so tapping the
// active Campus footer tab again — same as the Home tab's tap-to-refresh —
// can scroll straight to the latest message and refetch, even while a DM
// thread is open, not just the thread list.
export type DmChatHandle = { scrollToTopAndRefresh: () => void };

const DmChat = forwardRef<DmChatHandle, { thread: DmThread; isOnline: boolean; onBack: () => void }>(function DmChat({ thread, isOnline, onBack }, ref) {
    const { isDark, accent } = useTheme();
    const bg = isDark ? '#000000' : '#FAF8FF';
    const cardBg = isDark ? '#141414' : '#FFFFFF';
    const cardBorder = isDark ? '#2A2A2A' : '#EDE9FE';
    const text = isDark ? '#F1F5F9' : '#0F172A';
    const subText = isDark ? '#94A3B8' : '#64748B';

    const [messages, setMessages] = useState<DmMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
    const [uploading, setUploading] = useState(false);
    const [sending, setSending] = useState(false);
    const [msgMenuAnchor, setMsgMenuAnchor] = useState<{ id: string; x: number; y: number; alignRight: boolean } | null>(null);
    // Kept in sync with msgMenuAnchor on every change so the capture-phase
    // tap-anywhere-closes handler below (and the toggle logic on the 3-dot
    // button) can read/write it synchronously, without waiting on a
    // re-render — relying on sibling paint order to close the popup proved
    // unreliable on-device, so closing is now driven by this responder
    // capture instead.
    const menuAnchorRef = useRef<typeof msgMenuAnchor>(null);
    // When the capture handler below closes an open menu, it remembers
    // *which* message it just closed here. The 3-dot button's own onPress
    // (which fires slightly later, on touch-up) checks this to tell "tap the
    // same 3-dot again to close" apart from "tap a different message's
    // 3-dot" — by the time onPress runs, the capture handler has already
    // cleared menuAnchorRef for BOTH cases, so menuAnchorRef alone can't
    // distinguish them.
    const lastClosedIdRef = useRef<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const messagesListRef = useRef<FlatList>(null);
    const [showScrollDown, setShowScrollDown] = useState(false);
    // Popup is positioned with `bottom`/`left`/`right`, which are relative to
    // this root container's own box — not the window. Since this screen no
    // longer fills the whole window (it renders inline under the Direct
    // Messages heading, above the bottom tab bar), we need the container's
    // own on-screen top offset and height to convert a window-relative touch
    // point into a position relative to this container.
    const rootRef = useRef<ViewInstance | null>(null);
    const [rootLayout, setRootLayout] = useState({ y: 0, height: 0 });

    // Fires on the CAPTURE phase (parent-to-child, before any child's own
    // touch handler) for every touch that starts anywhere inside the
    // tap-catching wrapper below. This is what actually closes the popup on
    // an outside tap — it doesn't depend on which sibling is visually on
    // top, unlike the invisible-overlay approach that turned out to be
    // unreliable on this device. Returning false means it never claims the
    // responder, so the touch still reaches whatever was actually tapped.
    const closeMenuOnTap = useCallback(() => {
        lastClosedIdRef.current = menuAnchorRef.current?.id ?? null;
        if (menuAnchorRef.current) {
            menuAnchorRef.current = null;
            setMsgMenuAnchor(null);
        }
        return false;
    }, []);

    // Keyboard avoidance — KeyboardAvoidingView proved unreliable here too
    // (same issue seen elsewhere in this screen: its padding recalculation
    // on new-content layout changes can steal focus and dismiss the
    // keyboard right after sending). Track keyboard height ourselves and
    // pad the container by exactly that much instead. This screen renders
    // inline under the Direct Messages heading, ABOVE the bottom tab bar
    // (the tab navigator reserves that strip already), but the keyboard's
    // reported height is measured from the true screen bottom, which
    // includes that reserved strip — so subtract it, same as the feed
    // composer above, or the composer ends up floating with a gap above
    // the keyboard.
    const insets = useSafeAreaInsets();
    const tabBarHeight = 52 + (Platform.OS === 'ios' ? Math.max(insets.bottom - 14, 8) : Math.max(insets.bottom, 14));
    const [kbHeight, setKbHeight] = useState(0);
    useEffect(() => {
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const show = Keyboard.addListener(showEvt, (e) => {
            const kb = e.endCoordinates?.height ?? 0;
            setKbHeight(Math.max(0, kb - tabBarHeight));
        });
        const hide = Keyboard.addListener(hideEvt, () => setKbHeight(0));
        return () => { show.remove(); hide.remove(); };
    }, [tabBarHeight]);

    // Slide the chat in from the right, WhatsApp-style, the moment it mounts —
    // and slide it back out to the right before actually going back, so
    // closing mirrors opening instead of just vanishing.
    const slideX = useRef(new Animated.Value(Dimensions.get('window').width)).current;
    useEffect(() => {
        Animated.timing(slideX, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }, [slideX]);

    const handleBack = useCallback(() => {
        Animated.timing(slideX, { toValue: Dimensions.get('window').width, duration: 200, useNativeDriver: true }).start(() => {
            onBack();
        });
    }, [slideX, onBack]);

    // Android hardware back button / gesture should close the chat too, not
    // just the on-screen back arrow.
    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            handleBack();
            return true;
        });
        return () => sub.remove();
    }, [handleBack]);

    // iOS-style edge swipe-to-go-back: start the gesture only near the left
    // edge, drag the chat with the finger, then either finish closing it or
    // snap back to open depending on how far/fast it was dragged.
    const screenWidth = Dimensions.get('window').width;
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: (evt) => evt.nativeEvent.pageX < 24,
            onMoveShouldSetPanResponder: (evt, gestureState) =>
                evt.nativeEvent.pageX - gestureState.dx < 24 && gestureState.dx > 5 && Math.abs(gestureState.dy) < 30,
            onPanResponderMove: (_evt, gestureState) => {
                if (gestureState.dx > 0) slideX.setValue(gestureState.dx);
            },
            onPanResponderRelease: (_evt, gestureState) => {
                if (gestureState.dx > screenWidth / 3 || gestureState.vx > 0.5) {
                    Animated.timing(slideX, { toValue: screenWidth, duration: 180, useNativeDriver: true }).start(() => onBack());
                } else {
                    Animated.spring(slideX, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
                }
            },
            onPanResponderTerminate: () => {
                Animated.spring(slideX, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
            },
        })
    ).current;

    const fetchMessages = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await api.get(`/teacher/staffroom/dms/${thread.teacherUserId}`);
            setMessages(res.data.data);
        } catch {
            // silent
        } finally {
            if (!silent) setLoading(false);
        }
    }, [thread.teacherUserId]);

    useImperativeHandle(ref, () => ({
        scrollToTopAndRefresh: () => {
            messagesListRef.current?.scrollToOffset({ offset: 0, animated: true });
            fetchMessages(true);
        },
    }), [fetchMessages]);

    useEffect(() => {
        fetchMessages();
        pollRef.current = setInterval(() => fetchMessages(true), 4000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [fetchMessages]);

    const uploadOneDmAttachment = async (picked: { uri: string; name: string; mimeType: string }, key: string) => {
        const form = new FormData();
        form.append('file', { uri: picked.uri, name: picked.name, type: picked.mimeType } as unknown as Blob);
        const res = await api.post('/teacher/staffroom/upload?context=dm', form, { headers: { 'Content-Type': 'multipart/form-data' } });
        setAttachments((prev) => prev.map((a) => a.localUri === key
            ? { url: res.data.data.url, name: res.data.data.name, type: res.data.data.type, localUri: key }
            : a));
    };

    const handleAttach = async (kind: 'any' | 'image') => {
        if (kind === 'image') {
            // Images support multi-select — each one gets its own instant
            // local-URI preview immediately, and uploads happen in the
            // background per file, same pattern as the announcement composer.
            let picked = await pickMultipleImages();
            if (!picked.length) return;
            const room = MAX_ATTACHMENTS - attachments.length;
            if (room <= 0) { Alert.alert('Too many attachments', `You can only send up to ${MAX_ATTACHMENTS} attachments at once.`); return; }
            if (picked.length > room) { Alert.alert('Too many attachments', `You can only send up to ${MAX_ATTACHMENTS} attachments at once.`); picked = picked.slice(0, room); }
            setAttachments((prev) => [
                ...prev,
                ...picked.map((p) => ({ url: '', localUri: p.uri, name: p.name, type: 'image' as const })),
            ]);
            setUploading(true);
            try {
                await Promise.all(picked.map((p) => uploadOneDmAttachment(p, p.uri).catch(() => {
                    setAttachments((prev) => prev.filter((a) => a.localUri !== p.uri));
                })));
            } finally {
                setUploading(false);
            }
            return;
        }

        // Non-image files stay single-attach, added alongside any images.
        const picked = await pickAttachment(kind);
        if (!picked) return;
        setUploading(true);
        try {
            const form = new FormData();
            form.append('file', { uri: picked.uri, name: picked.name, type: picked.mimeType } as unknown as Blob);
            const res = await api.post('/teacher/staffroom/upload?context=dm', form, { headers: { 'Content-Type': 'multipart/form-data' } });
            setAttachments((prev) => [...prev, { url: res.data.data.url, name: res.data.data.name, type: res.data.data.type }]);
        } catch {
            Alert.alert('Error', 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleSend = async () => {
        const readyAttachments = attachments.filter((a) => a.url);
        if ((!input.trim() && readyAttachments.length === 0) || sending || uploading) return;
        setSending(true);
        try {
            const res = await api.post(`/teacher/staffroom/dms/${thread.teacherUserId}`, {
                text: input.trim() || undefined,
                attachments: readyAttachments.map((a) => ({ url: a.url, type: a.type, name: a.name })),
            });
            setMessages((prev) => [...prev, res.data.data]);
            setInput(''); setAttachments([]);
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            Alert.alert('Error', msg ?? 'Failed to send message');
        } finally {
            setSending(false);
        }
    };

    const handleCopy = (msg: DmMessage) => {
        if (msg.text) Clipboard.setStringAsync(msg.text);
        menuAnchorRef.current = null;
        setMsgMenuAnchor(null);
    };

    const confirmUnsend = (messageId: string) => {
        Alert.alert('Unsend message?', 'This message will be permanently deleted. Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Unsend', style: 'destructive', onPress: async () => {
                    try {
                        await api.delete(`/teacher/staffroom/dms/${thread.teacherUserId}/messages/${messageId}`);
                        setMessages((prev) => prev.filter((m) => m.id !== messageId));
                    } catch {
                        Alert.alert('Error', 'Failed to unsend message');
                    }
                },
            },
        ]);
    };

    return (
        <Animated.View
            ref={rootRef}
            {...panResponder.panHandlers}
            onLayout={() => {
                rootRef.current?.measureInWindow((_x, y, _width, height) => setRootLayout({ y, height }));
            }}
            style={{ flex: 1, backgroundColor: bg, paddingBottom: kbHeight, transform: [{ translateX: slideX }] }}
        >
            {/* Everything the user can tap that ISN'T the popup lives inside
                this wrapper. Its capture-phase handler closes the popup on
                literally any touch that starts here, before whatever was
                actually tapped (a message, the composer, a different
                message's 3-dot, empty space) gets to handle it — this is
                what makes "tap anywhere else to close" reliable, since it
                doesn't depend on which sibling paints on top. The popup
                itself is rendered as a sibling AFTER this wrapper (outside
                it), so tapping the popup's own Copy/Unsend buttons never
                triggers this capture handler. */}
            <View style={{ flex: 1 }} onStartShouldSetResponderCapture={closeMenuOnTap}>
            <View style={[styles.dmHeader, { borderBottomColor: cardBorder, backgroundColor: cardBg }]}>
                <TouchableOpacity onPress={handleBack} style={styles.dmBackBtn}>
                    <ChevronLeft size={18} color={text} />
                </TouchableOpacity>
                <View style={{ position: 'relative' }}>
                    <View style={[styles.miniAvatar, { width: 34, height: 34, borderRadius: 17, backgroundColor: thread.avatarUrl ? 'transparent' : getAvatarColor(thread.teacherUserId) }]}>
                        {thread.avatarUrl
                            ? <Image source={{ uri: thread.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                            : <Text style={styles.miniAvatarText}>{getInitials(thread.name)}</Text>}
                    </View>
                    <View style={[styles.presenceDot, { backgroundColor: isOnline ? '#10B981' : '#94A3B8', borderColor: cardBg }]} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: text }}>{formatDisplayName(thread.name, thread.prefix)}</Text>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: subText }}>{isOnline ? '🟢 Active' : '⚫ Inactive'}</Text>
                </View>
            </View>

            <FlatList
                ref={messagesListRef}
                data={[...messages].reverse()}
                keyExtractor={(m) => m.id}
                inverted
                onScroll={(e) => setShowScrollDown(e.nativeEvent.contentOffset.y > 150)}
                scrollEventThrottle={16}
                contentContainerStyle={{ padding: 12, gap: 6 }}
                ListEmptyComponent={!loading ? (
                    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: subText }}>No messages yet — say hello!</Text>
                    </View>
                ) : undefined}
                renderItem={({ item: msg }) => (
                    <View style={{ flexDirection: msg.isMe ? 'row-reverse' : 'row' }}>
                        <View style={{ maxWidth: '78%', alignItems: msg.isMe ? 'flex-end' : 'flex-start' }}>
                            {(() => {
                                const msgEmojiOnly = isEmojiOnlyMessage(msg.text) && !msg.attachments?.length;
                                return (
                            <View style={
                                msgEmojiOnly
                                    ? { paddingHorizontal: 2, paddingVertical: 2 }
                                    : [styles.bubble, msg.isMe ? { backgroundColor: '#E8CBB5', borderTopRightRadius: 4 } : { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1, borderTopLeftRadius: 4 }]
                            }>
                                {!!msg.text && (
                                    <LinkifiedText
                                        text={msg.text}
                                        style={msgEmojiOnly
                                            ? { fontSize: 40, lineHeight: 48 }
                                            : { fontSize: 14.5, lineHeight: 19.5, color: msg.isMe ? '#3A322C' : text }}
                                        linkStyle={{ color: msg.isMe ? '#3A322C' : accent.purple, textDecorationLine: 'underline' }}
                                    />
                                )}
                                {msg.attachments?.length > 0 && (
                                    <View style={{ marginTop: msg.text ? 6 : 0, gap: 5 }}>
                                        {msg.attachments.map((att: { url: string; type: string; name: string }, i: number) => (
                                            <AttachmentPreview key={i} url={att.url} name={att.name} type={att.type} />
                                        ))}
                                    </View>
                                )}
                                <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 2, marginTop: 3 }}>
                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: msgEmojiOnly ? subText : (msg.isMe ? 'rgba(58,50,44,0.55)' : subText) }}>
                                        {fmtDateTime(msg.createdAt)}
                                    </Text>
                                    {canUnsend(msg) && (
                                        <TouchableOpacity
                                            onPress={(e) => {
                                                // The capture handler on the wrapper already ran on
                                                // this same tap's touch-down and cleared
                                                // menuAnchorRef (if anything was open), stashing
                                                // which message it closed in lastClosedIdRef. If
                                                // that was THIS message, treat the tap as "close it"
                                                // (toggle); otherwise open this message's menu.
                                                if (lastClosedIdRef.current === msg.id) {
                                                    lastClosedIdRef.current = null;
                                                    return;
                                                }
                                                const { pageX, pageY } = e.nativeEvent;
                                                const next = { id: msg.id, x: pageX, y: pageY, alignRight: msg.isMe };
                                                menuAnchorRef.current = next;
                                                setMsgMenuAnchor(next);
                                            }}
                                            style={{ padding: 6, margin: -6 }}
                                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        >
                                            <MoreVertical size={13} color={msgEmojiOnly ? subText : (msg.isMe ? 'rgba(58,50,44,0.55)' : subText)} />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                                );
                            })()}
                        </View>
                    </View>
                )}
            />

            {attachments.length > 0 && (
                <View style={{ paddingHorizontal: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 8 }}>
                    {attachments.map((att, i) => (
                        <AttachmentChip
                            key={att.localUri ?? `${att.url}-${i}`}
                            attachment={att}
                            onRemove={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                        />
                    ))}
                </View>
            )}

            {showScrollDown && (
                <View pointerEvents="box-none" style={{ position: 'absolute', bottom: 68, left: 0, right: 0, alignItems: 'center' }}>
                    <TouchableOpacity
                        onPress={() => messagesListRef.current?.scrollToOffset({ offset: 0, animated: true })}
                        style={[styles.scrollDownBtn, { backgroundColor: cardBg, borderColor: cardBorder }]}
                    >
                        <ArrowDown size={15} color={text} />
                    </TouchableOpacity>
                </View>
            )}

            <View style={[styles.dmComposer, { borderColor: cardBorder, backgroundColor: cardBg, marginHorizontal: 14, borderRadius: 16, borderWidth: 1, marginBottom: 10 }]}>
                <View style={{ flexDirection: 'row', gap: 1 }}>
                    <TouchableOpacity onPress={() => handleAttach('any')} disabled={uploading} style={styles.dmComposerIcon}>
                        {uploading ? <ActivityIndicator size="small" color={subText} /> : <Paperclip size={16} color={subText} />}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleAttach('image')} disabled={uploading} style={styles.dmComposerIcon}>
                        <ImageIcon size={16} color={subText} />
                    </TouchableOpacity>
                </View>
                <TextInput
                    value={input}
                    onChangeText={setInput}
                    placeholder={`Message ${thread.name}...`}
                    placeholderTextColor={subText}
                    multiline
                    scrollEnabled
                    style={[styles.dmComposerInput, { color: text, backgroundColor: isDark ? '#1E1E1E' : '#F1F5F9' }]}
                />
                <TouchableOpacity onPress={handleSend} disabled={(!input.trim() && attachments.filter((a) => a.url).length === 0) || sending || uploading} style={[styles.sendBtn, { opacity: ((!input.trim() && attachments.filter((a) => a.url).length === 0) || sending || uploading) ? 0.4 : 1 }]}>
                    {sending ? <ActivityIndicator size="small" color="#fff" /> : <Send size={17} color="#fff" />}
                </TouchableOpacity>
            </View>
            </View>

            {msgMenuAnchor && (() => {
                const menuMsg = messages.find((m) => m.id === msgMenuAnchor.id);
                if (!menuMsg) return null;
                const screenW = Dimensions.get('window').width;
                // `bottom`/`left`/`right` position relative to this root
                // container's own box, so convert the window-relative touch
                // point using the container's own measured top offset/height
                // (see rootLayout above) instead of the window's full height.
                const relativeY = msgMenuAnchor.y - rootLayout.y;
                return (
                        <View
                            style={[
                                styles.msgMenu,
                                {
                                    backgroundColor: cardBg, borderColor: cardBorder,
                                    bottom: Math.max(4, rootLayout.height - relativeY + 8),
                                    ...(msgMenuAnchor.alignRight
                                        ? { right: Math.max(14, screenW - msgMenuAnchor.x) }
                                        : { left: Math.max(14, msgMenuAnchor.x - 90) }),
                                },
                            ]}
                        >
                            {!!menuMsg.text && (
                                <TouchableOpacity onPress={() => handleCopy(menuMsg)} style={[styles.msgMenuItem, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                                    <Copy size={13} color={text} />
                                    <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_500Medium', color: text }}>Copy</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={() => { menuAnchorRef.current = null; setMsgMenuAnchor(null); confirmUnsend(menuMsg.id); }} style={[styles.msgMenuItem, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                                <Trash2 size={13} color="#EF4444" />
                                <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_500Medium', color: '#EF4444' }}>Unsend</Text>
                            </TouchableOpacity>
                        </View>
                );
            })()}
        </Animated.View>
    );
});

// ── Main Export ──────────────────────────────────────────────────────────────
// Exposed up to campus.tsx so tapping the active Campus footer tab again
// scrolls to the top and refreshes whatever's currently showing — the
// Staffroom feed, the DM thread list, or an open DM chat — same as tapping
// the Home tab does for the home screen.
export type CampusStaffroomHandle = { scrollToTopAndRefresh: () => void };

// The Campus tab's three pages live in one flat pager owned by this component:
// the Campus feed (handed in as `leadingPage`), the Staffroom feed, and the DM
// thread list. They used to be two nested pagers — one here, one wrapping this
// component — which meant two same-direction scroll views fighting over every
// horizontal drag: Android gave the gesture to the outer one (so the DM swipe
// never worked) and iOS handed it over as soon as the inner one hit its edge
// (so swiping back from DMs shot straight past Staffroom to the feed). One
// pager, one gesture owner, no fight.
export type CampusPage = 'campus' | 'staffroom' | 'dms' | 'inventory';

export const CampusStaffroom = forwardRef<CampusStaffroomHandle, {
    page: CampusPage;
    onPageChange: (page: CampusPage) => void;
    onUnreadChange?: (hasUnread: boolean) => void;
    leadingPage?: ReactNode;
    trailingPage?: ReactNode;
}>(function CampusStaffroom({
    page,
    onPageChange,
    onUnreadChange,
    leadingPage,
    trailingPage,
}, ref) {
    // Everything below still thinks in terms of "which Staffroom pane is
    // showing", so keep that shape rather than rewriting each usage.
    const innerTab: 'feed' | 'dms' = page === 'dms' ? 'dms' : 'feed';
    const PAGE_ORDER: CampusPage[] = [...(leadingPage ? ['campus' as const] : []), 'staffroom', 'dms', ...(trailingPage ? ['inventory' as const] : [])];
    const pageIndex = Math.max(0, PAGE_ORDER.indexOf(page));
    const { isDark, accent } = useTheme();
    const bg = isDark ? '#000000' : '#FAF8FF';
    const cardBg = isDark ? '#141414' : '#FFFFFF';
    const cardBorder = isDark ? '#2A2A2A' : '#EDE9FE';
    const text = isDark ? '#F1F5F9' : '#0F172A';
    const subText = isDark ? '#94A3B8' : '#64748B';

    const [myUserId, setMyUserId] = useState('');

    const [posts, setPosts] = useState<StaffroomPost[]>([]);
    const [feedLoading, setFeedLoading] = useState(true);
    const [postInput, setPostInput] = useState('');
    const [postAttachments, setPostAttachments] = useState<PendingAttachment[]>([]);
    const [postUploading, setPostUploading] = useState(false);
    const [postSubmitting, setPostSubmitting] = useState(false);
    const feedPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Keyboard avoidance for the announcement composer — the built-in
    // KeyboardAvoidingView's 'padding' behavior turned out unreliable here
    // (same issue as the feed's post composer), so we track keyboard height
    // ourselves and pad the composer's own container by exactly that much,
    // which reliably pushes the whole bar above the keyboard.
    const [kbHeight, setKbHeight] = useState(0);
    const postsListRef = useRef<FlatList>(null);
    const [showFeedScrollDown, setShowFeedScrollDown] = useState(false);
    const insets = useSafeAreaInsets();
    // This screen already sits ABOVE the bottom tab bar (the tab navigator
    // reserves that space), but the keyboard's reported height is measured
    // from the true screen bottom, which includes that reserved tab-bar
    // strip. Padding by the full keyboard height double-counts it — the tab
    // bar's height, not the keyboard, was already "missing" from our area —
    // so subtract it (same formula as the tab bar itself) before applying.
    const tabBarHeight = 52 + (Platform.OS === 'ios' ? Math.max(insets.bottom - 14, 8) : Math.max(insets.bottom, 14));
    useEffect(() => {
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const show = Keyboard.addListener(showEvt, (e) => {
            const kb = e.endCoordinates?.height ?? 0;
            setKbHeight(Math.max(0, kb - tabBarHeight));
            setTimeout(() => postsListRef.current?.scrollToOffset({ offset: 0, animated: true }), 50);
        });
        const hide = Keyboard.addListener(hideEvt, () => setKbHeight(0));
        return () => { show.remove(); hide.remove(); };
    }, [tabBarHeight]);

    const [threads, setThreads] = useState<DmThread[]>([]);
    const [threadsLoading, setThreadsLoading] = useState(true);
    const [activeDm, setActiveDm] = useState<DmThread | null>(null);
    const [dmSearch, setDmSearch] = useState('');
    const [showDmSearch, setShowDmSearch] = useState(false);
    const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const threadPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const threadsListRef = useRef<FlatList>(null);
    const dmChatRef = useRef<DmChatHandle>(null);

    // The pages sit side by side in a paging ScrollView so they can be swiped
    // between, Instagram-style, as well as switched from the nav row up in
    // campus.tsx. The two stay in sync: a swipe reports the page it landed on
    // up through onPageChange, and a tap on the nav comes back down as a
    // `page` change that scrolls the pager.
    //
    // `currentPageRef` tracks which page the pager is actually showing, so the
    // effect below can tell "the user tapped the nav" (needs a scroll)
    // from "the user just swiped" (already there — scrolling again would fight
    // the gesture).
    const pagerRef = useRef<ScrollViewInstance | null>(null);
    const [pagerWidth, setPagerWidth] = useState(Dimensions.get('window').width);
    const lastPagerWidthRef = useRef(0);
    const currentPageRef = useRef<CampusPage>(page);
    const pageRef = useRef(page);
    pageRef.current = page;
    // Which page a drag started from, and whether a finger is still down —
    // together they keep the 30% commit below from oscillating.
    const dragFromIndexRef = useRef(0);
    const draggingRef = useRef(false);

    useEffect(() => {
        if (currentPageRef.current === page) return;
        currentPageRef.current = page;
        pagerRef.current?.scrollTo({ x: pageIndex * pagerWidth, animated: true });
    }, [page, pageIndex, pagerWidth]);

    // Report unread-DM state upward so the parent screen can show the dot
    // on its own Staffroom/DM switcher (now rendered in the top nav row).
    useEffect(() => {
        onUnreadChange?.(threads.reduce((s, t) => s + t.unread, 0) > 0);
    }, [threads, onUnreadChange]);

    useEffect(() => {
        api.get('/teacher/me').then((res) => {
            const u = res.data.data;
            setMyUserId(u?.userId ?? u?.user?.id ?? u?.id ?? '');
        }).catch(() => {});
    }, []);

    // Presence heartbeat
    useEffect(() => {
        const sendBeat = () => api.post('/teacher/presence').catch(() => {});
        sendBeat().then(() => {
            api.get('/teacher/staffroom/dms').then((res) => setThreads(res.data.data)).catch(() => {});
        });
        heartbeatRef.current = setInterval(sendBeat, 30000);
        return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
    }, []);

    useEffect(() => {
        threadPollRef.current = setInterval(() => {
            api.get('/teacher/staffroom/dms').then((res) => setThreads(res.data.data)).catch(() => {});
        }, 15000);
        return () => { if (threadPollRef.current) clearInterval(threadPollRef.current); };
    }, []);

    const fetchPosts = useCallback(async (silent = false) => {
        try {
            const res = await api.get('/teacher/staffroom/posts');
            setPosts((res.data.data as StaffroomPost[]).slice().reverse());
        } catch {
            // silent
        } finally {
            if (!silent) setFeedLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPosts();
        feedPollRef.current = setInterval(() => fetchPosts(true), 4000);
        return () => { if (feedPollRef.current) clearInterval(feedPollRef.current); };
    }, [fetchPosts]);

    const fetchThreads = useCallback(async () => {
        try {
            const res = await api.get('/teacher/staffroom/dms');
            setThreads(res.data.data);
        } catch {
            // silent
        }
    }, []);

    useEffect(() => {
        fetchThreads().finally(() => setThreadsLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Tapping the active Campus footer tab again — same as the Home tab —
    // scrolls to the top and refreshes. Which list that means depends on
    // where the user currently is inside Staffroom: the announcements feed,
    // the DM thread list, or an already-open DM chat (delegated to DmChat's
    // own handle, since its messages/scroll position live inside that
    // component, not here).
    useImperativeHandle(ref, () => ({
        scrollToTopAndRefresh: () => {
            if (innerTab === 'feed') {
                postsListRef.current?.scrollToOffset({ offset: 0, animated: true });
                fetchPosts(true);
            } else if (activeDm) {
                dmChatRef.current?.scrollToTopAndRefresh();
            } else {
                threadsListRef.current?.scrollToOffset({ offset: 0, animated: true });
                fetchThreads();
            }
        },
    }), [innerTab, activeDm, fetchPosts, fetchThreads]);

    const uploadOnePostAttachment = async (picked: { uri: string; name: string; mimeType: string }, key: string) => {
        const form = new FormData();
        form.append('file', { uri: picked.uri, name: picked.name, type: picked.mimeType } as unknown as Blob);
        const res = await api.post('/teacher/staffroom/upload?context=post', form, { headers: { 'Content-Type': 'multipart/form-data' } });
        setPostAttachments((prev) => prev.map((a) => a.localUri === key
            ? { url: res.data.data.url, name: res.data.data.name, type: res.data.data.type, localUri: key }
            : a));
    };

    const handlePostAttach = async (kind: 'any' | 'image') => {
        if (kind === 'image') {
            // Images support multi-select — each one gets its own instant
            // local-URI preview immediately (no waiting on upload or a
            // remote fetch), and uploads happen in the background per file.
            let picked = await pickMultipleImages();
            if (!picked.length) return;
            const room = MAX_ATTACHMENTS - postAttachments.length;
            if (room <= 0) { Alert.alert('Too many attachments', `You can only send up to ${MAX_ATTACHMENTS} attachments at once.`); return; }
            if (picked.length > room) { Alert.alert('Too many attachments', `You can only send up to ${MAX_ATTACHMENTS} attachments at once.`); picked = picked.slice(0, room); }
            setPostAttachments((prev) => [
                ...prev,
                ...picked.map((p) => ({ url: '', localUri: p.uri, name: p.name, type: 'image' as const })),
            ]);
            setPostUploading(true);
            try {
                await Promise.all(picked.map((p) => uploadOnePostAttachment(p, p.uri).catch(() => {
                    // Drop just this one image on failure — keep the rest.
                    setPostAttachments((prev) => prev.filter((a) => a.localUri !== p.uri));
                })));
            } finally {
                setPostUploading(false);
            }
            return;
        }

        // Non-image files stay single-attach, added alongside any images.
        const picked = await pickAttachment(kind);
        if (!picked) return;
        setPostUploading(true);
        try {
            const form = new FormData();
            form.append('file', { uri: picked.uri, name: picked.name, type: picked.mimeType } as unknown as Blob);
            const res = await api.post('/teacher/staffroom/upload?context=post', form, { headers: { 'Content-Type': 'multipart/form-data' } });
            setPostAttachments((prev) => [...prev, { url: res.data.data.url, name: res.data.data.name, type: res.data.data.type }]);
        } catch {
            Alert.alert('Error', 'Upload failed');
        } finally {
            setPostUploading(false);
        }
    };

    const handlePost = async () => {
        const readyAttachments = postAttachments.filter((a) => a.url);
        if ((!postInput.trim() && readyAttachments.length === 0) || postSubmitting || postUploading) return;
        setPostSubmitting(true);
        try {
            const res = await api.post('/teacher/staffroom/posts', {
                text: postInput.trim() || readyAttachments[0]?.name || '',
                attachments: readyAttachments.map((a) => ({ url: a.url, type: a.type, name: a.name })),
            });
            setPosts((prev) => [...prev, res.data.data]);
            setPostInput(''); setPostAttachments([]);
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message
                ?? (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.error
                ?? 'Failed to post';
            Alert.alert('Error', msg);
        } finally {
            setPostSubmitting(false);
        }
    };

    const handleLike = async (id: string) => {
        try {
            const res = await api.post(`/teacher/staffroom/posts/${id}/like`);
            const { liked, likeCount } = res.data.data;
            setPosts((prev) => prev.map((p) => p.id === id ? { ...p, liked, likeCount } : p));
        } catch {
            Alert.alert('Error', 'Failed to update like');
        }
    };

    const handleDeletePost = async (id: string) => {
        try {
            await api.delete(`/teacher/staffroom/posts/${id}`);
            setPosts((prev) => prev.filter((p) => p.id !== id));
        } catch {
            Alert.alert('Error', 'Failed to delete post');
        }
    };

    const handleAddComment = async (postId: string, text: string) => {
        const res = await api.post(`/teacher/staffroom/posts/${postId}/comments`, { text });
        const comment = res.data.data;
        setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, comments: [...p.comments, comment] } : p));
    };

    const handleDeleteComment = async (postId: string, commentId: string) => {
        try {
            await api.delete(`/teacher/staffroom/posts/${postId}/comments/${commentId}`);
            setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, comments: p.comments.filter((c) => c.id !== commentId) } : p));
        } catch {
            Alert.alert('Error', 'Failed to delete comment');
        }
    };

    const openDm = (thread: DmThread) => {
        setActiveDm(thread);
        api.patch(`/teacher/staffroom/dms/${thread.teacherUserId}/read`).catch(() => {});
        setThreads((prev) => prev.map((t) => t.teacherUserId === thread.teacherUserId ? { ...t, unread: 0 } : t));
    };

    const filteredThreads = dmSearch.trim() ? threads.filter((t) => t.name.toLowerCase().includes(dmSearch.toLowerCase())) : threads;
    const activeIsOnline = activeDm ? (threads.find((t) => t.teacherUserId === activeDm.teacherUserId)?.isActive ?? activeDm.isActive) : false;

    // The heading rides inside each Staffroom page rather than sitting above
    // the pager: the Campus feed page brings its own header, and a shared
    // heading that had to appear and disappear as you swiped between them
    // would resize the pager mid-gesture.
    const paneHeading = (kind: 'staffroom' | 'dms') => (
        <View style={{ position: 'relative', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 4, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: cardBorder }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {kind === 'staffroom'
                    ? <Users size={15} color={text} style={Platform.OS === 'android' ? { marginTop: -3 } : undefined} />
                    : <User size={15} color={text} style={Platform.OS === 'android' ? { marginTop: -3 } : undefined} />}
                <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: text }}>
                    {kind === 'staffroom' ? 'Staffroom' : 'Direct Messages'}
                </Text>
            </View>
            <View style={{ position: 'absolute', right: 14, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {kind === 'dms' && (
                    <TouchableOpacity
                        onPress={() => { setShowDmSearch((v) => !v); setDmSearch(''); }}
                        style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
                    >
                        {showDmSearch ? <X size={16} color={subText} /> : <Search size={16} color={subText} />}
                    </TouchableOpacity>
                )}
                {/* Staffroom / Direct messages switch */}
                <View style={{ flexDirection: 'row', borderRadius: 10, padding: 3, gap: 3, backgroundColor: isDark ? '#1A1A1A' : '#EDEFF3' }}>
                    <TouchableOpacity
                        onPress={() => onPageChange('staffroom')}
                        style={[styles.paneSwitchBtn, kind === 'staffroom' && { backgroundColor: isDark ? '#000000' : '#FFFFFF', ...styles.paneSwitchBtnActive }]}
                    >
                        <Users size={12} color={kind === 'staffroom' ? text : subText} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => onPageChange('dms')}
                        style={[styles.paneSwitchBtn, kind === 'dms' && { backgroundColor: isDark ? '#000000' : '#FFFFFF', ...styles.paneSwitchBtnActive }]}
                    >
                        <User size={12} color={kind === 'dms' ? text : subText} />
                        {threads.some((t) => t.unread > 0) && <View style={styles.paneSwitchDot} />}
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );

    return (
        <View style={{ flex: 1 }}>
            <ScrollView
                ref={pagerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
                style={{ flex: 1 }}
                // flexGrow makes the content row fill the pager's height, which
                // is what the pages' `height: '100%'` resolves against — without
                // it the row would size to its content and collapse.
                contentContainerStyle={{ flexGrow: 1 }}
                onLayout={(e) => {
                    const w = e.nativeEvent.layout.width;
                    // Only re-snap on a real width change (first measure,
                    // rotation). Re-snapping on every layout pass fires a
                    // scroll back to whatever page this closure was built
                    // with, which yanks the pager around mid-transition.
                    if (w === lastPagerWidthRef.current) return;
                    lastPagerWidthRef.current = w;
                    setPagerWidth(w);
                    const p = pageRef.current;
                    currentPageRef.current = p;
                    requestAnimationFrame(() => {
                        pagerRef.current?.scrollTo({ x: Math.max(0, PAGE_ORDER.indexOf(p)) * w, animated: false });
                    });
                }}
                onScrollBeginDrag={() => {
                    dragFromIndexRef.current = Math.max(0, PAGE_ORDER.indexOf(currentPageRef.current));
                    draggingRef.current = true;
                }}
                onScrollEndDrag={() => { draggingRef.current = false; }}
                // Report the landing page once the drag is ~30% of the way
                // there, rather than waiting for the paging deceleration to
                // finish — that wait is what made the nav up top look like it
                // switched a beat after the page did.
                //
                // Measured from where the drag *started*, not from the page
                // we've since committed to. Measuring from the committed page
                // put the commit point inside the threshold for going back the
                // other way, so holding a finger at 30% flipped the page
                // forward, then back, then forward again, forever.
                onScroll={(e) => {
                    if (!draggingRef.current || !pagerWidth) return;
                    const from = dragFromIndexRef.current;
                    const delta = e.nativeEvent.contentOffset.x / pagerWidth - from;
                    let idx = from;
                    if (delta >= 0.3) idx = Math.min(from + 1, PAGE_ORDER.length - 1);
                    else if (delta <= -0.3) idx = Math.max(from - 1, 0);
                    const next = PAGE_ORDER[idx];
                    if (next && next !== currentPageRef.current) {
                        currentPageRef.current = next;
                        onPageChange(next);
                    }
                }}
                scrollEventThrottle={16}
                onMomentumScrollEnd={(e) => {
                    const next = PAGE_ORDER[pagerWidth ? Math.round(e.nativeEvent.contentOffset.x / pagerWidth) : 0];
                    if (next && next !== currentPageRef.current) {
                        currentPageRef.current = next;
                        onPageChange(next);
                    }
                }}
            >
                {leadingPage && (
                    <View style={{ width: pagerWidth, height: '100%' }}>{leadingPage}</View>
                )}

                <View style={{ width: pagerWidth, height: '100%', paddingBottom: kbHeight }}>
                    {paneHeading('staffroom')}
                    <FlatList
                        ref={postsListRef}
                        data={[...posts].reverse()}
                        inverted
                        onScroll={(e) => setShowFeedScrollDown(e.nativeEvent.contentOffset.y > 150)}
                        scrollEventThrottle={16}
                        keyExtractor={(p) => p.id}
                        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 8 }}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="none"
                        ListEmptyComponent={feedLoading ? (
                            <ActivityIndicator color={accent.purple} style={{ marginVertical: 24 }} />
                        ) : (
                            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                                <MessageSquare size={28} color={subText} style={{ opacity: 0.3 }} />
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: subText, marginTop: 8 }}>No posts yet</Text>
                            </View>
                        )}
                        renderItem={({ item }) => (
                            <PostCard post={item} myUserId={myUserId} onLike={handleLike} onDelete={handleDeletePost} onAddComment={handleAddComment} onDeleteComment={handleDeleteComment} />
                        )}
                    />

                    {showFeedScrollDown && (
                        <View pointerEvents="box-none" style={{ position: 'absolute', bottom: 72, left: 0, right: 0, alignItems: 'center' }}>
                            <TouchableOpacity
                                onPress={() => postsListRef.current?.scrollToOffset({ offset: 0, animated: true })}
                                style={[styles.scrollDownBtn, { backgroundColor: cardBg, borderColor: cardBorder }]}
                            >
                                <ArrowDown size={15} color={text} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {postAttachments.length > 0 && (
                        <View style={{ paddingHorizontal: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {postAttachments.map((att, i) => (
                                <AttachmentChip
                                    key={att.localUri ?? `${att.url}-${i}`}
                                    attachment={att}
                                    onRemove={() => setPostAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                                />
                            ))}
                        </View>
                    )}

                    <View style={[styles.dmComposer, { borderColor: cardBorder, backgroundColor: cardBg, marginHorizontal: 14, borderRadius: 16, borderWidth: 1, marginBottom: 10 }]}>
                        <View style={{ flexDirection: 'row', gap: 1 }}>
                            <TouchableOpacity onPress={() => handlePostAttach('any')} disabled={postUploading} style={styles.dmComposerIcon}>
                                {postUploading ? <ActivityIndicator size="small" color={subText} /> : <Paperclip size={16} color={subText} />}
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handlePostAttach('image')} disabled={postUploading} style={styles.dmComposerIcon}>
                                <ImageIcon size={16} color={subText} />
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            value={postInput}
                            onChangeText={setPostInput}
                            placeholder="Write an announcement..."
                            placeholderTextColor={subText}
                            multiline
                            scrollEnabled
                            style={[styles.dmComposerInput, { color: text, backgroundColor: isDark ? '#1E1E1E' : '#F1F5F9' }]}
                        />
                        <TouchableOpacity onPress={handlePost} disabled={(!postInput.trim() && postAttachments.filter((a) => a.url).length === 0) || postSubmitting || postUploading} style={[styles.sendBtn, { opacity: ((!postInput.trim() && postAttachments.filter((a) => a.url).length === 0) || postSubmitting || postUploading) ? 0.4 : 1 }]}>
                            {postSubmitting ? <ActivityIndicator size="small" color="#fff" /> : <Send size={17} color="#fff" />}
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={{ width: pagerWidth, height: '100%' }}>
                    {paneHeading('dms')}
                    {showDmSearch && (
                        <View style={{ paddingHorizontal: 14, marginTop: 8, marginBottom: 8 }}>
                            <View style={[styles.dmSearchBar, { backgroundColor: isDark ? '#1E1E1E' : '#F1F5F9' }]}>
                                <Search size={13} color={subText} />
                                <TextInput
                                    value={dmSearch}
                                    onChangeText={setDmSearch}
                                    placeholder="Search teachers..."
                                    placeholderTextColor={subText}
                                    autoFocus
                                    style={{ flex: 1, fontSize: 12, fontFamily: 'Poppins_400Regular', color: text, marginLeft: 6 }}
                                />
                            </View>
                        </View>
                    )}
                    <FlatList
                        ref={threadsListRef}
                        data={filteredThreads}
                        keyExtractor={(t) => t.teacherUserId}
                        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 0, paddingBottom: 20 }}
                        ListEmptyComponent={threadsLoading ? (
                            <ActivityIndicator color={accent.purple} style={{ marginVertical: 24 }} />
                        ) : (
                            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                                <Users size={28} color={subText} style={{ opacity: 0.3 }} />
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: subText, marginTop: 8 }}>No conversations yet</Text>
                            </View>
                        )}
                        renderItem={({ item: t }) => (
                            <TouchableOpacity onPress={() => openDm(t)} style={[styles.threadRow, { borderBottomColor: cardBorder }]}>
                                <View style={{ position: 'relative' }}>
                                    <View style={[styles.miniAvatar, { backgroundColor: t.avatarUrl ? 'transparent' : getAvatarColor(t.teacherUserId) }]}>
                                        {t.avatarUrl
                                            ? <Image source={{ uri: t.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                            : <Text style={styles.miniAvatarText}>{getInitials(t.name)}</Text>}
                                    </View>
                                    <View style={[styles.presenceDot, { backgroundColor: t.isActive ? '#10B981' : '#94A3B8', borderColor: cardBg }]} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: text }} numberOfLines={1}>{formatDisplayName(t.name, t.prefix)}</Text>
                                        <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: subText }}>{t.lastMessageAt ? fmtTime(t.lastMessageAt) : ''}</Text>
                                    </View>
                                    <Text style={{ fontSize: 10.5, fontFamily: t.unread > 0 ? 'Poppins_600SemiBold' : 'Poppins_400Regular', color: t.unread > 0 ? text : subText }} numberOfLines={1}>
                                        {t.lastMessage ? `${t.lastMessageIsMe ? 'You: ' : ''}${t.lastMessage}` : 'No messages yet'}
                                    </Text>
                                </View>
                                {t.unread > 0 && (
                                    <View style={styles.unreadBadge}>
                                        <Text style={styles.unreadBadgeText}>{t.unread}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        )}
                    />
                </View>

                {trailingPage && (
                    <View style={{ width: pagerWidth, height: '100%' }}>{trailingPage}</View>
                )}
            </ScrollView>

            {/* An open DM chat covers the pager instead of replacing it, so the
                Campus feed and the two Staffroom panes keep their state, scroll
                position and fetched data while you're inside a conversation. */}
            {activeDm && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: bg }]}>
                    <DmChat ref={dmChatRef} thread={activeDm} isOnline={activeIsOnline} onBack={() => setActiveDm(null)} />
                </View>
            )}
        </View>
    );
});

const styles = StyleSheet.create({
    paneSwitchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
    paneSwitchBtnActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 2 },
    paneSwitchDot: { position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
    miniAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    miniAvatarText: { fontSize: 12, fontFamily: 'Poppins_700Bold', color: '#fff' },
    tinyAvatar: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    roleTag: { paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 99 },
    bubble: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14 },
    commentInput: { flex: 1, height: 30, borderRadius: 15, paddingHorizontal: 12, fontSize: 11.5, fontFamily: 'Poppins_400Regular' },
    commentSendBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#DA7756', alignItems: 'center', justifyContent: 'center' },
    presenceDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
    dmHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, borderBottomWidth: 1 },
    dmBackBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    dmComposer: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1 },
    dmComposerIcon: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
    dmComposerInput: { flex: 1, minHeight: 36, maxHeight: 98, lineHeight: 16, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, fontSize: 12.5, fontFamily: 'Poppins_400Regular' },
    sendBtn: { width: 36, height: 36, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DA7756' },
    attachChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginBottom: 6 },
    attachImagePreviewWrap: { alignSelf: 'flex-start', marginBottom: 6, position: 'relative' },
    attachImagePreview: { width: 56, height: 56, borderRadius: 10 },
    attachImagePreviewRemove: { position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    dmSearchBar: { flexDirection: 'row', alignItems: 'center', height: 34, borderRadius: 17, paddingHorizontal: 12 },
    scrollDownBtn: {
        width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
    },
    msgMenu: {
        position: 'absolute', minWidth: 110, borderRadius: 10, borderWidth: 1,
        paddingVertical: 4, zIndex: 101, elevation: 101,
        shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    },
    msgMenuItem: { paddingVertical: 9, paddingHorizontal: 14 },
    threadRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#DA7756', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
    unreadBadgeText: { fontSize: 10, fontFamily: 'Poppins_700Bold', color: '#fff' },
});
