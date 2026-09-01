// Music Chord Annotator App
class ChordAnnotatorApp {
    constructor() {
        this.songs = [];
        this.currentSong = null;
        this.currentView = 'songList';
        this.editingIndex = -1;
        this.chordColors = {};
        this.nextColorIndex = 0;

        this.pendingEdit = null;
        this.draggingHandle = null;
        this.splitMode = false;
        this.eraseMode = false;
        this.draggingSplit = null;
        this.ignoreSplitClick = false;
        this.history = [];
        this.historyIndex = -1;
        this.lastSelectionAt = 0;
        this.ignoreAnnotationClick = false;

        // Evenly spaced hues so neighboring assignments stay easy to tell apart.
        this.colorPalette = [
            '#0EA5E9',
            '#F59E0B',
            '#EC4899',
            '#16A34A',
            '#6366F1',
            '#0D9488',
            '#E11D48',
            '#EA580C',
            '#2563EB',
            '#A855F7',
            '#65A30D',
            '#F43F5E',
            '#0891B2',
            '#D97706',
            '#7C3AED'
        ];
        this.highlightAlpha = { light: 0.1, dark: 0.14 };

        this.rootLetters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
        this.chordQualities = [
            '', 'm', '7', 'm7', 'maj7', '6', 'm6',
            '9', 'm9', 'maj9', 'add9', 'madd9', 'add11', 'add4',
            'sus2', 'sus4', 'sus', '7sus4', '9sus4',
            'dim', 'dim7', 'm7b5', 'aug',
            '5', '11', '13', 'm11', 'm13',
            '7b9', '7#9', '7b5', '7#5', 'maj7#11'
        ];
        this.allChords = this.buildChordCatalog();
        this.scaleOptions = {
            major: MusicTheory.PREFERRED_MAJOR.slice(),
            minor: MusicTheory.PREFERRED_MINOR.slice()
        };

        this.github = {
            owner: 'mhmdcg',
            repo: 'Chord',
            path: 'songs-data.json',
            branch: 'main'
        };
        this.githubSha = null;
        this.localUpdatedAt = null;
        this.githubPushTimer = null;
        this.githubPushInFlight = false;
        this.githubPushQueued = false;
        this.syncState = 'loading';

        this.init();
    }

    init() {
        this.loadLocalCache();
        this.setupEventListeners();
        this.populateScaleSelect();
        this.renderSongList();
        this.updateSyncBanner();
        this.refreshFromGithub();
    }

    setupEventListeners() {
        document.getElementById('newSongBtn').addEventListener('click', () => this.createNewSong());
        document.getElementById('allChordsBtn').addEventListener('click', () => this.showView('allChords'));
        document.getElementById('backFromAllChordsBtn').addEventListener('click', () => this.showView('songList'));
        document.getElementById('syncSettingsBtn').addEventListener('click', () => this.toggleSyncPanel());
        document.getElementById('syncBanner').addEventListener('click', () => {
            if (this.syncState === 'needs-token') this.toggleSyncPanel();
        });
        document.getElementById('saveGithubTokenBtn').addEventListener('click', () => this.saveGithubToken());
        document.getElementById('githubTokenInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.saveGithubToken();
        });
        document.getElementById('backToListBtn').addEventListener('click', () => this.showView('songList'));
        document.getElementById('backToEditorBtn').addEventListener('click', () => this.finishAnnotation());

        document.getElementById('saveEditorBtn').addEventListener('click', () => this.saveSong());
        document.getElementById('proceedToAnnotateBtn').addEventListener('click', () => this.proceedToAnnotation());
        document.getElementById('alignLeftBtn').addEventListener('click', () => this.setTextAlign('left'));
        document.getElementById('alignRightBtn').addEventListener('click', () => this.setTextAlign('right'));

        document.getElementById('doneAnnotatingBtn').addEventListener('click', () => this.finishAnnotation());
        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('redoBtn').addEventListener('click', () => this.redo());
        document.getElementById('songScale').addEventListener('change', () => this.onScaleSelectChange());
        document.getElementById('transposeUpBtn').addEventListener('click', () => this.transposeSong(1));
        document.getElementById('transposeDownBtn').addEventListener('click', () => this.transposeSong(-1));
        document.getElementById('scaleMajorBtn').addEventListener('click', () => this.setScaleMode('major'));
        document.getElementById('scaleMinorBtn').addEventListener('click', () => this.setScaleMode('minor'));
        document.getElementById('lockChordsBtn').addEventListener('click', () => this.toggleChordsLock());
        document.getElementById('splitModeBtn').addEventListener('click', () => this.toggleSplitMode());
        document.getElementById('eraseSplitsBtn').addEventListener('click', () => this.toggleEraseMode());
        document.getElementById('timeTop').addEventListener('input', () => this.updateLyricsMetaPreview());
        document.getElementById('timeTop').addEventListener('change', () => this.saveSongMeta());
        document.getElementById('timeBottom').addEventListener('input', () => this.updateLyricsMetaPreview());
        document.getElementById('timeBottom').addEventListener('change', () => this.saveSongMeta());
        document.getElementById('songTempo').addEventListener('input', () => this.updateLyricsMetaPreview());
        document.getElementById('songTempo').addEventListener('change', () => this.saveSongMeta());
        document.getElementById('deleteAllChordsBtn').addEventListener('click', () => this.deleteAllChords());
        document.getElementById('exportLyricsBtn').addEventListener('click', () => this.exportLyricsImage());
        document.getElementById('exportLyricsVideoBtn').addEventListener('click', () => this.exportLyricsVideo());
        document.getElementById('lyricThemeLightBtn').addEventListener('click', () => this.setLyricTheme('light'));
        document.getElementById('lyricThemeDarkBtn').addEventListener('click', () => this.setLyricTheme('dark'));

        const lyricsDisplay = document.getElementById('lyricsDisplay');
        lyricsDisplay.addEventListener('mousedown', (e) => {
            if (this.splitMode || this.eraseMode || e.target.closest('.lyric-split')) e.preventDefault();
        });
        lyricsDisplay.addEventListener('pointerdown', (e) => this.handleSplitPointerDown(e));
        lyricsDisplay.addEventListener('click', (e) => this.handleLyricsClick(e));
        lyricsDisplay.addEventListener('scroll', () => this.positionLyricOverlays());
        document.addEventListener('pointermove', (e) => this.handleSplitPointerMove(e));
        document.addEventListener('pointerup', (e) => this.handleSplitPointerUp(e));
        document.addEventListener('pointercancel', (e) => this.handleSplitPointerUp(e));

        document.getElementById('cancelChordBtn').addEventListener('click', () => this.closeChordModal());
        document.getElementById('saveChordBtn').addEventListener('click', () => this.saveChord());
        document.getElementById('removeChordBtn').addEventListener('click', () => this.removePendingChord());
        document.getElementById('chordInput').addEventListener('input', (e) => {
            if (this.pendingEdit) {
                this.pendingEdit.chord = e.target.value;
            }
            this.updateChordSuggestions();
        });
        document.getElementById('chordInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveChord();
        });

        this.bindHandle('startHandle', 'start');
        this.bindHandle('endHandle', 'end');

        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        window.addEventListener('scroll', () => {
            this.positionHandles();
            this.positionLyricOverlays();
        }, true);
        window.addEventListener('resize', () => {
            this.positionHandles();
            this.positionLyricOverlays();
        });
    }

    bindHandle(id, which) {
        const handle = document.getElementById(id);

        const onPointerDown = (e) => {
            if (!this.pendingEdit) return;
            e.preventDefault();
            e.stopPropagation();
            this.draggingHandle = which;
            handle.classList.add('dragging');
            document.getElementById('lyricsDisplay').classList.add('dragging');
            if (handle.setPointerCapture && e.pointerId != null) {
                handle.setPointerCapture(e.pointerId);
            }
        };

        const onPointerMove = (e) => {
            if (this.draggingHandle !== which) return;
            e.preventDefault();
            this.adjustSelectionFromPoint(e.clientX, e.clientY);
        };

        const onPointerUp = (e) => {
            if (this.draggingHandle !== which) return;
            e.preventDefault();
            this.draggingHandle = null;
            handle.classList.remove('dragging');
            document.getElementById('lyricsDisplay').classList.remove('dragging');
            this.ignoreAnnotationClick = true;
            setTimeout(() => { this.ignoreAnnotationClick = false; }, 300);
        };

        handle.addEventListener('pointerdown', onPointerDown);
        handle.addEventListener('pointermove', onPointerMove);
        handle.addEventListener('pointerup', onPointerUp);
        handle.addEventListener('pointercancel', onPointerUp);

        handle.addEventListener('touchstart', (e) => {
            if (!this.pendingEdit) return;
            e.preventDefault();
            e.stopPropagation();
            const touch = e.changedTouches[0];
            this.draggingHandle = which;
            handle.classList.add('dragging');
            document.getElementById('lyricsDisplay').classList.add('dragging');
            this._touchHandle = which;
            this._lastTouch = touch;
        }, { passive: false });

        handle.addEventListener('touchmove', (e) => {
            if (this.draggingHandle !== which) return;
            e.preventDefault();
            const touch = e.changedTouches[0];
            this.adjustSelectionFromPoint(touch.clientX, touch.clientY);
        }, { passive: false });

        handle.addEventListener('touchend', (e) => {
            if (this.draggingHandle !== which) return;
            e.preventDefault();
            this.draggingHandle = null;
            handle.classList.remove('dragging');
            document.getElementById('lyricsDisplay').classList.remove('dragging');
            this.ignoreAnnotationClick = true;
            setTimeout(() => { this.ignoreAnnotationClick = false; }, 300);
        }, { passive: false });
    }

    handleKeydown(e) {
        if (this.currentView !== 'annotation') return;
        const key = e.key.toLowerCase();
        if ((e.metaKey || e.ctrlKey) && key === 'z') {
            e.preventDefault();
            if (e.shiftKey) this.redo();
            else this.undo();
        } else if ((e.metaKey || e.ctrlKey) && key === 'y') {
            e.preventDefault();
            this.redo();
        } else if (e.key === 'Escape' && this.pendingEdit) {
            this.closeChordModal();
        }
    }

    showView(viewName) {
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));

        if (viewName === 'songList') {
            this.closeChordModal();
            document.getElementById('songListView').classList.add('active');
            this.renderSongList();
        } else if (viewName === 'allChords') {
            this.closeChordModal();
            document.getElementById('allChordsView').classList.add('active');
            this.renderAllChords();
        } else if (viewName === 'editor') {
            this.closeChordModal();
            document.getElementById('editorView').classList.add('active');
            this.applyTextAlign();
        } else if (viewName === 'annotation') {
            document.getElementById('annotationView').classList.add('active');
            this.setSplitMode(false);
            this.setEraseMode(false);
            this.ensureSplits();
            this.initHistory();
            this.renderAnnotationView();
        }

        this.currentView = viewName;
    }

    createNewSong() {
        this.editingIndex = -1;
        this.currentSong = {
            title: '',
            artist: '',
            lyrics: '',
            annotations: [],
            textAlign: 'left',
            scale: '',
            timeTop: 4,
            timeBottom: 4,
            tempo: '',
            lyricTheme: 'light',
            chordsLocked: false,
            splits: [],
            createdAt: new Date().toISOString()
        };

        document.getElementById('editorTitle').textContent = 'New Song';
        document.getElementById('songTitle').value = '';
        document.getElementById('songArtist').value = '';
        document.getElementById('songLyrics').value = '';
        this.applyTextAlign();

        this.showView('editor');
    }

    editSong(index) {
        this.editingIndex = index;
        this.currentSong = JSON.parse(JSON.stringify(this.songs[index]));

        document.getElementById('editorTitle').textContent = 'Edit Song';
        document.getElementById('songTitle').value = this.currentSong.title;
        document.getElementById('songArtist').value = this.currentSong.artist || '';
        document.getElementById('songLyrics').value = this.currentSong.lyrics;
        this.applyTextAlign();

        this.showView('editor');
    }

    saveSong() {
        const title = document.getElementById('songTitle').value.trim();
        const lyrics = document.getElementById('songLyrics').value.trim();

        if (!title) {
            alert('Please enter a song title');
            return;
        }

        if (!lyrics) {
            alert('Please enter song lyrics');
            return;
        }

        this.currentSong.title = title;
        this.currentSong.artist = document.getElementById('songArtist').value.trim();
        this.currentSong.lyrics = lyrics;
        this.currentSong.textAlign = this.getSongTextAlign(this.currentSong);

        if (this.editingIndex >= 0) {
            this.songs[this.editingIndex] = this.currentSong;
        } else {
            this.songs.push(this.currentSong);
            this.editingIndex = this.songs.length - 1;
        }

        this.saveData();
        this.showView('songList');
    }

    deleteSong(index) {
        if (confirm('Are you sure you want to delete this song?')) {
            this.songs.splice(index, 1);
            this.saveData();
            this.renderSongList();
        }
    }

    proceedToAnnotation() {
        const title = document.getElementById('songTitle').value.trim();
        const lyrics = document.getElementById('songLyrics').value.trim();

        if (!title || !lyrics) {
            alert('Please enter both title and lyrics before adding chords');
            return;
        }

        this.currentSong.title = title;
        this.currentSong.artist = document.getElementById('songArtist').value.trim();
        this.currentSong.lyrics = lyrics;
        this.currentSong.textAlign = this.getSongTextAlign(this.currentSong);

        if (!this.currentSong.annotations) {
            this.currentSong.annotations = [];
        }

        this.showView('annotation');
    }

    initHistory() {
        this.history = [this.snapshotSongState()];
        this.historyIndex = 0;
        this.updateUndoRedoButtons();
    }

    snapshotSongState() {
        return {
            annotations: JSON.parse(JSON.stringify(this.currentSong.annotations || [])),
            splits: [...this.getSplits()],
            scale: this.currentSong.scale || '',
            recentChords: [...(this.currentSong.recentChords || [])]
        };
    }

    historyEntry(entry) {
        if (Array.isArray(entry)) {
            return { annotations: entry, splits: this.getSplits(), scale: this.currentSong?.scale || '' };
        }
        return entry;
    }

    applySongState(state) {
        const entry = this.historyEntry(state);
        this.currentSong.annotations = JSON.parse(JSON.stringify(entry.annotations || []));
        if (Array.isArray(entry.splits)) {
            this.currentSong.splits = [...entry.splits];
        }
        this.currentSong.scale = entry.scale || '';
        if (Array.isArray(entry.recentChords)) {
            this.currentSong.recentChords = [...entry.recentChords];
        }
        this.normalizeSplits();
    }

    commitAnnotations(annotations) {
        this.commitSongState({ annotations });
    }

    commitSongState(patch = {}) {
        if (patch.annotations) this.currentSong.annotations = patch.annotations;
        if (patch.splits) this.currentSong.splits = patch.splits;
        this.normalizeSplits();
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(this.snapshotSongState());
        this.historyIndex++;
        this.updateUndoRedoButtons();
        this.persistCurrentSong();
    }

    persistCurrentSong() {
        if (this.editingIndex >= 0 && this.currentSong) {
            this.songs[this.editingIndex] = this.currentSong;
            this.saveData();
        }
        this.updateLyricsMetaPreview();
    }

    undo() {
        if (this.historyIndex <= 0) return;
        this.closeChordModal();
        this.historyIndex--;
        this.applySongState(this.history[this.historyIndex]);
        this.persistCurrentSong();
        this.renderAnnotationView();
        this.updateUndoRedoButtons();
    }

    redo() {
        if (this.historyIndex >= this.history.length - 1) return;
        this.closeChordModal();
        this.historyIndex++;
        this.applySongState(this.history[this.historyIndex]);
        this.persistCurrentSong();
        this.renderAnnotationView();
        this.updateUndoRedoButtons();
    }

    updateUndoRedoButtons() {
        document.getElementById('undoBtn').disabled = this.historyIndex <= 0;
        document.getElementById('redoBtn').disabled = this.historyIndex >= this.history.length - 1;
    }

    getSongTextAlign(song) {
        if (!song) return 'left';
        if (song.textAlign === 'right' || song.textAlign === 'left') {
            return song.textAlign;
        }
        return /[\u0600-\u06FF]/.test(song.lyrics || '') ? 'right' : 'left';
    }

    setTextAlign(align) {
        if (!this.currentSong) {
            this.currentSong = { textAlign: align, annotations: [] };
        }
        this.currentSong.textAlign = align === 'right' ? 'right' : 'left';
        this.applyTextAlign();
    }

    applyTextAlign() {
        const align = this.getSongTextAlign(this.currentSong);
        const textarea = document.getElementById('songLyrics');
        const display = document.getElementById('lyricsDisplay');
        const leftBtn = document.getElementById('alignLeftBtn');
        const rightBtn = document.getElementById('alignRightBtn');

        textarea.classList.toggle('align-left', align === 'left');
        textarea.classList.toggle('align-right', align === 'right');

        display.classList.toggle('align-left', align === 'left');
        display.classList.toggle('align-right', align === 'right');
        display.classList.toggle('rtl', align === 'right');

        leftBtn.classList.toggle('active', align === 'left');
        rightBtn.classList.toggle('active', align === 'right');
        leftBtn.setAttribute('aria-pressed', align === 'left' ? 'true' : 'false');
        rightBtn.setAttribute('aria-pressed', align === 'right' ? 'true' : 'false');
    }

    getLyricTheme() {
        return this.currentSong?.lyricTheme === 'dark' ? 'dark' : 'light';
    }

    setLyricTheme(theme) {
        if (!this.currentSong) return;
        this.currentSong.lyricTheme = theme === 'dark' ? 'dark' : 'light';
        this.applyLyricTheme();
        this.persistCurrentSong();
    }

    applyLyricTheme() {
        const theme = this.getLyricTheme();
        const display = document.getElementById('lyricsDisplay');
        const lightBtn = document.getElementById('lyricThemeLightBtn');
        const darkBtn = document.getElementById('lyricThemeDarkBtn');

        display.classList.toggle('theme-dark', theme === 'dark');
        lightBtn.classList.toggle('active', theme === 'light');
        darkBtn.classList.toggle('active', theme === 'dark');
        lightBtn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
        darkBtn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    }

    renderAnnotationView() {
        document.getElementById('annotationTitle').textContent = this.currentSong.title;
        this.updateLyricsHeading();
        this.updateSongMetaFields();
        this.applyTextAlign();
        this.applyLyricTheme();

        this.renderAnnotatedLyrics();
        this.updateChordLegend();
        this.positionHandles();
    }

    updateLyricsHeading() {
        const heading = document.getElementById('lyricsSongHeading');
        heading.replaceChildren();

        const title = (this.currentSong.title || '').trim();
        const artist = (this.currentSong.artist || '').trim();

        const titleSpan = document.createElement('span');
        titleSpan.className = 'heading-title';
        titleSpan.textContent = title;
        heading.appendChild(titleSpan);

        if (artist) {
            const sep = document.createElement('span');
            sep.className = 'heading-sep';
            sep.textContent = ' - ';
            const artistSpan = document.createElement('span');
            artistSpan.className = 'heading-artist';
            artistSpan.textContent = artist;
            heading.appendChild(sep);
            heading.appendChild(artistSpan);
        }
    }

    updateSongMetaFields() {
        const scale = MusicTheory.normalizePreferredScale(this.currentSong.scale);
        this.currentSong.scale = scale;
        this.populateScaleSelect();
        document.getElementById('songScale').value = scale;
        document.getElementById('timeTop').value = this.currentSong.timeTop || 4;
        document.getElementById('timeBottom').value = this.currentSong.timeBottom || 4;
        document.getElementById('songTempo').value = this.currentSong.tempo || '';
        this.updateScaleModeButton();
        this.updateLockChordsButton();
        this.updateLyricsMetaPreview();
    }

    updateLyricsMetaPreview() {
        const scaleChip = document.getElementById('previewScaleChip');
        const timeChip = document.getElementById('previewTimeChip');
        const tempoChip = document.getElementById('previewTempoChip');
        const tempoValue = document.getElementById('previewTempoValue');
        if (!scaleChip || !timeChip || !tempoChip) return;

        const scale = (
            document.getElementById('songScale')?.value ||
            MusicTheory.normalizePreferredScale(this.currentSong?.scale || '') ||
            ''
        ).trim();
        if (scale && scale !== '—') {
            scaleChip.textContent = scale;
            scaleChip.hidden = false;
        } else {
            scaleChip.textContent = '';
            scaleChip.hidden = true;
        }

        const top = document.getElementById('timeTop')?.value || this.currentSong?.timeTop || '4';
        const bottom = document.getElementById('timeBottom')?.value || this.currentSong?.timeBottom || '4';
        timeChip.textContent = `${top}/${bottom}`;

        const tempo = (
            document.getElementById('songTempo')?.value ||
            this.currentSong?.tempo ||
            ''
        ).toString().trim();
        if (tempoValue) tempoValue.textContent = tempo;
        tempoChip.hidden = false;
    }

    saveSongMeta() {
        if (!this.currentSong) return;
        const top = parseInt(document.getElementById('timeTop').value, 10);
        const bottom = parseInt(document.getElementById('timeBottom').value, 10);
        this.currentSong.timeTop = Number.isFinite(top) && top > 0 ? top : 4;
        this.currentSong.timeBottom = Number.isFinite(bottom) && bottom > 0 ? bottom : 4;
        const tempo = parseInt(document.getElementById('songTempo').value, 10);
        this.currentSong.tempo = Number.isFinite(tempo) && tempo > 0 ? tempo : '';
        document.getElementById('timeTop').value = this.currentSong.timeTop;
        document.getElementById('timeBottom').value = this.currentSong.timeBottom;
        document.getElementById('songTempo').value = this.currentSong.tempo;
        this.updateLyricsMetaPreview();
        this.persistCurrentSong();
    }

    onScaleSelectChange() {
        if (!this.currentSong) return;
        const selected = document.getElementById('songScale').value;
        if (!selected) {
            this.currentSong.scale = '';
            this.populateScaleSelect();
            this.updateScaleModeButton();
            this.persistCurrentSong();
            return;
        }
        this.changeSongKey(selected);
    }

    populateScaleSelect() {
        const select = document.getElementById('songScale');
        if (!select) return;
        const current = MusicTheory.normalizePreferredScale(this.currentSong?.scale || '');
        const isMinor = this.getScaleMode() === 'minor';
        const options = MusicTheory.preferredOptions(isMinor);
        const previous = select.value;
        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '—';
        select.appendChild(placeholder);
        options.forEach((name) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
        select.value = current || previous || '';
        if (current && select.value !== current) {
            select.value = current;
        }
    }

    normalizeScale(value) {
        return MusicTheory.normalizeScale(value);
    }

    getDisplayAnnotations() {
        const result = (this.currentSong.annotations || []).map((annotation, index) => ({
            ...annotation,
            index,
            pending: false
        }));

        if (!this.pendingEdit) return result;

        if (this.pendingEdit.type === 'update' && result[this.pendingEdit.index]) {
            result[this.pendingEdit.index] = {
                ...result[this.pendingEdit.index],
                start: this.pendingEdit.start,
                end: this.pendingEdit.end,
                chord: this.pendingEdit.chord || result[this.pendingEdit.index].chord,
                pending: true
            };
        } else if (this.pendingEdit.type === 'create') {
            result.push({
                start: this.pendingEdit.start,
                end: this.pendingEdit.end,
                chord: this.pendingEdit.chord || '',
                index: -1,
                pending: true
            });
        }

        return result;
    }

    getSplits() {
        return Array.isArray(this.currentSong?.splits) ? this.currentSong.splits : [];
    }

    getSectionPoints() {
        const length = this.currentSong?.lyrics?.length || 0;
        const points = new Set([0, length]);
        this.getSplits().forEach((offset) => points.add(this.clampOffset(offset)));
        return Array.from(points).sort((a, b) => a - b);
    }

    collapseNearbyOffsets(offsets) {
        const sorted = [...new Set(offsets.map((value) => this.clampOffset(value)))].sort((a, b) => a - b);
        const collapsed = [];
        sorted.forEach((offset) => {
            if (!collapsed.length || offset - collapsed[collapsed.length - 1] > 1) {
                collapsed.push(offset);
            } else {
                collapsed[collapsed.length - 1] = offset;
            }
        });
        return collapsed;
    }

    deriveSplitsFromAnnotations() {
        const length = this.currentSong?.lyrics?.length || 0;
        const points = [];
        (this.currentSong.annotations || []).forEach((annotation) => {
            if (annotation.start > 0 && annotation.start < length) points.push(annotation.start);
            if (annotation.end > 0 && annotation.end < length) points.push(annotation.end);
        });
        return this.collapseNearbyOffsets(points).filter((offset) => offset > 0 && offset < length);
    }

    ensureSplits() {
        if (!this.currentSong) return;
        if (!Array.isArray(this.currentSong.splits)) {
            this.currentSong.splits = this.deriveSplitsFromAnnotations();
            this.currentSong.annotations = this.snapAnnotationsToSections(this.currentSong.annotations);
        }
        this.normalizeSplits();
    }

    normalizeSplits() {
        if (!this.currentSong) return;
        const length = this.currentSong.lyrics?.length || 0;
        this.currentSong.splits = this.collapseNearbyOffsets(this.getSplits())
            .filter((offset) => offset > 0 && offset < length);
    }

    annotationForSection(start, end, annotations = this.getDisplayAnnotations()) {
        const covering = annotations.filter((annotation) => annotation.start <= start && annotation.end >= end);
        return covering.find((annotation) => annotation.pending) || covering[0] ||
            annotations.find((annotation) => annotation.start === start) || null;
    }

    snapAnnotationsToSections(annotations = this.currentSong.annotations || [], splits = this.getSplits()) {
        const length = this.currentSong?.lyrics?.length || 0;
        const points = [...new Set([
            0,
            ...this.collapseNearbyOffsets(splits).map((offset) => this.clampOffset(offset)),
            length
        ])].sort((a, b) => a - b);
        const next = [];
        for (let i = 0; i < points.length - 1; i += 1) {
            const start = points[i];
            const end = points[i + 1];
            if (start >= end) continue;
            const match = this.annotationForSection(start, end, annotations.map((annotation, index) => ({
                ...annotation,
                index,
                pending: false
            })));
            if (match?.chord) {
                next.push({ chord: match.chord, start, end });
            }
        }
        return next;
    }

    toggleSplitMode() {
        this.setSplitMode(!this.splitMode);
    }

    toggleEraseMode() {
        this.setEraseMode(!this.eraseMode);
    }

    setSplitMode(enabled) {
        this.splitMode = Boolean(enabled);
        if (this.splitMode) {
            this.eraseMode = false;
            this.closeChordModal();
        }
        this.updateSplitToolButtons();
        window.getSelection()?.removeAllRanges();
    }

    setEraseMode(enabled) {
        this.eraseMode = Boolean(enabled);
        if (this.eraseMode) {
            this.splitMode = false;
            this.closeChordModal();
        }
        this.updateSplitToolButtons();
        window.getSelection()?.removeAllRanges();
    }

    updateSplitToolButtons() {
        const splitBtn = document.getElementById('splitModeBtn');
        const eraseBtn = document.getElementById('eraseSplitsBtn');
        const display = document.getElementById('lyricsDisplay');
        if (splitBtn) {
            splitBtn.classList.toggle('active', this.splitMode);
            splitBtn.setAttribute('aria-pressed', this.splitMode ? 'true' : 'false');
            splitBtn.textContent = this.splitMode ? 'Stop split' : 'Split';
        }
        if (eraseBtn) {
            eraseBtn.classList.toggle('active', this.eraseMode);
            eraseBtn.setAttribute('aria-pressed', this.eraseMode ? 'true' : 'false');
            eraseBtn.textContent = this.eraseMode ? 'Stop erase' : 'Erase';
        }
        if (display) {
            display.classList.toggle('is-splitting', this.splitMode);
            display.classList.toggle('is-erasing', this.eraseMode);
        }
    }

    handleLyricsClick(e) {
        if (this.draggingHandle || this.draggingSplit || this.ignoreSplitClick) return;
        if (e.target.closest && e.target.closest('.sel-handle')) return;
        if (this.eraseMode) {
            e.preventDefault();
            this.handleEraseClick(e);
            return;
        }
        if (this.splitMode) {
            e.preventDefault();
            this.handleSplitClick(e);
            return;
        }
        if (e.target.closest('.lyric-split')) return;
        const label = e.target.closest('.chord-label');
        if (label?.dataset.start != null && label?.dataset.end != null) {
            e.stopPropagation();
            this.openSectionChord(Number(label.dataset.start), Number(label.dataset.end));
            return;
        }
        if (!e.target.closest('#lyricsContent')) return;
        const offset = this.clampOffset(this.getLyricOffsetFromPoint(e.clientX, e.clientY));
        const section = this.sectionAtOffset(offset);
        if (!section) return;
        e.stopPropagation();
        this.openSectionChord(section.start, section.end);
    }

    sectionAtOffset(offset) {
        const points = this.getSectionPoints();
        for (let i = 0; i < points.length - 1; i += 1) {
            const start = points[i];
            const end = points[i + 1];
            if (offset >= start && offset < end) return { start, end };
        }
        if (points.length >= 2 && offset === points[points.length - 1]) {
            return { start: points[points.length - 2], end: points[points.length - 1] };
        }
        return null;
    }

    handleSplitClick(e) {
        if (e.target.closest('.lyric-split')) return;
        const nearby = this.nearestSplitOffsetFromPoint(e.clientX, e.clientY);
        if (nearby != null) return;
        this.addSplitAt(this.clampOffset(this.getLyricOffsetFromPoint(e.clientX, e.clientY)));
    }

    handleEraseClick(e) {
        const splitEl = e.target.closest('.lyric-split');
        if (splitEl) {
            this.removeSplitAt(Number(splitEl.dataset.offset));
            return;
        }
        const nearby = this.nearestSplitOffsetFromPoint(e.clientX, e.clientY);
        if (nearby != null) this.removeSplitAt(nearby);
    }

    handleSplitPointerDown(e) {
        if (this.eraseMode || e.button) return;
        const splitEl = e.target.closest('.lyric-split');
        if (!splitEl) return;
        e.preventDefault();
        e.stopPropagation();
        const from = Number(splitEl.dataset.offset);
        this.draggingSplit = {
            from,
            to: from,
            moved: false,
            startX: e.clientX,
            startY: e.clientY,
            originalSplits: [...this.getSplits()],
            originalAnnotations: JSON.parse(JSON.stringify(this.currentSong.annotations || []))
        };
        splitEl.classList.add('dragging');
        document.getElementById('lyricsDisplay')?.classList.add('dragging');
        if (splitEl.setPointerCapture && e.pointerId != null) {
            splitEl.setPointerCapture(e.pointerId);
        }
    }

    handleSplitPointerMove(e) {
        if (!this.draggingSplit) return;
        e.preventDefault();
        const dx = e.clientX - this.draggingSplit.startX;
        const dy = e.clientY - this.draggingSplit.startY;
        if (!this.draggingSplit.moved && (dx * dx + dy * dy) < 16) return;
        this.draggingSplit.moved = true;
        const next = this.constrainSplitMove(
            this.draggingSplit.from,
            this.clampOffset(this.getLyricOffsetFromPoint(e.clientX, e.clientY)),
            this.draggingSplit.originalSplits
        );
        if (next === this.draggingSplit.to) return;
        this.draggingSplit.to = next;
        this.applySplitMove(this.draggingSplit.from, next, this.draggingSplit.originalSplits, this.draggingSplit.originalAnnotations, false);
    }

    handleSplitPointerUp(e) {
        if (!this.draggingSplit) return;
        const drag = this.draggingSplit;
        this.draggingSplit = null;
        document.getElementById('lyricsDisplay')?.classList.remove('dragging');
        document.querySelectorAll('.lyric-split.dragging').forEach((el) => el.classList.remove('dragging'));

        this.currentSong.splits = [...drag.originalSplits];
        this.currentSong.annotations = JSON.parse(JSON.stringify(drag.originalAnnotations));

        if (drag.moved && drag.to != null && drag.to !== drag.from) {
            this.ignoreSplitClick = true;
            setTimeout(() => { this.ignoreSplitClick = false; }, 300);
            this.applySplitMove(drag.from, drag.to, drag.originalSplits, drag.originalAnnotations, true);
            return;
        }

        this.normalizeSplits();
        this.renderAnnotatedLyrics();
    }

    constrainSplitMove(from, offset, splits = this.getSplits()) {
        const length = this.currentSong?.lyrics?.length || 0;
        const points = [0, ...this.collapseNearbyOffsets(splits), length];
        const index = points.indexOf(from);
        if (index <= 0 || index >= points.length - 1) return from;
        const prev = points[index - 1];
        const next = points[index + 1];
        return Math.max(prev + 1, Math.min(next - 1, this.clampOffset(offset)));
    }

    applySplitMove(from, to, originalSplits, originalAnnotations, commit) {
        const point = this.constrainSplitMove(from, to, originalSplits);
        const length = this.currentSong.lyrics.length;
        const points = [0, ...this.collapseNearbyOffsets(originalSplits), length];
        const index = points.indexOf(from);
        if (index <= 0 || index >= points.length - 1) return;

        const start = points[index - 1];
        const end = points[index + 1];
        const indexed = originalAnnotations.map((annotation, i) => ({
            ...annotation,
            index: i,
            pending: false
        }));
        const left = this.annotationForSection(start, from, indexed);
        const right = this.annotationForSection(from, end, indexed);
        const skip = new Set([left?.index, right?.index].filter((value) => Number.isInteger(value) && value >= 0));
        const kept = originalAnnotations.filter((_, i) => !skip.has(i));
        if (left?.chord) kept.push({ chord: left.chord, start, end: point });
        if (right?.chord) kept.push({ chord: right.chord, start: point, end });

        const splits = this.collapseNearbyOffsets([
            ...originalSplits.filter((split) => split !== from),
            point
        ]).filter((offset) => offset > 0 && offset < length);

        if (commit) {
            this.commitSongState({ annotations: this.snapAnnotationsToSections(kept, splits), splits });
            this.renderAnnotationView();
            return;
        }

        this.currentSong.splits = splits;
        this.currentSong.annotations = this.snapAnnotationsToSections(kept, splits);
        this.renderAnnotatedLyrics();
    }

    nearestSplitOffsetFromPoint(x, y) {
        const hits = [...document.querySelectorAll('#lyricSplitOverlay .lyric-split')];
        let best = null;
        let bestDistance = 12;
        hits.forEach((el) => {
            const rect = el.getBoundingClientRect();
            const dx = x - (rect.left + rect.width / 2);
            const dy = y - (rect.top + rect.height / 2);
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = Number(el.dataset.offset);
            }
        });
        return Number.isFinite(best) ? best : null;
    }

    addSplitAt(offset) {
        this.ensureSplits();
        const length = this.currentSong.lyrics.length;
        const point = this.clampOffset(offset);
        if (point <= 0 || point >= length) return;
        if (this.getSplits().some((split) => Math.abs(split - point) <= 1)) return;

        const splits = this.collapseNearbyOffsets([...this.getSplits(), point]);
        const annotations = this.snapAnnotationsToSections(
            (this.currentSong.annotations || []).map((annotation) => {
                if (annotation.start < point && point < annotation.end) {
                    return { ...annotation, end: point };
                }
                return { ...annotation };
            }),
            splits
        );
        this.currentSong.splits = splits;
        this.commitSongState({ annotations, splits });
        this.renderAnnotationView();
    }

    removeSplitAt(offset) {
        this.ensureSplits();
        const point = this.clampOffset(offset);
        const points = this.getSectionPoints();
        const index = points.indexOf(point);
        if (index <= 0 || index >= points.length - 1) return;

        const start = points[index - 1];
        const end = points[index + 1];
        const indexed = (this.currentSong.annotations || []).map((annotation, i) => ({
            ...annotation,
            index: i,
            pending: false
        }));
        const left = this.annotationForSection(start, point, indexed);
        const right = this.annotationForSection(point, end, indexed);
        const skip = new Set([left?.index, right?.index].filter((value) => Number.isInteger(value) && value >= 0));
        const kept = (this.currentSong.annotations || []).filter((_, i) => !skip.has(i));
        if (left?.chord || right?.chord) {
            kept.push({ chord: left?.chord || right.chord, start, end });
        }

        const splits = this.getSplits().filter((split) => split !== point);
        this.commitSongState({ annotations: this.snapAnnotationsToSections(kept, splits), splits });
        this.renderAnnotationView();
    }

    openSectionChord(start, end) {
        if (this.ignoreAnnotationClick || this.draggingHandle) return;
        const sectionStart = this.clampOffset(start);
        const sectionEnd = this.clampOffset(end);
        if (sectionStart >= sectionEnd) return;

        const annotations = this.currentSong.annotations || [];
        const match = this.annotationForSection(sectionStart, sectionEnd, annotations.map((annotation, index) => ({
            ...annotation,
            index,
            pending: false
        })));
        this.openPendingEdit({
            type: match ? 'update' : 'create',
            index: match ? match.index : -1,
            start: sectionStart,
            end: sectionEnd,
            chord: match?.chord || ''
        });
    }

    renderAnnotatedLyrics() {
        const content = document.getElementById('lyricsContent');
        const lyrics = this.currentSong.lyrics;
        this.ensureSplits();

        if (!lyrics) {
            content.textContent = '';
            this.positionLyricOverlays();
            return;
        }

        content.innerHTML = this.formatLyricHtml(lyrics);
        this.positionLyricOverlays();
        requestAnimationFrame(() => this.positionLyricOverlays());
    }

    getCaretRectForOffset(root, offset) {
        const pos = this.getDomPositionForOffset(root, offset);
        if (!pos) return null;

        const range = document.createRange();
        const place = (start, end) => {
            range.setStart(pos.node, start);
            range.setEnd(pos.node, end);
            return range.getBoundingClientRect();
        };

        let rect = place(pos.offset, pos.offset);
        if (rect.height >= 2) {
            return { left: rect.left, top: rect.top, height: rect.height };
        }

        const rtl = getComputedStyle(root).direction === 'rtl';
        if (pos.offset > 0) {
            rect = place(pos.offset - 1, pos.offset);
            if (rect.height >= 2) {
                return { left: rtl ? rect.left : rect.right, top: rect.top, height: rect.height };
            }
        }
        if (pos.offset < pos.node.textContent.length) {
            rect = place(pos.offset, pos.offset + 1);
            if (rect.height >= 2) {
                return { left: rtl ? rect.right : rect.left, top: rect.top, height: rect.height };
            }
        }

        const fallback = parseFloat(getComputedStyle(root).fontSize) || 16;
        return { left: rect.left, top: rect.top, height: fallback * 1.25 };
    }

    alignOverlay(overlay, content) {
        overlay.style.top = `${content.offsetTop}px`;
        overlay.style.left = `${content.offsetLeft}px`;
        overlay.style.width = `${content.offsetWidth}px`;
        overlay.style.height = `${content.offsetHeight}px`;
    }

    positionSplitOverlays() {
        this.positionLyricOverlays();
    }

    positionLyricOverlays() {
        const sectionOverlay = document.getElementById('lyricSectionOverlay');
        const splitOverlay = document.getElementById('lyricSplitOverlay');
        const content = document.getElementById('lyricsContent');
        if (sectionOverlay) sectionOverlay.replaceChildren();
        if (splitOverlay) splitOverlay.replaceChildren();
        if (!content || !this.currentSong?.lyrics) return;

        if (sectionOverlay) this.alignOverlay(sectionOverlay, content);
        if (splitOverlay) this.alignOverlay(splitOverlay, content);

        const contentRect = content.getBoundingClientRect();
        const rtl = getComputedStyle(content).direction === 'rtl';
        const annotations = this.getDisplayAnnotations();
        const points = this.getSectionPoints();

        for (let i = 0; i < points.length - 1; i += 1) {
            const start = points[i];
            const end = points[i + 1];
            if (start >= end) continue;
            const annotation = this.annotationForSection(start, end, annotations);
            if (!annotation) continue;

            const fillColor = annotation.chord
                ? this.getChordFill(annotation.chord)
                : 'rgba(79, 70, 229, 0.18)';
            const range = this.getRangeForOffsets(start, end);
            const caret = this.getCaretRectForOffset(content, start);
            const textHeight = caret?.height || 22;

            if (sectionOverlay && range) {
                [...range.getClientRects()].forEach((rect) => {
                    if (rect.width < 1 || rect.height < 1) return;
                    const fill = document.createElement('div');
                    fill.className = 'lyric-section-fill';
                    if (annotation.pending) fill.classList.add('pending');
                    fill.style.backgroundColor = fillColor;
                    fill.style.left = `${rect.left - contentRect.left}px`;
                    fill.style.width = `${rect.width}px`;
                    fill.style.height = `${textHeight + 4}px`;
                    fill.style.top = `${rect.bottom - contentRect.top - textHeight - 2}px`;
                    sectionOverlay.appendChild(fill);
                });
            }

            if (splitOverlay && annotation.chord && start === annotation.start && caret) {
                const label = document.createElement('span');
                label.className = 'chord-label';
                label.dir = 'ltr';
                label.dataset.start = String(start);
                label.dataset.end = String(end);
                label.textContent = annotation.chord;
                label.style.backgroundColor = fillColor;
                label.style.left = `${caret.left - contentRect.left}px`;
                label.style.top = `${caret.top - contentRect.top}px`;
                label.style.transform = rtl
                    ? 'translate(-100%, calc(-100% - 2px))'
                    : 'translateY(calc(-100% - 2px))';
                splitOverlay.appendChild(label);
            }
        }

        if (!splitOverlay) return;
        const draggingTo = this.draggingSplit?.to;
        this.getSplits().forEach((offset) => {
            const caret = this.getCaretRectForOffset(content, offset);
            if (!caret) return;
            const line = document.createElement('span');
            line.className = 'lyric-split';
            if (draggingTo === offset) line.classList.add('dragging');
            line.dataset.offset = String(offset);
            line.setAttribute('aria-hidden', 'true');
            line.style.left = `${caret.left - contentRect.left}px`;
            line.style.top = `${caret.top - contentRect.top}px`;
            line.style.height = `${caret.height}px`;
            splitOverlay.appendChild(line);
        });
    }

    formatLyricHtml(text) {
        if (!text) return '';
        return text.split(/(_+)/).map((part) => {
            if (!part) return '';
            if (/^_+$/.test(part)) {
                return this.melodyBreakHtml(part);
            }
            return this.escapeHtml(part);
        }).join('');
    }

    melodyBreakHtml(source) {
        return `<span class="melody-break" title="Melody">` +
            `<span class="melody-break-mark" aria-hidden="true">` +
            `<span class="melody-break-line"></span>` +
            `<span class="melody-note">♩</span>` +
            `<span class="melody-note">♩</span>` +
            `<span class="melody-note">♩</span>` +
            `<span class="melody-break-line"></span>` +
            `</span>` +
            `<span class="melody-break-source">${this.escapeHtml(source)}</span>` +
            `</span>`;
    }

    isArabicLetter(char) {
        if (!char) return false;
        const code = char.charCodeAt(0);
        if (code === 0x0640) return true;
        return (code >= 0x0621 && code <= 0x063F)
            || (code >= 0x0641 && code <= 0x064A)
            || (code >= 0x0671 && code <= 0x06D3);
    }

    isArabicTransparent(char) {
        if (!char) return false;
        const code = char.charCodeAt(0);
        return (code >= 0x064B && code <= 0x065F)
            || code === 0x0670
            || (code >= 0x06D6 && code <= 0x06ED);
    }

    isArabicNonJoining(char) {
        if (!char) return false;
        const code = char.charCodeAt(0);
        return code === 0x0621 || code === 0x0674;
    }

    // Alef, dal, reh, waw, and similar letters never connect to the next letter.
    isArabicRightJoining(char) {
        if (!char) return false;
        return /[\u0622-\u0625\u0627\u0629\u062F-\u0632\u0648\u0671-\u0673\u0675-\u0677\u0688-\u0699\u06C0\u06C2-\u06CB\u06CF\u06D2\u06D3\u06D5]/.test(char);
    }

    canJoinForward(char) {
        return this.isArabicLetter(char) && !this.isArabicNonJoining(char) && !this.isArabicRightJoining(char);
    }

    canJoinBackward(char) {
        return this.isArabicLetter(char) && !this.isArabicNonJoining(char);
    }

    adjacentJoiningChar(text, index, direction) {
        const step = direction < 0 ? -1 : 1;
        for (let i = index + step; i >= 0 && i < text.length; i += step) {
            if (this.isArabicTransparent(text[i])) continue;
            return text[i];
        }
        return '';
    }

    shouldJoinArabic(left, right) {
        return this.canJoinForward(left) && this.canJoinBackward(right);
    }

    joinClasses(lyrics, start, end, text) {
        if (!text) return '';
        const prev = this.adjacentJoiningChar(lyrics, start, -1);
        const next = this.adjacentJoiningChar(lyrics, end - 1, 1);
        const first = this.adjacentJoiningChar(text, -1, 1);
        const last = this.adjacentJoiningChar(text, text.length, -1);
        let classes = '';
        if (this.shouldJoinArabic(prev, first)) {
            classes += ' joins-prev';
        }
        if (this.shouldJoinArabic(last, next)) {
            classes += ' joins-next';
        }
        return classes;
    }

    clampOffset(value) {
        const length = this.currentSong.lyrics.length;
        return Math.max(0, Math.min(length, value));
    }

    isLabelNode(node) {
        const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        return Boolean(element && element.closest && element.closest('.chord-label, .melody-break-mark'));
    }

    createLyricWalker(root) {
        return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => this.isLabelNode(node)
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT
        });
    }

    getLyricOffsetFromPoint(x, y) {
        const content = document.getElementById('lyricsContent');
        let range = null;

        if (document.caretRangeFromPoint) {
            range = document.caretRangeFromPoint(x, y);
        } else if (document.caretPositionFromPoint) {
            const position = document.caretPositionFromPoint(x, y);
            if (position) {
                range = document.createRange();
                range.setStart(position.offsetNode, position.offset);
            }
        }

        if (!range || !content.contains(range.startContainer)) {
            return this.nearestOffsetFromPoint(x, y);
        }

        if (this.isLabelNode(range.startContainer)) {
            const startEl = range.startContainer.parentElement;
            const annotation = startEl?.closest('.chord-annotation');
            if (annotation) {
                const index = Number(annotation.getAttribute('data-index'));
                const match = this.getDisplayAnnotations().find(a => a.index === index) ||
                    this.getDisplayAnnotations().find(a => a.pending);
                if (match) {
                    return this.draggingHandle === 'start' ? match.start : match.end;
                }
            }
            const melody = startEl?.closest('.melody-break');
            if (melody) {
                return this.nearestOffsetFromPoint(x, y);
            }
        }

        return this.getLyricOffset(content, range.startContainer, range.startOffset);
    }

    nearestOffsetFromPoint(x, y) {
        const content = document.getElementById('lyricsContent');
        const walker = this.createLyricWalker(content);
        let best = 0;
        let bestDistance = Infinity;
        let running = 0;
        let node;

        while ((node = walker.nextNode())) {
            const length = node.textContent.length;
            for (let i = 0; i <= length; i++) {
                const probe = document.createRange();
                probe.setStart(node, i);
                probe.setEnd(node, i);
                const rect = probe.getBoundingClientRect();
                if (!rect.width && !rect.height && i < length) continue;
                const dx = x - rect.left;
                const dy = y - (rect.top + rect.height / 2);
                const distance = dx * dx + dy * dy;
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = running + i;
                }
            }
            running += length;
        }

        return best;
    }

    getLyricOffset(root, targetNode, targetOffset) {
        if (targetNode === root) {
            let offset = 0;
            const children = Array.from(root.childNodes);
            for (let i = 0; i < Math.min(targetOffset, children.length); i++) {
                offset += this.lyricTextLength(children[i]);
            }
            return offset;
        }

        const walker = this.createLyricWalker(root);
        let offset = 0;
        let node;
        while ((node = walker.nextNode())) {
            if (node === targetNode) {
                return offset + targetOffset;
            }
            offset += node.textContent.length;
        }
        return offset;
    }

    lyricTextLength(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return this.isLabelNode(node) ? 0 : node.textContent.length;
        }
        if (this.isLabelNode(node)) return 0;
        let total = 0;
        node.childNodes.forEach(child => {
            total += this.lyricTextLength(child);
        });
        return total;
    }

    getRangeForOffsets(start, end) {
        const content = document.getElementById('lyricsContent');
        const startPos = this.getDomPositionForOffset(content, start);
        const endPos = this.getDomPositionForOffset(content, end);
        if (!startPos || !endPos) return null;

        const range = document.createRange();
        range.setStart(startPos.node, startPos.offset);
        range.setEnd(endPos.node, endPos.offset);
        return range;
    }

    getDomPositionForOffset(root, targetOffset) {
        const walker = this.createLyricWalker(root);
        let offset = 0;
        let node;
        let last = null;

        while ((node = walker.nextNode())) {
            last = node;
            const length = node.textContent.length;
            if (offset + length >= targetOffset) {
                return { node, offset: targetOffset - offset };
            }
            offset += length;
        }

        if (last) {
            return { node: last, offset: last.textContent.length };
        }
        return null;
    }

    handleTextSelection() {
        return;
    }

    openPendingEdit(pending) {
        this.pendingEdit = pending;
        const preview = this.currentSong.lyrics.substring(pending.start, pending.end);

        document.getElementById('chordModalTitle').textContent =
            pending.type === 'update' ? 'Edit Chord' : 'Add Chord';
        document.querySelector('.selected-text-preview').textContent = `"${preview}"`;
        document.getElementById('chordInput').value = pending.chord || '';
        document.getElementById('removeChordBtn').hidden = pending.type !== 'update';
        document.getElementById('chordModal').classList.add('active');
        document.getElementById('annotationView').classList.add('sheet-open');

        this.updateChordSuggestions();
        this.renderAnnotationView();
        this.scrollSelectionIntoView();

        const isTouch = window.matchMedia('(pointer: coarse)').matches;
        if (!isTouch) {
            setTimeout(() => document.getElementById('chordInput').focus(), 50);
        }
    }

    updatePendingPreview() {
        if (!this.pendingEdit) return;
        const preview = this.currentSong.lyrics.substring(this.pendingEdit.start, this.pendingEdit.end);
        document.querySelector('.selected-text-preview').textContent = `"${preview}"`;
    }

    scrollSelectionIntoView() {
        if (!this.pendingEdit) return;
        const range = this.getRangeForOffsets(this.pendingEdit.start, this.pendingEdit.end);
        if (!range) return;
        const rect = range.getBoundingClientRect();
        const sheet = document.querySelector('.modal-content');
        const sheetHeight = sheet ? sheet.getBoundingClientRect().height : 260;
        const limit = window.innerHeight - sheetHeight - 24;
        if (rect.bottom > limit) {
            window.scrollBy({ top: rect.bottom - limit, behavior: 'smooth' });
        } else if (rect.top < 120) {
            window.scrollBy({ top: rect.top - 120, behavior: 'smooth' });
        }
    }

    adjustSelectionFromPoint(x, y) {
        if (!this.pendingEdit || !this.draggingHandle) return;

        const offset = this.clampOffset(this.getLyricOffsetFromPoint(x, y));
        let { start, end } = this.pendingEdit;

        if (this.draggingHandle === 'start') {
            start = Math.min(offset, end - 1);
        } else {
            end = Math.max(offset, start + 1);
        }

        if (start === this.pendingEdit.start && end === this.pendingEdit.end) return;

        this.pendingEdit.start = start;
        this.pendingEdit.end = end;
        this.renderAnnotatedLyrics();
        this.updatePendingPreview();
        this.positionHandles();
    }

    positionHandles() {
        const startHandle = document.getElementById('startHandle');
        const endHandle = document.getElementById('endHandle');
        if (startHandle) startHandle.hidden = true;
        if (endHandle) endHandle.hidden = true;
    }

    closeChordModal() {
        document.getElementById('chordModal').classList.remove('active');
        document.getElementById('annotationView').classList.remove('sheet-open');
        document.getElementById('removeChordBtn').hidden = true;
        this.pendingEdit = null;
        this.draggingHandle = null;
        document.getElementById('lyricsDisplay').classList.remove('dragging');
        document.getElementById('startHandle').classList.remove('dragging');
        document.getElementById('endHandle').classList.remove('dragging');

        if (this.currentView === 'annotation' && this.currentSong) {
            this.renderAnnotationView();
        } else {
            document.getElementById('startHandle').hidden = true;
            document.getElementById('endHandle').hidden = true;
        }
    }

    saveChord() {
        const chord = document.getElementById('chordInput').value.trim();
        if (!chord) {
            alert('Please enter a chord');
            return;
        }
        if (!this.pendingEdit) return;

        const start = this.pendingEdit.start;
        const end = this.pendingEdit.end;
        if (start >= end) {
            alert('Select some text for this chord');
            return;
        }

        this.chordColors[chord] = this.getChordColor(chord);
        this.recordRecentChord(chord);

        let next = (this.currentSong.annotations || []).map(annotation => ({ ...annotation }));

        if (this.pendingEdit.type === 'update' && this.pendingEdit.index >= 0) {
            next[this.pendingEdit.index] = { chord, start, end };
        } else {
            next.push({ chord, start, end });
        }

        next = this.resolveOverlaps(next, this.pendingEdit.type === 'update' ? this.pendingEdit.index : next.length - 1);
        next = this.snapAnnotationsToSections(next);

        this.commitAnnotations(next);
        this.closeChordModal();
    }

    resolveOverlaps(annotations, keepIndex) {
        const kept = annotations[keepIndex];
        return annotations.filter((annotation, index) => {
            if (index === keepIndex) return true;
            return !(annotation.start < kept.end && kept.start < annotation.end);
        });
    }

    removePendingChord() {
        if (!this.pendingEdit || this.pendingEdit.type !== 'update') return;
        const next = (this.currentSong.annotations || []).filter((_, index) => index !== this.pendingEdit.index);
        this.commitAnnotations(next);
        this.closeChordModal();
    }

    editAnnotation(element) {
        if (this.ignoreAnnotationClick || this.draggingHandle) return;

        const index = Number(element.getAttribute('data-index'));
        if (Number.isNaN(index) || index < 0) return;

        const annotation = this.currentSong.annotations[index];
        if (!annotation) return;

        this.openPendingEdit({
            type: 'update',
            index,
            start: annotation.start,
            end: annotation.end,
            chord: annotation.chord
        });
    }

    buildChordCatalog() {
        const chords = [];
        this.rootLetters.forEach(letter => {
            ['', 'b', '#'].forEach(accidental => {
                this.chordQualities.forEach(quality => {
                    chords.push(`${letter}${accidental}${quality}`);
                });
            });
        });
        return chords;
    }

    parseChordRoot(chord) {
        return MusicTheory.parseChordRoot(chord);
    }

    transposeChordName(chord, semitones, targetKey) {
        return MusicTheory.transposeChordName(chord, semitones, targetKey);
    }

    transposeScale(scale, semitones) {
        return MusicTheory.transposeScale(scale, semitones);
    }

    isMinorScale(scale) {
        return MusicTheory.isMinorScale(scale);
    }

    toggleScaleQuality(scale) {
        return MusicTheory.toggleScaleQuality(scale);
    }

    getScaleMode() {
        const scale = MusicTheory.normalizePreferredScale(this.currentSong?.scale || '');
        if (scale) return MusicTheory.isMinorScale(scale) ? 'minor' : 'major';
        return this.currentSong?.scaleMode === 'minor' ? 'minor' : 'major';
    }

    areChordsLocked() {
        return Boolean(this.currentSong?.chordsLocked);
    }

    updateLockChordsButton() {
        const button = document.getElementById('lockChordsBtn');
        if (!button) return;
        const locked = this.areChordsLocked();
        button.classList.toggle('active', locked);
        button.setAttribute('aria-pressed', locked ? 'true' : 'false');
        button.textContent = locked ? 'Chords locked' : 'Lock chords';
    }

    toggleChordsLock() {
        if (!this.currentSong) return;
        this.currentSong.chordsLocked = !this.areChordsLocked();
        this.updateLockChordsButton();
        this.persistCurrentSong();
    }

    updateScaleModeButton() {
        const majorBtn = document.getElementById('scaleMajorBtn');
        const minorBtn = document.getElementById('scaleMinorBtn');
        if (!majorBtn || !minorBtn) return;
        const isMinor = this.getScaleMode() === 'minor';
        majorBtn.classList.toggle('active', !isMinor);
        minorBtn.classList.toggle('active', isMinor);
        majorBtn.setAttribute('aria-pressed', isMinor ? 'false' : 'true');
        minorBtn.setAttribute('aria-pressed', isMinor ? 'true' : 'false');
    }

    setScaleMode(mode) {
        if (!this.currentSong) return;
        const wantMinor = mode === 'minor';
        if (this.getScaleMode() === (wantMinor ? 'minor' : 'major')) return;
        const current = MusicTheory.normalizePreferredScale(this.currentSong.scale);
        if (!current) {
            this.currentSong.scaleMode = wantMinor ? 'minor' : 'major';
            this.populateScaleSelect();
            this.updateScaleModeButton();
            this.persistCurrentSong();
            return;
        }
        const next = MusicTheory.toggleScaleQuality(current);
        if (!next || next === current) return;
        if (this.areChordsLocked()) {
            this.currentSong.scale = next;
            this.populateScaleSelect();
            document.getElementById('songScale').value = next;
            this.updateScaleModeButton();
            this.persistCurrentSong();
            return;
        }
        this.applyKeyTransposition(0, next);
    }

    changeSongKey(nextScaleRaw) {
        if (!this.currentSong) return;
        this.closeChordModal();
        const current = MusicTheory.normalizePreferredScale(this.currentSong.scale);
        const next = MusicTheory.normalizePreferredScale(nextScaleRaw);
        if (!next) {
            this.currentSong.scale = '';
            this.populateScaleSelect();
            this.updateScaleModeButton();
            this.persistCurrentSong();
            return;
        }
        if (this.areChordsLocked() || !current) {
            this.currentSong.scale = next;
            this.currentSong.scaleMode = MusicTheory.isMinorScale(next) ? 'minor' : 'major';
            this.populateScaleSelect();
            document.getElementById('songScale').value = next;
            this.updateScaleModeButton();
            this.persistCurrentSong();
            return;
        }
        const semitones = MusicTheory.scaleInterval(current, next);
        this.applyKeyTransposition(semitones, next);
    }

    applyKeyTransposition(semitones, targetScale) {
        const target = MusicTheory.normalizePreferredScale(targetScale);
        const nextAnnotations = (this.currentSong.annotations || []).map((annotation) => ({
            ...annotation,
            chord: MusicTheory.transposeChordName(annotation.chord, semitones || 0, target)
        }));
        if (Array.isArray(this.currentSong.recentChords)) {
            this.currentSong.recentChords = this.currentSong.recentChords.map((chord) =>
                MusicTheory.transposeChordName(chord, semitones || 0, target)
            );
        }
        this.currentSong.scale = target;
        this.commitAnnotations(nextAnnotations);
        this.renderAnnotationView();
    }

    transposeSong(semitones) {
        if (!this.currentSong || !semitones) return;
        this.closeChordModal();
        const current = MusicTheory.normalizePreferredScale(this.currentSong.scale);
        if (!current) {
            const nextAnnotations = (this.currentSong.annotations || []).map((annotation) => ({
                ...annotation,
                chord: MusicTheory.transposeChordName(annotation.chord, semitones)
            }));
            this.commitAnnotations(nextAnnotations);
            this.renderAnnotationView();
            return;
        }
        const nextScale = MusicTheory.transposeScale(current, semitones);
        this.applyKeyTransposition(semitones, nextScale);
    }

    getChordFamily(letter) {
        const upper = letter.toUpperCase();
        return this.allChords.filter(chord => this.parseChordRoot(chord)?.letter === upper);
    }

    filterChordsByInput(input) {
        const query = input.trim();
        if (!query) return [];

        const parsed = this.parseChordRoot(query);
        if (parsed && query.length === 1) {
            return this.getChordFamily(parsed.letter);
        }

        const lower = query.toLowerCase();
        return this.allChords.filter(chord => chord.toLowerCase().startsWith(lower));
    }

    updateChordSuggestions() {
        const input = document.getElementById('chordInput').value.trim();
        const parsed = this.parseChordRoot(input);
        const activeLetter = parsed ? parsed.letter : '';
        this.renderRecentChords(input);
        this.renderRootButtons(activeLetter, input);
        this.renderChordSuggestions(this.filterChordsByInput(input), input);
    }

    recordRecentChord(chord) {
        const name = (chord || '').trim();
        if (!name || !this.currentSong) return;
        const next = [
            name,
            ...(this.currentSong.recentChords || []).filter((item) => item.toLowerCase() !== name.toLowerCase())
        ];
        this.currentSong.recentChords = next.slice(0, 16);
    }

    getRecentSongChords() {
        const seen = new Set();
        const chords = [];
        const add = (chord) => {
            const name = (chord || '').trim();
            if (!name) return;
            const key = name.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            chords.push(name);
        };

        (this.currentSong?.recentChords || []).forEach(add);
        [...(this.currentSong?.annotations || [])]
            .filter((annotation) => annotation.chord)
            .sort((a, b) => b.start - a.start)
            .forEach((annotation) => add(annotation.chord));

        return chords.slice(0, 12);
    }

    renderRecentChords(selectedChord = '') {
        const row = document.getElementById('chordRecentRow');
        const container = document.getElementById('chordRecent');
        if (!row || !container) return;

        const chords = this.getRecentSongChords();
        container.innerHTML = '';
        row.hidden = chords.length === 0;
        chords.forEach((chord) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'chord-suggestion recent';
            if (selectedChord && chord.toLowerCase() === selectedChord.toLowerCase()) {
                btn.classList.add('selected');
            }
            btn.textContent = chord;
            btn.addEventListener('click', () => this.selectSuggestedChord(chord));
            container.appendChild(btn);
        });
    }

    renderRootButtons(activeLetter, selectedChord) {
        const container = document.getElementById('chordRoots');
        container.innerHTML = '';

        this.rootLetters.forEach(letter => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'chord-suggestion root';
            if (activeLetter === letter) btn.classList.add('selected');
            btn.textContent = letter;
            btn.addEventListener('click', () => this.selectSuggestedChord(letter));
            container.appendChild(btn);
        });
    }

    renderChordSuggestions(chords, selectedChord = '') {
        const container = document.getElementById('chordSuggestions');
        container.innerHTML = '';

        chords.forEach(chord => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'chord-suggestion';
            if (selectedChord && chord.toLowerCase() === selectedChord.toLowerCase()) {
                btn.classList.add('selected');
            }
            btn.textContent = chord;
            btn.addEventListener('click', () => this.selectSuggestedChord(chord));
            container.appendChild(btn);
        });
    }

    selectSuggestedChord(chord) {
        document.getElementById('chordInput').value = chord;
        if (this.pendingEdit) this.pendingEdit.chord = chord;
        this.updateChordSuggestions();
        this.renderAnnotatedLyrics();
        this.positionHandles();
    }

    deleteAllChords() {
        const annotations = this.currentSong?.annotations || [];
        if (!annotations.length) return;
        if (!confirm('Are you sure you want to delete all chords?')) return;

        this.pendingEdit = null;
        this.draggingHandle = null;
        document.getElementById('chordModal').classList.remove('active');
        document.getElementById('annotationView').classList.remove('sheet-open');
        document.getElementById('removeChordBtn').hidden = true;
        document.getElementById('lyricsDisplay').classList.remove('dragging');

        this.commitAnnotations([]);
        this.renderAnnotationView();
    }

    exportFilename(extension = 'jpg') {
        const name = MusicTheory.exportImageFilename(
            this.currentSong?.title,
            this.currentSong?.artist,
            this.currentSong?.scale
        );
        if (!extension || extension === 'jpg') return name;
        return name.replace(/\.jpg$/i, `.${extension}`);
    }

    isIosDevice() {
        const ua = navigator.userAgent || '';
        return /iPad|iPhone|iPod/.test(ua)
            || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    async saveExportBlob(blob, filename) {
        if (this.isIosDevice()) {
            const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
            try {
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: filename });
                    return;
                }
            } catch (error) {
                if (error && error.name === 'AbortError') return;
            }
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    async exportLyricsImage() {
        const card = document.getElementById('lyricsDisplay');
        const button = document.getElementById('exportLyricsBtn');
        if (!card || typeof htmlToImage?.toCanvas !== 'function') {
            alert('Export is not available.');
            return;
        }

        const previousLabel = button.textContent;
        this.setExportButtonsBusy(true);
        button.textContent = 'Exporting…';

        try {
            if (document.fonts?.ready) {
                await document.fonts.ready;
            }
            const canvas = await this.captureLyricsCanvas(card);

            const blob = await new Promise((resolve, reject) => {
                canvas.toBlob((result) => {
                    if (result) resolve(result);
                    else reject(new Error('Could not create the image.'));
                }, 'image/jpeg', 0.92);
            });

            await this.saveExportBlob(blob, this.exportFilename());
        } catch (error) {
            console.error('Export failed:', error);
            alert('Could not export the lyrics image.');
        } finally {
            button.textContent = previousLabel;
            this.setExportButtonsBusy(false);
        }
    }

    setExportButtonsBusy(busy, videoLabel) {
        const imageBtn = document.getElementById('exportLyricsBtn');
        const videoBtn = document.getElementById('exportLyricsVideoBtn');
        if (imageBtn) imageBtn.disabled = busy;
        if (videoBtn) {
            videoBtn.disabled = busy;
            if (busy && videoLabel) videoBtn.textContent = videoLabel;
            if (!busy) videoBtn.textContent = 'Export video';
        }
    }

    lyricVideoSpec() {
        return {
            width: 1080,
            height: 1920,
            fps: 30,
            durationMs: 60_000,
            holdStartMs: 2_500,
            holdEndMs: 2_500
        };
    }

    pickVideoMimeType() {
        if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
        return [
            'video/mp4;codecs=avc1.4D4028',
            'video/mp4;codecs=avc1.640028',
            'video/mp4',
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm'
        ].find((type) => MediaRecorder.isTypeSupported(type)) || '';
    }

    async pickAacEncoderConfig() {
        if (typeof AudioEncoder === 'undefined' || typeof AudioEncoder.isConfigSupported !== 'function') {
            return null;
        }
        const config = {
            codec: 'mp4a.40.2',
            numberOfChannels: 2,
            sampleRate: 48000,
            bitrate: 64_000
        };
        try {
            const support = await AudioEncoder.isConfigSupported(config);
            if (support?.supported) return support.config || config;
        } catch {
            return null;
        }
        return null;
    }

    isAnnexBNal(data) {
        return data.length >= 4
            && data[0] === 0
            && data[1] === 0
            && (data[2] === 1 || (data[2] === 0 && data[3] === 1));
    }

    annexBToLengthPrefixed(data) {
        const nalus = [];
        let i = 0;
        while (i < data.length) {
            let naluStart = -1;
            if (i + 3 < data.length && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
                naluStart = i + 3;
            } else if (i + 4 <= data.length && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1) {
                naluStart = i + 4;
            }
            if (naluStart < 0) {
                i += 1;
                continue;
            }
            let next = data.length;
            for (let j = naluStart; j + 2 < data.length; j += 1) {
                if (data[j] === 0 && data[j + 1] === 0 && data[j + 2] === 1) {
                    next = j > naluStart && data[j - 1] === 0 ? j - 1 : j;
                    break;
                }
            }
            if (naluStart < next) nalus.push(data.subarray(naluStart, next));
            i = next;
        }
        const total = nalus.reduce((sum, nalu) => sum + 4 + nalu.length, 0);
        const out = new Uint8Array(total);
        let offset = 0;
        nalus.forEach((nalu) => {
            out[offset] = (nalu.length >>> 24) & 255;
            out[offset + 1] = (nalu.length >>> 16) & 255;
            out[offset + 2] = (nalu.length >>> 8) & 255;
            out[offset + 3] = nalu.length & 255;
            out.set(nalu, offset + 4);
            offset += 4 + nalu.length;
        });
        return out.length ? out : data;
    }

    readMp4DurationSeconds(buffer) {
        const bytes = new Uint8Array(buffer);
        const limit = Math.min(bytes.length - 32, 2_000_000);
        for (let i = 0; i < limit; i += 1) {
            if (bytes[i] !== 0x6d || bytes[i + 1] !== 0x76 || bytes[i + 2] !== 0x68 || bytes[i + 3] !== 0x64) continue;
            const view = new DataView(buffer, i + 4);
            if (view.getUint8(0) === 1) {
                const timescale = view.getUint32(20);
                const duration = view.getUint32(24) * 2 ** 32 + view.getUint32(28);
                return timescale ? duration / timescale : 0;
            }
            const timescale = view.getUint32(12);
            const duration = view.getUint32(16);
            return timescale ? duration / timescale : 0;
        }
        return 0;
    }

    async pickAvcEncoderConfig(width, height) {
        if (typeof VideoEncoder === 'undefined' || typeof VideoEncoder.isConfigSupported !== 'function') {
            return null;
        }
        if (typeof Mp4Muxer === 'undefined') return null;
        const codecs = [
            'avc1.420028',
            'avc1.4D4028',
            'avc1.640028',
            'avc1.4D001F',
            'avc1.42001E'
        ];
        for (const codec of codecs) {
            const config = {
                codec,
                width,
                height,
                bitrate: 8_000_000,
                framerate: 30,
                avc: { format: 'avc' }
            };
            try {
                const support = await VideoEncoder.isConfigSupported(config);
                if (support?.supported) {
                    const resolved = support.config || config;
                    return { ...resolved, avc: { format: 'avc' } };
                }
            } catch {
                // Try the next Instagram-safe H.264 profile.
            }
        }
        return null;
    }

    createLyricVideoFrame(source, isDark) {
        const spec = this.lyricVideoSpec();
        const srcViewH = source.width * (spec.height / spec.width);
        const maxY = Math.max(0, source.height - srcViewH);
        const canvas = document.createElement('canvas');
        canvas.width = spec.width;
        canvas.height = spec.height;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
        const background = isDark ? '#000000' : '#ffffff';

        const drawAt = (y) => {
            const srcY = Math.max(0, Math.min(maxY, y));
            const sliceH = Math.min(srcViewH, source.height - srcY);
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, spec.width, spec.height);
            if (sliceH > 0) {
                ctx.drawImage(
                    source,
                    0, srcY, source.width, sliceH,
                    0, 0, spec.width, spec.height * (sliceH / srcViewH)
                );
            }
        };

        const yAtTime = (elapsedMs) => {
            const scrollMs = spec.durationMs - spec.holdStartMs - spec.holdEndMs;
            if (elapsedMs <= spec.holdStartMs || maxY <= 1) return 0;
            if (elapsedMs >= spec.holdStartMs + scrollMs) return maxY;
            return ((elapsedMs - spec.holdStartMs) / scrollMs) * maxY;
        };

        return { canvas, drawAt, yAtTime, spec };
    }

    async exportLyricsVideo() {
        const card = document.getElementById('lyricsDisplay');
        const button = document.getElementById('exportLyricsVideoBtn');
        if (!card || typeof htmlToImage?.toCanvas !== 'function') {
            alert('Export is not available.');
            return;
        }

        const encoderConfig = await this.pickAvcEncoderConfig(1080, 1920);
        const mimeType = this.pickVideoMimeType();
        const canRecord = typeof MediaRecorder !== 'undefined'
            && typeof HTMLCanvasElement.prototype.captureStream === 'function'
            && Boolean(mimeType);
        if (!encoderConfig && !canRecord) {
            alert('Video export is not supported in this browser.');
            return;
        }

        this.setExportButtonsBusy(true, 'Exporting video…');
        const previousLabel = button.textContent;

        try {
            if (document.fonts?.ready) {
                await document.fonts.ready;
            }
            const isDark = card.classList.contains('theme-dark');
            const source = await this.captureLyricsCanvas(card);
            let blob;
            if (encoderConfig) {
                blob = await this.encodeLyricScrollMp4(source, {
                    isDark,
                    encoderConfig,
                    onProgress: (percent) => {
                        button.textContent = `Encoding ${percent}%`;
                    }
                });
            } else {
                button.textContent = 'Recording…';
                blob = await this.recordLyricScrollVideo(source, { isDark, mimeType });
            }
            const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
            await this.saveExportBlob(blob, this.exportFilename(extension));
        } catch (error) {
            console.error('Video export failed:', error);
            alert('Could not export the lyrics video.');
        } finally {
            button.textContent = previousLabel;
            this.setExportButtonsBusy(false);
        }
    }

    async encodeLyricScrollMp4(source, { isDark, encoderConfig, onProgress }) {
        const { canvas, drawAt, yAtTime, spec } = this.createLyricVideoFrame(source, isDark);
        const totalFrames = Math.round(spec.durationMs / 1000 * spec.fps);
        const frameDuration = 1e6 / spec.fps;
        const audioConfig = await this.pickAacEncoderConfig();
        const muxerOptions = {
            target: new Mp4Muxer.ArrayBufferTarget(),
            video: {
                codec: 'avc',
                width: spec.width,
                height: spec.height,
                frameRate: spec.fps
            },
            fastStart: 'in-memory',
            firstTimestampBehavior: 'offset'
        };
        if (audioConfig) {
            muxerOptions.audio = {
                codec: 'aac',
                numberOfChannels: audioConfig.numberOfChannels || 2,
                sampleRate: audioConfig.sampleRate || 48000
            };
        }
        const muxer = new Mp4Muxer.Muxer(muxerOptions);

        let encoderError = null;
        let encodedFrames = 0;
        const encoder = new VideoEncoder({
            output: (chunk, meta) => {
                const copied = new Uint8Array(chunk.byteLength);
                chunk.copyTo(copied);
                const data = this.isAnnexBNal(copied) ? this.annexBToLengthPrefixed(copied) : copied;
                muxer.addVideoChunkRaw(
                    data,
                    chunk.type,
                    encodedFrames * frameDuration,
                    frameDuration,
                    meta
                );
                encodedFrames += 1;
            },
            error: (error) => {
                encoderError = error;
            }
        });
        encoder.configure(encoderConfig);

        let audioEncoder = null;
        let encodedAudioChunks = 0;
        if (audioConfig) {
            audioEncoder = new AudioEncoder({
                output: (chunk, meta) => {
                    const data = new Uint8Array(chunk.byteLength);
                    chunk.copyTo(data);
                    const timestamp = encodedAudioChunks * (1024 / (audioConfig.sampleRate || 48000)) * 1e6;
                    const duration = (1024 / (audioConfig.sampleRate || 48000)) * 1e6;
                    muxer.addAudioChunkRaw(data, chunk.type, timestamp, duration, meta);
                    encodedAudioChunks += 1;
                },
                error: (error) => {
                    encoderError = error;
                }
            });
            audioEncoder.configure(audioConfig);
        }

        const waitForQueue = async (which) => {
            while (which.encodeQueueSize > 8) {
                await new Promise((resolve) => {
                    which.ondequeue = () => resolve();
                });
            }
        };

        try {
            for (let i = 0; i < totalFrames; i++) {
                if (encoderError) throw encoderError;
                drawAt(yAtTime((i / spec.fps) * 1000));
                const frame = new VideoFrame(canvas, {
                    timestamp: i * frameDuration,
                    duration: frameDuration
                });
                encoder.encode(frame, { keyFrame: i % spec.fps === 0 });
                frame.close();
                await waitForQueue(encoder);
                if (i % spec.fps === 0 || i === totalFrames - 1) {
                    onProgress?.(Math.round((i + 1) / totalFrames * 100));
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
            await encoder.flush();
            if (encoderError) throw encoderError;
            if (encodedFrames === 0) throw new Error('No video frames were encoded.');

            if (audioEncoder) {
                const sampleRate = audioConfig.sampleRate || 48000;
                const channels = audioConfig.numberOfChannels || 2;
                const framesPerChunk = 1024;
                const totalSamples = Math.ceil((spec.durationMs / 1000 * sampleRate) / framesPerChunk) * framesPerChunk;
                for (let start = 0; start < totalSamples; start += framesPerChunk) {
                    if (encoderError) throw encoderError;
                    const audioData = new AudioData({
                        format: 'f32',
                        sampleRate,
                        numberOfFrames: framesPerChunk,
                        numberOfChannels: channels,
                        timestamp: (start / sampleRate) * 1e6,
                        data: new Float32Array(framesPerChunk * channels)
                    });
                    audioEncoder.encode(audioData);
                    audioData.close();
                    await waitForQueue(audioEncoder);
                }
                await audioEncoder.flush();
                if (encoderError) throw encoderError;
            }

            muxer.finalize();
            const buffer = muxer.target.buffer;
            if (this.readMp4DurationSeconds(buffer) < 1) {
                throw new Error('The exported video is missing a duration.');
            }
            return new Blob([buffer], { type: 'video/mp4' });
        } finally {
            try { encoder.close(); } catch { /* already closed */ }
            try { audioEncoder?.close(); } catch { /* already closed */ }
        }
    }

    async recordLyricScrollVideo(source, { isDark, mimeType }) {
        const { canvas, drawAt, yAtTime, spec } = this.createLyricVideoFrame(source, isDark);
        canvas.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
        document.body.appendChild(canvas);
        drawAt(0);

        const stream = canvas.captureStream(spec.fps);
        const recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 8_000_000
        });
        const chunks = [];
        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size) chunks.push(event.data);
        };

        const stopped = new Promise((resolve, reject) => {
            recorder.onerror = () => reject(new Error('Could not record the video.'));
            recorder.onstop = () => resolve();
        });

        recorder.start(200);

        const startedAt = performance.now();
        await new Promise((resolve) => {
            const tick = (now) => {
                const elapsed = now - startedAt;
                drawAt(yAtTime(elapsed));
                if (elapsed < spec.durationMs) {
                    requestAnimationFrame(tick);
                } else {
                    drawAt(yAtTime(spec.durationMs));
                    resolve();
                }
            };
            requestAnimationFrame(tick);
        });

        await new Promise((resolve) => setTimeout(resolve, 180));
        if (recorder.state !== 'inactive') recorder.stop();
        await stopped;
        stream.getTracks().forEach((track) => track.stop());
        canvas.remove();

        const type = recorder.mimeType || mimeType || 'video/webm';
        return new Blob(chunks, { type });
    }

    async captureLyricsCanvas(card) {
        const width = card.offsetWidth || 540;
        const isDark = card.classList.contains('theme-dark');
        const hiddenHandles = [];
        card.querySelectorAll('.sel-handle').forEach((handle) => {
            if (!handle.hidden) {
                handle.hidden = true;
                hiddenHandles.push(handle);
            }
        });
        const previousOverflow = card.style.overflow;
        const previousHeight = card.style.height;
        card.style.overflow = 'hidden';
        card.style.height = `${Math.max(card.scrollHeight, card.offsetHeight)}px`;
        card.classList.add('is-export');
        this.positionLyricOverlays();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        this.positionLyricOverlays();

        try {
            return await htmlToImage.toCanvas(card, {
                backgroundColor: isDark ? '#000000' : '#ffffff',
                pixelRatio: Math.min(3, Math.max(2, 1080 / width)),
                cacheBust: true,
                width: card.offsetWidth || width,
                height: card.offsetHeight,
                filter: (node) => !(node.classList && (
                    node.classList.contains('sel-handle')
                    || node.classList.contains('lyric-split')
                ))
            });
        } finally {
            card.classList.remove('is-export');
            card.style.overflow = previousOverflow;
            card.style.height = previousHeight;
            hiddenHandles.forEach((handle) => {
                handle.hidden = false;
            });
            this.positionLyricOverlays();
        }
    }

    updateChordLegend() {
        const usedChords = new Set((this.currentSong.annotations || []).map(a => a.chord));
        const container = document.getElementById('chordLegendList');
        const deleteBtn = document.getElementById('deleteAllChordsBtn');
        if (deleteBtn) deleteBtn.disabled = usedChords.size === 0;

        if (usedChords.size === 0) {
            container.innerHTML = '<p style="color: var(--text-light); font-size: 0.875rem;">No chords added yet</p>';
            return;
        }

        container.innerHTML = '';

        Array.from(usedChords).sort().forEach(chord => {
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.style.backgroundColor = this.getChordFill(chord);
            const colorBox = document.createElement('div');
            colorBox.className = 'legend-color';
            colorBox.style.backgroundColor = this.getChordFill(chord);

            const label = document.createElement('span');
            label.textContent = chord;

            item.appendChild(colorBox);
            item.appendChild(label);
            container.appendChild(item);
        });
    }

    getChordColor(chord) {
        const map = this.getSongColorMap();
        if (map[chord]) return map[chord];
        return this.pickDistinctColor(Object.values(map));
    }

    getChordFill(chord) {
        const theme = this.getLyricTheme();
        return this.withAlpha(this.getChordColor(chord), this.highlightAlpha[theme]);
    }

    getSongChordList(song = this.currentSong) {
        const seen = [];
        const annotations = [...(song?.annotations || [])].sort((a, b) => a.start - b.start);
        annotations.forEach((annotation) => {
            if (annotation.chord && !seen.includes(annotation.chord)) {
                seen.push(annotation.chord);
            }
        });
        if (this.pendingEdit?.chord && !seen.includes(this.pendingEdit.chord)) {
            seen.push(this.pendingEdit.chord);
        }
        return seen;
    }

    getSongColorMap(song = this.currentSong) {
        const map = {};
        this.getSongChordList(song).forEach((chord, index) => {
            map[chord] = this.colorPalette[index % this.colorPalette.length];
        });
        return map;
    }

    pickDistinctColor(used) {
        const taken = used || [];
        return this.colorPalette.find((color) => !taken.includes(color)) || this.colorPalette[taken.length % this.colorPalette.length];
    }

    remapChordColors() {
        // Colors are assigned per song at render time so nearby chords stay distinct.
    }

    withAlpha(color, alpha) {
        const value = String(color || '').trim();
        const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (hex) {
            let raw = hex[1];
            if (raw.length === 3) {
                raw = raw.split('').map((ch) => ch + ch).join('');
            }
            const n = parseInt(raw, 16);
            const r = (n >> 16) & 255;
            const g = (n >> 8) & 255;
            const b = n & 255;
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (rgb) {
            return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
        }
        return value;
    }

    finishAnnotation() {
        this.closeChordModal();

        if (this.editingIndex >= 0) {
            this.songs[this.editingIndex] = this.currentSong;
        } else {
            this.songs.push(this.currentSong);
            this.editingIndex = this.songs.length - 1;
        }

        this.saveData();
        this.showView('songList');
    }

    renderSongList() {
        const container = document.getElementById('songList');

        if (this.songs.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No songs yet. Create your first song!</p></div>';
            return;
        }

        container.innerHTML = '';

        this.songs.forEach((song, index) => {
            const card = document.createElement('div');
            card.className = 'song-card';

            const title = document.createElement('h3');
            title.textContent = song.title;

            const artist = document.createElement('p');
            artist.textContent = song.artist || 'Unknown Artist';

            const meta = document.createElement('div');
            meta.className = 'song-card-meta';

            const chordCount = song.annotations ? song.annotations.length : 0;
            const metaText = document.createElement('span');
            metaText.textContent = `${chordCount} chord${chordCount !== 1 ? 's' : ''}`;

            meta.appendChild(metaText);

            const actions = document.createElement('div');
            actions.className = 'song-card-actions';

            const viewBtn = document.createElement('button');
            viewBtn.className = 'btn btn-primary btn-small';
            viewBtn.textContent = 'View';
            viewBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.viewSong(index);
            });

            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-secondary btn-small';
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editSong(index);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-danger btn-small';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteSong(index);
            });

            actions.appendChild(viewBtn);
            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);

            card.appendChild(title);
            card.appendChild(artist);
            card.appendChild(meta);
            card.appendChild(actions);

            container.appendChild(card);
        });
    }

    collectChordsByKey() {
        const groups = [];
        const indexByKey = new Map();

        this.songs.forEach((song) => {
            const key = MusicTheory.normalizePreferredScale(song.scale) || 'No key';
            const chords = this.getSongChordList(song).filter(Boolean);
            if (!chords.length) return;

            if (!indexByKey.has(key)) {
                indexByKey.set(key, groups.length);
                groups.push({ key, chords: [] });
            }
            const group = groups[indexByKey.get(key)];
            chords.forEach((chord) => {
                if (!group.chords.includes(chord)) group.chords.push(chord);
            });
        });

        return groups;
    }

    renderAllChords() {
        const container = document.getElementById('allChordsList');
        const groups = this.collectChordsByKey();
        container.replaceChildren();

        if (!groups.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerHTML = '<p>No chords in your songs yet.</p>';
            container.appendChild(empty);
            return;
        }

        groups.forEach((group) => {
            const row = document.createElement('div');
            row.className = 'all-chords-row';

            const keyLabel = document.createElement('span');
            keyLabel.className = 'all-chords-key';
            keyLabel.dir = 'ltr';
            keyLabel.textContent = `${group.key}:`;
            row.appendChild(keyLabel);

            const chords = document.createElement('div');
            chords.className = 'all-chords-values';
            group.chords.forEach((chord, index) => {
                const chip = document.createElement('span');
                chip.className = 'training-chord';
                chip.dir = 'ltr';
                chip.textContent = chord;
                chip.style.backgroundColor = this.withAlpha(
                    this.colorPalette[index % this.colorPalette.length],
                    this.highlightAlpha.light
                );
                chords.appendChild(chip);
            });

            row.appendChild(chords);
            container.appendChild(row);
        });
    }

    viewSong(index) {
        this.editingIndex = index;
        this.currentSong = JSON.parse(JSON.stringify(this.songs[index]));
        this.showView('annotation');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getDataPayload() {
        return {
            updatedAt: this.localUpdatedAt || new Date().toISOString(),
            songs: this.songs,
            chordColors: this.chordColors,
            nextColorIndex: this.nextColorIndex
        };
    }

    applyData(data) {
        this.songs = data.songs || [];
        this.chordColors = data.chordColors || {};
        this.nextColorIndex = data.nextColorIndex || 0;
        this.localUpdatedAt = data.updatedAt || this.localUpdatedAt;
        this.remapChordColors();
    }

    loadLocalCache() {
        try {
            const data = localStorage.getItem('chordAnnotatorData');
            if (data) {
                const parsed = JSON.parse(data);
                this.applyData(parsed);
            }
            const token = localStorage.getItem('chordAnnotatorGithubToken');
            if (token) {
                document.getElementById('githubTokenInput').value = token;
            }
        } catch (e) {
            console.error('Error loading data:', e);
        }
    }

    saveLocalCache() {
        try {
            localStorage.setItem('chordAnnotatorData', JSON.stringify(this.getDataPayload()));
        } catch (e) {
            console.error('Error saving data:', e);
            alert('Error saving data. Your device storage might be full.');
        }
    }

    saveData() {
        this.localUpdatedAt = new Date().toISOString();
        this.saveLocalCache();
        this.scheduleGithubPush();
    }

    getGithubToken() {
        return (localStorage.getItem('chordAnnotatorGithubToken') || '').trim();
    }

    toggleSyncPanel() {
        document.getElementById('syncPanel').classList.toggle('open');
    }

    saveGithubToken() {
        const token = document.getElementById('githubTokenInput').value.trim();
        if (!token) {
            localStorage.removeItem('chordAnnotatorGithubToken');
            this.syncState = 'needs-token';
            this.updateSyncBanner();
            return;
        }
        localStorage.setItem('chordAnnotatorGithubToken', token);
        this.syncState = 'saving';
        this.updateSyncBanner();
        this.verifyAndPushToken().catch((error) => {
            this.syncState = 'error';
            this.updateSyncBanner(error.message || 'Token could not save to GitHub.');
        });
    }

    async verifyAndPushToken() {
        await this.verifyGithubToken();
        await this.pushToGithub();
        await this.refreshFromGithub();
    }

    async verifyGithubToken() {
        const token = this.getGithubToken();
        if (!token) {
            throw new Error('Paste the long GitHub access code first.');
        }
        if (!/^(ghp_|github_pat_)/.test(token)) {
            throw new Error('That does not look like a GitHub access code. It should start with ghp_ or github_pat_.');
        }

        const response = await fetch(`https://api.github.com/repos/${this.github.owner}/${this.github.repo}`, {
            headers: this.githubHeaders()
        }).catch((error) => {
            throw new Error(this.friendlyNetworkError(error));
        });
        if (!response.ok) {
            throw new Error(await this.readGithubError(response));
        }
    }

    async readGithubError(response) {
        let githubMessage = '';
        try {
            const body = await response.json();
            githubMessage = body.message || '';
        } catch (e) {
            githubMessage = '';
        }

        if (response.status === 401) {
            return 'GitHub says this token is invalid. Paste the long code shown once (ghp_ or github_pat_), not the token name.';
        }
        if (response.status === 403) {
            return 'GitHub blocked write access. Create a classic token with public_repo checked, then paste the long code.';
        }
        if (response.status === 404) {
            return 'This token cannot see the Chord repo. Create a new token with public_repo checked.';
        }
        return githubMessage || `GitHub save failed (${response.status}).`;
    }

    githubHeaders(includeAuth = true) {
        const headers = {
            Accept: 'application/vnd.github+json'
        };
        const token = this.getGithubToken();
        if (includeAuth && token) {
            headers.Authorization = `Bearer ${token}`;
        }
        return headers;
    }

    githubGetHeaders() {
        const headers = this.githubHeaders();
        headers['If-None-Match'] = `"nocache-${Date.now()}-${Math.random().toString(16).slice(2)}"`;
        return headers;
    }

    githubContentsUrl() {
        const { owner, repo, path, branch } = this.github;
        return `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
    }

    githubWriteUrl() {
        const { owner, repo, path } = this.github;
        return `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    }

    encodeBase64(text) {
        const bytes = new TextEncoder().encode(text);
        let binary = '';
        bytes.forEach((byte) => {
            binary += String.fromCharCode(byte);
        });
        return btoa(binary);
    }

    decodeBase64(content) {
        const clean = String(content || '').replace(/\n/g, '');
        const binary = atob(clean);
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    }

    async fetchGithubData(requireAuth = false) {
        try {
            const response = await fetch(this.githubContentsUrl(), {
                headers: this.githubGetHeaders()
            });
            if (response.status === 404) {
                if (requireAuth) return { data: null, sha: null };
                return this.fetchStaticSongsFile();
            }
            if (!response.ok) {
                if (!requireAuth) return this.fetchStaticSongsFile();
                throw new Error(await this.readGithubError(response));
            }
            const payload = await response.json();
            const parsed = JSON.parse(this.decodeBase64(payload.content));
            return { data: parsed, sha: payload.sha };
        } catch (error) {
            if (requireAuth) {
                throw new Error(this.friendlyNetworkError(error));
            }
            return this.fetchStaticSongsFile();
        }
    }

    async fetchStaticSongsFile() {
        const response = await fetch('songs-data.json', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Could not load songs from GitHub');
        }
        return { data: await response.json(), sha: this.githubSha };
    }

    async refreshFromGithub() {
        this.syncState = 'loading';
        this.updateSyncBanner();
        try {
            const { data, sha } = await this.fetchGithubData();
            this.githubSha = sha;
            const githubTime = Date.parse(data && data.updatedAt ? data.updatedAt : 0) || 0;
            const localTime = Date.parse(this.localUpdatedAt || 0) || 0;
            const githubSongs = data && Array.isArray(data.songs) ? data.songs : [];
            const hasGithub = githubSongs.length > 0;
            const hasLocal = this.songs.length > 0;

            if (hasGithub && (!hasLocal || githubTime >= localTime)) {
                this.applyData(data);
                this.saveLocalCache();
            } else if (hasLocal && this.getGithubToken() && (!hasGithub || localTime > githubTime)) {
                this.scheduleGithubPush();
            } else if (hasGithub && !hasLocal) {
                this.applyData(data);
                this.saveLocalCache();
            }

            this.syncState = this.getGithubToken() ? 'ok' : 'needs-token';
            this.renderSongList();
            this.updateSyncBanner();
        } catch (error) {
            console.error('GitHub sync error:', error);
            this.syncState = this.songs.length ? 'offline' : 'error';
            this.updateSyncBanner(this.friendlyNetworkError(error));
            this.renderSongList();
        }
    }

    friendlyNetworkError(error) {
        const message = error && error.message ? String(error.message) : '';
        if (/failed to fetch|networkerror|load failed/i.test(message)) {
            return 'Could not reach GitHub. Showing songs saved on this phone.';
        }
        return message || 'Could not reach GitHub.';
    }

    scheduleGithubPush() {
        if (!this.getGithubToken()) {
            this.syncState = 'needs-token';
            this.updateSyncBanner();
            return;
        }
        clearTimeout(this.githubPushTimer);
        this.syncState = 'saving';
        this.updateSyncBanner();
        this.githubPushTimer = setTimeout(() => {
            this.pushToGithub().catch((error) => {
                console.error(error);
                this.syncState = 'error';
                this.updateSyncBanner(error.message || 'Could not save to GitHub.');
            });
        }, 1500);
    }

    async fetchRemoteBlobSha() {
        const { owner, repo, path, branch } = this.github;
        const headers = this.githubGetHeaders();
        const refRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
            { headers }
        );
        if (refRes.status === 404) return null;
        if (!refRes.ok) {
            throw new Error(await this.readGithubError(refRes));
        }
        const ref = await refRes.json();
        const commitSha = ref.object && ref.object.sha;
        if (!commitSha) return null;

        const fileRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(commitSha)}`,
            { headers: this.githubGetHeaders() }
        );
        if (fileRes.status === 404) return null;
        if (!fileRes.ok) {
            throw new Error(await this.readGithubError(fileRes));
        }
        const file = await fileRes.json();
        return file.sha || null;
    }

    async pushToGithub() {
        const token = this.getGithubToken();
        if (!token) {
            this.syncState = 'needs-token';
            this.updateSyncBanner();
            return;
        }

        if (this.githubPushInFlight) {
            this.githubPushQueued = true;
            return;
        }

        this.githubPushInFlight = true;
        try {
            let lastError = null;

            for (let attempt = 0; attempt < 5; attempt++) {
                const payload = this.encodeBase64(JSON.stringify(this.getDataPayload(), null, 2));
                const sha = await this.fetchRemoteBlobSha();
                this.githubSha = sha;

                const body = {
                    message: 'Update songs',
                    content: payload,
                    branch: this.github.branch
                };
                if (sha) {
                    body.sha = sha;
                }

                const response = await fetch(this.githubWriteUrl(), {
                    method: 'PUT',
                    headers: {
                        ...this.githubHeaders(),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });

                if (response.ok) {
                    const saved = await response.json();
                    this.githubSha = saved.content && saved.content.sha;
                    this.syncState = 'ok';
                    this.updateSyncBanner();
                    return;
                }

                const conflict = response.status === 409 || response.status === 422;
                lastError = await this.readGithubError(response);
                if (!conflict) {
                    throw new Error(lastError);
                }
                await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
            }

            throw new Error('Could not save to GitHub. Tap Done or Save again.');
        } finally {
            this.githubPushInFlight = false;
            if (this.githubPushQueued) {
                this.githubPushQueued = false;
                await this.pushToGithub();
            }
        }
    }

    updateSyncBanner(detail) {
        const banner = document.getElementById('syncBanner');
        if (!banner) return;
        banner.classList.remove('error', 'ok');

        if (this.syncState === 'loading') {
            banner.textContent = 'Loading songs from GitHub…';
        } else if (this.syncState === 'saving') {
            banner.textContent = 'Saving songs to GitHub…';
        } else if (this.syncState === 'ok') {
            banner.classList.add('ok');
            banner.textContent = 'Songs are synced with GitHub. This list is the same on every device.';
        } else if (this.syncState === 'needs-token') {
            banner.textContent = 'Songs load from GitHub. Tap GitHub and add a token to save from this device.';
        } else if (this.syncState === 'offline') {
            banner.classList.add('error');
            banner.textContent = detail || 'Could not reach GitHub. Showing songs saved on this device.';
        } else {
            banner.classList.add('error');
            banner.textContent = detail || 'Could not sync with GitHub.';
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new ChordAnnotatorApp();
    });
} else {
    window.app = new ChordAnnotatorApp();
}
