import isFullwidthCodePoint from 'is-fullwidth-code-point';
import ansiStyles from 'ansi-styles';

const ESCAPES = [
	'\u001B',
	'\u009B'
];

const escapeCodes = new Map();
for (const [start, end] of ansiStyles.codes) {
	escapeCodes.set(start.toString(), end.toString());
}

const wrapAnsi = code => `${ESCAPES[0]}[${code}m`;

const checkAnsi = (ansiCodes, isEscapes, endAnsiCode) => {
	let output = [];
	ansiCodes = [...ansiCodes];

	for (let ansiCode of ansiCodes) {
		const ansiCodeOrigin = ansiCode;
		if (ansiCode.includes(';')) {
			ansiCode = ansiCode.split(';')[0][0] + '0';
		}

		const item = escapeCodes.get(ansiCode);
		if (item) {
			const indexEscape = ansiCodes.indexOf(item);
			if (indexEscape === -1) {
				output.push(wrapAnsi(isEscapes ? item : ansiCodeOrigin));
			} else {
				ansiCodes.splice(indexEscape, 1);
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
			const fistEscapeCode = wrapAnsi(escapeCodes.get(endAnsiCode));
			// TODO: Remove the use of `.reduce` here.
			// eslint-disable-next-line unicorn/no-array-reduce
			output = output.reduce((current, next) => next === fistEscapeCode ? [next, ...current] : [...current, next], []);
		}
	}

	return output.join('');
};

function findNumberIndex(string) {
	for (let index = 0; index < string.length; index++) {
		const charCode = string.charCodeAt(index);
		if (charCode >= 48 && charCode <= 57) {
			return index;
		}
	}

	return -1;
}

function parseAnsiCode(string, offset) {
	string = string.slice(offset, offset + 18);
	const startIndex = findNumberIndex(string);
	if (startIndex !== -1) {
		let endIndex = string.indexOf('m', startIndex);
		if (endIndex === -1) {
			endIndex = string.length;
		}

		return string.slice(startIndex, endIndex);
	}
}

export default function sliceAnsi(string, begin, end) {
	const ansiCodes = [];

	let stringEnd = typeof end === 'number' ? end : string.length;
	let isInsideEscape = false;
	let ansiCode;
	let visible = 0;
	let output = '';

	let index = 0;
	while (index < string.length) {
		const codePoint = string.codePointAt(index);
		const character = String.fromCodePoint(codePoint);

		let leftEscape = false;

		if (character.length === 1) {
			if (ESCAPES.includes(character)) {
				ansiCode = parseAnsiCode(string, index);

				if (visible < stringEnd) {
					isInsideEscape = true;

					if (ansiCode !== undefined) {
						ansiCodes.push(ansiCode);
					}
				}
			} else if (isInsideEscape && character === 'm') {
				isInsideEscape = false;
				leftEscape = true;
			}
		}

		if (!isInsideEscape && !leftEscape) {
			visible++;
		}

		if (character.length === 1 && isFullwidthCodePoint(character.codePointAt())) {
			visible++;

			if (typeof end !== 'number') {
				stringEnd++;
			}
		}

		if (visible > begin && visible <= stringEnd) {
			output += character;
		} else if (visible === begin && !isInsideEscape && ansiCode !== undefined) {
			output = checkAnsi(ansiCodes);
		} else if (visible >= stringEnd) {
			output += checkAnsi(ansiCodes, true, ansiCode);
			break;
		}

		index += character.length;
	}

	return output;
}
