import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '@/lib/api';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, BackHandler, Easing, PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { MyBusScreen, type MyBus } from './ParentBus';

// Floating school-bus button on the Home screen (only when the child rides a
// school bus). Drag it anywhere, it snaps to the nearest side (like the
// Next.js dev indicator). Tap: open "My Bus". Long-press: a pill with the
// bus, ETA and stop (like the iPhone's Dynamic Island).
//
//   the ring around the button fills up as the bus gets closer to the stop
//   moving  → wheels spin, exhaust smoke, body rumbles, road + clouds slide
//   stopped → engine idle: gentle rumble, headlight blinks, light puffs
//   offline → the bus sleeps (Zzz)
//   ≤ 2 min → "Beep beep!" bubble + one buzz; at "now" the button also pulses
//   the sky inside follows the time of day (morning, day, evening, night)
// All the looping animations run on the native driver, so they're cheap.

const SIZE = 75; // circle; the bus inside stays BUS_W wide so more sky + road shows around it
const RING = 3.5;
const RING_MIN = 15; // the ring starts filling when the bus is this many minutes away
const EDGE = 12;
const POS_KEY = 'qx-bus-fab-pos';
const PILL_W = 215;
type BusState = 'moving' | 'idle' | 'offline';
type Side = 'left' | 'right';

function stateOf(d: MyBus | null): BusState {
    if (!d?.online || !d.position) return 'offline';
    return d.position.speedKmh > 2 ? 'moving' : 'idle';
}

const ACCENT: Record<BusState, string> = { moving: '#16A34A', idle: '#F59E0B', offline: '#9CA3AF' };

/** onOpenChange: told when the My Bus screen opens / closes (home locks the parent-mode switch meanwhile). */
export function FloatingBusButton({ isDark, onOpenChange }: { isDark: boolean; onOpenChange?: (open: boolean) => void }) {
    const [data, setData] = useState<MyBus | null>(null);
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [side, setSide] = useState<Side>('left');
    const [area, setArea] = useState<{ w: number; h: number } | null>(null);
    // bumped when we come back (My Bus screen closed / app resumed) so the scene restarts its loops cleanly
    const [epoch, setEpoch] = useState(0);
    useEffect(() => {
        const sub = AppState.addEventListener('change', st => { if (st === 'active') { setEpoch(e => e + 1); refreshRef.current(); } });
        return () => sub.remove();
    }, []);
    // ── My Bus screen: slides up inside this area (below the app's top bar), not as a full-screen modal ──
    const sheet = useRef(new Animated.Value(0)).current;
    useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => () => onOpenChange?.(false), []); // never leave the switch locked if this goes away
    const openScreen = useCallback(() => {
        setOpen(true);
        sheet.setValue(0);
        Animated.timing(sheet, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, [sheet]);
    const closeScreen = useCallback(() => {
        Animated.timing(sheet, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
            setOpen(false);
            setEpoch(e => e + 1);
        });
    }, [sheet]);
    // Android back closes it
    useEffect(() => {
        if (!open) return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => { closeScreen(); return true; });
        return () => sub.remove();
    }, [open, closeScreen]);

    const state = stateOf(data);
    const eta = state !== 'offline' ? data?.etaMinutes ?? null : null;
    const arriving = eta != null && eta <= 2; // "Beep beep" bubble from 2 min
    const here = eta != null && eta <= 1;     // the beat (pulse) only at "now"

    // poll faster while the bus is live
    const refresh = useCallback(async () => {
        try { setData((await api.get<{ data: MyBus | null }>('/student/transport')).data.data); }
        catch { /* keep the last state */ }
    }, []);
    const refreshRef = useRef(refresh);
    refreshRef.current = refresh;
    useEffect(() => {
        refresh();
        // live: every 5s so the ring / ETA / bus keep up; offline: 20s so we notice soon when the bus starts
        const id = setInterval(refresh, state === 'offline' ? 20_000 : 5_000);
        return () => clearInterval(id);
    }, [refresh, state]);
    // while the long-press pill is open, refresh every 3s so the speed stays live
    useEffect(() => {
        if (!expanded) return;
        refresh();
        const id = setInterval(refresh, 3_000);
        return () => clearInterval(id);
    }, [expanded, refresh]);

    // shown speed counts smoothly towards the latest reading (like a speedometer)
    const targetSpeed = state !== 'offline' && data?.position ? Math.round(data.position.speedKmh) : null;
    const [shownSpeed, setShownSpeed] = useState<number | null>(targetSpeed);
    useEffect(() => {
        if (targetSpeed == null) { setShownSpeed(null); return; }
        const id = setInterval(() => {
            setShownSpeed(cur => {
                if (cur == null) return targetSpeed;
                const diff = targetSpeed - cur;
                if (diff === 0) { clearInterval(id); return cur; }
                return cur + Math.sign(diff) * Math.max(1, Math.round(Math.abs(diff) / 4));
            });
        }, 90);
        return () => clearInterval(id);
    }, [targetSpeed]);

    // ── ETA ring: a simple fixed scale, so it always means the same thing ──
    // 15 min or more away → empty, 10 min → 1/3, 5 min → 2/3, "now" → full.
    const progress = eta == null ? 0 : eta <= 1 ? 1 : Math.min(1, Math.max(0, (RING_MIN - eta) / (RING_MIN - 1)));

    // ── arriving: one buzz when it starts ──
    const wasArriving = useRef(false);
    useEffect(() => {
        if (arriving && !wasArriving.current) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        wasArriving.current = arriving;
    }, [arriving]);
    const pulse = useRef(new Animated.Value(0)).current;
    useLoop(() => Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]), here && !expanded, [], [pulse]);
    useEffect(() => { if (!here) pulse.setValue(0); }, [here, pulse]);

    // ── long-press pill ──
    const pill = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        // native driver (slide + fade only, no width change) so it stays smooth even while JS is busy
        Animated.spring(pill, { toValue: expanded ? 1 : 0, useNativeDriver: true, damping: 18, stiffness: 190, mass: 0.8 }).start();
    }, [expanded, pill]);

    // ── drag + snap to a side ──
    const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
    const last = useRef({ x: 0, y: 0 });
    const placed = useRef(false);
    const clamp = useCallback((x: number, y: number, a: { w: number; h: number }) => ({
        x: Math.min(Math.max(x, EDGE), a.w - SIZE - EDGE),
        y: Math.min(Math.max(y, EDGE + 26), a.h - SIZE - EDGE),
    }), []);

    // first layout: restore the saved spot, else bottom-left
    const onLayout = (e: LayoutChangeEvent) => {
        const a = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
        setArea(a);
        if (placed.current) return;
        placed.current = true;
        AsyncStorage.getItem(POS_KEY).then(raw => {
            let p = { x: EDGE, y: a.h - SIZE - 24 };
            let sd: Side = 'left';
            try {
                const saved = raw ? JSON.parse(raw) as { side: Side; yRatio: number } : null;
                if (saved) { sd = saved.side; p = { x: sd === 'right' ? a.w - SIZE - EDGE : EDGE, y: saved.yRatio * a.h }; }
            } catch { /* use the default */ }
            const c = clamp(p.x, p.y, a);
            last.current = c;
            pos.setValue(c);
            setSide(sd);
        });
    };

    const areaRef = useRef(area);
    areaRef.current = area;
    const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const held = useRef(false);
    const responder = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
            pos.setOffset(last.current);
            pos.setValue({ x: 0, y: 0 });
            held.current = false;
            holdTimer.current = setTimeout(() => {
                held.current = true;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                setExpanded(true);
            }, 380);
        },
        onPanResponderMove: (e, g) => {
            if (held.current) return; // holding open the pill: don't drag
            if (Math.abs(g.dx) + Math.abs(g.dy) > 6 && holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
            Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false })(e, g);
        },
        onPanResponderRelease: (_e, g) => {
            if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
            pos.flattenOffset();
            if (held.current) { // let go of a long-press: close the pill
                held.current = false;
                pos.setValue(last.current);
                setExpanded(false);
                return;
            }
            const a = areaRef.current;
            if (Math.abs(g.dx) + Math.abs(g.dy) < 6) { // a tap
                pos.setValue(last.current);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                openScreen();
                return;
            }
            if (!a) return;
            const x = last.current.x + g.dx, y = last.current.y + g.dy;
            const sd: Side = x + SIZE / 2 < a.w / 2 ? 'left' : 'right';
            const to = clamp(sd === 'left' ? EDGE : a.w - SIZE - EDGE, y, a);
            last.current = to;
            setSide(sd);
            Animated.spring(pos, { toValue: to, useNativeDriver: false, friction: 7, tension: 60 }).start();
            AsyncStorage.setItem(POS_KEY, JSON.stringify({ side: sd, yRatio: to.y / a.h })).catch(() => {});
        },
        onPanResponderTerminate: () => {
            if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
            held.current = false;
            pos.flattenOffset();
            pos.setValue(last.current);
            setExpanded(false);
        },
    })).current;

    if (!data) return null;
    const color = ACCENT[state];
    const facesLeft = (data.position?.course ?? 90) >= 180; // heading anywhere west → bus faces left
    const etaText = eta == null ? null : eta <= 1 ? 'Now' : `${eta}m`;
    const towardsCentre = side === 'left' ? 1 : -1; // pill and bubble open towards the middle of the screen
    const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] });
    const pillLine1 = `${data.bus.name}${eta != null ? ` · ${eta <= 1 ? 'arriving now' : `${eta} min away`}` : state === 'offline' ? ' · not running' : ' · stopped'}`;
    const place = data.stop?.name ?? (data.bus.route?.name ?? '');
    // live speed first (so a long stop name gets cut, not the speed)
    const speed = shownSpeed != null ? `⚡ ${shownSpeed} km/h` : '';
    const pillLine2 = [speed, place && `📍 ${place}`].filter(Boolean).join(' · ');

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={onLayout}>
            {area && (
                <Animated.View pointerEvents="box-none" style={[s.anchor, { transform: pos.getTranslateTransform() }]}>
                    {/* long-press pill (behind the circle, opening towards the middle) */}
                    {/* the pill slides out from behind the circle; this box clips it while hidden */}
                    <View pointerEvents="none" style={[s.pillClip, side === 'left' ? { left: SIZE / 2 } : { right: SIZE / 2 }]}>
                        <Animated.View
                            style={[s.pill, {
                                backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                                borderColor: color,
                                opacity: pill.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] }),
                                transform: [{ translateX: pill.interpolate({ inputRange: [0, 1], outputRange: [side === 'left' ? -PILL_W : PILL_W, 0] }) }],
                            }]}
                        >
                            <View style={[s.pillText, side === 'left' ? { paddingLeft: SIZE / 2 + 10 } : { paddingRight: SIZE / 2 + 10, alignItems: 'flex-end' }]}>
                                <Text numberOfLines={1} style={[s.pillTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{pillLine1}</Text>
                                {!!pillLine2 && <Text numberOfLines={1} style={[s.pillSub, { color: isDark ? '#94A3B8' : '#64748B' }]}>{pillLine2}</Text>}
                            </View>
                        </Animated.View>
                    </View>

                    {/* "Beep beep!" bubble when the bus is about to arrive */}
                    {arriving && !expanded && (
                        <View pointerEvents="none" style={[s.bubble, side === 'left' ? { left: SIZE + 6 } : { right: SIZE + 6 }, { backgroundColor: color }]}>
                            <Text style={s.bubbleText}>🚌 Beep beep! {here ? 'Here now' : `${eta} min`}</Text>
                            <View style={[s.bubbleTail, side === 'left' ? { left: -5 } : { right: -5 }, { borderRightColor: side === 'left' ? color : 'transparent', borderLeftColor: side === 'right' ? color : 'transparent', borderRightWidth: side === 'left' ? 6 : 0, borderLeftWidth: side === 'right' ? 6 : 0 }]} />
                        </View>
                    )}

                    {/* the circle */}
                    <Animated.View {...responder.panHandlers} style={[s.fab, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF', transform: [{ scale }] }]}>
                        <View style={s.clip}>
                            <Scene state={state} facesLeft={facesLeft} towards={towardsCentre} epoch={epoch} />
                        </View>
                        <EtaRing progress={progress} color={color} track={isDark ? '#3A3A3C' : '#E5E7EB'} />
                        {etaText && (
                            <View style={[s.badge, { backgroundColor: color, borderColor: isDark ? '#1C1C1E' : '#FFFFFF' }, side === 'left' ? { right: -6 } : { left: -6 }]}>
                                <Text style={s.badgeText}>{etaText}</Text>
                            </View>
                        )}
                    </Animated.View>
                </Animated.View>
            )}
            {open && (
                <Animated.View style={[StyleSheet.absoluteFill, {
                    opacity: sheet.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
                    transform: [{ translateY: sheet.interpolate({ inputRange: [0, 1], outputRange: [area?.h ?? 600, 0] }) }],
                }]}>
                    <MyBusScreen inline isDark={isDark} initial={data} onData={setData} onClose={() => { closeScreen(); refresh(); }} />
                </Animated.View>
            )}
        </View>
    );
}

// ── ETA ring ─────────────────────────────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function EtaRing({ progress, color, track }: { progress: number; color: string; track: string }) {
    const r = (SIZE - RING) / 2;
    const len = 2 * Math.PI * r;
    const v = useRef(new Animated.Value(progress)).current;
    useEffect(() => {
        Animated.timing(v, { toValue: progress, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    }, [progress, v]);
    return (
        <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={r} stroke={progress > 0 ? track : color} strokeWidth={RING} fill="none" />
            {progress > 0 && (
                <AnimatedCircle
                    cx={SIZE / 2} cy={SIZE / 2} r={r} stroke={color} strokeWidth={RING} fill="none" strokeLinecap="round"
                    strokeDasharray={`${len} ${len}`}
                    strokeDashoffset={v.interpolate({ inputRange: [0, 1], outputRange: [len, 0] })}
                    transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                />
            )}
        </Svg>
    );
}

// ── The scene inside the circle: sky, road, the bus ──────────────────────────

const INNER = SIZE - RING * 2 - 1;
const BUS_W = 52;
const BUS_H = BUS_W * 80 / 120; // drawing is 120 x 80 (a tall body; wheels stay round)
const k = BUS_W / 120;
const WHEELS = [28, 105]; // wheel centres (x) in drawing units, y = WHEEL_Y
const WHEEL_Y = 64;
const GROUND_Y = INNER * 0.72; // where the road starts inside the circle

// Starts each loop from 0. Animated.loop replays from wherever the value was when
// it started, so a loop stopped half-way (e.g. idle → moving again) would
// otherwise only cover the leftover part and look stuck.
function useLoop(make: () => Animated.CompositeAnimation, on: boolean, deps: unknown[], vals: Animated.Value[]) {
    useEffect(() => {
        if (!on) return;
        vals.forEach(v => v.setValue(0));
        const a = Animated.loop(make());
        a.start();
        return () => a.stop();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [on, ...deps]);
}

/** Sky colours by local time of day. */
function skyNow(): { top: string; bottom: string; night: boolean } {
    const h = new Date().getHours();
    if (h >= 5 && h < 9) return { top: '#FFB88C', bottom: '#BFE3FF', night: false };   // morning
    if (h >= 9 && h < 16) return { top: '#6EC1FF', bottom: '#D6EEFF', night: false };  // day
    if (h >= 16 && h < 19) return { top: '#FF8FA3', bottom: '#FFD29D', night: false }; // evening
    return { top: '#0B1736', bottom: '#2A3A6B', night: true };                          // night
}

function Scene({ state, facesLeft, towards, epoch }: { state: BusState; facesLeft: boolean; towards: number; epoch: number }) {
    const moving = state === 'moving';
    const live = state !== 'offline';
    const sky = skyNow();

    const spin = useRef(new Animated.Value(0)).current;
    const rumble = useRef(new Animated.Value(0)).current;
    const road = useRef(new Animated.Value(0)).current;
    const cloud = useRef(new Animated.Value(0)).current;
    const blink = useRef(new Animated.Value(0)).current;
    const zzz = useRef(new Animated.Value(0)).current;
    const puffs = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

    useLoop(() => Animated.timing(spin, { toValue: 1, duration: 450, easing: Easing.linear, useNativeDriver: true }), moving, [epoch], [spin]);
    useLoop(() => Animated.sequence([
        Animated.timing(rumble, { toValue: 1, duration: moving ? 90 : 260, useNativeDriver: true }),
        Animated.timing(rumble, { toValue: 0, duration: moving ? 90 : 260, useNativeDriver: true }),
    ]), live, [moving, epoch], [rumble]);
    useLoop(() => Animated.timing(road, { toValue: 1, duration: 600, easing: Easing.linear, useNativeDriver: true }), moving, [epoch], [road]);
    useLoop(() => Animated.timing(cloud, { toValue: 1, duration: 5200, easing: Easing.linear, useNativeDriver: true }), moving, [epoch], [cloud]);
    useLoop(() => Animated.sequence([
        Animated.timing(blink, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 0, duration: 450, useNativeDriver: true }),
        Animated.delay(900),
    ]), state === 'idle', [epoch], [blink]);
    useLoop(() => Animated.timing(zzz, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }), state === 'offline', [epoch], [zzz]);
    puffs.forEach((p, i) => {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useLoop(() => Animated.sequence([
            Animated.delay(i * (moving ? 380 : 900)),
            Animated.timing(p, { toValue: 1, duration: moving ? 1150 : 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(p, { toValue: 0, duration: 0, useNativeDriver: true }),
            Animated.delay((2 - i) * (moving ? 380 : 900)),
        ]), live, [moving, epoch], [p]);
    });
    useEffect(() => { if (!moving) spin.setValue(0); }, [moving, spin]);

    const back = facesLeft ? 1 : -1; // scenery slides backwards, against the bus's heading
    const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
    const lift = rumble.interpolate({ inputRange: [0, 1], outputRange: [0, moving ? -0.9 : -0.45] });
    const dashX = road.interpolate({ inputRange: [0, 1], outputRange: [0, 14 * back] });
    const cloudX = cloud.interpolate({ inputRange: [0, 1], outputRange: [-34 * back, 34 * back] });

    return (
        <View style={{ width: INNER, height: INNER, alignItems: 'center', justifyContent: 'center' }}>
            {/* sky */}
            <Svg width={INNER} height={INNER} style={StyleSheet.absoluteFill}>
                <Defs>
                    <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={sky.top} />
                        <Stop offset="1" stopColor={sky.bottom} />
                    </LinearGradient>
                </Defs>
                <Rect width={INNER} height={INNER} fill="url(#sky)" />
                {sky.night && <>
                    <Circle cx={INNER * 0.74} cy={INNER * 0.22} r={4.5} fill="#FFF3C4" />
                    <Circle cx={INNER * 0.78} cy={INNER * 0.19} r={3.8} fill="#0B1736" />
                    {[[0.2, 0.18], [0.36, 0.3], [0.55, 0.14], [0.28, 0.08], [0.6, 0.32]].map(([x, y], i) => <Circle key={i} cx={INNER * x} cy={INNER * y} r={0.8} fill="#FFFFFF" />)}
                </>}
                {/* ground + road */}
                <Rect y={GROUND_Y} width={INNER} height={INNER - GROUND_Y} fill={sky.night ? '#2E3440' : '#5B6470'} />
            </Svg>

            {/* clouds drift past while driving */}
            {!sky.night && (
                <Animated.View style={[s.cloudRow, { transform: [{ translateX: moving ? cloudX : 0 }] }]}>
                    <View style={[s.cloud, { width: 16, top: INNER * 0.14, left: INNER * 0.1 }]} />
                    <View style={[s.cloud, { width: 11, top: INNER * 0.24, left: INNER * 0.58 }]} />
                </Animated.View>
            )}

            {/* road markings */}
            <Animated.View style={[s.road, { transform: [{ translateX: moving ? dashX : 0 }] }]}>
                {Array.from({ length: 10 }).map((_, i) => <View key={i} style={s.dash} />)}
            </Animated.View>

            {/* the bus */}
            {/* tyres sit on the road: bottom of the wheels a little below where the ground starts */}
            <View style={{ position: 'absolute', left: (INNER - BUS_W) / 2, top: GROUND_Y + 3 - (WHEEL_Y + 9.5) * k, width: BUS_W, height: BUS_H + 4, transform: [{ scaleX: facesLeft ? -1 : 1 }], opacity: live ? 1 : 0.85 }}>
                {live && puffs.map((p, i) => (
                    <Animated.View
                        key={i}
                        style={[s.puff, {
                            left: 1 * k - 3, top: 58 * k - 3,
                            opacity: p.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, moving ? 0.85 : 0.45, 0] }),
                            transform: [
                                { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, moving ? -16 : -8] }) },
                                { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, -7] }) },
                                { scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.5, moving ? 2.4 : 1.8] }) },
                            ],
                        }]}
                    />
                ))}

                <Animated.View style={{ position: 'absolute', left: 0, top: 0, transform: [{ translateY: lift }] }}>
                    <BusBody />
                    {/* headlight beam shining forward (blinks while waiting) */}
                    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 118 * k - 0.5, top: 48.5 * k - 7, width: BEAM_W, height: 14, opacity: state === 'idle' ? blink : state === 'moving' ? 0.9 : 0 }}>
                        <HeadlightBeam />
                    </Animated.View>
                </Animated.View>

                {WHEELS.map(cx => (
                    <Animated.View key={cx} style={{ position: 'absolute', left: (cx - 9.5) * k, top: (WHEEL_Y - 9.5) * k, width: 19 * k, height: 19 * k, transform: [{ rotate }] }}>
                        <Wheel />
                    </Animated.View>
                ))}
            </View>

            {/* the bus sleeps when it isn't running */}
            {state === 'offline' && [0, 1, 2].map(i => {
                const t = Animated.modulo(Animated.add(zzz, i / 3), 1);
                return (
                    <Animated.Text
                        key={i}
                        style={[s.zzz, {
                            fontSize: 7 + i * 2, left: INNER / 2 + 6 * towards + i * 4 * towards, top: INNER * 0.3,
                            opacity: t.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] }),
                            transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [6, -10] }) }],
                        }]}
                    >Z</Animated.Text>
                );
            })}
        </View>
    );
}

/** A detailed yellow school bus, side view, facing right (120 x 80 drawing). */
function BusBody() {
    return (
        <Svg width={BUS_W} height={BUS_H} viewBox="0 0 120 80">
            <Defs>
                <LinearGradient id="paint" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#FFD23F" />
                    <Stop offset="0.55" stopColor="#F7B500" />
                    <Stop offset="1" stopColor="#DE9A00" />
                </LinearGradient>
                <LinearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#E3F2FF" />
                    <Stop offset="1" stopColor="#7FAFD9" />
                </LinearGradient>
                <LinearGradient id="hood" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#F9C21B" />
                    <Stop offset="1" stopColor="#D99500" />
                </LinearGradient>
            </Defs>
            <G transform="translate(0, 8)">
                <Ellipse cx="60" cy="66" rx="52" ry="3.5" fill="rgba(0,0,0,0.25)" />
                <Path d="M100 30 H110 Q117 30 117.5 37 V53 H100 Z" fill="url(#hood)" stroke="#3A2E12" strokeWidth="1.2" />
                <Rect x="5" y="1" width="99" height="53" rx="7" fill="url(#paint)" stroke="#3A2E12" strokeWidth="1.3" />
                <Rect x="9" y="2.5" width="91" height="2.2" rx="1.1" fill="rgba(255,255,255,0.45)" />
                <Rect x="10" y="-0.8" width="5" height="2.6" rx="1" fill="#E53935" />
                <Rect x="93" y="-0.8" width="5" height="2.6" rx="1" fill="#E53935" />
                {[11, 26, 41, 56, 71].map(x => (
                    <G key={x}>
                        <Rect x={x} y="8" width="12" height="20" rx="2" fill="url(#glass)" stroke="#2B2B2B" strokeWidth="1" />
                        <Path d={`M${x + 2} 25 L${x + 9} 10.5`} stroke="rgba(255,255,255,0.75)" strokeWidth="1.3" strokeLinecap="round" />
                    </G>
                ))}
                <Rect x="86" y="8" width="12" height="42" rx="1.5" fill="url(#glass)" stroke="#2B2B2B" strokeWidth="1" />
                <Line x1="92" y1="8" x2="92" y2="50" stroke="#2B2B2B" strokeWidth="1" />
                <Line x1="86" y1="31" x2="98" y2="31" stroke="#2B2B2B" strokeWidth="0.9" />
                <Path d="M100 6 H102 Q104 6 104 9 V29 H100 Z" fill="url(#glass)" stroke="#2B2B2B" strokeWidth="1" />
                <Rect x="5" y="33" width="81" height="2.4" fill="#26221A" />
                <Rect x="5" y="41" width="81" height="1.6" fill="#26221A" />
                <Path d="M74 36.5 l2.6 -1.1 h3.6 l2.6 1.1 v3.6 l-2.6 1.1 h-3.6 l-2.6 -1.1 Z" fill="#E53935" stroke="#7F1D1D" strokeWidth="0.6" />
                <Line x1="104" y1="12" x2="109" y2="8" stroke="#2B2B2B" strokeWidth="1.2" />
                <Rect x="108" y="5" width="3.4" height="6" rx="1" fill="#2B2B2B" />
                <Path d="M114.5 37.5 H117.6 V43.5 H114.5 Q113.6 40.5 114.5 37.5 Z" fill="#FFF6C2" stroke="#3A2E12" strokeWidth="0.7" />
                <Rect x="109" y="45" width="7" height="4.5" rx="1" fill="#3A2E12" />
                <Rect x="5.5" y="44" width="2.6" height="5" rx="1" fill="#E53935" />
                <Circle cx="28" cy="56" r="11" fill="#1E1B14" />
                <Circle cx="105" cy="56" r="11" fill="#1E1B14" />
                <Rect x="2.5" y="52" width="10" height="4" rx="1.5" fill="#2B2B2B" />
                <Rect x="114" y="51" width="5.5" height="5" rx="1.5" fill="#2B2B2B" />
                <Rect x="0" y="49" width="5" height="2.2" rx="1" fill="#555" />
            </G>
        </Svg>
    );
}

const BEAM_W = 18;

/** Light cone from the headlight, fading out ahead of the bus (BEAM_W x 14). */
function HeadlightBeam() {
    return (
        <Svg width={BEAM_W} height={14} viewBox={`0 0 ${BEAM_W} 14`}>
            <Defs>
                <LinearGradient id="beam" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor="#FFF3B0" stopOpacity="0.95" />
                    <Stop offset="0.5" stopColor="#FFE680" stopOpacity="0.45" />
                    <Stop offset="1" stopColor="#FFE680" stopOpacity="0" />
                </LinearGradient>
            </Defs>
            <Path d={`M0 5.6 L${BEAM_W} 2 L${BEAM_W} 14 L0 8.4 Z`} fill="url(#beam)" />
            {[3.5, 8, 12.5].map(y => (
                <Line key={y} x1="0" y1="7" x2={BEAM_W} y2={y} stroke="url(#beam)" strokeWidth="0.8" strokeLinecap="round" />
            ))}
        </Svg>
    );
}

/** Tyre + silver hub with spokes (19 x 19 drawing units), spun by its parent. */
function Wheel() {
    return (
        <Svg width="100%" height="100%" viewBox="0 0 19 19">
            <Circle cx="9.5" cy="9.5" r="9" fill="#1B1B1D" />
            <Circle cx="9.5" cy="9.5" r="7.4" fill="none" stroke="#3A3A3D" strokeWidth="1.2" strokeDasharray="1.6 1.4" />
            <Circle cx="9.5" cy="9.5" r="4.4" fill="#C9CCD1" stroke="#8A8E95" strokeWidth="0.6" />
            {[0, 72, 144, 216, 288].map(a => {
                const r = (a * Math.PI) / 180;
                return <Line key={a} x1="9.5" y1="9.5" x2={9.5 + Math.cos(r) * 4} y2={9.5 + Math.sin(r) * 4} stroke="#6B6F76" strokeWidth="1" strokeLinecap="round" />;
            })}
            <Circle cx="9.5" cy="9.5" r="1.3" fill="#4B4F55" />
        </Svg>
    );
}

const s = StyleSheet.create({
    anchor: { position: 'absolute', left: 0, top: 0, width: SIZE, height: SIZE },
    fab: {
        width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 9,
    },
    clip: { width: INNER, height: INNER, borderRadius: INNER / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    road: { position: 'absolute', bottom: INNER * 0.11, left: -20, flexDirection: 'row', gap: 6 }, // wide enough to slide 14px either way
    dash: { width: 8, height: 1.6, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.75)' },
    cloudRow: { position: 'absolute', left: 0, top: 0, width: INNER, height: INNER },
    cloud: { position: 'absolute', height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.9)' },
    puff: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#A3A7AE' },
    zzz: { position: 'absolute', color: '#FFFFFF', fontFamily: 'Poppins_700Bold', includeFontPadding: false, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 2 },
    badge: { position: 'absolute', top: -4, minWidth: 24, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 10, borderWidth: 2, alignItems: 'center' },
    badgeText: { color: '#FFFFFF', fontSize: 10, lineHeight: 12, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    pillClip: { position: 'absolute', top: 0, width: PILL_W, height: SIZE, overflow: 'hidden' },
    pill: {
        position: 'absolute', left: 0, width: PILL_W, top: (SIZE - 50) / 2, height: 50, borderRadius: 25, borderWidth: 2, overflow: 'hidden', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 8,
    },
    pillText: { width: PILL_W, paddingHorizontal: 12, gap: 1 },
    pillTitle: { fontSize: 13, lineHeight: 17, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    pillSub: { fontSize: 11, lineHeight: 14, fontFamily: 'Poppins_400Regular', includeFontPadding: false },
    bubble: { position: 'absolute', top: SIZE / 2 - 14, height: 28, paddingHorizontal: 10, borderRadius: 14, justifyContent: 'center' },
    bubbleText: { color: '#FFFFFF', fontSize: 11, lineHeight: 14, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    bubbleTail: { position: 'absolute', top: 8, width: 0, height: 0, borderTopWidth: 6, borderBottomWidth: 6, borderTopColor: 'transparent', borderBottomColor: 'transparent' },
});
