#!/usr/bin/env node
/**
 * Realm-eval runner (MVP).
 *
 * Scores an agent-produced realm output directory against rubric.json.
 * Usage:
 *   node run.mjs --output <realm-dir> [options]
 *
 * Options:
 *   --output <dir>      Directory containing the produced realm (required).
 *   --label <name>      Short run label, e.g. "baseline-1" / "optimized-1".
 *   --version <v>       Instructions version under test, e.g. "current" | "optimized".
 *   --transcript <file> Session transcript file; used to estimate tokens (chars/4).
 *   --tokens <file>     Optional JSON: {"input": n, "output": n} real token counts.
 *   --semantic <a,b,c>  Judge scores for intent-match, would-run, completeness (0..10 each).
 *   --runs <dir>        Runs root dir (default: <this-dir>/runs).
 *   --no-write          Print summary without writing metrics/results files.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function arg(name, def) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : def;
}
function flag(name) {
    return process.argv.includes(`--${name}`);
}

function globToRegExp(glob) {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const re = escaped.replace(/\*\*/g, '__DOUBLE__').replace(/\*/g, '[^/]*');
    // `**/` may match zero directories (e.g. a root-level `server.ts` for `**/server.ts`).
    return new RegExp('^' + re.replace(/__DOUBLE__\//g, '(?:.*/)?').replace(/__DOUBLE__/g, '.*') + '$');
}

function walk(dir, base = dir, out = []) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, base, out);
        else out.push({abs: full, rel: path.relative(base, full)});
    }
    return out;
}

function readFiles(glob, files) {
    const re = globToRegExp(glob);
    return files.filter(f => re.test(f.rel)).map(f => ({...f, content: fs.readFileSync(f.abs, 'utf8')}));
}

const rubric = JSON.parse(fs.readFileSync(path.join(HERE, 'rubric.json'), 'utf8'));

const output = arg('output');
if (!output || !fs.existsSync(output)) {
    console.error('ERROR: --output <dir> is required and must exist');
    process.exit(1);
}

const files = walk(output);
const machineResults = [];
let passedWeight = 0;
let totalWeight = 0;

for (const check of rubric.machine) {
    totalWeight += check.weight;
    let pass = false;
    switch (check.type) {
        case 'anyFile': {
            // Glob-match each pattern against relative paths. Plain directory
            // prefixes (e.g. "error/") match anything under that directory.
            pass = files.some(f => check.patterns.some(p => {
                const glob = p.includes('*') ? p : p.replace(/\/$/, '') + '/**';
                return globToRegExp(glob).test(f.rel);
            }));
            break;
        }
        case 'regexFiles': {
            const re = new RegExp(check.pattern);
            pass = files.some(f => {
                const name = path.basename(f.rel, path.extname(f.rel));
                return re.test(name);
            });
            break;
        }
        case 'content': {
            const matched = readFiles(check.glob, files);
            const re = new RegExp(check.pattern);
            pass = matched.some(f => re.test(f.content));
            break;
        }
        case 'absent': {
            const matched = readFiles(check.glob, files);
            const re = new RegExp(check.pattern);
            pass = !matched.some(f => re.test(f.content));
            break;
        }
        default:
            pass = false;
    }
    if (pass) passedWeight += check.weight;
    machineResults.push({id: check.id, label: check.label, weight: check.weight, pass});
}

const machineScore = Math.round((passedWeight / totalWeight) * rubric.weights.machine);

// Semantic scores
let semanticScores = null;
const semanticArg = arg('semantic');
const judgeFile = path.join(output, 'judge.json');
if (semanticArg) {
    semanticScores = semanticArg.split(',').map(Number);
} else if (fs.existsSync(judgeFile)) {
    const j = JSON.parse(fs.readFileSync(judgeFile, 'utf8'));
    semanticScores = rubric.semantic.map(s => j[s.id] ?? 0);
} else {
    semanticScores = rubric.semantic.map(() => 0);
    console.warn('WARN: no semantic scores (--semantic a,b,c or <output>/judge.json). Semantic = 0.');
}
const semanticScore = semanticScores.reduce((a, b) => a + b, 0);
const totalScore = machineScore + semanticScore;

// Tokens
let tokens = null;
const tokensFile = arg('tokens');
if (tokensFile && fs.existsSync(tokensFile)) {
    tokens = JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
} else {
    const transcript = arg('transcript');
    if (transcript && fs.existsSync(transcript)) {
        const chars = fs.readFileSync(transcript, 'utf8').length;
        tokens = {rawChars: chars, estTokens: Math.round(chars / 4)};
    }
}

const run = {
    label: arg('label') ?? `run-${Date.now()}`,
    instructionsVersion: arg('version') ?? 'unknown',
    date: new Date().toISOString(),
    machine: {score: machineScore, max: rubric.weights.machine, checks: machineResults},
    semantic: {scores: semanticScores, max: rubric.weights.semantic},
    total: totalScore,
    max: 100,
    tokens,
};

const summary = {
    label: run.label,
    version: run.instructionsVersion,
    machineScore,
    semanticScore,
    totalScore,
    tokens: tokens?.estTokens ?? tokens?.input ?? null,
};

if (!flag('no-write')) {
    const runsDir = arg('runs') ?? path.join(HERE, 'runs');
    const n = fs.existsSync(runsDir) ? fs.readdirSync(runsDir).filter(d => /^run-/.test(d)).length + 1 : 1;
    const runDir = path.join(runsDir, `run-${n}`);
    fs.mkdirSync(runDir, {recursive: true});
    fs.writeFileSync(path.join(runDir, 'metrics.json'), JSON.stringify(run, null, 2));

    const csvPath = path.join(runsDir, 'results.csv');
    const header = 'run,date,label,instructions-version,machine,semantic,total,tokens-estimate\n';
    const row = `${n},${run.date},${run.label},${run.instructionsVersion},${machineScore},${semanticScore},${totalScore},${tokens?.estTokens ?? ''}\n`;
    if (!fs.existsSync(csvPath)) fs.writeFileSync(csvPath, header);
    fs.appendFileSync(csvPath, row);
    summary.runDir = runDir;
}

console.log(JSON.stringify(summary, null, 2));
