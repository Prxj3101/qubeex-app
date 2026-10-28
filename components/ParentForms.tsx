import { useTheme } from '@/context/ThemeContext';
import { useParentModeLanguage } from '@/context/ParentModeLanguageContext';
import api from '@/lib/api';
import { t } from '@/lib/parentModeI18n';
import axios from 'axios';
import { CalendarClock, CheckCircle2, ClipboardCheck, FileSignature, Lock, Vote } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BAD, Chip, DARK, EmptyState, EntryCard, ErrorState, GOOD, GradientHeader, IconTile, LIGHT, SkeletonList, WARN, cardShadow } from './parentUi';

interface FormItem {
    id: string;
    kind: 'SLIP' | 'POLL';
    title: string;
    description: string | null;
    options: string[];
    allowComment: boolean;
    deadline: string | null;
    closed: boolean;
    createdByName: string;
    myResponse: { optionIndex: number; comment: string | null; respondedAt: string } | null;
}

function formatDeadline(iso: string): string {
    return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Entry card for Parent Mode: permission slips and polls, with a count of unanswered ones. */
export function ParentFormsEntry({ isDark }: { isDark: boolean }) {
    const { lang } = useParentModeLanguage();
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(0);

    const refresh = useCallback(async () => {
        try {
            const res = await api.get<{ data: { pending: number } }>('/student/parent-forms/pending-count');
            setPending(res.data.data.pending);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        refresh();
        const id = setInterval(refresh, 60_000);
        return () => clearInterval(id);
    }, [refresh]);

    return (
        <>
            <EntryCard icon={ClipboardCheck} title={t('formsTitle', lang)} subtitle={t('formsSub', lang)} badge={pending} isDark={isDark} onPress={() => setOpen(true)} />

            <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
                <FormsScreen isDark={isDark} onClose={() => { setOpen(false); refresh(); }} />
            </Modal>
        </>
    );
}

function FormsScreen({ isDark, onClose }: { isDark: boolean; onClose: () => void }) {
    const { accent } = useTheme();
    const { lang } = useParentModeLanguage();
    const theme = isDark ? DARK : LIGHT;
    const [forms, setForms] = useState<FormItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [choice, setChoice] = useState<number | null>(null);
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await api.get<{ data: { forms: FormItem[] } }>('/student/parent-forms');
            setForms(res.data.data.forms);
            setError(null);
        } catch (err) {
            const status = axios.isAxiosError(err) ? err.response?.status : undefined;
            setError(status ? `Could not load forms (error ${status})` : 'Could not reach the server');
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const active = forms.find(f => f.id === activeId) ?? null;

    const openForm = (f: FormItem) => {
        setActiveId(f.id);
        setChoice(f.myResponse?.optionIndex ?? null);
        setNote(f.myResponse?.comment ?? '');
    };

    const submit = async () => {
        if (!active || choice === null || saving) return;
        setSaving(true);
        try {
            await api.post(`/student/parent-forms/${active.id}/respond`, { optionIndex: choice, comment: note.trim() || undefined });
            await load();
            setActiveId(null);
            Alert.alert('', t('answerSaved', lang));
        } catch (err) {
            Alert.alert('', axios.isAxiosError(err) ? (err.response?.data?.message ?? 'Could not save') : 'Could not save');
        } finally { setSaving(false); }
    };

    const status = (f: FormItem) =>
        f.myResponse ? { label: t('answeredTag', lang), color: GOOD, icon: CheckCircle2 }
            : f.closed ? { label: t('formClosedTag', lang), color: theme.muted, icon: Lock }
                : { label: t('pendingTag', lang), color: WARN, icon: CalendarClock };
    const pendingCount = forms.filter(f => !f.myResponse && !f.closed).length;

    if (active) {
        const locked = active.closed;
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
                <GradientHeader
                    isDark={isDark}
                    icon={active.kind === 'SLIP' ? FileSignature : Vote}
                    title={active.kind === 'SLIP' ? t('slipTag', lang) : t('pollTag', lang)}
                    subtitle={`${t('sentBy', lang)}: ${active.createdByName}`}
                    onClose={() => setActiveId(null)}
                />
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
                        <View style={[styles.detailCard, cardShadow(isDark), { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                            <Text style={[styles.formTitle, { color: theme.text }]}>{active.title}</Text>
                            {active.deadline && (
                                <Chip label={`${t('replyBy', lang)} ${formatDeadline(active.deadline)}`} color={active.closed ? theme.muted : WARN} icon={CalendarClock} />
                            )}
                            {active.description ? <Text style={[styles.desc, { color: theme.text }]}>{active.description}</Text> : null}
                        </View>

                        {active.options.map((opt, i) => {
                            const selected = choice === i;
                            return (
                                <TouchableOpacity
                                    key={opt}
                                    disabled={locked}
                                    activeOpacity={0.85}
                                    onPress={() => setChoice(i)}
                                    style={[styles.option, selected ? null : cardShadow(isDark), { backgroundColor: selected ? accent.purple + '18' : theme.card, borderColor: selected ? accent.purple : theme.cardBorder, opacity: locked && !selected ? 0.5 : 1 }]}
                                >
                                    <View style={[styles.radio, { borderColor: selected ? accent.purple : theme.muted }]}>
                                        {selected && <View style={[styles.radioDot, { backgroundColor: accent.purple }]} />}
                                    </View>
                                    <Text style={[styles.optionText, { color: theme.text }]}>{opt}</Text>
                                </TouchableOpacity>
                            );
                        })}

                        {active.allowComment && !locked && (
                            <TextInput
                                value={note}
                                onChangeText={setNote}
                                placeholder={t('addNoteOptional', lang)}
                                placeholderTextColor={theme.muted}
                                maxLength={300}
                                multiline
                                style={[styles.noteInput, { color: theme.text, backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                                underlineColorAndroid="transparent"
                            />
                        )}
                        {locked && active.myResponse?.comment ? (
                            <Text style={[styles.desc, { color: theme.subText }]}>“{active.myResponse.comment}”</Text>
                        ) : null}

                        {!locked && (
                            <TouchableOpacity
                                onPress={submit}
                                disabled={choice === null || saving}
                                style={[styles.primaryBtn, { backgroundColor: accent.purple, opacity: choice === null || saving ? 0.5 : 1 }]}
                            >
                                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{active.myResponse ? t('changeAnswer', lang) : t('submitAnswer', lang)}</Text>}
                            </TouchableOpacity>
                        )}
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
            <GradientHeader
                isDark={isDark}
                icon={ClipboardCheck}
                title={t('formsTitle', lang)}
                subtitle={forms.length ? `${pendingCount} ${t('pendingTag', lang).toLowerCase()} · ${forms.length}` : t('formsSub', lang)}
                onClose={onClose}
            />
            {loading ? (
                <SkeletonList isDark={isDark} />
            ) : (
                <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }} showsVerticalScrollIndicator={false}>
                    {error && <ErrorState text={error} isDark={isDark} onRetry={load} />}
                    {!error && forms.length === 0 && <EmptyState icon={ClipboardCheck} title={t('noForms', lang)} text={t('formsSub', lang)} isDark={isDark} />}
                    {forms.map(f => {
                        const st = status(f);
                        const isSlip = f.kind === 'SLIP';
                        return (
                            <TouchableOpacity key={f.id} activeOpacity={0.88} onPress={() => openForm(f)} style={[styles.row, cardShadow(isDark), { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                                <IconTile icon={isSlip ? FileSignature : Vote} color={accent.purple} size={42} />
                                <View style={{ flex: 1, gap: 2 }}>
                                    <Text style={[styles.rowKind, { color: accent.purple }]}>{isSlip ? t('slipTag', lang) : t('pollTag', lang)}</Text>
                                    <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={2}>{f.title}</Text>
                                    {f.deadline && <Text style={[styles.meta, { color: !f.myResponse && !f.closed ? BAD : theme.subText }]}>{t('replyBy', lang)} {formatDeadline(f.deadline)}</Text>}
                                    {f.myResponse && <Text style={[styles.meta, { color: theme.subText }]} numberOfLines={1}>{f.options[f.myResponse.optionIndex]}</Text>}
                                </View>
                                <Chip label={st.label} color={st.color} icon={st.icon} />
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    detailCard: { borderRadius: 18, padding: 16, gap: 8 },
    info: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingVertical: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, padding: 13 },
    rowKind: { fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', lineHeight: 14, includeFontPadding: false },
    rowTitle: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold', lineHeight: 19, includeFontPadding: false },
    meta: { fontSize: 11, fontFamily: 'Poppins_400Regular', lineHeight: 15, includeFontPadding: false },
    formTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', lineHeight: 25, includeFontPadding: false },
    desc: { fontSize: 13, fontFamily: 'Poppins_400Regular', lineHeight: 19, includeFontPadding: false },
    option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 13 },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    radioDot: { width: 10, height: 10, borderRadius: 5 },
    optionText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', flex: 1, includeFontPadding: false },
    noteInput: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: Platform.OS === 'android' ? 8 : 12, minHeight: 60, fontSize: 13, fontFamily: 'Poppins_400Regular', includeFontPadding: false },
    primaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
    primaryBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
});
