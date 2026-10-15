// School Inventory (Teacher -> Campus -> Inventory tab): the teacher asks the school inventory
// team for supplies and tracks each request. Same data and rules as the web's
// Teacher -> Campus -> Inventory page (GET/POST/PATCH /teacher/inventory/item-requests,
// GET /teacher/inventory/item-catalogue).
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import { Boxes, Eye, Pencil, Plus, Search, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator, Alert, Keyboard, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text,
    TextInput, ToastAndroid, TouchableOpacity, View,
} from 'react-native';

type Line = { name: string; quantity: number; unit: string };
type Entry = {
    id: string; revision: number; department: string; requiredOn: string; reason: string; lines: Line[]; status: string; createdAt: string;
    ledgerStatus?: string; fulfilment?: (Line & { issued: number; pending: number })[]; linkedPurchaseRequestId?: string | null;
    events: { action: string; reason: string; at: string }[]; purchaseOrder?: { number: string; status: string } | null;
};
type DraftLine = { name: string; quantity: string; unit: string };
type Draft = { id?: string; revision?: number; requestId: string; department: string; requiredOn: string; reason: string; lines: DraftLine[] };
type CatalogueItem = { id: string; name: string; unit: string; unitAbbreviation: string };
type Tone = 'amber' | 'green' | 'red' | 'blue' | 'muted';

const LABELS: Record<string, string> = {
    RETURN_PENDING: 'Return pending', RETURNED: 'Returned', CLOSED: 'Closed', PENDING: 'Pending approval', APPROVED: 'Approved', REJECTED: 'Rejected',
    CHANGES_REQUESTED: 'Changes requested', SUBMITTED: 'Submitted', RESUBMITTED: 'Resubmitted', PARTIALLY_ISSUED: 'Partially issued', ISSUED: 'Issued',
    ITEM_CORRECTED: 'Issue corrected', ITEM_ISSUED: 'Stock issued', PURCHASE_REQUEST_CREATED: 'Purchase request created',
};
const TONE_OF: Record<string, Tone> = {
    PENDING: 'amber', CHANGES_REQUESTED: 'amber', APPROVED: 'green', REJECTED: 'red', PARTIALLY_ISSUED: 'blue', ISSUED: 'green', RETURN_PENDING: 'amber', RETURNED: 'green', CLOSED: 'muted',
};
const PAGE = 50;
const T = { includeFontPadding: false } as const; // Android: no extra glyph padding (see CLAUDE.md)

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoOf(new Date());
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return isoOf(d); };
const dateOnly = (value: string) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateTime = (value: string) => new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
const blankLine = (): DraftLine => ({ name: '', quantity: '', unit: '' });
const newId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => { const r = Math.floor(Math.random() * 16); return (ch === 'x' ? r : (r & 3) | 8).toString(16); });
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
const say = (message: string) => { if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT); else Alert.alert(message); };
const apiMessage = (err: unknown, fallback: string) => {
    const message = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data;
    return message?.message || message?.error || fallback;
};

export function CampusInventory() {
    const { isDark } = useTheme();
    const [kb, setKb] = useState(0);
    useEffect(() => {
        const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', e => setKb(e.endCoordinates.height));
        const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(0));
        return () => { show.remove(); hide.remove(); };
    }, []);
    const c = useMemo(() => ({
        bg: isDark ? '#000000' : '#FAF8FF', card: isDark ? '#141414' : '#FFFFFF', border: isDark ? '#2A2A2A' : '#EDE9FE',
        text: isDark ? '#F1F5F9' : '#0F172A', sub: isDark ? '#94A3B8' : '#64748B', muted: isDark ? '#1F1F1F' : '#F4F2FA', accent: '#DA7756', accentSoft: isDark ? '#3A2218' : '#FFF1EA',
        input: isDark ? '#1A1A1A' : '#FFFFFF',
    }), [isDark]);
    const tone = useCallback((t: Tone) => {
        const map: Record<Tone, { bg: string; fg: string }> = {
            amber: { bg: isDark ? '#3A2A06' : '#FEF3C7', fg: isDark ? '#FBBF24' : '#B45309' },
            green: { bg: isDark ? '#052E1B' : '#D1FAE5', fg: isDark ? '#34D399' : '#047857' },
            red: { bg: isDark ? '#3B0A0A' : '#FEE2E2', fg: isDark ? '#F87171' : '#B91C1C' },
            blue: { bg: isDark ? '#0D1F3C' : '#DBEAFE', fg: isDark ? '#60A5FA' : '#1D4ED8' },
            muted: { bg: isDark ? '#262626' : '#F1F5F9', fg: isDark ? '#94A3B8' : '#475569' },
        };
        return map[t];
    }, [isDark]);

    const [entries, setEntries] = useState<Entry[]>([]);
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [draft, setDraft] = useState<Draft | null>(null);
    const [detail, setDetail] = useState<Entry | null>(null);
    const [saving, setSaving] = useState(false);
    const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
    const [activeLine, setActiveLine] = useState<number | null>(null);

    const load = useCallback(async (pageNo: number, mode: 'replace' | 'append') => {
        try {
            const res = await api.get('/teacher/inventory/item-requests', { params: { page: pageNo } });
            setEntries(prev => mode === 'append' ? [...prev, ...res.data.data] : res.data.data);
            setCount(res.data.count); setError('');
        } catch (err) { setError(apiMessage(err, 'Could not load your requests')); }
    }, []);
    useEffect(() => { load(1, 'replace').finally(() => setLoading(false)); }, [load]);
    // The item list is optional: if it fails, typing a name still works.
    useEffect(() => { api.get('/teacher/inventory/item-catalogue').then(res => setCatalogue(res.data.data)).catch(() => { /* typing still works */ }); }, []);

    const onRefresh = async () => { setRefreshing(true); await load(1, 'replace'); setRefreshing(false); };
    const loadMore = async () => { if (loadingMore || entries.length >= count) return; setLoadingMore(true); await load(Math.floor(entries.length / PAGE) + 1, 'append'); setLoadingMore(false); };

    const newRequest = () => { setActiveLine(null); setDraft({ requestId: newId(), department: '', requiredOn: todayISO(), reason: '', lines: [blankLine()] }); };
    const edit = (entry: Entry) => { setActiveLine(null); setDraft({ id: entry.id, revision: entry.revision, requestId: newId(), department: entry.department, requiredOn: entry.requiredOn.slice(0, 10), reason: entry.reason, lines: entry.lines.map(line => ({ ...line, quantity: String(line.quantity) })) }); };
    const valid = !!draft && validDate(draft.requiredOn) && !!draft.reason.trim() && draft.lines.every(line => line.name.trim() && line.unit.trim() && /^\d+$/.test(line.quantity) && Number(line.quantity) >= 1 && Number(line.quantity) <= 1000000000);

    const save = async () => {
        if (!draft || !valid || saving) return;
        setSaving(true);
        try {
            const payload = { department: draft.department.trim(), requiredOn: draft.requiredOn, reason: draft.reason.trim(), lines: draft.lines.map(line => ({ name: line.name.trim(), unit: line.unit.trim(), quantity: Number(line.quantity) })) };
            if (draft.id) await api.patch(`/teacher/inventory/item-requests/${draft.id}`, { ...payload, revision: draft.revision });
            else await api.post('/teacher/inventory/item-requests', { ...payload, requestId: draft.requestId });
            const wasEdit = !!draft.id;
            setDraft(null); say(wasEdit ? 'Request resubmitted' : 'Request sent to school inventory');
            setLoading(true); await load(1, 'replace'); setLoading(false);
        } catch (err) { Alert.alert('Could not submit request', apiMessage(err, 'Please try again in a moment.')); }
        finally { setSaving(false); }
    };

    const setLine = (index: number, patch: Partial<DraftLine>) => setDraft(d => d && ({ ...d, lines: d.lines.map((line, i) => i === index ? { ...line, ...patch } : line) }));
    const typeName = (index: number, name: string) => {
        const match = catalogue.find(item => item.name.toLowerCase() === name.trim().toLowerCase());
        setDraft(d => d && ({ ...d, lines: d.lines.map((line, i) => i !== index ? line : { ...line, name, unit: match && !line.unit.trim() ? match.unit : line.unit }) }));
    };
    const suggestions = (index: number) => {
        if (!draft || activeLine !== index) return [];
        const q = draft.lines[index].name.trim().toLowerCase();
        if (catalogue.some(item => item.name.toLowerCase() === q)) return [];
        return catalogue.filter(item => !q || item.name.toLowerCase().includes(q)).slice(0, 5);
    };

    const filtered = entries.filter(entry => `${entry.department} ${entry.reason} ${entry.lines.map(line => line.name).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()));
    const statusOf = (entry: Entry) => entry.ledgerStatus || entry.status;
    const Pill = ({ status }: { status: string }) => { const t = tone(TONE_OF[status] ?? 'muted'); return <View style={[styles.pill, { backgroundColor: t.bg }]}><Text style={[styles.pillText, { color: t.fg }]}>{LABELS[status] || status}</Text></View>; };

    return (
        <View style={[styles.container, { backgroundColor: c.bg }]}>
            <View style={styles.toolbar}>
                <View style={[styles.search, { backgroundColor: c.card, borderColor: c.border }]}>
                    <Search size={15} color={c.sub} />
                    <TextInput value={search} onChangeText={setSearch} placeholder="Search your requests" placeholderTextColor={c.sub} style={[styles.searchInput, { color: c.text }]} maxLength={120} returnKeyType="search" />
                    {!!search && <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}><X size={15} color={c.sub} /></TouchableOpacity>}
                </View>
                <TouchableOpacity onPress={newRequest} activeOpacity={0.85} style={[styles.newBtn, { backgroundColor: c.accent }]}>
                    <Plus size={15} color="#FFFFFF" /><Text style={styles.newBtnText}>New</Text>
                </TouchableOpacity>
            </View>

            {loading ? <View style={styles.center}><ActivityIndicator color={c.sub} /></View>
                : error && !entries.length ? <View style={[styles.center, { paddingHorizontal: 32 }]}>
                    <Text style={[styles.emptyTitle, { color: '#DC2626' }]}>{error}</Text>
                    <TouchableOpacity onPress={() => { setLoading(true); load(1, 'replace').finally(() => setLoading(false)); }} style={[styles.ghostBtn, { borderColor: c.border }]}><Text style={[styles.ghostBtnText, { color: c.text }]}>Retry</Text></TouchableOpacity>
                </View>
                : <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.sub} />}>
                    {!filtered.length ? <View style={[styles.center, { paddingTop: 70 }]}>
                        <Boxes size={26} color={c.sub} />
                        <Text style={[styles.emptyTitle, { color: c.text }]}>{search ? 'No matching requests' : 'No requests yet'}</Text>
                        <Text style={[styles.emptySub, { color: c.sub }]}>{search ? 'Try another item name.' : 'Tap New to ask the school for supplies.'}</Text>
                    </View> : filtered.map(entry => {
                        const status = statusOf(entry);
                        return <View key={entry.id} style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
                            <View style={styles.rowBetween}><Text style={[styles.dim, { color: c.sub }]}>Required by {dateOnly(entry.requiredOn)}</Text><Pill status={status} /></View>
                            <View style={{ marginTop: 8, gap: 6 }}>{entry.lines.map((line, i) => <View key={i}>
                                <Text style={[styles.lineText, { color: c.text }]}><Text style={styles.lineName}>{line.name}</Text> - {line.quantity} {line.unit}</Text>
                                {entry.fulfilment?.[i] && <Text style={[styles.dim, { color: c.sub }]}>Issued {entry.fulfilment[i].issued} | Pending {entry.fulfilment[i].pending}</Text>}
                            </View>)}</View>
                            {!!entry.department && <Text style={[styles.dim, { color: c.sub, marginTop: 8 }]}>{entry.department}</Text>}
                            {!!entry.purchaseOrder && <Text style={[styles.dim, { color: c.sub, marginTop: 4 }]}>Order: {entry.purchaseOrder.number}</Text>}
                            <View style={[styles.actions, { borderTopColor: c.border }]}>
                                <Text style={[styles.dim, { color: c.sub, flex: 1 }]}>Sent {dateTime(entry.createdAt)}</Text>
                                <TouchableOpacity onPress={() => setDetail(entry)} style={[styles.smallBtn, { borderColor: c.border }]}><Eye size={13} color={c.text} /><Text style={[styles.smallBtnText, { color: c.text }]}>View</Text></TouchableOpacity>
                                {['PENDING', 'CHANGES_REQUESTED'].includes(entry.status) && <TouchableOpacity onPress={() => edit(entry)} style={[styles.smallBtn, { borderColor: c.border }]}><Pencil size={13} color={c.text} /><Text style={[styles.smallBtnText, { color: c.text }]}>Edit</Text></TouchableOpacity>}
                            </View>
                        </View>;
                    })}
                    {entries.length < count && !search && <TouchableOpacity onPress={loadMore} disabled={loadingMore} style={[styles.ghostBtn, { borderColor: c.border, alignSelf: 'center' }]}>{loadingMore ? <ActivityIndicator color={c.sub} /> : <Text style={[styles.ghostBtnText, { color: c.text }]}>Load more</Text>}</TouchableOpacity>}
                </ScrollView>}

            {/* New / edit request */}
            <Modal visible={!!draft} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { if (!saving) setDraft(null); }}>
                <View style={[styles.backdrop, { paddingBottom: 24 + kb }]}>
                    <View style={[styles.sheet, { backgroundColor: c.bg, borderColor: c.border }]}>
                        <View style={[styles.modalHead, { borderBottomColor: c.border }]}>
                            <View style={{ flex: 1 }}><Text style={[styles.modalTitle, { color: c.text }]}>{draft?.id ? 'Edit Request' : 'New Request'}</Text><Text style={[styles.dim, { color: c.sub }]}>Your school inventory team will receive this.</Text></View>
                            <TouchableOpacity onPress={() => { if (!saving) setDraft(null); }} hitSlop={10}><X size={20} color={c.text} /></TouchableOpacity>
                        </View>
                        {draft && <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 30 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            <View style={{ gap: 6 }}>
                                <Text style={[styles.label, { color: c.sub }]}>Department / purpose (optional)</Text>
                                <TextInput value={draft.department} onChangeText={v => setDraft(d => d && ({ ...d, department: v }))} maxLength={100} placeholder="e.g. Science lab" placeholderTextColor={c.sub} style={[styles.input, { backgroundColor: c.input, borderColor: c.border, color: c.text }]} />
                            </View>
                            <View style={{ gap: 6 }}>
                                <Text style={[styles.label, { color: c.sub }]}>Required by *</Text>
                                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                                    {([['Today', 0], ['Tomorrow', 1], ['In 3 days', 3], ['In a week', 7]] as const).map(([label, n]) => { const on = draft.requiredOn === inDays(n); return <TouchableOpacity key={label} onPress={() => setDraft(d => d && ({ ...d, requiredOn: inDays(n) }))} style={[styles.chip, { backgroundColor: on ? c.accent : c.card, borderColor: on ? c.accent : c.border }]}><Text style={[styles.chipText, { color: on ? '#FFFFFF' : c.text }]}>{label}</Text></TouchableOpacity>; })}
                                </View>
                                <TextInput value={draft.requiredOn} onChangeText={v => setDraft(d => d && ({ ...d, requiredOn: v.replace(/[^0-9-]/g, '').slice(0, 10) }))} placeholder="YYYY-MM-DD" placeholderTextColor={c.sub} keyboardType="numbers-and-punctuation" style={[styles.input, { backgroundColor: c.input, borderColor: validDate(draft.requiredOn) ? c.border : '#DC2626', color: c.text }]} />
                                {validDate(draft.requiredOn) && <Text style={[styles.dim, { color: c.sub }]}>{dateOnly(`${draft.requiredOn}T00:00:00Z`)}</Text>}
                            </View>
                            <View style={{ gap: 10 }}>
                                <Text style={[styles.label, { color: c.sub }]}>Items *</Text>
                                {draft.lines.map((line, i) => <View key={i} style={[styles.lineCard, { backgroundColor: c.muted, borderColor: c.border }]}>
                                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                        <TextInput value={line.name} onChangeText={v => typeName(i, v)} onFocus={() => setActiveLine(i)} maxLength={150} placeholder="Item name (pick from list or type)" placeholderTextColor={c.sub} style={[styles.input, { flex: 1, backgroundColor: c.input, borderColor: c.border, color: c.text }]} />
                                        <TouchableOpacity disabled={draft.lines.length === 1} onPress={() => setDraft(d => d && ({ ...d, lines: d.lines.filter((_, index) => index !== i) }))} hitSlop={8} style={{ opacity: draft.lines.length === 1 ? 0.3 : 1 }}><Trash2 size={18} color="#DC2626" /></TouchableOpacity>
                                    </View>
                                    {suggestions(i).length > 0 && <View style={[styles.suggestBox, { backgroundColor: c.card, borderColor: c.border }]}>
                                        {suggestions(i).map((item, k) => <TouchableOpacity key={item.id} onPress={() => { setLine(i, { name: item.name, unit: item.unit }); setActiveLine(null); }} style={[styles.suggestRow, k > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                                            <Text style={[styles.lineName, { color: c.text, flex: 1 }]} numberOfLines={1}>{item.name}</Text><Text style={[styles.dim, { color: c.sub }]}>{item.unit}</Text>
                                        </TouchableOpacity>)}
                                    </View>}
                                    <View style={{ flexDirection: 'row', gap: 10 }}>
                                        <View style={{ flex: 1, gap: 4 }}><Text style={[styles.label, { color: c.sub }]}>Quantity *</Text>
                                            <TextInput value={line.quantity} onChangeText={v => { if (/^\d*$/.test(v)) setLine(i, { quantity: v }); }} keyboardType="number-pad" maxLength={10} placeholder="0" placeholderTextColor={c.sub} style={[styles.input, { backgroundColor: c.input, borderColor: c.border, color: c.text }]} /></View>
                                        <View style={{ flex: 1, gap: 4 }}><Text style={[styles.label, { color: c.sub }]}>Unit *</Text>
                                            <TextInput value={line.unit} onChangeText={v => setLine(i, { unit: v })} maxLength={40} placeholder="e.g. pcs, boxes" placeholderTextColor={c.sub} style={[styles.input, { backgroundColor: c.input, borderColor: c.border, color: c.text }]} /></View>
                                    </View>
                                </View>)}
                                <TouchableOpacity disabled={draft.lines.length >= 20} onPress={() => setDraft(d => d && ({ ...d, lines: [...d.lines, blankLine()] }))} style={[styles.ghostBtn, { borderColor: c.border, flexDirection: 'row', gap: 6, alignSelf: 'flex-start' }]}><Plus size={14} color={c.text} /><Text style={[styles.ghostBtnText, { color: c.text }]}>Add item</Text></TouchableOpacity>
                            </View>
                            <View style={{ gap: 6 }}>
                                <Text style={[styles.label, { color: c.sub }]}>Reason *</Text>
                                <TextInput value={draft.reason} onChangeText={v => setDraft(d => d && ({ ...d, reason: v }))} maxLength={1000} multiline placeholder="Why do you need these items?" placeholderTextColor={c.sub} textAlignVertical="top" style={[styles.input, { height: 96, paddingTop: 10, backgroundColor: c.input, borderColor: c.border, color: c.text }]} />
                            </View>
                        </ScrollView>}
                        <View style={[styles.modalFoot, { borderTopColor: c.border, backgroundColor: c.bg }]}>
                            <TouchableOpacity onPress={() => { if (!saving) setDraft(null); }} style={[styles.ghostBtn, { borderColor: c.border }]}><Text style={[styles.ghostBtnText, { color: c.text }]}>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity onPress={save} disabled={!valid || saving} activeOpacity={0.85} style={[styles.primaryBtn, { backgroundColor: c.accent, opacity: !valid || saving ? 0.5 : 1 }]}>
                                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>{draft?.id ? 'Resubmit Request' : 'Send Request'}</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Request details */}
            <Modal visible={!!detail} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setDetail(null)}>
                <View style={[styles.backdrop, { paddingBottom: 24 }]}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setDetail(null)} />
                    <View style={[styles.sheet, { backgroundColor: c.bg, borderColor: c.border }]}>
                    <View style={[styles.modalHead, { borderBottomColor: c.border }]}>
                        <View style={{ flex: 1 }}><Text style={[styles.modalTitle, { color: c.text }]}>Request details</Text>{detail && <Text style={[styles.dim, { color: c.sub }]}>Submitted {dateTime(detail.createdAt)}</Text>}</View>
                        <TouchableOpacity onPress={() => setDetail(null)} hitSlop={10}><X size={20} color={c.text} /></TouchableOpacity>
                    </View>
                    {detail && <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
                        <View style={{ alignSelf: 'flex-start' }}><Pill status={statusOf(detail)} /></View>
                        <View><Text style={[styles.label, { color: c.sub }]}>Required by</Text><Text style={[styles.lineText, { color: c.text }]}>{dateOnly(detail.requiredOn)}</Text></View>
                        {!!detail.department && <View><Text style={[styles.label, { color: c.sub }]}>Department / purpose</Text><Text style={[styles.lineText, { color: c.text }]}>{detail.department}</Text></View>}
                        <View style={[styles.lineCard, { backgroundColor: c.muted, borderColor: c.border }]}>{detail.lines.map((line, i) => <View key={i}>
                            <Text style={[styles.lineText, { color: c.text }]}><Text style={styles.lineName}>{line.name}</Text>: {line.quantity} {line.unit}</Text>
                            {detail.fulfilment?.[i] && <Text style={[styles.dim, { color: c.sub }]}>Issued {detail.fulfilment[i].issued} | Pending {detail.fulfilment[i].pending}</Text>}
                        </View>)}</View>
                        <View><Text style={[styles.label, { color: c.sub }]}>Reason</Text><Text style={[styles.lineText, { color: c.text }]}>{detail.reason}</Text></View>
                        {!!detail.purchaseOrder && <Text style={[styles.lineText, { color: c.text }]}>Purchase order: {detail.purchaseOrder.number}</Text>}
                        {!!detail.linkedPurchaseRequestId && <Text style={[styles.dim, { color: c.sub }]}>A purchase request has been created for your remaining items.</Text>}
                        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: 14, gap: 12 }}>
                            <Text style={[styles.modalTitle, { color: c.text, fontSize: 14 }]}>History</Text>
                            {detail.events.map((event, i) => <View key={i}>
                                <Text style={[styles.lineName, { color: c.text }]}>{LABELS[event.action] || event.action}</Text>
                                <Text style={[styles.dim, { color: c.sub }]}>{dateTime(event.at)}</Text>
                                {!!event.reason && <Text style={[styles.lineText, { color: c.text, marginTop: 3 }]}>{event.reason}</Text>}
                            </View>)}
                        </View>
                    </ScrollView>}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', paddingHorizontal: 16, paddingTop: 76 },
    sheet: { maxHeight: '86%', borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
    scroll: { paddingTop: 4, paddingHorizontal: 14, paddingBottom: 36, gap: 12 },
    toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6 },
    search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1 },
    searchInput: { ...T, flex: 1, fontSize: 13, fontFamily: 'Poppins_400Regular', paddingVertical: Platform.OS === 'android' ? 8 : 10 },
    newBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: Platform.OS === 'android' ? 9 : 10, borderRadius: 14 },
    newBtnText: { ...T, color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontFamily: 'Poppins_600SemiBold' },
    emptyTitle: { ...T, fontSize: 14, lineHeight: 20, fontFamily: 'Poppins_600SemiBold', marginTop: 6, textAlign: 'center' },
    emptySub: { ...T, fontSize: 12, lineHeight: 17, fontFamily: 'Poppins_400Regular', textAlign: 'center' },
    card: { borderRadius: 20, borderWidth: 1, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
    pillText: { ...T, fontSize: 11, lineHeight: 14, fontFamily: 'Poppins_600SemiBold' },
    dim: { ...T, fontSize: 11.5, lineHeight: 16, fontFamily: 'Poppins_400Regular' },
    lineText: { ...T, fontSize: 13, lineHeight: 19, fontFamily: 'Poppins_400Regular' },
    lineName: { ...T, fontSize: 13, lineHeight: 19, fontFamily: 'Poppins_600SemiBold' },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
    smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: Platform.OS === 'android' ? 5 : 6, borderRadius: 999, borderWidth: 1 },
    smallBtnText: { ...T, fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_600SemiBold' },
    ghostBtn: { paddingHorizontal: 16, paddingVertical: Platform.OS === 'android' ? 8 : 9, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    ghostBtnText: { ...T, fontSize: 12.5, lineHeight: 17, fontFamily: 'Poppins_600SemiBold' },
    primaryBtn: { flex: 1, paddingVertical: Platform.OS === 'android' ? 11 : 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    primaryBtnText: { ...T, color: '#FFFFFF', fontSize: 13.5, lineHeight: 18, fontFamily: 'Poppins_600SemiBold' },
    modalHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
    modalTitle: { ...T, fontSize: 16, lineHeight: 22, fontFamily: 'Poppins_700Bold' },
    modalFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
    label: { ...T, fontSize: 11.5, lineHeight: 15, fontFamily: 'Poppins_600SemiBold' },
    input: { ...T, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === 'android' ? 8 : 10, fontSize: 13.5, fontFamily: 'Poppins_400Regular' },
    chip: { paddingHorizontal: 12, paddingVertical: Platform.OS === 'android' ? 5 : 6, borderRadius: 999, borderWidth: 1 },
    chipText: { ...T, fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_600SemiBold' },
    lineCard: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 10 },
    suggestBox: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
    suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
});
