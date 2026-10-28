import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import axios from 'axios';
import { ChevronRight, ClipboardCheck, Plus, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LIGHT = { bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE', text: '#0F172A', subText: '#64748B', muted: '#94A3B8' };
const DARK = { bg: '#000000', card: '#141414', cardBorder: '#2A2A2A', text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B' };

interface FormRow {
    id: string;
    kind: 'SLIP' | 'POLL';
    title: string;
    deadline: string | null;
    closed: boolean;
    audience: number;
    answered: number;
}

interface Results {
    id: string;
    kind: 'SLIP' | 'POLL';
    title: string;
    description: string | null;
    options: string[];
    deadline: string | null;
    closed: boolean;
    counts: { label: string; count: number }[];
    total: number;
    answered: number;
    students: { studentId: string; name: string; rollNo: string | null; className: string | null; optionIndex: number | null; comment: string | null; changes: number }[];
}

const DEADLINES: { label: string; days: number | null }[] = [
    { label: 'No deadline', days: null },
    { label: 'Tomorrow', days: 1 },
    { label: '3 days', days: 3 },
    { label: '1 week', days: 7 },
];

function endOfDayIn(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(23, 59, 0, 0);
    return d.toISOString();
}

const message = (err: unknown, fallback: string) => (axios.isAxiosError(err) ? (err.response?.data?.message ?? fallback) : fallback);

/** Entry card on the teacher home: send permission slips and polls to your class. */
export function TeacherFormsEntry() {
    const { isDark, accent } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const [open, setOpen] = useState(false);
    return (
        <>
            <TouchableOpacity activeOpacity={0.85} onPress={() => setOpen(true)} style={[styles.entry, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <View style={[styles.entryIcon, { backgroundColor: accent.purple + '1A' }]}><ClipboardCheck size={18} color={accent.purple} /></View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.entryTitle, { color: theme.text }]}>Forms & polls</Text>
                    <Text style={[styles.entrySub, { color: theme.subText }]} numberOfLines={1}>Permission slips and polls for your class</Text>
                </View>
                <ChevronRight size={16} color={theme.muted} />
            </TouchableOpacity>
            <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
                <FormsScreen onClose={() => setOpen(false)} />
            </Modal>
        </>
    );
}

type View_ = { name: 'list' } | { name: 'new' } | { name: 'results'; id: string };

function FormsScreen({ onClose }: { onClose: () => void }) {
    const { isDark, accent } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const [view, setView] = useState<View_>({ name: 'list' });
    const [forms, setForms] = useState<FormRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await api.get<{ data: FormRow[] }>('/teacher/parent-forms');
            setForms(res.data.data);
            setError(null);
        } catch (err) { setError(message(err, 'Could not load forms')); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    if (view.name === 'new') {
        return <NewForm onBack={() => setView({ name: 'list' })} onCreated={() => { setView({ name: 'list' }); load(); }} />;
    }
    if (view.name === 'results') {
        return <ResultsView id={view.id} onBack={() => { setView({ name: 'list' }); load(); }} />;
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Forms & polls</Text>
                <TouchableOpacity onPress={() => setView({ name: 'new' })} style={[styles.newBtn, { backgroundColor: accent.purple }]}>
                    <Plus size={14} color="#fff" /><Text style={styles.newBtnText}>New</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} hitSlop={12} style={{ marginLeft: 12 }}><X size={20} color={theme.text} /></TouchableOpacity>
            </View>
            {loading ? <View style={styles.center}><ActivityIndicator color={accent.purple} /></View> : (
                <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }} showsVerticalScrollIndicator={false}>
                    {error && <Text style={[styles.info, { color: '#DC2626' }]}>{error}</Text>}
                    {!error && forms.length === 0 && <Text style={[styles.info, { color: theme.muted }]}>You haven&apos;t sent any forms yet.</Text>}
                    {forms.map(f => (
                        <TouchableOpacity key={f.id} activeOpacity={0.85} onPress={() => setView({ name: 'results', id: f.id })} style={[styles.row, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.kind, { color: accent.purple }]}>{f.kind === 'SLIP' ? 'Permission slip' : 'Poll'}{f.closed ? ' · Closed' : ''}</Text>
                                <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={2}>{f.title}</Text>
                            </View>
                            <Text style={[styles.count, { color: theme.text }]}>{f.answered}/{f.audience}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

function NewForm({ onBack, onCreated }: { onBack: () => void; onCreated: () => void }) {
    const { isDark, accent } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const [kind, setKind] = useState<'SLIP' | 'POLL'>('SLIP');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [options, setOptions] = useState<string[]>(['', '']);
    const [allowComment, setAllowComment] = useState(true);
    const [deadlineDays, setDeadlineDays] = useState<number | null>(null);
    const [targets, setTargets] = useState<{ id: string; label: string }[] | null>(null);
    const [picked, setPicked] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.get<{ data: { id: string; label: string }[] }>('/teacher/parent-forms/targets')
            .then(r => { setTargets(r.data.data); setPicked(r.data.data.map(d => d.id)); })
            .catch(() => setTargets([]));
    }, []);

    const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

    const create = async () => {
        if (!title.trim() || saving) return;
        setSaving(true);
        try {
            await api.post('/teacher/parent-forms', {
                kind,
                title: title.trim(),
                description: description.trim() || undefined,
                options: kind === 'POLL' ? options.map(o => o.trim()).filter(Boolean) : undefined,
                allowComment,
                deadline: deadlineDays ? endOfDayIn(deadlineDays) : undefined,
                divisionIds: picked,
            });
            onCreated();
        } catch (err) { Alert.alert('', message(err, 'Could not send the form')); }
        finally { setSaving(false); }
    };

    const input = [styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.cardBorder }];
    const chip = (active: boolean) => [styles.chip, { borderColor: active ? accent.purple : theme.cardBorder, backgroundColor: active ? accent.purple + '18' : theme.card }];

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
                <Text style={[styles.headerTitle, { color: theme.text }]}>New form</Text>
                <TouchableOpacity onPress={onBack} hitSlop={12}><X size={20} color={theme.text} /></TouchableOpacity>
            </View>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
                    {targets && targets.length === 0 && (
                        <Text style={[styles.info, { color: '#DC2626' }]}>Only a class teacher can send forms to parents.</Text>
                    )}
                    <View style={styles.chipRow}>
                        {(['SLIP', 'POLL'] as const).map(k => (
                            <TouchableOpacity key={k} onPress={() => setKind(k)} style={chip(kind === k)}>
                                <Text style={[styles.chipText, { color: kind === k ? accent.purple : theme.text }]}>{k === 'SLIP' ? 'Permission slip' : 'Poll'}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <TextInput value={title} onChangeText={setTitle} placeholder={kind === 'SLIP' ? 'e.g. Museum trip on Friday' : 'e.g. Pick a date for the picnic'} placeholderTextColor={theme.muted} maxLength={120} style={input} underlineColorAndroid="transparent" />
                    <TextInput value={description} onChangeText={setDescription} placeholder="Details (optional)" placeholderTextColor={theme.muted} maxLength={1000} multiline style={[...input, { minHeight: 70 }]} underlineColorAndroid="transparent" />

                    {kind === 'SLIP' ? (
                        <Text style={[styles.hint, { color: theme.subText }]}>Parents answer Yes or No.</Text>
                    ) : (
                        <View style={{ gap: 8 }}>
                            {options.map((o, i) => (
                                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <TextInput value={o} onChangeText={v => setOptions(prev => prev.map((x, j) => (j === i ? v : x)))} placeholder={`Option ${i + 1}`} placeholderTextColor={theme.muted} maxLength={80} style={[...input, { flex: 1 }]} underlineColorAndroid="transparent" />
                                    {options.length > 2 && <TouchableOpacity onPress={() => setOptions(prev => prev.filter((_, j) => j !== i))} hitSlop={8}><X size={16} color={theme.muted} /></TouchableOpacity>}
                                </View>
                            ))}
                            {options.length < 6 && <TouchableOpacity onPress={() => setOptions(prev => [...prev, ''])}><Text style={{ color: accent.purple, fontFamily: 'Poppins_600SemiBold', fontSize: 12.5 }}>+ Add option</Text></TouchableOpacity>}
                        </View>
                    )}

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[styles.label, { color: theme.text }]}>Let parents add a note</Text>
                        <Switch value={allowComment} onValueChange={setAllowComment} trackColor={{ true: accent.purple }} />
                    </View>

                    <Text style={[styles.label, { color: theme.text }]}>Reply by</Text>
                    <View style={styles.chipRow}>
                        {DEADLINES.map(d => (
                            <TouchableOpacity key={d.label} onPress={() => setDeadlineDays(d.days)} style={chip(deadlineDays === d.days)}>
                                <Text style={[styles.chipText, { color: deadlineDays === d.days ? accent.purple : theme.text }]}>{d.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {targets && targets.length > 0 && (
                        <>
                            <Text style={[styles.label, { color: theme.text }]}>Send to</Text>
                            <View style={styles.chipRow}>
                                {targets.map(d => (
                                    <TouchableOpacity key={d.id} onPress={() => toggle(d.id)} style={chip(picked.includes(d.id))}>
                                        <Text style={[styles.chipText, { color: picked.includes(d.id) ? accent.purple : theme.text }]}>{d.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </>
                    )}

                    <TouchableOpacity onPress={create} disabled={!title.trim() || saving || picked.length === 0} style={[styles.primaryBtn, { backgroundColor: accent.purple, opacity: !title.trim() || saving || picked.length === 0 ? 0.5 : 1 }]}>
                        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send to parents</Text>}
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

function ResultsView({ id, onBack }: { id: string; onBack: () => void }) {
    const { isDark, accent } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const [data, setData] = useState<Results | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await api.get<{ data: Results }>(`/teacher/parent-forms/${id}`);
            setData(res.data.data);
        } catch (err) { setError(message(err, 'Could not load results')); }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const close = () => Alert.alert('Close this form?', 'Parents will no longer be able to answer.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close form', style: 'destructive', onPress: async () => { try { await api.patch(`/teacher/parent-forms/${id}/close`); await load(); } catch (err) { Alert.alert('', message(err, 'Could not close')); } } },
    ]);

    const pending = data ? data.total - data.answered : 0;
    const remind = () => Alert.alert('Remind parents?', `${pending} parent${pending === 1 ? '' : 's'} who haven't replied will get a notification.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send reminder', onPress: async () => {
            try {
                const res = await api.post<{ data: { reminded: number } }>(`/teacher/parent-forms/${id}/remind`);
                Alert.alert('', `Reminder sent to ${res.data.data.reminded} parent${res.data.data.reminded === 1 ? '' : 's'}.`);
            } catch (err) { Alert.alert('', message(err, 'Could not send the reminder')); }
        } },
    ]);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
                <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>{data?.title ?? 'Results'}</Text>
                <TouchableOpacity onPress={onBack} hitSlop={12}><X size={20} color={theme.text} /></TouchableOpacity>
            </View>
            {!data ? <View style={styles.center}>{error ? <Text style={[styles.info, { color: '#DC2626' }]}>{error}</Text> : <ActivityIndicator color={accent.purple} />}</View> : (
                <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
                    <Text style={[styles.hint, { color: theme.subText }]}>{data.answered} of {data.total} answered{data.closed ? ' · Closed' : ''}</Text>
                    {data.counts.map(c => (
                        <View key={c.label} style={{ gap: 4 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={[styles.label, { color: theme.text }]}>{c.label}</Text>
                                <Text style={[styles.label, { color: theme.text }]}>{c.count}</Text>
                            </View>
                            <View style={[styles.bar, { backgroundColor: theme.cardBorder }]}>
                                <View style={{ height: 8, borderRadius: 4, backgroundColor: accent.purple, width: `${data.total ? (c.count / data.total) * 100 : 0}%` }} />
                            </View>
                        </View>
                    ))}
                    {!data.closed && pending > 0 && (
                        <TouchableOpacity onPress={remind} style={[styles.outlineBtn, { borderColor: accent.purple }]}><Text style={{ color: accent.purple, fontFamily: 'Poppins_600SemiBold', fontSize: 13 }}>Remind {pending} parent{pending === 1 ? '' : 's'}</Text></TouchableOpacity>
                    )}
                    {!data.closed && (
                        <TouchableOpacity onPress={close} style={[styles.outlineBtn, { borderColor: '#DC2626' }]}><Text style={{ color: '#DC2626', fontFamily: 'Poppins_600SemiBold', fontSize: 13 }}>Close form</Text></TouchableOpacity>
                    )}
                    {data.students.map(s => (
                        <View key={s.studentId} style={[styles.row, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>{s.name}</Text>
                                <Text style={[styles.hint, { color: theme.subText }]}>{[s.className, s.rollNo ? `Roll ${s.rollNo}` : null].filter(Boolean).join(' · ')}</Text>
                                {s.comment ? <Text style={[styles.hint, { color: theme.text }]}>“{s.comment}”</Text> : null}
                            </View>
                            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 12.5, color: s.optionIndex === null ? '#DC2626' : theme.text }}>
                                {s.optionIndex === null ? 'No reply' : data.options[s.optionIndex]}
                            </Text>
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
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1 },
    headerTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false, flex: 1 },
    newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 },
    newBtnText: { color: '#fff', fontSize: 12, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    info: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingVertical: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 12 },
    kind: { fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', lineHeight: 14, includeFontPadding: false },
    rowTitle: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold', lineHeight: 19, includeFontPadding: false },
    count: { fontSize: 14, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    hint: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', lineHeight: 16, includeFontPadding: false },
    label: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: Platform.OS === 'android' ? 8 : 12, fontSize: 13.5, fontFamily: 'Poppins_400Regular', includeFontPadding: false },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1.5, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7 },
    chipText: { fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    primaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    primaryBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    outlineBtn: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
    bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
});
