import { ChatThreadView } from '@/components/chat/ChatThreadView';
import { useTheme } from '@/context/ThemeContext';
import { useParentModeLanguage } from '@/context/ParentModeLanguageContext';
import api from '@/lib/api';
import { t } from '@/lib/parentModeI18n';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, MessageCircle, Star } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DARK, EmptyState, EntryCard, ErrorState, GradientHeader, LIGHT, SkeletonList, cardShadow, shade } from './parentUi';

interface Contact {
    teacherId: string;
    name: string;
    prefix: string | null;
    avatarUrl: string | null;
    isClassTeacher: boolean;
    subjects: string[];
    unread: number;
    lastMessage: { text: string; fromTeacher: boolean; createdAt: string } | null;
}

interface ContactsPayload {
    settings: { enabled: boolean; officeStart: string; officeEnd: string; withinOfficeHours: boolean };
    contacts: Contact[];
}

function Avatar({ name, avatarUrl, color }: { name: string; avatarUrl: string | null; color: string }) {
    if (avatarUrl) return <Image source={{ uri: avatarUrl }} style={styles.avatar} />;
    return (
        <LinearGradient colors={[shade(color, 0.3), color]} style={[styles.avatar, { alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: '#fff', includeFontPadding: false }}>{name[0]?.toUpperCase() ?? '?'}</Text>
        </LinearGradient>
    );
}

/** Entry card for Parent Mode: shows the unread count and opens the chat screen. */
export function ParentChatEntry({ isDark }: { isDark: boolean }) {
    const { lang } = useParentModeLanguage();
    const [open, setOpen] = useState(false);
    const [unread, setUnread] = useState(0);

    const refreshUnread = useCallback(async () => {
        try {
            const res = await api.get<{ data: { unread: number } }>('/student/parent-chat/unread-count');
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
            <EntryCard icon={MessageCircle} title={t('parentMessages', lang)} subtitle={t('messageTeachersSub', lang)} badge={unread} isDark={isDark} onPress={() => setOpen(true)} />

            <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
                <ParentChatScreen isDark={isDark} onClose={() => { setOpen(false); refreshUnread(); }} />
            </Modal>
        </>
    );
}

function ParentChatScreen({ isDark, onClose }: { isDark: boolean; onClose: () => void }) {
    const { accent } = useTheme();
    const { lang } = useParentModeLanguage();
    const theme = isDark ? DARK : LIGHT;
    const [data, setData] = useState<ContactsPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [active, setActive] = useState<Contact | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await api.get<{ data: ContactsPayload }>('/student/parent-chat/contacts');
            setData(res.data.data);
            setLoadError(null);
        } catch (err) {
            const status = axios.isAxiosError(err) ? err.response?.status : undefined;
            setLoadError(status ? `Could not load teachers (error ${status})` : 'Could not reach the server');
        }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const labels = {
        placeholder: t('typeMessage', lang),
        send: t('sendMessage', lang),
        empty: t('noChatYet', lang),
        removed: t('messageRemoved', lang),
        adminNotice: t('chatAdminNotice', lang),
        outsideHours: t('chatOutsideHours', lang),
        attachPhoto: t('attachPhoto', lang),
        attachPdf: t('attachPdf', lang),
        report: t('reportMessageAction', lang),
        reportBody: t('reportConfirmBody', lang),
        reported: t('reportedTag', lang),
        cancel: t('cancelAction', lang),
        attachFailed: t('attachFailed', lang),
    };

    if (active) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: theme.card }}>
                <ChatThreadView
                    isDark={isDark}
                    accent={accent.purple}
                    title={`${active.prefix ? `${active.prefix} ` : ''}${active.name}`}
                    subtitle={active.isClassTeacher ? t('classTeacherTag', lang) : active.subjects.join(', ')}
                    basePath={`/student/parent-chat/teachers/${active.teacherId}`}
                    chatRoot="/student/parent-chat"
                    viewerIsTeacher={false}
                    labels={labels}
                    showOutsideHoursNote={data ? !data.settings.withinOfficeHours : false}
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
                title={t('parentMessages', lang)}
                subtitle={data?.contacts.length ? `${data.contacts.length}` + ' · ' + t('messageTeachersSub', lang) : t('messageTeachersSub', lang)}
                onClose={onClose}
            />

            {loading ? (
                <SkeletonList isDark={isDark} height={70} />
            ) : (
                <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }} showsVerticalScrollIndicator={false}>
                    {loadError && <ErrorState text={loadError} isDark={isDark} onRetry={load} />}
                    {data && !data.settings.enabled && (
                        <EmptyState icon={MessageCircle} title={t('chatTurnedOff', lang)} isDark={isDark} />
                    )}
                    {data && data.settings.enabled && data.contacts.length === 0 && (
                        <EmptyState icon={MessageCircle} title={t('noClassTeachers', lang)} isDark={isDark} />
                    )}
                    {data?.contacts.map(c => (
                        <TouchableOpacity
                            key={c.teacherId}
                            activeOpacity={0.88}
                            onPress={() => setActive(c)}
                            style={[styles.row, cardShadow(isDark), { backgroundColor: theme.card, borderColor: c.unread > 0 ? accent.purple + '66' : theme.cardBorder }]}
                        >
                            <Avatar name={c.name} avatarUrl={c.avatarUrl} color={accent.purple} />
                            <View style={{ flex: 1, gap: 2 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={[styles.rowName, { color: theme.text, flexShrink: 1 }]} numberOfLines={1}>
                                        {c.prefix ? `${c.prefix} ` : ''}{c.name}
                                    </Text>
                                    {c.isClassTeacher && <Star size={12} color={accent.purple} fill={accent.purple} />}
                                </View>
                                <Text style={[styles.rowSub, { color: theme.subText }]} numberOfLines={1}>
                                    {c.isClassTeacher ? t('classTeacherTag', lang) : c.subjects.join(', ')}
                                    {c.isClassTeacher && c.subjects.length > 0 ? ` · ${c.subjects.join(', ')}` : ''}
                                </Text>
                                {c.lastMessage ? (
                                    <Text style={[styles.rowLast, { color: c.unread > 0 ? theme.text : theme.muted }]} numberOfLines={1}>
                                        {c.lastMessage.fromTeacher ? '' : '↗ '}{c.lastMessage.text}
                                    </Text>
                                ) : null}
                            </View>
                            {c.unread > 0 ? (
                                <View style={styles.badge}><Text style={styles.badgeText}>{c.unread}</Text></View>
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
    avatar: { width: 46, height: 46, borderRadius: 23 },
    rowName: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold', lineHeight: 19, includeFontPadding: false },
    rowSub: { fontSize: 11, fontFamily: 'Poppins_400Regular', lineHeight: 15, includeFontPadding: false },
    rowLast: { fontSize: 11, fontFamily: 'Poppins_400Regular', lineHeight: 15, marginTop: 2, includeFontPadding: false },
});
