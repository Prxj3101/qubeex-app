import { useTheme } from '@/context/ThemeContext';
import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import PencilLoader from '@/components/Pencilloader';

/**
 * Covers a tab screen's own content for a short beat right when it becomes
 * focused, so the previous overlay-from-a-sibling-parent approach (in
 * (tabs)/_layout.tsx) — which relies on a separate component's state update
 * landing before the destination screen's own first paint — can't race and
 * flash the new screen's content for a frame. Rendering the cover inside
 * the SAME return as the screen's own content guarantees React commits both
 * together in one go: there's no tree boundary for a race to happen across.
 *
 * Usage: `const showCover = useTabEntryCover();` then render
 * `<TabEntryCover visible={showCover} />` as the LAST child inside the
 * screen's own content wrapper (below the screen's own header/topbar).
 */
export function useTabEntryCover(durationMs = 2000) {
    const isFocused = useIsFocused();
    // Starts true on the very first render (mount) — same commit as the
    // screen's own content, so it's already covering before anything else
    // has a chance to paint.
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        if (!isFocused) return;
        setVisible(true);
        const t = setTimeout(() => setVisible(false), durationMs);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFocused]);

    return visible;
}

// Per-theme light-mode page background — mirrors app/(tabs)/feed.tsx's LIGHT_BG.
const LIGHT_BG: Record<string, string> = {
    purple: '#FBFBFF', blue: '#F7FBFE', teal: '#F0F7F3', amber: '#FEFBF7',
    rose: '#FBF7F7', indigo: '#F3F7FE', slate: '#FBFEFE',
};

export function TabEntryCover({ visible }: { visible: boolean }) {
    const { isDark, themeColor } = useTheme();
    // PencilLoader renders through a WebView, which takes a beat to mount
    // and start playing its animation on first load. Unmounting this (via
    // `if (!visible) return null`) between tab switches was throwing that
    // away every time — the cover would show, but the WebView hadn't
    // finished loading/animating yet, so all you saw was a blank panel that
    // then snapped straight to the real content. Keeping it always mounted
    // and just toggling opacity/pointerEvents means the WebView loads once
    // and stays warm, so the animation is already running and visible on
    // every subsequent tab entry.
    return (
        <View
            pointerEvents={visible ? 'auto' : 'none'}
            style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: isDark ? '#000000' : (LIGHT_BG[themeColor] ?? LIGHT_BG.purple),
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 999,
                elevation: 999,
                opacity: visible ? 1 : 0,
            }}
        >
            <PencilLoader size={85} />
        </View>
    );
}
