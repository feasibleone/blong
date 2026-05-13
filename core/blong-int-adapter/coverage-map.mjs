/**
 * tap coverage-map: maps every test file to the blong-gogo adapter source files.
 *
 * tap calls this function with the test file name (relative to projectRoot) and
 * uses the returned value as a glob pattern (with cwd=projectRoot) to find the
 * files to include in coverage. Returning a relative glob pattern ensures the
 * adapter source files from blong-gogo are included in every adapter test run.
 *
 * Usage: tap ... --coverage-map=./coverage-map.mjs
 */

// Relative to blong-int-adapter (the project root where tap is run)
export default () => ['../blong-gogo/src/adapter/server/*.ts'];
