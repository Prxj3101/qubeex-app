import { useParentModeLanguage } from '@/context/ParentModeLanguageContext';
import { useStudent } from '@/context/StudentContext';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import { n, t, type ParentLang } from '@/lib/parentModeI18n';
import * as Haptics from 'expo-haptics';
import { Bus, Clock, LocateFixed, Phone, Radio, RefreshCw, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Linking, Modal, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import MapView, { AnimatedRegion, Marker, MarkerAnimated, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Ellipse, G, Path, Rect, Circle as SvgCircle } from 'react-native-svg';
import { DARK, EntryCard, ErrorState, GOOD, LIGHT, cardShadow, useGradient } from './parentUi';

// "My Bus": the child's school bus live on a map, how far it is from their
// stop, the planned pickup / drop times for their shift and the driver.
// Data: GET /student/transport (null when the child isn't on a school bus).
// The map is Google Maps (react-native-maps, free on mobile). It's a native
// module, so it needs an app build (app version 1.1.0+), not just an OTA update.

interface BusStop { id: string; name: string; lat: number; lng: number; pickupAt: string | null; dropAt: string | null }
export interface MyBus {
    bus: {
        name: string; plateNumber: string; driverName: string; driverPhone: string;
        route: { name: string; color: string; stops: BusStop[] } | null;
    };
    shift: 'MORNING' | 'AFTERNOON';
    trip: { pickupStart: string | null; dropStart: string | null };
    stop: BusStop | null;
    school: { name: string; lat: number; lng: number } | null;
    position: { lat: number; lng: number; speedKmh: number; course: number; receivedAt: string } | null;
    online: boolean;
    etaMinutes: number | null;
    /** route-aware (server follows the trip stop by stop); missing on older servers */
    atStop?: boolean;
    passedStop?: boolean;
    stopsBefore?: number | null;
    /** name of the stop the bus is standing at right now (any stop) */
    standingAt?: string | null;
    /** pickup trip done, bus parked at school */
    reachedSchool?: boolean;
    /** phone alerts for this child (missing on older servers) */
    alertsOn?: boolean;
    serverTime: string;
}

const POLL_MS = 10_000;
// MarkerAnimated's types don't list `children` (it renders them fine); type it like Marker.
const AnimatedMarker = MarkerAnimated as unknown as typeof Marker;

/** "06:41" -> "6:41 am" */
function clock(hhmm: string | null | undefined): string {
    const m = hhmm ? /^(\d{2}):(\d{2})$/.exec(hhmm) : null;
    if (!m) return '';
    const h = Number(m[1]);
    return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
}

/** "just now", "2 min ago" */
function ago(iso: string | undefined, lang: ParentLang): string {
    if (!iso) return '';
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 15) return lang === 'en' ? 'just now' : lang === 'hinglish' ? 'abhi' : lang === 'hi' ? 'अभी' : 'आत्ता';
    const m = Math.max(1, Math.round(s / 60));
    return n(`${m} min`, lang);
}

/** At the child's stop right now (server flag; older servers: ETA of a minute or less). */
export const isAtStop = (d: MyBus) => !!d.online && (d.atStop ?? (d.etaMinutes != null && d.etaMinutes <= 1));

/**
 * Minutes to show, or null. Only once the stop just before the child's is done:
 * before that, the stop count is clearer than a long, shaky time.
 */
export const shownEta = (d: MyBus): number | null =>
    !d.online || d.etaMinutes == null || (d.stopsBefore ?? 0) > 0 ? null : d.etaMinutes;

const stopsCount = (before: number, lang: ParentLang) =>
    before === 1 ? t('busOneStopBefore', lang) : t('busStopsBefore', lang).replace('{n}', n(before, lang));

/** Small second line under the status: the stop count while the bus stands at another stop. */
export function etaSub(d: MyBus, lang: ParentLang): string | null {
    if (!d.online || isAtStop(d) || d.passedStop || !d.standingAt) return null;
    const before = d.stopsBefore ?? 0;
    return before > 0 ? stopsCount(before, lang) : null;
}

export function etaLine(d: MyBus, lang: ParentLang): string {
    if (!d.online) return t('busOffline', lang);
    if (d.reachedSchool) return `🏫 ${t('busReachedSchool', lang)}`;
    if (isAtStop(d)) return t('busAtStop', lang);
    if (d.passedStop) return t('busPassedStop', lang);
    const before = d.stopsBefore ?? 0;
    // standing at some other stop: "At Patankar Park" (the stop count goes underneath, see etaSub)
    if (d.standingAt) return t('busAtNamed', lang).replace('{s}', d.standingAt);
    if (before > 0) return stopsCount(before, lang);
    if (d.etaMinutes == null) return t('busLive', lang);
    return t('busMinAway', lang).replace('{n}', n(d.etaMinutes, lang));
}

/** Entry card for Parent Mode / Home. Renders nothing when the child has no school bus. */
export function ParentBusEntry({ isDark }: { isDark: boolean }) {
    const { lang } = useParentModeLanguage();
    const [data, setData] = useState<MyBus | null>(null);
    const [open, setOpen] = useState(false);

    const refresh = useCallback(async () => {
        try { setData((await api.get<{ data: MyBus | null }>('/student/transport')).data.data); }
        catch { /* keep what we had */ }
    }, []);
    useEffect(() => {
        refresh();
        const id = setInterval(refresh, 60_000);
        return () => clearInterval(id);
    }, [refresh]);

    if (!data) return null;
    return (
        <>
            <EntryCard
                icon={Bus}
                title={`${t('myBus', lang)} · ${data.bus.name}`}
                subtitle={data.online ? etaLine(data, lang) : t('myBusSub', lang)}
                isDark={isDark}
                onPress={() => setOpen(true)}
            />
            <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
                <MyBusScreen isDark={isDark} initial={data} onClose={() => { setOpen(false); refresh(); }} />
            </Modal>
        </>
    );
}

/** `inline`: shown inside the home screen below the app's top bar (no safe-area padding needed there). */
/** `onData`: gets every fresh reading, so the home bus button stays in sync while this is open. */
export function MyBusScreen({ isDark, initial, onClose, inline, onData }: { isDark: boolean; initial: MyBus; onClose: () => void; inline?: boolean; onData?: (d: MyBus) => void }) {
    const { lang } = useParentModeLanguage();
    const { accent } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const [data, setData] = useState<MyBus>(initial);
    // bus alerts on / off: flip at once, undo if the server says no
    const setAlerts = async (on: boolean) => {
        setData(d => ({ ...d, alertsOn: on }));
        try { await api.put('/student/transport/alerts', { on }); }
        catch { setData(d => ({ ...d, alertsOn: !on })); setError(t('busLoadError', lang)); }
    };
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const d = (await api.get<{ data: MyBus | null }>('/student/transport')).data.data;
            if (d) { setData(d); setError(null); onData?.(d); }
        } catch { setError(t('busLoadError', lang)); }
    }, [lang]);

    useEffect(() => {
        load();
        const id = setInterval(load, POLL_MS);
        return () => clearInterval(id);
    }, [load]);

    const color = data.bus.route?.color ?? accent.purple;
    const gradient = useGradient(isDark);
    const statusColor = data.online ? GOOD : theme.muted;
    const shiftLabel = data.shift === 'AFTERNOON' ? `☀️ ${t('afternoonShift', lang)}` : `🌅 ${t('morningShift', lang)}`;

    const body = (
        <>
            <BusHero data={data} lang={lang} fallback={gradient} onClose={onClose} />

            <ScrollView contentContainerStyle={{ padding: 14, paddingTop: 12, gap: 12 }} showsVerticalScrollIndicator={false}>
                {error && <ErrorState text={error} isDark={isDark} onRetry={load} />}

                {/* Live map card: status strip on top, map, "updated" line below */}
                <View style={[s.mapCard, cardShadow(isDark), { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                    <View style={s.mapTopWrap}>
                        <View style={s.mapTop}>
                            <StatusDot online={data.online} color={statusColor} />
                            <Text style={[s.statusTitle, { color: theme.text, flex: 0, flexShrink: 1, textAlign: 'center' }]} numberOfLines={2}>{etaLine(data, lang)}</Text>
                        </View>
                        {!!etaSub(data, lang) && <Text style={[s.mapTopSub, { color: theme.subText }]} numberOfLines={1}>{etaSub(data, lang)}</Text>}
                    </View>
                    <View style={s.mapArea}>
                        <BusMap data={data} onRefresh={load} />
                    </View>
                    <Text style={[s.mapBottom, { color: theme.muted }]} numberOfLines={1}>
                        {data.online && data.position
                            ? t('busUpdated', lang).replace('{t}', ago(data.position.receivedAt, lang))
                            : t('busOfflineHint', lang)}
                    </Text>
                </View>

                {/* Child's stop + planned times */}
                <View style={[s.card, cardShadow(isDark), { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Image source={STOP_3D} style={{ width: 56, height: 56, marginVertical: -8 }} />
                        <View style={{ flex: 1 }}>
                            <Text style={[s.label, { color: theme.subText }]}>{t('yourStop', lang)}</Text>
                            <Text style={[s.value, { color: theme.text }]} numberOfLines={2}>{data.stop?.name ?? t('noStopYet', lang)}</Text>
                        </View>
                    </View>
                    <Text style={[s.small, { color: theme.subText, marginTop: 10 }]}>{shiftLabel}</Text>
                    {data.stop && (
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                            <TimeBox label={t('pickupTime', lang)} value={clock(data.stop.pickupAt)} color={color} theme={theme} />
                            <TimeBox label={t('dropTime', lang)} value={clock(data.stop.dropAt)} color={color} theme={theme} />
                        </View>
                    )}
                    {data.stop && (data.stop.pickupAt || data.stop.dropAt) && (
                        <Text style={[s.small, { color: theme.muted, marginTop: 8 }]}>{t('plannedTimeHint', lang)}</Text>
                    )}
                </View>

                {/* Driver */}
                {(!!data.bus.driverName || !!data.bus.driverPhone) && (
                    <View style={[s.card, cardShadow(isDark), { backgroundColor: theme.card, borderColor: theme.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                        <Text style={s.driverEmoji}>🧑‍✈️</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={[s.label, { color: theme.subText }]}>{t('busDriver', lang)}</Text>
                            <Text style={[s.value, { color: theme.text }]} numberOfLines={1}>{data.bus.driverName || data.bus.driverPhone}</Text>
                        </View>
                        {!!data.bus.driverPhone && (
                            <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => Linking.openURL(`tel:${data.bus.driverPhone.replace(/\s+/g, '')}`)}
                                style={[s.callBtn, { backgroundColor: GOOD }]}
                            >
                                <Phone size={14} color="#fff" />
                                <Text style={s.callText}>{t('callDriver', lang)}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
                {/* Bus alerts on / off */}
                {data.alertsOn !== undefined && (
                    <View style={[s.card, cardShadow(isDark), { backgroundColor: theme.card, borderColor: theme.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                        <Text style={s.alertEmoji}>🔔</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={[s.value, { color: theme.text }]}>{t('busAlerts', lang)}</Text>
                            <Text style={[s.small, { color: theme.subText, marginTop: 2 }]}>{t('busAlertsSub', lang)}</Text>
                        </View>
                        <Switch
                            value={data.alertsOn}
                            onValueChange={setAlerts}
                            trackColor={{ false: isDark ? '#3A3A3C' : '#D1D5DB', true: GOOD }}
                            thumbColor="#FFFFFF"
                        />
                    </View>
                )}
            </ScrollView>
        </>
    );
    if (inline) return <View style={{ flex: 1, backgroundColor: theme.bg }}>{body}</View>;
    return (
        // A Modal is its own native window on iOS: it needs its own provider,
        // otherwise the safe-area insets read as 0 and the header goes under the notch.
        <SafeAreaProvider>
            <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>{body}</SafeAreaView>
        </SafeAreaProvider>
    );
}

// ── Header: the 3D bus on the left, title + number plate on the right ──

function BusHero({ data, lang, fallback, onClose }: { data: MyBus; lang: ParentLang; fallback: [string, string]; onClose: () => void }) {
    return (
        // one row inside the header: [bus] [text] [close]
        <LinearGradient colors={fallback} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={hero.box}>
                <Image source={BUS_3D} style={hero.bus} />
                <View style={hero.text}>
                    <Text style={hero.kicker} numberOfLines={1}>{t('myBus', lang)}{data.bus.route?.name ? ` · ${data.bus.route.name}` : ''}</Text>
                    <Text style={hero.title} numberOfLines={1}>{data.bus.name}</Text>
                    {!!data.bus.plateNumber && <NumberPlate plate={data.bus.plateNumber} />}
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={12} style={hero.close}>
                    <X size={18} color="#fff" />
                </TouchableOpacity>
                {/* live tag, bottom-right corner */}
                <View style={hero.liveSpot}><LiveTag online={data.online} label={data.online ? t('busLive', lang) : 'Offline'} /></View>
        </LinearGradient>
    );
}

/** Status dot: solid centre with a soft halo; while live a ring keeps pulsing out of it. */
function StatusDot({ online, color }: { online: boolean; color: string }) {
    const p = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        p.setValue(0);
        if (!online) return;
        const a = Animated.loop(Animated.timing(p, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }));
        a.start();
        return () => a.stop();
    }, [online, p]);
    return (
        <View style={s.sDotBox}>
            {online && (
                <Animated.View style={[s.sDotRing, {
                    backgroundColor: color,
                    opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                    transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
                }]} />
            )}
            <View style={[s.sDotHalo, { backgroundColor: color + '33' }]}>
                <View style={[s.sDotCore, { backgroundColor: color }]} />
            </View>
        </View>
    );
}

/** Red pulsing "Live" tag (same radio icon as the admin live map) (grey "Offline" when the bus isn't running). */
function LiveTag({ online, label }: { online: boolean; label: string }) {
    const p = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        p.setValue(0);
        if (!online) return;
        const a = Animated.loop(Animated.timing(p, { toValue: 1, duration: 1300, easing: Easing.out(Easing.quad), useNativeDriver: true }));
        a.start();
        return () => a.stop();
    }, [online, p]);
    const dot = online ? '#EF4444' : '#9CA3AF';
    return (
        <View style={hero.pill}>
            <View style={hero.dotBox}>
                {online && (
                    <Animated.View style={[hero.dotRing, {
                        backgroundColor: dot,
                        opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
                        transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.9] }) }],
                    }]} />
                )}
                <Radio size={13} color={dot} strokeWidth={2.4} />
            </View>
            <Text style={hero.pillText}>{label}</Text>
        </View>
    );
}

/** Indian-style number plate: white plate, black bold letters, blue "IND" strip. */
function NumberPlate({ plate }: { plate: string }) {
    return (
        <View style={hero.plate}>
            <View style={hero.plateInd}><Text style={hero.plateIndText}>IND</Text></View>
            <Text style={hero.plateText} numberOfLines={1}>{plate.toUpperCase()}</Text>
        </View>
    );
}

/** Round refresh button: spins while it fetches (at least one full turn, so the tap feels acknowledged). */
function RefreshButton({ onRefresh, color, bg, size = 32 }: { onRefresh: () => Promise<void>; color: string; bg: string; size?: number }) {
    const spin = useRef(new Animated.Value(0)).current;
    const busy = useRef(false);
    const press = async () => {
        if (busy.current) return;
        busy.current = true;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        spin.setValue(0);
        const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 650, easing: Easing.linear, useNativeDriver: true }));
        loop.start();
        await Promise.all([onRefresh(), new Promise(r => setTimeout(r, 650))]);
        loop.stop();
        Animated.timing(spin, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
        busy.current = false;
    };
    const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
    return (
        <TouchableOpacity onPress={press} activeOpacity={0.7} hitSlop={8} style={[s.refresh, { backgroundColor: bg, width: size, height: size, borderRadius: size / 2 }]}>
            <Animated.View style={{ transform: [{ rotate }] }}>
                <RefreshCw size={size >= 38 ? 18 : 15} color={color} />
            </Animated.View>
        </TouchableOpacity>
    );
}

function TimeBox({ label, value, color, theme }: { label: string; value: string; color: string; theme: typeof LIGHT }) {
    return (
        <View style={[s.timeBox, { borderColor: theme.cardBorder }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Clock size={11} color={color} />
                <Text style={[s.label, { color: theme.subText }]}>{label}</Text>
            </View>
            <Text style={[s.time, { color: theme.text }]}>{value ? `~${value}` : '—'}</Text>
        </View>
    );
}

// ── Map (Google Maps) ────────────────────────────────────────────────────────

type LatLng = { latitude: number; longitude: number };
const ll = (p: { lat: number; lng: number }): LatLng => ({ latitude: p.lat, longitude: p.lng });

const STOP_3D = require('@/assets/images/transport/bus-stop-3d.png');
const BUS_3D = require('@/assets/images/transport/school-bus-3d.png');
const SCHOOL_PIN = require('@/assets/images/transport/school-location-3d.png');
const ZOOM = 0.012; // ~1.3 km across: close enough to see the streets around the bus

function BusMap({ data, onRefresh }: { data: MyBus; onRefresh: () => Promise<void> }) {
    const map = useRef<MapView>(null);
    const fitted = useRef(false);
    const color = data.bus.route?.color ?? '#DA7756';
    const stops = data.bus.route?.stops ?? [];
    const school = data.school;
    const bus = data.position;

    // first time: zoom in close on the bus (else the child's stop, else school).
    // Only once the map is ready - a move before that is ignored on Android,
    // which left the map stuck at the far-out starting view.
    const ready = useRef(false);
    const fit = useCallback(() => {
        if (fitted.current || !ready.current || !map.current) return;
        const focus = bus ? ll(bus) : data.stop ? ll(data.stop) : school ? ll(school) : null;
        if (!focus) return;
        fitted.current = true;
        map.current.animateToRegion({ ...focus, latitudeDelta: ZOOM, longitudeDelta: ZOOM }, 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bus?.lat, bus?.lng, data.stop?.id, school?.lat]);
    useEffect(() => { fit(); }, [fit]);

    // recenter: back to the bus (else the child's stop, else school)
    const recenter = () => {
        const focus = bus ? ll(bus) : data.stop ? ll(data.stop) : school ? ll(school) : null;
        if (focus) map.current?.animateToRegion({ ...focus, latitudeDelta: ZOOM, longitudeDelta: ZOOM }, 450);
    };

    return (
        <View style={StyleSheet.absoluteFill}>
        <MapView
            ref={map}
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFill}
            // always the normal light map, even when the app is in dark mode
            userInterfaceStyle="light"
            onMapReady={() => { ready.current = true; fit(); }}
            toolbarEnabled={false}
            showsBuildings={false}
            initialRegion={{ ...(school ? ll(school) : { latitude: 19.076, longitude: 72.8777 }), latitudeDelta: ZOOM, longitudeDelta: ZOOM }}
        >
            {stops.map(st => {
                const mine = st.id === data.stop?.id;
                if (mine) return <MyStopMarker key={st.id} stop={st} color={color} />;
                return (
                    <Marker key={st.id} coordinate={ll(st)} title={st.name} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={1}>
                        <View style={[m.stop, { backgroundColor: color }]} />
                    </Marker>
                );
            })}
            {school && (
                <SchoolMarker school={school} />
            )}
            {bus && <BusMarker lat={bus.lat} lng={bus.lng} course={bus.course} online={data.online} />}
        </MapView>
            {/* refresh sits under recenter, same white round style */}
            <View style={m.refreshSpot}><RefreshButton onRefresh={onRefresh} color="#1F2937" bg="#FFFFFF" size={38} /></View>
            <TouchableOpacity activeOpacity={0.8} onPress={recenter} style={m.recenter} hitSlop={8}>
                <LocateFixed size={18} color="#1F2937" />
            </TouchableOpacity>
        </View>
    );
}

/** Same 3D school pin as the admin maps; the pin's tip sits on the school. */
function SchoolMarker({ school }: { school: { name: string; lat: number; lng: number } }) {
    // Android snapshots custom markers: keep redrawing until the picture has loaded, then stop
    const [loaded, setLoaded] = useState(false);
    return (
        <Marker coordinate={ll(school)} title={school.name} anchor={{ x: 0.5, y: 0.98 }} tracksViewChanges={!loaded} zIndex={4}>
            <Image source={SCHOOL_PIN} style={m.schoolPin} onLoad={() => setLoaded(true)} />
        </Marker>
    );
}

/** The child's own stop: a map pin with their photo (🏠 when there's no photo). */
function MyStopMarker({ stop, color }: { stop: BusStop; color: string }) {
    const { photo } = useStudent();
    const [loaded, setLoaded] = useState(!photo);
    useEffect(() => { setLoaded(!photo); }, [photo]);
    return (
        <Marker coordinate={ll(stop)} title={stop.name} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={!loaded} zIndex={5}>
            <View style={m.pinWrap}>
                <View style={[m.pinHead, { backgroundColor: color }]}>
                    {photo
                        ? <Image source={{ uri: photo }} style={m.pinPhoto} onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} />
                        : <Text style={m.emoji}>🏠</Text>}
                </View>
                <View style={[m.pinTail, { borderTopColor: color }]} />
                {!!photo && <View style={[m.pinBadge, { backgroundColor: color }]}><Text style={m.badgeEmoji}>🏠</Text></View>}
            </View>
        </Marker>
    );
}

/**
 * The yellow school bus, turned to where it's heading (never upside down).
 * Between two GPS updates it glides along instead of jumping, so it looks
 * like it's driving. (Spinning wheels / smoke would need the marker redrawn
 * every frame on Android, which drains battery, so the bus body stays still.)
 */
function BusMarker({ lat, lng, course, online }: { lat: number; lng: number; course: number; online: boolean }) {
    const pos = useRef(new AnimatedRegion({ latitude: lat, longitude: lng, latitudeDelta: 0, longitudeDelta: 0 })).current;
    useEffect(() => {
        // glide to the new fix over (almost) the time until the next one
        pos.timing({ latitude: lat, longitude: lng, latitudeDelta: 0, longitudeDelta: 0, duration: POLL_MS - 500, useNativeDriver: false } as never).start();
    }, [lat, lng, pos]);
    // in 10° steps so small GPS wobble doesn't redraw it
    const c = Math.round(((course ?? 90) % 360) / 10) * 10 % 360;
    const rotate = c < 180 ? `${c - 90}deg` : `${c - 270}deg`;
    const flip = c >= 180 ? -1 : 1;
    // Android draws a custom marker view once; let it redraw briefly after a turn
    const [track, setTrack] = useState(true);
    useEffect(() => {
        setTrack(true);
        const id = setTimeout(() => setTrack(false), 600);
        return () => clearTimeout(id);
    }, [c, online]);
    return (
        <AnimatedMarker coordinate={pos as never} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} zIndex={10}>
            <View style={{ width: 100, height: 100, alignItems: 'center', justifyContent: 'center' }}>
                {/* blue direction arrow just ahead of the bus, pointing where it's going (same as the admin map) */}
                {online && (
                    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', transform: [{ rotate: `${c}deg` }] }]}>
                        <Svg width={16} height={14} viewBox="0 0 16 14" style={{ marginTop: 8 }}>
                            <Path d="M8 1L15 13L8 9.6L1 13Z" fill="#2563EB" stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" />
                        </Svg>
                    </View>
                )}
                <View style={{ transform: [{ rotate }, { scaleX: flip }] }}>
                    <Svg width={56} height={34} viewBox="0 0 62 38">
                        <Ellipse cx={31} cy={35} rx={26} ry={2.6} fill="rgba(0,0,0,0.22)" />
                        <Path d="M6 7.5Q6 4 9.5 4H47Q51 4 52.3 7.5L55 15Q59 16 59 20V28H6Z" fill="#F6B500" stroke="#2a2a2e" strokeWidth={1.2} />
                        <Path d="M6 18.5H59" stroke="#2a2a2e" strokeWidth={1.6} />
                        {[9, 16, 23, 30, 37].map(x => <Rect key={x} x={x} y={7} width={5.6} height={7.5} rx={1.2} fill="#BFE3FF" stroke="#2a2a2e" strokeWidth={0.9} />)}
                        <Rect x={44} y={7} width={5} height={17} rx={1} fill="#BFE3FF" stroke="#2a2a2e" strokeWidth={0.9} />
                        <Path d="M50.5 7H51.6L54.2 14.6H50.5Z" fill="#BFE3FF" stroke="#2a2a2e" strokeWidth={0.9} />
                        <Rect x={5} y={27} width={55} height={2.4} rx={1.2} fill="#2a2a2e" />
                        {[16, 47].map(cx => (
                            <G key={cx}>
                                <SvgCircle cx={cx} cy={29} r={5.6} fill="#1d1d1f" />
                                <SvgCircle cx={cx} cy={29} r={2.6} fill="#c9ccd1" />
                            </G>
                        ))}
                    </Svg>
                </View>
            </View>
        </AnimatedMarker>
    );
}

const hero = StyleSheet.create({
    box: {
        flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10, paddingRight: 12, paddingVertical: 10,
        borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    },
    text: { flex: 1, gap: 2 },
    kicker: { color: 'rgba(255,255,255,0.8)', fontSize: 11.5, lineHeight: 16, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    title: { color: '#fff', fontSize: 22, lineHeight: 28, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    bus: { width: 84, height: 84, marginVertical: -4, marginRight: 10 },
    close: { alignSelf: 'flex-start', width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    liveSpot: { position: 'absolute', right: 12, bottom: 10 },
    dotBox: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
    dotRing: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.25)' },
    pillText: { color: '#fff', fontSize: 10.5, lineHeight: 14, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    plate: {
        flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'stretch', marginTop: 4, borderRadius: 5, borderWidth: 1.5, borderColor: '#111',
        backgroundColor: '#FFFFFF', overflow: 'hidden',
    },
    plateInd: { backgroundColor: '#1D4ED8', paddingHorizontal: 3, justifyContent: 'center' },
    plateIndText: { color: '#fff', fontSize: 7, lineHeight: 9, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    plateText: { color: '#111', fontSize: 13, lineHeight: 17, fontFamily: 'Poppins_700Bold', letterSpacing: 1.2, paddingHorizontal: 7, paddingVertical: 3, includeFontPadding: false },
});

const m = StyleSheet.create({
    stop: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
    refreshSpot: {
        position: 'absolute', right: 10, top: 56, borderRadius: 19,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
    },
    recenter: {
        position: 'absolute', right: 10, top: 10, width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
    },
    schoolPin: { width: 52, height: 52 },
    pinWrap: { width: 50, height: 58, alignItems: 'center' },
    pinHead: { width: 46, height: 46, borderRadius: 23, padding: 3, alignItems: 'center', justifyContent: 'center' },
    pinPhoto: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#fff', backgroundColor: '#E5E7EB' },
    pinTail: { width: 0, height: 0, marginTop: -2, borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
    pinBadge: { position: 'absolute', right: 0, top: 28, width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    badgeEmoji: { fontSize: 9, lineHeight: 11, includeFontPadding: false, textAlignVertical: 'center' },
    emoji: { fontSize: 18, lineHeight: 22, includeFontPadding: false, textAlignVertical: 'center' },
});

const s = StyleSheet.create({
    card: { borderRadius: 16, borderWidth: 1, padding: 14 },
    refresh: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    sDotBox: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
    sDotRing: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
    sDotHalo: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    sDotCore: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: '#FFFFFF' },
    dot: { width: 10, height: 10, borderRadius: 5 },
    statusTitle: { flex: 1, fontSize: 16, lineHeight: 22, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    small: { fontSize: 12, lineHeight: 17, fontFamily: 'Poppins_400Regular', includeFontPadding: false },
    mapCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    mapTopWrap: { paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
    mapTopSub: { fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_400Regular', includeFontPadding: false, textAlign: 'center' },
    mapTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    mapArea: { height: 350 },
    mapBottom: { paddingHorizontal: 14, paddingVertical: 5, textAlign: 'center', fontSize: 10.5, lineHeight: 14, fontFamily: 'Poppins_400Regular', includeFontPadding: false },
    driverEmoji: { fontSize: 30, lineHeight: 36, includeFontPadding: false, textAlignVertical: 'center' },
    alertEmoji: { fontSize: 24, lineHeight: 30, includeFontPadding: false, textAlignVertical: 'center' },
    tileEmoji: { fontSize: 17, lineHeight: 21, includeFontPadding: false, textAlignVertical: 'center' },
    iconTile: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    label: { fontSize: 11, lineHeight: 15, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    value: { fontSize: 14, lineHeight: 20, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    timeBox: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
    time: { fontSize: 15, lineHeight: 21, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    callBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
    callText: { color: '#fff', fontSize: 13, lineHeight: 17, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
});
