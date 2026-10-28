import api from '@/lib/api';
import axios from 'axios';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, FileText, Image as ImageIcon, MessageCircle, Paperclip, Send, ShieldCheck, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { DARK, EmptyState, LIGHT, SkeletonList, useGradient } from '@/components/parentUi';

const POLL_MS = 15_000;
const MAX_LEN = 1000;

export interface ChatAttachment {
    url: string;
    type: 'image' | 'pdf';
    name: string;
}

export interface ChatMessage {
    id: string;
    fromTeacher: boolean;
    text: string;
    attachment: ChatAttachment | null;
    reportedByMe: boolean;
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
    attachPhoto: string;
    attachPdf: string;
    report: string;
    reportBody: string;
    reported: string;
    cancel: string;
    attachFailed: string;
}

interface Props {
    isDark: boolean;
    accent: string;
    title: string;
    subtitle?: string | null;
    /** e.g. `/student/parent-chat/teachers/<id>` or `/teacher/parent-chat/threads/<id>` */
    basePath: string;
    /** `/student/parent-chat` or `/teacher/parent-chat` — used for uploads and reports. */
    chatRoot: string;
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

export function ChatThreadView({ isDark, accent, title, subtitle, basePath, chatRoot, viewerIsTeacher, labels, showOutsideHoursNote, onBack, onActivity }: Props) {
    const theme = isDark ? DARK : LIGHT;
    const gradient = useGradient(isDark);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [outsideHoursReply, setOutsideHoursReply] = useState(false);
    const [pending, setPending] = useState<ChatAttachment | null>(null);
    const [uploading, setUploading] = useState(false);
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

    const uploadPicked = async (picked: { uri: string; name: string; mimeType: string }) => {
        setUploading(true);
        setError(null);
        try {
            const form = new FormData();
            form.append('file', { uri: picked.uri, name: picked.name, type: picked.mimeType } as unknown as Blob);
            const res = await api.post<{ data: ChatAttachment }>(`${chatRoot}/upload`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
            setPending(res.data.data);
        } catch (err) {
            setError(axios.isAxiosError(err) ? (err.response?.data?.message ?? labels.attachFailed) : labels.attachFailed);
        } finally {
            setUploading(false);
        }
    };

    const pickPhoto = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return;
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
        if (result.canceled || !result.assets?.[0]) return;
        const a = result.assets[0];
        if (a.fileSize && a.fileSize > 5 * 1024 * 1024) { setError('Image must be 5 MB or smaller'); return; }
        await uploadPicked({ uri: a.uri, name: a.fileName ?? a.uri.split('/').pop() ?? 'photo.jpg', mimeType: a.mimeType ?? 'image/jpeg' });
    };

    const pickPdf = async () => {
        const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
        if (result.canceled || !result.assets?.[0]) return;
        const a = result.assets[0];
        if (a.size && a.size > 10 * 1024 * 1024) { setError('PDF must be 10 MB or smaller'); return; }
        await uploadPicked({ uri: a.uri, name: a.name ?? 'document.pdf', mimeType: 'application/pdf' });
    };

    const chooseAttachment = () => {
        Alert.alert('', undefined, [
            { text: labels.attachPhoto, onPress: pickPhoto },
            { text: labels.attachPdf, onPress: pickPdf },
            { text: labels.cancel, style: 'cancel' },
        ]);
    };

    const reportMessage = (m: ChatMessage) => {
        Alert.alert(labels.report, labels.reportBody, [
            { text: labels.cancel, style: 'cancel' },
            {
                text: labels.report,
                style: 'destructive',
                onPress: async () => {
                    try {
                        await api.post(`${chatRoot}/messages/${m.id}/report`, {});
                        setMessages(prev => prev.map(x => (x.id === m.id ? { ...x, reportedByMe: true } : x)));
                    } catch (err) {
                        setError(axios.isAxiosError(err) ? (err.response?.data?.message ?? 'Could not report') : 'Could not report');
                    }
                },
            },
        ]);
    };

    const send = async () => {
        const body = text.trim();
        if ((!body && !pending) || sending || uploading) return;
        setSending(true);
        setError(null);
        try {
            const res = await api.post<{ data: { message: ChatMessage; outsideOfficeHours?: boolean } }>(
                `${basePath}/messages`,
                { text: body || undefined, attachment: pending ?? undefined }
            );
            setMessages(prev => [...prev, res.data.data.message]);
            lastCreatedAt.current = res.data.data.message.createdAt;
            setText('');
            setPending(null);
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
            <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
                <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.backBtn}>
                    <ArrowLeft size={18} color="#fff" />
                </TouchableOpacity>
                <View style={styles.headerAvatar}>
                    <Text style={styles.headerAvatarText}>{title.replace(/^(Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+/i, '')[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.title} numberOfLines={1}>{title}</Text>
                    {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
                </View>
            </LinearGradient>

            <View style={[styles.notice, { backgroundColor: accent + '14' }]}>
                <ShieldCheck size={13} color={accent} />
                <Text style={[styles.noticeText, { color: theme.subText }]}>{labels.adminNotice}</Text>
            </View>

            {loading ? (
                <SkeletonList isDark={isDark} rows={5} height={46} />
            ) : (
                <ScrollView
                    ref={scrollRef}
                    contentContainerStyle={{ padding: 14, gap: 8, flexGrow: 1 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {messages.length === 0 ? (
                        <View style={styles.center}>
                            <EmptyState icon={MessageCircle} title={labels.empty} isDark={isDark} />
                        </View>
                    ) : messages.map(m => {
                        const mine = m.fromTeacher === viewerIsTeacher;
                        const canReport = !mine && !m.hidden && !m.reportedByMe;
                        return (
                            <View key={m.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                                <TouchableOpacity
                                    activeOpacity={canReport ? 0.8 : 1}
                                    onLongPress={canReport ? () => reportMessage(m) : undefined}
                                    delayLongPress={400}
                                    style={[
                                        styles.bubble,
                                        mine
                                            ? { backgroundColor: accent, borderBottomRightRadius: 4, shadowColor: accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 5, elevation: 2 }
                                            : { backgroundColor: theme.card, borderColor: theme.cardBorder, borderWidth: 1, borderBottomLeftRadius: 4 },
                                    ]}
                                >
                                    {m.attachment?.type === 'image' && (
                                        <TouchableOpacity activeOpacity={0.9} onPress={() => Linking.openURL(m.attachment!.url)}>
                                            <Image source={{ uri: m.attachment.url }} style={styles.thumb} resizeMode="cover" />
                                        </TouchableOpacity>
                                    )}
                                    {m.attachment?.type === 'pdf' && (
                                        <TouchableOpacity activeOpacity={0.8} onPress={() => Linking.openURL(m.attachment!.url)} style={styles.pdfRow}>
                                            <FileText size={18} color={mine ? '#fff' : accent} />
                                            <Text style={[styles.pdfName, { color: mine ? '#fff' : theme.text }]} numberOfLines={1}>{m.attachment.name}</Text>
                                        </TouchableOpacity>
                                    )}
                                    {(m.hidden || m.text) ? (
                                        <Text style={[
                                            styles.bubbleText,
                                            { color: mine ? '#FFFFFF' : theme.text },
                                            m.hidden && { fontStyle: 'italic', opacity: 0.7 },
                                            m.attachment && { marginTop: 6 },
                                        ]}>
                                            {m.hidden ? labels.removed : m.text}
                                        </Text>
                                    ) : null}
                                </TouchableOpacity>
                                <Text style={[styles.time, { color: theme.muted }]}>
                                    {formatTime(m.createdAt)}{m.reportedByMe ? ` · ${labels.reported}` : ''}
                                </Text>
                            </View>
                        );
                    })}
                </ScrollView>
            )}

            {(showOutsideHoursNote || outsideHoursReply) && (
                <Text style={[styles.hoursNote, { color: theme.subText }]}>{labels.outsideHours}</Text>
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            {pending && (
                <View style={[styles.pendingRow, { backgroundColor: theme.card, borderTopColor: theme.cardBorder }]}>
                    {pending.type === 'image' ? <ImageIcon size={16} color={accent} /> : <FileText size={16} color={accent} />}
                    <Text style={[styles.pendingName, { color: theme.text }]} numberOfLines={1}>{pending.name}</Text>
                    <TouchableOpacity onPress={() => setPending(null)} hitSlop={10}><X size={16} color={theme.muted} /></TouchableOpacity>
                </View>
            )}

            <View style={[styles.composer, { backgroundColor: theme.card, borderTopColor: theme.cardBorder }]}>
                <TouchableOpacity onPress={chooseAttachment} disabled={uploading || !!pending} style={[styles.attachBtn, { opacity: uploading || pending ? 0.4 : 1 }]}>
                    {uploading ? <ActivityIndicator size="small" color={accent} /> : <Paperclip size={20} color={theme.subText} />}
                </TouchableOpacity>
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
                    disabled={sending || uploading || (!text.trim() && !pending)}
                    style={[styles.sendBtn, { backgroundColor: accent, shadowColor: accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 3, opacity: sending || uploading || (!text.trim() && !pending) ? 0.5 : 1 }]}
                    accessibilityLabel={labels.send}
                >
                    {sending ? <ActivityIndicator size="small" color="#fff" /> : <Send size={17} color="#fff" />}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
    headerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
    headerAvatarText: { color: '#fff', fontSize: 16, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    backBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    title: { color: '#fff', fontSize: 15, fontFamily: 'Poppins_700Bold', lineHeight: 20, includeFontPadding: false },
    subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontFamily: 'Poppins_400Regular', lineHeight: 15, includeFontPadding: false },
    notice: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7 },
    noticeText: { flex: 1, fontSize: 10.5, fontFamily: 'Poppins_400Regular', lineHeight: 14, includeFontPadding: false },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingHorizontal: 30 },
    bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
    bubbleText: { fontSize: 13.5, fontFamily: 'Poppins_400Regular', lineHeight: 19, includeFontPadding: false },
    time: { fontSize: 9.5, fontFamily: 'Poppins_400Regular', marginTop: 2, marginHorizontal: 4, includeFontPadding: false },
    hoursNote: { fontSize: 11, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingHorizontal: 14, paddingBottom: 4, lineHeight: 15, includeFontPadding: false },
    error: { color: '#DC2626', fontSize: 11.5, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingBottom: 4, includeFontPadding: false },
    composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1 },
    input: {
        flex: 1, maxHeight: 110, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14,
        paddingVertical: Platform.OS === 'android' ? 7 : 10, fontSize: 13.5, fontFamily: 'Poppins_400Regular', includeFontPadding: false,
    },
    thumb: { width: 200, height: 150, borderRadius: 10 },
    pdfRow: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 200 },
    pdfName: { flexShrink: 1, fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1 },
    pendingName: { flex: 1, fontSize: 12, fontFamily: 'Poppins_400Regular', includeFontPadding: false },
    attachBtn: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
    sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
