import { useBranding } from '@/context/BrandingContext';
import { useTheme } from '@/context/ThemeContext';
import * as Haptics from 'expo-haptics';
import { Bell, Moon, Sun } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

// Simplified sibling of the student TopBar — identical logo size, brand name
// sizing, and the tap-to-reveal brand-name + logo-spin animation, minus the
// Parent Mode switch (teacher accounts have no parent view).
export function TeacherTopBar() {
    const { isDark, toggleTheme, accent } = useTheme();
    const { branding } = useBranding();

    const brandAnim = useRef(new Animated.Value(0)).current;
    const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rotateAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        rotateAnim.setValue(0);
        hideTimeout.current = setTimeout(() => {
            hideBrand();
            rotateAnim.setValue(0);
            Animated.timing(rotateAnim, { toValue: -1, duration: 600, useNativeDriver: true }).start();
        }, 5000);
        return () => {
            if (hideTimeout.current) clearTimeout(hideTimeout.current);
        };
    }, []);

    const startAutoHide = () => {
        if (hideTimeout.current) clearTimeout(hideTimeout.current);
        hideTimeout.current = setTimeout(() => {
            hideBrand();
            rotateAnim.setValue(0);
            Animated.timing(rotateAnim, { toValue: -1, duration: 600, useNativeDriver: true }).start();
        }, 5000);
    };

    const hideBrand = () => {
        Animated.timing(brandAnim, { toValue: -100, duration: 500, useNativeDriver: true }).start();
    };

    const showBrand = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        rotateAnim.setValue(0);
        Animated.timing(rotateAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
        Animated.timing(brandAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start();
        startAutoHide();
    };

    const rotate = rotateAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-360deg', '0deg', '360deg'] });

    const containerBg = isDark ? '#141414' : 'white';
    const iconBg = isDark ? '#2A2A2A' : '#F8F8F8';
    const iconColor = isDark ? accent.purple : '#374151';
    const brandColor = isDark ? '#FAE5D9' : '#374151';

    return (
        <View style={[styles.container, { backgroundColor: containerBg }]}>
            <View style={[styles.logoRow, branding.enabled && styles.logoRowWideGap]}>
                <Pressable
                    onPress={showBrand}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={{ zIndex: 2 }}
                >
                    <Animated.Image
                        source={
                            branding.enabled && branding.logoUrl
                                ? { uri: branding.logoUrl }
                                : require('../../assets/images/QubeEx_darkmode_DA7756.png')
                        }
                        style={[
                            styles.logo,
                            branding.enabled && branding.logoUrl && styles.logoNoOffset,
                            !branding.enabled && { transform: [{ rotate }] },
                        ]}
                        resizeMode="contain"
                    />
                </Pressable>

                <Animated.Text
                    numberOfLines={branding.enabled ? 2 : 1}
                    ellipsizeMode="tail"
                    adjustsFontSizeToFit={!branding.enabled}
                    minimumFontScale={0.5}
                    style={[
                        styles.brandName,
                        branding.enabled && styles.brandNameShrinkable,
                        branding.enabled && styles.brandNameWrap,
                        {
                            color: brandColor,
                            transform: [{ translateX: brandAnim }],
                            opacity: brandAnim.interpolate({ inputRange: [-100, -50], outputRange: [0, 1], extrapolate: 'clamp' }),
                        },
                    ]}
                >
                    {branding.enabled ? branding.brandName : 'QubeEx'}
                </Animated.Text>
            </View>

            <View style={styles.rightRow}>
                <View style={[styles.iconBtn, { backgroundColor: iconBg }]}>
                    <Bell size={20} color={iconColor} strokeWidth={1.5} />
                    <View style={styles.bellDot} />
                </View>
                <Pressable
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        toggleTheme();
                    }}
                    style={({ pressed }) => [styles.iconBtn, { backgroundColor: iconBg, opacity: pressed ? 0.6 : 1 }]}
                >
                    {isDark
                        ? <Moon size={18} color={iconColor} strokeWidth={1.5} />
                        : <Sun size={18} color={iconColor} strokeWidth={1.5} />}
                </Pressable>
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
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 6,
    },
    logoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, overflow: 'hidden', flexShrink: 1, minWidth: 0 },
    logoRowWideGap: { gap: 12 },
    logo: { width: 38, height: 38, borderRadius: 10, zIndex: 2, marginLeft: -4 },
    logoNoOffset: { marginLeft: 0 },
    brandName: {
        fontSize: 25,
        letterSpacing: 0.2,
        fontFamily: 'Poppins_800ExtraBold',
        zIndex: 1,
        marginLeft: -4,
        paddingTop: Platform.OS === 'android' ? 4 : 0,
    },
    brandNameShrinkable: { flexShrink: 1, minWidth: 0 },
    brandNameWrap: { fontSize: 15, lineHeight: 20 },
    rightRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
    iconBtn: {
        width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
        position: 'relative',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3,
    },
    bellDot: {
        position: 'absolute', top: 4, right: 4, width: 9, height: 9,
        backgroundColor: '#EF4444', borderRadius: 99, borderWidth: 1.5, borderColor: 'white',
    },
});
