import { ChatThreadView } from '@/components/chat/ChatThreadView';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, MessageCircle } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DARK, EmptyState, EntryCard, ErrorState, GradientHeader, LIGHT, SkeletonList, cardShadow, shade } from '@/components/parentUi';

interface Thread {
    id: string;
    studentName: string;
    rollNo: string | null;
    className: string | null;
    unread: number;
    lastMessage: { text: string; fromTeacher: boolean; createdAt: string } | null;
    lastMessageAt: string;
}

interface ThreadsPayload {
    settings: { enabled: boolean; officeStart: string; officeEnd: string; withinOfficeHours: boolean };
    threads: Thread[];
}

const LABELS = {
    placeholder: 'Type a reply…',
    send: 'Send',
    empty: 'No messages yet.',
    removed: 'This message was removed by the school.',
    adminNotice: 'School administrators can view these conversations.',
    outsideHours: '',
    attachPhoto: 'Photo',
    attachPdf: 'PDF',
    report: 'Report message',
    reportBody: 'The school administrator will be notified and will review this message.',
    reported: 'Reported',
    cancel: 'Cancel',
    attachFailed: 'Could not upload the file',
};

/** Entry card for the teacher home: parent messages inbox with an unread badge. */
export function TeacherParentChatEntry() {
    const { isDark } = useTheme();
    const [open, setOpen] = useState(false);
    const [unread, setUnread] = useState(0);

    const refreshUnread = useCallback(async () => {
        try {
            const res = await api.get<{ data: { unread: number } }>('/teacher/parent-chat/unread-count');
            setUnread(res.data.data.unread);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        refreshUnread();
        const id = setInterval(refreshUnread, 60_000);
        return () => clearInterval(id);
    }, [refreshUnread]);

    return (
        <>
            <EntryCard icon={MessageCircle} title="Parent messages" subtitle="Replies from parents of your students" badge={unread} isDark={isDark} onPress={() => setOpen(true)} />

            <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
                <InboxScreen onClose={() => { setOpen(false); refreshUnread(); }} />
            </Modal>
        </>
    );
}

function InboxScreen({ onClose }: { onClose: () => void }) {
    const { isDark, accent } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const [data, setData] = useState<ThreadsPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [active, setActive] = useState<Thread | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await api.get<{ data: ThreadsPayload }>('/teacher/parent-chat/threads');
            setData(res.data.data);
            setLoadError(null);
        } catch (err) {
            const status = axios.isAxiosError(err) ? err.response?.status : undefined;
            setLoadError(status ? `Could not load messages (error ${status})` : 'Could not reach the server');
        }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(load, 30_000);
        return () => clearInterval(id);
    }, [load]);

    if (active) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: theme.card }}>
                <ChatThreadView
                    isDark={isDark}
                    accent={accent.purple}
                    title={`Parent of ${active.studentName}`}
                    subtitle={[active.className, active.rollNo ? `Roll ${active.rollNo}` : null].filter(Boolean).join(' · ')}
                    basePath={`/teacher/parent-chat/threads/${active.id}`}
                    chatRoot="/teacher/parent-chat"
                    viewerIsTeacher
                    labels={LABELS}
                    onBack={() => { setActive(null); load(); }}
                />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
            <GradientHeader
                isDark={isDark}
                icon={MessageCircle}
                title="Parent messages"
                subtitle={data?.threads.length ? `${data.threads.length} conversation${data.threads.length === 1 ? '' : 's'}` : 'Replies from parents of your students'}
                onClose={onClose}
            />

            {loading ? (
                <SkeletonList isDark={isDark} height={70} />
            ) : (
                <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }} showsVerticalScrollIndicator={false}>
                    {loadError && <ErrorState text={loadError} isDark={isDark} onRetry={load} />}
                    {data && !data.settings.enabled && (
                        <EmptyState icon={MessageCircle} title="Parent chat is turned off" text="Your school has disabled parent messaging." isDark={isDark} />
                    )}
                    {data && data.settings.enabled && data.threads.length === 0 && (
                        <EmptyState icon={MessageCircle} title="No parent messages yet" text="Parents can message you from Parent Mode. Their messages will show up here." isDark={isDark} />
                    )}
                    {data?.threads.map(th => (
                        <TouchableOpacity
                            key={th.id}
                            activeOpacity={0.88}
                            onPress={() => setActive(th)}
                            style={[styles.row, cardShadow(isDark), { backgroundColor: theme.card, borderColor: th.unread > 0 ? accent.purple + '66' : theme.cardBorder }]}
                        >
                            <LinearGradient colors={[shade(accent.purple, 0.3), accent.purple]} style={styles.avatar}>
                                <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: '#fff', includeFontPadding: false }}>
                                    {th.studentName[0]?.toUpperCase() ?? '?'}
                                </Text>
                            </LinearGradient>
                            <View style={{ flex: 1, gap: 2 }}>
                                <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>Parent of {th.studentName}</Text>
                                <Text style={[styles.rowSub, { color: theme.subText }]} numberOfLines={1}>
                                    {[th.className, th.rollNo ? `Roll ${th.rollNo}` : null].filter(Boolean).join(' · ')}
                                </Text>
                                {th.lastMessage ? (
                                    <Text style={[styles.rowLast, { color: th.unread > 0 ? theme.text : theme.muted }]} numberOfLines={1}>
                                        {th.lastMessage.fromTeacher ? 'You: ' : ''}{th.lastMessage.text}
                                    </Text>
                                ) : null}
                            </View>
                            {th.unread > 0 ? (
                                <View style={styles.badge}><Text style={styles.badgeText}>{th.unread}</Text></View>
                            ) : <ChevronRight size={16} color={theme.muted} />}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#DC2626', paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
    badgeText: { color: '#fff', fontSize: 10.5, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, padding: 13 },
    avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
    rowName: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold', lineHeight: 19, includeFontPadding: false },
    rowSub: { fontSize: 11, fontFamily: 'Poppins_400Regular', lineHeight: 15, includeFontPadding: false },
    rowLast: { fontSize: 11, fontFamily: 'Poppins_400Regular', lineHeight: 15, marginTop: 2, includeFontPadding: false },
});
