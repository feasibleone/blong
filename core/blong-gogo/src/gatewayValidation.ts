/**
 * Why a request was refused before its route ran (`@@D-957`).
 *
 * The gateway compiles the validators its routes declare with TypeBox, and a failure there used to be
 * a plain `Error`: no type, no status, so the error handler fell back to 500 and logged it at error
 * level. A caller's mistake then reached four places as a defect — the client saw "internal server
 * error", the process wrote an unhandled-error record with a stack, an observer of the deployment
 * counted a failing call that had failed for the caller's own reason, and an expected-errors
 * declaration had no type to name.
 *
 * A body that does not match its schema is a 400 with the fields that were wrong, in the shape the
 * browser's forms read them: `{field, message}`, which the Editor paints beside the input. The type is
 * `gateway.validationFailed`, so a run that probes a refusal on purpose can declare it in `expect` and
 * keep the log quiet.
 */

/** One field a request got wrong, as a form reads it. */
export interface IInvalidField {
    /** The field's path, dotted: `isActive`, `subject.name`. Empty for the body itself. */
    field: string;
    /** What the schema said about it. */
    message: string;
}

/**
 * A TypeBox error path as a field name.
 *
 * TypeBox reports `/{subject}/{name}` for a nested member and `/` for the value itself; a form keys its
 * fields by name, so the separators become dots and the leading one goes.
 */
export const fieldOf = (path: string | undefined): string =>
    (path ?? '').replace(/^\//, '').replace(/\//g, '.');

/**
 * The fields a value got wrong, in the order the schema reports them.
 *
 * The path is read from `instancePath`, which is the member TypeBox fills: a report also carries
 * `schemaPath` (where in the schema the rule lives) and reading that instead would name the rule rather
 * than the field a caller has to fix. Only the first error per field is kept, because a form paints one
 * message beside an input and a union that failed three ways would replace the useful sentence with
 * three.
 */
export const invalidFields = (
    errors: Iterable<{instancePath?: string; path?: string; message: string}>,
): IInvalidField[] => {
    const fields = new Map<string, string>();
    for (const error of errors) {
        const field = fieldOf(error.instancePath ?? error.path);
        if (!fields.has(field)) fields.set(field, error.message);
    }
    return [...fields].map(([field, message]) => ({field, message}));
};

/** The one-line summary a log record carries: which fields, and what was wrong with them. */
export const problemsOf = (fields: IInvalidField[]): string =>
    fields.map(({field, message}) => `${field || 'the request'}: ${message}`).join('; ');
