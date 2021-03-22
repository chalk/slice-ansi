'use strict';
const isFullwidthCodePoint = require('is-fullwidth-code-point');
const astralRegex = require('astral-regex');
const ansiStyles = require('ansi-styles');

const ESCAPES = [
	'\u001B',
	'\u009B'
];

const ANSI_ESCAPE_BELL = '\u0007';
const ANSI_CSI = '[';
const ANSI_OSC = ']';
const ANSI_SGR_TERMINATOR = 'm';
const ANSI_SEP = ';';
const ANSI_ESCAPE_LINK = `${ANSI_OSC}8${ANSI_SEP}${ANSI_SEP}`;
const ANSI_LINK_TEXT_TERMINATOR = `${ESCAPES[0]}${ANSI_ESCAPE_LINK}${ANSI_ESCAPE_BELL}`;

const wrapAnsi = code => `${ESCAPES[0]}${ANSI_CSI}${code}${ANSI_SGR_TERMINATOR}`;
const wrapAnsiHyperlinkUri = uri => `${ESCAPES[0]}${ANSI_ESCAPE_LINK}${uri}${ANSI_ESCAPE_BELL}`;

const checkAnsi = (ansiCodes, isEscapes, endAnsiCode) => {
	let output = [];
	ansiCodes = [...ansiCodes];

	for (let ansiCode of ansiCodes) {
		const ansiCodeOriginal = ansiCode;

		if (ansiCode && ansiCode.includes(';')) {
			ansiCode = ansiCode.split(';')[0][0] + '0';
		}

		const item = ansiStyles.codes.get(Number.parseInt(ansiCode, 10));
		if (item) {
			const indexEscape = ansiCodes.indexOf(item.toString());
			if (indexEscape === -1) {
				output.push(wrapAnsi(isEscapes ? item : ansiCodeOriginal));
			} else {
				ansiCodes.splice(indexEscape, 1);
			}
		} else if (isEscapes) {
			output.push(wrapAnsi(0));
			break;
		} else {
			output.push(wrapAnsi(ansiCodeOriginal));
		}
	}

	if (isEscapes) {
		output = output.filter((element, index) => output.indexOf(element) === index);

		if (endAnsiCode !== undefined) {
			const fistEscapeCode = wrapAnsi(ansiStyles.codes.get(Number.parseInt(endAnsiCode, 10)));
			output = output.reduce((current, next) => next === fistEscapeCode ? [next, ...current] : [...current, next], []);
		}
	}

	return output.join('');
};

module.exports = (string, begin, end) => {
	const characters = [...string];
	const ansiCodes = [];

	let stringEnd = typeof end === 'number' ? end : characters.length;

	// Track the state of the three types of escape code (regular, link uri, link text)
	let isInsideEscape = false;
	let isInsideLinkUriEscape = false;
	let isInsideLinkTextEscape = false;

	let ansiCode;

	// How many visible characters have been added to the output. Characters added while isInsideEscape is true
	// do not count towards this total.
	let visible = 0;
	let output = '';
	let escapeUri;

	// Has the URI been added, so we need to terminate the link if we get to the end without terminating somehow.
	let needToTerminateLink = false;

	// Whether we are processing the link text.
	let processingLinkText = false;

	for (const [index, character] of characters.entries()) {
		let leftEscape = false;

		if (ESCAPES.includes(character)) {
			const remainingString = string.slice(index);
			const {groups} = new RegExp(`(?:\\${ANSI_CSI}(?<code>\\d[^m]*)|\\${ANSI_ESCAPE_LINK}(?<uri>[^${ANSI_ESCAPE_BELL}]*)${ANSI_ESCAPE_BELL})`).exec(remainingString) || {groups: {}};
			if (groups.code !== undefined) {
				ansiCode = groups.code;
			} else if (groups.uri !== undefined && !processingLinkText) {
				escapeUri = groups.uri.length === 0 ? null : groups.uri;
				isInsideLinkUriEscape = true;
			} else if (remainingString.startsWith(ANSI_LINK_TEXT_TERMINATOR)) {
				isInsideLinkTextEscape = true;
				processingLinkText = false;
			}

			if (visible < stringEnd) {
				isInsideEscape = true;

				if (ansiCode !== undefined) {
					ansiCodes.push(ansiCode);
				}
			}
		}

		if (isInsideEscape) {
			if (isInsideLinkUriEscape) {
				if (character === ANSI_ESCAPE_BELL) {
					isInsideEscape = false;
					isInsideLinkUriEscape = false;
					leftEscape = true;
					processingLinkText = true;
				}
			} else if (isInsideLinkTextEscape) {
				if (character === ANSI_ESCAPE_BELL) {
					isInsideEscape = false;
					isInsideLinkTextEscape = false;
					leftEscape = true;
					needToTerminateLink = false;
				}
			} else if (character === ANSI_SGR_TERMINATOR) {
				isInsideEscape = false;
				leftEscape = true;
			}
		}

		if (!isInsideEscape && !leftEscape) {
			visible++;
		}

		if (!astralRegex({exact: true}).test(character) && isFullwidthCodePoint(character.codePointAt())) {
			visible++;

			if (typeof end !== 'number') {
				stringEnd++;
			}
		}

		if (visible > begin && visible <= stringEnd) {
			output += character;
		} else if (visible === begin && !isInsideEscape) {
			output = '';
			if (ansiCode !== undefined) {
				output += checkAnsi(ansiCodes);
			}

			if (escapeUri !== undefined) {
				output += wrapAnsiHyperlinkUri(escapeUri);
				escapeUri = undefined;
				needToTerminateLink = true;
			}
		} else if (visible >= stringEnd) {
			output += checkAnsi(ansiCodes, true, ansiCode);

			if (needToTerminateLink) {
				output += ANSI_LINK_TEXT_TERMINATOR;
			}

			break;
		}
	}

	return output;
};
