import util from 'util';
import test from 'ava';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import randomItem from 'random-item';
import fn from './';

const fixture = chalk.red('the ') + chalk.green('quick ') + chalk.blue('brown ') + chalk.cyan('fox ') + chalk.yellow('jumped ');
const stripped = stripAnsi(fixture);

function gen(str) {
	const rand1 = randomItem(['rock', 'paper', 'scissors']);
	const rand2 = randomItem(['blue', 'green', 'yellow', 'red']);
	return `${str}:${chalk[rand2](rand1)} `;
}

test(t => {
	// The slice should behave exactly
	// as a regular JS slice behaves.
	for (let i = 0; i < 20; ++i) {
		for (let j = 19; j > i; --j) {
			const nativeSlice = stripped.slice(i, j);
			const ansiSlice = fn(fixture, i, j);
			t.is(nativeSlice, stripAnsi(ansiSlice));
		}
	}

	const a = util.inspect('\u001b[31m\u001b[31m\u001b[31m\u001b[31m\u001b[31mthe \u001b[39m\u001b[32mquick \u001b[39m\u001b[34m\u001b[39m');
	const b = util.inspect('\u001b[32m\u001b[39m\u001b[39m\u001b[39m\u001b[39m\u001b[39m\u001b[34m\u001b[34m\u001b[34m\u001b[34m\u001b[34mbrown \u001b[39m\u001b[36mfox \u001b[39m\u001b[33m\u001b[39m');
	const c = util.inspect('\u001b[31m \u001b[39m\u001b[32mquick \u001b[39m\u001b[34mbrown \u001b[39m\u001b[36mfox \u001b[39m\u001b[33m\u001b[39m');

	t.is(util.inspect(fn(fixture, 0, 10)), a);
	t.is(util.inspect(fn(fixture, 10, 20)), b);
	t.is(util.inspect(fn(fixture, 3, 20)), c);

	const str = gen(1) + gen(2) + gen(3) + gen(4) + gen(5) + gen(6) + gen(7) + gen(8) + gen(9) + gen(10) + gen(11) + gen(12) + gen(13) + gen(14) + gen(15) + gen(1) + gen(2) + gen(3) + gen(4) + gen(5) + gen(6) + gen(7) + gen(8) + gen(9) + gen(10) + gen(11) + gen(12) + gen(13) + gen(14) + gen(15);
	const native = stripAnsi(str).slice(0, 55);
	const ansi = stripAnsi(fn(str, 0, 55));
	t.is(native, ansi);
});

test.skip('supports fullwidth characters', t => {
	t.is(fn('안녕하세', 0, 4), '안녕');
});

test.skip('supports unicode surrogate pairs', t => {
	t.is(fn('a\ud83c\ude00bc', 0, 2), 'a\ud83c\ude00');
});
