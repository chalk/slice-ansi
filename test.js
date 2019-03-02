import util from 'util';
import test from 'ava';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import randomItem from 'random-item';
import sliceAnsi from '.';

const fixture = chalk.red('the ') + chalk.green('quick ') + chalk.blue('brown ') + chalk.cyan('fox ') + chalk.yellow('jumped ');
const stripped = stripAnsi(fixture);

function gen(str) {
	const rand1 = randomItem(['rock', 'paper', 'scissors']);
	const rand2 = randomItem(['blue', 'green', 'yellow', 'red']);
	return `${str}:${chalk[rand2](rand1)} `;
}

test('main', t => {
	// The slice should behave exactly as a regular JS slice behaves
	for (let i = 0; i < 20; i++) {
		for (let j = 19; j > i; j--) {
			const nativeSlice = stripped.slice(i, j);
			const ansiSlice = sliceAnsi(fixture, i, j);
			t.is(nativeSlice, stripAnsi(ansiSlice));
		}
	}

	const a = util.inspect('\u001B[31mthe \u001B[39m\u001B[32mquick \u001B[39m\u001B[34m\u001B[39m');
	const b = util.inspect('\u001B[32m\u001B[39m\u001B[34mbrown \u001B[39m\u001B[36mfox \u001B[39m\u001B[33m\u001B[39m');
	const c = util.inspect('\u001B[31m \u001B[39m\u001B[32mquick \u001B[39m\u001B[34mbrown \u001B[39m\u001B[36mfox \u001B[39m\u001B[33m\u001B[39m');

	t.is(util.inspect(sliceAnsi(fixture, 0, 10)), a);
	t.is(util.inspect(sliceAnsi(fixture, 10, 20)), b);
	t.is(util.inspect(sliceAnsi(fixture, 3, 20)), c);

	const str = gen(1) + gen(2) + gen(3) + gen(4) + gen(5) + gen(6) + gen(7) + gen(8) + gen(9) + gen(10) + gen(11) + gen(12) + gen(13) + gen(14) + gen(15) + gen(1) + gen(2) + gen(3) + gen(4) + gen(5) + gen(6) + gen(7) + gen(8) + gen(9) + gen(10) + gen(11) + gen(12) + gen(13) + gen(14) + gen(15);
	const native = stripAnsi(str).slice(0, 55);
	const ansi = stripAnsi(sliceAnsi(str, 0, 55));
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

test.failing('can slice a normal character before a colored character', t => {
	t.is(sliceAnsi('a\u001B[31mb\u001B[39m', 0, 1), 'a');
});

test.failing('can slice a normal character after a colored character', t => {
	t.is(sliceAnsi('\u001B[31ma\u001B[39mb', 1, 2), 'b');
});

test('weird null issue', t => {
	const s = '\u001B[1mautotune.flipCoin("easy as") ? 🎂 : 🍰 \u001B[33m★\u001B[39m\u001B[22m';
	const result = sliceAnsi(s, 38);
	t.false(result.includes('null'));
});

test('support true color escape sequences', t => {
	t.is(sliceAnsi('\u001B[[1m\u001B[[48;2;255;255;255m\u001B[[38;2;255;0;0municorn\u001B[[39m\u001B[[49m\u001B[[22m', 0, 3), '\u001B[1m\u001B[48;2;255;255;25m\u001B[38;2;255;0;0muni\u001B[39m');
});

test.failing('doesn\'t add extra escapes', t => {
	const s = '\u001B[30m\u001B[43m RUNS \u001B[49m\u001B[39m  \u001B[32mtest\u001B[39m';
	t.is(sliceAnsi(s, 0, 7), '\u001B[30m\u001B[43m RUNS \u001B[49m\u001B[39m ');
	t.is(sliceAnsi(s, 0, 8), '\u001B[30m\u001B[43m RUNS \u001B[49m\u001B[39m  ');
});
