/**
 * tap coverage-map: maps every test file to the blong-gogo source files.
 *
 * tap calls this with the test file name and uses the returned glob patterns
 * (with cwd=projectRoot) to decide which files to include in V8 coverage.
 * Returning the full blong-gogo/src tree here captures framework coverage
 * from all test suites in core/test, not just the files they directly import.
 *
 * Usage: tap ... --coverage-map=./coverage-map.mjs
 */
export default () => [
    '../blong-gogo/src/**/*.ts',
    '!../blong-gogo/src/**/*.test.ts',
];
