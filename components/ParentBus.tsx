import { useParentModeLanguage } from '@/context/ParentModeLanguageContext';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import { n, t, type ParentLang } from '@/lib/parentModeI18n';
import { Bus, Clock, MapPin, Phone } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { AnimatedRegion, Marker, MarkerAnimated, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Ellipse, G, Path, Rect, Circle as SvgCircle } from 'react-native-svg';
import { DARK, EntryCard, ErrorState, GOOD, GradientHeader, LIGHT, cardShadow } from './parentUi';

// "My Bus": the child's school bus live on a map, how far it is from their
// stop, the planned pickup / drop times for their shift and the driver.
// Data: GET /student/transport (null when the child isn't on a school bus).
// The map is Google Maps (react-native-maps, free on mobile). It's a native
// module, so it needs an app build (app version 1.1.0+), not just an OTA update.

interface BusStop { id: string; name: string; lat: number; lng: number; pickupAt: string | null; dropAt: string | null }
interface MyBus {
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
    serverTime: string;
}

const POLL_MS = 10_000;

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

function etaLine(d: MyBus, lang: ParentLang): string {
    if (!d.online) return t('busOffline', lang);
    if (d.etaMinutes == null) return t('busLive', lang);
    if (d.etaMinutes <= 1) return t('busAtStop', lang);
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

function MyBusScreen({ isDark, initial, onClose }: { isDark: boolean; initial: MyBus; onClose: () => void }) {
    const { lang } = useParentModeLanguage();
    const { accent } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const [data, setData] = useState<MyBus>(initial);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const d = (await api.get<{ data: MyBus | null }>('/student/transport')).data.data;
            if (d) { setData(d); setError(null); }
        } catch { setError(t('busLoadError', lang)); }
    }, [lang]);

    useEffect(() => {
        load();
        const id = setInterval(load, POLL_MS);
        return () => clearInterval(id);
    }, [load]);

    const color = data.bus.route?.color ?? accent.purple;
    const statusColor = data.online ? GOOD : theme.muted;
    const shiftLabel = data.shift === 'AFTERNOON' ? `☀️ ${t('afternoonShift', lang)}` : `🌅 ${t('morningShift', lang)}`;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
            <GradientHeader
                isDark={isDark}
                icon={Bus}
                title={`${t('myBus', lang)} · ${data.bus.name}`}
                subtitle={[data.bus.plateNumber, data.bus.route?.name].filter(Boolean).join(' · ')}
                onClose={onClose}
            />

            <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} showsVerticalScrollIndicator={false}>
                {error && <ErrorState text={error} isDark={isDark} onRetry={load} />}

                {/* Live status */}
                <View style={[s.card, cardShadow(isDark), { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={[s.dot, { backgroundColor: statusColor }]} />
                        <Text style={[s.statusTitle, { color: theme.text }]} numberOfLines={2}>{etaLine(data, lang)}</Text>
                    </View>
                    <Text style={[s.small, { color: theme.subText, marginTop: 4 }]}>
                        {data.online && data.position
                            ? t('busUpdated', lang).replace('{t}', ago(data.position.receivedAt, lang))
                            : t('busOfflineHint', lang)}
                    </Text>
                </View>

                {/* Map */}
                <View style={[s.mapBox, cardShadow(isDark), { borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
                    <BusMap data={data} isDark={isDark} />
                </View>

                {/* Child's stop + planned times */}
                <View style={[s.card, cardShadow(isDark), { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={[s.iconTile, { backgroundColor: color + '1F' }]}><MapPin size={16} color={color} /></View>
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
            </ScrollView>
        </SafeAreaView>
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

function BusMap({ data, isDark }: { data: MyBus; isDark: boolean }) {
    const map = useRef<MapView>(null);
    const fitted = useRef(false);
    const color = data.bus.route?.color ?? '#DA7756';
    const stops = data.bus.route?.stops ?? [];
    const school = data.school;
    const bus = data.position;
    // whole round trip: school -> stops -> school
    const line: LatLng[] = [
        ...(school && stops.length ? [ll(school)] : []),
        ...stops.map(ll),
        ...(school && stops.length ? [ll(school)] : []),
    ];

    // first time: frame the bus and the child's stop (else the route / school)
    const fit = useCallback(() => {
        if (fitted.current || !map.current) return;
        const pts = [bus && ll(bus), data.stop && ll(data.stop)].filter(Boolean) as LatLng[];
        const all = pts.length > 1 ? pts : line.length ? line : school ? [ll(school)] : [];
        if (!all.length) return;
        fitted.current = true;
        if (all.length === 1) map.current.animateToRegion({ ...all[0], latitudeDelta: 0.01, longitudeDelta: 0.01 }, 0);
        else map.current.fitToCoordinates(all, { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bus?.lat, bus?.lng, data.stop?.id, line.length, school?.lat]);
    useEffect(() => { fit(); }, [fit]);

    return (
        <MapView
            ref={map}
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFill}
            customMapStyle={isDark ? DARK_MAP : []}
            onMapReady={fit}
            toolbarEnabled={false}
            showsBuildings={false}
            initialRegion={{ ...(school ? ll(school) : { latitude: 19.076, longitude: 72.8777 }), latitudeDelta: 0.05, longitudeDelta: 0.05 }}
        >
            {line.length > 1 && <Polyline coordinates={line} strokeColor={color + 'AA'} strokeWidth={4} lineDashPattern={[10, 8]} />}
            {stops.map(st => {
                const mine = st.id === data.stop?.id;
                return (
                    <Marker key={st.id} coordinate={ll(st)} title={st.name} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={mine ? 5 : 1}>
                        {mine
                            ? <View style={[m.myStop, { backgroundColor: color }]}><Text style={m.emoji}>🏠</Text></View>
                            : <View style={[m.stop, { backgroundColor: color }]} />}
                    </Marker>
                );
            })}
            {school && (
                <Marker coordinate={ll(school)} title={school.name} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={4}>
                    <View style={m.school}><Text style={m.emoji}>🏫</Text></View>
                </Marker>
            )}
            {bus && <BusMarker lat={bus.lat} lng={bus.lng} course={bus.course} online={data.online} />}
        </MapView>
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
        <MarkerAnimated coordinate={pos as never} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} zIndex={10}>
            <View style={{ width: 70, height: 70, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ transform: [{ rotate }, { scaleX: flip }], opacity: online ? 1 : 0.6 }}>
                    <Svg width={56} height={34} viewBox="0 0 62 38">
                        <Ellipse cx={31} cy={35} rx={26} ry={2.6} fill="rgba(0,0,0,0.22)" />
                        <Path d="M6 7.5Q6 4 9.5 4H47Q51 4 52.3 7.5L55 15Q59 16 59 20V28H6Z" fill={online ? '#F6B500' : '#B9B9B9'} stroke="#2a2a2e" strokeWidth={1.2} />
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
        </MarkerAnimated>
    );
}

// Google's standard dark map style (muted roads, dark land).
const DARK_MAP = [
    { elementType: 'geometry', stylers: [{ color: '#212121' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#757575' }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181818' }] },
    { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
    { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
    { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] },
];

const m = StyleSheet.create({
    stop: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
    myStop: { width: 32, height: 32, borderRadius: 16, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    school: { width: 34, height: 34, borderRadius: 10, borderWidth: 2, borderColor: '#fff', backgroundColor: '#26294A', alignItems: 'center', justifyContent: 'center' },
    emoji: { fontSize: 15, lineHeight: 18, includeFontPadding: false, textAlignVertical: 'center' },
});

const s = StyleSheet.create({
    card: { borderRadius: 16, borderWidth: 1, padding: 14 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    statusTitle: { flex: 1, fontSize: 16, lineHeight: 22, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    small: { fontSize: 12, lineHeight: 17, fontFamily: 'Poppins_400Regular', includeFontPadding: false },
    mapBox: { height: 320, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    iconTile: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    label: { fontSize: 11, lineHeight: 15, fontFamily: 'Poppins_600SemiBold', includeFontPadding: false },
    value: { fontSize: 14, lineHeight: 20, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    timeBox: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
    time: { fontSize: 15, lineHeight: 21, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
    callBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
    callText: { color: '#fff', fontSize: 13, lineHeight: 17, fontFamily: 'Poppins_700Bold', includeFontPadding: false },
});
