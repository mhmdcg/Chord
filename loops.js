(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LiveLoops = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    const STORAGE_KEY = 'chordAnnotatorLiveLoops';
    const SPEED_MIN = 50;
    const SPEED_MAX = 200;
    const LOOPS = [
        {
            id: 'drum-kit-6-8-90',
            name: 'Drum 6/8 · 90',
            bpm: 90,
            file: 'loops/drum-kit-6-8-90.mp3'
        }
    ];
    const LOOP_BY_ID = new Map(LOOPS.map((loop) => [loop.id, loop]));

    function loopById(id) {
        return LOOP_BY_ID.get(id) || null;
    }

    function clampSpeed(value, fallback) {
        const fb = Math.round(Number(fallback));
        const safeFallback = Number.isFinite(fb) ? Math.min(SPEED_MAX, Math.max(SPEED_MIN, fb)) : 100;
        const speed = Math.round(Number(value));
        if (!Number.isFinite(speed)) return safeFallback;
        return Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed));
    }

    function playbackSpeed(percent, originalSlice) {
        if (originalSlice) return 1;
        return clampSpeed(percent, 100) / 100;
    }

    function hannWindow(length) {
        const window = new Float32Array(length);
        const denom = Math.max(1, length - 1);
        for (let i = 0; i < length; i += 1) {
            window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / denom));
        }
        return window;
    }

    function sampleAt(channel, index, length) {
        return channel[((index % length) + length) % length];
    }

    function alignGrain(channel, length, ideal, write, hop, outs, weight, radius) {
        let best = ideal;
        let bestScore = -Infinity;
        const overlap = Math.min(hop, 256);
        for (let delta = -radius; delta <= radius; delta += 1) {
            const origin = ideal + delta;
            let score = 0;
            let used = 0;
            for (let i = 0; i < overlap; i += 2) {
                const at = (write + i) % outs.length;
                if (weight[at] <= 0.0001) continue;
                score += (outs[at] / weight[at]) * sampleAt(channel, origin + i, length);
                used += 1;
            }
            if (used && score > bestScore) {
                bestScore = score;
                best = origin;
            }
        }
        return best;
    }

    function stretchChannels(channels, ratio, grainSize) {
        const sources = channels && channels.length ? channels : [new Float32Array(1)];
        const length = sources[0].length || 1;
        const speed = Math.min(8, Math.max(0.125, Number(ratio) || 1));
        const outLength = Math.max(1, Math.round(length / speed));
        let grain = Math.round(grainSize || Math.min(length, 2048));
        grain = Math.max(8, Math.min(grain, length));
        const hop = Math.max(1, Math.floor(grain / 2));
        const window = hannWindow(grain);
        const radius = Math.max(1, Math.min(Math.floor(hop / 2), 400));
        const outs = sources.map(() => new Float32Array(outLength));
        const weight = new Float32Array(outLength);
        let read = 0;
        let write = 0;
        while (write < outLength) {
            let origin = Math.round(read);
            if (write > 0) origin = alignGrain(sources[0], length, origin, write, hop, outs[0], weight, radius);
            for (let i = 0; i < grain; i += 1) {
                const at = (write + i) % outLength;
                const gain = window[i];
                for (let channel = 0; channel < sources.length; channel += 1) {
                    outs[channel][at] += sampleAt(sources[channel], origin + i, length) * gain;
                }
                weight[at] += gain;
            }
            read = origin + hop * speed;
            write += hop;
        }
        for (let i = 0; i < outLength; i += 1) {
            const gain = weight[i] > 0.0001 ? weight[i] : 1;
            for (let channel = 0; channel < outs.length; channel += 1) outs[channel][i] /= gain;
        }
        return outs;
    }

    function clampTrim(start, end, duration) {
        const length = Number(duration);
        if (!Number.isFinite(length) || length <= 0) return { start: 0, end: 0 };
        const minSpan = Math.min(0.05, length);
        let s = Number(start);
        let e = Number(end);
        if (start == null || end == null || !Number.isFinite(s) || !Number.isFinite(e)) return { start: 0, end: length };
        if (e < s) {
            const swap = s;
            s = e;
            e = swap;
        }
        s = Math.min(Math.max(0, s), length);
        e = Math.min(Math.max(0, e), length);
        if (e - s < minSpan) {
            if (s + minSpan <= length) e = s + minSpan;
            else {
                e = length;
                s = length - minSpan;
            }
        }
        return { start: s, end: e };
    }

    function emptyState() {
        return { selected: '', byId: {} };
    }

    function loadState(storage) {
        try {
            const raw = storage && storage.getItem(STORAGE_KEY);
            if (!raw) return emptyState();
            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object') return emptyState();
            const byId = data.byId && typeof data.byId === 'object' ? data.byId : {};
            const selected = typeof data.selected === 'string' && loopById(data.selected) ? data.selected : '';
            return { selected, byId };
        } catch (error) {
            return emptyState();
        }
    }

    function saveState(storage, state) {
        if (!storage) return;
        storage.setItem(STORAGE_KEY, JSON.stringify({
            selected: state.selected || '',
            byId: state.byId || {}
        }));
    }

    function savedFor(state, id) {
        const saved = state && state.byId && state.byId[id];
        return saved && typeof saved === 'object' ? saved : {};
    }

    function speedOf(state, loop) {
        const saved = savedFor(state, loop.id);
        if (saved.speed != null && saved.speed !== '') return clampSpeed(saved.speed, 100);
        if (saved.bpm != null && loop && loop.bpm) {
            return clampSpeed(Math.round((Number(saved.bpm) / loop.bpm) * 100), 100);
        }
        return 100;
    }

    function trimOf(state, loop, duration) {
        const saved = savedFor(state, loop.id);
        return clampTrim(saved.start, saved.end, duration);
    }

    function remember(state, loop, patch) {
        const next = {
            selected: state.selected || '',
            byId: Object.assign({}, state.byId)
        };
        const current = Object.assign({}, savedFor(next, loop.id));
        if (patch.speed != null) current.speed = clampSpeed(patch.speed, 100);
        if (patch.start != null) current.start = patch.start;
        if (patch.end != null) current.end = patch.end;
        next.byId[loop.id] = current;
        return next;
    }

    function peaksFromChannel(samples, buckets) {
        const count = Math.max(1, buckets | 0);
        const peaks = new Array(count).fill(0);
        if (!samples || !samples.length) return peaks;
        const size = samples.length / count;
        for (let i = 0; i < count; i += 1) {
            const from = Math.floor(i * size);
            const to = Math.max(from + 1, Math.min(samples.length, Math.floor((i + 1) * size)));
            let max = 0;
            for (let j = from; j < to; j += 1) {
                const value = Math.abs(samples[j]);
                if (value > max) max = value;
            }
            peaks[i] = max;
        }
        return peaks;
    }

    function trimGesture(x, width, start, end, duration) {
        if (!(width > 0) || !(duration > 0)) return 'none';
        const startX = (start / duration) * width;
        const endX = (end / duration) * width;
        const handle = Math.max(14, width * 0.03);
        if (Math.abs(x - startX) <= handle && Math.abs(x - startX) <= Math.abs(x - endX)) return 'start';
        if (Math.abs(x - endX) <= handle) return 'end';
        if (x > Math.min(startX, endX) && x < Math.max(startX, endX)) return 'move';
        return 'new';
    }

    function applyTrimDrag(kind, time, duration, trim, drag) {
        const length = Number(duration);
        const minSpan = Math.min(0.05, Math.max(0, length) || 0);
        if (kind === 'start') {
            const limit = Math.max(0, trim.end - minSpan);
            const start = Math.min(Math.max(0, time), limit);
            return { start, end: trim.end };
        }
        if (kind === 'end') {
            const limit = Math.min(length, trim.start + minSpan);
            const end = Math.max(Math.min(length, time), limit);
            return { start: trim.start, end };
        }
        if (kind === 'move') {
            const span = Math.min(length, Math.max(minSpan, drag.span));
            let start = time - drag.offset;
            if (start < 0) start = 0;
            if (start + span > length) start = Math.max(0, length - span);
            return { start, end: start + span };
        }
        return clampTrim(time, time, duration);
    }

    function formatSeconds(value) {
        const seconds = Math.max(0, Number(value) || 0);
        return `${seconds.toFixed(2)} s`;
    }

    function drawWave(canvas, peaks, trim, duration, playhead) {
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        const width = canvas.clientWidth || 600;
        const height = canvas.clientHeight || 160;
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#0e1526';
        ctx.fillRect(0, 0, width, height);
        const startX = duration ? (trim.start / duration) * width : 0;
        const endX = duration ? (trim.end / duration) * width : width;
        const mid = height / 2;
        const slot = width / Math.max(1, peaks.length);
        peaks.forEach((peak, index) => {
            const bar = Math.max(1, slot * 0.72);
            const x = index * slot + (slot - bar) / 2;
            const h = Math.max(2, peak * (height - 18));
            const center = x + bar / 2;
            ctx.fillStyle = center >= startX && center <= endX ? '#f5b400' : '#3a4760';
            ctx.fillRect(x, mid - h / 2, bar, h);
        });
        ctx.fillStyle = 'rgba(245, 180, 0, 0.16)';
        ctx.fillRect(startX, 0, Math.max(0, endX - startX), height);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(startX + 1, 0);
        ctx.lineTo(startX + 1, height);
        ctx.moveTo(endX - 1, 0);
        ctx.lineTo(endX - 1, height);
        ctx.stroke();
        if (playhead != null && duration > 0) {
            const x = Math.min(width, Math.max(0, playhead * width));
            ctx.strokeStyle = '#7dd3fc';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
    }

    class LiveLoops {
        constructor(storage) {
            this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
            this.state = loadState(this.storage);
            this.bound = false;
            this.ctx = null;
            this.buffers = new Map();
            this.peaks = new Map();
            this.source = null;
            this.playToken = 0;
            this.playing = false;
            this.startedAt = 0;
            this.anchorTime = 0;
            this.anchorOffset = 0;
            this.rate = 1;
            this.playBuffer = null;
            this.sliceCache = null;
            this.trimming = false;
            this.trimFrame = 0;
            this.drag = null;
            this.draftTrim = null;
        }

        enter() {
            this.active = true;
            this.playing = false;
            this.bind();
            this.state = loadState(this.storage);
            this.syncForm();
            this.preloadCurrent();
        }

        leave() {
            this.active = false;
            this.playing = false;
            this.playToken += 1;
            this.stopSource();
            this.closeTrim();
            this.syncForm();
        }

        current() {
            return loopById(this.state.selected);
        }

        bind() {
            if (this.bound) return;
            const select = document.getElementById('liveLoopSelect');
            const bpm = document.getElementById('liveLoopBpm');
            const trimBtn = document.getElementById('liveLoopTrimBtn');
            const playBtn = document.getElementById('liveLoopPlayBtn');
            const slower = document.getElementById('liveLoopBpmDown');
            const faster = document.getElementById('liveLoopBpmUp');
            if (!select || !bpm || !trimBtn || !playBtn || !slower || !faster) return;
            this.bound = true;
            LOOPS.forEach((loop) => {
                const option = document.createElement('option');
                option.value = loop.id;
                option.textContent = loop.name;
                select.appendChild(option);
            });
            select.addEventListener('change', () => {
                this.state.selected = loopById(select.value) ? select.value : '';
                if (!this.current()) this.playing = false;
                this.persist();
                this.syncForm();
                this.preloadCurrent();
                if (this.playing) this.playCurrent(0);
                else this.stopPlayback();
            });
            bpm.addEventListener('input', () => this.onSpeedInput(false));
            bpm.addEventListener('change', () => this.onSpeedInput(true));
            document.getElementById('liveLoopPlayBtn').addEventListener('click', () => this.togglePlayback());
            document.getElementById('liveLoopBpmDown').addEventListener('click', () => this.stepSpeed(-1));
            document.getElementById('liveLoopBpmUp').addEventListener('click', () => this.stepSpeed(1));
            trimBtn.addEventListener('click', () => this.openTrim());
            document.getElementById('liveLoopTrimClose')?.addEventListener('click', () => this.closeTrim());
            document.getElementById('liveLoopTrim')?.addEventListener('click', (event) => {
                if (event.target.id === 'liveLoopTrim') this.closeTrim();
            });
            const canvas = document.getElementById('liveLoopWave');
            if (canvas) {
                canvas.addEventListener('pointerdown', (event) => this.onTrimPointerDown(event));
                canvas.addEventListener('pointermove', (event) => this.onTrimPointerMove(event));
                canvas.addEventListener('pointerup', (event) => this.onTrimPointerUp(event));
                canvas.addEventListener('pointercancel', (event) => this.onTrimPointerUp(event));
            }
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') this.closeTrim();
            });
        }

        onSpeedInput(commit) {
            const loop = this.current();
            const input = document.getElementById('liveLoopBpm');
            if (!loop || !input) return;
            const typed = Number(input.value);
            if (!commit && (!Number.isFinite(typed) || typed !== clampSpeed(typed, 100))) return;
            this.applySpeed(clampSpeed(input.value, 100), commit);
        }

        stepSpeed(delta) {
            const loop = this.current();
            if (!loop) return;
            this.applySpeed(clampSpeed(speedOf(this.state, loop) + delta, 100), true);
        }

        applySpeed(speed, commit) {
            const loop = this.current();
            const input = document.getElementById('liveLoopBpm');
            if (!loop) return;
            const previous = speedOf(this.state, loop);
            if (commit && input) input.value = String(speed);
            this.state = remember(this.state, loop, { speed });
            this.persist();
            this.syncForm();
            if (this.trimming || speed === previous) return;
            this.setPlaybackRate(playbackSpeed(speed, false));
        }

        setPlaybackRate(rate) {
            if (!this.playing || !this.source || !this.ctx || !this.playBuffer) return;
            const position = this.bufferPosition();
            this.rate = rate;
            this.source.playbackRate.value = rate;
            this.anchorTime = this.ctx.currentTime;
            this.anchorOffset = position;
        }

        syncForm() {
            const select = document.getElementById('liveLoopSelect');
            const bpm = document.getElementById('liveLoopBpm');
            const trimBtn = document.getElementById('liveLoopTrimBtn');
            const playBtn = document.getElementById('liveLoopPlayBtn');
            const slower = document.getElementById('liveLoopBpmDown');
            const faster = document.getElementById('liveLoopBpmUp');
            const loop = this.current();
            const speed = loop ? speedOf(this.state, loop) : 100;
            const locked = !!this.trimming;
            if (select) select.value = loop ? loop.id : '';
            if (bpm) {
                bpm.disabled = !loop || locked;
                bpm.value = String(speed);
            }
            if (trimBtn) trimBtn.disabled = !loop;
            if (slower) slower.disabled = !loop || locked || speed <= SPEED_MIN;
            if (faster) faster.disabled = !loop || locked || speed >= SPEED_MAX;
            if (playBtn) {
                playBtn.disabled = !loop;
                playBtn.textContent = this.playing ? 'Stop' : 'Play';
                playBtn.setAttribute('aria-pressed', this.playing ? 'true' : 'false');
                playBtn.setAttribute('aria-label', this.playing ? 'Stop loop' : 'Play loop');
            }
        }

        togglePlayback() {
            if (!this.current()) return;
            this.playing = !this.playing;
            this.syncForm();
            if (this.playing) this.playCurrent(0);
            else this.stopPlayback();
        }

        context() {
            if (this.ctx) return this.ctx;
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return null;
            this.ctx = new Ctx();
            return this.ctx;
        }

        playCurrent(fraction) {
            const loop = this.current();
            this.playToken += 1;
            this.stopSource();
            if (!this.active || !this.playing || !loop) return;
            const token = this.playToken;
            const ctx = this.context();
            if (!ctx) return;
            if (ctx.state === 'suspended') ctx.resume();
            const ready = this.buffers.get(loop.id);
            if (ready) {
                this.schedule(loop, ready, token, fraction || 0);
                return;
            }
            this.bufferFor(loop).then((buffer) => {
                if (token !== this.playToken || !buffer) return;
                this.schedule(loop, buffer, token, fraction || 0);
            }).catch(() => {
                this.playing = false;
                this.syncForm();
                this.setTrimStatus('Could not load this loop.');
            });
        }

        preloadCurrent() {
            const loop = this.current();
            if (!loop || !this.active) return;
            const ctx = this.context();
            if (ctx && ctx.state === 'suspended') ctx.resume();
            this.bufferFor(loop).catch(() => {});
        }

        bufferPosition() {
            const duration = this.playBuffer && this.playBuffer.duration;
            if (!duration || !this.ctx) return 0;
            const elapsed = this.ctx.currentTime - this.anchorTime;
            const position = this.anchorOffset + elapsed * (this.rate || 1);
            return ((position % duration) + duration) % duration;
        }

        playFraction() {
            const duration = this.playBuffer && this.playBuffer.duration;
            if (!duration) return 0;
            return this.bufferPosition() / duration;
        }

        bufferFor(loop) {
            if (this.buffers.has(loop.id)) return Promise.resolve(this.buffers.get(loop.id));
            const ctx = this.context();
            if (!ctx) return Promise.reject(new Error('no audio'));
            return fetch(loop.file).then((response) => {
                if (!response.ok) throw new Error('missing loop');
                return response.arrayBuffer();
            }).then((bytes) => ctx.decodeAudioData(bytes.slice(0))).then((buffer) => {
                this.buffers.set(loop.id, buffer);
                this.peaks.set(loop.id, peaksFromChannel(buffer.getChannelData(0), 180));
                return buffer;
            });
        }

        schedule(loop, buffer, token, fraction) {
            if (!this.active || token !== this.playToken) return;
            if (!this.playing && !this.trimming) return;
            const ctx = this.context();
            const trim = this.activeTrim(loop, buffer.duration);
            const slice = this.sliceBuffer(ctx, loop, buffer, trim);
            const rate = playbackSpeed(speedOf(this.state, loop), this.trimming);
            const source = ctx.createBufferSource();
            source.buffer = slice;
            source.loop = true;
            source.playbackRate.value = rate;
            source.connect(ctx.destination);
            const offset = Math.min(Math.max(0, (fraction || 0) * slice.duration), Math.max(0, slice.duration - 0.001));
            try {
                source.start(ctx.currentTime, offset);
            } catch (error) {
                return;
            }
            this.source = source;
            this.playBuffer = slice;
            this.rate = rate;
            this.anchorTime = ctx.currentTime;
            this.anchorOffset = offset;
        }

        sliceBuffer(ctx, loop, buffer, trim) {
            const key = `${loop.id}:${trim.start.toFixed(3)}:${trim.end.toFixed(3)}`;
            if (this.sliceCache && this.sliceCache.key === key) return this.sliceCache.audio;
            const rate = buffer.sampleRate;
            const start = Math.max(0, Math.floor(trim.start * rate));
            const end = Math.min(buffer.length, Math.max(start + 1, Math.ceil(trim.end * rate)));
            const audio = ctx.createBuffer(buffer.numberOfChannels, Math.max(1, end - start), rate);
            for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
                const copy = new Float32Array(audio.length);
                copy.set(buffer.getChannelData(channel).subarray(start, start + audio.length));
                audio.copyToChannel(copy, channel);
            }
            this.sliceCache = { key, audio };
            return audio;
        }

        activeTrim(loop, duration) {
            if (this.draftTrim && this.current() && this.current().id === loop.id) return this.draftTrim;
            return trimOf(this.state, loop, duration);
        }

        stopPlayback() {
            this.playToken += 1;
            this.stopSource();
        }

        stopSource() {
            const source = this.source;
            this.source = null;
            this.playBuffer = null;
            if (!source) return;
            source.onended = null;
            try { source.stop(); } catch (error) { /* already stopped */ }
        }

        openTrim() {
            const loop = this.current();
            const popup = document.getElementById('liveLoopTrim');
            if (!loop || !popup || this.trimming) return;
            const ctx = this.context();
            if (ctx && ctx.state === 'suspended') ctx.resume();
            this.trimming = true;
            this.playToken += 1;
            this.stopSource();
            this.syncForm();
            popup.hidden = false;
            const title = document.getElementById('liveLoopTrimTitle');
            if (title) title.textContent = loop.name;
            this.setTrimStatus('Drag either edge on the original recording. Closing keeps this trim playing.');
            this.bufferFor(loop).then((buffer) => {
                if (!buffer || !this.trimming || !this.current() || this.current().id !== loop.id) return;
                this.draftTrim = trimOf(this.state, loop, buffer.duration);
                this.renderTrim(loop, buffer);
                this.playToken += 1;
                this.schedule(loop, buffer, this.playToken, 0);
                this.startTrimClock();
            }).catch(() => {
                this.setTrimStatus('Could not load this loop.');
            });
        }

        closeTrim() {
            const popup = document.getElementById('liveLoopTrim');
            if (!this.trimming) {
                if (popup) popup.hidden = true;
                return;
            }
            const loop = this.current();
            const buffer = loop && this.buffers.get(loop.id);
            if (loop && buffer && this.draftTrim) {
                this.state = remember(this.state, loop, this.draftTrim);
                this.persist();
            }
            if (popup) popup.hidden = true;
            this.trimming = false;
            this.drag = null;
            this.draftTrim = null;
            this.stopTrimClock();
            if (this.source) this.playing = true;
            this.syncForm();
        }

        startTrimClock() {
            this.stopTrimClock();
            const tick = () => {
                if (!this.trimming) return;
                const loop = this.current();
                const buffer = loop && this.buffers.get(loop.id);
                if (loop && buffer) this.renderTrim(loop, buffer);
                this.trimFrame = requestAnimationFrame(tick);
            };
            this.trimFrame = requestAnimationFrame(tick);
        }

        stopTrimClock() {
            if (this.trimFrame) cancelAnimationFrame(this.trimFrame);
            this.trimFrame = 0;
        }

        renderTrim(loop, buffer) {
            const canvas = document.getElementById('liveLoopWave');
            const times = document.getElementById('liveLoopTrimTimes');
            if (!canvas || !buffer) return;
            const trim = this.draftTrim || trimOf(this.state, loop, buffer.duration);
            const fraction = this.playFraction();
            const span = Math.max(0.001, trim.end - trim.start);
            const playhead = (trim.start + fraction * span) / buffer.duration;
            drawWave(canvas, this.peaks.get(loop.id) || [], trim, buffer.duration, playhead);
            if (times) times.textContent = `${formatSeconds(trim.start)} – ${formatSeconds(trim.end)} at original speed`;
        }

        pointerTime(event, duration) {
            const canvas = document.getElementById('liveLoopWave');
            const rect = canvas.getBoundingClientRect();
            const x = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
            return { x, width: rect.width, time: rect.width ? (x / rect.width) * duration : 0 };
        }

        onTrimPointerDown(event) {
            const loop = this.current();
            const buffer = loop && this.buffers.get(loop.id);
            if (!loop || !buffer) return;
            event.preventDefault();
            const canvas = event.currentTarget;
            canvas.setPointerCapture(event.pointerId);
            const trim = this.draftTrim || trimOf(this.state, loop, buffer.duration);
            const point = this.pointerTime(event, buffer.duration);
            let kind = trimGesture(point.x, point.width, trim.start, trim.end, buffer.duration);
            const drag = { kind, offset: 0, span: trim.end - trim.start };
            if (kind === 'move') drag.offset = point.time - trim.start;
            if (kind === 'new') {
                kind = 'end';
                drag.kind = 'end';
                this.draftTrim = clampTrim(point.time, point.time, buffer.duration);
            } else {
                this.draftTrim = trim;
            }
            this.drag = drag;
            this.renderTrim(loop, buffer);
        }

        onTrimPointerMove(event) {
            if (!this.drag) return;
            const loop = this.current();
            const buffer = loop && this.buffers.get(loop.id);
            if (!loop || !buffer || !this.draftTrim) return;
            const point = this.pointerTime(event, buffer.duration);
            this.draftTrim = applyTrimDrag(this.drag.kind, point.time, buffer.duration, this.draftTrim, this.drag);
            this.renderTrim(loop, buffer);
        }

        onTrimPointerUp(event) {
            if (!this.drag) return;
            const canvas = document.getElementById('liveLoopWave');
            if (canvas && canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
            this.drag = null;
            const loop = this.current();
            const buffer = loop && this.buffers.get(loop.id);
            if (!loop || !buffer || !this.draftTrim) return;
            this.state = remember(this.state, loop, this.draftTrim);
            this.persist();
            this.setTrimStatus('Trim saved. This selection keeps playing when you close.');
            this.renderTrim(loop, buffer);
            this.restartKeepingToken(loop, buffer);
        }

        restartKeepingToken(loop, buffer) {
            if (!this.active || (!this.playing && !this.trimming)) return;
            this.playToken += 1;
            const token = this.playToken;
            this.stopSource();
            this.schedule(loop, buffer, token, 0);
        }

        setTrimStatus(text) {
            const status = document.getElementById('liveLoopTrimStatus');
            if (status) status.textContent = text;
        }

        persist() {
            saveState(this.storage, this.state);
        }
    }

    LiveLoops.LOOPS = LOOPS;
    LiveLoops.loopById = loopById;
    LiveLoops.clampSpeed = clampSpeed;
    LiveLoops.playbackSpeed = playbackSpeed;
    LiveLoops.speedOf = speedOf;
    LiveLoops.stretchChannels = stretchChannels;
    LiveLoops.clampTrim = clampTrim;
    LiveLoops.loadState = loadState;
    LiveLoops.saveState = saveState;
    LiveLoops.trimOf = trimOf;
    LiveLoops.remember = remember;
    LiveLoops.peaksFromChannel = peaksFromChannel;
    LiveLoops.trimGesture = trimGesture;
    LiveLoops.applyTrimDrag = applyTrimDrag;

    return LiveLoops;
}));
