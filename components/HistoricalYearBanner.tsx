import { StyleSheet, Text, View } from 'react-native';
import { Info } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';

// Mirrors qubeex-web's HistoricalYearBanner — shown only when a past
// (non-current) academic year is selected, read-only data.
export function HistoricalYearBanner({ visible, label }: { visible: boolean; label?: string }) {
    const { isDark, accent } = useTheme();
    if (!visible) return null;

    return (
        <View style={[styles.banner, { backgroundColor: isDark ? accent.purpleLight : accent.purpleLight }]}>
            <Info size={13} color={accent.purple} />
            <Text style={[styles.text, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                Viewing {label ?? 'a past year'} — read-only
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
        marginTop: 8,
    },
    text: { fontSize: 11, fontWeight: '600' },
});
