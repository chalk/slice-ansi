'use strict';
const isFullwidthCodePoint = require('is-fullwidth-code-point');
const astralRegex = require('astral-regex');
const ansiStyles = require('ansi-styles');

const ESCAPES = [
	'\u001B',
	'\u009B'
];

const wrapAnsi = code => `${ESCAPES[0]}[${code}m`;

const checkAnsi = (ansiCodes, isEscapes, endAnsiCode) => {
	let output = [];
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
				output.push(wrapAnsi(isEscapes ? item : ansiCodeOrigin));
			}
		} else if (isEscapes) {
			output.push(wrapAnsi(0));
			break;
		} else {
			output.push(wrapAnsi(ansiCodeOrigin));
		}
	}

	if (isEscapes) {
		output = output.filter((element, index) => output.indexOf(element) === index);
		if (endAnsiCode !== undefined) {
			const fistEscapeCode = wrapAnsi(ansiStyles.codes.get(parseInt(endAnsiCode, 10)));
			output = output.reduce((current, next) => next === fistEscapeCode ? [next, ...current] : [...current, next], []);
		}
	}

	return output.join('');
};

module.exports = (string, begin, end) => {
	const characters = [...string];
	const ansiCodes = [];

	if(typeof end !== 'number') {
		end = characters.length;
		for (const [index, character] of characters.entries()) {
			if(isFullwidthCodePoint(character.codePointAt())) ++end;
		}
	}

	let isInsideEscape = false;
	let ansiCode;
	let visible = 0;
	let output = '';
	let beginned = false;

	for (const [index, character] of characters.entries()) {
		let leftEscape = false;

		if (ESCAPES.includes(character)) {
			const code = /\d[^m]*/.exec(string.slice(index, index + 18));
			ansiCode = code && code.length > 0 ? code[0] : undefined;
			if (visible < end) {
				isInsideEscape = true;
				if (ansiCode !== undefined) {
					ansiCodes.push(ansiCode);
				}
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
			if(!beginned) {
				beginned = true;
				if(!isInsideEscape && ansiCode !== undefined)
					output = checkAnsi(ansiCodes);
      		}
			output += character; 
		} else if (visible >= end) {
			output += checkAnsi(ansiCodes, true, ansiCode);
			break;
		}
	}

	return output;
};
