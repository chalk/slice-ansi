'use strict';
const isFullwidthCodePoint = require('is-fullwidth-code-point');
const astralRegex = require('astral-regex');
const ansiStyles = require('ansi-styles');

const escapes = [
	'\u001B',
	'\u009B'
];

const wrapAnsi = code => `${escapes[0]}[${code}m`;

module.exports = (str, begin, end) => {
	const arr = [...str.normalize()];
	const codes = [];

	end = typeof end === 'number' ? end : arr.length;

	let insideEscape = false;
	let ansiCode = null;
	let visible = 0;
	let output = '';

	for (const [i, x] of arr.entries()) {
		let leftEscape = false;

		if (escapes.includes(x) && visible < end) {
			insideEscape = true;
			const code = /\d[^m]*/.exec(str.slice(i, i + 18));
			ansiCode = code && code.length > 0 ? code[0] : null;
			if (ansiCode !== null) {
				codes.push(ansiCode);
			}
		} else if (insideEscape && x === 'm') {
			insideEscape = false;
			leftEscape = true;
		}

		if (!insideEscape && !leftEscape) {
			++visible;
		}

		if (!astralRegex({exact: true}).test(x) && isFullwidthCodePoint(x.codePointAt())) {
			++visible;
		}

		if (visible > begin && visible <= end) {
			output += x;
		} else if (visible === begin && !insideEscape && ansiCode !== null) {
			output += wrapAnsi(ansiCode);
		} else if (visible >= end) {
			for (let ansiColor of codes) {
				if (ansiColor.match(';')) {
					ansiColor = ansiColor.split(';')[0][0] + '0';
				}

				const item = ansiStyles.codes.get(parseInt(ansiColor, 10));

				if (item) {
					const index = codes.indexOf(item.toString());
					if (index >= 0) {
						codes.splice(index, 1);
					} else {
						output += wrapAnsi(item);
					}
				} else {
					output += wrapAnsi(0);
					break;
				}
			}

			break;
		}
	}

	return output;
};
