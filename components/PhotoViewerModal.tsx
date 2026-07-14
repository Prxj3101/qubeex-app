import { useEffect, useRef } from 'react';
import { Animated, Image, Modal, Pressable, StyleSheet, TouchableOpacity } from 'react-native';
import { X } from 'lucide-react-native';

/**
 * Full-screen photo lightbox — tap an avatar to open, tap backdrop/X to close.
 * Matches the web app's click-to-enlarge profile photo popup (black backdrop +
 * rounded square image + fade/scale-in animation), used on both the Profile
 * tab's ID card and the Student Detail (ID card) screen.
 */
export function PhotoViewerModal({ visible, photoUrl, onClose }: {
    visible: boolean;
    photoUrl: string | null;
    onClose: () => void;
}) {
    const scale = useRef(new Animated.Value(0.85)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            scale.setValue(0.85);
            opacity.setValue(0);
            Animated.parallel([
                Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 6, speed: 16 }),
                Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
            ]).start();
        }
    }, [visible]);

    if (!photoUrl) return null;

    return (
        <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose}>
                <Animated.View style={[styles.imageWrap, { opacity, transform: [{ scale }] }]}>
                    <Pressable onPress={() => {}}>
                        <Image source={{ uri: photoUrl }} style={styles.image} />
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.8}>
                            <X size={16} color="white" />
                        </TouchableOpacity>
                    </Pressable>
                </Animated.View>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    imageWrap: {
        width: 288,
        height: 288,
        borderRadius: 20,
        overflow: 'hidden',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    closeBtn: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
