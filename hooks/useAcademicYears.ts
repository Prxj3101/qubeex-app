import { useEffect, useState } from 'react';
import api from '@/lib/api';

export interface AcademicYearSummary {
    id: string;
    label: string;
    startDate: string;
    endDate: string;
    status: 'ACTIVE' | 'CLOSED';
    isCurrent: boolean;
}

// Fetched fresh per screen (no shared context) — each of the three history
// screens (Attendance, Report Card, Fees) is an independent route with no
// cross-screen year state to keep in sync, unlike the web admin/teacher
// division tabs which share one selection across several tabs on one page.
export function useAcademicYears() {
    const [years, setYears] = useState<AcademicYearSummary[]>([]);
    const [selectedYearId, setSelectedYearId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        api.get('/academic-years')
            .then((res) => {
                if (cancelled) return;
                const list: AcademicYearSummary[] = res.data?.data ?? [];
                setYears(list);
                const current = list.find((y) => y.isCurrent);
                setSelectedYearId(current?.id ?? list[0]?.id ?? null);
            })
            .catch(() => { if (!cancelled) setYears([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const selectedYear = years.find((y) => y.id === selectedYearId) ?? null;
    const isCurrentYearSelected = selectedYear?.isCurrent ?? true;

    return { years, selectedYearId, setSelectedYearId, selectedYear, isCurrentYearSelected, loading };
}
