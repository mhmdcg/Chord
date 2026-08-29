const assert = require('assert');
const theory = require('./music-theory');

function eq(actual, expected, message) {
    assert.strictEqual(actual, expected, message || `${actual} !== ${expected}`);
}

function deepEq(actual, expected, message) {
    assert.deepStrictEqual(actual, expected, message);
}

function transposeAll(chords, semitones, targetKey) {
    return chords.map((chord) => theory.transposeChordName(chord, semitones, targetKey));
}

function roundTrip(scale, chords, steps) {
    let current = scale;
    let names = chords.slice();
    for (let i = 0; i < steps; i += 1) {
        current = theory.transposeScale(current, 1);
        names = transposeAll(names, 1, current);
    }
    for (let i = 0; i < steps; i += 1) {
        current = theory.transposeScale(current, -1);
        names = transposeAll(names, -1, current);
    }
    return { scale: current, chords: names };
}

eq(theory.normalizePreferredScale('Gbm'), 'F#m', 'Gb minor normalizes to F#m');
eq(theory.normalizePreferredScale('A#m'), 'Bbm', 'A# minor normalizes to Bbm');
eq(theory.normalizePreferredScale('Dbm'), 'C#m', 'Db minor normalizes to C#m');
eq(theory.normalizePreferredScale('D#m'), 'Ebm', 'D# minor normalizes to Ebm');
eq(theory.normalizePreferredScale('C#'), 'Db', 'C# major normalizes to Db');
eq(theory.normalizePreferredScale('Gb'), 'F#', 'Gb major normalizes to F#');
eq(theory.normalizePreferredScale('D#'), 'Eb', 'D# major normalizes to Eb');

eq(theory.scaleInterval('Ebm', 'F#m'), 3, 'Ebm to F#m is +3');
eq(theory.scaleInterval('Ebm', 'Gm'), 4, 'Ebm to Gm is +4');

const ebmChords = ['Ebm', 'Bbm', 'Db', 'Abm', 'Bb7', 'B', 'E', 'Db/F'];
const ebmToFshm = transposeAll(ebmChords, 3, 'F#m');
deepEq(ebmToFshm, ['F#m', 'C#m', 'E', 'Bm', 'C#7', 'D', 'G', 'E/G#'], 'Ebm -> F#m spelling');
eq(theory.transposeScale('Ebm', 3), 'F#m');

const ebmToGm = transposeAll(ebmChords, 4, 'Gm');
deepEq(ebmToGm, ['Gm', 'Dm', 'F', 'Cm', 'D7', 'Eb', 'Ab', 'F/A'], 'Ebm -> Gm spelling');
eq(theory.transposeScale('Ebm', 4), 'Gm');

eq(theory.transposeChordName('Bbm7', 3, 'C#m'), 'C#m7');
eq(theory.transposeChordName('Amaj7', 1, 'Bb'), 'Bbmaj7');
eq(theory.transposeChordName('Fdim', 3, 'F#m'), 'G#dim');
eq(theory.transposeChordName('Gb', 3, 'F#m'), 'A');
eq(theory.transposeChordName('Cb', 3, 'F#m'), 'D');
eq(theory.transposeChordName('Dsus4', 1, 'Eb'), 'Ebsus4');
eq(theory.transposeChordName('F#m', 0, 'F#m'), 'F#m');
eq(theory.transposeChordName('Dbm', 0, 'C#m'), 'C#m', 'respell Db minor chord into C#m');

eq(theory.transposeChordName('Db/F', 2, 'Eb'), 'Eb/G', 'slash chord prefers flats in Eb');
eq(theory.transposeChordName('A/C#', 1, 'Bb'), 'Bb/D', 'slash chord prefers flats in Bb');
eq(theory.transposeChordName('D/F#', 2, 'E'), 'E/G#', 'slash chord prefers sharps in E');

eq(theory.transposeChordName('C#7', 0, 'F#m'), 'C#7');
eq(theory.transposeChordName('Db7', 0, 'F#m'), 'C#7', 'respell Db7 to C#7 in F#m');
eq(theory.transposeChordName('Gb', 0, 'Ebm'), 'Gb', 'keep Gb in Ebm');
eq(theory.transposeChordName('F#', 0, 'Ebm'), 'Gb', 'respell F# to Gb in Ebm');

const trip = roundTrip('Ebm', ['Ebm', 'Db', 'Abm', 'Bb7', 'Db/F', 'Gdim', 'Asus4', 'Cmaj7'], 12);
eq(trip.scale, 'Ebm', '12 semitone round trip returns Ebm');
deepEq(trip.chords, ['Ebm', 'Db', 'Abm', 'Bb7', 'Db/F', 'Gdim', 'Asus4', 'Cmaj7'], 'no spelling drift after +/− round trip');

const shortTrip = roundTrip('Ebm', ['Ebm', 'Bbm', 'Db/F'], 3);
eq(shortTrip.scale, 'Ebm');
deepEq(shortTrip.chords, ['Ebm', 'Bbm', 'Db/F']);

eq(theory.toggleScaleQuality('Ebm'), 'Eb');
eq(theory.toggleScaleQuality('F#m'), 'F#');
eq(theory.toggleScaleQuality('C#m'), 'Db', 'parallel of C#m is Db major');

deepEq(theory.preferredOptions(true), theory.PREFERRED_MINOR);
deepEq(theory.preferredOptions(false), theory.PREFERRED_MAJOR);
assert.ok(!theory.PREFERRED_MINOR.includes('Gbm'));
assert.ok(!theory.PREFERRED_MINOR.includes('A#m'));
assert.ok(!theory.PREFERRED_MAJOR.includes('C#'));
assert.ok(!theory.PREFERRED_MAJOR.includes('Gb'));

console.log('All transposition spelling tests passed.');
