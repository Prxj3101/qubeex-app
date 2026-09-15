import { ScreenHeader } from '@/components/ScreenHeader';
import { CampusFeed, CampusFeedHandle } from '@/components/teacher/CampusFeed';
import { CampusStaffroom, CampusStaffroomHandle } from '@/components/teacher/CampusStaffroom';
import { useTheme } from '@/context/ThemeContext';
import Constants from 'expo-constants';
import { useNavigation } from 'expo-router';
import { MessageSquare, Rss, User, Users } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const CAMPUS_TABS = [
    { key: 'feed' as const, label: 'Feed', icon: Rss },
    { key: 'staffroom' as const, label: 'Staffroom', icon: MessageSquare },
];

// Same character as the web's Feed/Staffroom pill (framer-motion's
// `{ type: 'spring', bounce: 0.2 }`) — one gentle overshoot before it settles —
// just quicker. What matters for the feel is the damping ratio,
// damping / (2 * sqrt(stiffness * mass)) = 27 / (2 * sqrt(300)) ≈ 0.78; raising
// stiffness and damping together speeds the whole thing up without turning the
// bounce into either a wobble or a dead stop.
//
// Rest thresholds are left at their defaults on purpose. Loosening them cuts
// the spring off early — it snaps to the target while still visibly moving,
// which reads as a small jerk right at the end of the slide. Since this runs on
// the native driver, letting the tail decay naturally costs the JS thread
// nothing.
const PILL_SPRING = {
    stiffness: 300,
    damping: 27,
    mass: 1,
} as const;


export default function TeacherCampusScreen() {
    const { isDark, accent } = useTheme();
    const bg = isDark ? '#000000' : '#FAF8FF';
    const text = isDark ? '#F1F5F9' : '#0F172A';
    const subText = isDark ? '#94A3B8' : '#64748B';
    const trackBg = isDark ? '#1A1A1A' : '#EDEFF3';

    const [tab, setTab] = useState<'feed' | 'staffroom'>('feed');
    const [staffroomInnerTab, setStaffroomInnerTab] = useState<'feed' | 'dms'>('feed');
    const [staffroomHasUnread, setStaffroomHasUnread] = useState(false);

    // Sliding pill behind the active tab — measured per-button so it exactly
    // matches each label's width instead of a fixed-size highlight.
    //
    // Only the position is animated, and it runs on the native driver, so the
    // spring lives on the UI thread and is completely immune to whatever the JS
    // thread is doing — which is the whole ballgame here, because revealing the
    // other screen costs a layout pass and any JS-driven animation visibly
    // stalls when that lands.
    //
    // The width is set outright instead of animated. `width` can't run on the
    // native driver at all, and faking it with scaleX squashes the stadium's
    // rounded end caps into ellipses on the narrower Feed tab. Snapping it
    // mid-slide is imperceptible next to either of those.
    const pillX = useRef(new Animated.Value(0)).current;
    const [pillWidth, setPillWidth] = useState(0);
    const layoutsRef = useRef<Record<string, { x: number; width: number }>>({});

    // Both screens are mounted the whole time and switching only toggles which
    // one is `display: 'none'`. A conditional render instead meant every switch
    // paid for a full unmount + remount — fresh fetches, a loading spinner, the
    // calendar rebuilding — which is what made the page land a second or two
    // after the button did.
    //
    // The swap happens immediately on tap. Deferring it — first to the spring's
    // completion, then to a timer — was an attempt to keep its layout pass off
    // the JS thread mid-animation, but that just moved the visible stall from
    // the start of the slide to the middle of it. With the spring on the native
    // driver there's nothing left to protect, so the page can appear at once.
    //
    // Stacking the panes absolutely and crossfading opacity instead of using
    // `display` was also tried, and left Staffroom rendering completely blank —
    // don't reach for that again.

    // Tapping the active Campus footer tab again — same as the Home tab's
    // tap-to-refresh — scrolls whatever's currently showing back to the top
    // and refetches it, regardless of which of Campus's own sub-tabs
    // (Feed / Staffroom feed / DM thread list / an open DM chat) is active.
    const campusFeedRef = useRef<CampusFeedHandle>(null);
    const campusStaffroomRef = useRef<CampusStaffroomHandle>(null);
    const navigation = useNavigation<any>();
    useEffect(() => {
        const unsubscribe = navigation.addListener('tabPress', () => {
            if (!navigation.isFocused()) return;
            if (tab === 'feed') campusFeedRef.current?.scrollToTopAndRefresh();
            else campusStaffroomRef.current?.scrollToTopAndRefresh();
        });
        return unsubscribe;
    }, [navigation, tab]);

    const animateToTab = (key: 'feed' | 'staffroom') => {
        const layout = layoutsRef.current[key];
        if (!layout) return;
        setPillWidth(layout.width);
        // The pill is deliberately decoupled from the page swap: the spring is
        // kicked off only once React has committed that swap and the layout
        // work it costs is done. Starting it in the same tick means its opening
        // frames land inside that stall — even a native animation reads as
        // janky when it begins mid-freeze. Letting the page arrive first and
        // the pill follow a beat later is how this reads on the web too.
        requestAnimationFrame(() => {
            Animated.spring(pillX, { toValue: layout.x, useNativeDriver: true, ...PILL_SPRING }).start();
        });
    };

    // Memoised so unrelated re-renders — the tab flip itself, the DM unread dot
    // ticking over from Staffroom's polling — don't push new props onto a view
    // with a native animation running on it, which interrupts it visibly.
    const pill = useMemo(() => (
        <Animated.View
            pointerEvents="none"
            style={[
                styles.tabPill,
                { backgroundColor: accent.purple, width: pillWidth, transform: [{ translateX: pillX }] },
            ]}
        />
    ), [accent.purple, pillWidth, pillX]);

    const handleTabLayout = (key: string, e: LayoutChangeEvent) => {
        const { x, width } = e.nativeEvent.layout;
        layoutsRef.current[key] = { x, width };
        if (key === tab) {
            pillX.setValue(x);
            setPillWidth(width);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: bg, paddingTop: Constants.statusBarHeight }]}>
            <ScreenHeader title="Campus" />

            <View style={[styles.tabRow, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                <View style={[styles.tabTrack, { backgroundColor: trackBg }]}>
                    {pill}
                    {CAMPUS_TABS.map((t) => {
                        const isActive = tab === t.key;
                        const Icon = t.icon;
                        return (
                            <TouchableOpacity
                                key={t.key}
                                // Animation first, state second, so the spring
                                // is handed to the UI thread before React does
                                // the render that swaps the panes. Tapping the
                                // already-active tab is a no-op.
                                onPress={() => {
                                    if (t.key === tab) return;
                                    animateToTab(t.key);
                                    setTab(t.key);
                                }}
                                onLayout={(e) => handleTabLayout(t.key, e)}
                                style={styles.tabBtn}
                            >
                                <Icon size={13} color={isActive ? '#fff' : subText} />
                                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: isActive ? '#fff' : subText }}>{t.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {tab === 'staffroom' && (
                    <View style={[styles.innerSwitchTrack, { backgroundColor: trackBg }]}>
                        <TouchableOpacity
                            onPress={() => setStaffroomInnerTab('feed')}
                            style={[styles.innerSwitchBtn, staffroomInnerTab === 'feed' && { backgroundColor: isDark ? '#000000' : '#FFFFFF', ...styles.innerSwitchBtnActiveShadow }]}
                        >
                            <Users size={12} color={staffroomInnerTab === 'feed' ? text : subText} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setStaffroomInnerTab('dms')}
                            style={[styles.innerSwitchBtn, staffroomInnerTab === 'dms' && { backgroundColor: isDark ? '#000000' : '#FFFFFF', ...styles.innerSwitchBtnActiveShadow }]}
                        >
                            <User size={12} color={staffroomInnerTab === 'dms' ? text : subText} />
                            {staffroomHasUnread && <View style={styles.dmUnreadDot} />}
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            <View style={{ flex: 1 }}>
                <View style={[styles.pane, tab !== 'feed' && styles.paneHidden]}>
                    <CampusFeed ref={campusFeedRef} />
                </View>
                <View style={[styles.pane, tab !== 'staffroom' && styles.paneHidden]}>
                    <CampusStaffroom
                        ref={campusStaffroomRef}
                        innerTab={staffroomInnerTab}
                        onInnerTabChange={setStaffroomInnerTab}
                        onUnreadChange={setStaffroomHasUnread}
                    />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    // `display: 'none'` takes the inactive pane out of layout without
    // unmounting it, so its state, scroll position and fetched data all
    // survive and it comes straight back.
    pane: { flex: 1 },
    paneHidden: { display: 'none' },
    tabRow: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 6 },
    tabTrack: { flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 99, padding: 3, gap: 3 },
    tabPill: { position: 'absolute', top: 3, bottom: 3, borderRadius: 99 },
    tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99 },
    innerSwitchTrack: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 3 },
    innerSwitchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
    innerSwitchBtnActiveShadow: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 2 },
    dmUnreadDot: { position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
});
