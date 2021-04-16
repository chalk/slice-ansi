import test from 'ava';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import randomItem from 'random-item';
import sliceAnsi from './index.js';

chalk.level = 1;

const fixture = chalk.red('the ') + chalk.green('quick ') + chalk.blue('brown ') + chalk.cyan('fox ') + chalk.yellow('jumped ');
const stripped = stripAnsi(fixture);

function generate(string) {
	const random1 = randomItem(['rock', 'paper', 'scissors']);
	const random2 = randomItem(['blue', 'green', 'yellow', 'red']);
	return `${string}:${chalk[random2](random1)} `;
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
	t.is(sliceAnsi('a\uD83C\uDE00BC', 0, 2), 'a\uD83C\uDE00');
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

test('support true color escape sequences', t => {
	t.is(sliceAnsi('\u001B[1m\u001B[48;2;255;255;255m\u001B[38;2;255;0;0municorn\u001B[39m\u001B[49m\u001B[22m', 0, 3), '\u001B[1m\u001B[48;2;255;255;255m\u001B[38;2;255;0;0muni\u001B[22m\u001B[49m\u001B[39m');
});

// See https://github.com/chalk/slice-ansi/issues/24
test('doesn\'t add extra escapes', t => {
	const output = `${chalk.black.bgYellow(' RUNS ')}  ${chalk.green('test')}`;
	t.is(sliceAnsi(output, 0, 7), `${chalk.black.bgYellow(' RUNS ')} `);
	t.is(sliceAnsi(output, 0, 8), `${chalk.black.bgYellow(' RUNS ')}  `);
	t.is(JSON.stringify(sliceAnsi('\u001B[31m' + output, 0, 4)), JSON.stringify(`\u001B[31m${chalk.black.bgYellow(' RUN')}`));
});

// See https://github.com/chalk/slice-ansi/issues/26
test('does not lose fullwidth characters', t => {
	t.is(sliceAnsi('古古test', 0), '古古test');
});

test.failing('slice links', t => {
	const link = '\u001B]8;;https://google.com\u0007Google\u001B]8;;\u0007';
	t.is(sliceAnsi(link, 0, 6), link);
});
