const assert = require('assert');
const LiveLoops = require('./loops');

function eq(actual, expected, message) {
    assert.strictEqual(actual, expected, message || `${actual} !== ${expected}`);
}

function near(actual, expected, message) {
    assert.ok(Math.abs(actual - expected) < 0.0001, message || `${actual} !~ ${expected}`);
}

eq(LiveLoops.clampBpm(10, 90), 40, 'tempo stays inside the spinner range');
eq(LiveLoops.clampBpm(400, 90), 240, 'tempo stays inside the spinner range');
eq(LiveLoops.clampBpm('nope', 90), 90, 'a blank tempo keeps the loop tempo');
eq(LiveLoops.tempoRatio(90, 90), 1, 'the recorded tempo plays at normal speed');
eq(LiveLoops.tempoRatio(90, 180), 2, 'double tempo is twice as fast');
near(LiveLoops.tempoRatio(90, 45), 0.5, 'half tempo is half as fast');

function sine(length, sampleRate, hz) {
    const out = new Float32Array(length);
    for (let i = 0; i < length; i += 1) out[i] = Math.sin((2 * Math.PI * hz * i) / sampleRate);
    return out;
}

function pitchHz(samples, sampleRate) {
    const from = Math.floor(samples.length * 0.25);
    const to = Math.floor(samples.length * 0.75);
    let crosses = 0;
    for (let i = from + 1; i < to; i += 1) {
        if (samples[i - 1] <= 0 && samples[i] > 0) crosses += 1;
    }
    return crosses / ((to - from) / sampleRate);
}

const sampleRate = 8000;
const tone = sine(4000, sampleRate, 440);
const originalPitch = pitchHz(tone, sampleRate);
const faster = LiveLoops.stretchChannels([tone], 2, 320)[0];
const slower = LiveLoops.stretchChannels([tone], 0.5, 320)[0];
assert.ok(Math.abs(pitchHz(faster, sampleRate) - originalPitch) / originalPitch < 0.03, 'a faster tempo keeps the same pitch');
assert.ok(Math.abs(pitchHz(slower, sampleRate) - originalPitch) / originalPitch < 0.03, 'a slower tempo keeps the same pitch');
assert.ok(Math.abs(faster.length / tone.length - 0.5) < 0.04, 'double tempo finishes in half the time');
assert.ok(Math.abs(slower.length / tone.length - 2) < 0.08, 'half tempo takes twice as long');

const full = LiveLoops.clampTrim(null, null, 5.4);
near(full.start, 0);
near(full.end, 5.4);
const swapped = LiveLoops.clampTrim(4, 1, 5);
near(swapped.start, 1, 'a backwards drag is stored from left to right');
near(swapped.end, 4);
const tiny = LiveLoops.clampTrim(2, 2.01, 5);
near(tiny.end - tiny.start, 0.05, 'a trim keeps a short slice of the loop');
const clipped = LiveLoops.clampTrim(-1, 9, 5);
near(clipped.start, 0);
near(clipped.end, 5);

const peaks = LiveLoops.peaksFromChannel(Float32Array.from([0, 0.2, -0.8, 0.1]), 2);
eq(peaks.length, 2);
near(peaks[0], 0.2);
near(peaks[1], 0.8);

eq(LiveLoops.trimGesture(20, 100, 2, 8, 10), 'start');
eq(LiveLoops.trimGesture(80, 100, 2, 8, 10), 'end');
eq(LiveLoops.trimGesture(50, 100, 2, 8, 10), 'move');
eq(LiveLoops.trimGesture(0, 100, 2, 8, 10), 'new');

const moved = LiveLoops.applyTrimDrag('move', 5, 10, { start: 2, end: 4 }, { offset: 1, span: 2 });
near(moved.start, 4, 'dragging the selection keeps its length');
near(moved.end, 6);
const held = LiveLoops.applyTrimDrag('start', 5, 10, { start: 1, end: 3 }, {});
near(held.end, 3, 'dragging the start leaves the end where it is');
near(held.start, 2.95, 'the start cannot cross the end');

const memory = {
    value: '',
    getItem() { return this.value; },
    setItem(key, value) { this.value = value; }
};
let state = LiveLoops.loadState(memory);
const loop = LiveLoops.loopById('drum-kit-6-8-90');
state.selected = loop.id;
state = LiveLoops.remember(state, loop, { bpm: 110, start: 0.4, end: 4.2 });
LiveLoops.saveState(memory, state);
const loaded = LiveLoops.loadState(memory);
eq(loaded.selected, 'drum-kit-6-8-90', 'the chosen loop is saved');
eq(LiveLoops.tempoOf(loaded, loop), 110, 'the tempo spinner value is saved with the loop');
const trim = LiveLoops.trimOf(loaded, loop, 5.38);
near(trim.start, 0.4, 'the trim start is saved');
near(trim.end, 4.2, 'the trim end is saved');

const broken = { getItem() { return '{'; } };
eq(LiveLoops.loadState(broken).selected, '', 'a broken save does not throw');
