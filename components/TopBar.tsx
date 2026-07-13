import { useTheme } from '@/context/ThemeContext';
import * as Haptics from 'expo-haptics';
import { Bell, Moon, Sun } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface TopBarProps {
    isParentView: boolean;
    onToggle: () => void;
}

export function TopBar({ isParentView, onToggle }: TopBarProps) {
    const translateX = useRef(new Animated.Value(isParentView ? 31 : 0)).current;
    const shadowAnim = useRef(new Animated.Value(isParentView ? 1 : 0)).current;
    const { isDark, toggleTheme } = useTheme();

    const brandAnim = useRef(new Animated.Value(0)).current;
    const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rotateAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        rotateAnim.setValue(0);

        hideTimeout.current = setTimeout(() => {
            hideBrand();
            rotateAnim.setValue(0);
            Animated.timing(rotateAnim, {
                toValue: -1,
                duration: 600,
                useNativeDriver: true,
            }).start();
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
            Animated.timing(rotateAnim, {
                toValue: -1,
                duration: 600,
                useNativeDriver: true,
            }).start();
        }, 5000);
    };

    const hideBrand = () => {
        Animated.timing(brandAnim, {
            toValue: -100,
            duration: 500,
            useNativeDriver: true,
        }).start();
    };

    const showBrand = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        rotateAnim.setValue(0);
        Animated.timing(rotateAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
        }).start();

        Animated.timing(brandAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
        }).start();

        startAutoHide();
    };

    const rotate = rotateAnim.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: ['-360deg', '0deg', '360deg'],
    });

    const handleToggle = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Animated.parallel([
            Animated.spring(translateX, {
                toValue: isParentView ? 0 : 31,
                speed: 14,
                bounciness: 8,
                useNativeDriver: true,
            }),
            Animated.timing(shadowAnim, {
                toValue: isParentView ? 0 : 1,
                duration: 400,
                useNativeDriver: false,
            }),
        ]).start();
        onToggle();
    };

    const switchBg = shadowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['#cfb4fa', '#F59E0B'],
    });

    // Dynamic colors
    const containerBg = isDark ? '#1A1030' : 'white';
    const iconBg = isDark ? '#2D1F50' : '#F8F8F8';
    const iconColor = isDark ? '#A78BFA' : '#374151';
    const brandColor = isDark ? '#FDF0EB' : '#374151';

    return (
        <View>
            <View style={[styles.container, { backgroundColor: containerBg }]}>
                {/* Logo + Name */}
                <View style={styles.logoRow}>

                    {/* Logo clickable */}
                    <Pressable
                        onPress={showBrand}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={{ zIndex: 2 }}
                    >
                        <Animated.Image
                            source={require('../assets/images/QubeEx_darkmode_DA7756.png')}
                            style={[styles.logo, { transform: [{ rotate }] }]}
                            resizeMode="contain"
                        />
                    </Pressable>

                    {/* Animated BrandName */}
                    <Animated.Text
                        style={[
                            styles.brandName,
                            {
                                color: brandColor,
                                transform: [{ translateX: brandAnim }],
                                opacity: brandAnim.interpolate({
                                    inputRange: [-100, -50],
                                    outputRange: [0, 1],
                                    extrapolate: 'clamp',
                                }),
                            },
                        ]}
                    >
                        QubeEx
                    </Animated.Text>

                </View>

                {/* Right side */}
                <View style={styles.rightRow}>

                    {/* Bell */}
                    <View style={[styles.bellBtn, { backgroundColor: iconBg }]}>
                        <Bell size={20} color={iconColor} strokeWidth={1.5} />
                        <View style={styles.bellDot} />
                    </View>

                    {/* Dark/Light Mode Toggle */}
                    <TouchableOpacity
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            toggleTheme();
                        }}
                        style={[styles.bellBtn, { backgroundColor: iconBg }]}
                    >
                        {isDark
                            ? <Moon size={18} color={iconColor} strokeWidth={1.5} />
                            : <Sun size={18} color={iconColor} strokeWidth={1.5} />
                        }
                    </TouchableOpacity>

                    {/* Toggle Switch */}
                    <TouchableOpacity onPress={handleToggle} activeOpacity={1}>
                        <Animated.View style={[styles.switch, { backgroundColor: switchBg }]}>
                            <View style={styles.trackInner} />
                            <Animated.View style={[
                                styles.knob,
                                { transform: [{ translateX }] }
                            ]}>
                                <Text style={styles.knobEmoji}>
                                    {isParentView ? '👨‍👩‍👦' : '🧑‍🎓'}
                                </Text>
                            </Animated.View>
                        </Animated.View>
                    </TouchableOpacity>

                </View>
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
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 6,
    },
    logoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        overflow: 'hidden',
    },
    logo: {
        width: 38,
        height: 38,
        borderRadius: 10,
        zIndex: 2,
        marginLeft: -4,
    },
    brandName: {
        fontSize: 25,
        letterSpacing: 0.2,
        fontFamily: 'Poppins_800ExtraBold',
        zIndex: 1,
        marginLeft: -4,
        paddingTop: Platform.OS === 'android' ? 4 : 0,
    },
    rightRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    switch: {
        width: 62,
        height: 33,
        borderRadius: 99,
        justifyContent: 'center',
        paddingHorizontal: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
        elevation: 2,
        borderWidth: 1.5,
        borderTopColor: 'rgba(0,0,0,0.3)',
        borderLeftColor: 'rgba(0,0,0,0.3)',
        borderRightColor: 'rgba(255,255,255,0.2)',
        borderBottomColor: 'rgba(255,255,255,0.2)',
    },
    trackInner: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 99,
        borderTopWidth: 2,
        borderLeftWidth: 2,
        borderTopColor: 'rgba(0,0,0,0.25)',
        borderLeftColor: 'rgba(0,0,0,0.25)',
        borderRightWidth: 2,
        borderBottomWidth: 2,
        borderRightColor: 'rgba(255,255,255,0.3)',
        borderBottomColor: 'rgba(255,255,255,0.3)',
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    knob: {
        width: 27,
        height: 27,
        borderRadius: 14,
        backgroundColor: 'white',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
    knobEmoji: {
        fontSize: 16,
    },
    bellBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
        elevation: 3,
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
    bellEmoji: {
        fontSize: 20,
    },
});