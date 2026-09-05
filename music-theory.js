(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MusicTheory = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    const PREFERRED_MAJOR = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const PREFERRED_MINOR = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];
    const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const FLAT_KEYS = new Set([
        'F', 'Bb', 'Eb', 'Ab', 'Db',
        'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm'
    ]);
    const NOTE_INDEX = {
        C: 0, 'B#': 0,
        'C#': 1, Db: 1,
        D: 2,
        'D#': 3, Eb: 3,
        E: 4, Fb: 4,
        F: 5, 'E#': 5,
        'F#': 6, Gb: 6,
        G: 7,
        'G#': 8, Ab: 8,
        A: 9,
        'A#': 10, Bb: 10,
        B: 11, Cb: 11
    };

    function wrapPc(value) {
        return ((value % 12) + 12) % 12;
    }

    function normalizeScale(value) {
        if (!value) return '';
        let scale = String(value).trim();
        scale = scale.replace(/\s*major$/i, '');
        scale = scale.replace(/\s*minor$/i, 'm');
        scale = scale.replace(/\s+/g, '');
        return scale;
    }

    function parseChordRoot(chord) {
        const match = String(chord || '').trim().match(/^([A-Ga-g])([#b])?(.*)$/);
        if (!match) return null;
        return {
            letter: match[1].toUpperCase(),
            accidental: match[2] || '',
            quality: match[3] || '',
            root: `${match[1].toUpperCase()}${match[2] || ''}`
        };
    }

    function noteIndex(root) {
        const key = String(root || '');
        return Object.prototype.hasOwnProperty.call(NOTE_INDEX, key) ? NOTE_INDEX[key] : undefined;
    }

    function isMinorScale(scale) {
        return parseChordRoot(normalizeScale(scale))?.quality === 'm';
    }

    function preferredOptions(isMinor) {
        return isMinor ? PREFERRED_MINOR.slice() : PREFERRED_MAJOR.slice();
    }

    function normalizePreferredScale(scale) {
        const parsed = parseChordRoot(normalizeScale(scale));
        if (!parsed) return '';
        const pc = noteIndex(parsed.root);
        if (pc == null) return '';
        const isMinor = parsed.quality === 'm';
        const match = preferredOptions(isMinor).find((name) => {
            const option = parseChordRoot(name);
            return option && noteIndex(option.root) === pc;
        });
        return match || `${parsed.root}${isMinor ? 'm' : ''}`;
    }

    function usesFlatSpellings(targetKey) {
        const preferred = normalizePreferredScale(targetKey);
        if (!preferred) return false;
        return FLAT_KEYS.has(preferred);
    }

    function spellRootForKey(pitchClass, targetKey) {
        const pc = wrapPc(pitchClass);
        return usesFlatSpellings(targetKey) ? FLAT_NAMES[pc] : SHARP_NAMES[pc];
    }

    function scaleInterval(fromScale, toScale) {
        const from = parseChordRoot(normalizePreferredScale(fromScale) || normalizeScale(fromScale));
        const to = parseChordRoot(normalizePreferredScale(toScale) || normalizeScale(toScale));
        const a = noteIndex(from?.root);
        const b = noteIndex(to?.root);
        if (a == null || b == null) return 0;
        return wrapPc(b - a);
    }

    function transposeRoot(root, semitones, targetKey) {
        const index = noteIndex(root);
        if (index == null) return root;
        const next = wrapPc(index + (semitones || 0));
        if (targetKey) return spellRootForKey(next, targetKey);
        return (semitones || 0) < 0 ? FLAT_NAMES[next] : SHARP_NAMES[next];
    }

    function transposeChordName(chord, semitones, targetKey) {
        const raw = String(chord || '').trim();
        if (!raw) return raw;
        const steps = semitones || 0;
        return raw.split('/').map((part) => {
            const parsed = parseChordRoot(part);
            if (!parsed) return part;
            return `${transposeRoot(parsed.root, steps, targetKey)}${parsed.quality}`;
        }).join('/');
    }

    function transposeScale(scale, semitones) {
        const value = normalizeScale(scale);
        if (!value) return '';
        const parsed = parseChordRoot(value);
        if (!parsed) return value;
        const nextRoot = transposeRoot(parsed.root, semitones || 0, null);
        const next = `${nextRoot}${parsed.quality === 'm' ? 'm' : ''}`;
        return normalizePreferredScale(next);
    }

    function toggleScaleQuality(scale) {
        const parsed = parseChordRoot(normalizeScale(scale));
        if (!parsed) return scale;
        const next = `${parsed.root}${parsed.quality === 'm' ? '' : 'm'}`;
        return normalizePreferredScale(next);
    }

    const QUALITY_INTERVALS = [
        ['maj7#11', [0, 4, 7, 11, 18]],
        ['m7b5', [0, 3, 6, 10]],
        ['madd9', [0, 3, 7, 14]],
        ['add11', [0, 4, 7, 17]],
        ['add4', [0, 4, 5, 7]],
        ['add9', [0, 4, 7, 14]],
        ['9sus4', [0, 5, 7, 10, 14]],
        ['7sus4', [0, 5, 7, 10]],
        ['maj9', [0, 4, 7, 11, 14]],
        ['maj7', [0, 4, 7, 11]],
        ['dim7', [0, 3, 6, 9]],
        ['m13', [0, 3, 7, 10, 14, 21]],
        ['m11', [0, 3, 7, 10, 14, 17]],
        ['m9', [0, 3, 7, 10, 14]],
        ['m6', [0, 3, 7, 9]],
        ['m7', [0, 3, 7, 10]],
        ['13', [0, 4, 7, 10, 14, 21]],
        ['11', [0, 4, 7, 10, 14, 17]],
        ['7b9', [0, 4, 7, 10, 13]],
        ['7#9', [0, 4, 7, 10, 15]],
        ['7b5', [0, 4, 6, 10]],
        ['7#5', [0, 4, 8, 10]],
        ['9', [0, 4, 7, 10, 14]],
        ['7', [0, 4, 7, 10]],
        ['6', [0, 4, 7, 9]],
        ['sus2', [0, 2, 7]],
        ['sus4', [0, 5, 7]],
        ['sus', [0, 5, 7]],
        ['dim', [0, 3, 6]],
        ['aug', [0, 4, 8]],
        ['5', [0, 7]],
        ['min', [0, 3, 7]],
        ['m', [0, 3, 7]]
    ];

    function normalizeQuality(quality) {
        let q = String(quality || '').replace(/\s+/g, '');
        q = q.replace(/^Δ/, 'maj').replace(/^ø/, 'm7b5').replace(/^°/, 'dim');
        q = q.replace(/^M(?=[0-9#b])/, 'maj');
        q = q.replace(/^maj$/i, '').replace(/^M$/, '').replace(/^min$/i, 'm').replace(/^mi$/i, 'm');
        return q;
    }

    function formatChordDisplay(chord) {
        return String(chord || '').replace(/maj/gi, 'M');
    }

    function intervalsForQuality(quality) {
        const q = normalizeQuality(quality);
        if (!q) return [0, 4, 7];
        const match = QUALITY_INTERVALS.find(([name]) => name.toLowerCase() === q.toLowerCase());
        if (match) return match[1];
        if (/^m(?!aj)/i.test(q)) return [0, 3, 7];
        return [0, 4, 7];
    }

    function chordMidiNotes(chord, octave = 3) {
        const raw = String(chord || '').trim();
        if (!raw) return [];
        const parts = raw.split('/');
        const parsed = parseChordRoot(parts[0]);
        if (!parsed) return [];
        const rootPc = noteIndex(parsed.root);
        if (rootPc == null) return [];
        const rootMidi = (octave + 1) * 12 + rootPc;
        const notes = intervalsForQuality(parsed.quality).map((interval) => rootMidi + interval);
        if (parts[1]) {
            const bass = parseChordRoot(parts[1]);
            const bassPc = noteIndex(bass?.root);
            if (bassPc != null) {
                let bassMidi = octave * 12 + bassPc;
                const lowest = Math.min(...notes);
                while (bassMidi >= lowest) bassMidi -= 12;
                notes.unshift(bassMidi);
            }
        }
        return [...new Set(notes)].sort((a, b) => a - b);
    }

    const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    const DIACRITIC = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
    const PERSIAN_DIGITS = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
    const MATRES = new Set(['ا', 'آ', 'أ', 'إ', 'و', 'ی', 'ي', 'ى', 'ئ']);
    const CONSONANTS = new Set([...'بپتثجچحخدذرزژسشصضطظغفقکكگلمن']);
    const LETTER_MAP = {
        'ا': 'a', 'آ': 'a', 'أ': 'a', 'إ': 'e', 'ء': '',
        'ب': 'b', 'پ': 'p', 'ت': 't', 'ث': 's',
        'ج': 'j', 'چ': 'ch', 'ح': 'h', 'خ': 'kh',
        'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z', 'ژ': 'zh',
        'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'z',
        'ط': 't', 'ظ': 'z', 'ع': '', 'غ': 'gh',
        'ف': 'f', 'ق': 'gh', 'ک': 'k', 'ك': 'k', 'گ': 'g',
        'ل': 'l', 'م': 'm', 'ن': 'n',
        'و': 'o',
        'ه': 'h', 'ة': 'h',
        'ی': 'i', 'ي': 'i', 'ئ': 'i', 'ى': 'i'
    };
    // Short vowels are unwritten in Persian. These names would otherwise be guessed wrong.
    const WORD_DICT = {
        'ابی': 'Ebi', 'ابي': 'Ebi',
        'عرفان': 'Erfan',
        'طهماسبی': 'Tahmasbi', 'طهماسبي': 'Tahmasbi',
        'علی': 'Ali', 'علي': 'Ali',
        'محمد': 'Mohammad',
        'محسن': 'Mohsen',
        'چاوشی': 'Chavoshi', 'چاووشی': 'Chavoshi',
        'گوگوش': 'Googoosh',
        'داریوش': 'Dariush',
        'هایده': 'Hayedeh',
        'مهستی': 'Mahasti',
        'معین': 'Moein', 'معين': 'Moein',
        'احسان': 'Ehsan',
        'حسین': 'Hossein', 'حسين': 'Hossein',
        'رضا': 'Reza',
        'امیر': 'Amir', 'امير': 'Amir',
        'سعید': 'Saeed', 'سعيد': 'Saeed',
        'شادمهر': 'Shadmehr',
        'عقیلی': 'Aghili', 'عقيلي': 'Aghili',
        'فرهاد': 'Farhad',
        'فریدون': 'Fereydoun', 'فريدون': 'Fereydoun',
        'سیاوش': 'Siavash', 'سياوش': 'Siavash',
        'وحید': 'Vahid', 'وحيد': 'Vahid'
    };

    function isTrueConsonant(ch) {
        return CONSONANTS.has(ch) || ch === 'ه';
    }

    function capitalizeLatin(value) {
        const text = String(value || '').toLowerCase();
        if (!text) return '';
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    function normalizePersianLetters(word) {
        return String(word || '')
            .replace(/ك/g, 'ک')
            .replace(/[يى]/g, 'ی')
            .replace(/ة/g, 'ه')
            .replace(/ـ/g, '')
            .replace(DIACRITIC, '')
            .replace(/[۰-۹]/g, (digit) => PERSIAN_DIGITS[digit] || digit);
    }

    function shouldInsertA(prev, ch, next) {
        if (!isTrueConsonant(prev) || !isTrueConsonant(ch)) return false;
        if (prev === 'ه') return false;
        if (next && MATRES.has(next)) return false;
        return true;
    }

    function romanizePersianWord(word) {
        const chars = [...normalizePersianLetters(word)].filter((ch) => ch !== 'ـ');
        const lookup = chars.join('');
        if (WORD_DICT[lookup]) return WORD_DICT[lookup];

        let out = '';
        for (let i = 0; i < chars.length; i += 1) {
            const ch = chars[i];
            const prev = chars[i - 1];
            const next = chars[i + 1];

            if (ch === 'ع') {
                if (i === 0) out += 'e';
                continue;
            }

            if (ch === 'ه' && i === chars.length - 1) {
                if (prev !== 'ا' && prev !== 'و' && prev !== 'آ') out += 'e';
                continue;
            }

            if (ch === 'و') {
                if (i === 0) {
                    out += 'v';
                    if (next && isTrueConsonant(next)) out += 'a';
                    continue;
                }
                out += 'o';
                continue;
            }

            if (i > 0 && shouldInsertA(prev, ch, next)) out += 'a';
            out += Object.prototype.hasOwnProperty.call(LETTER_MAP, ch) ? LETTER_MAP[ch] : ch;
        }

        return capitalizeLatin(out.replace(/[^A-Za-z0-9]/g, ''));
    }

    function romanizeWord(word) {
        const token = String(word || '').trim();
        if (!token) return '';
        if (ARABIC_SCRIPT.test(token)) return romanizePersianWord(token);
        const latin = token
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Za-z0-9]/g, '');
        return capitalizeLatin(latin);
    }

    function splitNameWords(text) {
        return String(text || '')
            .replace(/[\u200c\u200d]/g, ' ')
            .split(/[^\u0600-\u06FFa-zA-Z0-9]+/)
            .filter(Boolean);
    }

    function romanizeToLatin(text) {
        return splitNameWords(text).map(romanizeWord).filter(Boolean).join(' ');
    }

    function filenameToken(text) {
        const words = splitNameWords(text);
        if (!words.length) return '';
        const romanized = words.map(romanizeWord).filter(Boolean);
        if (!romanized.length) return '';
        if (ARABIC_SCRIPT.test(String(text || ''))) {
            return capitalizeLatin(romanized.join('').toLowerCase());
        }
        return romanized.join('').replace(/[^A-Za-z0-9]/g, '');
    }

    function exportImageFilename(title, artist, scale) {
        const titlePart = filenameToken(title) || 'Song';
        const artistPart = filenameToken(artist);
        const key = normalizePreferredScale(scale) || normalizeScale(scale) || '';
        const keyPart = key.replace(/[^A-Za-z0-9#]/g, '');
        return `${[titlePart, artistPart, keyPart].filter(Boolean).join('_')}.jpg`;
    }

    return {
        PREFERRED_MAJOR,
        PREFERRED_MINOR,
        normalizeScale,
        parseChordRoot,
        noteIndex,
        isMinorScale,
        preferredOptions,
        normalizePreferredScale,
        spellRootForKey,
        scaleInterval,
        transposeRoot,
        transposeChordName,
        transposeScale,
        toggleScaleQuality,
        chordMidiNotes,
        formatChordDisplay,
        romanizeToLatin,
        filenameToken,
        exportImageFilename
    };
}));
