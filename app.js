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
        this.history = [];
        this.historyIndex = -1;
        this.lastSelectionAt = 0;
        this.ignoreAnnotationClick = false;

        this.colorPalette = [
            '#FFE5B4',
            '#BFEFFF',
            '#FFD1DC',
            '#E0FFE0',
            '#FFE4E1',
            '#F0E68C',
            '#DDA0DD',
            '#AFEEEE',
            '#FFB6C1',
            '#98FB98',
            '#F5DEB3',
            '#D8BFD8',
            '#B0E0E6',
            '#FFDAB9',
            '#E6E6FA',
        ];

        this.commonChords = [
            'C', 'D', 'E', 'F', 'G', 'A', 'B',
            'Cm', 'Dm', 'Em', 'Fm', 'Gm', 'Am', 'Bm',
            'C7', 'D7', 'E7', 'F7', 'G7', 'A7', 'B7'
        ];

        this.init();
    }

    init() {
        this.loadData();
        this.setupEventListeners();
        this.renderSongList();
    }

    setupEventListeners() {
        document.getElementById('newSongBtn').addEventListener('click', () => this.createNewSong());
        document.getElementById('backToListBtn').addEventListener('click', () => this.showView('songList'));
        document.getElementById('backToEditorBtn').addEventListener('click', () => {
            this.closeChordModal();
            this.showView('editor');
        });

        document.getElementById('saveEditorBtn').addEventListener('click', () => this.saveSong());
        document.getElementById('proceedToAnnotateBtn').addEventListener('click', () => this.proceedToAnnotation());
        document.getElementById('alignLeftBtn').addEventListener('click', () => this.setTextAlign('left'));
        document.getElementById('alignRightBtn').addEventListener('click', () => this.setTextAlign('right'));

        document.getElementById('doneAnnotatingBtn').addEventListener('click', () => this.finishAnnotation());
        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('redoBtn').addEventListener('click', () => this.redo());

        const lyricsContent = document.getElementById('lyricsContent');
        lyricsContent.addEventListener('mouseup', (e) => this.handleTextSelection(e));
        lyricsContent.addEventListener('touchend', (e) => this.handleTextSelection(e));
        lyricsContent.addEventListener('click', (e) => {
            const annotation = e.target.closest('.chord-annotation');
            if (annotation) {
                e.stopPropagation();
                this.editAnnotation(annotation);
            }
        });

        document.getElementById('cancelChordBtn').addEventListener('click', () => this.closeChordModal());
        document.getElementById('saveChordBtn').addEventListener('click', () => this.saveChord());
        document.getElementById('removeChordBtn').addEventListener('click', () => this.removePendingChord());
        document.getElementById('chordInput').addEventListener('input', (e) => {
            if (this.pendingEdit) {
                this.pendingEdit.chord = e.target.value;
            }
            this.filterChordSuggestions(e.target.value);
        });
        document.getElementById('chordInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveChord();
        });

        this.bindHandle('startHandle', 'start');
        this.bindHandle('endHandle', 'end');

        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        window.addEventListener('scroll', () => this.positionHandles(), true);
        window.addEventListener('resize', () => this.positionHandles());
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
        } else if (viewName === 'editor') {
            this.closeChordModal();
            document.getElementById('editorView').classList.add('active');
            this.applyTextAlign();
        } else if (viewName === 'annotation') {
            document.getElementById('annotationView').classList.add('active');
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
        const snapshot = JSON.parse(JSON.stringify(this.currentSong.annotations || []));
        this.history = [snapshot];
        this.historyIndex = 0;
        this.updateUndoRedoButtons();
    }

    commitAnnotations(annotations) {
        this.currentSong.annotations = annotations;
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(JSON.parse(JSON.stringify(annotations)));
        this.historyIndex++;
        this.updateUndoRedoButtons();
        this.persistCurrentSong();
    }

    persistCurrentSong() {
        if (this.editingIndex >= 0 && this.currentSong) {
            this.songs[this.editingIndex] = this.currentSong;
            this.saveData();
        }
    }

    undo() {
        if (this.historyIndex <= 0) return;
        this.closeChordModal();
        this.historyIndex--;
        this.currentSong.annotations = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
        this.persistCurrentSong();
        this.renderAnnotationView();
        this.updateUndoRedoButtons();
    }

    redo() {
        if (this.historyIndex >= this.history.length - 1) return;
        this.closeChordModal();
        this.historyIndex++;
        this.currentSong.annotations = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
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

    renderAnnotationView() {
        document.getElementById('annotationTitle').textContent = this.currentSong.title;

        this.applyTextAlign();

        this.renderAnnotatedLyrics();
        this.updateChordLegend();
        this.positionHandles();
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

    renderAnnotatedLyrics() {
        const content = document.getElementById('lyricsContent');
        const lyrics = this.currentSong.lyrics;
        const annotations = this.getDisplayAnnotations();

        if (!lyrics) {
            content.textContent = '';
            return;
        }

        const points = new Set([0, lyrics.length]);
        annotations.forEach(annotation => {
            points.add(this.clampOffset(annotation.start));
            points.add(this.clampOffset(annotation.end));
        });
        const sorted = Array.from(points).sort((a, b) => a - b);

        let html = '';
        for (let i = 0; i < sorted.length - 1; i++) {
            const start = sorted[i];
            const end = sorted[i + 1];
            if (start === end) continue;

            const text = lyrics.substring(start, end);
            const covering = annotations.filter(a => a.start <= start && a.end >= end);
            const pending = covering.find(a => a.pending);
            const annotation = pending || covering[0];

            if (annotation) {
                const isFirst = start === annotation.start;
                const color = annotation.chord
                    ? this.getChordColor(annotation.chord)
                    : 'rgba(79, 70, 229, 0.22)';
                const pendingClass = annotation.pending ? ' pending' : '';
                html += `<span class="chord-annotation${pendingClass}" data-index="${annotation.index}" style="background-color: ${color}">`;
                if (isFirst && annotation.chord) {
                    html += `<span class="chord-label">${this.escapeHtml(annotation.chord)}</span>`;
                }
                html += `<span class="lyric-text">${this.escapeHtml(text)}</span>`;
                html += '</span>';
            } else {
                html += this.escapeHtml(text);
            }
        }

        content.innerHTML = html;
    }

    clampOffset(value) {
        const length = this.currentSong.lyrics.length;
        return Math.max(0, Math.min(length, value));
    }

    isLabelNode(node) {
        const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        return Boolean(element && element.closest && element.closest('.chord-label'));
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
            const annotation = range.startContainer.parentElement.closest('.chord-annotation');
            if (annotation) {
                const index = Number(annotation.getAttribute('data-index'));
                const match = this.getDisplayAnnotations().find(a => a.index === index) ||
                    this.getDisplayAnnotations().find(a => a.pending);
                if (match) {
                    return this.draggingHandle === 'start' ? match.start : match.end;
                }
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

    handleTextSelection(e) {
        if (this.draggingHandle) return;
        if (e.target.closest && e.target.closest('.sel-handle')) return;

        const run = () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;

            const selectedText = selection.toString();
            if (!selectedText || !selectedText.trim()) return;

            const content = document.getElementById('lyricsContent');
            const range = selection.getRangeAt(0);
            if (!content.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== content) {
                return;
            }

            const start = this.getLyricOffset(content, range.startContainer, range.startOffset);
            const end = this.getLyricOffset(content, range.endContainer, range.endOffset);
            const normalizedStart = Math.min(start, end);
            const normalizedEnd = Math.max(start, end);

            if (normalizedStart === normalizedEnd) return;
            if (Date.now() - this.lastSelectionAt < 350 &&
                this.pendingEdit &&
                this.pendingEdit.start === normalizedStart &&
                this.pendingEdit.end === normalizedEnd) {
                return;
            }

            this.lastSelectionAt = Date.now();
            this.ignoreAnnotationClick = true;
            setTimeout(() => { this.ignoreAnnotationClick = false; }, 300);

            selection.removeAllRanges();
            this.openPendingEdit({
                type: 'create',
                index: -1,
                start: normalizedStart,
                end: normalizedEnd,
                chord: ''
            });
        };

        if (e.type === 'touchend') {
            setTimeout(run, 20);
        } else {
            run();
        }
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

        this.renderChordSuggestions(this.commonChords);
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
        const display = document.getElementById('lyricsDisplay');

        if (!this.pendingEdit || this.currentView !== 'annotation') {
            startHandle.hidden = true;
            endHandle.hidden = true;
            return;
        }

        const range = this.getRangeForOffsets(this.pendingEdit.start, this.pendingEdit.end);
        if (!range) {
            startHandle.hidden = true;
            endHandle.hidden = true;
            return;
        }

        const rects = Array.from(range.getClientRects()).filter(rect => rect.width || rect.height);
        if (!rects.length) {
            startHandle.hidden = true;
            endHandle.hidden = true;
            return;
        }

        const displayRect = display.getBoundingClientRect();
        const isRtl = display.classList.contains('rtl');
        const first = rects[0];
        const last = rects[rects.length - 1];

        const startX = isRtl ? first.right : first.left;
        const startY = first.top;
        const endX = isRtl ? last.left : last.right;
        const endY = last.bottom;

        startHandle.hidden = false;
        endHandle.hidden = false;
        startHandle.style.left = `${startX - displayRect.left + display.scrollLeft}px`;
        startHandle.style.top = `${startY - displayRect.top + display.scrollTop}px`;
        endHandle.style.left = `${endX - displayRect.left + display.scrollLeft}px`;
        endHandle.style.top = `${endY - displayRect.top + display.scrollTop}px`;
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

        if (!this.chordColors[chord]) {
            this.chordColors[chord] = this.colorPalette[this.nextColorIndex % this.colorPalette.length];
            this.nextColorIndex++;
        }

        let next = (this.currentSong.annotations || []).map(annotation => ({ ...annotation }));

        if (this.pendingEdit.type === 'update' && this.pendingEdit.index >= 0) {
            next[this.pendingEdit.index] = { chord, start, end };
        } else {
            next.push({ chord, start, end });
        }

        next = this.resolveOverlaps(next, this.pendingEdit.type === 'update' ? this.pendingEdit.index : next.length - 1);

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

    filterChordSuggestions(input) {
        const filtered = this.commonChords.filter(chord =>
            chord.toLowerCase().startsWith(input.toLowerCase())
        );
        this.renderChordSuggestions(filtered);
    }

    renderChordSuggestions(chords) {
        const container = document.getElementById('chordSuggestions');
        container.innerHTML = '';

        chords.slice(0, 12).forEach(chord => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'chord-suggestion';
            btn.textContent = chord;
            btn.addEventListener('click', () => {
                document.getElementById('chordInput').value = chord;
                if (this.pendingEdit) this.pendingEdit.chord = chord;
                this.saveChord();
            });
            container.appendChild(btn);
        });
    }

    updateChordLegend() {
        const usedChords = new Set((this.currentSong.annotations || []).map(a => a.chord));
        const container = document.getElementById('chordLegendList');

        if (usedChords.size === 0) {
            container.innerHTML = '<p style="color: var(--text-light); font-size: 0.875rem;">No chords added yet</p>';
            return;
        }

        container.innerHTML = '';

        Array.from(usedChords).sort().forEach(chord => {
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.style.backgroundColor = this.getChordColor(chord);

            const colorBox = document.createElement('div');
            colorBox.className = 'legend-color';
            colorBox.style.backgroundColor = this.getChordColor(chord);

            const label = document.createElement('span');
            label.textContent = chord;

            item.appendChild(colorBox);
            item.appendChild(label);
            container.appendChild(item);
        });
    }

    getChordColor(chord) {
        if (!this.chordColors[chord]) {
            this.chordColors[chord] = this.colorPalette[this.nextColorIndex % this.colorPalette.length];
            this.nextColorIndex++;
        }
        return this.chordColors[chord];
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

    loadData() {
        try {
            const data = localStorage.getItem('chordAnnotatorData');
            if (data) {
                const parsed = JSON.parse(data);
                this.songs = parsed.songs || [];
                this.chordColors = parsed.chordColors || {};
                this.nextColorIndex = parsed.nextColorIndex || 0;
            }
        } catch (e) {
            console.error('Error loading data:', e);
        }
    }

    saveData() {
        try {
            const data = {
                songs: this.songs,
                chordColors: this.chordColors,
                nextColorIndex: this.nextColorIndex
            };
            localStorage.setItem('chordAnnotatorData', JSON.stringify(data));
        } catch (e) {
            console.error('Error saving data:', e);
            alert('Error saving data. Your device storage might be full.');
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
