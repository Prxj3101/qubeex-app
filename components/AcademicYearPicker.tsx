import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Calendar, Check, ChevronDown } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import type { AcademicYearSummary } from '@/hooks/useAcademicYears';

// Scoped to the three "history" screens (Attendance, Report Card, Fees) —
// not a global/tab-bar control, so it only ever appears on those screens.
export function AcademicYearPicker({ years, selectedYearId, onSelect, loading }: {
    years: AcademicYearSummary[];
    selectedYearId: string | null;
    onSelect: (id: string) => void;
    loading?: boolean;
}) {
    const { isDark, accent } = useTheme();
    const [open, setOpen] = useState(false);
    const selected = years.find((y) => y.id === selectedYearId);

    // Nothing to switch between (new institution, only one year exists yet) —
    // don't show a picker that has no real choice behind it.
    if (loading || years.length <= 1) return null;

    return (
        <>
            <TouchableOpacity
                onPress={() => setOpen(true)}
                style={[styles.trigger, { backgroundColor: isDark ? '#2A2A2A' : '#F8F8F8' }]}
                activeOpacity={0.7}
            >
                <Calendar size={13} color={isDark ? '#94A3B8' : '#64748B'} />
                <Text style={[styles.triggerText, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                    {selected?.label ?? 'Select year'}
                </Text>
                <ChevronDown size={13} color={isDark ? '#94A3B8' : '#64748B'} />
            </TouchableOpacity>

            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
                    <View style={[styles.sheet, { backgroundColor: isDark ? '#141414' : 'white' }]}>
                        <Text style={[styles.sheetTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Academic Year</Text>
                        {years.map((y) => (
                            <TouchableOpacity
                                key={y.id}
                                onPress={() => { onSelect(y.id); setOpen(false); }}
                                style={styles.row}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.rowText, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                                    {y.label}{y.isCurrent ? ' (current)' : ''}
                                </Text>
                                {y.id === selectedYearId && <Check size={16} color={accent.purple} />}
                            </TouchableOpacity>
                        ))}
                    </View>
                </Pressable>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    trigger: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
        alignSelf: 'flex-start',
    },
    triggerText: { fontSize: 12, fontWeight: '600' },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
    sheetTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
    row: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#80808030',
    },
    rowText: { fontSize: 14, fontWeight: '500' },
});
