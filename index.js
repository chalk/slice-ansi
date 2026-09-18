import tokenizeAnsi from './tokenize-ansi.js';

function applySgrFragments(activeStyles, fragments) {
	for (const fragment of fragments) {
		switch (fragment.type) {
			case 'reset': {
				activeStyles.clear();
				break;
			}

			case 'end': {
				activeStyles.delete(fragment.endCode);
				break;
			}

			case 'start': {
				activeStyles.delete(fragment.endCode);
				activeStyles.set(fragment.endCode, fragment.code);
				break;
			}

			default: {
				break;
			}
		}
	}

	return activeStyles;
}

function undoAnsiCodes(activeStyles) {
	return [...activeStyles.keys()].toReversed().join('');
}

function closeHyperlink(hyperlinkToken) {
	return `${hyperlinkToken.closePrefix}${hyperlinkToken.terminator}`;
}

function shouldIncludeSgrAfterEnd(token, activeStyles) {
	let hasStartFragment = false;
	let hasClosingEffect = false;

	for (const fragment of token.fragments) {
		if (fragment.type === 'start') {
			hasStartFragment = true;
			continue;
		}

		if (fragment.type === 'reset' && activeStyles.size > 0) {
			hasClosingEffect = true;
			continue;
		}

		if (fragment.type === 'end' && activeStyles.has(fragment.endCode)) {
			hasClosingEffect = true;
		}
	}

	return hasClosingEffect && !hasStartFragment;
}

function hasSgrStartFragment(token) {
	return token.fragments.some(fragment => fragment.type === 'start');
}

function discardPendingHyperlink(state) {
	if (
		state.activeHyperlink
		&& !state.activeHyperlinkHasVisibleText
		&& state.activeHyperlinkOutputIndex !== undefined
	) {
		const openCodeLength = state.activeHyperlink.code.length;
		state.returnValue = state.returnValue.slice(0, state.activeHyperlinkOutputIndex) + state.returnValue.slice(state.activeHyperlinkOutputIndex + openCodeLength);

		if (
			state.pendingSgrOutputIndex !== undefined
			&& state.pendingSgrOutputIndex > state.activeHyperlinkOutputIndex
		) {
			state.pendingSgrOutputIndex -= openCodeLength;
		}
	}

	state.activeHyperlink = undefined;
	state.activeHyperlinkHasVisibleText = false;
	state.activeHyperlinkOutputIndex = undefined;
}

function settleActiveHyperlink(state) {
	if (state.activeHyperlinkHasVisibleText) {
		state.returnValue += closeHyperlink(state.activeHyperlink);
	} else {
		discardPendingHyperlink(state);
	}
}

function applySgrToken(state) {
	if (
		state.isPastEnd
		&& !shouldIncludeSgrAfterEnd(state.token, state.activeStyles)
	) {
		return;
	}

	if (
		state.include
		&& hasSgrStartFragment(state.token)
		&& state.pendingSgrOutputIndex === undefined
	) {
		state.pendingSgrOutputIndex = state.returnValue.length;
		state.pendingSgrActiveStyles = new Map(state.activeStyles);
	}

	state.activeStyles = applySgrFragments(state.activeStyles, state.token.fragments);
	if (state.include) {
		state.returnValue += state.token.code;
	}
}

function applyHyperlinkToken(state) {
	if (
		state.isPastEnd
		&& (
			state.token.action !== 'close'
			|| !state.activeHyperlink
		)
	) {
		return;
	}

	if (state.token.action === 'open') {
		// OSC 8 has no nesting: a new open replaces the active link, so settle the previous one first.
		if (state.activeHyperlink) {
			settleActiveHyperlink(state);
		}

		state.activeHyperlink = state.token;
		state.activeHyperlinkHasVisibleText = false;
		state.activeHyperlinkOutputIndex = undefined;
		if (state.include) {
			state.activeHyperlinkOutputIndex = state.returnValue.length;
		}
	} else if (state.token.action === 'close') {
		if (
			state.include
			&& state.activeHyperlink
			&& !state.activeHyperlinkHasVisibleText
		) {
			discardPendingHyperlink(state);
			return;
		}

		state.activeHyperlink = undefined;
		state.activeHyperlinkHasVisibleText = false;
		state.activeHyperlinkOutputIndex = undefined;
	}

	if (state.include) {
		state.returnValue += state.token.code;
	}
}

function applyControlToken(state) {
	if (!state.isPastEnd && state.include) {
		state.returnValue += state.token.code;
	}
}

function applyCharacterToken(state) {
	if (
		!state.include
		&& state.position >= state.start
		&& !state.token.isGraphemeContinuation
	) {
		state.include = true;
		state.returnValue = [...state.activeStyles.values()].join('');
		if (state.activeHyperlink) {
			state.activeHyperlinkOutputIndex = state.returnValue.length;
			state.returnValue += state.activeHyperlink.code;
		}
	}

	if (state.include) {
		state.returnValue += state.token.value;
		state.pendingSgrOutputIndex = undefined;
		state.pendingSgrActiveStyles = undefined;
		if (state.activeHyperlink) {
			state.activeHyperlinkHasVisibleText = true;
		}
	}

	state.position += state.token.visibleWidth;
}

const tokenHandlers = {
	sgr: applySgrToken,
	hyperlink: applyHyperlinkToken,
	control: applyControlToken,
	character: applyCharacterToken,
};

function applyToken(state) {
	tokenHandlers[state.token.type]?.(state);
}

function createHasContinuationAheadMap(tokens) {
	const hasContinuationAhead = Array.from({length: tokens.length}, () => false);
	let nextCharacterIsContinuation = false;

	for (let tokenIndex = tokens.length - 1; tokenIndex >= 0; tokenIndex--) {
		const token = tokens[tokenIndex];
		hasContinuationAhead[tokenIndex] = nextCharacterIsContinuation;
		if (token.type === 'character') {
			nextCharacterIsContinuation = Boolean(token.isGraphemeContinuation);
		}
	}

	return hasContinuationAhead;
}

function isPastEndBoundary(token, position, end) {
	if (end === undefined) {
		return false;
	}

	if (position >= end) {
		return true;
	}

	return token.type === 'character'
		&& !token.isGraphemeContinuation
		&& position + token.visibleWidth > end;
}

export default function sliceAnsi(string, start, end) {
	const tokens = tokenizeAnsi(string, {endCharacter: end});
	const hasContinuationAhead = createHasContinuationAheadMap(tokens);
	const state = {
		start,
		token: undefined,
		isPastEnd: false,
		activeStyles: new Map(),
		activeHyperlink: undefined,
		activeHyperlinkHasVisibleText: false,
		activeHyperlinkOutputIndex: undefined,
		pendingSgrOutputIndex: undefined,
		pendingSgrActiveStyles: undefined,
		position: 0,
		returnValue: '',
		include: false,
	};

	for (const [tokenIndex, token] of tokens.entries()) {
		let isPastEnd = isPastEndBoundary(token, state.position, end);
		if (
			isPastEnd
			&& token.type !== 'character'
			&& hasContinuationAhead[tokenIndex]
		) {
			isPastEnd = false;
		}

		if (
			isPastEnd
			&& token.type === 'character'
			&& !token.isGraphemeContinuation
		) {
			if (state.activeHyperlink && !state.activeHyperlinkHasVisibleText) {
				discardPendingHyperlink(state);
			}

			if (state.pendingSgrOutputIndex !== undefined) {
				state.returnValue = state.returnValue.slice(0, state.pendingSgrOutputIndex);
				state.activeStyles = state.pendingSgrActiveStyles;
				state.pendingSgrOutputIndex = undefined;
				state.pendingSgrActiveStyles = undefined;
			}

			break;
		}

		state.token = token;
		state.isPastEnd = isPastEnd;
		applyToken(state);
	}

	if (!state.include) {
		return '';
	}

	if (state.activeHyperlink) {
		settleActiveHyperlink(state);
	}

	// Disable active codes at the end
	state.returnValue += undoAnsiCodes(state.activeStyles);

	return state.returnValue;
}
