import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import React from 'react';
import { Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';

export const WHEEL_ITEM_H = 22;

/**
 * Compact vertical "wheel" picker — drag to spin, or tap the chevrons, one
 * option per step. Used anywhere we need a small inline mode switch (e.g.
 * Offline/Online/Combined) that matches the Subject Performance picker on
 * the Profile screen exactly.
 */
export function InlineWheel({ options, value, onChange, isDark, theme }: {
    options: string[];
    value: string;
    onChange: (v: string) => void;
    isDark: boolean;
    theme: { purple: string; purpleLight?: string };
}) {
    const scrollRef = React.useRef<ScrollView>(null);
    const n = options.length;
    const REPEAT = 9;
    const middleSet = Math.floor(REPEAT / 2);
    const loopedOptions = React.useMemo(
        () => Array.from({ length: REPEAT * n }, (_, i) => options[i % n]),
        [options]
    );

    // One step per gesture, regardless of drag distance: we only look at the
    // direction the user dragged (not where they landed), advance `value` by
    // exactly one option in that direction, and always recenter afterwards.
    // `handledRef` ensures a gesture commits at most once even if both
    // onScrollEndDrag-style events fire for it.
    const startOffsetRef = React.useRef(0);
    const handledRef = React.useRef(true);

    const centerOn = (val: string, animated: boolean) => {
        const idx = middleSet * n + options.indexOf(val);
        scrollRef.current?.scrollTo({ y: idx * WHEEL_ITEM_H, animated });
    };

    React.useEffect(() => {
        centerOn(value, false);
    }, [value]);

    const onDragStart = (e: any) => {
        startOffsetRef.current = e.nativeEvent.contentOffset.y;
        handledRef.current = false;
    };

    // Shared single-step logic so both the drag gesture and the arrow
    // buttons advance exactly one option in the given direction.
    const step = (dir: 1 | -1) => {
        const curIdx = options.indexOf(value);
        const next = options[(curIdx + dir + n) % n];
        // selectionAsync's "view tick" haptic is barely perceptible on most
        // Android devices/OEMs, so use a real vibrator-driven impact there
        // (matches the impactAsync pattern already used in TopBar/ScreenHeader).
        if (Platform.OS === 'android') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else {
            Haptics.selectionAsync();
        }
        onChange(next);
    };

    const commitStep = (e: any) => {
        if (handledRef.current) return;
        handledRef.current = true;
        const delta = e.nativeEvent.contentOffset.y - startOffsetRef.current;
        if (Math.abs(delta) >= WHEEL_ITEM_H / 2) {
            step(delta > 0 ? 1 : -1);
        } else {
            centerOn(value, false);
        }
    };

    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            height: WHEEL_ITEM_H,
            width: 86,
            paddingHorizontal: 4,
            gap: 2,
            borderRadius: 8,
            borderWidth: 1,
            // Was hardcoded to purple's own tint regardless of the institution's
            // chosen theme color — now derived from theme.purpleLight (already
            // resolved to the correct light/dark variant per family upstream)
            // with a plain alpha border so it follows every theme color.
            borderColor: theme.purple + (isDark ? '4D' : '33'),
            backgroundColor: theme.purpleLight ?? (isDark ? '#1E1533' : '#F3F0FA'),
        }}>
            <View style={{ flex: 1, height: WHEEL_ITEM_H, overflow: 'hidden' }}>
                <ScrollView
                    ref={scrollRef}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={WHEEL_ITEM_H}
                    decelerationRate="fast"
                    disableIntervalMomentum
                    onScrollBeginDrag={onDragStart}
                    onScrollEndDrag={commitStep}
                    onMomentumScrollEnd={commitStep}
                    nestedScrollEnabled
                >
                    {loopedOptions.map((opt, i) => (
                        <View key={i} style={{ height: WHEEL_ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{
                                fontSize: 10,
                                fontFamily: 'Poppins_600SemiBold',
                                color: theme.purple,
                                textTransform: 'capitalize',
                            }}>
                                {opt}
                            </Text>
                        </View>
                    ))}
                </ScrollView>
            </View>
            <View style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <TouchableOpacity activeOpacity={0.6} onPress={() => step(-1)} hitSlop={{ top: 6, bottom: 2, left: 6, right: 6 }}>
                    <ChevronUp size={11} color={theme.purple} />
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.6} onPress={() => step(1)} hitSlop={{ top: 2, bottom: 6, left: 6, right: 6 }}>
                    <ChevronDown size={11} color={theme.purple} style={{ marginTop: -2 }} />
                </TouchableOpacity>
            </View>
        </View>
    );
}
