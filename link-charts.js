(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LinkCharts = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    const CHORD_RE = /^(?:N\.?C\.?|[A-G](?:#|b)?(?:m|maj|dim|aug|sus|add|M)?\d{0,2}(?:(?:sus|add|maj|dim|aug|m)\d{0,2})*(?:(?:b|#|-)\d{1,2})*Y?(?:\/[A-G](?:#|b)?)?)$/;
    const SECTION_RE = /^(?:\[|\()?(?:verse|chorus|bridge|intro|outro|pre[-\s]?chorus|refrain|hook|coda|tag|ending|solo|instrumental|interlude|break|part|capo|key)\b[^\]\)]*(?:\]|\))?$/i;
    const REPEAT_RE = /^(?:\(?[x×]\d+\)?|\d+[x×])$/i;
    const DIRECTIVE_RE = /^\{([^:}]+)\s*:\s*([^}]*)\}$/;
    const SKIP_DIRECTIVE_RE = /^\{(?:soc|eoc|sob|eob|sot|eot|start_of_chorus|end_of_chorus|start_of_tab|end_of_tab)\}$/i;

    function decodeEntities(text) {
        return String(text || '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&apos;/gi, "'")
            .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
            .replace(/&#(\d+);/g, (_, num) => safeCodePoint(Number(num)));
    }

    function safeCodePoint(value) {
        if (!Number.isFinite(value) || value < 0 || value > 0x10FFFF) return '';
        try {
            return String.fromCodePoint(value);
        } catch (error) {
            return '';
        }
    }

    function cleanHeading(raw) {
        let title = decodeEntities(raw).replace(/\s+/g, ' ').trim();
        const persianChart = title.match(/^آکورد(?:\s+گیتار)?\s+آهنگ\s+(.+?)\s+از\s+(.+?)(?:\s*[-–—|].*)?$/);
        if (persianChart) {
            return { title: persianChart[1].trim(), artist: persianChart[2].trim() };
        }
        title = title.replace(/\s*[-–—|]\s*لامینور\s*$/i, '').trim();
        title = title.replace(/\s*[\|\-–—:]\s*(?:ultimate-guitar|ultimate guitar|e-chords|worship chords|cifraclub|chordify|songsterr|guitar ?tab)\b.*$/i, '');
        let artist = '';
        const by = title.match(/^(.*?)\s+chords\s+by\s+(.+)$/i);
        const dashed = title.match(/^(.*?)\s+chords\s*[-–—|]\s*(.+)$/i);
        if (by) {
            title = by[1];
            artist = by[2];
        } else if (dashed) {
            title = dashed[1];
            artist = dashed[2];
        } else {
            title = title.replace(/\s+(?:chords|tabs|chord chart|guitar tab)$/i, '');
        }
        return { title: title.trim(), artist: artist.replace(/\s+(?:chords|tabs)$/i, '').trim() };
    }

    function isPrivateHost(hostname) {
        const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
        if (!host) return true;
        if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
            return true;
        }
        const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (v4) {
            const parts = v4.slice(1).map(Number);
            if (parts.some((part) => part > 255)) return true;
            const a = parts[0];
            const b = parts[1];
            if (a === 0 || a === 10 || a === 127) return true;
            if (a === 169 && b === 254) return true;
            if (a === 172 && b >= 16 && b <= 31) return true;
            if (a === 192 && b === 168) return true;
            if (a === 100 && b >= 64 && b <= 127) return true;
            if (a >= 224) return true;
            return false;
        }
        if (host.includes(':')) {
            if (host === '::1' || host === '::') return true;
            if (/^f[cd]/i.test(host) || /^fe80:/i.test(host)) return true;
            if (host.startsWith('::ffff:')) return isPrivateHost(host.slice(7));
        }
        return false;
    }

    function parsePublicHttpUrl(value, sameOrigin) {
        let raw = String(value || '')
            .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]/g, '')
            .trim();
        if (!raw) return null;
        const embedded = raw.match(/https?:\/\/[^\s<>"']+/i);
        if (embedded) raw = embedded[0];
        raw = raw.replace(/[),.;]+$/, '');
        if (raw.length > 2000) return null;
        if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
            if (!raw.includes('.') || /\s/.test(raw)) return null;
            raw = `https://${raw}`;
        }
        let url;
        try {
            url = new URL(raw);
        } catch (error) {
            return null;
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        if (url.username || url.password) return null;
        const same = sameOrigin && url.origin === sameOrigin;
        if (!same && isPrivateHost(url.hostname)) return null;
        url.hash = '';
        return url;
    }

    function isChordToken(token) {
        let text = String(token || '').trim();
        text = text.replace(/^[([{"']+|[)\]}"',.;:]+$/g, '');
        text = text.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/Δ/g, 'maj');
        text = text.replace(/^([A-G](?:#|b)?)min(?=\d|\/|$)/i, '$1m');
        if (!text || text.length > 16) return '';
        if (!CHORD_RE.test(text)) return '';
        return text[0] === 'N' || text[0] === 'n' ? text.toUpperCase().replace(/^NC$/, 'N.C.') : text;
    }

    function isRepeatToken(token) {
        return REPEAT_RE.test(String(token || '').trim());
    }

    function lineTokens(line) {
        const tokens = [];
        const re = /[^\s|]+/g;
        let match;
        while ((match = re.exec(line))) {
            tokens.push({ text: match[0], col: match.index });
        }
        return tokens;
    }

    function chordPlacements(line) {
        const tokens = lineTokens(line);
        if (!tokens.length || tokens.length > 20) return null;
        const placements = [];
        for (const token of tokens) {
            if (isRepeatToken(token.text)) continue;
            const chord = isChordToken(token.text);
            if (!chord) return null;
            placements.push({ name: chord, col: token.col });
        }
        return placements.length ? placements : null;
    }

    function bracketChords(inner) {
        const tokens = String(inner || '').trim().split(/\s+/).filter(Boolean);
        if (!tokens.length || tokens.length > 6) return '';
        const names = [];
        for (const token of tokens) {
            const chord = isChordToken(token);
            if (!chord) return '';
            names.push(chord);
        }
        return names.join(' ');
    }

    function isSectionLine(line) {
        const text = String(line || '').trim().replace(/^#{1,6}\s+/, '');
        if (!text || text.length > 48) return false;
        if (SECTION_RE.test(text)) return text.replace(/^\[|\]$/g, '').trim();
        return '';
    }

    function isMostlyRtl(text) {
        const arabic = (String(text).match(/[\u0600-\u06FF]/g) || []).length;
        const latin = (String(text).match(/[A-Za-z]/g) || []).length;
        return arabic > 0 && arabic >= latin;
    }

    function wordSpans(text) {
        const words = [];
        const re = /\S+/g;
        let match;
        while ((match = re.exec(text))) {
            words.push({ start: match.index, end: match.index + match[0].length });
        }
        return words;
    }

    function snapToWord(text, index) {
        if (index <= 0) return 0;
        if (index >= text.length) {
            const words = wordSpans(text);
            return words.length ? words[words.length - 1].start : 0;
        }
        if (/\s/.test(text[index])) {
            const next = text.slice(index).search(/\S/);
            return next < 0 ? text.length : index + next;
        }
        let start = index;
        while (start > 0 && !/\s/.test(text[start - 1])) start -= 1;
        return start;
    }

    function spacedColumns(line, placements) {
        if (placements.length === 1) {
            return line.trim().length > placements[0].name.length + 2;
        }
        for (let i = 1; i < placements.length; i += 1) {
            const previousEnd = placements[i - 1].col + placements[i - 1].name.length;
            if (placements[i].col - previousEnd >= 2) return true;
        }
        return false;
    }

    function mergePlacements(items) {
        const merged = [];
        items.forEach((item) => {
            const last = merged[merged.length - 1];
            if (last && last.start === item.start) {
                last.chord = `${last.chord} ${item.chord}`;
                return;
            }
            merged.push({ chord: item.chord, start: item.start });
        });
        return merged;
    }

    function finishSpans(text, items) {
        const merged = mergePlacements(items.filter((item) => item.start < text.length));
        return merged.map((item, index) => {
            const next = merged[index + 1];
            const end = next ? next.start : text.length;
            return end > item.start ? { chord: item.chord, start: item.start, end } : null;
        }).filter(Boolean);
    }

    function distributeWords(text, names) {
        const words = wordSpans(text);
        if (!words.length) return instrumental(names);
        const count = names.length;
        const items = [];
        for (let i = 0; i < count; i += 1) {
            const startWord = Math.min(words.length - 1, Math.floor(i * words.length / count));
            items.push({ chord: names[i], start: words[startWord].start });
        }
        return { text, annotations: finishSpans(text, items) };
    }

    function alignColumns(chordLine, placements, lyric) {
        if (isMostlyRtl(lyric) || !spacedColumns(chordLine, placements)) {
            return distributeWords(lyric.trim(), placements.map((item) => item.name));
        }
        const items = placements.map((item) => ({
            chord: item.name,
            start: snapToWord(lyric, item.col)
        }));
        const trimmed = lyric.trimEnd();
        return { text: trimmed, annotations: finishSpans(trimmed, items) };
    }

    function instrumental(names) {
        let text = '';
        const annotations = [];
        names.forEach((name, index) => {
            if (index) text += ' ';
            const start = text.length;
            text += '·';
            annotations.push({ chord: name, start, end: text.length });
        });
        return { text, annotations };
    }

    function parseInline(line) {
        const matches = [...line.matchAll(/\[([^\]\n]+)\]/g)];
        if (!matches.some((match) => bracketChords(match[1]))) return null;
        let lyrics = '';
        let last = 0;
        const pending = [];
        matches.forEach((match) => {
            lyrics += line.slice(last, match.index);
            const chord = bracketChords(match[1]);
            if (chord) pending.push({ chord, start: lyrics.length });
            else lyrics += match[0];
            last = match.index + match[0].length;
        });
        lyrics += line.slice(last);
        lyrics = lyrics.replace(/\s+$/, '');
        const letters = (lyrics.match(/[A-Za-z\u0600-\u06FF0-9]/g) || []).length;
        if (!letters) return instrumental(pending.map((item) => item.chord));
        return { text: lyrics, annotations: finishSpans(lyrics, pending) };
    }

    function parseChartText(text, hints) {
        const source = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[\u200B-\u200D\uFEFF]/g, '');
        const hint = hints || {};
        let title = hint.title || '';
        let artist = hint.artist || '';
        const rows = [];
        let pending = null;
        let blankRun = 0;

        function pushRow(row) {
            rows.push(row);
        }

        function flushPending() {
            if (!pending) return;
            pushRow(instrumental(pending.map((item) => item.name)));
            pending = null;
        }

        source.split('\n').forEach((rawLine) => {
            let line = rawLine.replace(/\u00a0/g, ' ').replace(/\t/g, '    ');
            if (/^\s*```/.test(line)) return;
            line = line.replace(/^\s{0,3}#{1,6}\s+/, '');
            line = line.replace(/\*\*|__|`/g, '');
            const trimmed = line.trim();
            if (!trimmed || /^[-=_*]{3,}$/.test(trimmed)) {
                blankRun += 1;
                if (blankRun >= 2) flushPending();
                pushRow({ text: '', annotations: [] });
                return;
            }
            blankRun = 0;
            const directive = trimmed.match(DIRECTIVE_RE);
            if (directive) {
                const key = directive[1].trim().toLowerCase();
                const value = directive[2].trim();
                if ((key === 'title' || key === 't') && value) title = title || value;
                else if ((key === 'artist' || key === 'subtitle' || key === 'st') && value) artist = artist || value;
                else if ((key === 'comment' || key === 'c' || key === 'comment_italic') && value) {
                    flushPending();
                    pushRow({ text: value, annotations: [] });
                }
                return;
            }
            if (SKIP_DIRECTIVE_RE.test(trimmed)) return;
            const section = isSectionLine(trimmed);
            if (section) {
                flushPending();
                pushRow({ text: section, annotations: [] });
                return;
            }
            const inline = parseInline(line);
            if (inline) {
                flushPending();
                pushRow(inline);
                return;
            }
            const chords = chordPlacements(line);
            if (chords) {
                flushPending();
                pending = chords;
                return;
            }
            if (pending) {
                pushRow(alignColumns(line, pending, line.replace(/\s+$/, '')));
                pending = null;
                return;
            }
            pushRow({ text: trimmed, annotations: [] });
        });
        flushPending();

        let lyrics = '';
        const annotations = [];
        let blanks = 0;
        rows.forEach((row) => {
            if (!row.text) {
                blanks += 1;
                if (lyrics && blanks <= 1) lyrics += '\n';
                return;
            }
            blanks = 0;
            if (lyrics) lyrics += '\n';
            const base = lyrics.length;
            lyrics += row.text;
            (row.annotations || []).forEach((annotation) => {
                if (annotation.end <= annotation.start) return;
                annotations.push({
                    chord: annotation.chord,
                    start: base + annotation.start,
                    end: base + annotation.end
                });
            });
        });
        lyrics = lyrics.replace(/^\n+/, '').replace(/\n+$/, '').replace(/\n{3,}/g, '\n\n');
        if (title && lyrics.split('\n')[0].trim().toLowerCase() === title.trim().toLowerCase()) {
            const cut = lyrics.indexOf('\n');
            const next = cut < 0 ? '' : lyrics.slice(cut + 1);
            const shift = lyrics.length - next.length;
            lyrics = next.replace(/^\n+/, '');
            const dropped = shift + (next.length - lyrics.length);
            annotations.forEach((annotation) => {
                annotation.start -= dropped;
                annotation.end -= dropped;
            });
        }
        const kept = annotations.filter((annotation) => annotation.start >= 0 && annotation.end <= lyrics.length && annotation.end > annotation.start);
        if (!lyrics.trim()) return null;
        return {
            title,
            artist,
            lyrics,
            annotations: kept,
            textAlign: isMostlyRtl(lyrics) ? 'right' : 'left'
        };
    }

    function looksLikeSong(chart) {
        if (!chart || !chart.lyrics.trim()) return false;
        if (chart.annotations.length) return true;
        const lines = chart.lyrics.split('\n').map((line) => line.trim()).filter(Boolean);
        if (lines.length < 4) return false;
        const lengths = lines.map((line) => line.length).sort((a, b) => a - b);
        const median = lengths[Math.floor(lengths.length / 2)];
        const letters = (chart.lyrics.match(/[A-Za-z\u0600-\u06FF]/g) || []).length;
        return median <= 90 && letters >= 40;
    }

    function scoreChart(chart) {
        if (!looksLikeSong(chart)) return 0;
        const lines = chart.lyrics.split('\n').map((line) => line.trim()).filter(Boolean);
        const letters = (chart.lyrics.match(/[A-Za-z\u0600-\u06FF]/g) || []).length;
        const chords = chart.annotations.length;
        const density = chords / Math.max(lines.length, 1);
        const junk = (chart.lyrics.match(/<script|<\/|function |var |[{};]|https?:/gi) || []).length;
        return chords * 1000 + density * 400 + Math.min(letters, 900) - lines.length * 3 - junk * 250;
    }

    function isHtml(text) {
        return /<!doctype html|<html[\s>]|<body[\s>]|<pre[\s>]|<div[\s>]/i.test(text);
    }

    function liftChordElements(html) {
        let current = String(html || '');
        const re = /<(span|a|b|strong|sup|em|i|code)\b([^>]*)>([^<]*)<\/\1>/gi;
        for (let pass = 0; pass < 4; pass += 1) {
            let changed = false;
            current = current.replace(re, (full, tag, attrs, inner) => {
                const data = String(attrs).match(/\bdata-name\s*=\s*["']([^"']+)["']/i);
                const dataChord = data ? bracketChords(decodeEntities(data[1])) : '';
                if (dataChord) {
                    changed = true;
                    return `[${dataChord}]`;
                }
                const classChord = /\bclass\s*=\s*["'][^"']*\b(?:chord|chords|js-chord)\b/i.test(attrs);
                const text = decodeEntities(inner).trim();
                const chord = bracketChords(text);
                if (chord && (classChord || tag === 'sup' || tag === 'b' || tag === 'strong')) {
                    changed = true;
                    return `[${chord}]`;
                }
                return full;
            });
            if (!changed) break;
        }
        return current;
    }

    function preInnerToText(inner) {
        let text = liftChordElements(inner);
        text = text.replace(/<br\s*\/?>/gi, '\n');
        text = convertChTags(text);
        text = text.replace(/<[^>]+>/g, '');
        return decodeEntities(text);
    }

    function extractPres(html) {
        const blocks = [];
        const re = /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi;
        let match;
        while ((match = re.exec(html))) blocks.push(preInnerToText(match[1]));
        return blocks;
    }

    function htmlToPlain(html) {
        let text = String(html || '');
        text = text.replace(/<!--[\s\S]*?-->/g, '');
        text = text.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '');
        text = text.replace(/<(script|style|noscript|svg|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
        text = text.replace(/<(nav|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
        text = liftChordElements(text);
        text = convertChTags(text);
        text = text.replace(/<br\s*\/?>/gi, '\n');
        text = text.replace(/<\/(?:p|div|tr|li|h[1-6]|section|article|blockquote|pre)>/gi, '\n');
        text = text.replace(/<[^>]+>/g, '');
        return decodeEntities(text).replace(/[ \t]+\n/g, '\n');
    }

    function unescapeChart(raw) {
        return String(raw || '')
            .replace(/\\r\\n/g, '\n')
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, ' ')
            .replace(/\\"/g, '"')
            .replace(/\\u003c/gi, '<')
            .replace(/\\u003e/gi, '>');
    }

    function convertChTags(text) {
        return String(text || '').replace(/\[ch\]([\s\S]*?)\[\/ch\]/gi, (_, chord) => {
            const name = bracketChords(decodeEntities(String(chord).replace(/<[^>]+>/g, '')));
            return name ? `[${name}]` : '';
        }).replace(/\[\/?tab\]/gi, '');
    }

    function extractChRegion(raw) {
        const decoded = unescapeChart(raw);
        const lower = decoded.toLowerCase();
        const start = lower.indexOf('[ch]');
        const end = lower.lastIndexOf('[/ch]');
        if (start < 0 || end < start) return '';
        const after = decoded.slice(end + 5, end + 180).split(/[\n<{]/)[0].replace(/["';\s]+$/, '');
        return convertChTags(decoded.slice(start, end + 5) + after);
    }

    function pageHeading(raw) {
        const htmlTitle = raw.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
            || raw.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
            || raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (htmlTitle) return cleanHeading(htmlTitle[1]);
        const markdown = raw.match(/^Title:\s*(.+)$/m);
        if (markdown) return cleanHeading(markdown[1]);
        return { title: '', artist: '' };
    }

    function stripJina(raw) {
        const lines = String(raw || '').split('\n');
        if (!lines.some((line) => /^Title:\s*/i.test(line) || /^Markdown Content:\s*$/i.test(line))) {
            return raw;
        }
        const body = [];
        let started = false;
        lines.forEach((line) => {
            if (!started) {
                if (/^(?:Markdown Content|HTML Content):\s*$/i.test(line)) started = true;
                return;
            }
            body.push(line);
        });
        return started ? body.join('\n') : raw;
    }

    function lineHasChord(line) {
        if (chordPlacements(line)) return true;
        return [...line.matchAll(/\[([^\]\n]+)\]/g)].some((match) => bracketChords(match[1]));
    }

    function sliceChart(text) {
        const lines = String(text || '').split('\n');
        let first = -1;
        let last = -1;
        lines.forEach((line, index) => {
            if (!lineHasChord(line)) return;
            if (first < 0) first = index;
            last = index;
        });
        if (first < 0) return '';
        return lines.slice(Math.max(0, first - 2), Math.min(lines.length, last + 3)).join('\n');
    }

    function applyHeading(chart, heading) {
        if (!chart) return null;
        return {
            ...chart,
            title: chart.title || heading.title || '',
            artist: chart.artist || heading.artist || ''
        };
    }

    function candidatesFromSource(raw) {
        const text = String(raw || '');
        if (!text.trim()) return [];
        const heading = pageHeading(text);
        const chunks = [];
        const region = extractChRegion(text);
        if (region) chunks.push(region);
        if (isHtml(text)) {
            extractPres(text).forEach((block) => chunks.push(block));
            chunks.push(htmlToPlain(text));
        } else {
            chunks.push(stripJina(convertChTags(unescapeChart(text))));
        }
        const charts = [];
        chunks.forEach((chunk) => {
            const sliced = sliceChart(chunk);
            charts.push(applyHeading(parseChartText(chunk, heading), heading));
            if (sliced && sliced !== chunk) charts.push(applyHeading(parseChartText(sliced, heading), heading));
        });
        return charts.filter(Boolean);
    }

    function parseChartSource(source) {
        const parts = Array.isArray(source) ? source : [source];
        let best = null;
        let bestScore = 0;
        parts.forEach((part) => {
            candidatesFromSource(part).forEach((chart) => {
                const score = scoreChart(chart);
                if (score > bestScore) {
                    best = chart;
                    bestScore = score;
                }
            });
        });
        return best;
    }

    function cleanLyricLine(line) {
        return String(line || '')
            .replace(/\*/g, '')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();
    }

    function keptSource(line) {
        return String(line || '').replace(/\s+$/g, '');
    }

    function sheetFromText(text, heading) {
        const hint = heading || { title: '', artist: '' };
        const lines = [];
        let blanks = 0;
        String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').forEach((raw) => {
            let line = raw.replace(/\u00a0/g, ' ').replace(/\t/g, '    ').replace(/[\u200B-\u200D\uFEFF]/g, '');
            if (/^\s*```/.test(line)) return;
            line = line.replace(/\*\*|__|`/g, '');
            const trimmed = line.trim();
            if (!trimmed || /^[-=_*]{3,}$/.test(trimmed)) {
                blanks += 1;
                if (blanks === 1 && lines.length) lines.push({ kind: 'blank' });
                return;
            }
            blanks = 0;
            const unmarked = line.replace(/^\s{0,3}#{1,6}\s+/, '');
            const chords = chordPlacements(unmarked);
            if (chords) {
                lines.push({
                    kind: 'chords',
                    source: unmarked,
                    placements: chords.map((chord) => ({ name: chord.name, col: chord.col }))
                });
                return;
            }
            const inline = parseInline(unmarked);
            if (inline && inline.annotations && inline.annotations.length) {
                const placements = inline.annotations.map((annotation, index) => ({
                    name: annotation.chord,
                    col: index * 8
                }));
                let source = '';
                placements.forEach((chord) => {
                    while (source.length < chord.col) source += ' ';
                    source += chord.name;
                });
                lines.push({ kind: 'chords', source, placements });
                const rawLyric = keptSource(inline.text);
                const lyric = cleanLyricLine(rawLyric);
                if (lyric && lyric !== '·') lines.push({ kind: 'lyric', text: lyric, source: rawLyric });
                return;
            }
            const section = isSectionLine(trimmed);
            const rawLyric = keptSource(section || unmarked);
            const lyric = cleanLyricLine(rawLyric);
            if (lyric) lines.push({ kind: 'lyric', text: lyric, source: rawLyric });
        });
        while (lines.length && lines[lines.length - 1].kind === 'blank') lines.pop();
        const chordCount = lines.reduce((sum, line) => sum + (line.kind === 'chords' ? line.placements.length : 0), 0);
        const lyricCount = lines.filter((line) => line.kind === 'lyric').length;
        if (!chordCount && lyricCount < 2) return null;
        const lyricText = lines.filter((line) => line.kind === 'lyric').map((line) => line.source || line.text).join('\n');
        return {
            title: hint.title || '',
            artist: hint.artist || '',
            lines,
            chordCount,
            align: isMostlyRtl(lyricText) ? 'right' : 'left'
        };
    }

    function scoreSheet(sheet) {
        if (!sheet) return 0;
        const chords = sheet.chordCount || 0;
        const lyrics = sheet.lines.filter((line) => line.kind === 'lyric').length;
        if (!chords && lyrics < 4) return 0;
        const density = chords / Math.max(sheet.lines.length, 1);
        return chords * 1000 + density * 500 - sheet.lines.length * 5;
    }

    function sheetsFromSource(raw) {
        const text = String(raw || '');
        if (!text.trim()) return [];
        const heading = pageHeading(text);
        const chunks = [];
        const region = extractChRegion(text);
        if (region) chunks.push(region);
        if (isHtml(text)) {
            extractPres(text).forEach((block) => chunks.push(block));
            chunks.push(htmlToPlain(text));
        } else {
            chunks.push(stripJina(convertChTags(unescapeChart(text))));
        }
        return chunks.map((chunk) => sheetFromText(chunk, heading)).filter(Boolean);
    }

    function parseSheetSource(source) {
        const parts = Array.isArray(source) ? source : [source];
        let best = null;
        let bestScore = 0;
        parts.forEach((part) => {
            sheetsFromSource(part).forEach((sheet) => {
                const score = scoreSheet(sheet);
                if (score > bestScore) {
                    best = sheet;
                    bestScore = score;
                }
            });
        });
        return best;
    }

    return {
        parsePublicHttpUrl,
        parseChartSource,
        parseChartText,
        parseSheetSource,
        isChordToken
    };
}));
