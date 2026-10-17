/**
 * Moves the Allure application bundle out of a generated report page.
 *
 * Allure renders a "single-file" report by inlining its whole web application into
 * `index.html` as a base64 `data:` URL: about 3.5 MB in every report, while the bundle
 * itself is byte-for-byte identical across reports built by one Allure version. What
 * differs per run is the report data, and that is a fraction of the size.
 *
 * Upstream declined the change that would have written the bundle as a separate file
 * (allure-framework/allure3#353), so the page is patched after it is generated: every
 * `data:` JavaScript source is decoded, written beside the page under a content-addressed
 * name, and the tag is pointed at that file. The name is a hash of the bundle, so every
 * report of the same Allure version references the same file name and content — the
 * reports repository stores one blob for all of them instead of one copy per page @@D-563.
 *
 * The reference stays relative, so a report opened from disk keeps working and the
 * published directory is self-contained. A caller that hosts the bundle elsewhere can
 * pass `url` instead, which is the configuration the declined pull request introduced;
 * nothing is written locally in that case.
 */

import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

/** Name of an emitted bundle: `allure-main-<16 hex chars>.js`. */
export const BUNDLE_FILE = /^allure-main-[0-9a-f]{16}\.js$/;

/** A script start tag, which is all this module edits. */
const SCRIPT_TAG = /<script\b[^>]*>/gi;

/** The `src` attribute of such a tag. A `data-src` is not one. */
const SRC_ATTRIBUTE = /\ssrc\s*=\s*"([^"]*)"/i;

/** A `data:` URL carrying JavaScript; the captured group is its header up to the comma. */
const DATA_URL = /^data:(?:text|application)\/javascript([^,]*),/i;

/** Base64 is the only encoding Allure uses, and the only one worth decoding here. */
const BASE64_HEADER = /;\s*base64$/i;

export interface IExternalizeAllureOptions {
    /**
     * Directory the bundle is served from, replacing the file written beside the page.
     * A CDN address or a repository-relative path; the content-addressed file name is
     * appended to it.
     */
    url?: string;
    /**
     * Absolute directory the bundle is written to instead of the page's own, so every
     * report shares one copy. Only meaningful together with `url`: a page that points
     * somewhere else must be told where that is.
     */
    dir?: string;
}

export interface IExternalizeAllureResult {
    /** Names of the bundles the page now references. */
    files: string[];
    /** Bytes removed from the HTML by replacing the inlined bundles. */
    bytes: number;
    /** The source the page now loads the bundle from. */
    reference?: string;
}

/** Where the published pages take their application bundle from. */
export interface IConfiguredBundle {
    /** URL every report page references. */
    url?: string;
    /** Absolute directory the bundle is written to once, shared by every report. */
    dir?: string;
}

/**
 * Read the shared-bundle configuration from the environment.
 *
 * `BLONG_ALLURE_MAIN_URL` is the configuration the declined upstream change introduced:
 * the page points at one copy (a CDN, or a path on the reports site) instead of the
 * bundle written beside it. `BLONG_ALLURE_MAIN_DIR` names the directory that copy is
 * written to, resolved against the repository root; it is what turns the URL into a real
 * file every report and run shares, instead of a page that references nothing. Both are
 * unset by default, which keeps every published directory self-contained.
 */
export function configuredBundle(root: string): IConfiguredBundle {
    const url = (process.env['BLONG_ALLURE_MAIN_URL'] ?? '').trim();
    if (!url) return {};
    const dir = (process.env['BLONG_ALLURE_MAIN_DIR'] ?? '').trim();
    return {url, ...(dir ? {dir: resolve(root, dir)} : {})};
}

/**
 * Replace every inlined JavaScript bundle in `htmlFile` with a reference to a file.
 *
 * Content addressing is what makes this worth doing: the same bundle produces the same
 * name in every report, so the reports repository deduplicates them across packages and
 * runs. A file from an older Allure version that the patched page no longer references is
 * removed, so a published directory never accumulates bundles.
 *
 * With `url` and `dir` the bundle is written once into a shared directory and every page
 * references the URL: one file serves every package, every run and every published report,
 * which is what keeps it in the browser cache as well as out of the repository.
 */
export function externalizeAllureMain(
    htmlFile: string,
    options: IExternalizeAllureOptions = {},
): IExternalizeAllureResult {
    const result: IExternalizeAllureResult = {files: [], bytes: 0};
    if (!existsSync(htmlFile)) return result;

    // A shared directory is only usable together with the URL that points at it; without
    // one the page keeps its self-contained reference and the file stays beside it.
    const sharedDir = options.url ? options.dir : undefined;
    const html = readFileSync(htmlFile, 'utf8');
    const dir = dirname(htmlFile);
    let output = '';
    let cursor = 0;
    let changed = false;

    for (const match of html.matchAll(SCRIPT_TAG)) {
        const tag = match[0];
        const start = match.index ?? 0;
        const source = SRC_ATTRIBUTE.exec(tag);
        if (!source) continue;

        const data = DATA_URL.exec(source[1]!);
        if (!data || !BASE64_HEADER.test(data[1]!)) continue;

        const payload = source[1]!.slice(data[0].length);
        const bundle = Buffer.from(payload, 'base64');
        const name = `allure-main-${createHash('sha256')
            .update(bundle)
            .digest('hex')
            .slice(0, 16)}.js`;
        const reference = options.url ? `${options.url.replace(/\/+$/, '')}/${name}` : `./${name}`;
        if (sharedDir) {
            mkdirSync(sharedDir, {recursive: true});
            if (!existsSync(join(sharedDir, name))) writeFileSync(join(sharedDir, name), bundle);
        } else {
            writeFileSync(join(dir, name), bundle);
        }
        if (!result.files.includes(name)) result.files.push(name);
        result.reference = reference;

        result.bytes += source[1]!.length - reference.length;
        output += html.slice(cursor, start);
        // Only the attribute value changes: the tag keeps whatever spacing Allure wrote.
        const valueStart = source.index + source[0].indexOf('"') + 1;
        const valueEnd = valueStart + source[1]!.length;
        output += tag.slice(0, valueStart) + reference + tag.slice(valueEnd);
        cursor = start + tag.length;
        changed = true;
    }

    if (!changed) return result;

    output += html.slice(cursor);
    writeFileSync(htmlFile, output);
    if (!sharedDir) pruneBundles(dir, result.files);
    return result;
}

/** Remove bundle files the patched page does not reference. */
function pruneBundles(dir: string, keep: readonly string[]): void {
    for (const entry of readdirSync(dir)) {
        if (!BUNDLE_FILE.test(entry) || keep.includes(entry)) continue;
        rmSync(join(dir, entry), {force: true});
    }
}
