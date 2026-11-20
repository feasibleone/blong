/**
 * The link from a memory entry back to the plan task line that created it.
 *
 * The plan is the visible progress board and the memory entry is the detail, so the two
 * are kept in step at the one moment that matters: `blong-dev memory close` ticks the
 * plan's checkbox, and `blong-dev memory reopen` unticks it. Nothing is stored in the
 * memory file to make that work — the `@@T-531` token in the plan already *is* the link,
 * and scanning a handful of small files is cheaper than a second index that could drift
 * from the token a reader follows.
 *
 * A task adopted into more than one plan ticks in every plan that names it, because that
 * is what the reader of each plan expects. Only a line whose checkbox opens a task is
 * touched: prose that mentions the id is left alone.
 */

import {existsSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {join, relative} from 'node:path';

/**
 * A task line whose reference may be a bare token or a link to the memory entry.
 *
 * The link form is what `plan tasks` writes; the bare form is what an older plan holds,
 * and both have to be ticked by `memory close`, so the brackets and the target between
 * them are optional here rather than a second pattern.
 */
const TASK_WITH_ID = /^(- \[)(?<mark>[ xX])(\]\s+\[?@@(?<id>[FTD]-\d{3})\b)/;

/** Where a plan names a task. */
export interface IPlanTaskSite {
    /** Repository-relative path of the plan. */
    path: string;
    /** 1-based line number. */
    line: number;
    checked: boolean;
}

/** The `plans/` folder, when this checkout has one. */
export function plansRoot(root: string): string {
    return join(root, 'plans');
}

/**
 * Every plan file under `plans/`.
 *
 * The folder is gitignored and shallow by rule (one folder per plan), so a recursive
 * walk stays cheap; a file is a plan when its name is `plan.md`, case-insensitively, or
 * when a folder has no `plan.md` and holds one markdown file. The second rule is what
 * makes `plans/memory-prose/PLAN.md` and its siblings work without a rename.
 */
export function planFiles(root: string): string[] {
    const base = plansRoot(root);
    if (!existsSync(base)) return [];
    const found: string[] = [];
    const walk = (dir: string, depth: number): void => {
        if (depth > 2) return;
        let names: string[];
        try {
            names = readdirSync(dir);
        } catch {
            return;
        }
        const markdown = names.filter(name => name.toLowerCase().endsWith('.md'));
        const named = markdown.filter(name => name.toLowerCase() === 'plan.md');
        for (const name of named) found.push(join(dir, name));
        if (named.length === 0 && markdown.length === 1) found.push(join(dir, markdown[0]!));
        for (const name of names) {
            const path = join(dir, name);
            try {
                if (statSync(path).isDirectory()) walk(path, depth + 1);
            } catch {
                // A directory that vanished between the listing and the stat is not a plan.
            }
        }
    };
    walk(base, 1);
    return found.sort();
}

/** The plans that name an id, with the line that does. */
export function planTaskSites(root: string, id: string, plan?: string): IPlanTaskSite[] {
    const wanted = id.trim().toUpperCase();
    const files = plan ? [plan.startsWith(root) ? plan : join(root, plan)] : planFiles(root);
    const sites: IPlanTaskSite[] = [];
    for (const file of files) {
        if (!existsSync(file)) continue;
        const lines = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
        for (let index = 0; index < lines.length; index += 1) {
            const match = TASK_WITH_ID.exec(lines[index] ?? '');
            if (!match || match.groups?.['id'] !== wanted) continue;
            sites.push({
                path: relative(root, file),
                line: index + 1,
                checked: (match.groups?.['mark'] ?? ' ').toLowerCase() === 'x',
            });
        }
    }
    return sites;
}

/**
 * Set the checkbox of every task line that names an id.
 *
 * Returns the sites it changed, so a caller can report them and a test can assert that
 * nothing else in the file moved. A site already in the wanted state is not a change.
 */
export function setPlanTaskChecked(
    root: string,
    id: string,
    checked: boolean,
    plan?: string,
): {changed: IPlanTaskSite[]; seen: IPlanTaskSite[]} {
    const wanted = id.trim().toUpperCase();
    const mark = checked ? 'x' : ' ';
    const files = plan ? [plan.startsWith(root) ? plan : join(root, plan)] : planFiles(root);
    const changed: IPlanTaskSite[] = [];
    const seen: IPlanTaskSite[] = [];

    for (const file of files) {
        if (!existsSync(file)) continue;
        const text = readFileSync(file, 'utf8');
        const lines = text.replace(/\r\n/g, '\n').split('\n');
        let touched = false;
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index] ?? '';
            const match = TASK_WITH_ID.exec(line);
            if (!match || match.groups?.['id'] !== wanted) continue;
            const site = {
                path: relative(root, file),
                line: index + 1,
                checked: (match.groups?.['mark'] ?? ' ').toLowerCase() === 'x',
            };
            seen.push(site);
            if (site.checked === checked) continue;
            const start = (match.index ?? 0) + (match[1]?.length ?? 0);
            lines[index] = line.slice(0, start) + mark + line.slice(start + 1);
            touched = true;
            changed.push({...site, checked});
        }
        if (touched) writeFileSync(file, lines.join('\n'), 'utf8');
    }
    return {changed, seen};
}

/**
 * The plan being executed, as the memory commands have to know it.
 *
 * A decision or a friction taken while a plan is being executed belongs on that plan's board, and
 * forgetting to say so is silent: the entry is written, the plan never mentions it, and the reader of
 * the board cannot tell the difference between "nothing was decided" and "nobody remembered the flag".
 * So the answer to "is a plan active" is a fact on disk rather than a habit — `plan init` and `plan
 * sync` write the pointer, and `memory add` refuses a decision or a friction that does not say which
 * side it is on (@@D-916).
 *
 * The pointer is `plans/active.json`: inside the gitignored folder, beside the plans it names, so a
 * checkout that has no plans has no pointer either.
 */
export interface IActivePlan {
    /** The plan's slug — the folder name under `plans/`, and what `--plan` accepts. */
    slug: string;
    /** Repository-relative path of the plan file. */
    path: string;
}

/** The pointer file, which records the plan being executed. */
export function activePlanFile(root: string): string {
    return join(plansRoot(root), 'active.json');
}

/** Record the plan being executed, or forget it when `plan` is undefined. */
export function writeActivePlan(root: string, plan: IActivePlan | undefined): void {
    const path = activePlanFile(root);
    if (plan === undefined) {
        if (existsSync(path)) writeFileSync(path, '{}\n');
        return;
    }
    writeFileSync(path, `${JSON.stringify(plan, null, 4)}\n`);
}

/**
 * The plan being executed, or `undefined` when nothing is.
 *
 * The pointer is checked against the file it names and against the plan's own front matter: a plan
 * that was deleted, or one whose `status` is no longer `approved`, is not active however the pointer
 * reads. When the pointer is absent or stale, the newest approved plan is the answer — a checkout
 * that predates the pointer still gets the protection.
 *
 * An **empty** pointer is different from an absent one: `{}` is what `writeActivePlan(root, undefined)`
 * writes to forget a plan, so it means "nothing is being executed" and the answer is `undefined`
 * rather than a guess. Without that distinction the forgetting was a no-op — the very next read
 * replaced it with the newest approved plan, and a repository whose remaining plans were finished
 * long ago kept naming one of them at every `memory add` (@@D-922).
 */
export function readActivePlan(root: string): IActivePlan | undefined {
    const pointer = activePlanFile(root);
    if (existsSync(pointer)) {
        let parsed: Partial<IActivePlan> | undefined;
        try {
            parsed = JSON.parse(readFileSync(pointer, 'utf8')) as Partial<IActivePlan>;
        } catch {
            // A file written by something else is not a pointer; the fallback below still answers.
            parsed = undefined;
        }
        const named =
            typeof parsed?.slug === 'string' && typeof parsed.path === 'string'
                ? {slug: parsed.slug, path: parsed.path}
                : undefined;
        // Present and naming a plan: that plan, if it is still approved.
        if (named) {
            const found = approvedPlans(root).find(
                plan => plan.path === named.path || plan.slug === named.slug,
            );
            if (found) return found;
        } else if (parsed !== undefined && Object.keys(parsed).length === 0) {
            // Present and empty: somebody said there is nothing to execute, and that stands.
            return undefined;
        }
    }
    return approvedPlans(root)[0];
}

/** Every plan whose front matter says `status: approved`, newest first. */
function approvedPlans(root: string): IActivePlan[] {
    const found: Array<IActivePlan & {approved: string; touched: number}> = [];
    for (const path of planFiles(root)) {
        let text: string;
        try {
            text = readFileSync(path, 'utf8');
        } catch {
            continue;
        }
        const meta = /^---\n(?<body>[\s\S]*?)\n---/.exec(text)?.groups?.['body'] ?? '';
        if (!/^\s*status:\s*approved\s*$/m.test(meta)) continue;
        const slug =
            /^\s*slug:\s*(\S+)\s*$/m.exec(meta)?.[1] ??
            path.slice(plansRoot(root).length + 1).split(/[\\/]/)[0] ??
            '';
        const approved = /^\s*approved:\s*(\S+)\s*$/m.exec(meta)?.[1] ?? '';
        let touched = 0;
        try {
            touched = statSync(path).mtimeMs;
        } catch {
            // A file that vanished between the listing and the stat is not the active plan.
        }
        found.push({slug, path: relative(root, path), approved, touched});
    }
    return found
        .sort((a, b) =>
            a.approved === b.approved ? b.touched - a.touched : a.approved < b.approved ? 1 : -1,
        )
        .map(({slug, path}) => ({slug, path}));
}
