import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import axios from 'axios';
import { CalendarClock, ChevronRight, Minus, Plus, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LIGHT = { bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE', text: '#0F172A', subText: '#64748B', muted: '#94A3B8' };
const DARK = { bg: '#000000', card: '#141414', cardBorder: '#2A2A2A', text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B' };

interface SessionRow {
    id: string;
    title: string;
    date: string;
    startMinute: number;
    endMinute: number;
    slotMinutes: number;
    location: string | null;
    note: string | null;
    cancelled: boolean;
    upcoming: boolean;
    booked: number;
    slots: { id: string; startMinute: number; endMinute: number; student: { id: string; name: string; rollNo: string | null; className: string | null } | null }[];
}

function clock(minute: number): string {
    const h = Math.floor(minute / 60);
    const m = minute % 60;
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function hhmm(minute: number): string {
    return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}
function prettyDate(dateStr: string): string {
    return new Date(`${dateStr}T00:00:00+05:30`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}
function localDateString(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const message = (err: unknown, fallback: string) => (axios.isAxiosError(err) ? (err.response?.data?.message ?? fallback) : fallback);

/** Entry card on the teacher home: publish PTM slots and see who booked. */
export function TeacherPtmEntry() {
    const { isDark, accent } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const [open, setOpen] = useState(false);
    return (
        <>
            <TouchableOpacity activeOpacity={0.85} onPress={() => setOpen(true)} style={[styles.entry, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <View style={[styles.entryIcon, { backgroundColor: accent.purple + '1A' }]}><CalendarClock size={18} color={accent.purple} /></View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.entryTitle, { color: theme.text }]}>Parent meetings</Text>
                    <Text style={[styles.entrySub, { color: theme.subText }]} numberOfLines={1}>Publish PTM slots; parents book from the app</Text>
                </View>
                <ChevronRight size={16} color={theme.muted} />
            </TouchableOpacity>
            <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
                <PtmScreen onClose={() => setOpen(false)} />
            </Modal>
        </>
    );
}

function PtmScreen({ onClose }: { onClose: () => void }) {
    const { isDark, accent } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const [sessions, setSessions] = useState<SessionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await api.get<{ data: SessionRow[] }>('/teacher/ptm/sessions');
            setSessions(res.data.data);
            setError(null);
        } catch (err) { setError(message(err, 'Could not load meetings')); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(load, 30_000);
        return () => clearInterval(id);
    }, [load]);

    const release = (slotId: string, name: string) => Alert.alert('Release this slot?', `${name} will be notified and can book another.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Release', style: 'destructive', onPress: async () => { try { await api.patch(`/teacher/ptm/slots/${slotId}/release`); await load(); } catch (err) { Alert.alert('', message(err, 'Could not release')); } } },
    ]);

    const cancelSession = (id: string) => Alert.alert('Cancel this meeting?', 'Parents with a booking will be notified.', [
        { text: 'Keep', style: 'cancel' },
        { text: 'Cancel meeting', style: 'destructive', onPress: async () => { try { await api.delete(`/teacher/ptm/sessions/${id}`); await load(); } catch (err) { Alert.alert('', message(err, 'Could not cancel')); } } },
    ]);

    if (creating) return <NewSession onBack={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Parent meetings</Text>
                <TouchableOpacity onPress={() => setCreating(true)} style={[styles.newBtn, { backgroundColor: accent.purple }]}>
                    <Plus size={14} color="#fff" /><Text style={styles.newBtnText}>New</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} hitSlop={12} style={{ marginLeft: 12 }}><X size={20} color={theme.text} /></TouchableOpacity>
            </View>
            {loading ? <View style={styles.center}><ActivityIndicator color={accent.purple} /></View> : (
                <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }} showsVerticalScrollIndicator={false}>
                    {error && <Text style={[styles.info, { color: '#DC2626' }]}>{error}</Text>}
                    {!error && sessions.length === 0 && <Text style={[styles.info, { color: theme.muted }]}>No meetings yet. Tap New to publish slots.</Text>}
                    {sessions.map(s => (
                        <View key={s.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, opacity: s.cancelled || !s.upcoming ? 0.65 : 1 }]}>
                            <TouchableOpacity activeOpacity={0.85} onPress={() => setExpanded(expanded === s.id ? null : s.id)}>
                                <Text style={[styles.cardTitle, { color: theme.text }]}>{s.title}{s.cancelled ? ' · Cancelled' : ''}</Text>
                                <Text style={[styles.meta, { color: theme.subText }]}>{prettyDate(s.date)} · {clock(s.startMinute)} – {clock(s.endMinute)}{s.location ? ` · ${s.location}` : ''}</Text>
                                <Text style={[styles.meta, { color: accent.purple }]}>{s.booked} of {s.slots.length} booked</Text>
                            </TouchableOpacity>
                            {expanded === s.id && (
                                <View style={{ marginTop: 8, gap: 6 }}>
                                    {s.slots.map(sl => (
                                        <View key={sl.id} style={[styles.slotRow, { borderColor: theme.cardBorder }]}>
                                            <Text style={[styles.slotTime, { color: theme.text }]}>{clock(sl.startMinute)}</Text>
                                            <Text style={[styles.meta, { flex: 1, color: sl.student ? theme.text : theme.muted }]} numberOfLines={1}>
                                                {sl.student ? `${sl.student.name}${sl.student.className ? ` · ${sl.student.className}` : ''}` : 'Free'}
                                            </Text>
                                            {sl.student && !s.cancelled && s.upcoming && (
                                                <TouchableOpacity onPress={() => release(sl.id, sl.student!.name)}><Text style={styles.release}>Release</Text></TouchableOpacity>
                                            )}
                                        </View>
                                    ))}
                                    {!s.cancelled && s.upcoming && (
                                        <TouchableOpacity onPress={() => cancelSession(s.id)} style={[styles.outlineBtn, { borderColor: '#DC2626' }]}>
                                            <Text style={{ color: '#DC2626', fontFamily: 'Poppins_600SemiBold', fontSize: 12.5 }}>Cancel meeting</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}
                        </View>
                    ))}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

function Stepper({ label, minute, onChange }: { label: string; minute: number; onChange: (m: number) => void }) {
    const { isDark, accent } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    return (
        <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.label, { color: theme.subText }]}>{label}</Text>
            <View style={[styles.stepper, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
                <TouchableOpacity onPress={() => onChange(Math.max(6 * 60, minute - 30))} hitSlop={8}><Minus size={16} color={accent.purple} /></TouchableOpacity>
                <Text style={[styles.stepperText, { color: theme.text }]}>{clock(minute)}</Text>
                <TouchableOpacity onPress={() => onChange(Math.min(22 * 60, minute + 30))} hitSlop={8}><Plus size={16} color={accent.purple} /></TouchableOpacity>
            </View>
        </View>
    );
}

function NewSession({ onBack, onCreated }: { onBack: () => void; onCreated: () => void }) {
    const { isDark, accent } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i + 1); return d; });
    const [title, setTitle] = useState('Parent-teacher meeting');
    const [date, setDate] = useState(localDateString(days[0]));
    const [start, setStart] = useState(10 * 60);
    const [end, setEnd] = useState(12 * 60);
    const [slotMinutes, setSlotMinutes] = useState(15);
    const [location, setLocation] = useState('');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const slots = end > start ? Math.floor((end - start) / slotMinutes) : 0;

    const create = async () => {
        if (saving || slots < 1) return;
        setSaving(true);
        try {
            await api.post('/teacher/ptm/sessions', {
                title: title.trim() || 'Parent-teacher meeting', date, startTime: hhmm(start), endTime: hhmm(end), slotMinutes,
                location: location.trim() || undefined, note: note.trim() || undefined,
            });
            onCreated();
        } catch (err) { Alert.alert('', message(err, 'Could not publish the meeting')); }
        finally { setSaving(false); }
    };

    const input = [styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.cardBorder }];
    const chip = (active: boolean) => [styles.chip, { borderColor: active ? accent.purple : theme.cardBorder, backgroundColor: active ? accent.purple + '18' : theme.card }];

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
                <Text style={[styles.headerTitle, { color: theme.text }]}>New meeting</Text>
                <TouchableOpacity onPress={onBack} hitSlop={12}><X size={20} color={theme.text} /></TouchableOpacity>
            </View>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
                    <TextInput value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={theme.muted} maxLength={100} style={input} underlineColorAndroid="transparent" />
                    <Text style={[styles.label, { color: theme.text }]}>Date</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {days.map(d => {
                            const ds = localDateString(d);
                            return (
                                <TouchableOpacity key={ds} onPress={() => setDate(ds)} style={chip(date === ds)}>
                                    <Text style={[styles.chipText, { color: date === ds ? accent.purple : theme.text }]}>{d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Stepper label="From" minute={start} onChange={setStart} />
                        <Stepper label="To" minute={end} onChange={setEnd} />
                    </View>
                    <Text style={[styles.label, { color: theme.text }]}>Minutes per parent</Text>
                    <View style={styles.chipRow}>
                        {[10, 15, 20, 30].map(m => (
                            <TouchableOpacity key={m} onPress={() => setSlotMinutes(m)} style={chip(slotMinutes === m)}>
                                <Text style={[styles.chipText, { color: slotMinutes === m ? accent.purple : theme.text }]}>{m} min</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <Text style={[styles.meta, { color: slots > 0 ? theme.subText : '#DC2626' }]}>{slots > 0 ? `${slots} slots will be created` : 'End time must be after start time'}</Text>
                    <TextInput value={location} onChangeText={setLocation} placeholder="Location, e.g. Room 4 (optional)" placeholderTextColor={theme.muted} maxLength={100} style={input} underlineColorAndroid="transparent" />
                    <TextInput value={note} onChangeText={setNote} placeholder="Note for parents (optional)" placeholderTextColor={theme.muted} maxLength={300} multiline style={[...input, { minHeight: 60 }]} underlineColorAndroid="transparent" />
                    <TouchableOpacity onPress={create} disabled={saving || slots < 1} style={[styles.primaryBtn, { backgroundColor: accent.purple, opacity: saving || slots < 1 ? 0.5 : 1 }]}>
                        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Publish slots</Text>}
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    entry: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 14 },
    entryIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    entryTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', lineHeight: 19, includeFontPadding: false },
    entrySub: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', lineHeight: 16, includeFontPadding: false },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1 },
    headerTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false, flex: 1 },
    newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 },
    newBtnText: { color: '#fff', fontSize: 12, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    info: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingVertical: 16 },
    card: { borderRadius: 16, borderWidth: 1, padding: 14 },
    cardTitle: { fontSize: 14.5, fontFamily: 'Poppins_700Bold', lineHeight: 20, includeFontPadding: false },
    meta: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', lineHeight: 16, includeFontPadding: false },
    label: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    slotRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
    slotTime: { width: 68, fontSize: 12, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    release: { color: '#DC2626', fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: Platform.OS === 'android' ? 8 : 12, fontSize: 13.5, fontFamily: 'Poppins_400Regular', includeFontPadding: false },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1.5, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7 },
    chipText: { fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
    stepperText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    primaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    primaryBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    outlineBtn: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 9, alignItems: 'center', marginTop: 4 },
});
