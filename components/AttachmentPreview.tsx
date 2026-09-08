import { useTheme } from '@/context/ThemeContext';
import { X, Download, Expand } from 'lucide-react-native';
import { useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

const { width: SW, height: SH } = Dimensions.get('window');

// Per-theme light-mode page background — mirrors app/(tabs)/feed.tsx's LIGHT_BG.
const LIGHT_BG: Record<string, string> = {
    purple: '#FBFBFF', blue: '#F7FBFE', teal: '#F0F7F3', amber: '#FEFBF7',
    rose: '#FBF7F7', indigo: '#F3F7FE', slate: '#FBFEFE',
};

const LIGHT = { bg: '#FAF8FF', card: '#FFFFFF', border: '#EDE9FE', text: '#0F172A', sub: '#64748B', purple: '#7C3AED' };
const DARK  = { bg: '#000000', card: '#141414', border: '#2A2A2A', text: '#F1F5F9', sub: '#94A3B8', purple: '#A78BFA' };

function isImage(type: string, name: string) {
    return type === 'image' || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name);
}

function isVideo(type: string, name: string) {
    return type === 'video' || /\.(mp4|webm|mov|avi)$/i.test(name);
}

// ── Download helper ───────────────────────────────────────────────────────────
async function downloadAttachment(url: string, name: string, onDone: () => void) {
    try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        const dest = (FileSystem.cacheDirectory ?? '') + name;
        await FileSystem.downloadAsync(url, dest);
        if (status === 'granted') {
            await MediaLibrary.saveToLibraryAsync(dest);
            onDone();
        }
    } catch { /* silent */ }
}

// ── Image preview ─────────────────────────────────────────────────────────────
function ImagePreview({ url, name, onClose, theme }: { url: string; name: string; onClose: () => void; theme: typeof LIGHT }) {
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        await downloadAttachment(url, name, () => setSaved(true));
        setSaving(false);
    };

    return (
        <View style={styles.fullscreen}>
            <View style={styles.toolbar}>
                <Text style={[styles.toolbarTitle, { color: '#fff' }]} numberOfLines={1}>{name}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity onPress={handleSave} style={styles.toolbarBtn} activeOpacity={0.8}>
                        {saving
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Download size={16} color="#fff" />
                        }
                        <Text style={styles.toolbarBtnText}>{saved ? 'Saved!' : 'Save'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onClose} style={[styles.toolbarBtn, { paddingHorizontal: 10 }]} activeOpacity={0.8}>
                        <X size={16} color="#fff" />
                    </TouchableOpacity>
                </View>
            </View>
            <ScrollView
                maximumZoomScale={4}
                minimumZoomScale={1}
                centerContent
                contentContainerStyle={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Image
                    source={{ uri: url }}
                    style={{ width: SW, height: SH - 80 }}
                    resizeMode="contain"
                />
            </ScrollView>
        </View>
    );
}

// ── WebView preview (PDF / link / video / file) ───────────────────────────────
function WebPreview({ url, name, onClose, theme }: { url: string; name: string; onClose: () => void; theme: typeof LIGHT }) {
    const [loading, setLoading] = useState(true);

    // Google Docs viewer for non-link files so they render inline
    const isLink = url.startsWith('http') && !url.match(/\.(pdf|docx|doc|xlsx|xls|pptx|ppt)$/i);
    const viewerUrl = isLink ? url : `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;

    return (
        <View style={styles.fullscreen}>
            <View style={[styles.toolbar, { backgroundColor: theme.card, borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
                <Text style={[styles.toolbarTitle, { color: theme.text }]} numberOfLines={1}>{name}</Text>
                <TouchableOpacity onPress={onClose} style={[styles.toolbarBtn, { backgroundColor: theme.border, paddingHorizontal: 10 }]} activeOpacity={0.8}>
                    <X size={16} color={theme.text} />
                </TouchableOpacity>
            </View>
            {loading && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color={theme.purple} />
                    <Text style={[styles.loadingText, { color: theme.sub }]}>Loading…</Text>
                </View>
            )}
            <WebView
                source={{ uri: viewerUrl }}
                style={{ flex: 1 }}
                onLoadEnd={() => setLoading(false)}
                javaScriptEnabled
                domStorageEnabled
                startInLoadingState={false}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
            />
        </View>
    );
}

// ── Chip + modal ──────────────────────────────────────────────────────────────
interface Props {
    url: string;
    name: string;
    type: string;
}

export function AttachmentPreview({ url, name, type }: Props) {
    const { isDark, accent, themeColor } = useTheme();
    const theme = { ...(isDark ? DARK : LIGHT), bg: isDark ? DARK.bg : (LIGHT_BG[themeColor] ?? LIGHT_BG.purple), purple: accent.purple, purpleLight: accent.purpleLight };
    const [open, setOpen] = useState(false);

    const img = isImage(type, name);
    const vid = isVideo(type, name);

    // Images render as an actual inline thumbnail (like the web feed) that
    // expands to fullscreen on tap, instead of a generic "tap to preview"
    // chip — the chip is kept only for non-image attachments.
    if (img) {
        return (
            <>
                <TouchableOpacity
                    onPress={() => setOpen(true)}
                    activeOpacity={0.9}
                    style={[styles.imageThumbWrap, { borderColor: isDark ? 'rgba(255,255,255,0.15)' : theme.border }]}>
                    <Image source={{ uri: url }} style={styles.imageThumb} resizeMode="cover" />
                    <View style={styles.imageExpandBadge}>
                        <Expand size={11} color="#fff" />
                    </View>
                </TouchableOpacity>

                <Modal visible={open} animationType="slide" statusBarTranslucent onRequestClose={() => setOpen(false)}>
                    <View style={[styles.fullscreen, { backgroundColor: '#000' }]}>
                        <ImagePreview url={url} name={name} onClose={() => setOpen(false)} theme={theme} />
                    </View>
                </Modal>
            </>
        );
    }

    const emoji = vid ? '🎬' : type === 'link' ? '🔗' : '📄';
    const label = vid ? 'Video' : type === 'link' ? 'Link' : 'File';

    return (
        <>
            <TouchableOpacity
                onPress={() => setOpen(true)}
                activeOpacity={0.8}
                style={[styles.chip, { backgroundColor: isDark ? '#0D1F3C' : '#EFF6FF', borderColor: isDark ? '#1E3A8A' : '#BFDBFE' }]}>
                <Text style={{ fontSize: 14 }}>{emoji}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.chipLabel, { color: isDark ? '#93C5FD' : '#1D4ED8' }]} numberOfLines={1}>{name}</Text>
                    <Text style={[styles.chipSub, { color: isDark ? '#60A5FA' : '#3B82F6' }]}>{label} · tap to preview</Text>
                </View>
            </TouchableOpacity>

            <Modal visible={open} animationType="slide" statusBarTranslucent onRequestClose={() => setOpen(false)}>
                <View style={[styles.fullscreen, { backgroundColor: theme.bg }]}>
                    <WebPreview url={url} name={name} onClose={() => setOpen(false)} theme={theme} />
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    fullscreen: { flex: 1 },
    imageThumbWrap: {
        borderRadius: 14, borderWidth: 1, overflow: 'hidden',
        maxHeight: 220, alignSelf: 'flex-start', width: '100%',
    },
    imageThumb: { width: '100%', height: 200 },
    imageExpandBadge: {
        position: 'absolute', bottom: 8, right: 8,
        width: 24, height: 24, borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center', justifyContent: 'center',
    },
    toolbar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12, paddingTop: 52,
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    toolbarTitle: { flex: 1, fontSize: 13, fontFamily: 'Poppins_600SemiBold', marginRight: 12 },
    toolbarBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(255,255,255,0.15)', paddingVertical: 6, paddingHorizontal: 14,
        borderRadius: 99,
    },
    toolbarBtnText: { color: '#fff', fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
    loadingOverlay: {
        position: 'absolute', top: 80, left: 0, right: 0, bottom: 0,
        alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 1,
    },
    loadingText: { fontSize: 13, fontFamily: 'Poppins_400Regular' },
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
    },
    chipLabel: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
    chipSub: { fontSize: 10, fontFamily: 'Poppins_400Regular', marginTop: 1 },
});
