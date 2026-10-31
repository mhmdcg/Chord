const LinkCharts = require('./link-charts.js');

let failed = 0;

function eq(actual, expected, label) {
    const same = JSON.stringify(actual) === JSON.stringify(expected);
    if (!same) {
        failed += 1;
        console.error('FAIL', label);
        console.error('  actual  ', JSON.stringify(actual));
        console.error('  expected', JSON.stringify(expected));
    }
}

function check(condition, label) {
    if (!condition) {
        failed += 1;
        console.error('FAIL', label);
    }
}

const column = LinkCharts.parseChartText(`Verse 1
G       C
Carry the blue lantern home
Am      D
Wait until the street is still

Chorus
Hold the light above the door
`);
eq(column.annotations.map((item) => item.chord), ['G', 'C', 'Am', 'D'], 'column chords');
eq(column.lyrics.split('\n')[1], 'Carry the blue lantern home', 'column lyric kept');
check(column.lyrics.indexOf('Carry') === column.annotations[0].start, 'G sits on Carry');
check(column.lyrics.slice(column.annotations[1].start, column.annotations[1].end).startsWith('the'), 'C sits on the');

const inline = LinkCharts.parseChartText('{title: River Road}\n{artist: Night Shift}\n[Dm]Hold the [C]line until the [G]morning\n');
eq(inline.title, 'River Road', 'chordpro title');
eq(inline.artist, 'Night Shift', 'chordpro artist');
eq(inline.annotations.map((item) => item.chord), ['Dm', 'C', 'G'], 'inline chords');
eq(inline.lyrics, 'Hold the line until the morning', 'inline lyrics drop brackets');
check(inline.lyrics.slice(inline.annotations[0].start, inline.annotations[0].end) === 'Hold the ', 'Dm covers Hold the');
check(inline.lyrics.slice(inline.annotations[2].start, inline.annotations[2].end) === 'morning', 'G covers morning');

const packed = LinkCharts.parseChartText('Am G C\none two three four five\n');
eq(packed.annotations.map((item) => item.chord), ['Am', 'G', 'C'], 'packed chords stay separate');
check(packed.lyrics.slice(packed.annotations[0].start, packed.annotations[0].end).includes('one'), 'first word gets Am');
check(packed.lyrics.slice(packed.annotations[2].start).includes('five'), 'last words get C');

const prose = LinkCharts.parseChartText('Am I dreaming of the long road tonight\nThis is a sentence and not a chord row at all\n');
eq(prose.annotations, [], 'a sentence is not a chord line');
check(prose.lyrics.startsWith('Am I dreaming'), 'sentence stays lyrics');

const rtl = LinkCharts.parseChartText('Gm Cm\nسلام بر تو ای دوست\n');
eq(rtl.textAlign, 'right', 'persian lyrics align right');
eq(rtl.annotations.map((item) => item.chord), ['Gm', 'Cm'], 'rtl chords in order');
check(rtl.lyrics.slice(rtl.annotations[0].start, rtl.annotations[0].end).startsWith('سلام'), 'first chord on first word');

const marks = LinkCharts.parseChartText('GmY    BbY\nlantern over the water\n');
eq(marks.annotations.map((item) => item.chord), ['GmY', 'BbY'], 'Y quality kept');

const instrumental = LinkCharts.parseChartText('Am G\n\n\nF C\n');
eq(instrumental.annotations.map((item) => item.chord), ['Am', 'G', 'F', 'C'], 'chord-only lines become beats');
check(instrumental.lyrics.includes('·'), 'instrumental uses beat marks');

const html = `<!DOCTYPE html><html><head><title>Blue Lantern Chords - Night Shift</title></head><body>
<nav>Home Songs G C</nav>
<div class="song-chords-content"><pre>
Verse 1
G       C
Carry the blue lantern home
Am      D
Wait until the street is still
</pre></div>
<p>Related songs and a long footer that should not become the lyric.</p>
</body></html>`;
const fromHtml = LinkCharts.parseChartSource(html);
eq(fromHtml.title, 'Blue Lantern', 'html title cleaned');
eq(fromHtml.artist, 'Night Shift', 'html artist');
eq(fromHtml.annotations.map((item) => item.chord), ['G', 'C', 'Am', 'D'], 'pre chords win over the page');
check(!/Related songs/.test(fromHtml.lyrics), 'footer stays out of the lyric');

const spans = '<div><p><span class="chord">Am</span>Carry <span class="chord">G</span>home</p></div>';
const fromSpans = LinkCharts.parseChartSource(spans);
eq(fromSpans.annotations.map((item) => item.chord), ['Am', 'G'], 'span chords');
eq(fromSpans.lyrics, 'Carry home', 'span lyrics');

const ug = '<script>var tab = "[ch]F[/ch]Hold the [ch]C[/ch]line";</script>';
const fromUg = LinkCharts.parseChartSource(ug);
eq(fromUg.annotations.map((item) => item.chord), ['F', 'C'], 'ultimate guitar tags');
eq(fromUg.lyrics, 'Hold the line', 'tag lyrics');

check(LinkCharts.parsePublicHttpUrl('https://example.com/song').href === 'https://example.com/song', 'public url');
check(LinkCharts.parsePublicHttpUrl('https://example.com/song\nSong title').href === 'https://example.com/song', 'url kept when a title follows');
check(LinkCharts.parsePublicHttpUrl('\u200ehttps://example.com/c\u200f').href === 'https://example.com/c', 'url with bidi marks');
check(LinkCharts.parsePublicHttpUrl('example.com/a').href === 'https://example.com/a', 'scheme added');
check(LinkCharts.parsePublicHttpUrl('http://127.0.0.1/chart') === null, 'loopback blocked');
check(LinkCharts.parsePublicHttpUrl('http://192.168.1.4/a') === null, 'private lan blocked');
check(LinkCharts.parsePublicHttpUrl('file:///etc/passwd') === null, 'file url blocked');
check(LinkCharts.parsePublicHttpUrl('http://127.0.0.1:8765/chart', 'http://127.0.0.1:8765').href === 'http://127.0.0.1:8765/chart', 'same origin allowed');
check(LinkCharts.isChordToken('G/B') === 'G/B', 'slash chord');
check(LinkCharts.isChordToken('D/F#') === 'D/F#', 'sharp bass');
check(LinkCharts.isChordToken('Gsus4') === 'Gsus4', 'sus chord');
check(LinkCharts.isChordToken('Verse') === '', 'section word is not a chord');
check(LinkCharts.isChordToken('DY') === 'DY', 'Y suffix chord');
check(LinkCharts.isChordToken('BY') === 'BY', 'BY chord');

const sheet = LinkCharts.parseSheetSource(`Em
ای تو بهانه واسه موندن
DY      D
ای تو خود لحظه ی بودن
Em   C   BY
*تو طلوع *صبح
`);
eq(sheet.lines.filter((line) => line.kind === 'chords').map((line) => line.placements.map((chord) => chord.name)), [
    ['Em'],
    ['DY', 'D'],
    ['Em', 'C', 'BY']
], 'sheet keeps each chord row');
eq(sheet.lines.filter((line) => line.kind === 'lyric').map((line) => line.text), [
    'ای تو بهانه واسه موندن',
    'ای تو خود لحظه ی بودن',
    'تو طلوع صبح'
], 'sheet lyrics drop the star marks');
check(sheet.lines[4].placements[1].col > sheet.lines[4].placements[0].col, 'later chords keep their column');
eq(sheet.align, 'right', 'persian sheet stays right aligned');
eq(sheet.lines[4].source, 'Em   C   BY', 'chord row keeps the original spaces');
check(sheet.lines[5].source.includes('*تو طلوع *صبح'), 'lyric row keeps star columns');
const latin = LinkCharts.parseSheetSource('C   G\nHello there\nAm\nStay');
eq(latin.align, 'left', 'latin sheet stays left aligned');
eq(latin.lines[0].source, 'C   G', 'latin chord spaces kept');
const padded = LinkCharts.parseSheetSource('      G#m      \nگفتی خیال\n                       F#                       \nمنم بهش کردم عادت\n');
eq(padded.lines[0].source, '      G#m      ', 'chord row keeps the spaces after the name');
check(padded.lines[2].source.endsWith('F#                       '), 'a centered chord keeps its trailing pad');

const sheetHtml = `<html><head><title>چراغ آبی</title></head><body><nav>Home</nav><pre>
Em
سلام بر تو
Am      G
شب آرام
</pre><p>footer words that are not the chart</p></body></html>`;
const fromPre = LinkCharts.parseSheetSource(sheetHtml);
eq(fromPre.lines.filter((line) => line.kind === 'lyric').map((line) => line.text), ['سلام بر تو', 'شب آرام'], 'sheet uses the chart, not the footer');
const named = LinkCharts.parseSheetSource('<html><head><title>آکورد گیتار آهنگ چراغ آبی از شیفت شب - لامینور</title></head><body><pre>\nEm\nسلام\n</pre></body></html>');
eq(named.title, 'چراغ آبی', 'persian page title');
eq(named.artist, 'شیفت شب', 'persian page artist');

if (failed) {
    console.error(`${failed} failed`);
    process.exit(1);
}
console.log('All link chart tests passed.');
