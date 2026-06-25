import { useTheme } from '@/context/ThemeContext';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function AnnouncementStrip() {
    const [visible, setVisible] = useState(true);
    const { isDark } = useTheme();

    if (!visible) return null;

    return (
        <View style={[
            styles.container,
            {
                backgroundColor: isDark ? '#2D2010' : '#FEF3C7',
                borderBottomColor: isDark ? '#44300F' : '#FDE68A',
            }
        ]}>
            <Text style={styles.icon}>📢</Text>
            <Text style={[styles.text, { color: isDark ? '#FCD34D' : '#92400E' }]}>
                Exam schedule updated — Check calendar for new dates
            </Text>
            <TouchableOpacity onPress={() => setVisible(false)}>
                <Text style={[styles.close, { color: isDark ? '#FCD34D' : '#B45309' }]}>✕</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        paddingHorizontal: 20,
        paddingVertical: 10,
        gap: 10,
    },
    icon: {
        fontSize: 14,
    },
    text: {
        flex: 1,
        fontSize: 12,
        fontWeight: '500',
    },
    close: {
        fontSize: 13,
        fontWeight: '700',
    },
});