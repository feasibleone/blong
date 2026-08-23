import {describe, expect, it, vi} from 'vitest';
import {getViewer, hasViewer, listViewers, registerViewer} from './registry.js';
import {resolveViewer} from './resolveViewer.js';

describe('viewer registry', () => {
    it('registers and resolves viewers', () => {
        const FakeViewer = vi.fn();
        registerViewer('fake', FakeViewer);
        expect(hasViewer('fake')).toBe(true);
        expect(getViewer('fake')).toBe(FakeViewer);
        expect(listViewers()).toContain('fake');
    });

    it('returns undefined for unknown types', () => {
        expect(hasViewer('nope')).toBe(false);
        expect(getViewer('nope')).toBeUndefined();
    });
});

describe('resolveViewer', () => {
    it('prefers an explicit registered viewer', () => {
        const FakeViewer = vi.fn();
        registerViewer('fake', FakeViewer);
        const resolved = resolveViewer({viewer: 'fake'}, []);
        expect(resolved.component).toBe(FakeViewer);
        expect(resolved.type).toBe('fake');
    });

    it('recognizes a model-system resource', () => {
        const resolved = resolveViewer(
            {model: {subject: 'party', object: 'person'}},
            [{subject: 'party', object: 'person'}],
        );
        expect(resolved.page).toBe('component/party.person.browse');
        expect(resolved.type).toBe('model');
    });

    it('falls back to the json viewer type', () => {
        const resolved = resolveViewer({}, []);
        expect(resolved.type).toBe('json');
    });
});
