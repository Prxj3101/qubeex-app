import { ScreenHeader } from '@/components/ScreenHeader';
import { CampusFeed, CampusFeedHandle } from '@/components/teacher/CampusFeed';
import { CampusPage, CampusStaffroom, CampusStaffroomHandle } from '@/components/teacher/CampusStaffroom';
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

    // One flat pager holds all three pages — Campus feed, Staffroom, DMs — and
    // CampusStaffroom owns it (see the note on its `CampusPage` type for why
    // they aren't two nested pagers any more). This screen just keeps the nav
    // row in step with it: `page` drives the pill and the Staffroom/DM icons,
    // and a swipe reports its landing page back through `onPageChange`.
    const [page, setPage] = useState<CampusPage>('campus');
    const [staffroomHasUnread, setStaffroomHasUnread] = useState(false);

    // The pill still only has two positions: the Campus feed sits under "Feed",
    // and both Staffroom pages sit under "Staffroom".
    const tab: 'feed' | 'staffroom' = page === 'campus' ? 'feed' : 'staffroom';

    // Sliding pill behind the active tab — measured per-button so it exactly
    // matches each label's width instead of a fixed-size highlight.
    //
    // Only the position is animated, and it runs on the native driver, so the
    // spring lives on the UI thread and is completely immune to whatever the JS
    // thread is doing.
    //
    // The width is set outright instead of animated. `width` can't run on the
    // native driver at all, and faking it with scaleX squashes the stadium's
    // rounded end caps into ellipses on the narrower Feed tab. Snapping it
    // mid-slide is imperceptible next to either of those.
    //
    // It's an Animated.Value rather than React state so setting it doesn't
    // re-render anything: as state, the re-render it caused landed a frame
    // after the spring had started and replaced the props on the very view the
    // spring was animating, which on Android made the slide hitch just before
    // it settled. Two nested views because the outer transform runs on the
    // native driver and width can't — one value per view, no mixing.
    const pillX = useRef(new Animated.Value(0)).current;
    const pillW = useRef(new Animated.Value(0)).current;
    const layoutsRef = useRef<Record<string, { x: number; width: number }>>({});

    // Driven off `tab` rather than the tap handler so a swipe moves the pill
    // too — by the time this runs the page has already been reported up, so
    // taps and swipes both land here through the same path. The spring starts
    // in the same tick rather than behind a requestAnimationFrame: the page is
    // already sliding natively by now, so there's no layout pass left to wait
    // out, and deferring only made the pill trail the page.
    useEffect(() => {
        const layout = layoutsRef.current[tab];
        if (!layout) return;
        pillW.setValue(layout.width);
        Animated.spring(pillX, { toValue: layout.x, useNativeDriver: true, ...PILL_SPRING }).start();
    }, [tab, pillX, pillW]);

    // Tapping the active Campus footer tab again — same as the Home tab's
    // tap-to-refresh — scrolls whatever's currently showing back to the top
    // and refetches it, regardless of which of Campus's own pages
    // (Feed / Staffroom / DM thread list / an open DM chat) is active.
    const campusFeedRef = useRef<CampusFeedHandle>(null);
    const campusStaffroomRef = useRef<CampusStaffroomHandle>(null);

    // Built once. Recreating this element on every render made React re-render
    // the whole Campus feed each time the page changed — and since the page now
    // changes mid-swipe, that re-render landed right in the middle of the
    // gesture and held the nav up for a beat. A stable element lets React skip
    // the subtree entirely.
    const feedPage = useMemo(() => <CampusFeed ref={campusFeedRef} />, []);

    const navigation = useNavigation<any>();
    useEffect(() => {
        const unsubscribe = navigation.addListener('tabPress', () => {
            if (!navigation.isFocused()) return;
            if (page === 'campus') campusFeedRef.current?.scrollToTopAndRefresh();
            else campusStaffroomRef.current?.scrollToTopAndRefresh();
        });
        return unsubscribe;
    }, [navigation, page]);

    // Memoised so unrelated re-renders — the page flip itself, the DM unread dot
    // ticking over from Staffroom's polling — don't push new props onto a view
    // with a native animation running on it, which interrupts it visibly. With
    // the width living in an Animated.Value, nothing here changes between
    // renders any more, so the element really is built once.
    const pill = useMemo(() => (
        <Animated.View pointerEvents="none" style={[styles.tabPillTrack, { transform: [{ translateX: pillX }] }]}>
            <Animated.View style={[styles.tabPillFill, { backgroundColor: accent.purple, width: pillW }]} />
        </Animated.View>
    ), [accent.purple, pillX, pillW]);

    const handleTabLayout = (key: string, e: LayoutChangeEvent) => {
        const { x, width } = e.nativeEvent.layout;
        layoutsRef.current[key] = { x, width };
        if (key === tab) {
            pillX.setValue(x);
            pillW.setValue(width);
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
                                // Tapping the already-active tab is a no-op —
                                // including tapping "Staffroom" while on DMs,
                                // which stays where it is rather than jumping
                                // back a page.
                                onPress={() => {
                                    if (t.key === tab) return;
                                    setPage(t.key === 'feed' ? 'campus' : 'staffroom');
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
                            onPress={() => setPage('staffroom')}
                            style={[styles.innerSwitchBtn, page === 'staffroom' && { backgroundColor: isDark ? '#000000' : '#FFFFFF', ...styles.innerSwitchBtnActiveShadow }]}
                        >
                            <Users size={12} color={page === 'staffroom' ? text : subText} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setPage('dms')}
                            style={[styles.innerSwitchBtn, page === 'dms' && { backgroundColor: isDark ? '#000000' : '#FFFFFF', ...styles.innerSwitchBtnActiveShadow }]}
                        >
                            <User size={12} color={page === 'dms' ? text : subText} />
                            {staffroomHasUnread && <View style={styles.dmUnreadDot} />}
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            <CampusStaffroom
                ref={campusStaffroomRef}
                page={page}
                onPageChange={setPage}
                onUnreadChange={setStaffroomHasUnread}
                leadingPage={feedPage}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    tabRow: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 6 },
    tabTrack: { flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 99, padding: 3, gap: 3 },
    tabPillTrack: { position: 'absolute', top: 3, bottom: 3 },
    tabPillFill: { height: '100%', borderRadius: 99 },
    tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99 },
    innerSwitchTrack: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 3 },
    innerSwitchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
    innerSwitchBtnActiveShadow: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 2 },
    dmUnreadDot: { position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
});
