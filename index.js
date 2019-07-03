'use strict';
const isFullwidthCodePoint = require('is-fullwidth-code-point');
const astralRegex = require('astral-regex');
const ansiStyles = require('ansi-styles');

const ESCAPES = [
	'\u001B',
	'\u009B'
];

const wrapAnsi = code => `${ESCAPES[0]}[${code}m`;

const checkAnsi = (ansiCodes, isEscapes) => {
	let output = '';
	ansiCodes = [...ansiCodes];

	for (let ansiCode of ansiCodes) {
		const ansiCodeOrigin = ansiCode;
		if (ansiCode.match(';')) {
			ansiCode = ansiCode.split(';')[0][0] + '0';
		}

		const item = ansiStyles.codes.get(parseInt(ansiCode, 10));
		if (item) {
			const indexEscape = ansiCodes.indexOf(item.toString());
			if (indexEscape >= 0) {
				ansiCodes.splice(indexEscape, 1);
			} else {
				output += wrapAnsi(isEscapes ? item : ansiCodeOrigin);
			}
		} else if (isEscapes) {
			output += wrapAnsi(0);
			break;
		}
	}

	return output;
};

module.exports = (string, begin, end) => {
	const characters = [...string.normalize()];
	const ansiCodes = [];

	end = typeof end === 'number' ? end : characters.length;

	let isInsideEscape = false;
	let ansiCode;
	let visible = 0;
	let output = '';

	for (const [index, character] of characters.entries()) {
		let leftEscape = false;

		if (ESCAPES.includes(character) && visible < end) {
			isInsideEscape = true;
			const code = /\d[^m]*/.exec(string.slice(index, index + 18));
			ansiCode = code && code.length > 0 ? code[0] : undefined;
			if (ansiCode) {
				ansiCodes.push(ansiCode);
			}
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
		} else if (visible === begin && !isInsideEscape && ansiCode !== undefined) {
			output = checkAnsi(ansiCodes);
		} else if (visible >= end) {
			output += checkAnsi(ansiCodes, true);
			break;
		}
	}

	return output;
};
