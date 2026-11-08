/**
Slice a string with [ANSI escape codes](https://en.wikipedia.org/wiki/ANSI_escape_code#Colors_and_Styles)

Columns are counted the same way as [`string-width`](https://github.com/sindresorhus/string-width).

Note: Tabs and other control characters take no columns. Replace tabs with spaces first if you need tab stops.

@param string - A string with ANSI escape codes. Like one styled by [`chalk`](https://github.com/chalk/chalk).
@param startSlice - Zero-based visible-column index at which to start the slice. Grapheme clusters (for example, emoji sequences and combining marks) are kept intact. If `startSlice` falls inside a grapheme cluster, that cluster is excluded.
@param endSlice - Zero-based visible-column index at which to end the slice. If a full grapheme cluster would cross `endSlice`, it is excluded. Defaults to the end of the string.

@example
```
import chalk from 'chalk';
import sliceAnsi from 'slice-ansi';

const string = 'The quick brown ' + chalk.red('fox jumped over ') +
	'the lazy ' + chalk.green('dog and then ran away with the unicorn.');

console.log(sliceAnsi(string, 20, 30));
```
*/
export default function sliceAnsi(string: string, startSlice: number, endSlice?: number): string;
