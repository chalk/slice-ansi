/* eslint-disable node-test/no-conditional-assertion, node-test/require-assertion -- Assertions live in bounded `for` loops and in helpers those loops call, never behind a branch that might not be taken. */
import test from 'node:test';
import assert from 'node:assert/strict';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import stringWidth from 'string-width';
import tokenizeAnsi from './tokenize-ansi.js';
import sliceAnsi from './index.js';

chalk.level = 1;

const fixture = chalk.red('the ') + chalk.green('quick ') + chalk.blue('brown ') + chalk.cyan('fox ') + chalk.yellow('jumped ');
const stripped = stripAnsi(fixture);
const ESCAPE = '\u{1B}';
const ANSI_BELL = '\u{7}';
const ANSI_STRING_TERMINATOR = `${ESCAPE}\\`;
const C1_OSC = '\u{9D}';
const C1_STRING_TERMINATOR = '\u{9C}';

// Use a fixed seed so randomized failures are reproducible.
let randomSeed = 42;

function randomItem(items) {
	return items[createRandomInteger(items.length)];
}

function generate(string) {
	const random1 = randomItem(['rock', 'paper', 'scissors']);
	const random2 = randomItem(['blue', 'green', 'yellow', 'red']);
	return `${string}:${chalk[random2](random1)} `;
}

function createHyperlink(text, url, terminator = ANSI_BELL, closeTerminator = terminator) {
	return `${ESCAPE}]8;;${url}${terminator}${text}${ESCAPE}]8;;${closeTerminator}`;
}

// Returns the index just past the OSC 8 hyperlink terminator, or -1 when the sequence never ends.
function findHyperlinkEnd(string, startIndex) {
	for (let sequenceIndex = startIndex; sequenceIndex < string.length; sequenceIndex++) {
		if (string[sequenceIndex] === ANSI_BELL) {
			return sequenceIndex + 1;
		}

		if (
			string[sequenceIndex] === ESCAPE
			&& string[sequenceIndex + 1] === '\\'
		) {
			return sequenceIndex + 2;
		}

		if (string[sequenceIndex] === C1_STRING_TERMINATOR) {
			return sequenceIndex + 1;
		}
	}

	return -1;
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

		const hyperlinkEnd = findHyperlinkEnd(string, index + hyperlinkPrefix.length);
		if (hyperlinkEnd === -1) {
			break;
		}

		index = hyperlinkEnd;
	}

	return output;
}

function stripForVisibleComparison(string) {
	return stripAnsi(stripOscHyperlinks(string));
}

function assertVisibleSliceMatchesNative(input, start, end) {
	const nativeSlice = stripForVisibleComparison(input).slice(start, end);
	const ansiSlice = stripForVisibleComparison(sliceAnsi(input, start, end));
	assert.equal(ansiSlice, nativeSlice);
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

function assertSlicesMatchPlainReference(plain, styled, maximumIndex = 6) {
	for (let start = 0; start <= maximumIndex; start++) {
		for (let end = start; end <= maximumIndex; end++) {
			const expected = stripForVisibleComparison(sliceAnsi(plain, start, end));
			const actual = stripForVisibleComparison(sliceAnsi(styled, start, end));
			assert.equal(actual, expected);
		}
	}
}

function createRandomInteger(maximum) {
	randomSeed = ((randomSeed * 1_664_525) + 1_013_904_223) % 0x1_00_00_00_00;
	return Math.floor((randomSeed / 0x1_00_00_00_00) * maximum);
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

test('main', () => {
	// The slice should behave exactly as a regular JS slice behaves
	for (let index = 0; index < 20; index++) {
		for (let index2 = 19; index2 > index; index2--) {
			const nativeSlice = stripped.slice(index, index2);
			const ansiSlice = sliceAnsi(fixture, index, index2);
			assert.equal(nativeSlice, stripAnsi(ansiSlice));
		}
	}

	const a = JSON.stringify('\u{1B}[31mthe \u{1B}[39m\u{1B}[32mquick \u{1B}[39m');
	const b = JSON.stringify('\u{1B}[34mbrown \u{1B}[39m\u{1B}[36mfox \u{1B}[39m');
	const c = JSON.stringify('\u{1B}[31m \u{1B}[39m\u{1B}[32mquick \u{1B}[39m\u{1B}[34mbrown \u{1B}[39m\u{1B}[36mfox \u{1B}[39m');

	assert.equal(JSON.stringify(sliceAnsi(fixture, 0, 10)), a);
	assert.equal(JSON.stringify(sliceAnsi(fixture, 10, 20)), b);
	assert.equal(JSON.stringify(sliceAnsi(fixture, 3, 20)), c);

	const string = Array.from({length: 30}, (_, index) => generate(index + 1)).join('');
	const native = stripAnsi(string).slice(0, 55);
	const ansi = stripAnsi(sliceAnsi(string, 0, 55));
	assert.equal(native, ansi);
});

test('supports fullwidth characters', () => {
	assert.equal(sliceAnsi('안녕하세', 0, 4), '안녕');
});

test('supports unicode surrogate pairs', () => {
	assert.equal(sliceAnsi('a\u{1F200}BC', 0, 2), 'a');
	assert.equal(sliceAnsi('a\u{1F200}BC', 0, 3), 'a\u{1F200}');
});

test('does not split grapheme clusters with combining marks', () => {
	const input = 'Ae\u{301}B';
	assert.equal(sliceAnsi(input, 1, 2), 'e\u{301}');
	assert.equal(sliceAnsi(input, 2, 3), 'B');
});

test('does not split ZWJ emoji grapheme clusters', () => {
	const input = 'A👨‍👩‍👧‍👦B';
	assert.equal(sliceAnsi(input, 1, 3), '👨‍👩‍👧‍👦');
	assert.equal(sliceAnsi(input, 3, 4), 'B');
});

test('counts CRLF as zero width', () => {
	const input = 'A\r\nB';
	assert.equal(sliceAnsi(input, 0, 1), 'A');
	assert.equal(sliceAnsi(input, 1, 2), '\r\nB');
	assert.equal(sliceAnsi(input, 2, 3), '');
});

test('keeps ANSI-split CRLF together at a zero-width boundary', () => {
	const red = `${ESCAPE}[31m`;
	const reset = `${ESCAPE}[39m`;
	const input = `A\r${red}\nB${reset}`;

	assert.equal(sliceAnsi(input, 0, 1), 'A');
	assert.equal(sliceAnsi(input, 1, 2), `\r${red}\nB${reset}`);
	assert.equal(sliceAnsi(input, 2), '');
});

test('does not split styled grapheme clusters with combining marks', () => {
	const input = '\u{1B}[31me\u{301}\u{1B}[39m';
	assert.equal(sliceAnsi(input, 0, 1), input);
	assert.equal(sliceAnsi(input, 1, 2), '');
});

test('does not split grapheme clusters when styles appear inside combining sequence', () => {
	const input = '\u{1B}[31me\u{1B}[39m\u{301}B';
	assert.equal(stripForVisibleComparison(sliceAnsi(input, 0, 1)), 'e\u{301}');
	assert.equal(stripForVisibleComparison(sliceAnsi(input, 1, 2)), 'B');
});

test('does not split Hangul Jamo grapheme clusters when styles appear inside sequence', () => {
	const input = '\u{1B}[31mᄀ\u{1B}[39mᅡB';
	assert.equal(stripForVisibleComparison(sliceAnsi(input, 0, 2)), '가');
	assert.equal(stripForVisibleComparison(sliceAnsi(input, 2, 3)), 'B');
});

test('keeps style opens inside grapheme continuation past end boundary', () => {
	const input = `e${chalk.red('\u{301}')}B`;
	assert.equal(sliceAnsi(input, 0, 1), `e${chalk.red('\u{301}')}`);
});

test('keeps hyperlink opens inside grapheme continuation past end boundary', () => {
	const open = `${ESCAPE}]8;;https://example.com${ANSI_BELL}`;
	const close = `${ESCAPE}]8;;${ANSI_BELL}`;
	const input = `e${open}\u{301}${close}B`;
	assert.equal(sliceAnsi(input, 0, 1), `e${open}\u{301}${close}`);
});

test('doesn\'t add unnecessary escape codes', () => {
	assert.equal(sliceAnsi('\u{1B}[31municorn\u{1B}[39m', 0, 3), '\u{1B}[31muni\u{1B}[39m');
});

test('can slice a normal character before a colored character', () => {
	assert.equal(sliceAnsi('a\u{1B}[31mb\u{1B}[39m', 0, 1), 'a');
});

test('can slice a normal character after a colored character', () => {
	assert.equal(sliceAnsi('\u{1B}[31ma\u{1B}[39mb', 1, 2), 'b');
});

// See https://github.com/chalk/slice-ansi/issues/22
test('can slice a string styled with both background and foreground', () => {
	// Test string: `chalk.bgGreen.black('test');`
	assert.equal(sliceAnsi('\u{1B}[42m\u{1B}[30mtest\u{1B}[39m\u{1B}[49m', 0, 1), '\u{1B}[42m\u{1B}[30mt\u{1B}[39m\u{1B}[49m');
});

test('can slice a string styled with modifier', () => {
	// Test string: `chalk.underline('test');`
	assert.equal(sliceAnsi('\u{1B}[4mtest\u{1B}[24m', 0, 1), '\u{1B}[4mt\u{1B}[24m');
});

test('can slice a string with unknown ANSI color', () => {
	assert.equal(sliceAnsi('\u{1B}[20mTEST\u{1B}[49m', 0, 4), '\u{1B}[20mTEST\u{1B}[0m');
	assert.equal(sliceAnsi('\u{1B}[1001mTEST\u{1B}[49m', 0, 3), '\u{1B}[1001mTES\u{1B}[0m');
	assert.equal(sliceAnsi('\u{1B}[1001mTEST\u{1B}[49m', 0, 2), '\u{1B}[1001mTE\u{1B}[0m');
});

test('weird null issue', () => {
	const s = '\u{1B}[1mautotune.flipCoin("easy as") ? 🎂 : 🍰 \u{1B}[33m★\u{1B}[39m\u{1B}[22m';
	const result = sliceAnsi(s, 38);
	assert.equal(result.includes('null'), false);
});

test('supports true color escape sequences', () => {
	const open = '\u{1B}[1m\u{1B}[48;2;255;255;255m\u{1B}[38;2;255;0;0m';
	const close = '\u{1B}[39m\u{1B}[49m\u{1B}[22m';
	assert.equal(sliceAnsi(`${open}unicorn${close}`, 0, 3), `${open}uni${close}`);
});

for (const parameters of ['58;5;1', '58;5;0', '58;2;255;0;0', '58;2;1;2;3', '58:2::255:0:0']) {
	test(`preserves underline color ${parameters}`, () => {
		const open = `${ESCAPE}[${parameters}m`;
		const close = `${ESCAPE}[59m`;
		const input = `${ESCAPE}[4m${open}hello${close}${ESCAPE}[24m`;

		assert.equal(sliceAnsi(input, 0, 3), `${ESCAPE}[4m${open}hel${close}${ESCAPE}[24m`);
		assert.equal(sliceAnsi(input, 1, 3), `${ESCAPE}[4m${open}el${close}${ESCAPE}[24m`);
		assert.equal(sliceAnsi(input, 1), `${ESCAPE}[4m${open}ello${close}${ESCAPE}[24m`);
	});
}

test('underline color reset preserves other styles', () => {
	const input = `${ESCAPE}[1;31;48;5;2;58;5;1mA${ESCAPE}[59mBC`;
	assert.equal(sliceAnsi(input, 1, 2), `${ESCAPE}[1m${ESCAPE}[31m${ESCAPE}[48;5;2mB${ESCAPE}[49m${ESCAPE}[39m${ESCAPE}[22m`);
});

test('new underline color replaces the previous color', () => {
	const input = `${ESCAPE}[58;5;1mA${ESCAPE}[58;2;0;255;0mBC`;
	assert.equal(sliceAnsi(input, 1, 2), `${ESCAPE}[58;2;0;255;0mB${ESCAPE}[59m`);
});

test('supports C1 underline color sequences', () => {
	const input = '\u{9B}58;2;255;0;0mhello\u{9B}59m';
	assert.equal(sliceAnsi(input, 1, 3), '\u{9B}58;2;255;0;0mel\u{1B}[59m');
});

test('supports colon-delimited truecolor SGR syntax', () => {
	assert.equal(sliceAnsi('\u{1B}[38:2:255:0:0mred\u{1B}[39m', 0, 1), '\u{1B}[38:2:255:0:0mr\u{1B}[39m');
});

test('treats omitted SGR parameters as resets', () => {
	for (const prefix of [`${ESCAPE}[`, '\u{9B}']) {
		assert.equal(sliceAnsi(`${prefix}1;32mA${prefix};31mBC`, 1, 2), `${prefix}31mB${ESCAPE}[39m`);
		assert.equal(sliceAnsi(`${prefix}1;32mA${prefix}31;mBC`, 1, 2), 'B');
		assert.equal(sliceAnsi(`${prefix}1;32mA${prefix}31;;4mBC`, 1, 2), `${prefix}4mB${ESCAPE}[24m`);
	}
});

test('keeps styles following colon-delimited colors independent', () => {
	for (const [color, close] of [[38, 39], [48, 49], [58, 59]]) {
		const input = `${ESCAPE}[${color}:2::255:0:0;2;3;4;7mAB${ESCAPE}[${close}mC`;
		const styles = `${ESCAPE}[2m${ESCAPE}[3m${ESCAPE}[4m${ESCAPE}[7m`;
		const closingStyles = `${ESCAPE}[27m${ESCAPE}[24m${ESCAPE}[23m${ESCAPE}[22m`;

		assert.equal(sliceAnsi(input, 1, 2), `${ESCAPE}[${color}:2::255:0:0m${styles}B${ESCAPE}[${close}m${closingStyles}`);
		assert.equal(sliceAnsi(input, 2), `${styles}C${closingStyles}`);
	}
});

// See https://github.com/chalk/slice-ansi/issues/24
test('doesn\'t add extra escapes', () => {
	const output = `${chalk.black.bgYellow(' RUNS ')}  ${chalk.green('test')}`;
	assert.equal(sliceAnsi(output, 0, 7), `${chalk.black.bgYellow(' RUNS ')} `);
	assert.equal(sliceAnsi(output, 0, 8), `${chalk.black.bgYellow(' RUNS ')}  `);
	assert.equal(JSON.stringify(sliceAnsi('\u{1B}[31m' + output, 0, 4)), JSON.stringify(chalk.black.bgYellow(' RUN')));
});

// See https://github.com/chalk/slice-ansi/issues/26
test('does not lose fullwidth characters', () => {
	assert.equal(sliceAnsi('古古test', 0), '古古test');
});

test('does not exceed endSlice for wide characters', () => {
	const input = 'あいう';
	assert.equal(sliceAnsi(input, 0, 0), '');
	assert.equal(sliceAnsi(input, 0, 1), '');
	assert.equal(sliceAnsi(input, 0, 2), 'あ');
	assert.equal(sliceAnsi(input, 0, 3), 'あ');
	assert.equal(sliceAnsi(input, 0, 4), 'あい');
	assert.equal(sliceAnsi(input, 0, 5), 'あい');
	assert.equal(sliceAnsi(input, 0, 6), 'あいう');
});

test('does not split regional-indicator flag graphemes', () => {
	const input = 'A🇮🇱B';
	assert.equal(sliceAnsi(input, 0, 1), 'A');
	assert.equal(sliceAnsi(input, 1, 2), '');
	assert.equal(sliceAnsi(input, 1, 3), '🇮🇱');
	assert.equal(sliceAnsi(input, 2, 3), '');
	assert.equal(sliceAnsi(input, 3, 4), 'B');
});

test('does not split styled regional-indicator flag graphemes', () => {
	const input = '\u{1B}[31m🇮🇱\u{1B}[39m';
	assert.equal(sliceAnsi(input, 0, 1), '');
	assert.equal(sliceAnsi(input, 0, 2), input);
	assert.equal(sliceAnsi(input, 1, 2), '');
});

test('does not exceed endSlice for styled wide characters in the middle of a string', () => {
	const input = `A${chalk.red('あ')}B`;
	assert.equal(sliceAnsi(input, 0, 2), 'A');
	assert.equal(stripForVisibleComparison(sliceAnsi(input, 1, 2)), '');
	assert.equal(stripForVisibleComparison(sliceAnsi(input, 1, 3)), 'あ');
});

test('does not include hyperlink escapes when endSlice excludes a wide grapheme', () => {
	const input = createHyperlink('あ', 'https://example.com');
	assert.equal(sliceAnsi(input, 0, 1), '');
	assert.equal(sliceAnsi(input, 0, 2), input);

	const prefixedInput = `A${input}B`;
	assert.equal(sliceAnsi(prefixedInput, 0, 2), 'A');
	assert.equal(sliceAnsi(prefixedInput, 1, 2), '');
	assert.equal(sliceAnsi(prefixedInput, 1, 3), input);
});

test('counts emoji-style graphemes as fullwidth', () => {
	assert.equal(sliceAnsi('A☺️B', 1, 3), '☺️');
	assert.equal(sliceAnsi('A1️⃣B', 1, 3), '1️⃣');
	assert.equal(sliceAnsi('A🇮🇱B', 1, 3), '🇮🇱');
});

test('does not exceed endSlice for styled emoji-style graphemes', () => {
	const input = `${chalk.red('☺️')}B`;
	assert.equal(sliceAnsi(input, 0, 1), '');
	assert.equal(sliceAnsi(input, 0, 2), chalk.red('☺️'));
});

test('does not treat text-presentation pictographs as fullwidth', () => {
	assert.equal(sliceAnsi('A☺B', 2, 3), 'B');
	assert.equal(sliceAnsi('A☂B', 2, 3), 'B');
});

test('omitted endSlice skips a wide grapheme when startSlice falls inside it', () => {
	assert.equal(sliceAnsi('AあB', 2), 'B');
	assert.equal(sliceAnsi('A🇮🇱B', 2), 'B');
});

test('can create empty slices', () => {
	assert.equal(sliceAnsi('test', 0, 0), '');
});

test('returns empty for equal or reversed column ranges', () => {
	for (const input of ['', 'abc', chalk.red('你好'), createHyperlink('abc', 'https://example.com'), `${ESCAPE}[31m`]) {
		for (const [start, end] of [[0, 0], [1, 1], [2, 1], [20, 10]]) {
			assert.equal(sliceAnsi(input, start, end), '');
		}
	}
});

test('assigns zero-width characters at a boundary to the following slice', () => {
	const input = 'a\u{200B}b\u{200B}';
	assert.equal(sliceAnsi(input, 0, 1), 'a');
	assert.equal(sliceAnsi(input, 1, 2), '\u{200B}b');
	assert.equal(sliceAnsi(input, 2), '\u{200B}');
	assert.equal(sliceAnsi(input, 0, 1) + sliceAnsi(input, 1, 2) + sliceAnsi(input, 2), input);
});

test('slice links (issue #31)', () => {
	const link = createHyperlink('Google', 'https://google.com');
	assert.equal(sliceAnsi(link, 0, 6), link);
});

test('supports OSC 8 hyperlinks with ST terminator', () => {
	const link = createHyperlink('Google', 'https://google.com', ANSI_STRING_TERMINATOR);
	assert.equal(sliceAnsi(link, 0, 6), link);
});

test('supports OSC 8 hyperlinks with mixed close terminator', () => {
	const link = createHyperlink('Google', 'https://google.com', ANSI_STRING_TERMINATOR, ANSI_BELL);
	assert.equal(sliceAnsi(link, 0, 6), link);
});

test('supports OSC 8 hyperlinks with parameters', () => {
	const link = `${ESCAPE}]8;id=abc;https://google.com${ANSI_BELL}Google${ESCAPE}]8;;${ANSI_BELL}`;
	assert.equal(sliceAnsi(link, 0, 6), link);
	assert.equal(sliceAnsi(link, 1, 4), `${ESCAPE}]8;id=abc;https://google.com${ANSI_BELL}oog${ESCAPE}]8;;${ANSI_BELL}`);
});

test('supports OSC 8 hyperlinks with parameters and ST terminator', () => {
	const link = `${ESCAPE}]8;id=abc;https://google.com${ANSI_STRING_TERMINATOR}Google${ESCAPE}]8;;${ANSI_STRING_TERMINATOR}`;
	assert.equal(sliceAnsi(link, 0, 6), link);
	assert.equal(sliceAnsi(link, 2), `${ESCAPE}]8;id=abc;https://google.com${ANSI_STRING_TERMINATOR}ogle${ESCAPE}]8;;${ANSI_STRING_TERMINATOR}`);
});

test('supports ESC OSC 8 hyperlinks with C1 ST terminator', () => {
	const link = `${ESCAPE}]8;;https://google.com${C1_STRING_TERMINATOR}Google${ESCAPE}]8;;${C1_STRING_TERMINATOR}`;
	assert.equal(sliceAnsi(link, 0, 6), link);
	assert.equal(sliceAnsi(link, 1, 4), `${ESCAPE}]8;;https://google.com${C1_STRING_TERMINATOR}oog${ESCAPE}]8;;${C1_STRING_TERMINATOR}`);
});

test('supports C1 OSC 8 hyperlinks with BEL terminator', () => {
	const link = `${C1_OSC}8;;https://google.com${ANSI_BELL}Google${C1_OSC}8;;${ANSI_BELL}`;
	assert.equal(sliceAnsi(link, 0, 6), link);
	assert.equal(sliceAnsi(link, 1, 4), `${C1_OSC}8;;https://google.com${ANSI_BELL}oog${C1_OSC}8;;${ANSI_BELL}`);
});

test('supports C1 OSC 8 hyperlinks with C1 ST terminator', () => {
	const link = `${C1_OSC}8;;https://google.com${C1_STRING_TERMINATOR}Google${C1_OSC}8;;${C1_STRING_TERMINATOR}`;
	assert.equal(sliceAnsi(link, 0, 6), link);
	assert.equal(sliceAnsi(link, 2), `${C1_OSC}8;;https://google.com${C1_STRING_TERMINATOR}ogle${C1_OSC}8;;${C1_STRING_TERMINATOR}`);
});

test('supports C1 OSC 8 hyperlinks with parameters and ESC ST terminator', () => {
	const link = `${C1_OSC}8;id=abc;https://google.com${ANSI_STRING_TERMINATOR}Google${C1_OSC}8;;${ANSI_STRING_TERMINATOR}`;
	assert.equal(sliceAnsi(link, 0, 6), link);
	assert.equal(sliceAnsi(link, 1, 4), `${C1_OSC}8;id=abc;https://google.com${ANSI_STRING_TERMINATOR}oog${C1_OSC}8;;${ANSI_STRING_TERMINATOR}`);
});

test('can slice each visible character from hyperlink', () => {
	const url = 'https://google.com';
	const text = 'Google';
	const link = createHyperlink(text, url);

	for (let index = 0; index < text.length; index++) {
		assert.equal(sliceAnsi(link, index, index + 1), createHyperlink(text.slice(index, index + 1), url));
	}
});

test('can slice partial hyperlink text', () => {
	const url = 'https://google.com';
	const link = createHyperlink('Google', url);
	assert.equal(sliceAnsi(link, 1, 4), createHyperlink('oog', url));
});

test('can create an empty slice inside hyperlink text', () => {
	const link = createHyperlink('Google', 'https://google.com');
	assert.equal(sliceAnsi(link, 2, 2), '');
});

test('keeps outer styles when slicing after hyperlink text', () => {
	const input = chalk.red(`${createHyperlink('AB', 'https://example.com')}C`);
	assert.equal(sliceAnsi(input, 2, 3), chalk.red('C'));
});

test('supports hyperlinks that close with non-empty parameters', () => {
	const link = `${ESCAPE}]8;id=abc;https://google.com${ANSI_BELL}Google${ESCAPE}]8;id=abc;${ANSI_BELL}`;
	assert.equal(sliceAnsi(link, 0, 6), link);
	assert.equal(sliceAnsi(link, 0, 4), `${ESCAPE}]8;id=abc;https://google.com${ANSI_BELL}Goog${ESCAPE}]8;;${ANSI_BELL}`);
});

test('supports hyperlink slices with unicode surrogate pairs', () => {
	const url = 'https://example.com';
	const link = createHyperlink('a🙂b', url);
	assert.equal(sliceAnsi(link, 1, 3), createHyperlink('🙂', url));
});

test('preserves grapheme clusters when slicing hyperlink text', () => {
	const url = 'https://example.com';
	const link = createHyperlink('A👨‍👩‍👧‍👦B', url);
	assert.equal(sliceAnsi(link, 1, 3), createHyperlink('👨‍👩‍👧‍👦', url));
	assert.equal(sliceAnsi(link, 2, 3), '');
});

test('does not split grapheme clusters when styles appear inside ZWJ sequence', () => {
	const input = '\u{1B}[31m👨\u{1B}[39m‍👩‍👧‍👦B';
	assert.equal(stripForVisibleComparison(sliceAnsi(input, 0, 2)), '👨‍👩‍👧‍👦');
	assert.equal(stripForVisibleComparison(sliceAnsi(input, 2, 3)), 'B');
});

test('does not split grapheme clusters when styles appear between ZWJ and following pictograph', () => {
	const input = `👨‍${chalk.red('👩‍👧‍👦')}B`;
	assert.equal(stripForVisibleComparison(sliceAnsi(input, 0, 2)), '👨‍👩‍👧‍👦');
	assert.equal(stripForVisibleComparison(sliceAnsi(input, 2, 3)), 'B');
});

test('keeps grapheme-safe boundaries with SGR inserted at internal scalar boundaries', () => {
	const graphemes = [
		'e\u{301}',
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
			assertSlicesMatchPlainReference(plain, styled);
		}
	}
});

test('keeps grapheme-safe boundaries with hyperlink tokens inserted at internal scalar boundaries', () => {
	const graphemes = [
		'e\u{301}',
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
			assertSlicesMatchPlainReference(plain, styled);
		}
	}
});

test('indexes successive ANSI-split graphemes by their full column widths', () => {
	const input = `A${chalk.red('e')}\u{301}${createHyperlink('👨', 'https://example.com')}‍👩${chalk.blue('ᄀ')}ᅡB`;
	const expectedSlices = [[0, 1, 'A'], [1, 2, 'e\u{301}'], [2, 4, '👨‍👩'], [4, 6, '가'], [6, 7, 'B']];

	for (const [start, end, expected] of expectedSlices) {
		assert.equal(stripForVisibleComparison(sliceAnsi(input, start, end)), expected);
	}

	assert.equal(stripForVisibleComparison(sliceAnsi(input, 0)), 'Ae\u{301}👨‍👩가B');
});

test('tokenizes ANSI-split text into complete graphemes', () => {
	const input = `${chalk.red('e')}\u{301}${createHyperlink('👨', 'https://example.com')}‍👩B`;
	const characters = tokenizeAnsi(input).filter(token => token.type === 'character');
	assert.deepEqual(characters.map(({value, visibleWidth}) => [value, visibleWidth]), [['e\u{301}', 1], ['👨‍👩', 2], ['B', 1]]);
	assert.deepEqual(tokenizeAnsi(input, {endCharacter: 1}).filter(token => token.type === 'character').map(token => token.value), ['e\u{301}']);
});

test('slices every column range across independently styled graphemes', () => {
	const graphemes = [['A', 1], ['e\u{301}', 1], ['👨‍👩', 2], ['가', 2], ['🇮🇱', 2], ['B', 1]];
	const plain = graphemes.map(([value]) => value).join('');
	const styled = [...plain].map((scalar, index) => index % 2 === 0 ? chalk.red(scalar) : createHyperlink(scalar, 'https://example.com')).join('');

	for (let start = 0; start <= 10; start++) {
		for (let end = start; end <= 10; end++) {
			let position = 0;
			let expected = '';
			for (const [value, width] of graphemes) {
				if (position >= start && position + width <= end) {
					expected += value;
				}

				position += width;
			}

			assert.equal(stripForVisibleComparison(sliceAnsi(styled, start, end)), expected, `slice(${start}, ${end})`);
		}
	}
});

test('preserves link and style transitions within a selected grapheme', () => {
	const open = `${ESCAPE}]8;;https://example.com${ANSI_BELL}`;
	const close = `${ESCAPE}]8;;${ANSI_BELL}`;
	const red = `${ESCAPE}[31m`;
	const reset = `${ESCAPE}[39m`;
	const input = `${open}a${red}${close}\u{301}B${reset}`;

	assert.equal(sliceAnsi(input, 0, 1), `${open}a${red}${close}\u{301}${reset}`);
	assert.equal(sliceAnsi(input, 1, 2), `${red}B${reset}`);
});

test('inherits style and hyperlink transitions within a skipped wide grapheme', () => {
	const red = `${ESCAPE}[31m`;
	const reset = `${ESCAPE}[39m`;
	const open = `${ESCAPE}]8;;https://example.com${ANSI_BELL}`;
	const close = `${ESCAPE}]8;;${ANSI_BELL}`;

	assert.equal(sliceAnsi(`👨${red}‍👩B${reset}`, 1, 3), `${red}B${reset}`);
	assert.equal(sliceAnsi(`${red}👨${reset}‍👩B`, 1, 3), 'B');
	assert.equal(sliceAnsi(`👨${open}‍👩B${close}`, 1, 3), `${open}B${close}`);
	assert.equal(sliceAnsi(`${open}👨${close}‍👩B`, 1, 3), 'B');
});

test('discards empty links independently of pending style checkpoints', () => {
	const open = `${ESCAPE}]8;;https://example.com${ANSI_BELL}`;
	const otherOpen = `${ESCAPE}]8;;https://other.test${ANSI_BELL}`;
	const close = `${ESCAPE}]8;;${ANSI_BELL}`;
	const red = `${ESCAPE}[31m`;
	const bold = `${ESCAPE}[1m`;
	const transitions = [
		`${open}${red}${close}${otherOpen}${bold}${close}`,
		`${red}${open}${bold}${otherOpen}${close}`,
		`${open}${red}${otherOpen}${bold}${open}${close}`,
	];

	for (const transition of transitions) {
		const input = `A${transition}😀B`;
		assert.equal(sliceAnsi(input, 0, 2), 'A');
		assert.equal(sliceAnsi(input, 0, 3), `A${red}${bold}😀${ESCAPE}[22m${ESCAPE}[39m`);
	}
});

test('rolls back hyperlink state together with output and styles', () => {
	const open = `${ESCAPE}]8;;https://one.test${ANSI_BELL}`;
	const otherOpen = `${ESCAPE}]8;;https://two.test${ANSI_BELL}`;
	const close = `${ESCAPE}]8;;${ANSI_BELL}`;

	for (const transition of [otherOpen, close, `${otherOpen}${close}`]) {
		assert.equal(sliceAnsi(`${open}A${ESCAPE}[31m${transition}😀`, 0, 2), `${open}A${close}`);
	}
});

test('keeps UTF-16 offsets when ANSI separates surrogate halves', () => {
	const input = `\u{D800}${ESCAPE}[31m\u{DC00}ABC`;
	assert.equal(stripForVisibleComparison(sliceAnsi(input, 0, 1)), '\u{10000}');
	assert.equal(sliceAnsi(input, 1, 2), `${ESCAPE}[31mA${ESCAPE}[39m`);
	assert.equal(stripForVisibleComparison(sliceAnsi(input, 0)), '\u{10000}ABC');
});

test('can slice across plain text and hyperlink boundaries', () => {
	const url = 'https://google.com';
	const input = `A${createHyperlink('Google', url)}B`;
	assert.equal(sliceAnsi(input, 0, 2), `A${createHyperlink('G', url)}`);
	assert.equal(sliceAnsi(input, 6, 8), `${createHyperlink('e', url)}B`);
});

test('can slice a hyperlink that remains open to the end', () => {
	const link = `${ESCAPE}]8;;https://google.com${ANSI_BELL}Google`;
	assert.equal(sliceAnsi(link, 0, 6), createHyperlink('Google', 'https://google.com'));
});

test('can slice hyperlinks with nested style transitions', () => {
	const url = 'https://example.com';
	const input = createHyperlink(`${chalk.red('R')}${chalk.green('G')}${chalk.blue('B')}`, url);

	assertVisibleSliceMatchesNative(input, 0, 3);
	assertVisibleSliceMatchesNative(input, 1, 3);
	assertVisibleSliceMatchesNative(input, 1, 2);
});

test('can slice styled hyperlink text without dropping styles', () => {
	const url = 'https://example.com';
	const input = chalk.bgGreen.black(createHyperlink(chalk.red('test'), url));

	assertVisibleSliceMatchesNative(input, 0, 4);
	assertVisibleSliceMatchesNative(input, 1, 3);
});

test('can slice multiple hyperlinks in one string', () => {
	const input = `${createHyperlink('one', 'https://one.test')}-${createHyperlink('two', 'https://two.test')}`;

	assertVisibleSliceMatchesNative(input, 0, 7);
	assertVisibleSliceMatchesNative(input, 1, 6);
	assertVisibleSliceMatchesNative(input, 3, 7);
});

test('can slice back-to-back hyperlinks', () => {
	const input = `${createHyperlink('A', 'https://a.test')}${createHyperlink('B', 'https://b.test')}${createHyperlink('C', 'https://c.test')}`;

	assertVisibleSliceMatchesNative(input, 0, 3);
	assertVisibleSliceMatchesNative(input, 1, 3);
	assertVisibleSliceMatchesNative(input, 0, 2);
});

test('can slice through link boundaries with mixed terminators', () => {
	const input = `${createHyperlink('first', 'https://one.test', ANSI_STRING_TERMINATOR)} ${createHyperlink('second', 'https://two.test', ANSI_BELL, ANSI_STRING_TERMINATOR)}`;

	assertVisibleSliceMatchesNative(input, 0, 8);
	assertVisibleSliceMatchesNative(input, 2, 10);
	assertVisibleSliceMatchesNative(input, 5, 11);
});

test('handles malformed OSC hyperlink input without throwing', () => {
	const malformedOpen = `${ESCAPE}]8;;https://example.comGoogle`;
	const malformedClose = `${ESCAPE}]8;;https://example.com${ANSI_BELL}Google${ESCAPE}]8;;`;

	sliceAnsi(malformedOpen, 0, 3);
	sliceAnsi(malformedClose, 0, 6);

	assert.equal(sliceAnsi(malformedOpen, 0, 3).includes('null'), false);
	assert.equal(sliceAnsi(malformedOpen, 0, 3).includes('undefined'), false);
	assert.equal(sliceAnsi(malformedClose, 0, 6).includes('null'), false);
	assert.equal(sliceAnsi(malformedClose, 0, 6).includes('undefined'), false);
});

test('randomized invariant: visible slice matches native slice', () => {
	const iterations = 300;

	for (let index = 0; index < iterations; index++) {
		const input = createRandomValidAnsiText();
		const visible = stripForVisibleComparison(input);
		const start = createRandomInteger(visible.length + 1);
		const end = start + createRandomInteger(visible.length - start + 1);
		assertVisibleSliceMatchesNative(input, start, end);
	}
});

test('randomized invariant: full-range slice preserves visible text', () => {
	const iterations = 200;

	for (let index = 0; index < iterations; index++) {
		const input = createRandomValidAnsiText();
		const output = sliceAnsi(input, 0);
		assert.equal(stripForVisibleComparison(output), stripForVisibleComparison(input));
		assert.equal(output.includes('null'), false);
		assert.equal(output.includes('undefined'), false);
	}
});

test('can slice hyperlink with omitted end', () => {
	const link = createHyperlink('Google', 'https://google.com');
	assert.equal(sliceAnsi(link, 0), link);
});

test('can slice from the middle of a hyperlink with omitted end', () => {
	const url = 'https://google.com';
	const link = createHyperlink('Google', url);
	assert.equal(sliceAnsi(link, 2), createHyperlink('ogle', url));
});

test('does not include hyperlink escapes when slicing only outside linked text', () => {
	const input = `prefix ${createHyperlink('Google', 'https://google.com')} suffix`;
	assert.equal(sliceAnsi(input, 0, 3), 'pre');
	assert.equal(sliceAnsi(input, 14, 19), 'suffi');
});

test('preserves surrounding SGR changes when discarding an empty hyperlink', () => {
	const input = '\u{1B}[31mA\u{1B}]8;;https://example.com\u{7}\u{1B}[39m\u{1B}]8;;\u{7}B';
	assert.equal(sliceAnsi(input, 0, 2), '\u{1B}[31mA\u{1B}[39mB');
});

test('does not include styles that start after end', () => {
	const input = `a${chalk.red('b')}`;
	assert.equal(sliceAnsi(input, 0, 1), 'a');
});

test('keeps C1 SGR CSI behavior', () => {
	const input = '\u{9B}31mred\u{9B}39m';
	assert.equal(stripAnsi(sliceAnsi(input, 0, 3)), 'red');
	assert.equal(sliceAnsi(input, 1, 2), '\u{9B}31me\u{1B}[39m');
});

test('treats non-canonical ESC CSI m sequences as non-visible control codes', () => {
	const input = '\u{1B}[?25mA';
	assert.equal(sliceAnsi(input, 0, 1), 'A');
});

test('treats non-canonical C1 CSI m sequences as non-visible control codes', () => {
	const input = '\u{9B}?25mA';
	assert.equal(sliceAnsi(input, 0, 1), 'A');
});

test('treats non-SGR CSI control sequences as non-visible control codes', () => {
	const input = '\u{1B}[2KA';
	assert.equal(sliceAnsi(input, 0, 1), 'A');
});

test('treats truncated CSI tails as non-visible control codes', () => {
	assert.equal(sliceAnsi('\u{1B}[31', 0, 1), '');
	assert.equal(sliceAnsi('\u{9B}31', 0, 1), '');
});

test('does not swallow visible text after malformed CSI bytes', () => {
	const input = '\u{1B}[31ĀA';
	assert.equal(sliceAnsi(input, 0, 1), 'Ā');
	assert.equal(sliceAnsi(input, 1, 2), 'A');
});

test('does not swallow visible text after malformed CSI prefix', () => {
	const input = '\u{1B}[ĀA';
	assert.equal(sliceAnsi(input, 0, 1), 'Ā');
	assert.equal(sliceAnsi(input, 1, 2), 'A');
});

test('does not swallow visible text after malformed C1 CSI prefix', () => {
	const input = '\u{9B}ĀA';
	assert.equal(sliceAnsi(input, 0, 1), 'Ā');
	assert.equal(sliceAnsi(input, 1, 2), 'A');
});

test('treats generic OSC control sequences as non-visible control codes', () => {
	const input = '\u{1B}]0;title\u{7}A';
	assert.equal(sliceAnsi(input, 0, 1), 'A');
});

test('treats DCS control strings as non-visible control codes', () => {
	const input = '\u{1B}P1;2;3+x\u{1B}\\A';
	assert.equal(sliceAnsi(input, 0, 1), 'A');
});

test('treats C1 DCS control strings as non-visible control codes', () => {
	const input = '\u{90}payload\u{9C}A';
	assert.equal(sliceAnsi(input, 0, 1), 'A');
});

test('treats SOS control strings as non-visible control codes', () => {
	const input = '\u{1B}Xpayload\u{1B}\\A';
	assert.equal(sliceAnsi(input, 0, 1), 'A');
});

test('treats PM control strings as non-visible control codes', () => {
	const input = '\u{1B}^payload\u{1B}\\A';
	assert.equal(sliceAnsi(input, 0, 1), 'A');
});

test('treats C1 APC control strings as non-visible control codes', () => {
	const input = '\u{9F}payload\u{9C}A';
	assert.equal(sliceAnsi(input, 0, 1), 'A');
});

test('does not terminate non-OSC control strings at BEL', () => {
	for (const prefix of [`${ESCAPE}P`, `${ESCAPE}X`, `${ESCAPE}^`, `${ESCAPE}_`, '\u{90}', '\u{98}', '\u{9E}', '\u{9F}']) {
		for (const terminator of [ANSI_STRING_TERMINATOR, C1_STRING_TERMINATOR]) {
			assert.equal(sliceAnsi(`${prefix}hidden${ANSI_BELL}payload${terminator}A`, 0, 1), 'A');
		}
	}
});

test('treats standalone ST control sequences as non-visible control codes', () => {
	assert.equal(sliceAnsi('\u{1B}\\A', 0, 1), 'A');
	assert.equal(sliceAnsi('\u{9C}A', 0, 1), 'A');
});

test('preserves style state across private CSI m control codes', () => {
	const input = '\u{1B}[31mA\u{1B}[?25mB\u{1B}[39m';
	assert.equal(sliceAnsi(input, 0, 2), input);
	assert.equal(sliceAnsi(input, 1, 2), '\u{1B}[31mB\u{1B}[39m');
});

test('preserves visible indexing with control strings before styled text', () => {
	const input = '\u{1B}]0;title\u{7}\u{1B}[31mAB\u{1B}[39m';
	assert.equal(sliceAnsi(input, 0, 1), '\u{1B}[31mA\u{1B}[39m');
	assert.equal(sliceAnsi(input, 1, 2), '\u{1B}[31mB\u{1B}[39m');
});

test('preserves visible indexing with control strings between characters', () => {
	const input = 'A\u{1B}P1;2;3+x\u{1B}\\B';
	assert.equal(sliceAnsi(input, 0, 2), input);
	assert.equal(sliceAnsi(input, 1, 2), 'B');
});

test('supports fullwidth slices inside hyperlinks', () => {
	const link = createHyperlink('古古ab', 'https://example.com');
	assert.equal(stripForVisibleComparison(sliceAnsi(link, 0, 2)), '古');
	assert.equal(stripForVisibleComparison(sliceAnsi(link, 2, 4)), '古');
	assert.equal(stripForVisibleComparison(sliceAnsi(link, 4, 6)), 'ab');
});

test('closes all styles from multi-parameter SGR code at slice end', () => {
	const input = '\u{1B}[1;31mX';
	assert.equal(sliceAnsi(input, 0, 1), '\u{1B}[1m\u{1B}[31mX\u{1B}[39m\u{1B}[22m');
});

test('preserves multi-parameter close codes after slice boundary', () => {
	const input = '\u{1B}[31;42mX\u{1B}[39m\u{1B}[49m';
	assert.equal(sliceAnsi(input, 0, 1), '\u{1B}[31m\u{1B}[42mX\u{1B}[39m\u{1B}[49m');
});

test('retains only background style after foreground closes from multi-parameter SGR', () => {
	const input = '\u{1B}[31;42mX\u{1B}[39mY\u{1B}[49m';
	assert.equal(sliceAnsi(input, 1, 2), '\u{1B}[42mY\u{1B}[49m');
});

test('overrides previous foreground styles cleanly', () => {
	const input = '\u{1B}[31mA\u{1B}[32mB';
	assert.equal(sliceAnsi(input, 0, 2), '\u{1B}[31mA\u{1B}[32mB\u{1B}[39m');
	assert.equal(sliceAnsi(input, 1, 2), '\u{1B}[32mB\u{1B}[39m');
});

test('handles reset mixed with start in one SGR sequence', () => {
	const input = '\u{1B}[32mA\u{1B}[0;31mB\u{1B}[39m';
	assert.equal(sliceAnsi(input, 1, 2), '\u{1B}[31mB\u{1B}[39m');
});

test('does not include start codes from mixed SGR sequences after end boundary', () => {
	const input = '\u{1B}[32mA\u{1B}[0;31mB\u{1B}[39m';
	assert.equal(sliceAnsi(input, 0, 1), '\u{1B}[32mA\u{1B}[39m');
});

test('returns empty for out-of-range start with active hyperlink before it', () => {
	const link = createHyperlink('Google', 'https://google.com');
	assert.equal(sliceAnsi(link, 100), '');
});

test('treats malformed OSC tail as non-visible', () => {
	const input = `${ESCAPE}]8;;https://example.com${ANSI_BELL}link${ESCAPE}]8;;broken plain`;
	assert.equal(stripForVisibleComparison(sliceAnsi(input, 0)), 'link');
});

test('does not read hyperlink parameters beyond the OSC terminator', () => {
	for (const prefix of [`${ESCAPE}]`, C1_OSC]) {
		for (const terminator of [ANSI_BELL, ANSI_STRING_TERMINATOR, C1_STRING_TERMINATOR]) {
			const malformedHyperlink = `${prefix}8;id=missing-uri${terminator}`;
			assert.equal(sliceAnsi(`${malformedHyperlink}A;BC`, 0), 'A;BC');
			assert.equal(sliceAnsi(`X${malformedHyperlink}A;BC`, 0), `X${malformedHyperlink}A;BC`);
		}
	}
});

test('does not leave a hyperlink open when a new open replaces an active one', () => {
	const open1 = `${ESCAPE}]8;;https://one.test${ANSI_BELL}`;
	const open2 = `${ESCAPE}]8;;https://two.test${ANSI_BELL}`;
	const close = `${ESCAPE}]8;;${ANSI_BELL}`;

	assert.equal(sliceAnsi(`X${open1}${open2}${close}`, 0), 'X');
	assert.equal(sliceAnsi(`X${open1}${open2}a${close}`, 0), `X${open2}a${close}`);
	assert.equal(sliceAnsi(`${open1}a${open2}${close}`, 0), `${open1}a${close}`);
	assert.equal(sliceAnsi(`${open1}a${open2}b${close}`, 0), `${open1}a${close}${open2}b${close}`);
});

test('discards styles before an excluded wide grapheme after replacing an empty hyperlink', () => {
	const open1 = `${ESCAPE}]8;;https://a-very-long-url-one.test${ANSI_BELL}`;
	const open2 = `${ESCAPE}]8;;https://two.test${ANSI_BELL}`;
	const close = `${ESCAPE}]8;;${ANSI_BELL}`;

	assert.equal(sliceAnsi(`X${open1}${ESCAPE}[1m${open2}😀${close}`, 0, 2), 'X');
});

test('discards a trailing empty hyperlink', () => {
	const open = `${ESCAPE}]8;;https://example.com${ANSI_BELL}`;

	assert.equal(sliceAnsi(`X${open}`, 0), 'X');
	assert.equal(sliceAnsi(`X${open}`, 0, 1), 'X');
	assert.equal(sliceAnsi(`${ESCAPE}[31mX${open}`, 0), `${ESCAPE}[31mX${ESCAPE}[39m`);
});

test('keeps hyperlinks balanced for every slice range when opens replace each other', () => {
	const open1 = `${ESCAPE}]8;;https://one.test${ANSI_BELL}`;
	const open2 = `${ESCAPE}]8;;https://two.test${ANSI_BELL}`;
	const close = `${ESCAPE}]8;;${ANSI_BELL}`;
	const input = `A${open1}bc${open2}${open1}de${chalk.red('f')}${open2}g${close}h`;

	for (let start = 0; start <= 8; start++) {
		for (let end = start; end <= 8; end++) {
			const output = sliceAnsi(input, start, end);
			const hyperlinkTokens = tokenizeAnsi(output).filter(token => token.type === 'hyperlink');

			for (const [index, token] of hyperlinkTokens.entries()) {
				assert.equal(token.action, index % 2 === 0 ? 'open' : 'close', `unbalanced hyperlinks in slice(${start}, ${end})`);
			}

			assert.equal(hyperlinkTokens.length % 2, 0, `hyperlink left open in slice(${start}, ${end})`);
			assertVisibleSliceMatchesNative(input, start, end);
		}
	}
});

test('slices across a replaced hyperlink boundary', () => {
	const open1 = `${ESCAPE}]8;;https://one.test${ANSI_BELL}`;
	const open2 = `${ESCAPE}]8;;https://two.test${ANSI_BELL}`;
	const close = `${ESCAPE}]8;;${ANSI_BELL}`;
	const input = `${open1}ab${open2}cd${close}`;

	assert.equal(sliceAnsi(input, 0, 1), `${open1}a${close}`);
	assert.equal(sliceAnsi(input, 0, 2), `${open1}ab${close}`);
	assert.equal(sliceAnsi(input, 0, 3), `${open1}ab${close}${open2}c${close}`);
	assert.equal(sliceAnsi(input, 1, 3), `${open1}b${close}${open2}c${close}`);
	assert.equal(sliceAnsi(input, 2), `${open2}cd${close}`);
	assert.equal(sliceAnsi(input, 3), `${open2}d${close}`);
});

test('keeps styles that change between replaced hyperlinks', () => {
	const open1 = `${ESCAPE}]8;;https://one.test${ANSI_BELL}`;
	const open2 = `${ESCAPE}]8;;https://two.test${ANSI_BELL}`;
	const close = `${ESCAPE}]8;;${ANSI_BELL}`;
	const input = `${open1}a${ESCAPE}[31m${open2}b${close}${ESCAPE}[39m`;

	assert.equal(sliceAnsi(input, 0), `${open1}a${ESCAPE}[31m${close}${open2}b${close}${ESCAPE}[39m`);
	assert.equal(sliceAnsi(input, 1), `${ESCAPE}[31m${open2}b${close}${ESCAPE}[39m`);
	assert.equal(sliceAnsi(input, 0, 1), `${open1}a${close}`);
});

test('handles a chain of replacing hyperlink opens', () => {
	const open1 = `${ESCAPE}]8;;https://one.test${ANSI_BELL}`;
	const open2 = `${ESCAPE}]8;;https://two.test${ANSI_BELL}`;
	const close = `${ESCAPE}]8;;${ANSI_BELL}`;

	assert.equal(sliceAnsi(`${open1}a${open2}${open1}b${close}`, 0), `${open1}a${close}${open1}b${close}`);
	assert.equal(sliceAnsi(`X${open1}${open2}${open1}${close}Y`, 0), 'XY');
	assert.equal(sliceAnsi(`${open1}${open2}a${close}`, 0), `${open2}a${close}`);
});

test('closes a replaced hyperlink when the string has no close', () => {
	const open1 = `${ESCAPE}]8;;https://one.test${ANSI_BELL}`;
	const open2 = `${ESCAPE}]8;;https://two.test${ANSI_BELL}`;
	const close = `${ESCAPE}]8;;${ANSI_BELL}`;

	assert.equal(sliceAnsi(`${open1}a${open2}b`, 0), `${open1}a${close}${open2}b${close}`);
	assert.equal(sliceAnsi(`${open1}a${open2}`, 0), `${open1}a${close}`);
});

test('closes a replaced hyperlink with its own terminator and prefix', () => {
	const open1 = `${ESCAPE}]8;;https://one.test${ANSI_STRING_TERMINATOR}`;
	const open2 = `${C1_OSC}8;;https://two.test${ANSI_BELL}`;
	const close = `${C1_OSC}8;;${ANSI_BELL}`;

	assert.equal(sliceAnsi(`${open1}a${open2}b${close}`, 0), `${open1}a${ESCAPE}]8;;${ANSI_STRING_TERMINATOR}${open2}b${close}`);
});

test('keeps parameters of a replacing hyperlink open', () => {
	const open1 = `${ESCAPE}]8;;https://one.test${ANSI_BELL}`;
	const open2 = `${ESCAPE}]8;id=abc;https://two.test${ANSI_BELL}`;
	const close = `${ESCAPE}]8;;${ANSI_BELL}`;

	assert.equal(sliceAnsi(`${open1}a${open2}b${close}`, 0), `${open1}a${close}${open2}b${close}`);
});

test('a halfwidth voiced sound mark widens its cluster', () => {
	// U+FF9E is a spacing mark in the Halfwidth and Fullwidth Forms block, so `ｶﾞ` occupies two columns.
	// Counting the cluster as one made every slice one column too wide.
	assert.equal(sliceAnsi('ｶﾞ', 0, 1), '');
	assert.equal(sliceAnsi('ｶﾞ', 0, 2), 'ｶﾞ');
	assert.equal(sliceAnsi('aﾞ', 0, 1), '');
	assert.equal(sliceAnsi('ｳﾞｰ', 0, 2), 'ｳﾞ');
	assert.equal(sliceAnsi('ｳﾞｰ', 0, 3), 'ｳﾞｰ');

	// A full slice of the text is unchanged.
	assert.equal(sliceAnsi('ﾊﾞﾊﾞﾊﾞﾊﾞ', 0, 8), 'ﾊﾞﾊﾞﾊﾞﾊﾞ');

	// Plain text is still one column per cluster.
	assert.equal(sliceAnsi('abc', 0, 1), 'a');
	assert.equal(sliceAnsi('abc', 0, 3), 'abc');
	assert.equal(sliceAnsi('á', 0, 1), 'á');
});

test('counts columns the same way as string-width', () => {
	// Zero-width characters take no column, so they stay with the text after them.
	assert.equal(sliceAnsi('a\tb', 0, 1), 'a');
	assert.equal(sliceAnsi('a\tb', 1, 2), '\tb');
	assert.equal(sliceAnsi('a\u{200B}b', 0, 2), 'a\u{200B}b');
	assert.equal(sliceAnsi('a\u{1}b', 0, 2), 'a\u{1}b');

	// A lone regional indicator is one column, and a flag is two.
	assert.equal(sliceAnsi('A🇦B', 1, 2), '🇦');

	// A leading Hangul jamo plus a syllable forms one cluster that is four columns wide.
	assert.equal(sliceAnsi('ᄀ가B', 0, 3), '');
	assert.equal(sliceAnsi('ᄀ가B', 0, 4), 'ᄀ가');

	const inputs = ['a\tb c', 'ᄀ가 ab', 'ｶﾞ 🇦 x', 'e\u{301} \r\n 你好', '👨‍👩‍👧 a\u{200B}b', `${chalk.red('ᄀ가')} ${chalk.green('a\tb')}`];
	for (const input of inputs) {
		for (let end = 0; end <= stringWidth(input) + 1; end++) {
			assert.ok(stringWidth(sliceAnsi(input, 0, end)) <= end, `${JSON.stringify(input)} end: ${end}`);
		}

		assert.equal(stringWidth(sliceAnsi(input, 0)), stringWidth(input));
	}
});
