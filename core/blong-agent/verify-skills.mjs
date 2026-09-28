#!/usr/bin/env node
// Verify skill files after optimization.
//
// Checks, for every `.github/skills/*/SKILL.md`:
//  1. Valid YAML frontmatter with name + description.
//  2. name equals the skill folder name.
//  3. name is unique across the corpus.
//  4. Single-line inline description (normalized style) + trigger phrasing present.
//  5. Referenced files resolve: references/*.md and _shared/conventions.md links.
//  6. _shared/ is NOT registered as a skill (no SKILL.md inside).
//
// Usage: node verify-skills.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../'); // blong repo root
const SKILLS = path.join(ROOT, '.github/skills');

const errors = [];
const warns = [];
let count = 0;
const names = new Set();

function parseFrontmatter(text) {
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return null;
    const fm = {};
    for (const line of m[1].split('\n')) {
        const kv = line.match(/^(\w+):\s*(.*)$/);
        if (kv) fm[kv[1]] = kv[2];
    }
    return fm;
}

for (const entry of fs.readdirSync(SKILLS, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    const dir = entry.name;
    const file = path.join(SKILLS, dir, 'SKILL.md');
    if (dir === '_shared') {
        if (fs.existsSync(file)) errors.push(`${dir}: _shared must NOT contain SKILL.md (would register as a skill)`);
        continue;
    }
    if (!fs.existsSync(file)) {
        warns.push(`${dir}: no SKILL.md (scaffolding only)`);
        continue;
    }
    count++;
    const text = fs.readFileSync(file, 'utf8');
    const fm = parseFrontmatter(text);
    if (!fm) { errors.push(`${dir}: missing/invalid YAML frontmatter`); continue; }
    if (!fm.name) errors.push(`${dir}: frontmatter missing 'name'`);
    if (!fm.description) errors.push(`${dir}: frontmatter missing 'description'`);
    if (fm.name && fm.name !== dir) errors.push(`${dir}: name '${fm.name}' != folder '${dir}'`);
    if (fm.name) {
        if (names.has(fm.name)) errors.push(`${dir}: duplicate skill name '${fm.name}'`);
        names.add(fm.name);
    }
    const descLine = text.match(/^description:\s*([^\n]*)$/m);
    if (descLine && descLine[1].trim() === '>') errors.push(`${dir}: description uses folded (>) style — normalize to inline`);
    if (descLine && !descLine[1].trim()) errors.push(`${dir}: description uses literal style — normalize to inline`);
    if (!/Use this skill/.test(fm.description)) warns.push(`${dir}: description lacks 'Use this skill' trigger`);

    // referenced files resolve
    for (const ref of text.matchAll(/`references\/[A-Za-z0-9_.-]+\.md`/g)) {
        const target = path.join(SKILLS, dir, ref[0].replace(/`/g, ''));
        if (!fs.existsSync(target)) errors.push(`${dir}: broken reference ${ref[0]}`);
    }
    if (/conventions\.md/.test(text) && !fs.existsSync(path.join(SKILLS, '_shared', 'conventions.md'))) {
        errors.push(`${dir}: references _shared/conventions.md which does not exist`);
    }
}

console.log(`Checked ${count} skills (${names.size} unique names).`);
if (warns.length) console.log(`WARNINGS (${warns.length}):\n  - ${warns.join('\n  - ')}`);
if (errors.length) {
    console.error(`ERRORS (${errors.length}):\n  - ${errors.join('\n  - ')}`);
    process.exit(1);
}
console.log('OK — all checks passed.');
