import { createContext, useContext } from 'react';
import { ParentLang } from '@/lib/parentModeI18n';

interface ParentModeLanguageContextValue {
    lang: ParentLang;
    setLang: (lang: ParentLang) => void;
}

// Default value ('en', no-op setter) means every embedded sheet
// (ReportCardSheet, AttendanceSheet, FlagsSheet) still renders correctly in
// plain English when used on its OWN standalone screen (report_card.tsx,
// attendance_detail.tsx, flags.tsx) — those screens never wrap themselves in
// a <ParentModeLanguageContext.Provider>, so useContext just falls back to
// this default rather than needing every call site to be provider-aware.
export const ParentModeLanguageContext = createContext<ParentModeLanguageContextValue>({
    lang: 'en',
    setLang: () => {},
});

export function useParentModeLanguage() {
    return useContext(ParentModeLanguageContext);
}
