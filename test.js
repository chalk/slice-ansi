'use strict';

var test = require('ava');
var chalk = require('chalk');
var stripAnsi = require('strip-ansi');
var util = require('util');
var fn = require('./');

var fixture = chalk.red('the ') + chalk.green('quick ') + chalk.blue('brown ') + chalk.cyan('fox ') + chalk.yellow('jumped ');
var stripped = stripAnsi(fixture);

test(function (t) {
	// The slice should behave exactly
	// as a regular JS slice behaves.
	for (var i = 0; i < 20; ++i) {
		for (var j = 19; j > i; --j) {
			var nativeSlice = stripped.slice(i, j);
			var ansiSlice = fn(fixture, i, j);
			t.assert(nativeSlice === stripAnsi(ansiSlice));
		}
	}

	var a = util.inspect('\u001b[31m\u001b[31m\u001b[31m\u001b[31m\u001b[31mthe \u001b[39m\u001b[32mquick \u001b[39m\u001b[34m\u001b[39m');
	var b = util.inspect('\u001b[32m\u001b[39m\u001b[39m\u001b[39m\u001b[39m\u001b[39m\u001b[34m\u001b[34m\u001b[34m\u001b[34m\u001b[34mbrown \u001b[39m\u001b[36mfox \u001b[39m\u001b[33m\u001b[39m');
	var c = util.inspect('\u001b[31m \u001b[39m\u001b[32mquick \u001b[39m\u001b[34mbrown \u001b[39m\u001b[36mfox \u001b[39m\u001b[33m\u001b[39m');

	t.assert(util.inspect(fn(fixture, 0, 10)) === a);
	t.assert(util.inspect(fn(fixture, 10, 20)) === b);
	t.assert(util.inspect(fn(fixture, 3, 20)) === c);

	t.end();
});
