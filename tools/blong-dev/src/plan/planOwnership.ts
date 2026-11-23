/**
 * Which host is working a plan, and how that fact travels.
 *
 * A plan's local folder is what the tooling reads and writes — the board, the front matter, the
 * memory entries the tasks live in. It is gitignored, so it exists on the machine that created it
 * and nowhere else; two hosts working the same plan therefore edit two memory trees that only agree
 * by accident, and a `memory close` on one is invisible to the other until somebody notices.
 *
 * The claim is the answer: a host takes the plan before it works it, and every mutating verb refuses
 * a plan another host holds. The fact has to be visible where both hosts can see it, so it travels
 * in the published issue — one marker line the tool writes and reads back, beside a sentence a person
 * reads — and the front matter keeps a copy for the machine that works the plan.
 *
 * The marker is an HTML comment, so it is invisible in a rendered issue and survives an edit that
 * keeps the body text: `<!-- plan-claim host="ms-02" at="2026-11-23" by="kalin" -->`.
 */

import {hostname} from 'node:os';

/** One host holding a plan. */
export interface IPlanClaim {
    /** The machine, as `os.hostname()` reports it (or `--host` names it). */
    host: string;
    /** The day the claim was taken, ISO `YYYY-MM-DD`. */
    at: string;
    /** The GitHub login that took it, when `gh` answered. */
    by?: string;
}

/** The label a claimed plan carries in the issue list, so the state is visible without opening it. */
export const CLAIM_LABEL = 'plan-claimed';

/**
 * The prefix of the label that names the host holding a plan.
 *
 * `plan-claimed` says a host holds the plan; this says which one, in the issue list, without opening
 * anything — which is what a second host checks before it starts, and what a reader checks before
 * asking about the work.
 */
export const HOST_LABEL_PREFIX = 'plan-host:';

/**
 * The label that names one host.
 *
 * A label cannot carry a comma: `gh issue edit --add-label` splits its argument on one, so a host
 * whose name held a comma would silently add two labels. Everything a machine name can hold is
 * kept and the rest becomes a hyphen, and the whole thing is capped at the fifty characters GitHub
 * allows a label.
 */
export function hostLabel(host: string): string {
    const safe = host
        .trim()
        .replace(/[^A-Za-z0-9._-]/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50 - HOST_LABEL_PREFIX.length);
    return `${HOST_LABEL_PREFIX}${safe === '' ? 'unknown' : safe}`;
}

/** Whether a label names a host, so a release knows which labels to take off. */
export function isHostLabel(label: string): boolean {
    return label.startsWith(HOST_LABEL_PREFIX);
}

/** The part of a plan's front matter a claim reads and writes. */
export interface IClaimMeta {
    claimed?: unknown;
    claimedAt?: unknown;
    claimedBy?: unknown;
}

/** The host this process runs on, which is the identity a claim records. */
export function thisHost(): string {
    const named = process.env['BLONG_HOST']?.trim();
    return named !== undefined && named !== '' ? named : hostname() || 'unknown';
}

/** Today, as a claim records it. */
export function today(): string {
    return new Date().toISOString().slice(0, 10);
}

/** The claim the front matter holds, or `undefined` when the plan is unclaimed. */
export function claimOf(meta: IClaimMeta): IPlanClaim | undefined {
    const host = typeof meta.claimed === 'string' ? meta.claimed.trim() : '';
    if (host === '') return undefined;
    const at = typeof meta.claimedAt === 'string' ? meta.claimedAt : '';
    const by = typeof meta.claimedBy === 'string' ? meta.claimedBy : undefined;
    return {host, at, ...(by ? {by} : {})};
}

/** The fields a claim writes into the front matter. */
export function claimPatch(claim: IPlanClaim): Record<string, string> {
    return {
        claimed: claim.host,
        claimedAt: claim.at,
        ...(claim.by ? {claimedBy: claim.by} : {}),
    };
}

/** The fields a release drops from the front matter. */
export const CLAIM_FIELDS: readonly string[] = ['claimed', 'claimedAt', 'claimedBy'];

/** Whether a claim belongs to the host this process runs on. */
export function isMine(claim: IPlanClaim, host = thisHost()): boolean {
    return claim.host === host;
}

/** The marker line a published issue carries, so any host can read the claim back. */
export function claimMarker(claim: IPlanClaim): string {
    const by = claim.by ? ` by="${escapeAttribute(claim.by)}"` : '';
    return `<!-- plan-claim host="${escapeAttribute(claim.host)}" at="${claim.at}"${by} -->`;
}

/** Read the marker out of an issue body, or `undefined` when it carries none. */
export function parseClaimMarker(body: string): IPlanClaim | undefined {
    const match = /<!--\s*plan-claim(?<rest>[^>]*)-->/.exec(body);
    const rest = match?.groups?.['rest'];
    if (rest === undefined) return undefined;
    const host = attribute(rest, 'host');
    if (host === '') return undefined;
    const at = attribute(rest, 'at');
    const by = attribute(rest, 'by');
    return {host, at, ...(by === '' ? {} : {by})};
}

/** One attribute of the marker, unquoted. */
function attribute(text: string, name: string): string {
    const match = new RegExp(`\\b${name}="(?<value>[^"]*)"`).exec(text);
    return match?.groups?.['value'] ?? '';
}

/** An attribute value that cannot break out of its quotes. */
function escapeAttribute(value: string): string {
    return value.replace(/"/g, '');
}
