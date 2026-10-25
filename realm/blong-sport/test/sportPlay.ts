import type {
    IBrowseModelOptions,
    ICleanupModelOptions,
    ICreateAndEditModelOptions,
    ScreenshotFormat,
} from '@feasibleone/blong-browser/playwright/model';
import {
    browseModel as browseModelBase,
    cleanupModel as cleanupModelBase,
    createAndEditModel as createAndEditModelBase,
} from '@feasibleone/blong-browser/playwright/model';

/**
 * The realm's screen-capture policy for the model helpers.
 *
 * Two things are decided here so that a spec file carries neither:
 *
 * - **WebP.** Playwright stores a `.webp` baseline losslessly and picks the encoder
 *   from the name, so the format travels with the snapshot rather than the config.
 *   The sport realm runs the WebP trial; PNG stays the helper default (`D-609`).
 * - **Which states are worth a picture.** A filled form and the saved record
 *   already show the layout and the values, so the *dirty* captures — the same
 *   page with one typed change — are switched off.
 *
 * A record a spec creates only as a prerequisite for another page imports `quiet`
 * instead: its create and edit still run (the save is asserted), but no picture is
 * taken, because the page it lives on is captured by the spec that owns it.
 */
const format: ScreenshotFormat = 'png';

/** The extension Playwright reads the encoder from. */
const extension: Record<ScreenshotFormat, string> = {png: '.png', webp: '.webp'};

const shot = {screenshot: {format, capture: {editDirty: false}}} as const;

/**
 * The snapshot name in the realm's format, for a spec that captures by hand
 * (a tab of the editor, which the model helpers do not walk).
 */
export const snapshotName = (name: string): string => name.replace(/\.png$/, extension[format]);

/** No captures at all — for a row another spec's page already pictures. */
export const quiet = {
    screenshot: {
        format,
        capture: {
            browse: false,
            empty: false,
            filled: false,
            saved: false,
            open: false,
            editDirty: false,
            editSaved: false,
            cleanupConfirm: false,
        },
    },
} as const;

export const browseModel: typeof browseModelBase = (test, expect, options) =>
    browseModelBase(test, expect, {...shot, ...(options as IBrowseModelOptions)});

export const createAndEditModel: typeof createAndEditModelBase = (test, expect, options) =>
    createAndEditModelBase(test, expect, {...shot, ...(options as ICreateAndEditModelOptions)});

export const cleanupModel: typeof cleanupModelBase = (test, expect, options) =>
    cleanupModelBase(test, expect, {...shot, ...(options as ICleanupModelOptions)});
