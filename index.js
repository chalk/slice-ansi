'use strict';
const isFullwidthCodePoint = require('is-fullwidth-code-point');
const astralRegex = require('astral-regex');
const ansiStyles = require('ansi-styles');

const ESCAPES = [
	'\u001B',
	'\u009B'
];

const END_CODE = 39;

const wrapAnsi = code => `${ESCAPES[0]}[${code}m`;

module.exports = (string, begin, end) => {
	const characters = [...string.normalize()];

	end = typeof end === 'number' ? end : characters.length;

	let isInsideEscape = false;
	let escapeCode;
	let visible = 0;
	let output = '';

	for (const [index, character] of characters.entries()) {
		let leftEscape = false;

		if (ESCAPES.includes(character)) {
			isInsideEscape = true;
			const code = /\d[^m]*/.exec(string.slice(index, index + 18));
			escapeCode = code === END_CODE ? undefined : code;
		} else if (isInsideEscape && character === 'm') {
			isInsideEscape = false;
			leftEscape = true;
		}

		if (!isInsideEscape && !leftEscape) {
			++visible;
		}

		if (!astralRegex({exact: true}).test(character) && isFullwidthCodePoint(character.codePointAt())) {
			++visible;
		}

		if (visible > begin && visible <= end) {
			output += character;
		} else if (visible === begin && !isInsideEscape && escapeCode !== undefined && escapeCode !== END_CODE) {
			output += wrapAnsi(escapeCode);
		} else if (visible >= end) {
			if (escapeCode !== undefined) {
				output += wrapAnsi(ansiStyles.codes.get(parseInt(escapeCode, 10)) || END_CODE);
			}

			break;
		}
	}

	return output;
};
