// Music Chord Annotator App
class ChordAnnotatorApp {
    constructor() {
        this.songs = [];
        this.currentSong = null;
        this.currentView = 'songList';
        this.editingIndex = -1;
        this.chordColors = {};
        this.nextColorIndex = 0;
        
        // Predefined color palette for chords
        this.colorPalette = [
            '#FFE5B4', // Peach
            '#BFEFFF', // Light Blue
            '#FFD1DC', // Pink
            '#E0FFE0', // Light Green
            '#FFE4E1', // Misty Rose
            '#F0E68C', // Khaki
            '#DDA0DD', // Plum
            '#AFEEEE', // Pale Turquoise
            '#FFB6C1', // Light Pink
            '#98FB98', // Pale Green
            '#F5DEB3', // Wheat
            '#D8BFD8', // Thistle
            '#B0E0E6', // Powder Blue
            '#FFDAB9', // Peach Puff
            '#E6E6FA', // Lavender
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
        // Navigation
        document.getElementById('newSongBtn').addEventListener('click', () => this.createNewSong());
        document.getElementById('backToListBtn').addEventListener('click', () => this.showView('songList'));
        document.getElementById('backToEditorBtn').addEventListener('click', () => this.showView('editor'));
        
        // Editor
        document.getElementById('saveEditorBtn').addEventListener('click', () => this.saveSong());
        document.getElementById('proceedToAnnotateBtn').addEventListener('click', () => this.proceedToAnnotation());
        
        // Annotation
        document.getElementById('doneAnnotatingBtn').addEventListener('click', () => this.finishAnnotation());
        document.getElementById('lyricsDisplay').addEventListener('mouseup', (e) => this.handleTextSelection(e));
        document.getElementById('lyricsDisplay').addEventListener('touchend', (e) => this.handleTextSelection(e));
        
        // Chord Modal
        document.getElementById('cancelChordBtn').addEventListener('click', () => this.closeChordModal());
        document.getElementById('saveChordBtn').addEventListener('click', () => this.saveChord());
        document.getElementById('chordInput').addEventListener('input', (e) => this.filterChordSuggestions(e.target.value));
        document.getElementById('chordInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveChord();
        });
        
        // Close modal on background click
        document.getElementById('chordModal').addEventListener('click', (e) => {
            if (e.target.id === 'chordModal') this.closeChordModal();
        });
    }
    
    showView(viewName) {
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
        
        if (viewName === 'songList') {
            document.getElementById('songListView').classList.add('active');
            this.renderSongList();
        } else if (viewName === 'editor') {
            document.getElementById('editorView').classList.add('active');
        } else if (viewName === 'annotation') {
            document.getElementById('annotationView').classList.add('active');
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
            createdAt: new Date().toISOString()
        };
        
        document.getElementById('editorTitle').textContent = 'New Song';
        document.getElementById('songTitle').value = '';
        document.getElementById('songArtist').value = '';
        document.getElementById('songLyrics').value = '';
        
        this.showView('editor');
    }
    
    editSong(index) {
        this.editingIndex = index;
        this.currentSong = JSON.parse(JSON.stringify(this.songs[index]));
        
        document.getElementById('editorTitle').textContent = 'Edit Song';
        document.getElementById('songTitle').value = this.currentSong.title;
        document.getElementById('songArtist').value = this.currentSong.artist || '';
        document.getElementById('songLyrics').value = this.currentSong.lyrics;
        
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
        
        if (this.editingIndex >= 0) {
            this.songs[this.editingIndex] = this.currentSong;
        } else {
            this.songs.push(this.currentSong);
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
        
        if (!this.currentSong.annotations) {
            this.currentSong.annotations = [];
        }
        
        this.showView('annotation');
    }
    
    renderAnnotationView() {
        const display = document.getElementById('lyricsDisplay');
        document.getElementById('annotationTitle').textContent = this.currentSong.title;
        
        // Check if text is RTL (Persian/Arabic)
        const isPersian = /[\u0600-\u06FF]/.test(this.currentSong.lyrics);
        if (isPersian) {
            display.classList.add('rtl');
        } else {
            display.classList.remove('rtl');
        }
        
        // Build annotated lyrics
        if (!this.currentSong.annotations || this.currentSong.annotations.length === 0) {
            display.textContent = this.currentSong.lyrics;
        } else {
            this.renderAnnotatedLyrics();
        }
        
        this.updateChordLegend();
    }
    
    renderAnnotatedLyrics() {
        const display = document.getElementById('lyricsDisplay');
        const lyrics = this.currentSong.lyrics;
        const annotations = this.currentSong.annotations.sort((a, b) => a.start - b.start);
        
        let html = '';
        let lastIndex = 0;
        
        annotations.forEach(annotation => {
            // Add text before annotation
            html += this.escapeHtml(lyrics.substring(lastIndex, annotation.start));
            
            // Add annotated text
            const text = lyrics.substring(annotation.start, annotation.end);
            const color = this.getChordColor(annotation.chord);
            html += `<span class="chord-annotation" style="background-color: ${color}" data-chord="${this.escapeHtml(annotation.chord)}">`;
            html += `<span class="chord-label">${this.escapeHtml(annotation.chord)}</span>`;
            html += this.escapeHtml(text);
            html += '</span>';
            
            lastIndex = annotation.end;
        });
        
        // Add remaining text
        html += this.escapeHtml(lyrics.substring(lastIndex));
        
        display.innerHTML = html;
        
        // Add click handlers for annotations
        display.querySelectorAll('.chord-annotation').forEach(elem => {
            elem.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editAnnotation(elem);
            });
        });
    }
    
    handleTextSelection(e) {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        if (!selectedText) return;
        
        const display = document.getElementById('lyricsDisplay');
        const range = selection.getRangeAt(0);
        
        // Calculate character positions
        const preRange = document.createRange();
        preRange.selectNodeContents(display);
        preRange.setEnd(range.startContainer, range.startOffset);
        
        const start = preRange.toString().length;
        const end = start + selectedText.length;
        
        this.showChordModal(selectedText, start, end);
        selection.removeAllRanges();
    }
    
    showChordModal(text, start, end) {
        this.currentSelection = { text, start, end };
        
        document.querySelector('.selected-text-preview').textContent = `"${text}"`;
        document.getElementById('chordInput').value = '';
        document.getElementById('chordModal').classList.add('active');
        
        this.renderChordSuggestions(this.commonChords);
        
        // Focus input
        setTimeout(() => {
            document.getElementById('chordInput').focus();
        }, 100);
    }
    
    closeChordModal() {
        document.getElementById('chordModal').classList.remove('active');
        this.currentSelection = null;
    }
    
    saveChord() {
        const chord = document.getElementById('chordInput').value.trim().toUpperCase();
        
        if (!chord) {
            alert('Please enter a chord');
            return;
        }
        
        if (!this.currentSelection) return;
        
        // Add new annotation
        this.currentSong.annotations.push({
            chord: chord,
            start: this.currentSelection.start,
            end: this.currentSelection.end
        });
        
        // Assign color if new chord
        if (!this.chordColors[chord]) {
            this.chordColors[chord] = this.colorPalette[this.nextColorIndex % this.colorPalette.length];
            this.nextColorIndex++;
        }
        
        this.renderAnnotationView();
        this.closeChordModal();
    }
    
    editAnnotation(element) {
        const chord = element.getAttribute('data-chord');
        
        const action = confirm(`Chord: ${chord}\n\nDo you want to remove this chord annotation?\n\nOK = Remove\nCancel = Keep`);
        
        if (action) {
            // Remove annotation
            const text = element.textContent.replace(chord, '').trim();
            const allText = document.getElementById('lyricsDisplay').textContent;
            const start = allText.indexOf(text);
            
            this.currentSong.annotations = this.currentSong.annotations.filter(a => 
                !(a.chord === chord && a.start === start)
            );
            
            this.renderAnnotationView();
        }
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
            btn.className = 'chord-suggestion';
            btn.textContent = chord;
            btn.addEventListener('click', () => {
                document.getElementById('chordInput').value = chord;
                this.saveChord();
            });
            container.appendChild(btn);
        });
    }
    
    updateChordLegend() {
        const usedChords = new Set(this.currentSong.annotations.map(a => a.chord));
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
        if (this.editingIndex >= 0) {
            this.songs[this.editingIndex] = this.currentSong;
        } else {
            this.songs.push(this.currentSong);
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

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new ChordAnnotatorApp();
    });
} else {
    window.app = new ChordAnnotatorApp();
}
