import ansiStyles from 'ansi-styles';
import stringWidth from 'string-width';

const ESCAPE_CODE_POINT = 27;
const C1_DCS_CODE_POINT = 144;
const C1_SOS_CODE_POINT = 152;
const C1_CSI_CODE_POINT = 155;
const C1_ST_CODE_POINT = 156;
const C1_OSC_CODE_POINT = 157;
const C1_PM_CODE_POINT = 158;
const C1_APC_CODE_POINT = 159;
const CONTROL_STRING_STARTS = new Set([
	C1_DCS_CODE_POINT,
	C1_SOS_CODE_POINT,
	C1_OSC_CODE_POINT,
	C1_PM_CODE_POINT,
	C1_APC_CODE_POINT,
]);
const ESCAPES = new Set([
	ESCAPE_CODE_POINT,
	C1_CSI_CODE_POINT,
	C1_ST_CODE_POINT,
	...CONTROL_STRING_STARTS,
]);

const ESCAPE = '\u{1B}';
const ANSI_BELL = '\u{7}';
const ANSI_CSI = '[';
const ANSI_OSC = ']';
const ANSI_SGR_TERMINATOR = 'm';
const ANSI_OSC_TERMINATOR = '\\';
const ANSI_STRING_TERMINATOR = `${ESCAPE}${ANSI_OSC_TERMINATOR}`;
const C1_OSC = '\u{9D}';
const C1_STRING_TERMINATOR = '\u{9C}';
const ANSI_HYPERLINK_ESC_PREFIX = `${ESCAPE}${ANSI_OSC}8;`;
const ANSI_HYPERLINK_C1_PREFIX = `${C1_OSC}8;`;

// ECMA-48 CSI format: parameter bytes 0x30-0x3F, intermediates 0x20-0x2F, final 0x40-0x7E.
const CODE_POINT_CSI_PARAMETER_START = '0'.codePointAt(0);
const CODE_POINT_CSI_PARAMETER_END = '?'.codePointAt(0);
const CODE_POINT_CSI_INTERMEDIATE_START = ' '.codePointAt(0);
const CODE_POINT_CSI_INTERMEDIATE_END = '/'.codePointAt(0);
const CODE_POINT_CSI_FINAL_START = '@'.codePointAt(0);
const CODE_POINT_CSI_FINAL_END = '~'.codePointAt(0);
const SGR_RESET_CODE = 0;
const SGR_EXTENDED_COLOR_END_CODES = new Map([
	[38, 39],
	[48, 49],
	[58, 59],
]);
const SGR_COLOR_LENGTHS = new Map([
	[5, 3],
	[2, 5],
]);
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, {granularity: 'grapheme'});

const endCodeNumbers = new Set();
for (const [, end] of ansiStyles.codes) {
	endCodeNumbers.add(end);
}

function isCsiParameterCharacter(codePoint) {
	return codePoint >= CODE_POINT_CSI_PARAMETER_START && codePoint <= CODE_POINT_CSI_PARAMETER_END;
}

function isCsiIntermediateCharacter(codePoint) {
	return codePoint >= CODE_POINT_CSI_INTERMEDIATE_START && codePoint <= CODE_POINT_CSI_INTERMEDIATE_END;
}

function isCsiFinalCharacter(codePoint) {
	return codePoint >= CODE_POINT_CSI_FINAL_START && codePoint <= CODE_POINT_CSI_FINAL_END;
}

function createControlParseResult(code, endIndex) {
	return {
		token: {
			type: 'control',
			code,
		},
		endIndex,
	};
}

function getSgrPrefix(code) {
	return code.startsWith('\u{9B}') ? '\u{9B}' : `${ESCAPE}${ANSI_CSI}`;
}

function createSgrCode(prefix, values) {
	return `${prefix}${values.join(';')}${ANSI_SGR_TERMINATOR}`;
}

function getSgrFragments(code) {
	const fragments = [];
	const sgrPrefix = getSgrPrefix(code);
	const rawCodes = code.slice(sgrPrefix.length, -1).split(';');
	let index = 0;
	while (index < rawCodes.length) {
		// Read the leading numeric parameter while preserving colon-delimited subparameters in the emitted code.
		// eslint-disable-next-line unicorn/prefer-number-coercion
		const codeNumber = Number.parseInt(rawCodes[index] || '0', 10);
		if (Number.isNaN(codeNumber)) {
			index++;
			continue;
		}

		if (codeNumber === SGR_RESET_CODE) {
			fragments.push({type: 'reset'});
			index++;
			continue;
		}

		if (endCodeNumbers.has(codeNumber)) {
			fragments.push({
				type: 'end',
				endCode: ansiStyles.color.ansi(codeNumber),
			});
			index++;
			continue;
		}

		const extendedColorEndCode = SGR_EXTENDED_COLOR_END_CODES.get(codeNumber);
		let fragmentLength = 1;
		if (extendedColorEndCode !== undefined && !rawCodes[index].includes(':')) {
			// A colon-delimited color is already complete; only semicolon-delimited colors consume subsequent parameters.
			// eslint-disable-next-line unicorn/prefer-number-coercion -- Same reason as above.
			const colorType = Number.parseInt(rawCodes[index + 1], 10);
			const colorLength = SGR_COLOR_LENGTHS.get(colorType);
			if (colorLength !== undefined && index + colorLength <= rawCodes.length) {
				fragmentLength = colorLength;
			}
		}

		const endCode = extendedColorEndCode ?? ansiStyles.codes.get(codeNumber);
		fragments.push({
			type: 'start',
			code: createSgrCode(sgrPrefix, rawCodes.slice(index, index + fragmentLength)),
			endCode: endCode === undefined ? ansiStyles.reset.open : ansiStyles.color.ansi(endCode),
		});
		index += fragmentLength;
	}

	if (fragments.length === 0) {
		fragments.push({type: 'reset'});
	}

	return fragments;
}

function parseCsiCode(string, index) {
	const escapeCodePoint = string.codePointAt(index);
	let sequenceStartIndex;

	if (escapeCodePoint === ESCAPE_CODE_POINT) {
		if (string[index + 1] !== ANSI_CSI) {
			return;
		}

		sequenceStartIndex = index + 2;
	} else if (escapeCodePoint === C1_CSI_CODE_POINT) {
		sequenceStartIndex = index + 1;
	} else {
		return;
	}

	for (let sequenceIndex = sequenceStartIndex; sequenceIndex < string.length; sequenceIndex++) {
		const codePoint = string.codePointAt(sequenceIndex);

		if (isCsiFinalCharacter(codePoint)) {
			const code = string.slice(index, sequenceIndex + 1);
			if (string[sequenceIndex] !== ANSI_SGR_TERMINATOR || !/^[\d:;]*$/v.test(string.slice(sequenceStartIndex, sequenceIndex))) {
				return createControlParseResult(code, sequenceIndex + 1);
			}

			return {
				token: {
					type: 'sgr',
					code,
					fragments: getSgrFragments(code),
				},
				endIndex: sequenceIndex + 1,
			};
		}

		if (isCsiParameterCharacter(codePoint) || isCsiIntermediateCharacter(codePoint)) {
			continue;
		}

		const endIndex = sequenceIndex;
		return createControlParseResult(string.slice(index, endIndex), endIndex);
	}

	return createControlParseResult(string.slice(index), string.length);
}

function createControlStringParseResult(string, index, endIndex, terminator) {
	const code = string.slice(index, endIndex);
	const hyperlinkPrefix = code.startsWith(ANSI_HYPERLINK_ESC_PREFIX) ? ANSI_HYPERLINK_ESC_PREFIX : ANSI_HYPERLINK_C1_PREFIX;
	if (!code.startsWith(hyperlinkPrefix)) {
		return createControlParseResult(code, endIndex);
	}

	const uriStart = code.indexOf(';', hyperlinkPrefix.length);
	const contentEnd = code.length - terminator.length;

	if (uriStart === -1 || uriStart >= contentEnd) {
		return createControlParseResult(code, endIndex);
	}

	return {
		token: {
			type: 'hyperlink',
			code,
			action: uriStart + 1 === contentEnd ? 'close' : 'open',
			closePrefix: `${hyperlinkPrefix};`,
			terminator,
		},
		endIndex,
	};
}

function parseControlStringCode(string, index) {
	const codePoint = string.codePointAt(index);
	// ESC followed by a byte from 0x40 to 0x5F is the 7-bit representation of the corresponding C1 control.
	const command = codePoint === ESCAPE_CODE_POINT ? string.codePointAt(index + 1) + 0x40 : codePoint;
	const sequenceStartIndex = index + (codePoint === ESCAPE_CODE_POINT ? 2 : 1);

	if (command === C1_ST_CODE_POINT) {
		return createControlParseResult(string.slice(index, sequenceStartIndex), sequenceStartIndex);
	}

	if (!CONTROL_STRING_STARTS.has(command)) {
		return;
	}

	for (let sequenceIndex = sequenceStartIndex; sequenceIndex < string.length; sequenceIndex++) {
		// OSC accepts ST (ECMA-48) and BEL (xterm compatibility extension).
		if (command === C1_OSC_CODE_POINT && string[sequenceIndex] === ANSI_BELL) {
			return createControlStringParseResult(string, index, sequenceIndex + 1, ANSI_BELL);
		}

		if (
			string[sequenceIndex] === ESCAPE
			&& string[sequenceIndex + 1] === ANSI_OSC_TERMINATOR
		) {
			return createControlStringParseResult(string, index, sequenceIndex + 2, ANSI_STRING_TERMINATOR);
		}

		if (string[sequenceIndex] === C1_STRING_TERMINATOR) {
			return createControlStringParseResult(string, index, sequenceIndex + 1, C1_STRING_TERMINATOR);
		}
	}

	return createControlParseResult(string.slice(index), string.length);
}

function parseAnsiCode(string, index) {
	return parseControlStringCode(string, index) || parseCsiCode(string, index);
}

function appendAnsiTokens(string, index, tokens) {
	while (index < string.length) {
		const nextCodePoint = string.codePointAt(index);
		if (!ESCAPES.has(nextCodePoint)) {
			break;
		}

		const escapeCode = parseAnsiCode(string, index);
		if (!escapeCode) {
			break;
		}

		tokens.push(escapeCode.token);
		index = escapeCode.endIndex;
	}

	return index;
}

// Columns come from `string-width`, so a slice is never wider than what `string-width` measures for it.
function parseCharacterTokenWithRawSegmentation(index, graphemeSegments) {
	const segment = graphemeSegments.containing(index);
	if (!segment || segment.index !== index) {
		return;
	}

	return {
		token: {
			type: 'character',
			// Intentionally preserve UAX29 behavior (GB3): CRLF is one grapheme cluster.
			value: segment.segment,
			visibleWidth: stringWidth(segment.segment),
		},
		endIndex: index + segment.segment.length,
	};
}

// Each grapheme owns its text and internal ANSI tokens, so it can be included or excluded as a whole without tracking scalar continuations.
// Slow path for when ANSI codes sit inside a grapheme, for example between a letter and its combining mark. It segments the text with the ANSI codes removed, and then groups the original tokens by grapheme.
function tokenizeAnsiWithVisibleSegmentation(string, {endCharacter = Infinity} = {}) {
	const tokens = [];
	let visibleString = '';
	let index = 0;

	while (index < string.length) {
		const codePoint = string.codePointAt(index);
		if (ESCAPES.has(codePoint)) {
			const code = parseAnsiCode(string, index);
			if (code) {
				tokens.push(code.token);
				index = code.endIndex;
				continue;
			}
		}

		const value = String.fromCodePoint(codePoint);
		// Reuse the original tokens for segmentation and output so ANSI codes are parsed only once.
		visibleString += value;
		tokens.push({type: 'text', value, visibleEnd: visibleString.length});
		index += value.length;
	}

	const graphemes = [];
	let tokenIndex = 0;
	let visibleCount = 0;

	for (const {segment, index: segmentIndex} of GRAPHEME_SEGMENTER.segment(visibleString)) {
		while (tokens[tokenIndex].type !== 'text') {
			graphemes.push(tokens[tokenIndex]);
			tokenIndex++;
		}

		if (segmentIndex > 0 && visibleCount >= endCharacter) {
			return graphemes;
		}

		const startIndex = tokenIndex;
		const visibleEnd = segmentIndex + segment.length;
		do {
			tokenIndex++;
		} while (tokens[tokenIndex - 1].visibleEnd !== visibleEnd);

		const visibleWidth = stringWidth(segment);
		graphemes.push({
			type: 'character',
			value: segment,
			visibleWidth,
			parts: tokens.slice(startIndex, tokenIndex),
		});
		visibleCount += visibleWidth;
	}

	while (tokenIndex < tokens.length) {
		graphemes.push(tokens[tokenIndex]);
		tokenIndex++;
	}

	return graphemes;
}

function areValuesInSameGrapheme(leftValue, rightValue) {
	const segment = GRAPHEME_SEGMENTER.segment(leftValue + rightValue).containing(leftValue.length);
	return segment.index < leftValue.length;
}

// Fast path that tokenizes one grapheme at a time. It falls back to `tokenizeAnsiWithVisibleSegmentation` when an ANSI code splits a grapheme.
export default function tokenizeAnsi(string, {endCharacter = Infinity} = {}) {
	const tokens = [];
	const graphemeSegments = GRAPHEME_SEGMENTER.segment(string);

	let index = 0;
	let visibleCount = 0;
	let previousCharacter;
	while (index < string.length) {
		index = appendAnsiTokens(string, index, tokens);
		if (index === string.length) {
			break;
		}

		const characterToken = parseCharacterTokenWithRawSegmentation(index, graphemeSegments);
		if (!characterToken || (previousCharacter
			&& index > previousCharacter.endIndex
			&& areValuesInSameGrapheme(previousCharacter.token.value, characterToken.token.value))) {
			return tokenizeAnsiWithVisibleSegmentation(string, {endCharacter});
		}

		if (previousCharacter && visibleCount >= endCharacter) {
			break;
		}

		tokens.push(characterToken.token);
		index = characterToken.endIndex;
		visibleCount += characterToken.token.visibleWidth;
		previousCharacter = characterToken;
	}

	return tokens;
}
