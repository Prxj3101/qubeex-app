import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState } from 'react';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Branding {
    enabled: boolean;
    brandName: string;
    logoUrl: string;
    faviconUrl: string;
}

export const QUBEEX_DEFAULT_BRANDING: Branding = {
    enabled: false,
    brandName: 'QubeEx',
    logoUrl: '',
    faviconUrl: '',
};

const isBranding = (v: unknown): v is Branding =>
    !!v && typeof v === 'object'
    && typeof (v as Branding).enabled === 'boolean'
    && typeof (v as Branding).brandName === 'string';

const CACHE_KEY = 'qubeex_branding';

// ─── Context ──────────────────────────────────────────────────────────────────
// Mirrors InstitutionContext's AsyncStorage-cache-then-refresh pattern: seed
// from whatever was cached from the last login so there's no flash of
// QubeEx branding before the post-login /branding fetch resolves, then
// overwrite with the live backend value (source of truth — it re-checks
// Pro-plan eligibility on every call, so this context never needs its own
// eligibility logic).
type BrandingContextType = {
    branding: Branding;
    refreshBranding: () => Promise<void>;
    clearBranding: () => void;
};

const BrandingContext = createContext<BrandingContextType>({
    branding: QUBEEX_DEFAULT_BRANDING,
    refreshBranding: async () => { },
    clearBranding: () => { },
});

export function BrandingProvider({ children }: { children: React.ReactNode }) {
    const [branding, setBranding] = useState<Branding>(QUBEEX_DEFAULT_BRANDING);

    const refreshBranding = async () => {
        try {
            const res = await api.get('/branding');
            const data = res.data?.data;
            if (isBranding(data)) {
                setBranding(data);
                await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
            }
        } catch {
            // Not logged in yet, or request failed — keep default/cached branding.
        }
    };

    useEffect(() => {
        AsyncStorage.getItem(CACHE_KEY).then((raw) => {
            if (!raw) return;
            try {
                const cached = JSON.parse(raw);
                if (isBranding(cached)) setBranding(cached);
            } catch { /* ignore corrupt cache */ }
        });

        // Don't rely solely on AuthGate's segment-change effect to trigger
        // this — that only fires around navigation, so an app already
        // sitting on the dashboard (or reopened from background) could keep
        // showing stale cached branding indefinitely. Always attempt a fresh
        // fetch on provider mount too; if there's no token yet this just
        // 401s and is swallowed above.
        refreshBranding();
    }, []);

    const clearBranding = () => {
        setBranding(QUBEEX_DEFAULT_BRANDING);
        AsyncStorage.removeItem(CACHE_KEY);
    };

    return (
        <BrandingContext.Provider value={{ branding, refreshBranding, clearBranding }}>
            {children}
        </BrandingContext.Provider>
    );
}

export function useBranding() {
    return useContext(BrandingContext);
}
