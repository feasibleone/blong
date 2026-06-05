/** Simple utility to convert camelCase object names to title case (Camel Case) for default card titles.
 *  It also strips common prefixes and suffixes, e.g. fieldId -> Field, isActive → Active, itemType → Type, entityName → Name.
 *  Stripping happens after splitting camelCase, so e.g. userId becomes User Id → User and solid becomes Solid (not Sol).
 */
export default function label<T>(title: T, name: T): T | string {
    return (
        title ??
        (typeof name === 'string'
            ? name
                  ?.split('.')
                  .pop()!
                  .replace(/([a-z])([A-Z])/g, '$1 $2') // Split camelCase
                  .replace(/^(is|has|can|should|field)?(.*?)(Id)?$/i, '$2')
                  .trim()
                  .replace(/\b\w/g, (c: string) => c.toUpperCase()) // Capitalise first letter of each word
            : name)
    );
}
