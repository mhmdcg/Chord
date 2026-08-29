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
        toggleScaleQuality
    };
}));
