(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.BeatMaker = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    const STORAGE_KEY = 'chordAnnotatorBeats';
    const STEPS_PER_BAR = 16;
    const PAD_COUNT = 16;

    const SOUNDS = [
        { id: '808-kick', name: '808 Kick', group: 'Kick', file: 'drums/808-kick.wav', choke: '', gain: 1 },
        { id: '808-kick-long', name: '808 Boom', group: 'Kick', file: 'drums/808-kick-long.wav', choke: '', gain: 1 },
        { id: 'kit-kick', name: 'Kick', group: 'Kick', file: 'drums/kit-kick.wav', choke: '', gain: 1 },
        { id: '808-snare', name: '808 Snare', group: 'Snare', file: 'drums/808-snare.wav', choke: '', gain: 0.9 },
        { id: 'kit-snare', name: 'Snare', group: 'Snare', file: 'drums/kit-snare.wav', choke: '', gain: 0.9 },
        { id: 'kit-stick', name: 'Stick', group: 'Snare', file: 'drums/kit-stick.wav', choke: '', gain: 0.85 },
        { id: '808-clap', name: 'Clap', group: 'Snare', file: 'drums/808-clap.wav', choke: '', gain: 0.85 },
        { id: '808-hat', name: '808 Hat', group: 'Hat', file: 'drums/808-hat.wav', choke: 'hat-808', gain: 0.55 },
        { id: '808-hat-open', name: '808 Open Hat', group: 'Hat', file: 'drums/808-hat-open.wav', choke: 'hat-808', gain: 0.5 },
        { id: 'kit-hat', name: 'Hat', group: 'Hat', file: 'drums/kit-hat.wav', choke: 'hat-kit', gain: 0.55 },
        { id: 'kit-hat-open', name: 'Open Hat', group: 'Hat', file: 'drums/kit-hat-open.wav', choke: 'hat-kit', gain: 0.48 },
        { id: '808-tom', name: '808 Tom', group: 'Percussion', file: 'drums/808-tom.wav', choke: '', gain: 0.9 },
        { id: 'kit-tom', name: 'Tom', group: 'Percussion', file: 'drums/kit-tom.wav', choke: '', gain: 0.9 },
        { id: '808-rim', name: 'Rim', group: 'Percussion', file: 'drums/808-rim.wav', choke: '', gain: 0.7 },
        { id: '808-cowbell', name: 'Cowbell', group: 'Percussion', file: 'drums/808-cowbell.wav', choke: '', gain: 0.62 },
        { id: '808-maracas', name: 'Maracas', group: 'Percussion', file: 'drums/808-maracas.wav', choke: '', gain: 0.55 }
    ];

    const SOUND_BY_ID = new Map(SOUNDS.map((sound) => [sound.id, sound]));
    const DEFAULT_PADS = [
        '808-kick', '808-snare', '808-hat', '808-clap',
        '808-kick-long', 'kit-snare', '808-hat-open', '808-cowbell',
        'kit-kick', 'kit-stick', 'kit-hat', '808-rim',
        'kit-tom', '808-tom', 'kit-hat-open', '808-maracas'
    ];

    function soundById(id) {
        return SOUND_BY_ID.get(id) || null;
    }

    function clampBpm(value) {
        const bpm = Math.round(Number(value));
        if (!Number.isFinite(bpm)) return 96;
        return Math.min(200, Math.max(60, bpm));
    }

    function barsOf(value) {
        return Number(value) === 2 ? 2 : 1;
    }

    function totalSteps(bars) {
        return STEPS_PER_BAR * barsOf(bars);
    }

    function stepDuration(bpm) {
        return 60 / clampBpm(bpm) / 4;
    }

    function mod(value, length) {
        if (!length) return 0;
        return ((value % length) + length) % length;
    }

    function quantizeStep(elapsedSteps, bars) {
        const total = totalSteps(bars);
        if (!Number.isFinite(elapsedSteps)) return 0;
        if (elapsedSteps < -0.5) return 0;
        return mod(Math.round(elapsedSteps), total);
    }

    function defaultPads() {
        return DEFAULT_PADS.slice();
    }

    function addHit(hits, soundId, step, bars) {
        const total = totalSteps(bars);
        if (!soundById(soundId) || !Number.isInteger(step) || step < 0 || step >= total) return hits.slice();
        if (hits.some((hit) => hit.soundId === soundId && hit.step === step)) return hits.slice();
        return hits.concat([{ soundId, step }]);
    }

    function removeHit(hits, soundId, step) {
        return hits.filter((hit) => !(hit.soundId === soundId && hit.step === step));
    }

    function clearSound(hits, soundId) {
        return hits.filter((hit) => hit.soundId !== soundId);
    }

    function retargetHits(hits, fromId, toId) {
        if (!fromId || !toId || fromId === toId) return hits.slice();
        const next = [];
        const seen = new Set();
        hits.forEach((hit) => {
            const soundId = hit.soundId === fromId ? toId : hit.soundId;
            const key = `${soundId}:${hit.step}`;
            if (seen.has(key)) return;
            seen.add(key);
            next.push({ soundId, step: hit.step });
        });
        return next;
    }

    function trimHits(hits, bars) {
        const total = totalSteps(bars);
        return hits.filter((hit) => hit.step < total);
    }

    function cleanName(value) {
        const name = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        return name || 'Untitled';
    }

    function sanitizeBeat(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const bars = barsOf(source.bars);
        const total = totalSteps(bars);
        const pads = defaultPads();
        if (Array.isArray(source.pads)) {
            source.pads.slice(0, PAD_COUNT).forEach((id, index) => {
                if (soundById(id)) pads[index] = id;
            });
        }
        const hits = [];
        const seen = new Set();
        (Array.isArray(source.hits) ? source.hits : []).forEach((hit) => {
            if (!hit || !soundById(hit.soundId)) return;
            const step = Number(hit.step);
            if (!Number.isInteger(step) || step < 0 || step >= total) return;
            const key = `${hit.soundId}:${step}`;
            if (seen.has(key)) return;
            seen.add(key);
            hits.push({ soundId: hit.soundId, step });
        });
        return {
            id: typeof source.id === 'string' ? source.id : '',
            name: cleanName(source.name),
            bpm: clampBpm(source.bpm),
            bars,
            pads,
            hits
        };
    }

    function emptyBeat() {
        return sanitizeBeat({ name: 'Beat 1', bpm: 96, bars: 1, pads: defaultPads(), hits: [] });
    }

    class BeatMaker {
        constructor() {
            this.library = [];
            this.draft = emptyBeat();
            this.playing = false;
            this.recording = false;
            this.bound = false;
            this.buffers = new Map();
            this.loading = null;
            this.voices = [];
            this.timer = 0;
            this.step = 0;
            this.stepDur = stepDuration(96);
            this.nextStepTime = 0;
            this.anchorTime = 0;
            this.anchorStep = 0;
            this.presses = new Map();
            this.flashTimers = [];
            this.sheetPad = -1;
            this.confirming = '';
            this.confirmTimer = 0;
            this.padEls = [];
            this.restore();
        }

        restore() {
            const data = this.readStore();
            this.library = (data.beats || []).map((beat) => sanitizeBeat(beat));
            this.draft = data.draft ? sanitizeBeat(data.draft) : emptyBeat();
            this.stepDur = stepDuration(this.draft.bpm);
        }

        readStore() {
            try {
                if (typeof localStorage === 'undefined') return {};
                const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch {
                return {};
            }
        }

        persist() {
            try {
                if (typeof localStorage === 'undefined') return;
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    beats: this.library,
                    draft: this.draft
                }));
            } catch {
                const status = document.getElementById('beatsStatus');
                if (status) status.textContent = 'Could not save on this device.';
            }
        }

        enter() {
            this.bind();
            this.render();
            this.loadSounds();
        }

        leave() {
            this.recording = false;
            this.stopPlayback();
            this.closeSheet();
            this.clearConfirm();
            this.syncTransport();
        }

        bind() {
            if (this.bound) return;
            this.bound = true;
            const on = (id, event, handler) => {
                const el = document.getElementById(id);
                if (el) el.addEventListener(event, handler);
            };
            on('beatsPlayBtn', 'click', () => this.togglePlay());
            on('beatsRecordBtn', 'click', () => this.toggleRecord());
            on('beatsBarsBtn', 'click', () => this.toggleBars());
            on('beatsClearBtn', 'click', () => this.clearLoop());
            on('beatsSaveBtn', 'click', () => this.saveBeat());
            on('beatsDeleteBtn', 'click', () => this.deleteBeat());
            on('beatsBpm', 'change', (event) => this.setBpm(event.target.value));
            on('beatsName', 'input', (event) => {
                this.draft.name = String(event.target.value || '').slice(0, 40);
                this.persist();
            });
            on('beatsLibrary', 'change', (event) => this.loadBeat(event.target.value));
            on('beatSoundClose', 'click', () => this.closeSheet());
            on('beatClearSound', 'click', () => this.clearPadSound());
            const sheet = document.getElementById('beatSoundSheet');
            if (sheet) {
                sheet.addEventListener('click', (event) => {
                    if (event.target.id === 'beatSoundSheet') this.closeSheet();
                });
            }
            const pads = document.getElementById('beatPads');
            if (pads) {
                pads.addEventListener('pointerdown', (event) => this.onPadDown(event), { passive: false });
                pads.addEventListener('pointermove', (event) => this.onPadMove(event));
                pads.addEventListener('pointerup', (event) => this.onPadUp(event));
                pads.addEventListener('pointercancel', (event) => this.onPadUp(event));
                pads.addEventListener('contextmenu', (event) => event.preventDefault());
            }
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && this.sheetPad >= 0) {
                    event.preventDefault();
                    this.closeSheet();
                }
            });
        }

        render() {
            this.renderPads();
            this.renderSteps();
            this.renderLibrary();
            this.syncTransport();
            const name = document.getElementById('beatsName');
            if (name && name.value !== this.draft.name) name.value = this.draft.name;
            const bpm = document.getElementById('beatsBpm');
            if (bpm) bpm.value = String(this.draft.bpm);
        }

        renderPads() {
            const host = document.getElementById('beatPads');
            if (!host) return;
            host.replaceChildren();
            this.padEls = this.draft.pads.map((soundId, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'beat-pad';
                button.dataset.index = String(index);
                const sound = soundById(soundId);
                const label = document.createElement('span');
                label.className = 'beat-pad-name';
                label.textContent = sound ? sound.name : 'Empty';
                button.appendChild(label);
                button.setAttribute('aria-label', sound ? sound.name : 'Empty pad');
                host.appendChild(button);
                return button;
            });
            this.markPads();
        }

        markPads() {
            const used = new Set(this.draft.hits.map((hit) => hit.soundId));
            this.padEls.forEach((pad, index) => {
                pad.classList.toggle('has-hit', used.has(this.draft.pads[index]));
            });
            this.markSteps();
        }

        renderSteps() {
            const host = document.getElementById('beatsSteps');
            if (!host) return;
            const total = totalSteps(this.draft.bars);
            host.replaceChildren();
            for (let step = 0; step < total; step += 1) {
                const cell = document.createElement('span');
                cell.className = 'beats-step';
                cell.dataset.step = String(step);
                if (step % 4 === 0) cell.classList.add('is-downbeat');
                host.appendChild(cell);
            }
            this.markSteps();
        }

        markSteps() {
            const host = document.getElementById('beatsSteps');
            if (!host) return;
            const filled = new Set(this.draft.hits.map((hit) => hit.step));
            host.querySelectorAll('.beats-step').forEach((cell) => {
                const step = Number(cell.dataset.step);
                cell.classList.toggle('has-hit', filled.has(step));
            });
        }

        renderLibrary() {
            const select = document.getElementById('beatsLibrary');
            if (!select) return;
            select.replaceChildren();
            const fresh = document.createElement('option');
            fresh.value = '';
            fresh.textContent = 'New beat';
            select.appendChild(fresh);
            this.library.forEach((beat) => {
                const option = document.createElement('option');
                option.value = beat.id;
                option.textContent = beat.name;
                select.appendChild(option);
            });
            select.value = this.library.some((beat) => beat.id === this.draft.id) ? this.draft.id : '';
        }

        syncTransport() {
            const play = document.getElementById('beatsPlayBtn');
            const record = document.getElementById('beatsRecordBtn');
            const bars = document.getElementById('beatsBarsBtn');
            if (play) {
                play.textContent = this.playing ? 'Stop' : 'Play';
                play.setAttribute('aria-pressed', this.playing ? 'true' : 'false');
                play.classList.toggle('is-on', this.playing);
            }
            if (record) {
                record.textContent = this.recording ? 'Recording' : 'Record';
                record.setAttribute('aria-pressed', this.recording ? 'true' : 'false');
                record.classList.toggle('is-on', this.recording);
            }
            if (bars) bars.textContent = this.draft.bars === 2 ? '2 bars' : '1 bar';
            const remove = document.getElementById('beatsDeleteBtn');
            if (remove) remove.disabled = !this.draft.id;
            const status = document.getElementById('beatsStatus');
            if (status && !status.dataset.sticky) {
                status.textContent = this.recording
                    ? 'Recording. Tap pads to add them to the loop.'
                    : 'Tap a pad to play. Hold a pad to change its sound.';
            }
        }

        setBpm(value) {
            this.draft.bpm = clampBpm(value);
            this.stepDur = stepDuration(this.draft.bpm);
            const input = document.getElementById('beatsBpm');
            if (input) input.value = String(this.draft.bpm);
            if (this.playing) this.restartPlayback();
            this.persist();
        }

        toggleBars() {
            this.draft.bars = this.draft.bars === 2 ? 1 : 2;
            this.draft.hits = trimHits(this.draft.hits, this.draft.bars);
            this.renderSteps();
            this.markPads();
            this.syncTransport();
            if (this.playing) this.restartPlayback();
            this.persist();
        }

        togglePlay() {
            if (this.playing) {
                this.recording = false;
                this.stopPlayback();
                this.syncTransport();
                return;
            }
            this.startPlayback();
        }

        toggleRecord() {
            this.recording = !this.recording;
            if (this.recording && !this.playing) this.startPlayback();
            else this.syncTransport();
        }

        clearConfirm() {
            this.confirming = '';
            clearTimeout(this.confirmTimer);
        }

        askConfirm(which, button, armedText, action) {
            if (!button) {
                action();
                return;
            }
            if (this.confirming === which) {
                this.clearConfirm();
                button.textContent = button.dataset.label || button.textContent;
                action();
                return;
            }
            this.clearConfirm();
            this.confirming = which;
            if (!button.dataset.label) button.dataset.label = button.textContent;
            button.textContent = armedText;
            this.confirmTimer = setTimeout(() => {
                if (this.confirming === which) {
                    button.textContent = button.dataset.label;
                    this.confirming = '';
                }
            }, 1800);
        }

        clearLoop() {
            const button = document.getElementById('beatsClearBtn');
            this.askConfirm('clear', button, 'Tap again', () => {
                this.draft.hits = [];
                this.markPads();
                this.persist();
            });
        }

        saveBeat() {
            const beat = sanitizeBeat(this.draft);
            if (!beat.id) beat.id = `beat-${Date.now()}`;
            const index = this.library.findIndex((item) => item.id === beat.id);
            if (index >= 0) this.library[index] = beat;
            else this.library.unshift(beat);
            this.draft = sanitizeBeat(beat);
            this.persist();
            this.renderLibrary();
            const status = document.getElementById('beatsStatus');
            if (status) {
                status.dataset.sticky = '1';
                status.textContent = `Saved “${beat.name}” on this device.`;
                setTimeout(() => {
                    if (status.textContent.indexOf('Saved') === 0) {
                        delete status.dataset.sticky;
                        this.syncTransport();
                    }
                }, 1600);
            }
        }

        deleteBeat() {
            if (!this.draft.id) return;
            const button = document.getElementById('beatsDeleteBtn');
            this.askConfirm('delete', button, 'Tap again', () => {
                this.library = this.library.filter((beat) => beat.id !== this.draft.id);
                this.draft = emptyBeat();
                this.draft.name = this.nextName();
                this.stopPlayback();
                this.recording = false;
                this.persist();
                this.render();
            });
        }

        nextName() {
            const used = new Set(this.library.map((beat) => beat.name));
            let n = this.library.length + 1;
            let name = `Beat ${n}`;
            while (used.has(name)) {
                n += 1;
                name = `Beat ${n}`;
            }
            return name;
        }

        loadBeat(id) {
            this.stopPlayback();
            this.recording = false;
            if (!id) {
                this.draft = emptyBeat();
                this.draft.name = this.nextName();
            } else {
                const found = this.library.find((beat) => beat.id === id);
                this.draft = found ? sanitizeBeat(JSON.parse(JSON.stringify(found))) : emptyBeat();
            }
            this.stepDur = stepDuration(this.draft.bpm);
            this.persist();
            this.render();
        }

        audioContext() {
            const app = typeof window !== 'undefined' ? window.app : null;
            if (app && typeof app.unlockAudioContext === 'function') return app.unlockAudioContext();
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return null;
            if (!this._ctx || this._ctx.state === 'closed') this._ctx = new AudioCtx();
            if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
            return this._ctx;
        }

        loadSounds() {
            if (this.loading || this.buffers.size === SOUNDS.length) return this.loading || Promise.resolve();
            const ctx = (window.app && window.app.ensureAudioContext && window.app.ensureAudioContext()) || this.audioContext();
            if (!ctx) return Promise.resolve();
            this.loading = Promise.all(SOUNDS.map((sound) => this.loadOne(ctx, sound))).then(() => {
                const status = document.getElementById('beatsStatus');
                if (this.buffers.size < SOUNDS.length && status) {
                    status.dataset.sticky = '1';
                    status.textContent = 'Some sounds could not load.';
                }
            });
            return this.loading;
        }

        decode(ctx, arrayBuffer) {
            const data = arrayBuffer.slice(0);
            if (ctx.decodeAudioData.length === 1) return ctx.decodeAudioData(data);
            return new Promise((resolve, reject) => {
                ctx.decodeAudioData(data, resolve, reject);
            });
        }

        loadOne(ctx, sound) {
            if (this.buffers.has(sound.id)) return Promise.resolve();
            return fetch(sound.file)
                .then((response) => {
                    if (!response.ok) throw new Error('missing sample');
                    return response.arrayBuffer();
                })
                .then((data) => this.decode(ctx, data))
                .then((buffer) => {
                    this.buffers.set(sound.id, buffer);
                })
                .catch(() => {});
        }

        startPlayback() {
            const ctx = this.audioContext();
            if (!ctx) return;
            this.loadSounds();
            this.playing = true;
            this.stepDur = stepDuration(this.draft.bpm);
            this.step = 0;
            this.nextStepTime = ctx.currentTime + 0.06;
            this.anchorTime = this.nextStepTime;
            this.anchorStep = 0;
            this.stopVoices();
            clearInterval(this.timer);
            this.timer = setInterval(() => this.schedule(), 25);
            this.schedule();
            this.syncTransport();
        }

        restartPlayback() {
            const recording = this.recording;
            this.stopPlayback();
            this.recording = recording;
            this.startPlayback();
        }

        stopPlayback() {
            this.playing = false;
            clearInterval(this.timer);
            this.timer = 0;
            this.flashTimers.forEach((id) => clearTimeout(id));
            this.flashTimers = [];
            this.stopVoices();
            document.querySelectorAll('.beats-step.is-current').forEach((cell) => cell.classList.remove('is-current'));
        }

        schedule() {
            const ctx = this.audioContext();
            if (!ctx || !this.playing) return;
            const total = totalSteps(this.draft.bars);
            const horizon = ctx.currentTime + 0.12;
            if (this.nextStepTime < ctx.currentTime - 0.08) {
                const missed = Math.ceil((ctx.currentTime - this.nextStepTime) / this.stepDur);
                this.nextStepTime += missed * this.stepDur;
                this.step = mod(this.step + missed, total);
            }
            while (this.nextStepTime < horizon) {
                this.fireStep(this.step, this.nextStepTime);
                this.nextStepTime += this.stepDur;
                this.step = mod(this.step + 1, total);
            }
            this.paintPlayhead(ctx, total);
        }

        paintPlayhead(ctx, total) {
            const elapsed = (ctx.currentTime - this.anchorTime) / this.stepDur + this.anchorStep;
            const visual = mod(Math.floor(elapsed + 0.0001), total);
            const host = document.getElementById('beatsSteps');
            if (!host) return;
            host.querySelectorAll('.beats-step').forEach((cell) => {
                cell.classList.toggle('is-current', Number(cell.dataset.step) === visual);
            });
        }

        fireStep(step, when) {
            this.draft.hits.forEach((hit) => {
                if (hit.step !== step) return;
                this.trigger(hit.soundId, when);
                this.draft.pads.forEach((soundId, index) => {
                    if (soundId === hit.soundId) this.scheduleFlash(index, when);
                });
            });
        }

        scheduleFlash(index, when) {
            const ctx = this.audioContext();
            const delay = ctx ? Math.max(0, (when - ctx.currentTime) * 1000) : 0;
            const id = setTimeout(() => this.flash(index), delay);
            this.flashTimers.push(id);
        }

        trigger(soundId, when) {
            const sound = soundById(soundId);
            const ctx = this.audioContext();
            const buffer = this.buffers.get(soundId);
            if (!sound || !ctx || !buffer) return;
            if (sound.choke) this.stopChoke(sound.choke, when);
            const source = ctx.createBufferSource();
            const gain = ctx.createGain();
            source.buffer = buffer;
            gain.gain.setValueAtTime(sound.gain, when);
            source.connect(gain);
            gain.connect(ctx.destination);
            try {
                source.start(when);
            } catch {
                return;
            }
            const voice = { source, gain, choke: sound.choke };
            this.voices.push(voice);
            source.onended = () => {
                this.voices = this.voices.filter((item) => item !== voice);
            };
        }

        stopChoke(group, when) {
            this.voices.forEach((voice) => {
                if (voice.choke !== group) return;
                try {
                    voice.gain.gain.cancelScheduledValues(when);
                    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.001), when);
                    voice.gain.gain.exponentialRampToValueAtTime(0.001, when + 0.03);
                    voice.source.stop(when + 0.04);
                } catch {
                    /* already stopped */
                }
            });
        }

        stopVoices() {
            const ctx = window.app && window.app.audioContext;
            const when = ctx ? ctx.currentTime : 0;
            this.voices.forEach((voice) => {
                try { voice.source.stop(when); } catch { /* already stopped */ }
            });
            this.voices = [];
        }

        flash(index) {
            const pad = this.padEls[index];
            if (!pad) return;
            pad.classList.add('is-lit');
            clearTimeout(pad._litTimer);
            pad._litTimer = setTimeout(() => pad.classList.remove('is-lit'), 120);
        }

        onPadDown(event) {
            const pad = event.target.closest('.beat-pad');
            if (!pad || event.button) return;
            event.preventDefault();
            const index = Number(pad.dataset.index);
            if (pad.setPointerCapture) {
                try { pad.setPointerCapture(event.pointerId); } catch { /* already captured */ }
            }
            pad.classList.add('is-down');
            const recorded = this.playPad(index);
            const timer = setTimeout(() => this.openSheet(index, event.pointerId), 520);
            this.presses.set(event.pointerId, { index, timer, x: event.clientX, y: event.clientY, recorded });
        }

        onPadMove(event) {
            const press = this.presses.get(event.pointerId);
            if (!press || !press.timer) return;
            if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 18) {
                clearTimeout(press.timer);
                press.timer = 0;
            }
        }

        onPadUp(event) {
            const press = this.presses.get(event.pointerId);
            if (!press) return;
            this.presses.delete(event.pointerId);
            clearTimeout(press.timer);
            const pad = this.padEls[press.index];
            if (pad) pad.classList.remove('is-down');
            if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 18) return;
        }

        playPad(index, commit) {
            const soundId = this.draft.pads[index];
            const ctx = this.audioContext();
            if (!ctx || !soundId) return null;
            this.loadSounds();
            const shouldRecord = commit !== false && this.recording;
            if (shouldRecord && !this.playing) this.startPlayback();
            const when = shouldRecord ? Math.max(ctx.currentTime, this.anchorTime || ctx.currentTime) : ctx.currentTime;
            this.trigger(soundId, when);
            this.flash(index);
            if (!shouldRecord) return null;
            const elapsed = (when - this.anchorTime) / this.stepDur + this.anchorStep;
            const step = quantizeStep(elapsed, this.draft.bars);
            const before = this.draft.hits.length;
            this.draft.hits = addHit(this.draft.hits, soundId, step, this.draft.bars);
            if (this.draft.hits.length === before) return null;
            this.markPads();
            this.persist();
            return { soundId, step };
        }

        openSheet(index, pointerId) {
            const press = pointerId == null ? null : this.presses.get(pointerId);
            if (press && press.recorded) {
                this.draft.hits = removeHit(this.draft.hits, press.recorded.soundId, press.recorded.step);
                press.recorded = null;
                this.markPads();
                this.persist();
            }
            this.sheetPad = index;
            const sheet = document.getElementById('beatSoundSheet');
            const title = document.getElementById('beatSoundTitle');
            const list = document.getElementById('beatSoundList');
            if (!sheet || !list) return;
            const current = this.draft.pads[index];
            if (title) title.textContent = 'Choose a sound';
            list.replaceChildren();
            let lastGroup = '';
            SOUNDS.forEach((sound) => {
                if (sound.group !== lastGroup) {
                    lastGroup = sound.group;
                    const heading = document.createElement('p');
                    heading.className = 'beat-sound-group';
                    heading.textContent = sound.group;
                    list.appendChild(heading);
                }
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'beat-sound-option';
                button.textContent = sound.name;
                button.setAttribute('aria-pressed', sound.id === current ? 'true' : 'false');
                button.addEventListener('click', () => this.assignSound(index, sound.id));
                list.appendChild(button);
            });
            sheet.hidden = false;
        }

        assignSound(index, soundId) {
            if (!soundById(soundId)) return;
            const previous = this.draft.pads[index];
            const shared = this.draft.pads.some((id, pad) => pad !== index && id === previous);
            this.draft.pads[index] = soundId;
            if (!shared) this.draft.hits = retargetHits(this.draft.hits, previous, soundId);
            this.closeSheet();
            this.renderPads();
            this.persist();
            this.playPad(index, false);
        }

        clearPadSound() {
            if (this.sheetPad < 0) return;
            const soundId = this.draft.pads[this.sheetPad];
            this.draft.hits = clearSound(this.draft.hits, soundId);
            this.closeSheet();
            this.markPads();
            this.persist();
        }

        closeSheet() {
            this.sheetPad = -1;
            const sheet = document.getElementById('beatSoundSheet');
            if (sheet) sheet.hidden = true;
        }
    }

    BeatMaker.SOUNDS = SOUNDS;
    BeatMaker.sanitizeBeat = sanitizeBeat;
    BeatMaker.quantizeStep = quantizeStep;
    BeatMaker.addHit = addHit;
    BeatMaker.removeHit = removeHit;
    BeatMaker.clearSound = clearSound;
    BeatMaker.trimHits = trimHits;
    BeatMaker.retargetHits = retargetHits;
    BeatMaker.totalSteps = totalSteps;
    BeatMaker.stepDuration = stepDuration;
    BeatMaker.clampBpm = clampBpm;
    BeatMaker.emptyBeat = emptyBeat;
    BeatMaker.defaultPads = defaultPads;

    return BeatMaker;
}));
