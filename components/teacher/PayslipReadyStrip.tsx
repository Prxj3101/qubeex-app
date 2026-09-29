// Home strip: "October payslip ready" for a few days after payroll is published.
// Silent when the teacher isn't on payroll or nothing new was published. Same
// look as AnnouncementStrip, in green. Dismissing hides it for that payslip only.
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Wallet } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const SHOW_FOR_DAYS = 7;
const DISMISS_KEY = 'qx-payslip-strip-dismissed';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function rupees(paise: number): string {
    const s = String(Math.round(paise / 100));
    const last3 = s.slice(-3), rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return `₹${rest ? `${rest},${last3}` : last3}`;
}

export function PayslipReadyStrip() {
    const { isDark } = useTheme();
    const router = useRouter();
    const [slip, setSlip] = useState<{ id: string; month: string; netPay: number } | null>(null);

    useFocusEffect(
        useCallback(() => {
            let live = true;
            (async () => {
                try {
                    const res = await api.get('/teacher/payroll/payslips');
                    const p = (res.data.data ?? [])[0];
                    if (!p?.payrollRun?.publishedAt) { if (live) setSlip(null); return; }
                    const age = Date.now() - new Date(p.payrollRun.publishedAt).getTime();
                    const dismissed = await AsyncStorage.getItem(DISMISS_KEY).catch(() => null);
                    if (live) setSlip(age <= SHOW_FOR_DAYS * 86400000 && dismissed !== p.id ? { id: p.id, month: p.payrollRun.month, netPay: p.netPay } : null);
                } catch {
                    if (live) setSlip(null); // not on payroll - show nothing
                }
            })();
            return () => { live = false; };
        }, [])
    );

    if (!slip) return null;

    const dismiss = () => {
        AsyncStorage.setItem(DISMISS_KEY, slip.id).catch(() => { });
        setSlip(null);
    };
    const fg = isDark ? '#6EE7B7' : '#065F46';

    return (
        <View style={[styles.container, { backgroundColor: isDark ? '#052E1B' : '#ECFDF5', borderBottomColor: isDark ? '#064E3B' : '#A7F3D0' }]}>
            <Wallet size={14} color={isDark ? '#34D399' : '#059669'} />
            <TouchableOpacity style={styles.body} activeOpacity={0.7} onPress={() => { dismiss(); router.push('/teacher_payroll'); }}>
                <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
                    {MONTHS[Number(slip.month.slice(5, 7)) - 1]} payslip ready · <Text style={styles.bold}>{rupees(slip.netPay)}</Text>
                </Text>
                <Text style={[styles.view, { color: fg }]}>View</Text>
                <ChevronRight size={14} color={fg} style={styles.chev} />
            </TouchableOpacity>
            <TouchableOpacity onPress={dismiss} hitSlop={8}>
                <Text style={[styles.close, { color: fg }]}>✕</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingHorizontal: 20, paddingVertical: 10, gap: 10 },
    body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
    text: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '500', includeFontPadding: false },
    bold: { fontWeight: '700' },
    view: { fontSize: 12, lineHeight: 16, fontWeight: '700', includeFontPadding: false },
    chev: { marginTop: Platform.OS === 'android' ? 1 : 0 },
    close: { fontSize: 13, lineHeight: 16, fontWeight: '700', includeFontPadding: false },
});
