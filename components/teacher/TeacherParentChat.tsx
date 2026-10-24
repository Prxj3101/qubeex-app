import { ChatThreadView } from '@/components/chat/ChatThreadView';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import { ChevronRight, MessageCircle, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LIGHT = { bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE', text: '#0F172A', subText: '#64748B', muted: '#94A3B8' };
const DARK = { bg: '#000000', card: '#141414', cardBorder: '#2A2A2A', text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B' };

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
};

/** Entry card for the teacher home: parent messages inbox with an unread badge. */
export function TeacherParentChatEntry() {
    const { isDark, accent } = useTheme();
    const theme = isDark ? DARK : LIGHT;
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
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setOpen(true)}
                style={[styles.entry, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            >
                <View style={[styles.entryIcon, { backgroundColor: accent.purple + '1A' }]}>
                    <MessageCircle size={18} color={accent.purple} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.entryTitle, { color: theme.text }]}>Parent messages</Text>
                    <Text style={[styles.entrySub, { color: theme.subText }]} numberOfLines={1}>Replies from parents of your students</Text>
                </View>
                {unread > 0 && (
                    <View style={styles.badge}><Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text></View>
                )}
                <ChevronRight size={16} color={theme.muted} />
            </TouchableOpacity>

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

    const load = useCallback(async () => {
        try {
            const res = await api.get<{ data: ThreadsPayload }>('/teacher/parent-chat/threads');
            setData(res.data.data);
        } catch { /* silent */ }
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
                    viewerIsTeacher
                    labels={LABELS}
                    onBack={() => { setActive(null); load(); }}
                />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Parent messages</Text>
                <TouchableOpacity onPress={onClose} hitSlop={12}><X size={20} color={theme.text} /></TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.center}><ActivityIndicator color={accent.purple} /></View>
            ) : (
                <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }} showsVerticalScrollIndicator={false}>
                    {data && !data.settings.enabled && (
                        <Text style={[styles.info, { color: theme.subText }]}>Parent chat is turned off by your school.</Text>
                    )}
                    {data && data.threads.length === 0 && (
                        <Text style={[styles.info, { color: theme.muted }]}>No parent messages yet. Parents can message you from Parent Mode.</Text>
                    )}
                    {data?.threads.map(th => (
                        <TouchableOpacity
                            key={th.id}
                            activeOpacity={0.85}
                            onPress={() => setActive(th)}
                            style={[styles.row, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                        >
                            <View style={[styles.avatar, { backgroundColor: accent.purple }]}>
                                <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#fff', includeFontPadding: false }}>
                                    {th.studentName[0]?.toUpperCase() ?? '?'}
                                </Text>
                            </View>
                            <View style={{ flex: 1 }}>
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
                            {th.unread > 0 && (
                                <View style={styles.badge}><Text style={styles.badgeText}>{th.unread}</Text></View>
                            )}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    entry: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 14 },
    entryIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    entryTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', lineHeight: 19, includeFontPadding: false },
    entrySub: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', lineHeight: 16, includeFontPadding: false },
    badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#DC2626', paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
    badgeText: { color: '#fff', fontSize: 10.5, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1 },
    headerTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    info: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingVertical: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 12 },
    avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    rowName: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold', lineHeight: 19, includeFontPadding: false },
    rowSub: { fontSize: 11, fontFamily: 'Poppins_400Regular', lineHeight: 15, includeFontPadding: false },
    rowLast: { fontSize: 11, fontFamily: 'Poppins_400Regular', lineHeight: 15, marginTop: 2, includeFontPadding: false },
});
