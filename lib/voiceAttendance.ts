// Voice attendance — turns what the teacher said ("absent 5, 12, 23 late 7") into roll numbers.
//
// This is plain rule-based code, no AI/LLM and no network: the phone's own speech recogniser gives us
// the text, and everything below only looks for status words and numbers in it. The teacher always
// reviews the result before it is applied, so a mis-heard number is caught on the confirm screen.

export interface VoiceAttendanceParse {
    /** Roll numbers the teacher called absent. */
    absent: number[];
    /** Roll numbers the teacher called late. */
    late: number[];
    /** True when the teacher said everyone is present and named nobody. */
    allPresent: boolean;
}

// ── Status words (English, Hindi, Marathi — Latin and Devanagari spellings) ─────────────────────
const ABSENT_WORDS = new Set([
    'absent', 'absents', 'apsent', 'abscent', 'absence', 'abs', 'gair', 'gairhazir', 'ghairhazir', 'gairhajir', 'anupasthit', 'gairhajar', 'gairhajeer',
    'अनुपस्थित', 'गैरहाज़िर', 'गैरहाजिर', 'गैर', 'गैरहजर', 'गैरहजेर', 'गैरहाजर', 'अब्सेंट', 'एब्सेंट', 'अॅब्सेंट',
]);
const LATE_WORDS = new Set([
    'late', 'lete', 'der', 'deri', 'ushir', 'ushira', 'vilamb',
    'लेट', 'देर', 'देरी', 'उशीर', 'उशिरा', 'विलंब',
]);
const PRESENT_WORDS = new Set([
    'present', 'presents', 'hazir', 'hajir', 'hajar', 'upasthit', 'full',
    'हाजिर', 'हाज़िर', 'हजर', 'हाजर', 'उपस्थित', 'प्रेजेंट', 'प्रेसेंट', 'प्रेझेंट',
]);
const EVERYONE_WORDS = new Set(['all', 'everyone', 'everybody', 'sab', 'sabhi', 'sare', 'sarvanna', 'sarva', 'सब', 'सभी', 'सारे', 'सर्व', 'सगळे', 'सर्वजण']);

// ── Number words ────────────────────────────────────────────────────────────────────────────────
const EN_ONES: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const EN_TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const EN_TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

// Hindi / Marathi number words are irregular (21-99 each have their own word), so these are matched as
// whole numbers. Speech recognisers for hi-IN / mr-IN normally return digits anyway; this covers the
// common 1-20 plus the round tens when they come back as words.
const INDIC_NUMBERS: Record<string, number> = {
    // Hindi, Latin
    ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, che: 6, saat: 7, sat: 7, aath: 8, ath: 8, nau: 9, das: 10,
    gyarah: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15, solah: 16, satrah: 17, atharah: 18, unnis: 19, bees: 20, tees: 30, chalis: 40, pachas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90, sau: 100,
    // Hindi, Devanagari
    'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6, 'छः': 6, 'छे': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
    'ग्यारह': 11, 'बारह': 12, 'तेरह': 13, 'चौदह': 14, 'पंद्रह': 15, 'पन्द्रह': 15, 'सोलह': 16, 'सत्रह': 17, 'अठारह': 18, 'उन्नीस': 19, 'बीस': 20, 'तीस': 30, 'चालीस': 40, 'पचास': 50, 'साठ': 60, 'सत्तर': 70, 'अस्सी': 80, 'नब्बे': 90, 'सौ': 100,
    // Marathi, Latin
    donn: 2, tin: 3, paach: 5, saha: 6, sahaa: 6, aathh: 8, naoo: 9, daha: 10, akra: 11, bara: 12, tera: 13, chauda: 14, pandhra: 15, sola: 16, satra: 17, athara: 18, ekonis: 19, vees: 20,
    // Marathi, Devanagari
    'दोन': 2, 'तीन्': 3, 'पाच': 5, 'सहा': 6, 'नऊ': 9, 'दहा': 10, 'अकरा': 11, 'बारा': 12, 'तेरा': 13, 'चौदा': 14, 'पंधरा': 15, 'सोळा': 16, 'सतरा': 17, 'अठरा': 18, 'एकोणीस': 19, 'वीस': 20, 'तीस्': 30, 'चाळीस': 40, 'पन्नास': 50, 'साठ्': 60, 'सत्तर्': 70, 'ऐंशी': 80, 'नव्वद': 90, 'शंभर': 100,
};

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

function normalise(text: string): string {
    return text
        .toLowerCase()
        // Devanagari digits -> ASCII
        .replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
        // "5th", "12th" -> 5, 12
        .replace(/(\d+)\s*(st|nd|rd|th)\b/g, '$1')
        // commas, dashes, dots, "and" glue, etc. become spaces. Devanagari letters/marks are kept.
        .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
        // "5 12" glued by the recogniser as "5,12" is already split above; split letters stuck to digits too.
        .replace(/(\d)([\p{L}])/gu, '$1 $2')
        .replace(/([\p{L}])(\d)/gu, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
}

type Mode = 'absent' | 'late' | 'present';

/**
 * Parse a spoken attendance phrase.
 *
 *   "absent 5, 12, 23"            -> absent [5, 12, 23]
 *   "absent five twelve late 7"   -> absent [5, 12], late [7]
 *   "5 12 23"                     -> absent [5, 12, 23]   (naming numbers with no status means absent)
 *   "all present"                 -> allPresent
 *
 * Numbers that appear after a status word keep that status until the next status word.
 */
export function parseAttendanceSpeech(text: string): VoiceAttendanceParse {
    const tokens = normalise(text).split(' ').filter(Boolean);
    const absent: number[] = [];
    const late: number[] = [];
    let mode: Mode = 'absent';
    let sawPresentWord = false;
    let sawEveryone = false;

    // English composite number state ("twenty" + "three")
    let acc = 0;
    const flush = () => {
        if (acc > 0) { push(acc); acc = 0; }
    };
    const push = (n: number) => {
        if (n <= 0 || n > 999) return;
        if (mode === 'absent' && !absent.includes(n)) absent.push(n);
        else if (mode === 'late' && !late.includes(n)) late.push(n);
    };

    let prev = '';
    for (const tok of tokens) {
        // "gair hazir" / "गैर हाज़िर" is ONE phrase meaning absent — its second word must not flip us to present.
        const afterGair = prev === 'gair' || prev === 'ghair' || prev.startsWith('गैर');
        prev = tok;
        if (afterGair && PRESENT_WORDS.has(tok)) continue;
        if (ABSENT_WORDS.has(tok)) { flush(); mode = 'absent'; continue; }
        if (LATE_WORDS.has(tok)) { flush(); mode = 'late'; continue; }
        if (PRESENT_WORDS.has(tok)) { flush(); mode = 'present'; sawPresentWord = true; continue; }
        if (EVERYONE_WORDS.has(tok)) { sawEveryone = true; continue; }

        if (/^\d+$/.test(tok)) { flush(); push(Number(tok)); continue; }

        // English composite numbers
        if (tok in EN_TENS) { flush(); acc = EN_TENS[tok]; continue; }
        if (tok in EN_TEENS) { flush(); acc = EN_TEENS[tok]; flush(); continue; }
        if (tok in EN_ONES) {
            const n = EN_ONES[tok];
            if (acc >= 20 && acc % 10 === 0) { acc += n; flush(); }
            else if (acc >= 100 && acc % 100 === 0 && n > 0) { acc += n; flush(); }
            else { flush(); acc = n; }
            continue;
        }
        if (tok === 'hundred') { acc = (acc > 0 && acc < 10 ? acc : 1) * 100; continue; }

        // Hindi / Marathi whole-number words
        if (tok in INDIC_NUMBERS) { flush(); push(INDIC_NUMBERS[tok]); continue; }

        // Any other word ends a number in progress ("twenty" ... "late")
        flush();
    }
    flush();

    const named = absent.length + late.length;
    return { absent, late, allPresent: named === 0 && (sawPresentWord || sawEveryone) };
}
