/**
 * tap coverage-map: maps every test file to the blong-gogo source files.
 *
 * Covers the full src/ tree (excluding other test files) so that running
 * the blong-gogo unit tests produces a report for the whole runtime, not
 * just the two files that happen to be imported by the tests directly.
 *
 * Usage: tap ... --coverage-map=./coverage-map.mjs
 */
export default () => [
    'src/**/*.ts',
    '!src/**/*.test.ts',
];
