import api from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
/**
 * Institution-scoped notifications (teacher/student) share one backend API,
 * distinguished only by the URL prefix. Mirrors the role check in app/_layout.tsx.
 */
async function roleBase() {
    const role = await AsyncStorage.getItem('userRole');
    return role === 'TEACHER' ? '/teacher' : '/student';
}
/**
 * Polls the unread notification count while mounted. Cheap (limit=1 — we only
 * need `unreadCount` from the response, not the page of notifications itself).
 * Used by every bell icon (TopBar, TeacherTopBar, ScreenHeader) so they all
 * reflect real backend state instead of the previous always-on placeholder dot.
 */
export function useUnreadNotifications() {
    const [unreadCount, setUnreadCount] = useState(0);
    const mounted = useRef(true);
    const refresh = useCallback(async () => {
        try {
            const base = await roleBase();
            const res = await api.get(`${base}/notifications`, { params: { page: 1, limit: 1 } });
            if (mounted.current)
                setUnreadCount(res.data?.unreadCount ?? 0);
        }
        catch {
            // silent — bell just shows no badge
        }
    }, []);
    useEffect(() => {
        mounted.current = true;
        void refresh();
        const interval = setInterval(() => { void refresh(); }, 30000);
        return () => { mounted.current = false; clearInterval(interval); };
    }, [refresh]);
    return { unreadCount, refresh };
}
