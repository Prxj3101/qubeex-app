import { useTheme } from '@/context/ThemeContext';
import { useParentModeLanguage } from '@/context/ParentModeLanguageContext';
import api from '@/lib/api';
import { t } from '@/lib/parentModeI18n';
import axios from 'axios';
import { CheckCircle2, ChevronRight, ClipboardCheck, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LIGHT = { bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE', text: '#0F172A', subText: '#64748B', muted: '#94A3B8' };
const DARK = { bg: '#000000', card: '#141414', cardBorder: '#2A2A2A', text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B' };

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
    const { accent } = useTheme();
    const { lang } = useParentModeLanguage();
    const theme = isDark ? DARK : LIGHT;
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
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setOpen(true)}
                style={[styles.entry, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            >
                <View style={[styles.entryIcon, { backgroundColor: accent.purple + '1A' }]}>
                    <ClipboardCheck size={18} color={accent.purple} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.entryTitle, { color: theme.text }]}>{t('formsTitle', lang)}</Text>
                    <Text style={[styles.entrySub, { color: theme.subText }]} numberOfLines={1}>{t('formsSub', lang)}</Text>
                </View>
                {pending > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{pending}</Text></View>}
                <ChevronRight size={16} color={theme.muted} />
            </TouchableOpacity>

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
        f.myResponse ? { label: t('answeredTag', lang), color: '#059669' }
            : f.closed ? { label: t('formClosedTag', lang), color: theme.muted }
                : { label: t('pendingTag', lang), color: '#DC2626' };

    if (active) {
        const locked = active.closed;
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
                <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
                    <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>{active.kind === 'SLIP' ? t('slipTag', lang) : t('pollTag', lang)}</Text>
                    <TouchableOpacity onPress={() => setActiveId(null)} hitSlop={12}><X size={20} color={theme.text} /></TouchableOpacity>
                </View>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
                        <Text style={[styles.formTitle, { color: theme.text }]}>{active.title}</Text>
                        <Text style={[styles.meta, { color: theme.subText }]}>
                            {t('sentBy', lang)}: {active.createdByName}{active.deadline ? ` · ${t('replyBy', lang)} ${formatDeadline(active.deadline)}` : ''}
                        </Text>
                        {active.description ? <Text style={[styles.desc, { color: theme.text }]}>{active.description}</Text> : null}

                        {active.options.map((opt, i) => {
                            const selected = choice === i;
                            return (
                                <TouchableOpacity
                                    key={opt}
                                    disabled={locked}
                                    activeOpacity={0.85}
                                    onPress={() => setChoice(i)}
                                    style={[styles.option, { backgroundColor: selected ? accent.purple + '18' : theme.card, borderColor: selected ? accent.purple : theme.cardBorder, opacity: locked && !selected ? 0.5 : 1 }]}
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
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
                <Text style={[styles.headerTitle, { color: theme.text }]}>{t('formsTitle', lang)}</Text>
                <TouchableOpacity onPress={onClose} hitSlop={12}><X size={20} color={theme.text} /></TouchableOpacity>
            </View>
            {loading ? (
                <View style={styles.center}><ActivityIndicator color={accent.purple} /></View>
            ) : (
                <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }} showsVerticalScrollIndicator={false}>
                    {error && <Text style={[styles.info, { color: '#DC2626' }]}>{error}</Text>}
                    {!error && forms.length === 0 && <Text style={[styles.info, { color: theme.muted }]}>{t('noForms', lang)}</Text>}
                    {forms.map(f => {
                        const st = status(f);
                        return (
                            <TouchableOpacity key={f.id} activeOpacity={0.85} onPress={() => openForm(f)} style={[styles.row, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.rowKind, { color: accent.purple }]}>{f.kind === 'SLIP' ? t('slipTag', lang) : t('pollTag', lang)}</Text>
                                    <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={2}>{f.title}</Text>
                                    {f.deadline && <Text style={[styles.meta, { color: theme.subText }]}>{t('replyBy', lang)} {formatDeadline(f.deadline)}</Text>}
                                </View>
                                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                                    {f.myResponse && <CheckCircle2 size={16} color="#059669" />}
                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: st.color, includeFontPadding: false }}>{st.label}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
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
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 12 },
    rowKind: { fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', lineHeight: 14, includeFontPadding: false },
    rowTitle: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold', lineHeight: 19, includeFontPadding: false },
    meta: { fontSize: 11, fontFamily: 'Poppins_400Regular', lineHeight: 15, includeFontPadding: false },
    formTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', lineHeight: 25, includeFontPadding: false },
    desc: { fontSize: 13, fontFamily: 'Poppins_400Regular', lineHeight: 19, includeFontPadding: false },
    option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 13 },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    radioDot: { width: 10, height: 10, borderRadius: 5 },
    optionText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', flex: 1, includeFontPadding: false },
    noteInput: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: Platform.OS === 'android' ? 8 : 12, minHeight: 60, fontSize: 13, fontFamily: 'Poppins_400Regular', includeFontPadding: false },
    primaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
    primaryBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
});
