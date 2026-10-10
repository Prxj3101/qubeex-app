// Voice attendance sheet: the teacher taps the mic and says who is absent / late, reviews what was
// understood, then applies it to the Daily attendance list.
//
// Speech-to-text comes from the phone itself (expo-speech-recognition, no AI tokens). The words are
// turned into roll numbers by plain rules in lib/voiceAttendance.ts. Nothing is saved until the
// teacher taps Apply, and the normal Daily list still auto-saves afterwards.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AlertTriangle, Check, Mic, Square, X } from 'lucide-react-native';
import { parseAttendanceSpeech } from '@/lib/voiceAttendance';

// The native module only exists in a development / new build — never in Expo Go or older installs.
// Requiring it lazily keeps those builds from crashing; the sheet then explains what is missing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SpeechModule: any = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    SpeechModule = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
} catch {
    SpeechModule = null;
}

type Lang = 'en-IN' | 'hi-IN' | 'mr-IN';
const LANGS: { code: Lang; label: string; hint: string }[] = [
    { code: 'en-IN', label: 'English', hint: 'e.g. "absent 5, 12, 23 late 7"' },
    { code: 'hi-IN', label: 'हिंदी', hint: 'जैसे "अनुपस्थित 5, 12, 23 लेट 7"' },
    { code: 'mr-IN', label: 'मराठी', hint: 'उदा. "गैरहजर 5, 12, 23 उशीर 7"' },
];

interface VoiceStudent { id: string; name: string; rollNo: string }
interface Theme { card: string; cardBorder: string; text: string; subText: string; muted: string; purple: string }

export function VoiceAttendanceSheet({ visible, onClose, students, theme, isDark, onApply }: {
    visible: boolean;
    onClose: () => void;
    students: VoiceStudent[];
    theme: Theme;
    isDark: boolean;
    onApply: (r: { absentIds: string[]; lateIds: string[] }) => void;
}) {
    const [lang, setLang] = useState<Lang>('en-IN');
    const [listening, setListening] = useState(false);
    const [finalText, setFinalText] = useState('');
    const [interim, setInterim] = useState('');
    const [error, setError] = useState('');
    const [removed, setRemoved] = useState<number[]>([]);
    const interimRef = useRef('');

    // ── recogniser events ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!visible || !SpeechModule) return;
        const subs = [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            SpeechModule.addListener('result', (e: any) => {
                const t: string = e?.results?.[0]?.transcript ?? '';
                if (e?.isFinal) {
                    interimRef.current = '';
                    setInterim('');
                    if (t) setFinalText((p) => `${p} ${t}`.trim());
                } else {
                    interimRef.current = t;
                    setInterim(t);
                }
            }),
            SpeechModule.addListener('end', () => {
                // A last partial phrase that never became "final" is still what the teacher said.
                if (interimRef.current) {
                    const left = interimRef.current;
                    interimRef.current = '';
                    setFinalText((p) => `${p} ${left}`.trim());
                }
                setInterim('');
                setListening(false);
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            SpeechModule.addListener('error', (e: any) => {
                setListening(false);
                if (e?.error !== 'no-speech' && e?.error !== 'aborted') setError(e?.message || 'Could not hear that clearly. Please try again.');
            }),
        ];
        return () => {
            subs.forEach((s) => s?.remove?.());
            try { SpeechModule.abort(); } catch { /* not listening */ }
        };
    }, [visible]);

    // Fresh start every time the sheet opens.
    useEffect(() => {
        if (visible) { setFinalText(''); setInterim(''); interimRef.current = ''; setError(''); setRemoved([]); setListening(false); }
    }, [visible]);

    const startListening = useCallback(async () => {
        if (!SpeechModule) return;
        setError('');
        try {
            const perm = await SpeechModule.requestPermissionsAsync();
            if (!perm?.granted) { setError('Microphone permission is needed for voice attendance.'); return; }
            SpeechModule.start({ lang, interimResults: true, continuous: true });
            setListening(true);
        } catch {
            setError('Could not start the microphone.');
            setListening(false);
        }
    }, [lang]);

    const stopListening = useCallback(() => {
        try { SpeechModule?.stop(); } catch { /* ignore */ }
    }, []);

    // ── what was understood ────────────────────────────────────────────────────
    const heard = `${finalText} ${interim}`.trim();
    const parsed = useMemo(() => parseAttendanceSpeech(heard), [heard]);
    const rollMap = useMemo(() => {
        const m = new Map<number, VoiceStudent>();
        for (const s of students) {
            const n = Number(s.rollNo);
            if (s.rollNo.trim() !== '' && Number.isFinite(n)) m.set(n, s);
        }
        return m;
    }, [students]);

    const keep = (n: number) => !removed.includes(n);
    const absentRows = parsed.absent.filter(keep).map((n) => ({ n, s: rollMap.get(n) }));
    const lateRows = parsed.late.filter(keep).map((n) => ({ n, s: rollMap.get(n) }));
    const unknown = [...absentRows, ...lateRows].filter((r) => !r.s).map((r) => r.n);
    const absentFound = absentRows.filter((r) => r.s);
    const lateFound = lateRows.filter((r) => r.s);
    const canApply = !listening && (absentFound.length > 0 || lateFound.length > 0 || parsed.allPresent);

    const apply = () => {
        onApply({ absentIds: absentFound.map((r) => r.s!.id), lateIds: lateFound.map((r) => r.s!.id) });
        onClose();
    };

    const accentSoft = isDark ? '#2D1F50' : '#EDE9FE';
    const chip = (n: number, s: VoiceStudent | undefined, color: string, bg: string) => (
        <TouchableOpacity key={`${color}${n}`} activeOpacity={0.7} onPress={() => setRemoved((r) => [...r, n])}
            style={[st.chip, { backgroundColor: s ? bg : 'transparent', borderColor: s ? color : theme.muted }]}>
            <Text style={{ fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_600SemiBold', color: s ? color : theme.muted, includeFontPadding: false }}>
                {n}{s ? ` · ${s.name}` : ' · not in this class'}
            </Text>
            <X size={11} color={s ? color : theme.muted} />
        </TouchableOpacity>
    );

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={st.backdrop} onPress={onClose} />
            <View style={[st.sheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <View style={st.header}>
                    <Text style={{ fontSize: 16, lineHeight: 22, fontFamily: 'Poppins_700Bold', color: theme.text, includeFontPadding: false }}>Voice attendance</Text>
                    <TouchableOpacity onPress={onClose} hitSlop={10}><X size={18} color={theme.subText} /></TouchableOpacity>
                </View>

                {!SpeechModule ? (
                    <View style={[st.notice, { backgroundColor: isDark ? '#2B1A05' : '#FFFBEB', borderColor: '#F59E0B' }]}>
                        <AlertTriangle size={16} color="#D97706" />
                        <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, fontFamily: 'Poppins_400Regular', color: theme.text, includeFontPadding: false }}>
                            Voice attendance needs the latest QubeEx app build. It is not available in this version (or in Expo Go).
                        </Text>
                    </View>
                ) : (
                    <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingBottom: 6 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        <View style={st.langRow}>
                            {LANGS.map((l) => {
                                const on = l.code === lang;
                                return (
                                    <TouchableOpacity key={l.code} disabled={listening} onPress={() => setLang(l.code)}
                                        style={[st.langChip, { borderColor: on ? theme.purple : theme.cardBorder, backgroundColor: on ? accentSoft : 'transparent', opacity: listening && !on ? 0.5 : 1 }]}>
                                        <Text style={{ fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_600SemiBold', color: on ? theme.purple : theme.subText, includeFontPadding: false }}>{l.label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <Text style={{ fontSize: 12, lineHeight: 17, fontFamily: 'Poppins_400Regular', color: theme.muted, textAlign: 'center', marginTop: 10, includeFontPadding: false }}>
                            Say who is absent or late. Everyone else is marked Present.{'\n'}{LANGS.find((l) => l.code === lang)?.hint}
                        </Text>

                        <View style={{ alignItems: 'center', marginTop: 16 }}>
                            <TouchableOpacity activeOpacity={0.85} onPress={listening ? stopListening : startListening}
                                style={[st.mic, { backgroundColor: listening ? '#DC2626' : theme.purple }]}>
                                {listening ? <Square size={26} color="#fff" fill="#fff" /> : <Mic size={30} color="#fff" />}
                            </TouchableOpacity>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                                {listening && <ActivityIndicator size="small" color="#DC2626" />}
                                <Text style={{ fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_600SemiBold', color: listening ? '#DC2626' : theme.subText, includeFontPadding: false }}>
                                    {listening ? 'Listening… tap to stop' : heard ? 'Tap to add more' : 'Tap to speak'}
                                </Text>
                            </View>
                        </View>

                        {!!error && (
                            <Text style={{ fontSize: 12, lineHeight: 17, fontFamily: 'Poppins_400Regular', color: '#DC2626', textAlign: 'center', marginTop: 10, includeFontPadding: false }}>{error}</Text>
                        )}

                        {!!heard && (
                            <View style={[st.box, { borderColor: theme.cardBorder }]}>
                                <Text style={{ fontSize: 10, lineHeight: 14, fontFamily: 'Poppins_600SemiBold', color: theme.muted, letterSpacing: 0.6, includeFontPadding: false }}>I HEARD</Text>
                                <Text style={{ fontSize: 13, lineHeight: 19, fontFamily: 'Poppins_400Regular', color: theme.text, marginTop: 2, includeFontPadding: false }}>&ldquo;{heard}&rdquo;</Text>
                            </View>
                        )}

                        {(absentRows.length > 0 || lateRows.length > 0 || parsed.allPresent) && (
                            <View style={{ marginTop: 12, gap: 10 }}>
                                {parsed.allPresent && (
                                    <View style={[st.notice, { backgroundColor: isDark ? '#052E16' : '#D1FAE5', borderColor: '#34D399' }]}>
                                        <Check size={16} color="#047857" />
                                        <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, fontFamily: 'Poppins_600SemiBold', color: isDark ? '#6EE7B7' : '#047857', includeFontPadding: false }}>Everyone present</Text>
                                    </View>
                                )}
                                {absentRows.length > 0 && (
                                    <View>
                                        <Text style={[st.label, { color: '#DC2626' }]}>ABSENT ({absentFound.length})</Text>
                                        <View style={st.chips}>{absentRows.map((r) => chip(r.n, r.s, '#DC2626', isDark ? '#450A0A' : '#FEF2F2'))}</View>
                                    </View>
                                )}
                                {lateRows.length > 0 && (
                                    <View>
                                        <Text style={[st.label, { color: '#D97706' }]}>LATE ({lateFound.length})</Text>
                                        <View style={st.chips}>{lateRows.map((r) => chip(r.n, r.s, '#D97706', isDark ? '#2B1A05' : '#FFFBEB'))}</View>
                                    </View>
                                )}
                                {unknown.length > 0 && (
                                    <Text style={{ fontSize: 11.5, lineHeight: 16, fontFamily: 'Poppins_400Regular', color: theme.muted, includeFontPadding: false }}>
                                        Roll {unknown.join(', ')} not found in this class. Tap a chip to remove it, or speak again.
                                    </Text>
                                )}
                                <Text style={{ fontSize: 10.5, lineHeight: 15, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic', includeFontPadding: false }}>
                                    Tap a name to remove it if it was heard wrongly.
                                </Text>
                            </View>
                        )}
                    </ScrollView>
                )}

                {!!SpeechModule && (
                    <View style={st.footer}>
                        <TouchableOpacity disabled={!heard && !listening} onPress={() => { stopListening(); setFinalText(''); setInterim(''); interimRef.current = ''; setRemoved([]); setError(''); }}
                            style={[st.btn, { borderColor: theme.cardBorder, opacity: heard || listening ? 1 : 0.4 }]}>
                            <Text style={{ fontSize: 13, lineHeight: 18, fontFamily: 'Poppins_600SemiBold', color: theme.subText, includeFontPadding: false }}>Clear</Text>
                        </TouchableOpacity>
                        <TouchableOpacity disabled={!canApply} onPress={apply} style={[st.btn, st.btnPrimary, { backgroundColor: theme.purple, opacity: canApply ? 1 : 0.4 }]}>
                            <Text style={{ fontSize: 13, lineHeight: 18, fontFamily: 'Poppins_600SemiBold', color: '#fff', includeFontPadding: false }}>Apply to attendance</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </Modal>
    );
}

const st = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingTop: 16, paddingBottom: Platform.OS === 'ios' ? 30 : 18 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    langRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
    langChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
    mic: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
    box: { marginTop: 14, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
    label: { fontSize: 10.5, lineHeight: 15, fontFamily: 'Poppins_700Bold', letterSpacing: 0.6, marginBottom: 5, includeFontPadding: false },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
    notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
    footer: { flexDirection: 'row', gap: 10, marginTop: 14 },
    btn: { flex: 1, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    btnPrimary: { flex: 2, borderWidth: 0 },
});
