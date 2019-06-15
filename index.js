'use strict';
const isFullwidthCodePoint = require('is-fullwidth-code-point');
const astralRegex = require('astral-regex');
const ansiStyles = require('ansi-styles');

const ESCAPES = [
	'\u001B',
	'\u009B'
];

const wrapAnsi = code => `${ESCAPES[0]}[${code}m`;

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
			if (ansiCode !== null) {
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
			output += wrapAnsi(ansiCode);
		} else if (visible >= end) {
			for (let aansiCode of ansiCodes) {
				if (aansiCode.match(';')) {
					aansiCode = aansiCode.split(';')[0][0] + '0';
				}

				const item = ansiStyles.codes.get(parseInt(aansiCode, 10));
				if (item) {
					const indexColor = ansiCodes.indexOf(item.toString());
					if (indexColor >= 0) {
						ansiCodes.splice(indexColor, 1);
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
