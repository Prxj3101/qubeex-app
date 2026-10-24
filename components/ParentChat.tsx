import { ChatThreadView } from '@/components/chat/ChatThreadView';
import { useTheme } from '@/context/ThemeContext';
import { useParentModeLanguage } from '@/context/ParentModeLanguageContext';
import api from '@/lib/api';
import { t } from '@/lib/parentModeI18n';
import { ChevronRight, MessageCircle, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LIGHT = { bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE', text: '#0F172A', subText: '#64748B', muted: '#94A3B8' };
const DARK = { bg: '#000000', card: '#141414', cardBorder: '#2A2A2A', text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B' };

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
        <View style={[styles.avatar, { backgroundColor: color, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#fff', includeFontPadding: false }}>{name[0]?.toUpperCase() ?? '?'}</Text>
        </View>
    );
}

/** Entry card for Parent Mode: shows the unread count and opens the chat screen. */
export function ParentChatEntry({ isDark }: { isDark: boolean }) {
    const { accent } = useTheme();
    const { lang } = useParentModeLanguage();
    const theme = isDark ? DARK : LIGHT;
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
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setOpen(true)}
                style={[styles.entry, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            >
                <View style={[styles.entryIcon, { backgroundColor: accent.purple + '1A' }]}>
                    <MessageCircle size={18} color={accent.purple} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.entryTitle, { color: theme.text }]}>{t('parentMessages', lang)}</Text>
                    <Text style={[styles.entrySub, { color: theme.subText }]} numberOfLines={1}>{t('messageTeachersSub', lang)}</Text>
                </View>
                {unread > 0 && (
                    <View style={styles.badge}><Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text></View>
                )}
                <ChevronRight size={16} color={theme.muted} />
            </TouchableOpacity>

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

    const load = useCallback(async () => {
        try {
            const res = await api.get<{ data: ContactsPayload }>('/student/parent-chat/contacts');
            setData(res.data.data);
        } catch { /* silent */ }
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
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
                <Text style={[styles.headerTitle, { color: theme.text }]}>{t('parentMessages', lang)}</Text>
                <TouchableOpacity onPress={onClose} hitSlop={12}><X size={20} color={theme.text} /></TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.center}><ActivityIndicator color={accent.purple} /></View>
            ) : (
                <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }} showsVerticalScrollIndicator={false}>
                    {data && !data.settings.enabled && (
                        <Text style={[styles.info, { color: theme.subText }]}>{t('chatTurnedOff', lang)}</Text>
                    )}
                    {data && data.contacts.length === 0 && (
                        <Text style={[styles.info, { color: theme.muted }]}>{t('noClassTeachers', lang)}</Text>
                    )}
                    {data?.contacts.map(c => (
                        <TouchableOpacity
                            key={c.teacherId}
                            activeOpacity={0.85}
                            onPress={() => setActive(c)}
                            style={[styles.row, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                        >
                            <Avatar name={c.name} avatarUrl={c.avatarUrl} color={accent.purple} />
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>
                                    {c.prefix ? `${c.prefix} ` : ''}{c.name}
                                </Text>
                                <Text style={[styles.rowSub, { color: theme.subText }]} numberOfLines={1}>
                                    {c.isClassTeacher ? t('classTeacherTag', lang) : c.subjects.join(', ')}
                                    {c.isClassTeacher && c.subjects.length > 0 ? ` · ${c.subjects.join(', ')}` : ''}
                                </Text>
                                {c.lastMessage ? (
                                    <Text style={[styles.rowLast, { color: theme.muted }]} numberOfLines={1}>
                                        {c.lastMessage.fromTeacher ? '' : '↗ '}{c.lastMessage.text}
                                    </Text>
                                ) : null}
                            </View>
                            {c.unread > 0 && (
                                <View style={styles.badge}><Text style={styles.badgeText}>{c.unread}</Text></View>
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
    avatar: { width: 40, height: 40, borderRadius: 20 },
    rowName: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold', lineHeight: 19, includeFontPadding: false },
    rowSub: { fontSize: 11, fontFamily: 'Poppins_400Regular', lineHeight: 15, includeFontPadding: false },
    rowLast: { fontSize: 11, fontFamily: 'Poppins_400Regular', lineHeight: 15, marginTop: 2, includeFontPadding: false },
});
