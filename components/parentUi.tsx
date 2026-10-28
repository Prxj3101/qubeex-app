// Shared look for the parent-teacher screens (chat, forms & polls, meetings), on both the
// parent and teacher side: accent-gradient headers, tinted icon tiles, soft cards, status
// chips, friendly empty states and skeleton loaders. Mirrors StudentIDCard / student_detail.
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight, X } from 'lucide-react-native';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

export const LIGHT = { bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE', text: '#0F172A', subText: '#64748B', muted: '#94A3B8' };
export const DARK = { bg: '#000000', card: '#141414', cardBorder: '#2A2A2A', text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B' };
export type ParentTheme = typeof LIGHT;

export const GOOD = '#059669';
export const WARN = '#D97706';
export const BAD = '#DC2626';

/** Blend a hex colour toward black (negative) or white (positive) — RN gradients can't color-mix. */
export function shade(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    let r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
    if (amount < 0) {
        const p = 1 + amount;
        r = Math.round(r * p); g = Math.round(g * p); b = Math.round(b * p);
    } else {
        r = Math.round(r + (255 - r) * amount); g = Math.round(g + (255 - g) * amount); b = Math.round(b + (255 - b) * amount);
    }
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Gradient stops for the institution's accent, matching the ID card strip. */
export function useGradient(isDark: boolean): [string, string] {
    const { accent, themeColor } = useTheme();
    return isDark && themeColor === 'purple' ? ['#4C1D95', '#2D1F50'] : [accent.purple, shade(accent.purple, -0.3)];
}

export function cardShadow(isDark: boolean): ViewStyle {
    return isDark
        ? { borderWidth: 1 }
        : { borderWidth: 1, shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 };
}

// ── Entry card (home screen) ────────────────────────────────────────────────

export function EntryCard({ icon: Icon, title, subtitle, badge, isDark, onPress }: {
    icon: LucideIcon; title: string; subtitle: string; badge?: number; isDark: boolean; onPress: () => void;
}) {
    const theme = isDark ? DARK : LIGHT;
    const gradient = useGradient(isDark);
    return (
        <TouchableOpacity
            activeOpacity={0.88}
            onPress={onPress}
            style={[s.entry, cardShadow(isDark), { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
        >
            <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.entryIcon}>
                <Icon size={19} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
                <Text style={[s.entryTitle, { color: theme.text }]} numberOfLines={1}>{title}</Text>
                <Text style={[s.entrySub, { color: theme.subText }]} numberOfLines={1}>{subtitle}</Text>
            </View>
            {!!badge && badge > 0 && (
                <View style={s.badge}><Text style={s.badgeText}>{badge > 99 ? '99+' : badge}</Text></View>
            )}
            <ChevronRight size={16} color={theme.muted} />
        </TouchableOpacity>
    );
}

// ── Screen header ───────────────────────────────────────────────────────────

export function GradientHeader({ title, subtitle, icon: Icon, isDark, onClose, right, closeIcon }: {
    title: string; subtitle?: string; icon?: LucideIcon; isDark: boolean; onClose: () => void; right?: ReactNode; closeIcon?: ReactNode;
}) {
    const gradient = useGradient(isDark);
    return (
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.header}>
            {Icon && (
                <View style={s.headerIcon}><Icon size={18} color="#fff" /></View>
            )}
            <View style={{ flex: 1 }}>
                <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
                {!!subtitle && <Text style={s.headerSub} numberOfLines={1}>{subtitle}</Text>}
            </View>
            {right}
            <TouchableOpacity onPress={onClose} hitSlop={12} style={s.headerClose}>
                {closeIcon ?? <X size={18} color="#fff" />}
            </TouchableOpacity>
        </LinearGradient>
    );
}

// ── Small pieces ────────────────────────────────────────────────────────────

/** Tinted pill, e.g. "Pending", "Answered", "Closed". */
export function Chip({ label, color, icon: Icon }: { label: string; color: string; icon?: LucideIcon }) {
    return (
        <View style={[s.chip, { backgroundColor: color + '1F' }]}>
            {Icon && <Icon size={11} color={color} />}
            <Text style={[s.chipText, { color }]} numberOfLines={1}>{label}</Text>
        </View>
    );
}

export function IconTile({ icon: Icon, color, size = 38 }: { icon: LucideIcon; color: string; size?: number }) {
    return (
        <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: color + '1F', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={size * 0.48} color={color} />
        </View>
    );
}

export function EmptyState({ icon: Icon, title, text, isDark }: { icon: LucideIcon; title: string; text?: string; isDark: boolean }) {
    const theme = isDark ? DARK : LIGHT;
    const { accent } = useTheme();
    return (
        <View style={s.empty}>
            <View style={[s.emptyRing, { backgroundColor: accent.purple + '12' }]}>
                <View style={[s.emptyDisc, { backgroundColor: accent.purple + '22' }]}>
                    <Icon size={30} color={accent.purple} />
                </View>
            </View>
            <Text style={[s.emptyTitle, { color: theme.text }]}>{title}</Text>
            {!!text && <Text style={[s.emptyText, { color: theme.subText }]}>{text}</Text>}
        </View>
    );
}

export function ErrorState({ text, isDark, onRetry }: { text: string; isDark: boolean; onRetry?: () => void }) {
    const theme = isDark ? DARK : LIGHT;
    return (
        <View style={[s.errorBox, { backgroundColor: BAD + '12', borderColor: BAD + '40' }]}>
            <Text style={[s.errorText, { color: isDark ? '#FCA5A5' : BAD }]}>{text}</Text>
            {onRetry && (
                <TouchableOpacity onPress={onRetry} hitSlop={8}>
                    <Text style={[s.errorRetry, { color: theme.text }]}>Retry</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

/** Pulsing placeholder rows shown while a list loads. */
export function SkeletonList({ isDark, rows = 4, height = 74 }: { isDark: boolean; rows?: number; height?: number }) {
    const theme = isDark ? DARK : LIGHT;
    const pulse = useRef(new Animated.Value(0.45)).current;
    useEffect(() => {
        const loop = Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0.45, duration: 750, useNativeDriver: true }),
        ]));
        loop.start();
        return () => loop.stop();
    }, [pulse]);
    return (
        <View style={{ padding: 14, gap: 10 }}>
            {Array.from({ length: rows }).map((_, i) => (
                <Animated.View
                    key={i}
                    style={{ height, borderRadius: 16, backgroundColor: isDark ? '#1F1F1F' : '#EDE9FE', borderWidth: 1, borderColor: theme.cardBorder, opacity: pulse }}
                />
            ))}
        </View>
    );
}

export function ProgressBar({ value, total, color, isDark, height = 8 }: { value: number; total: number; color: string; isDark: boolean; height?: number }) {
    const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
    return (
        <View style={{ height, borderRadius: height / 2, backgroundColor: isDark ? '#2A2A2A' : '#EDE9FE', overflow: 'hidden' }}>
            <View style={{ height, width: `${pct}%`, borderRadius: height / 2, backgroundColor: color }} />
        </View>
    );
}

export function SectionLabel({ text, isDark }: { text: string; isDark: boolean }) {
    const theme = isDark ? DARK : LIGHT;
    return <Text style={[s.sectionLabel, { color: theme.muted }]}>{text.toUpperCase()}</Text>;
}

const s = StyleSheet.create({
    entry: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 13 },
    entryIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    entryTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', lineHeight: 19, includeFontPadding: false },
    entrySub: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', lineHeight: 16, includeFontPadding: false },
    badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: BAD, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
    badgeText: { color: '#fff', fontSize: 11, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 16 : 12, paddingBottom: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
    headerIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    headerTitle: { color: '#fff', fontSize: 17, fontFamily: 'Poppins_700Bold', lineHeight: 23, includeFontPadding: false },
    headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 11.5, fontFamily: 'Poppins_400Regular', lineHeight: 16, includeFontPadding: false },
    headerClose: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, alignSelf: 'flex-start' },
    chipText: { fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 28, gap: 6 },
    emptyRing: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    emptyDisc: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', textAlign: 'center', includeFontPadding: false },
    emptyText: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', textAlign: 'center', lineHeight: 18, includeFontPadding: false },
    errorBox: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    errorText: { flex: 1, fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', lineHeight: 18, includeFontPadding: false },
    errorRetry: { fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', textDecorationLine: 'underline', includeFontPadding: false },
    sectionLabel: { fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.8, marginTop: 4, includeFontPadding: false },
});
