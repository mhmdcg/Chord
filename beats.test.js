const assert = require('assert');
const BeatMaker = require('./beats');

function eq(actual, expected, message) {
    assert.strictEqual(actual, expected, message || `${actual} !== ${expected}`);
}

function deepEq(actual, expected, message) {
    assert.deepStrictEqual(actual, expected, message);
}

eq(BeatMaker.stepDuration(120), 0.125, '120 bpm places 16ths at an eighth of a second');
eq(BeatMaker.clampBpm(10), 60, 'tempo stays inside the playable range');
eq(BeatMaker.clampBpm(400), 200, 'tempo stays inside the playable range');
eq(BeatMaker.totalSteps(1), 16);
eq(BeatMaker.totalSteps(2), 32);

eq(BeatMaker.quantizeStep(0, 1), 0);
eq(BeatMaker.quantizeStep(0.49, 1), 0);
eq(BeatMaker.quantizeStep(0.5, 1), 1);
eq(BeatMaker.quantizeStep(15.6, 1), 0, 'a hit just after the last step wraps to the downbeat');
eq(BeatMaker.quantizeStep(-0.2, 1), 0);
eq(BeatMaker.quantizeStep(-1, 1), 0, 'a hit before the loop starts lands on step 1');
eq(BeatMaker.quantizeStep(16.5, 2), 17);

const kick = BeatMaker.addHit([], '808-kick', 0, 1);
const again = BeatMaker.addHit(kick, '808-kick', 0, 1);
eq(again.length, 1, 'the same sound on the same step is stored once');
const layered = BeatMaker.addHit(kick, '808-hat', 0, 1);
eq(layered.length, 2, 'a second sound on that step is kept');
const overdub = BeatMaker.addHit(layered, '808-snare', 4, 1);
eq(overdub.length, 3, 'a later hit is added on top of the loop');
eq(BeatMaker.removeHit(overdub, '808-hat', 0).length, 2);

const cleared = BeatMaker.clearSound(overdub, '808-kick');
eq(cleared.some((hit) => hit.soundId === '808-kick'), false);
eq(cleared.length, 2, 'clearing one sound leaves the other hits');

const twoBars = BeatMaker.addHit(overdub, 'kit-snare', 20, 2);
eq(BeatMaker.trimHits(twoBars, 1).some((hit) => hit.step >= 16), false, 'one bar drops hits in the second bar');
eq(BeatMaker.trimHits(twoBars, 1).length, 3);

const saved = BeatMaker.sanitizeBeat({
    id: 'beat-1',
    name: '  Pocket   groove  ',
    bpm: 90,
    bars: 2,
    pads: ['kit-kick', 'not-a-sound'],
    hits: [
        { soundId: '808-kick', step: 0 },
        { soundId: '808-kick', step: 0 },
        { soundId: 'nope', step: 2 },
        { soundId: '808-snare', step: 40 },
        { soundId: '808-hat', step: 2 }
    ]
});
eq(saved.name, 'Pocket groove');
eq(saved.bpm, 90);
eq(saved.bars, 2);
eq(saved.pads[0], 'kit-kick');
eq(saved.pads[1], '808-snare', 'an unknown pad sound falls back to the default');
eq(saved.hits.length, 2);
deepEq(saved.hits[1], { soundId: '808-hat', step: 2 });
eq(BeatMaker.defaultPads().length, 16);

const moved = BeatMaker.retargetHits([
    { soundId: '808-cowbell', step: 4 },
    { soundId: '808-kick', step: 0 },
    { soundId: '808-clap', step: 4 }
], '808-cowbell', '808-clap');
deepEq(moved, [
    { soundId: '808-clap', step: 4 },
    { soundId: '808-kick', step: 0 }
], 'changing a pad keeps one hit when the new sound was already on that step');
eq(BeatMaker.emptyBeat().hits.length, 0);

console.log('beats tests passed');
