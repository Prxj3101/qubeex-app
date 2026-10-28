// QubeEx-styled replacement for the system Alert box. Importing this file (once, from the root
// layout) swaps `Alert.alert` for a themed dialog, so every existing
// `Alert.alert(title, message, buttons)` call in the app picks up the new look unchanged.
// <QubeAlertHost /> must be mounted inside ThemeProvider to actually render them.
import { useTheme } from '@/context/ThemeContext';
import { CheckCircle2, CircleHelp, Info, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, type AlertButton, type AlertOptions } from 'react-native';
import { DARK, LIGHT } from '@/components/parentUi';

type Tone = 'danger' | 'warning' | 'success' | 'info';
type QueuedAlert = { id: number; title: string; message?: string; buttons: AlertButton[]; options?: AlertOptions };

const nativeAlert = Alert.alert.bind(Alert);
let enqueue: ((a: Omit<QueuedAlert, 'id'>) => void) | null = null;

Alert.alert = (title, message, buttons, options) => {
    const list = buttons && buttons.length ? buttons : [{ text: 'OK' }];
    // Host not mounted yet (very early in startup): fall back to the system box rather than dropping the alert.
    if (!enqueue) return nativeAlert(title, message, buttons, options);
    enqueue({ title, message, buttons: list, options });
};

const ERROR_WORDS = /could not|couldn't|can't|cannot|failed|error|unable|invalid|denied|wrong|not allowed|required/i;
const SUCCESS_WORDS = /success|saved|done|sent|updated|created|submitted|published/i;

function pickTone(a: QueuedAlert): Tone {
    if (a.buttons.some(b => b.style === 'destructive')) return 'danger';
    const text = `${a.title} ${a.message ?? ''}`;
    if (a.buttons.length === 1 && ERROR_WORDS.test(text)) return 'warning';
    if (a.buttons.length === 1 && SUCCESS_WORDS.test(text)) return 'success';
    return 'info';
}

export function QubeAlertHost() {
    const { isDark, accent } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const [queue, setQueue] = useState<QueuedAlert[]>([]);
    const nextId = useRef(1);
    const scale = useRef(new Animated.Value(0.92)).current;
    const current = queue[0];

    useEffect(() => {
        enqueue = (a) => setQueue(q => [...q, { ...a, id: nextId.current++ }]);
        return () => { enqueue = null; };
    }, []);

    useEffect(() => {
        if (!current) return;
        scale.setValue(0.92);
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 8, tension: 120 }).start();
    }, [current?.id, scale]);

    const dismiss = useCallback((a: QueuedAlert) => {
        setQueue(q => q.filter(x => x.id !== a.id));
    }, []);

    const press = useCallback((a: QueuedAlert, b: AlertButton) => {
        dismiss(a);
        b.onPress?.();
    }, [dismiss]);

    if (!current) return null;

    const tone = pickTone(current);
    const palette: Record<Tone, { tile: string; fg: string; Icon: LucideIcon }> = {
        danger: { tile: isDark ? '#2B0D14' : '#FEE2E2', fg: '#DC2626', Icon: TriangleAlert },
        warning: { tile: isDark ? '#2D2010' : '#FEF3C7', fg: '#D97706', Icon: TriangleAlert },
        success: { tile: isDark ? '#06281E' : '#D1FAE5', fg: '#059669', Icon: CheckCircle2 },
        info: { tile: accent.purpleLight, fg: accent.purple, Icon: current.buttons.length > 1 ? CircleHelp : Info },
    };
    const { tile, fg, Icon } = palette[tone];

    const hasCancel = current.buttons.some(b => b.style === 'cancel');
    const cancelable = current.options?.cancelable ?? hasCancel;
    const onBackdrop = () => {
        if (!cancelable) return;
        dismiss(current);
        current.options?.onDismiss?.();
    };

    const stacked = current.buttons.length > 2;
    const actionBg = (b: AlertButton) => (b.style === 'destructive' ? '#EF4444' : accent.purple);

    return (
        <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onBackdrop}>
            <Pressable style={s.backdrop} onPress={onBackdrop}>
                <Animated.View style={{ transform: [{ scale }], width: '100%', maxWidth: 360 }}>
                    <Pressable style={[s.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        <View style={[s.tile, { backgroundColor: tile }]}>
                            <Icon size={26} color={fg} />
                        </View>
                        {!!current.title && <Text style={[s.title, { color: theme.text }]}>{current.title}</Text>}
                        {!!current.message && <Text style={[s.message, { color: theme.subText }]}>{current.message}</Text>}
                        <View style={[s.buttons, stacked && { flexDirection: 'column' }]}>
                            {current.buttons.map((b, i) => {
                                const isCancel = b.style === 'cancel';
                                return (
                                    <TouchableOpacity
                                        key={`${b.text}-${i}`}
                                        activeOpacity={0.8}
                                        onPress={() => press(current, b)}
                                        style={[
                                            s.button,
                                            stacked ? { width: '100%' } : { flex: 1 },
                                            isCancel
                                                ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.cardBorder }
                                                : { backgroundColor: actionBg(b) },
                                        ]}
                                    >
                                        <Text style={[s.buttonText, { color: isCancel ? theme.text : '#FFFFFF' }]} numberOfLines={1}>
                                            {b.text ?? 'OK'}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </Pressable>
                </Animated.View>
            </Pressable>
        </Modal>
    );
}

const s = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    card: { borderRadius: 24, borderWidth: 1, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 20, alignItems: 'center' },
    tile: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    title: { fontFamily: 'Poppins_700Bold', fontSize: 18, textAlign: 'center' },
    message: { fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 6 },
    buttons: { flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' },
    button: { height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
    buttonText: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
});
