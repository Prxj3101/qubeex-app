import { useTheme } from '@/context/ThemeContext';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ArrowLeft, Bell, Moon, Sun } from 'lucide-react-native';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';


interface ScreenHeaderProps {
    title: string;
    showBack?: boolean;
}

export function ScreenHeader({ title, showBack }: ScreenHeaderProps) {
    const { isDark, toggleTheme, accent } = useTheme();
    const router = useRouter();
    // Was hardcoded to purple's own dark-mode accent (#A78BFA) regardless of
    // the institution's chosen theme — same fix as TopBar.tsx's icon/shadow colors.
    const iconColor = isDark ? accent.purple : '#374151';

    return (
        <View style={[styles.container, { backgroundColor: isDark ? '#141414' : 'white' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>

                {showBack && (
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={[styles.btn, { backgroundColor: isDark ? '#2A2A2A' : '#F8F8F8' }]}
                    >
                        <ArrowLeft size={18} color={iconColor} strokeWidth={1.5} />
                    </TouchableOpacity>
                )}

                <Text style={[styles.title, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                    {title}
                </Text>

            </View>

            <View style={styles.rightRow}>
                {/* Bell */}
                <View style={[styles.btn, { backgroundColor: isDark ? '#2A2A2A' : '#F8F8F8' }]}>
                    <Bell size={20} color={iconColor} strokeWidth={1.5} />
                    <View style={styles.bellDot} />
                </View>

                {/* Dark/Light Toggle */}
                <TouchableOpacity
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        toggleTheme();
                    }}
                    style={[styles.btn, { backgroundColor: isDark ? '#2A2A2A' : '#F8F8F8' }]}
                >
                    {isDark
                        ? <Moon size={18} color={accent.purple} strokeWidth={1.5} />
                        : <Sun size={18} color="#374151" strokeWidth={1.5} />
                    }
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        height: 58,
        paddingHorizontal: 18,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderRadius: 25,
        marginHorizontal: 4,
        marginTop: 4,
        marginBottom: 4,
        zIndex: 10,
        // Plain neutral shadow — was tinted with the theme accent color,
        // which read as a colored glow behind the topbar. Removed per request.
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 6,
    },
    title: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        paddingTop: Platform.OS === 'android' ? 4 : 0,
    },
    rightRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    btn: {
        width: 38,
        height: 38,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    bellDot: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 9,
        height: 9,
        backgroundColor: '#EF4444',
        borderRadius: 99,
        borderWidth: 1.5,
        borderColor: 'white',
    },
});