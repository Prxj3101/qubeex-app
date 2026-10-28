import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import axios from 'axios';
import { Bell, CalendarClock, CheckCircle2, ClipboardCheck, FileSignature, Lock, Plus, Vote, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BAD, Chip, DARK, EmptyState, EntryCard, ErrorState, GOOD, GradientHeader, IconTile, LIGHT, ProgressBar, SkeletonList, WARN, cardShadow } from '@/components/parentUi';

const BAR_COLORS = ['#7C3AED', '#0EA5E9', '#F59E0B', '#10B981', '#EC4899', '#6366F1'];

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
    const { isDark } = useTheme();
    const [open, setOpen] = useState(false);
    return (
        <>
            <EntryCard icon={ClipboardCheck} title="Forms & polls" subtitle="Permission slips and polls for your class" isDark={isDark} onPress={() => setOpen(true)} />
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

    const open_ = forms.filter(f => !f.closed).length;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
            <GradientHeader
                isDark={isDark}
                icon={ClipboardCheck}
                title="Forms & polls"
                subtitle={forms.length ? `${open_} open · ${forms.length} sent` : 'Permission slips and polls for your class'}
                onClose={onClose}
                right={(
                    <TouchableOpacity onPress={() => setView({ name: 'new' })} style={styles.newBtn}>
                        <Plus size={14} color="#fff" /><Text style={styles.newBtnText}>New</Text>
                    </TouchableOpacity>
                )}
            />
            {loading ? <SkeletonList isDark={isDark} /> : (
                <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }} showsVerticalScrollIndicator={false}>
                    {error && <ErrorState text={error} isDark={isDark} onRetry={load} />}
                    {!error && forms.length === 0 && (
                        <EmptyState icon={ClipboardCheck} title="No forms sent yet" text="Send a permission slip or a quick poll to your class and watch the replies come in." isDark={isDark} />
                    )}
                    {forms.map(f => {
                        const isSlip = f.kind === 'SLIP';
                        const done = f.audience > 0 && f.answered >= f.audience;
                        return (
                            <TouchableOpacity key={f.id} activeOpacity={0.88} onPress={() => setView({ name: 'results', id: f.id })} style={[styles.row, cardShadow(isDark), { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                                <IconTile icon={isSlip ? FileSignature : Vote} color={accent.purple} size={42} />
                                <View style={{ flex: 1, gap: 5 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={[styles.kind, { color: accent.purple }]}>{isSlip ? 'Permission slip' : 'Poll'}</Text>
                                        {f.closed && <Chip label="Closed" color={theme.muted} icon={Lock} />}
                                    </View>
                                    <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={2}>{f.title}</Text>
                                    <ProgressBar value={f.answered} total={f.audience} color={done ? GOOD : accent.purple} isDark={isDark} height={6} />
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={[styles.count, { color: done ? GOOD : theme.text }]}>{f.answered}/{f.audience}</Text>
                                    <Text style={[styles.hint, { color: theme.muted }]}>replied</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
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
            <GradientHeader isDark={isDark} icon={kind === 'SLIP' ? FileSignature : Vote} title="New form" subtitle="Sent to parents in Parent Mode" onClose={onBack} />
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
                    {targets && targets.length === 0 && (
                        <Text style={[styles.info, { color: '#DC2626' }]}>Only a class teacher can send forms to parents.</Text>
                    )}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        {([
                            { k: 'SLIP', label: 'Permission slip', sub: 'Yes / No consent', icon: FileSignature },
                            { k: 'POLL', label: 'Poll', sub: 'Pick one option', icon: Vote },
                        ] as const).map(o => {
                            const on = kind === o.k;
                            return (
                                <TouchableOpacity key={o.k} activeOpacity={0.88} onPress={() => setKind(o.k)} style={[styles.kindCard, on ? null : cardShadow(isDark), { borderColor: on ? accent.purple : theme.cardBorder, backgroundColor: on ? accent.purple + '16' : theme.card }]}>
                                    <IconTile icon={o.icon} color={accent.purple} size={36} />
                                    <Text style={[styles.rowTitle, { color: theme.text }]}>{o.label}</Text>
                                    <Text style={[styles.hint, { color: theme.subText }]}>{o.sub}</Text>
                                </TouchableOpacity>
                            );
                        })}
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
            <GradientHeader
                isDark={isDark}
                icon={data?.kind === 'POLL' ? Vote : FileSignature}
                title={data?.title ?? 'Results'}
                subtitle={data ? (data.kind === 'SLIP' ? 'Permission slip' : 'Poll') + (data.closed ? ' · Closed' : '') : undefined}
                onClose={onBack}
            />
            {!data ? (
                error ? <View style={{ padding: 14 }}><ErrorState text={error} isDark={isDark} onRetry={load} /></View> : <SkeletonList isDark={isDark} rows={3} height={90} />
            ) : (
                <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} showsVerticalScrollIndicator={false}>
                    <View style={[styles.hero, cardShadow(isDark), { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                            <View>
                                <Text style={[styles.heroNum, { color: theme.text }]}>{data.answered}<Text style={[styles.heroOf, { color: theme.muted }]}> / {data.total}</Text></Text>
                                <Text style={[styles.hint, { color: theme.subText }]}>parents replied</Text>
                            </View>
                            {data.deadline && (
                                <Chip label={`By ${new Date(data.deadline).toLocaleDateString([], { day: 'numeric', month: 'short' })}`} color={data.closed ? theme.muted : WARN} icon={CalendarClock} />
                            )}
                        </View>
                        <ProgressBar value={data.answered} total={data.total} color={data.answered >= data.total && data.total > 0 ? GOOD : accent.purple} isDark={isDark} height={10} />
                        {data.description ? <Text style={[styles.hint, { color: theme.text }]}>{data.description}</Text> : null}
                    </View>

                    <View style={[styles.hero, cardShadow(isDark), { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        {data.counts.map((c, i) => {
                            const color = BAR_COLORS[i % BAR_COLORS.length];
                            return (
                                <View key={c.label} style={{ gap: 5 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={[styles.label, { color: theme.text }]}>{c.label}</Text>
                                        <Text style={[styles.label, { color }]}>{c.count}</Text>
                                    </View>
                                    <ProgressBar value={c.count} total={data.total} color={color} isDark={isDark} height={9} />
                                </View>
                            );
                        })}
                    </View>

                    {!data.closed && (
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            {pending > 0 && (
                                <TouchableOpacity onPress={remind} style={[styles.actionBtn, { backgroundColor: accent.purple }]}>
                                    <Bell size={15} color="#fff" /><Text style={styles.actionBtnText}>Remind {pending}</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={close} style={[styles.actionBtn, { backgroundColor: BAD + '14', borderWidth: 1.5, borderColor: BAD + '66' }]}>
                                <Lock size={15} color={BAD} /><Text style={[styles.actionBtnText, { color: BAD }]}>Close form</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {data.students.map(s => {
                        const replied = s.optionIndex !== null;
                        return (
                            <View key={s.studentId} style={[styles.row, cardShadow(isDark), { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                                <View style={[styles.initial, { backgroundColor: (replied ? accent.purple : BAD) + '1F' }]}>
                                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: replied ? accent.purple : BAD, includeFontPadding: false }}>{s.name[0]?.toUpperCase() ?? '?'}</Text>
                                </View>
                                <View style={{ flex: 1, gap: 1 }}>
                                    <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>{s.name}</Text>
                                    <Text style={[styles.hint, { color: theme.subText }]}>{[s.className, s.rollNo ? `Roll ${s.rollNo}` : null].filter(Boolean).join(' · ')}</Text>
                                    {s.comment ? <Text style={[styles.hint, { color: theme.text }]}>“{s.comment}”</Text> : null}
                                </View>
                                {replied
                                    ? <Chip label={data.options[s.optionIndex!]} color={BAR_COLORS[s.optionIndex! % BAR_COLORS.length]} icon={CheckCircle2} />
                                    : <Chip label="No reply" color={BAD} />}
                            </View>
                        );
                    })}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.22)' },
    newBtnText: { color: '#fff', fontSize: 12, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, padding: 13 },
    hero: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 12 },
    heroNum: { fontSize: 30, fontFamily: 'Poppins_700Bold', lineHeight: 36, includeFontPadding: false },
    heroOf: { fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
    kindCard: { flex: 1, borderWidth: 1.5, borderRadius: 18, padding: 12, gap: 4 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: 12 },
    actionBtnText: { color: '#fff', fontSize: 13, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    initial: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    kind: { fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', lineHeight: 14, includeFontPadding: false },
    rowTitle: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold', lineHeight: 19, includeFontPadding: false },
    count: { fontSize: 14, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    info: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingVertical: 16 },
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
