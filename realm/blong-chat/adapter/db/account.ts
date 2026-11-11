import {library} from '@feasibleone/blong';
import type {IChatAccount, IChatWorkspace} from '@feasibleone/blong/types';

/**
 * `chat.db.account` — the two directions between the tables and the shapes a port reads.
 *
 * A row and an `IChatAccount` are almost the same shape, and the differences are the ones that break
 * a config-only deployment when they are hand-written twice: an absent string is `null` in the table
 * and *absent* in the account, and the API base is called `apiUrl` in one and `url` in the other.
 *
 * The configuration-token pair is not on the account at all. It belongs to the workspace, whose app
 * management it authorizes, and it is resolved onto the account only when a port reads it — so the
 * two conversions here are separate on purpose (`@@D-797`).
 */

/** A non-empty string, or `undefined` — the columns are nullable and the account is not. */
const textOf = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length ? value : undefined;

/** A timestamp column as the ISO string an account carries, or `undefined`. */
const timeOf = (value: unknown): string | undefined => {
    if (value instanceof Date) return value.toISOString();
    return typeof value === 'string' && value.length ? value : undefined;
};

/** The account a row describes. */
export const chatAccountOfRow = (row: Record<string, unknown>): IChatAccount => {
    const workspace = textOf(row.workspace);
    const appId = textOf(row.appId);
    const clientId = textOf(row.clientId);
    const botToken = textOf(row.botToken);
    const signingSecret = textOf(row.signingSecret);
    const authToken = textOf(row.authToken);
    const url = textOf(row.apiUrl);
    const publicUrl = textOf(row.publicUrl);
    return {
        ...(workspace && {workspace}),
        ...(appId && {appId}),
        ...(clientId && {clientId}),
        ...(botToken && {botToken}),
        ...(signingSecret && {signingSecret}),
        ...(authToken && {authToken}),
        ...(url && {url}),
        ...(publicUrl && {publicUrl}),
    };
};

/** The workspace's configuration-token pair, which a port resolves onto each of its accounts. */
export const chatWorkspaceOfRow = (row: Record<string, unknown>): IChatWorkspace => {
    const configToken = textOf(row.configToken);
    const configRefreshToken = textOf(row.configRefreshToken);
    const configTokenExpiresAt = timeOf(row.configTokenExpiresAt);
    return {
        ...(configToken && {configToken}),
        ...(configRefreshToken && {configRefreshToken}),
        ...(configTokenExpiresAt && {configTokenExpiresAt}),
    };
};

/** The columns an account patch names, and only those: an absent field leaves the stored one alone. */
export const chatAccountColumns = (patch: Record<string, unknown>): Record<string, unknown> => {
    const columns: Record<string, unknown> = {};
    const copy = (column: string, value: unknown): void => {
        if (value !== undefined) columns[column] = value ?? null;
    };
    copy('workspace', patch.workspace);
    copy('appId', patch.appId);
    copy('clientId', patch.clientId);
    copy('botToken', patch.botToken);
    copy('signingSecret', patch.signingSecret);
    copy('authToken', patch.authToken);
    copy('apiUrl', patch.apiUrl ?? patch.url);
    copy('publicUrl', patch.publicUrl);
    if (patch.accountStatus !== undefined) columns.accountStatus = patch.accountStatus;
    return columns;
};

const dateOf = (value: unknown): Date | null => {
    // The rotation answers epoch seconds while the column is a timestamp; `new Date(seconds)` reads a
    // number as milliseconds, which would store 1970.
    const seconds = typeof value === 'string' ? Date.parse(value) / 1000 : Number(value);
    return Number.isFinite(seconds) ? new Date(seconds * 1000) : null;
};

/**
 * The columns a workspace patch names.
 *
 * Separate from the account's on purpose: a rotation writes a pair to the workspace and app creation
 * writes ids to the account, and one function that guessed which row it was writing to is how the
 * pair ends up on the account again (`@@D-797`).
 */
export const chatWorkspaceColumns = (patch: Record<string, unknown>): Record<string, unknown> => {
    const columns: Record<string, unknown> = {};
    if (patch.configToken !== undefined) columns.configToken = patch.configToken ?? null;
    if (patch.configRefreshToken !== undefined) {
        columns.configRefreshToken = patch.configRefreshToken ?? null;
    }
    if (patch.configTokenExpiresAt !== undefined) {
        columns.configTokenExpiresAt = dateOf(patch.configTokenExpiresAt);
    }
    if (patch.workspaceStatus !== undefined) columns.workspaceStatus = patch.workspaceStatus;
    return columns;
};

export default library(() => ({
    chatAccountOfRow,
    chatAccountColumns,
    chatWorkspaceOfRow,
    chatWorkspaceColumns,
}));
