'use strict';
const isFullwidthCodePoint = require('is-fullwidth-code-point');
const astralRegex = require('astral-regex');

const escapes = [
	'\u001B',
	'\u009B'
];

const endCodes = [39, 49];

const wrapAnsi = code => `${escapes[0]}[${code}m`;

module.exports = (str, begin, end) => {
	const arr = [...str.normalize()];

	end = typeof end === 'number' ? end : arr.length;

	let insideEscape = false;
	let escapeCode = null;
	let visible = 0;
	let output = '';

	for (const [i, x] of arr.entries()) {
		let leftEscape = false;

		if (escapes.includes(x)) {
			insideEscape = true;
			const code = /\d[^m]*/.exec(str.slice(i, i + 18));
			escapeCode = endCodes.includes(code) ? null : code;
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
			escapeCode = null;
			output += x;
		} else if (visible === begin && !insideEscape && escapeCode !== null && !endCodes.includes(escapeCode)) {
			output += wrapAnsi(escapeCode);
		} else if (visible >= end && escapeCode !== null) {
			output += wrapAnsi(parseInt(escapeCode, 10));
			escapeCode = null;
		}
	}

	return output;
};
