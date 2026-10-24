import api from '@/lib/api';
import axios from 'axios';
import { ArrowLeft, Send, ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

const LIGHT = { bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE', text: '#0F172A', subText: '#64748B', muted: '#94A3B8' };
const DARK = { bg: '#000000', card: '#141414', cardBorder: '#2A2A2A', text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B' };

const POLL_MS = 15_000;
const MAX_LEN = 1000;

export interface ChatMessage {
    id: string;
    fromTeacher: boolean;
    text: string;
    hidden: boolean;
    createdAt: string;
    readAt: string | null;
}

export interface ChatThreadLabels {
    placeholder: string;
    send: string;
    empty: string;
    removed: string;
    adminNotice: string;
    outsideHours: string;
}

interface Props {
    isDark: boolean;
    accent: string;
    title: string;
    subtitle?: string | null;
    /** e.g. `/student/parent-chat/teachers/<id>` or `/teacher/parent-chat/threads/<id>` */
    basePath: string;
    /** True when the signed-in user is the teacher (their messages align right). */
    viewerIsTeacher: boolean;
    labels: ChatThreadLabels;
    /** Shown above the composer when the counterpart is outside office hours. */
    showOutsideHoursNote?: boolean;
    onBack: () => void;
    onActivity?: () => void;
}

function formatTime(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return sameDay ? time : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

export function ChatThreadView({ isDark, accent, title, subtitle, basePath, viewerIsTeacher, labels, showOutsideHoursNote, onBack, onActivity }: Props) {
    const theme = isDark ? DARK : LIGHT;
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [outsideHoursReply, setOutsideHoursReply] = useState(false);
    const scrollRef = useRef<ScrollView>(null);
    const lastCreatedAt = useRef<string | null>(null);

    const markRead = useCallback(async () => {
        try {
            await api.patch(`${basePath}/read`);
            onActivity?.();
        } catch { /* silent */ }
    }, [basePath, onActivity]);

    const load = useCallback(async (initial: boolean) => {
        try {
            const params = !initial && lastCreatedAt.current ? { after: lastCreatedAt.current } : undefined;
            const res = await api.get<{ data: { messages: ChatMessage[] } }>(`${basePath}/messages`, { params });
            const incoming = res.data.data.messages;
            if (initial) {
                setMessages(incoming);
            } else if (incoming.length > 0) {
                setMessages(prev => {
                    const seen = new Set(prev.map(m => m.id));
                    return [...prev, ...incoming.filter(m => !seen.has(m.id))];
                });
            }
            if (incoming.length > 0) {
                lastCreatedAt.current = incoming[incoming.length - 1].createdAt;
                if (incoming.some(m => m.fromTeacher !== viewerIsTeacher && !m.readAt)) markRead();
            }
        } catch { /* silent: next poll retries */ }
        finally { if (initial) setLoading(false); }
    }, [basePath, markRead, viewerIsTeacher]);

    useEffect(() => {
        lastCreatedAt.current = null;
        setLoading(true);
        load(true);
        const id = setInterval(() => load(false), POLL_MS);
        return () => clearInterval(id);
    }, [load]);

    useEffect(() => {
        const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
        return () => clearTimeout(t);
    }, [messages.length]);

    const send = async () => {
        const body = text.trim();
        if (!body || sending) return;
        setSending(true);
        setError(null);
        try {
            const res = await api.post<{ data: { message: ChatMessage; outsideOfficeHours?: boolean } }>(`${basePath}/messages`, { text: body });
            setMessages(prev => [...prev, res.data.data.message]);
            lastCreatedAt.current = res.data.data.message.createdAt;
            setText('');
            setOutsideHoursReply(!!res.data.data.outsideOfficeHours);
            onActivity?.();
        } catch (err) {
            setError(axios.isAxiosError(err) ? (err.response?.data?.message ?? 'Could not send message') : 'Could not send message');
        } finally {
            setSending(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: theme.bg }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
                <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.backBtn}>
                    <ArrowLeft size={20} color={theme.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{title}</Text>
                    {subtitle ? <Text style={[styles.subtitle, { color: theme.subText }]} numberOfLines={1}>{subtitle}</Text> : null}
                </View>
            </View>

            <View style={[styles.notice, { backgroundColor: accent + '14' }]}>
                <ShieldCheck size={13} color={accent} />
                <Text style={[styles.noticeText, { color: theme.subText }]}>{labels.adminNotice}</Text>
            </View>

            {loading ? (
                <View style={styles.center}><ActivityIndicator color={accent} /></View>
            ) : (
                <ScrollView
                    ref={scrollRef}
                    contentContainerStyle={{ padding: 14, gap: 8, flexGrow: 1 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {messages.length === 0 ? (
                        <View style={styles.center}>
                            <Text style={[styles.emptyText, { color: theme.muted }]}>{labels.empty}</Text>
                        </View>
                    ) : messages.map(m => {
                        const mine = m.fromTeacher === viewerIsTeacher;
                        return (
                            <View key={m.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                                <View style={[
                                    styles.bubble,
                                    mine
                                        ? { backgroundColor: accent, borderBottomRightRadius: 4 }
                                        : { backgroundColor: theme.card, borderColor: theme.cardBorder, borderWidth: 1, borderBottomLeftRadius: 4 },
                                ]}>
                                    <Text style={[
                                        styles.bubbleText,
                                        { color: mine ? '#FFFFFF' : theme.text },
                                        m.hidden && { fontStyle: 'italic', opacity: 0.7 },
                                    ]}>
                                        {m.hidden ? labels.removed : m.text}
                                    </Text>
                                </View>
                                <Text style={[styles.time, { color: theme.muted }]}>{formatTime(m.createdAt)}</Text>
                            </View>
                        );
                    })}
                </ScrollView>
            )}

            {(showOutsideHoursNote || outsideHoursReply) && (
                <Text style={[styles.hoursNote, { color: theme.subText }]}>{labels.outsideHours}</Text>
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={[styles.composer, { backgroundColor: theme.card, borderTopColor: theme.cardBorder }]}>
                <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder={labels.placeholder}
                    placeholderTextColor={theme.muted}
                    multiline
                    maxLength={MAX_LEN}
                    style={[styles.input, { color: theme.text, backgroundColor: theme.bg, borderColor: theme.cardBorder }]}
                    textAlignVertical="center"
                    underlineColorAndroid="transparent"
                />
                <TouchableOpacity
                    onPress={send}
                    disabled={sending || !text.trim()}
                    style={[styles.sendBtn, { backgroundColor: accent, opacity: sending || !text.trim() ? 0.5 : 1 }]}
                    accessibilityLabel={labels.send}
                >
                    {sending ? <ActivityIndicator size="small" color="#fff" /> : <Send size={17} color="#fff" />}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
    backBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', lineHeight: 20, includeFontPadding: false },
    subtitle: { fontSize: 11, fontFamily: 'Poppins_400Regular', lineHeight: 15, includeFontPadding: false },
    notice: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7 },
    noticeText: { flex: 1, fontSize: 10.5, fontFamily: 'Poppins_400Regular', lineHeight: 14, includeFontPadding: false },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingHorizontal: 30 },
    bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
    bubbleText: { fontSize: 13.5, fontFamily: 'Poppins_400Regular', lineHeight: 19, includeFontPadding: false },
    time: { fontSize: 9.5, fontFamily: 'Poppins_400Regular', marginTop: 2, marginHorizontal: 4, includeFontPadding: false },
    hoursNote: { fontSize: 11, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingHorizontal: 14, paddingBottom: 4, lineHeight: 15, includeFontPadding: false },
    error: { color: '#DC2626', fontSize: 11.5, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingBottom: 4, includeFontPadding: false },
    composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1 },
    input: {
        flex: 1, maxHeight: 110, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14,
        paddingVertical: Platform.OS === 'android' ? 7 : 10, fontSize: 13.5, fontFamily: 'Poppins_400Regular', includeFontPadding: false,
    },
    sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
