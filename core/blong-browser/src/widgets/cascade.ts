/**
 * What a pick-list cascades on.
 *
 * `widget.parent` names the field whose value narrows a list, and a field is
 * addressed by the path the form stores it under: a model's `disciplineId` lives at
 * `competition.disciplineId`, not at its own name. The option a list answers is keyed
 * by the field's own name instead — `sportId` on a discipline — because that is the
 * name the row and the dropdown answer use. So the path says where the value is read
 * and its leaf says what an option must match.
 *
 * A flat schema is the case where the two coincide (`parent: 'continent'`), which is
 * the shape the Editor story has always had. `optionsFilter` remains the explicit
 * form for a list whose options carry the key under another name, or that depend on
 * more than one field. @@D-875
 */

/** The option key a `parent` path is matched under: the field's own (leaf) name. */
export function parentKey(parent: string): string {
    const dot = parent.lastIndexOf('.');
    return dot === -1 ? parent : parent.slice(dot + 1);
}

/**
 * What is narrowing a list, as one comparable string. Empty means nothing is
 * narrowing yet — which is also how a form that has not loaded its record looks, so
 * a widget can tell a load from a reader replacing the pick.
 */
export function narrowingOf(values: unknown[]): string {
    const parts = values.map(value => (value == null || value === '' ? '' : String(value)));
    // A set of fields that are all empty narrows nothing: the separators alone are
    // not a narrowing, or a load would look like a change on the explicit form.
    return parts.some(Boolean) ? parts.join('\u0000') : '';
}
