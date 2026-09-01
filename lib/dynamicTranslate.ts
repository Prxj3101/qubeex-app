import api from '@/lib/api';
import { ParentLang } from '@/lib/parentModeI18n';
import { useEffect, useState } from 'react';

// Dynamic (teacher-entered free text) translation for Parent Mode — separate
// from the static UI-text dictionary in parentModeI18n.ts. Covers Marksheet
// Conduct/Remarks, flag category/title/detail/actionTaken/reviewRemark, and
// PTM notes: text a teacher typed, which can't be pre-translated.
//
// 'en' needs no translation. 'hinglish' isn't a real language a translation
// API can target, so per product decision, dynamic text stays in its
// original language when the parent selects Hinglish — only the static UI
// labels around it switch to the Hinglish dictionary strings.
export async function translateDynamicTexts(texts: string[], lang: ParentLang): Promise<string[]> {
    if (lang !== 'hi' && lang !== 'mr') return texts;
    if (texts.length === 0) return texts;

    try {
        const res = await api.post('/student/translate', { texts, lang });
        return res.data?.data?.texts ?? texts;
    } catch {
        // Translation is a nice-to-have on top of an already-working English
        // screen — never block/break Parent Mode if the translate call fails.
        return texts;
    }
}

/**
 * React hook wrapper around translateDynamicTexts — used by ParentModeView,
 * ReportCardSheet, and FlagsSheet to translate their own teacher-entered
 * free text whenever the parent's selected language (or the underlying
 * data) changes. Returns the original texts immediately, then swaps in the
 * translated versions once the API call resolves (or leaves them as-is for
 * 'en'/'hinglish', which never call the API at all).
 */
export function useDynamicTranslation(texts: string[], lang: ParentLang): string[] {
    const [translated, setTranslated] = useState<string[]>(texts);
    const key = texts.join('');

    useEffect(() => {
        let cancelled = false;
        if (lang !== 'hi' && lang !== 'mr') {
            setTranslated(texts);
            return;
        }
        translateDynamicTexts(texts, lang).then(result => {
            if (!cancelled) setTranslated(result);
        });
        return () => { cancelled = true; };
        // `key` is texts.join('') — a stable signature so this only
        // re-runs when the actual text content changes, not on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, lang]);

    // Guard against a stale `translated` (different length, from a previous
    // render's texts) being used for even one frame while the effect above
    // hasn't caught up yet — falls back to the current, correct-length texts.
    return translated.length === texts.length ? translated : texts;
}
