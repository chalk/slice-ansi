import tokenizeAnsi from './tokenize-ansi.js';

class SliceOutput {
	#phase = 'before';
	#styles = new Map();
	#hyperlink;
	#checkpoint;
	#output = [];

	#writeText(value) {
		if (this.#phase === 'before') {
			return;
		}

		this.#output.push(value);
		this.#checkpoint = undefined;
		if (this.#hyperlink?.phase === 'pending') {
			this.#hyperlink = {phase: 'visible', token: this.#hyperlink.token};
		}
	}

	#writeSgr(token, isPastEnd) {
		const hasStart = token.fragments.some(fragment => fragment.type === 'start');
		if (isPastEnd) {
			const hasClosingEffect = token.fragments.some(({type, endCode}) => (type === 'reset' && this.#styles.size > 0) || (type === 'end' && this.#styles.has(endCode)));
			if (hasStart || !hasClosingEffect) {
				return;
			}
		}

		if (hasStart && !this.#checkpoint && this.#phase === 'emitting') {
			this.#checkpoint = {outputLength: this.#output.length, styles: new Map(this.#styles), hyperlink: this.#hyperlink};
		}

		this.#applySgrFragments(token.fragments);
		if (this.#phase === 'emitting') {
			this.#output.push(token.code);
		}
	}

	#applySgrFragments(fragments) {
		for (const fragment of fragments) {
			// Each `break` below ends one fragment's `switch`, not the loop.
			/* eslint-disable unicorn/no-break-in-nested-loop -- A `switch` dispatching one enum value. */
			switch (fragment.type) {
				case 'reset': {
					this.#styles.clear();
					break;
				}

				case 'end': {
					this.#styles.delete(fragment.endCode);
					break;
				}

				case 'start': {
					this.#styles.delete(fragment.endCode);
					this.#styles.set(fragment.endCode, fragment.code);
					break;
				}

				default: {
					break;
				}
			}
			/* eslint-enable unicorn/no-break-in-nested-loop */
		}
	}

	#openHyperlink(token) {
		if (this.#phase === 'before') {
			this.#hyperlink = {phase: 'inherited', token};
			return;
		}

		this.#hyperlink = {phase: 'pending', token, outputIndex: this.#output.length};
		this.#output.push(token.code);
	}

	#settleHyperlink() {
		const hyperlink = this.#hyperlink;
		if (!hyperlink) {
			return;
		}

		if (hyperlink.phase === 'visible') {
			this.#output.push(`${hyperlink.token.closePrefix}${hyperlink.token.terminator}`);
		} else if (hyperlink.phase === 'pending') {
			// Empty fragments preserve indexes, so discarding a link cannot move a pending SGR checkpoint.
			this.#output[hyperlink.outputIndex] = '';
		}

		this.#hyperlink = undefined;
	}

	#writeHyperlink(token, isPastEnd) {
		if (isPastEnd && (token.action !== 'close' || !this.#hyperlink)) {
			return;
		}

		if (token.action === 'open') {
			// OSC 8 has no nesting: a new open replaces the active link, so settle the previous one first.
			this.#settleHyperlink();
			this.#openHyperlink(token);
			return;
		}

		if (this.#hyperlink?.phase === 'pending') {
			this.#settleHyperlink();
			return;
		}

		this.#hyperlink = undefined;
		if (this.#phase === 'emitting') {
			this.#output.push(token.code);
		}
	}

	begin() {
		if (this.#phase === 'emitting') {
			return;
		}

		this.#phase = 'emitting';
		// Spreading style values works on Node.js 22 without converting the iterator to an array.
		this.#output.push(...this.#styles.values());
		if (this.#hyperlink) {
			this.#openHyperlink(this.#hyperlink.token);
		}
	}

	write(token, isPastEnd = false) {
		switch (token.type) {
			case 'sgr': {
				this.#writeSgr(token, isPastEnd);
				break;
			}

			case 'hyperlink': {
				this.#writeHyperlink(token, isPastEnd);
				break;
			}

			case 'control': {
				if (!isPastEnd && this.#phase === 'emitting') {
					this.#output.push(token.code);
				}

				break;
			}

			case 'text': {
				this.#writeText(token.value);
				break;
			}

			case 'character': {
				if (token.parts) {
					for (const part of token.parts) {
						this.write(part);
					}
				} else {
					this.#writeText(token.value);
				}

				break;
			}

			default: {
				break;
			}
		}
	}

	discardPending() {
		if (this.#hyperlink?.phase !== 'visible') {
			this.#settleHyperlink();
		}

		if (!this.#checkpoint) {
			return;
		}

		this.#output.length = this.#checkpoint.outputLength;
		this.#styles = this.#checkpoint.styles;
		this.#hyperlink = this.#checkpoint.hyperlink;
		this.#checkpoint = undefined;
	}

	finish() {
		if (this.#phase === 'before') {
			return '';
		}

		this.#settleHyperlink();
		// Disable active codes at the end.
		// eslint-disable-next-line unicorn/prefer-iterator-to-array -- Same Node.js 22 floor as in `begin`.
		this.#output.push(...[...this.#styles.keys()].toReversed());
		return this.#output.join('');
	}
}

export default function sliceAnsi(string, start, end) {
	if (end <= start || string.length === 0) {
		return '';
	}

	const output = new SliceOutput();
	let position = 0;
	for (const token of tokenizeAnsi(string, {endCharacter: end})) {
		// A zero-width character at `end` goes to the next slice, so `sliceAnsi(string, 0, n)` and `sliceAnsi(string, n)` do not both drop it.
		const isPastEnd = end !== undefined && position >= end;
		if (token.type === 'character') {
			if (isPastEnd || (end !== undefined && position + token.visibleWidth > end)) {
				output.discardPending();
				break;
			}

			if (position >= start) {
				output.begin();
			}

			// Graphemes contain their internal controls, so boundaries need no separate continuation lookup.
			output.write(token);
			position += token.visibleWidth;
		} else {
			output.write(token, isPastEnd);
		}
	}

	return output.finish();
}
