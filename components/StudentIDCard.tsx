import { useTheme } from '@/context/ThemeContext';
import { PhotoViewerModal } from '@/components/PhotoViewerModal';
import { useStudent } from '@/context/StudentContext';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronRight, Copy, Hash } from 'lucide-react-native';
import { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const LIGHT = {
    card: '#FFFFFF', cardBorder: '#EDE9FE',
    text: '#0F172A', muted: '#94A3B8',
    purple: '#7C3AED', purpleLight: '#EDE9FE',
    green: '#10B981',
};
const DARK = {
    card: '#141414', cardBorder: '#2A2A2A',
    text: '#F1F5F9', muted: '#64748B',
    purple: '#A78BFA', purpleLight: '#2D1F50',
    green: '#10B981',
};

// RN's LinearGradient (unlike CSS) can't do color-mix(), so this blends a hex
// color toward black (negative amount) or white (positive amount) by a
// fraction — used to derive gradient stops from the theme accent instead of
// hardcoding a second purple shade next to it.
function shade(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    let r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
    if (amount < 0) {
        const p = 1 + amount;
        r = Math.round(r * p); g = Math.round(g * p); b = Math.round(b * p);
    } else {
        r = Math.round(r + (255 - r) * amount);
        g = Math.round(g + (255 - g) * amount);
        b = Math.round(b + (255 - b) * amount);
    }
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// accent.purple in dark mode is a bright light-on-dark tint (meant for
// icon/text, not a banner background) — purple's own value, #A78BFA, still
// reads reasonably as a banner, but blue's (#6495ED) is bright enough to
// look washed-out/"light" instead of a rich strip. Same per-family deep
// shade Header.tsx's hero uses for exactly this reason.
const STRIP_DARK_BASE: Record<string, string> = {
    purple: '#4C1D95',
    blue: '#3557AB',
    teal: '#006666',
    amber: '#D6890F',
    rose: '#B54444',
    indigo: '#3730A3',
    slate: '#334155',
};

// The same Student ID Card used on the Profile tab, reused as-is wherever an
// at-a-glance "who is this student" identity card is needed (e.g. Parent Mode).
export function StudentIDCard({ isDark, noHorizontalPadding }: { isDark: boolean; noHorizontalPadding?: boolean }) {
    const { accent, themeColor } = useTheme();
    const theme = { ...(isDark ? DARK : LIGHT), purple: accent.purple, purpleLight: accent.purpleLight };
    const stripBase = isDark ? (STRIP_DARK_BASE[themeColor] ?? STRIP_DARK_BASE.purple) : theme.purple;
    const router = useRouter();
    const { profile, photo } = useStudent();
    const [copied, setCopied] = useState(false);
    const [photoExpanded, setPhotoExpanded] = useState(false);

    const student = {
        name: profile?.name ?? '',
        rollNo: profile?.rollNo ?? '',
        standard: profile?.standard ?? '',
        div: (() => { const d = profile?.division ?? ''; const parts = d.split('-'); return parts.length > 1 ? `Division ${parts.slice(1).join('-')}` : d ? `Division ${d}` : ''; })(),
        dob: profile?.dob ?? '',
        email: profile?.email ?? '',
        uid: profile?.studentId ?? '',
        institutionName: profile?.institutionName ?? '',
        institutionLogoUrl: profile?.institutionLogoUrl ?? null,
        admissionYear: profile?.admissionYear ?? '',
    };

    const dobDate = student.dob ? new Date(student.dob) : null;
    const dobValid = !!dobDate && !isNaN(dobDate.getTime());
    const age = dobValid ? new Date().getFullYear() - dobDate!.getFullYear() : null;
    const dobDisplay = dobValid ? dobDate!.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
    const classNum = student.standard.replace(/^Class\s*/i, '');
    const divLetter = student.div.replace(/^Division\s*/i, '');
    const classDiv = `${classNum}-${divLetter}`;

    return (
        <View style={{ paddingHorizontal: noHorizontalPadding ? 0 : 14 }}>
            {/* Plain black shadowColor (not theme.purple) — a tinted shadow reads
                as a colored glow rather than a "raised off the surface" cue,
                and doesn't render consistently on Android's elevation shadow.
                Matches the neutral shadow used on the other Parent Mode cards. */}
            <View style={[idStyles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, shadowColor: '#000' }]}>
                <LinearGradient
                    colors={isDark && themeColor === 'purple' ? ['#4C1D95', '#2D1F50'] : [stripBase, shade(stripBase, -0.3)]}
                    style={idStyles.strip}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
                        {student.institutionLogoUrl ? (
                            <View style={idStyles.logoWrap}>
                                <Image source={{ uri: student.institutionLogoUrl }} style={idStyles.logoImage} resizeMode="contain" />
                            </View>
                        ) : null}
                        <View style={{ flexShrink: 1 }}>
                            <Text style={idStyles.instituteName}>{student.institutionName || 'School'}</Text>
                            <Text style={idStyles.instituteTag}>Student ID Card</Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        onPress={() => router.push('/student_detail')}
                        style={{
                            backgroundColor: 'rgba(255,255,255,0.2)',
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 99,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            flexShrink: 0,
                        }}
                    >
                        <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 13, includeFontPadding: false, fontFamily: 'Poppins_600SemiBold', color: 'white', top: 1 }}>
                            View
                        </Text>
                        <ChevronRight size={12} color="white" />
                    </TouchableOpacity>
                </LinearGradient>

                <View style={idStyles.body}>
                    <View style={idStyles.avatarSection}>
                        <TouchableOpacity
                            style={idStyles.avatarWrap}
                            activeOpacity={photo ? 0.85 : 1}
                            onPress={() => photo && setPhotoExpanded(true)}
                        >
                            <LinearGradient colors={[shade(theme.purple, 0.35), theme.purple]} style={idStyles.avatar}>
                                {photo
                                    ? <Image source={{ uri: photo }} style={idStyles.avatarImage} />
                                    : (
                                        <Text style={idStyles.avatarText}>
                                            {student.name.split(' ').map((n: string) => n[0]).join('')}
                                        </Text>
                                    )
                                }
                            </LinearGradient>
                            <View style={[idStyles.onlineDot, { backgroundColor: theme.green, borderColor: theme.card }]} />
                        </TouchableOpacity>
                        <PhotoViewerModal visible={photoExpanded} photoUrl={photo} onClose={() => setPhotoExpanded(false)} />
                        <View style={[idStyles.batchBadge, { backgroundColor: theme.purpleLight }]}>
                            <Text style={[idStyles.batchBadgeText, { color: theme.purple }]}>
                                {student.standard}
                            </Text>
                        </View>
                    </View>

                    <View style={idStyles.infoSection}>
                        <Text style={[idStyles.name, { color: theme.text }]}>{student.name}</Text>
                        <Text style={[idStyles.semDiv, { color: theme.purple }]}>
                            {student.standard} · {student.div}
                        </Text>
                        <View style={[idStyles.divider, { backgroundColor: theme.cardBorder }]} />
                        {[
                            { label: 'Roll No', value: student.rollNo || '—' },
                            { label: 'Class', value: classDiv || '—' },
                            { label: 'Admission Year', value: student.admissionYear || '—' },
                            { label: 'Date of Birth', value: dobValid ? `${dobDisplay} (${age} yrs)` : '—' },
                            { label: 'Email', value: student.email || '—' },
                        ].map((item) => (
                            <View key={item.label} style={idStyles.infoRow}>
                                <Text style={[idStyles.infoLabel, { color: theme.muted }]}>{item.label}</Text>
                                <Text style={[idStyles.infoValue, { color: theme.text }]}>{item.value}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                <View style={[idStyles.dot1, { backgroundColor: theme.cardBorder }]} />
                <View style={[idStyles.dot2, { backgroundColor: theme.cardBorder }]} />

                {/* UID strip */}
                <View style={[idStyles.uidStrip, { backgroundColor: theme.purpleLight, borderTopColor: theme.cardBorder }]}>
                    <Hash size={14} color={theme.muted} />
                    <Text style={[idStyles.uidText, { color: '#DA7756' }]}>{student.uid}</Text>
                    <TouchableOpacity
                        onPress={async () => {
                            await Clipboard.setStringAsync(student.uid);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                        }}
                        style={[idStyles.copyBtn, { backgroundColor: theme.card }]}
                    >
                        <Copy size={11} color={theme.muted} />
                        <Text style={[idStyles.copyBtnText, { color: theme.muted }]}>{copied ? 'Copied!' : 'Copy'}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const idStyles = StyleSheet.create({
    card: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 },
    strip: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    instituteName: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: 'white' },
    instituteTag: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.75)' },
    logoWrap: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    logoImage: { width: '100%', height: '100%' },
    body: { flexDirection: 'row', padding: 16, gap: 16 },
    avatarSection: { alignItems: 'center', gap: 8 },
    avatarWrap: { width: 72, height: 72, position: 'relative' },
    avatar: { width: 72, height: 72, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatarImage: { width: '100%', height: '100%' },
    avatarText: { fontSize: 24, fontFamily: 'Poppins_700Bold', color: 'white' },
    onlineDot: { position: 'absolute', bottom: -4, right: -4, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: 'white' },
    batchBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 },
    batchBadgeText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold' },
    infoSection: { flex: 1, gap: 3 },
    name: { fontSize: 15, fontFamily: 'Poppins_700Bold', lineHeight: 20 },
    semDiv: { fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
    divider: { height: 1, marginVertical: 6 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    infoLabel: { fontSize: 10, fontFamily: 'Poppins_400Regular' },
    infoValue: { fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
    dot1: { position: 'absolute', width: 60, height: 60, borderRadius: 30, top: -20, right: -20, opacity: 0.3 },
    dot2: { position: 'absolute', width: 40, height: 40, borderRadius: 20, bottom: 30, left: -15, opacity: 0.2 },
    uidStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
    uidText: { flex: 1, fontSize: 13, fontFamily: 'RobotoMono_600SemiBold', letterSpacing: 0.8 },
    copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    copyBtnText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold' },
});
