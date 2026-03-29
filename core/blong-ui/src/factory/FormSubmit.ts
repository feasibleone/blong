/**
 * FormSubmit — form submission utilities.
 *
 * - `prepareSubmit()` strips internal `$.*` state and `$original`/`$modified`
 * - Handles create→edit mode switching after successful add
 * - Merges server response with form data
 */

import type {FormMode, InternalFormState} from '../types.js';

/** Submission result from the server. */
export interface SubmitResult {
    /** The saved entity data (from server response). */
    data: Record<string, unknown>;
    /** Whether the mode should switch (create→edit). */
    switchMode?: FormMode;
}

/**
 * Strip internal `$` prefix fields and framework bookkeeping from form data
 * before sending to the server.
 *
 * Fields removed:
 * - `$original` — reset baseline
 * - `$modified` — modification tracking
 * - `$selected` — table selection state
 * - `$edit` — master-detail edit state
 * - Any field starting with `$.`
 */
export function prepareSubmit(
    data: Record<string, unknown>,
): Record<string, unknown> {
    const cleaned: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
        // Skip internal state fields
        if (key.startsWith('$')) continue;
        cleaned[key] = value;
    }

    return cleaned;
}

/**
 * Merge server response into form data after a successful save.
 *
 * Server may return computed fields (IDs, timestamps, etc.) that should
 * be reflected in the form.
 */
export function mergeResponse(
    formData: Record<string, unknown>,
    serverResponse: Record<string, unknown>,
): Record<string, unknown> {
    return {
        ...formData,
        ...serverResponse,
    };
}

/**
 * Prepare the `$original` snapshot for reset support.
 *
 * Stores a deep copy of the current form values (excluding `$` fields)
 * as `$original`.
 */
export function snapshotOriginal(
    data: Record<string, unknown>,
): InternalFormState {
    const cleaned = prepareSubmit(data);
    return {
        $original: structuredClone(cleaned),
    };
}

/**
 * Build the full submission handler.
 *
 * Returns a function that:
 * 1. Strips internal state via `prepareSubmit`
 * 2. Calls the API method
 * 3. Merges server response
 * 4. Returns the new form values and mode
 */
export function createSubmitHandler(
    apiCall: (data: Record<string, unknown>) => Promise<Record<string, unknown>>,
    mode: FormMode,
): (data: Record<string, unknown>) => Promise<SubmitResult> {
    return async (data: Record<string, unknown>) => {
        const cleaned = prepareSubmit(data);
        const response = await apiCall(cleaned);
        const merged = mergeResponse(data, response);

        return {
            data: merged,
            // Switch from create to edit after successful add
            switchMode: mode === 'create' ? 'edit' : undefined,
        };
    };
}

/**
 * Prepare multipart form data for file upload submissions.
 *
 * Regular properties are serialized as JSON with name `$`.
 * File properties are added individually with path-based names.
 */
export function prepareMultipartSubmit(
    data: Record<string, unknown>,
    fileFields: string[],
): FormData {
    const formData = new FormData();

    // Separate file and non-file fields
    const jsonData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        if (key.startsWith('$')) continue;
        if (fileFields.includes(key)) {
            // Add file(s)
            if (value instanceof FileList) {
                for (let i = 0; i < value.length; i++) {
                    formData.append(key, value[i]);
                }
            } else if (value instanceof File) {
                formData.append(key, value);
            }
        } else {
            jsonData[key] = value;
        }
    }

    // Add non-file data as JSON
    formData.append('$', JSON.stringify(jsonData));

    return formData;
}
