import { describe, expect, it } from 'vitest';

import { alignRunsToLines, literalLead } from '../src/core/lineAlign';

describe('literalLead', () => {
	it('keeps the verbatim start of the line, up to the first markup', () => {
		expect(literalLead('@@ Deriving OLS [[pogo511-olsderive]]')).toBe('@@ Deriving OLS');
		expect(literalLead('@@@@ The error variance, $\\sigma^2}')).toBe('@@@@ The error variance,');
		expect(literalLead('@ Model ^o-01kq2hog')).toBe('@ Model');
	});

	it('is empty when the line opens with markup', () => {
		expect(literalLead('**Bold** start')).toBe('');
	});
});

describe('alignRunsToLines', () => {
	it('maps one run per line by index', () => {
		expect(alignRunsToLines(['@ A', '\n@ B'], ['@ A', '@ B'])).toEqual([0, 1]);
	});

	it('skips a line swallowed by math that ran over the line break (Update009)', () => {
		// `$\sigma^2}` has no closing `$`, so the math runs on to the next
		// line's `$x_j` and the break between them is lost.
		const lines = [
			'@@@ The Components of the OLS Variances',
			'@@@@ The error variance, $\\sigma^2}',
			'@@@@ The total sample variance in $x_j$, $SST_j$',
			'@@@@ The linear relationships among the independent variables, $R^2_j$',
			'@@@ Variances in misspecified models',
		];
		const runs = [
			'@@@ The Components of the OLS Variances',
			'\n@@@@ The error variance, σ2} @@@@ The total sample variance in x_j, SSTj',
			'\n@@@@ The linear relationships among the independent variables, R2j',
			'\n@@@ Variances in misspecified models',
		];
		expect(alignRunsToLines(runs, lines)).toEqual([0, 1, 3, 4]);
	});

	it('gives up when more runs than lines', () => {
		expect(alignRunsToLines(['@ A', '@ B', '@ C'], ['@ A', '@ B'])).toBeNull();
	});

	it('gives up when a run matches none of the lines it could be', () => {
		expect(alignRunsToLines(['@ A', '\nsomething else'], ['@ A', '@ B', '@ C'])).toBeNull();
	});

	it('takes the next line when its start cannot be checked', () => {
		expect(alignRunsToLines(['@ A', '\nBold rest'], ['@ A', '**Bold** rest', '@ C'])).toEqual([0, 1]);
	});
});
