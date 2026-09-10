/**
 * Commander source descriptors — the declarative commander vocabulary.
 *
 * A source maps a backend instance (identified by its lowercase instance
 * namespace, e.g. `sql-dev`, `k8s-prod`) to a hierarchy of `levels`. Each level
 * declares the semantic triples that list its children (`list`) and open a node
 * (`open`), plus the leaf viewer type and required permission.
 *
 * Method/param strings may contain `{field}` / `{parent.field}` tokens resolved
 * from the parent node (e.g. `access.{tableName}.find`).
 */

export interface ICommanderLevel {
    /** Resource type of this level's nodes (e.g. 'table', 'pod'). */
    resourceType: string;
    label?: string;
    keyField?: string;
    labelField?: string;
    /** Viewer type for leaf nodes (registered in the blong-browser viewer registry). */
    viewer?: string;
    /** Model-system reference for recognizing `{subject}.{object}` resources. */
    model?: {subject: string; object: string};
    /** Required permission (raw action name) to browse this level. */
    permission?: string;
    /** Triple + params that list the children of this level's nodes. */
    list: {
        method: string;
        resultSet?: string;
        params?: Record<string, unknown>;
    };
    /** Triple + params that open a node (leaf viewer fetch). */
    open?: {
        method: string;
        params?: Record<string, unknown>;
    };
}

export interface ICommanderSource {
    /** Lowercase instance namespace — the subject of every triple of this source. */
    name: string;
    label: string;
    icon?: string;
    permission?: string;
    levels: ICommanderLevel[];
}
