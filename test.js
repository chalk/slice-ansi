import test from 'ava';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import randomItem from 'random-item';
import sliceAnsi from './index.js';

chalk.level = 1;

const fixture = chalk.red('the ') + chalk.green('quick ') + chalk.blue('brown ') + chalk.cyan('fox ') + chalk.yellow('jumped ');
const stripped = stripAnsi(fixture);
const ESCAPE = '\u001B';
const ANSI_BELL = '\u0007';
const ANSI_STRING_TERMINATOR = `${ESCAPE}\\`;
const C1_OSC = '\u009D';
const C1_STRING_TERMINATOR = '\u009C';

function generate(string) {
	const random1 = randomItem(['rock', 'paper', 'scissors']);
	const random2 = randomItem(['blue', 'green', 'yellow', 'red']);
	return `${string}:${chalk[random2](random1)} `;
}

function createHyperlink(text, url, terminator = ANSI_BELL, closeTerminator = terminator) {
	return `${ESCAPE}]8;;${url}${terminator}${text}${ESCAPE}]8;;${closeTerminator}`;
}

function stripOscHyperlinks(string) {
	const hyperlinkPrefixes = [`${ESCAPE}]8;`, `${C1_OSC}8;`];
	let output = '';
	let index = 0;

	while (index < string.length) {
		const hyperlinkPrefix = hyperlinkPrefixes.find(prefix => string.startsWith(prefix, index));
		if (!hyperlinkPrefix) {
			output += string[index];
			index++;
			continue;
		}

		const uriStart = string.indexOf(';', index + hyperlinkPrefix.length);
		if (uriStart === -1) {
			break;
		}

		let sequenceIndex = uriStart + 1;
		while (sequenceIndex < string.length) {
			if (string[sequenceIndex] === ANSI_BELL) {
				index = sequenceIndex + 1;
				break;
			}

			if (
				string[sequenceIndex] === ESCAPE
				&& string[sequenceIndex + 1] === '\\'
			) {
				index = sequenceIndex + 2;
				break;
			}

			if (string[sequenceIndex] === C1_STRING_TERMINATOR) {
				index = sequenceIndex + 1;
				break;
			}

			sequenceIndex++;
		}

		if (sequenceIndex >= string.length) {
			break;
		}
	}

	return output;
}

function stripForVisibleComparison(string) {
	return stripAnsi(stripOscHyperlinks(string));
}

function assertVisibleSliceMatchesNative(t, input, start, end) {
	const nativeSlice = stripForVisibleComparison(input).slice(start, end);
	const ansiSlice = stripForVisibleComparison(sliceAnsi(input, start, end));
	t.is(ansiSlice, nativeSlice);
}

function styleScalarAtIndex(string, scalarIndex, style) {
	let output = '';
	let index = 0;

	for (const scalar of string) {
		output += index === scalarIndex ? style(scalar) : scalar;
		index++;
	}

	return output;
}

function hyperlinkScalarAtIndex(string, scalarIndex, url) {
	let output = '';
	let index = 0;

	for (const scalar of string) {
		output += index === scalarIndex ? createHyperlink(scalar, url) : scalar;
		index++;
	}

	return output;
}

function assertSlicesMatchPlainReference(t, plain, styled, maximumIndex = 6) {
	for (let start = 0; start <= maximumIndex; start++) {
		for (let end = start; end <= maximumIndex; end++) {
			const expected = stripForVisibleComparison(sliceAnsi(plain, start, end));
			const actual = stripForVisibleComparison(sliceAnsi(styled, start, end));
			t.is(actual, expected);
		}
	}
}

function createRandomInteger(maximum) {
	return Math.floor(Math.random() * maximum);
}

function createRandomVisibleText() {
	const parts = ['a', 'b', 'c', ' ', 'ß'];
	const length = createRandomInteger(6) + 1;
	let returnValue = '';

	for (let index = 0; index < length; index++) {
		returnValue += randomItem(parts);
	}

	return returnValue;
}

function createRandomHyperlinkText() {
	const url = `https://example.com/${createRandomInteger(1000)}`;
	const terminator = randomItem([ANSI_BELL, ANSI_STRING_TERMINATOR]);
	return createHyperlink(createRandomVisibleText(), url, terminator);
}

function createRandomStyledText() {
	const text = createRandomVisibleText();
	const style = randomItem([
		chalk.red,
		chalk.green,
		chalk.blue,
		chalk.bold,
		chalk.underline,
		chalk.bgYellow.black,
	]);

	return style(text);
}

function createRandomValidAnsiText() {
	const segmentCount = createRandomInteger(8) + 1;
	let output = '';

	for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
		const type = randomItem(['plain', 'styled', 'hyperlink']);

		if (type === 'plain') {
			output += createRandomVisibleText();
		} else if (type === 'styled') {
			output += createRandomStyledText();
		} else {
			output += createRandomHyperlinkText();
		}
	}

	return output;
}

test('main', t => {
	// The slice should behave exactly as a regular JS slice behaves
	for (let index = 0; index < 20; index++) {
		for (let index2 = 19; index2 > index; index2--) {
			const nativeSlice = stripped.slice(index, index2);
			const ansiSlice = sliceAnsi(fixture, index, index2);
			t.is(nativeSlice, stripAnsi(ansiSlice));
		}
	}

	const a = JSON.stringify('\u001B[31mthe \u001B[39m\u001B[32mquick \u001B[39m');
	const b = JSON.stringify('\u001B[34mbrown \u001B[39m\u001B[36mfox \u001B[39m');
	const c = JSON.stringify('\u001B[31m \u001B[39m\u001B[32mquick \u001B[39m\u001B[34mbrown \u001B[39m\u001B[36mfox \u001B[39m');

	t.is(JSON.stringify(sliceAnsi(fixture, 0, 10)), a);
	t.is(JSON.stringify(sliceAnsi(fixture, 10, 20)), b);
	t.is(JSON.stringify(sliceAnsi(fixture, 3, 20)), c);

	const string = generate(1) + generate(2) + generate(3) + generate(4) + generate(5) + generate(6) + generate(7) + generate(8) + generate(9) + generate(10) + generate(11) + generate(12) + generate(13) + generate(14) + generate(15) + generate(1) + generate(2) + generate(3) + generate(4) + generate(5) + generate(6) + generate(7) + generate(8) + generate(9) + generate(10) + generate(11) + generate(12) + generate(13) + generate(14) + generate(15);
	const native = stripAnsi(string).slice(0, 55);
	const ansi = stripAnsi(sliceAnsi(string, 0, 55));
	t.is(native, ansi);
});

test('supports fullwidth characters', t => {
	t.is(sliceAnsi('안녕하세', 0, 4), '안녕');
});

test('supports unicode surrogate pairs', t => {
	t.is(sliceAnsi('a\uD83C\uDE00BC', 0, 2), 'a');
	t.is(sliceAnsi('a\uD83C\uDE00BC', 0, 3), 'a\uD83C\uDE00');
});

test('does not split grapheme clusters with combining marks', t => {
	const input = 'Ae\u0301B';
	t.is(sliceAnsi(input, 1, 2), 'e\u0301');
	t.is(sliceAnsi(input, 2, 3), 'B');
});

test('does not split ZWJ emoji grapheme clusters', t => {
	const input = 'A👨‍👩‍👧‍👦B';
	t.is(sliceAnsi(input, 1, 3), '👨‍👩‍👧‍👦');
	t.is(sliceAnsi(input, 3, 4), 'B');
});

test('treats CRLF as a single grapheme cluster', t => {
	const input = 'A\r\nB';
	t.is(sliceAnsi(input, 1, 2), '\r\n');
	t.is(sliceAnsi(input, 2, 3), 'B');
});

test('does not split styled grapheme clusters with combining marks', t => {
	const input = '\u001B[31me\u0301\u001B[39m';
	t.is(sliceAnsi(input, 0, 1), input);
	t.is(sliceAnsi(input, 1, 2), '');
});

test('does not split grapheme clusters when styles appear inside combining sequence', t => {
	const input = '\u001B[31me\u001B[39m\u0301B';
	t.is(stripForVisibleComparison(sliceAnsi(input, 0, 1)), 'e\u0301');
	t.is(stripForVisibleComparison(sliceAnsi(input, 1, 2)), 'B');
});

test('does not split Hangul Jamo grapheme clusters when styles appear inside sequence', t => {
	const input = '\u001B[31mᄀ\u001B[39mᅡB';
	t.is(stripForVisibleComparison(sliceAnsi(input, 0, 2)), '가');
	t.is(stripForVisibleComparison(sliceAnsi(input, 2, 3)), 'B');
});

test('keeps style opens inside grapheme continuation past end boundary', t => {
	const input = `e${chalk.red('\u0301')}B`;
	t.is(sliceAnsi(input, 0, 1), `e${chalk.red('\u0301')}`);
});

test('keeps hyperlink opens inside grapheme continuation past end boundary', t => {
	const open = `${ESCAPE}]8;;https://example.com${ANSI_BELL}`;
	const close = `${ESCAPE}]8;;${ANSI_BELL}`;
	const input = `e${open}\u0301${close}B`;
	t.is(sliceAnsi(input, 0, 1), `e${open}\u0301${close}`);
});

test('doesn\'t add unnecessary escape codes', t => {
	t.is(sliceAnsi('\u001B[31municorn\u001B[39m', 0, 3), '\u001B[31muni\u001B[39m');
});

test('can slice a normal character before a colored character', t => {
	t.is(sliceAnsi('a\u001B[31mb\u001B[39m', 0, 1), 'a');
});

test('can slice a normal character after a colored character', t => {
	t.is(sliceAnsi('\u001B[31ma\u001B[39mb', 1, 2), 'b');
});

// See https://github.com/chalk/slice-ansi/issues/22
test('can slice a string styled with both background and foreground', t => {
	// Test string: `chalk.bgGreen.black('test');`
	t.is(sliceAnsi('\u001B[42m\u001B[30mtest\u001B[39m\u001B[49m', 0, 1), '\u001B[42m\u001B[30mt\u001B[39m\u001B[49m');
});

test('can slice a string styled with modifier', t => {
	// Test string: `chalk.underline('test');`
	t.is(sliceAnsi('\u001B[4mtest\u001B[24m', 0, 1), '\u001B[4mt\u001B[24m');
});

test('can slice a string with unknown ANSI color', t => {
	t.is(sliceAnsi('\u001B[20mTEST\u001B[49m', 0, 4), '\u001B[20mTEST\u001B[0m');
	t.is(sliceAnsi('\u001B[1001mTEST\u001B[49m', 0, 3), '\u001B[1001mTES\u001B[0m');
	t.is(sliceAnsi('\u001B[1001mTEST\u001B[49m', 0, 2), '\u001B[1001mTE\u001B[0m');
});

test('weird null issue', t => {
	const s = '\u001B[1mautotune.flipCoin("easy as") ? 🎂 : 🍰 \u001B[33m★\u001B[39m\u001B[22m';
	const result = sliceAnsi(s, 38);
	t.false(result.includes('null'));
});

test('supports true color escape sequences', t => {
	t.is(sliceAnsi('\u001B[1m\u001B[48;2;255;255;255m\u001B[38;2;255;0;0municorn\u001B[39m\u001B[49m\u001B[22m', 0, 3), '\u001B[1m\u001B[48;2;255;255;255m\u001B[38;2;255;0;0muni\u001B[39m\u001B[49m\u001B[22m');
});

test('supports colon-delimited truecolor SGR syntax', t => {
	t.is(sliceAnsi('\u001B[38:2:255:0:0mred\u001B[39m', 0, 1), '\u001B[38:2:255:0:0mr\u001B[39m');
});

// See https://github.com/chalk/slice-ansi/issues/24
test('doesn\'t add extra escapes', t => {
	const output = `${chalk.black.bgYellow(' RUNS ')}  ${chalk.green('test')}`;
	t.is(sliceAnsi(output, 0, 7), `${chalk.black.bgYellow(' RUNS ')} `);
	t.is(sliceAnsi(output, 0, 8), `${chalk.black.bgYellow(' RUNS ')}  `);
	t.is(JSON.stringify(sliceAnsi('\u001B[31m' + output, 0, 4)), JSON.stringify(chalk.black.bgYellow(' RUN')));
});

// See https://github.com/chalk/slice-ansi/issues/26
test('does not lose fullwidth characters', t => {
	t.is(sliceAnsi('古古test', 0), '古古test');
});

// See https://github.com/chalk/slice-ansi/issues/43
test('does not exceed endColumn for wide characters', t => {
	const input = 'あいう';
	t.is(sliceAnsi(input, 0, 0), '');
	t.is(sliceAnsi(input, 0, 1), '');
	t.is(sliceAnsi(input, 0, 2), 'あ');
	t.is(sliceAnsi(input, 0, 3), 'あ');
	t.is(sliceAnsi(input, 0, 4), 'あい');
	t.is(sliceAnsi(input, 0, 5), 'あい');
	t.is(sliceAnsi(input, 0, 6), 'あいう');
});

test('does not split regional-indicator flag graphemes', t => {
	const input = 'A🇮🇱B';
	t.is(sliceAnsi(input, 0, 1), 'A');
	t.is(sliceAnsi(input, 1, 2), '');
	t.is(sliceAnsi(input, 1, 3), '🇮🇱');
	t.is(sliceAnsi(input, 2, 3), '');
	t.is(sliceAnsi(input, 3, 4), 'B');
});

test('does not split styled regional-indicator flag graphemes', t => {
	const input = '\u001B[31m🇮🇱\u001B[39m';
	t.is(sliceAnsi(input, 0, 1), '');
	t.is(sliceAnsi(input, 0, 2), input);
	t.is(sliceAnsi(input, 1, 2), '');
});

test('counts emoji-style graphemes as fullwidth', t => {
	t.is(sliceAnsi('A☺️B', 1, 3), '☺️');
	t.is(sliceAnsi('A1️⃣B', 1, 3), '1️⃣');
	t.is(sliceAnsi('A🇦B', 1, 3), '🇦');
});

test('does not treat text-presentation pictographs as fullwidth', t => {
	t.is(sliceAnsi('A☺B', 2, 3), 'B');
	t.is(sliceAnsi('A☂B', 2, 3), 'B');
});

test('can create empty slices', t => {
	t.is(sliceAnsi('test', 0, 0), '');
});

test('slice links (issue #31)', t => {
	const link = createHyperlink('Google', 'https://google.com');
	t.is(sliceAnsi(link, 0, 6), link);
});

test('supports OSC 8 hyperlinks with ST terminator', t => {
	const link = createHyperlink('Google', 'https://google.com', ANSI_STRING_TERMINATOR);
	t.is(sliceAnsi(link, 0, 6), link);
});

test('supports OSC 8 hyperlinks with mixed close terminator', t => {
	const link = createHyperlink('Google', 'https://google.com', ANSI_STRING_TERMINATOR, ANSI_BELL);
	t.is(sliceAnsi(link, 0, 6), link);
});

test('supports OSC 8 hyperlinks with parameters', t => {
	const link = `${ESCAPE}]8;id=abc;https://google.com${ANSI_BELL}Google${ESCAPE}]8;;${ANSI_BELL}`;
	t.is(sliceAnsi(link, 0, 6), link);
	t.is(sliceAnsi(link, 1, 4), `${ESCAPE}]8;id=abc;https://google.com${ANSI_BELL}oog${ESCAPE}]8;;${ANSI_BELL}`);
});

test('supports OSC 8 hyperlinks with parameters and ST terminator', t => {
	const link = `${ESCAPE}]8;id=abc;https://google.com${ANSI_STRING_TERMINATOR}Google${ESCAPE}]8;;${ANSI_STRING_TERMINATOR}`;
	t.is(sliceAnsi(link, 0, 6), link);
	t.is(sliceAnsi(link, 2), `${ESCAPE}]8;id=abc;https://google.com${ANSI_STRING_TERMINATOR}ogle${ESCAPE}]8;;${ANSI_STRING_TERMINATOR}`);
});

test('supports ESC OSC 8 hyperlinks with C1 ST terminator', t => {
	const link = `${ESCAPE}]8;;https://google.com${C1_STRING_TERMINATOR}Google${ESCAPE}]8;;${C1_STRING_TERMINATOR}`;
	t.is(sliceAnsi(link, 0, 6), link);
	t.is(sliceAnsi(link, 1, 4), `${ESCAPE}]8;;https://google.com${C1_STRING_TERMINATOR}oog${ESCAPE}]8;;${C1_STRING_TERMINATOR}`);
});

test('supports C1 OSC 8 hyperlinks with BEL terminator', t => {
	const link = `${C1_OSC}8;;https://google.com${ANSI_BELL}Google${C1_OSC}8;;${ANSI_BELL}`;
	t.is(sliceAnsi(link, 0, 6), link);
	t.is(sliceAnsi(link, 1, 4), `${C1_OSC}8;;https://google.com${ANSI_BELL}oog${C1_OSC}8;;${ANSI_BELL}`);
});

test('supports C1 OSC 8 hyperlinks with C1 ST terminator', t => {
	const link = `${C1_OSC}8;;https://google.com${C1_STRING_TERMINATOR}Google${C1_OSC}8;;${C1_STRING_TERMINATOR}`;
	t.is(sliceAnsi(link, 0, 6), link);
	t.is(sliceAnsi(link, 2), `${C1_OSC}8;;https://google.com${C1_STRING_TERMINATOR}ogle${C1_OSC}8;;${C1_STRING_TERMINATOR}`);
});

test('supports C1 OSC 8 hyperlinks with parameters and ESC ST terminator', t => {
	const link = `${C1_OSC}8;id=abc;https://google.com${ANSI_STRING_TERMINATOR}Google${C1_OSC}8;;${ANSI_STRING_TERMINATOR}`;
	t.is(sliceAnsi(link, 0, 6), link);
	t.is(sliceAnsi(link, 1, 4), `${C1_OSC}8;id=abc;https://google.com${ANSI_STRING_TERMINATOR}oog${C1_OSC}8;;${ANSI_STRING_TERMINATOR}`);
});

test('can slice each visible character from hyperlink', t => {
	const url = 'https://google.com';
	const text = 'Google';
	const link = createHyperlink(text, url);

	for (let index = 0; index < text.length; index++) {
		t.is(sliceAnsi(link, index, index + 1), createHyperlink(text.slice(index, index + 1), url));
	}
});

test('can slice partial hyperlink text', t => {
	const url = 'https://google.com';
	const link = createHyperlink('Google', url);
	t.is(sliceAnsi(link, 1, 4), createHyperlink('oog', url));
});

test('can create an empty slice inside hyperlink text', t => {
	const link = createHyperlink('Google', 'https://google.com');
	t.is(sliceAnsi(link, 2, 2), '');
});

test('keeps outer styles when slicing after hyperlink text', t => {
	const input = chalk.red(`${createHyperlink('AB', 'https://example.com')}C`);
	t.is(sliceAnsi(input, 2, 3), chalk.red('C'));
});

test('supports hyperlinks that close with non-empty parameters', t => {
	const link = `${ESCAPE}]8;id=abc;https://google.com${ANSI_BELL}Google${ESCAPE}]8;id=abc;${ANSI_BELL}`;
	t.is(sliceAnsi(link, 0, 6), link);
	t.is(sliceAnsi(link, 0, 4), `${ESCAPE}]8;id=abc;https://google.com${ANSI_BELL}Goog${ESCAPE}]8;;${ANSI_BELL}`);
});

test('supports hyperlink slices with unicode surrogate pairs', t => {
	const url = 'https://example.com';
	const link = createHyperlink('a🙂b', url);
	t.is(sliceAnsi(link, 1, 3), createHyperlink('🙂', url));
});

test('preserves grapheme clusters when slicing hyperlink text', t => {
	const url = 'https://example.com';
	const link = createHyperlink('A👨‍👩‍👧‍👦B', url);
	t.is(sliceAnsi(link, 1, 3), createHyperlink('👨‍👩‍👧‍👦', url));
	t.is(sliceAnsi(link, 2, 3), '');
});

test('does not split grapheme clusters when styles appear inside ZWJ sequence', t => {
	const input = '\u001B[31m👨\u001B[39m‍👩‍👧‍👦B';
	t.is(stripForVisibleComparison(sliceAnsi(input, 0, 2)), '👨‍👩‍👧‍👦');
	t.is(stripForVisibleComparison(sliceAnsi(input, 2, 3)), 'B');
});

test('does not split grapheme clusters when styles appear between ZWJ and following pictograph', t => {
	const input = `👨‍${chalk.red('👩‍👧‍👦')}B`;
	t.is(stripForVisibleComparison(sliceAnsi(input, 0, 2)), '👨‍👩‍👧‍👦');
	t.is(stripForVisibleComparison(sliceAnsi(input, 2, 3)), 'B');
});

test('keeps grapheme-safe boundaries with SGR inserted at internal scalar boundaries', t => {
	const graphemes = [
		'e\u0301',
		'👨‍👩‍👧‍👦',
		'👍🏽',
		'1️⃣',
		'☺️',
		'🇮🇱',
		'가',
		'👨‍👩',
	];

	for (const grapheme of graphemes) {
		const plain = `A${grapheme}B`;
		const scalarCount = [...grapheme].length;

		for (let scalarIndex = 0; scalarIndex < scalarCount; scalarIndex++) {
			const styled = `A${styleScalarAtIndex(grapheme, scalarIndex, chalk.red)}B`;
			assertSlicesMatchPlainReference(t, plain, styled);
		}
	}
});

test('keeps grapheme-safe boundaries with hyperlink tokens inserted at internal scalar boundaries', t => {
	const graphemes = [
		'e\u0301',
		'👨‍👩‍👧‍👦',
		'1️⃣',
		'🇮🇱',
		'가',
	];

	for (const grapheme of graphemes) {
		const plain = `A${grapheme}B`;
		const scalarCount = [...grapheme].length;

		for (let scalarIndex = 0; scalarIndex < scalarCount; scalarIndex++) {
			const styled = `A${hyperlinkScalarAtIndex(grapheme, scalarIndex, 'https://example.com')}B`;
			assertSlicesMatchPlainReference(t, plain, styled);
		}
	}
});

test('can slice across plain text and hyperlink boundaries', t => {
	const url = 'https://google.com';
	const input = `A${createHyperlink('Google', url)}B`;
	t.is(sliceAnsi(input, 0, 2), `A${createHyperlink('G', url)}`);
	t.is(sliceAnsi(input, 6, 8), `${createHyperlink('e', url)}B`);
});

test('can slice a hyperlink that remains open to the end', t => {
	const link = `${ESCAPE}]8;;https://google.com${ANSI_BELL}Google`;
	t.is(sliceAnsi(link, 0, 6), createHyperlink('Google', 'https://google.com'));
});

test('can slice hyperlinks with nested style transitions', t => {
	const url = 'https://example.com';
	const input = createHyperlink(`${chalk.red('R')}${chalk.green('G')}${chalk.blue('B')}`, url);

	assertVisibleSliceMatchesNative(t, input, 0, 3);
	assertVisibleSliceMatchesNative(t, input, 1, 3);
	assertVisibleSliceMatchesNative(t, input, 1, 2);
});

test('can slice styled hyperlink text without dropping styles', t => {
	const url = 'https://example.com';
	const input = chalk.bgGreen.black(createHyperlink(chalk.red('test'), url));

	assertVisibleSliceMatchesNative(t, input, 0, 4);
	assertVisibleSliceMatchesNative(t, input, 1, 3);
});

test('can slice multiple hyperlinks in one string', t => {
	const input = `${createHyperlink('one', 'https://one.test')}-${createHyperlink('two', 'https://two.test')}`;

	assertVisibleSliceMatchesNative(t, input, 0, 7);
	assertVisibleSliceMatchesNative(t, input, 1, 6);
	assertVisibleSliceMatchesNative(t, input, 3, 7);
});

test('can slice back-to-back hyperlinks', t => {
	const input = `${createHyperlink('A', 'https://a.test')}${createHyperlink('B', 'https://b.test')}${createHyperlink('C', 'https://c.test')}`;

	assertVisibleSliceMatchesNative(t, input, 0, 3);
	assertVisibleSliceMatchesNative(t, input, 1, 3);
	assertVisibleSliceMatchesNative(t, input, 0, 2);
});

test('can slice through link boundaries with mixed terminators', t => {
	const input = `${createHyperlink('first', 'https://one.test', ANSI_STRING_TERMINATOR)} ${createHyperlink('second', 'https://two.test', ANSI_BELL, ANSI_STRING_TERMINATOR)}`;

	assertVisibleSliceMatchesNative(t, input, 0, 8);
	assertVisibleSliceMatchesNative(t, input, 2, 10);
	assertVisibleSliceMatchesNative(t, input, 5, 11);
});

test('handles malformed OSC hyperlink input without throwing', t => {
	const malformedOpen = `${ESCAPE}]8;;https://example.comGoogle`;
	const malformedClose = `${ESCAPE}]8;;https://example.com${ANSI_BELL}Google${ESCAPE}]8;;`;

	t.notThrows(() => {
		sliceAnsi(malformedOpen, 0, 3);
	});

	t.notThrows(() => {
		sliceAnsi(malformedClose, 0, 6);
	});

	t.false(sliceAnsi(malformedOpen, 0, 3).includes('null'));
	t.false(sliceAnsi(malformedOpen, 0, 3).includes('undefined'));
	t.false(sliceAnsi(malformedClose, 0, 6).includes('null'));
	t.false(sliceAnsi(malformedClose, 0, 6).includes('undefined'));
});

test('randomized invariant: visible slice matches native slice', t => {
	const iterations = 300;

	for (let index = 0; index < iterations; index++) {
		const input = createRandomValidAnsiText();
		const visible = stripForVisibleComparison(input);
		const start = createRandomInteger(visible.length + 1);
		const end = start + createRandomInteger(visible.length - start + 1);
		assertVisibleSliceMatchesNative(t, input, start, end);
	}
});

test('randomized invariant: full-range slice preserves visible text', t => {
	const iterations = 200;

	for (let index = 0; index < iterations; index++) {
		const input = createRandomValidAnsiText();
		const output = sliceAnsi(input, 0);
		t.is(stripForVisibleComparison(output), stripForVisibleComparison(input));
		t.false(output.includes('null'));
		t.false(output.includes('undefined'));
	}
});

test('can slice hyperlink with omitted end', t => {
	const link = createHyperlink('Google', 'https://google.com');
	t.is(sliceAnsi(link, 0), link);
});

test('can slice from the middle of a hyperlink with omitted end', t => {
	const url = 'https://google.com';
	const link = createHyperlink('Google', url);
	t.is(sliceAnsi(link, 2), createHyperlink('ogle', url));
});

test('does not include hyperlink escapes when slicing only outside linked text', t => {
	const input = `prefix ${createHyperlink('Google', 'https://google.com')} suffix`;
	t.is(sliceAnsi(input, 0, 3), 'pre');
	t.is(sliceAnsi(input, 14, 19), 'suffi');
});

test('does not include styles that start after end', t => {
	const input = `a${chalk.red('b')}`;
	t.is(sliceAnsi(input, 0, 1), 'a');
});

test('keeps C1 SGR CSI behavior', t => {
	const input = '\u009B31mred\u009B39m';
	t.is(stripAnsi(sliceAnsi(input, 0, 3)), 'red');
	t.is(sliceAnsi(input, 1, 2), '\u009B31me\u001B[39m');
});

test('treats non-canonical ESC CSI m sequences as non-visible control codes', t => {
	const input = '\u001B[?25mA';
	t.is(sliceAnsi(input, 0, 1), 'A');
});

test('treats non-canonical C1 CSI m sequences as non-visible control codes', t => {
	const input = '\u009B?25mA';
	t.is(sliceAnsi(input, 0, 1), 'A');
});

test('treats non-SGR CSI control sequences as non-visible control codes', t => {
	const input = '\u001B[2KA';
	t.is(sliceAnsi(input, 0, 1), 'A');
});

test('treats truncated CSI tails as non-visible control codes', t => {
	t.is(sliceAnsi('\u001B[31', 0, 1), '');
	t.is(sliceAnsi('\u009B31', 0, 1), '');
});

test('does not swallow visible text after malformed CSI bytes', t => {
	const input = '\u001B[31ĀA';
	t.is(sliceAnsi(input, 0, 1), 'Ā');
	t.is(sliceAnsi(input, 1, 2), 'A');
});

test('does not swallow visible text after malformed CSI prefix', t => {
	const input = '\u001B[ĀA';
	t.is(sliceAnsi(input, 0, 1), 'Ā');
	t.is(sliceAnsi(input, 1, 2), 'A');
});

test('does not swallow visible text after malformed C1 CSI prefix', t => {
	const input = '\u009BĀA';
	t.is(sliceAnsi(input, 0, 1), 'Ā');
	t.is(sliceAnsi(input, 1, 2), 'A');
});

test('treats generic OSC control sequences as non-visible control codes', t => {
	const input = '\u001B]0;title\u0007A';
	t.is(sliceAnsi(input, 0, 1), 'A');
});

test('treats DCS control strings as non-visible control codes', t => {
	const input = '\u001BP1;2;3+x\u001B\\A';
	t.is(sliceAnsi(input, 0, 1), 'A');
});

test('treats C1 DCS control strings as non-visible control codes', t => {
	const input = '\u0090payload\u009CA';
	t.is(sliceAnsi(input, 0, 1), 'A');
});

test('treats SOS control strings as non-visible control codes', t => {
	const input = '\u001BXpayload\u001B\\A';
	t.is(sliceAnsi(input, 0, 1), 'A');
});

test('treats PM control strings as non-visible control codes', t => {
	const input = '\u001B^payload\u001B\\A';
	t.is(sliceAnsi(input, 0, 1), 'A');
});

test('treats C1 APC control strings as non-visible control codes', t => {
	const input = '\u009Fpayload\u009CA';
	t.is(sliceAnsi(input, 0, 1), 'A');
});

test('treats standalone ST control sequences as non-visible control codes', t => {
	t.is(sliceAnsi('\u001B\\A', 0, 1), 'A');
	t.is(sliceAnsi('\u009CA', 0, 1), 'A');
});

test('preserves style state across private CSI m control codes', t => {
	const input = '\u001B[31mA\u001B[?25mB\u001B[39m';
	t.is(sliceAnsi(input, 0, 2), input);
	t.is(sliceAnsi(input, 1, 2), '\u001B[31mB\u001B[39m');
});

test('preserves visible indexing with control strings before styled text', t => {
	const input = '\u001B]0;title\u0007\u001B[31mAB\u001B[39m';
	t.is(sliceAnsi(input, 0, 1), '\u001B[31mA\u001B[39m');
	t.is(sliceAnsi(input, 1, 2), '\u001B[31mB\u001B[39m');
});

test('preserves visible indexing with control strings between characters', t => {
	const input = 'A\u001BP1;2;3+x\u001B\\B';
	t.is(sliceAnsi(input, 0, 2), input);
	t.is(sliceAnsi(input, 1, 2), 'B');
});

test('supports fullwidth slices inside hyperlinks', t => {
	const link = createHyperlink('古古ab', 'https://example.com');
	t.is(stripForVisibleComparison(sliceAnsi(link, 0, 2)), '古');
	t.is(stripForVisibleComparison(sliceAnsi(link, 2, 4)), '古');
	t.is(stripForVisibleComparison(sliceAnsi(link, 4, 6)), 'ab');
});

test('closes all styles from multi-parameter SGR code at slice end', t => {
	const input = '\u001B[1;31mX';
	t.is(sliceAnsi(input, 0, 1), '\u001B[1m\u001B[31mX\u001B[39m\u001B[22m');
});

test('preserves multi-parameter close codes after slice boundary', t => {
	const input = '\u001B[31;42mX\u001B[39m\u001B[49m';
	t.is(sliceAnsi(input, 0, 1), '\u001B[31m\u001B[42mX\u001B[39m\u001B[49m');
});

test('retains only background style after foreground closes from multi-parameter SGR', t => {
	const input = '\u001B[31;42mX\u001B[39mY\u001B[49m';
	t.is(sliceAnsi(input, 1, 2), '\u001B[42mY\u001B[49m');
});

test('overrides previous foreground styles cleanly', t => {
	const input = '\u001B[31mA\u001B[32mB';
	t.is(sliceAnsi(input, 0, 2), '\u001B[31mA\u001B[32mB\u001B[39m');
	t.is(sliceAnsi(input, 1, 2), '\u001B[32mB\u001B[39m');
});

test('handles reset mixed with start in one SGR sequence', t => {
	const input = '\u001B[32mA\u001B[0;31mB\u001B[39m';
	t.is(sliceAnsi(input, 1, 2), '\u001B[31mB\u001B[39m');
});

test('does not include start codes from mixed SGR sequences after end boundary', t => {
	const input = '\u001B[32mA\u001B[0;31mB\u001B[39m';
	t.is(sliceAnsi(input, 0, 1), '\u001B[32mA\u001B[39m');
});

test('returns empty for out-of-range start with active hyperlink before it', t => {
	const link = createHyperlink('Google', 'https://google.com');
	t.is(sliceAnsi(link, 100), '');
});

test('treats malformed OSC tail as non-visible', t => {
	const input = `${ESCAPE}]8;;https://example.com${ANSI_BELL}link${ESCAPE}]8;;broken plain`;
	t.is(stripForVisibleComparison(sliceAnsi(input, 0)), 'link');
});
