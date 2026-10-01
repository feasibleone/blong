/**
 * Unit tests for the dev-server plugin's configuration resolution.
 *
 * Only the pure part is covered: how `.blong_devrc`'s `storybook:` section
 * becomes the role list and target, and what the toolbar is told about them.
 * The middleware itself needs a running Storybook dev server (verified by hand).
 */
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

import {readStorybookBackendConfig, storybookBackendDefine} from './storybookBackend.js';

const withDevRc = (content: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-sb-'));
    writeFileSync(join(dir, '.blong_devrc'), content);
    return dir;
};

describe('readStorybookBackendConfig', () => {
    it('falls back to the seeded test users and the local gateway', () => {
        const config = readStorybookBackendConfig(mkdtempSync(join(tmpdir(), 'blong-sb-')));
        expect(config.target).toBe('http://localhost:8080');
        expect(Object.keys(config.roles)).toEqual(['Admin', 'Manager', 'Guest']);
        expect(config.roles.Manager).toEqual({username: 'testManager', password: 'testPassword'});
    });

    it('reads the storybook section of .blong_devrc', () => {
        const dir = withDevRc(
            [
                'storybook:',
                '    target: http://gateway.internal:9090',
                '    roles:',
                '        Operator:',
                '            user: opsUser',
                '            password: opsPassword',
                '        Auditor: auditUser',
                '',
            ].join('\n'),
        );
        const config = readStorybookBackendConfig(dir);
        expect(config.target).toBe('http://gateway.internal:9090');
        expect(config.roles.Operator).toEqual({username: 'opsUser', password: 'opsPassword'});
        // A bare string is the user name; the dev password is the default.
        expect(config.roles.Auditor).toEqual({username: 'auditUser', password: 'testPassword'});
    });

    it('accepts JSON with comments too, like the sql command does', () => {
        const dir = withDevRc(
            '{\n  // local gateway\n  "storybook": {"target": "http://localhost:7070"}\n}\n',
        );
        const config = readStorybookBackendConfig(dir);
        expect(config.target).toBe('http://localhost:7070');
        // No roles configured → the defaults still apply.
        expect(Object.keys(config.roles)).toEqual(['Admin', 'Manager', 'Guest']);
    });
});

describe('storybookBackendDefine', () => {
    it('injects only what the toolbar needs to build its items', () => {
        const dir = mkdtempSync(join(tmpdir(), 'blong-sb-'));
        const defined = storybookBackendDefine(dir);
        expect(JSON.parse(defined['globalThis.__BLONG_STORYBOOK__'])).toEqual({
            target: 'http://localhost:8080',
            roles: ['Admin', 'Manager', 'Guest'],
        });
    });
});
