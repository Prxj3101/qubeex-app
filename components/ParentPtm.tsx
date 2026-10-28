import { useTheme } from '@/context/ThemeContext';
import { useParentModeLanguage } from '@/context/ParentModeLanguageContext';
import api from '@/lib/api';
import { t } from '@/lib/parentModeI18n';
import axios from 'axios';
import { CalendarCheck, CalendarClock, Clock, MapPin, UserRound } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BAD, Chip, DARK, EmptyState, EntryCard, ErrorState, GOOD, GradientHeader, LIGHT, ProgressBar, SkeletonList, WARN, cardShadow, shade, useGradient } from './parentUi';

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
    const { lang } = useParentModeLanguage();
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
            <EntryCard icon={CalendarClock} title={t('ptmTitle', lang)} subtitle={t('ptmSub', lang)} badge={open_} isDark={isDark} onPress={() => setOpen(true)} />

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
    const gradient = useGradient(isDark);
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

    const booked = sessions.filter(x => x.myBooking).length;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
            <GradientHeader
                isDark={isDark}
                icon={CalendarClock}
                title={t('ptmTitle', lang)}
                subtitle={sessions.length ? `${booked}/${sessions.length} ${t('yourSlot', lang).toLowerCase()}` : t('ptmSub', lang)}
                onClose={onClose}
            />
            {loading ? (
                <SkeletonList isDark={isDark} height={150} rows={3} />
            ) : (
                <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} showsVerticalScrollIndicator={false}>
                    {error && <ErrorState text={error} isDark={isDark} onRetry={load} />}
                    {!error && sessions.length === 0 && <EmptyState icon={CalendarClock} title={t('noPtm', lang)} text={t('ptmSub', lang)} isDark={isDark} />}
                    {sessions.map(s => {
                        const date = new Date(`${s.date}T00:00:00+05:30`);
                        const total = s.slots.length;
                        const taken = total - s.freeSlots;
                        const full = !s.myBooking && s.freeSlots === 0;
                        return (
                            <View key={s.id} style={[styles.card, cardShadow(isDark), { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                                <View style={styles.cardTop}>
                                    <LinearGradient colors={s.myBooking ? [GOOD, shade(GOOD, -0.25)] : gradient} style={styles.dateTile}>
                                        <Text style={styles.dateDay}>{date.toLocaleDateString([], { day: 'numeric' })}</Text>
                                        <Text style={styles.dateMon}>{date.toLocaleDateString([], { month: 'short' }).toUpperCase()}</Text>
                                    </LinearGradient>
                                    <View style={{ flex: 1, gap: 2 }}>
                                        <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>{s.title}</Text>
                                        <View style={styles.metaRow}>
                                            <UserRound size={12} color={theme.muted} />
                                            <Text style={[styles.meta, { color: theme.subText }]} numberOfLines={1}>
                                                {s.teacherPrefix ? `${s.teacherPrefix} ` : ''}{s.teacherName}
                                                {s.isClassTeacher ? ` · ${t('classTeacherTag', lang)}` : s.subjects.length ? ` · ${s.subjects.join(', ')}` : ''}
                                            </Text>
                                        </View>
                                        <View style={styles.metaRow}>
                                            <Clock size={12} color={theme.muted} />
                                            <Text style={[styles.meta, { color: theme.subText }]}>{prettyDate(s.date)} · {clock(s.startMinute)} – {clock(s.endMinute)}</Text>
                                        </View>
                                        {s.location ? (
                                            <View style={styles.metaRow}>
                                                <MapPin size={12} color={theme.muted} />
                                                <Text style={[styles.meta, { color: theme.subText }]}>{s.location}</Text>
                                            </View>
                                        ) : null}
                                    </View>
                                </View>
                                {s.note ? <Text style={[styles.note, { color: theme.text, backgroundColor: accent.purple + '10' }]}>{s.note}</Text> : null}

                                {s.myBooking ? (
                                    <View style={[styles.mine, { backgroundColor: GOOD + '14', borderColor: GOOD + '55' }]}>
                                        <CalendarCheck size={20} color={GOOD} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.mineLabel}>{t('yourSlot', lang)}</Text>
                                            <Text style={[styles.mineTime, { color: theme.text }]}>{clock(s.myBooking.startMinute)} – {clock(s.myBooking.endMinute)}</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => cancel(s)} disabled={busy} style={[styles.cancelBtn, { borderColor: BAD + '55' }]}>
                                            <Text style={styles.cancelText}>{t('cancelBookingAction', lang)}</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <>
                                        <View style={{ gap: 6, marginTop: 10 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Text style={[styles.meta, { color: full ? BAD : theme.subText }]}>{s.freeSlots} {t('slotsLeft', lang)}</Text>
                                                {full && <Chip label={t('formClosedTag', lang)} color={BAD} />}
                                            </View>
                                            <ProgressBar value={taken} total={total} color={s.freeSlots <= 2 ? WARN : accent.purple} isDark={isDark} height={6} />
                                        </View>
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
                        );
                    })}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    card: { borderRadius: 20, borderWidth: 1, padding: 14 },
    cardTop: { flexDirection: 'row', gap: 12 },
    dateTile: { width: 54, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    dateDay: { color: '#fff', fontSize: 21, fontFamily: 'Poppins_700Bold', lineHeight: 25, includeFontPadding: false },
    dateMon: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.8, includeFontPadding: false },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    cancelBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
    cardTitle: { fontSize: 15, fontFamily: 'Poppins_700Bold', lineHeight: 21, includeFontPadding: false },
    meta: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', lineHeight: 16, includeFontPadding: false },
    note: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', lineHeight: 18, marginTop: 10, padding: 10, borderRadius: 12, overflow: 'hidden', includeFontPadding: false },
    slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    slot: { borderWidth: 1.5, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 },
    slotText: { fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    mine: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 10 },
    mineLabel: { fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: '#059669', includeFontPadding: false },
    mineTime: { fontSize: 14, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    cancelText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#DC2626', includeFontPadding: false },
});
