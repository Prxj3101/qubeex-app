import { useTheme } from '@/context/ThemeContext';
import { useParentModeLanguage } from '@/context/ParentModeLanguageContext';
import api from '@/lib/api';
import { t } from '@/lib/parentModeI18n';
import axios from 'axios';
import { CalendarClock, ChevronRight, MapPin, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LIGHT = { bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE', text: '#0F172A', subText: '#64748B', muted: '#94A3B8' };
const DARK = { bg: '#000000', card: '#141414', cardBorder: '#2A2A2A', text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B' };

interface Slot { id: string; startMinute: number; endMinute: number; mine: boolean; free: boolean }
interface Session {
    id: string;
    title: string;
    teacherName: string;
    teacherPrefix: string | null;
    isClassTeacher: boolean;
    subjects: string[];
    date: string;
    startMinute: number;
    endMinute: number;
    location: string | null;
    note: string | null;
    freeSlots: number;
    myBooking: { slotId: string; startMinute: number; endMinute: number; canCancel: boolean } | null;
    slots: Slot[];
}

function clock(minute: number): string {
    const h = Math.floor(minute / 60);
    const m = minute % 60;
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function prettyDate(dateStr: string): string {
    return new Date(`${dateStr}T00:00:00+05:30`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Entry card for Parent Mode: book a parent-teacher meeting slot. */
export function ParentPtmEntry({ isDark }: { isDark: boolean }) {
    const { accent } = useTheme();
    const { lang } = useParentModeLanguage();
    const theme = isDark ? DARK : LIGHT;
    const [open, setOpen] = useState(false);
    const [open_, setOpenCount] = useState(0);

    const refresh = useCallback(async () => {
        try {
            const res = await api.get<{ data: { sessions: Session[] } }>('/student/ptm/sessions');
            setOpenCount(res.data.data.sessions.filter(s => !s.myBooking && s.freeSlots > 0).length);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        refresh();
        const id = setInterval(refresh, 60_000);
        return () => clearInterval(id);
    }, [refresh]);

    return (
        <>
            <TouchableOpacity activeOpacity={0.85} onPress={() => setOpen(true)} style={[styles.entry, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <View style={[styles.entryIcon, { backgroundColor: accent.purple + '1A' }]}>
                    <CalendarClock size={18} color={accent.purple} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.entryTitle, { color: theme.text }]}>{t('ptmTitle', lang)}</Text>
                    <Text style={[styles.entrySub, { color: theme.subText }]} numberOfLines={1}>{t('ptmSub', lang)}</Text>
                </View>
                {open_ > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{open_}</Text></View>}
                <ChevronRight size={16} color={theme.muted} />
            </TouchableOpacity>

            <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
                <PtmScreen isDark={isDark} onClose={() => { setOpen(false); refresh(); }} />
            </Modal>
        </>
    );
}

function PtmScreen({ isDark, onClose }: { isDark: boolean; onClose: () => void }) {
    const { accent } = useTheme();
    const { lang } = useParentModeLanguage();
    const theme = isDark ? DARK : LIGHT;
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await api.get<{ data: { sessions: Session[] } }>('/student/ptm/sessions');
            setSessions(res.data.data.sessions);
            setError(null);
        } catch (err) {
            const status = axios.isAxiosError(err) ? err.response?.status : undefined;
            setError(status ? `Could not load meetings (error ${status})` : 'Could not reach the server');
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const message = (err: unknown, fallback: string) =>
        axios.isAxiosError(err) ? (err.response?.data?.message ?? fallback) : fallback;

    const book = (s: Session, slot: Slot) => {
        Alert.alert(t('bookThisSlot', lang), `${prettyDate(s.date)} · ${clock(slot.startMinute)} – ${clock(slot.endMinute)}`, [
            { text: t('cancelAction', lang), style: 'cancel' },
            {
                text: t('bookAction', lang),
                onPress: async () => {
                    setBusy(true);
                    try {
                        await api.post(`/student/ptm/slots/${slot.id}/book`);
                        Alert.alert('', t('bookedConfirmed', lang));
                    } catch (err) {
                        Alert.alert('', message(err, 'Could not book'));
                    } finally { setBusy(false); await load(); }
                },
            },
        ]);
    };

    const cancel = (s: Session) => {
        const b = s.myBooking;
        if (!b) return;
        if (!b.canCancel) { Alert.alert('', t('cantCancelSoon', lang)); return; }
        Alert.alert(t('cancelBookingAction', lang), t('cancelBookingBody', lang), [
            { text: t('cancelAction', lang), style: 'cancel' },
            {
                text: t('cancelBookingAction', lang),
                style: 'destructive',
                onPress: async () => {
                    setBusy(true);
                    try { await api.delete(`/student/ptm/slots/${b.slotId}/book`); }
                    catch (err) { Alert.alert('', message(err, 'Could not cancel')); }
                    finally { setBusy(false); await load(); }
                },
            },
        ]);
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
                <Text style={[styles.headerTitle, { color: theme.text }]}>{t('ptmTitle', lang)}</Text>
                <TouchableOpacity onPress={onClose} hitSlop={12}><X size={20} color={theme.text} /></TouchableOpacity>
            </View>
            {loading ? (
                <View style={styles.center}><ActivityIndicator color={accent.purple} /></View>
            ) : (
                <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} showsVerticalScrollIndicator={false}>
                    {error && <Text style={[styles.info, { color: '#DC2626' }]}>{error}</Text>}
                    {!error && sessions.length === 0 && <Text style={[styles.info, { color: theme.muted }]}>{t('noPtm', lang)}</Text>}
                    {sessions.map(s => (
                        <View key={s.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                            <Text style={[styles.cardTitle, { color: theme.text }]}>{s.title}</Text>
                            <Text style={[styles.meta, { color: theme.subText }]}>
                                {s.teacherPrefix ? `${s.teacherPrefix} ` : ''}{s.teacherName}
                                {s.isClassTeacher ? ` · ${t('classTeacherTag', lang)}` : s.subjects.length ? ` · ${s.subjects.join(', ')}` : ''}
                            </Text>
                            <Text style={[styles.meta, { color: theme.subText }]}>{prettyDate(s.date)} · {clock(s.startMinute)} – {clock(s.endMinute)}</Text>
                            {s.location ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <MapPin size={12} color={theme.muted} />
                                    <Text style={[styles.meta, { color: theme.subText }]}>{s.location}</Text>
                                </View>
                            ) : null}
                            {s.note ? <Text style={[styles.note, { color: theme.text }]}>{s.note}</Text> : null}

                            {s.myBooking ? (
                                <View style={[styles.mine, { backgroundColor: '#05966914', borderColor: '#05966955' }]}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.mineLabel}>{t('yourSlot', lang)}</Text>
                                        <Text style={[styles.mineTime, { color: theme.text }]}>{clock(s.myBooking.startMinute)} – {clock(s.myBooking.endMinute)}</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => cancel(s)} disabled={busy}>
                                        <Text style={styles.cancelText}>{t('cancelBookingAction', lang)}</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <>
                                    <Text style={[styles.meta, { color: theme.subText, marginTop: 6 }]}>{s.freeSlots} {t('slotsLeft', lang)}</Text>
                                    <View style={styles.slotGrid}>
                                        {s.slots.filter(sl => sl.free).map(sl => (
                                            <TouchableOpacity
                                                key={sl.id}
                                                disabled={busy}
                                                onPress={() => book(s, sl)}
                                                style={[styles.slot, { borderColor: accent.purple, backgroundColor: accent.purple + '12' }]}
                                            >
                                                <Text style={[styles.slotText, { color: accent.purple }]}>{clock(sl.startMinute)}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </>
                            )}
                        </View>
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
    headerTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false, flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    info: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingVertical: 16 },
    card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 3 },
    cardTitle: { fontSize: 15, fontFamily: 'Poppins_700Bold', lineHeight: 21, includeFontPadding: false },
    meta: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', lineHeight: 16, includeFontPadding: false },
    note: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', lineHeight: 18, marginTop: 4, includeFontPadding: false },
    slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    slot: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
    slotText: { fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    mine: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
    mineLabel: { fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: '#059669', includeFontPadding: false },
    mineTime: { fontSize: 14, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    cancelText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#DC2626', includeFontPadding: false },
});
