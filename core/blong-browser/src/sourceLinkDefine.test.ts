import {describe, expect, it} from 'vitest';
import {sourceLinkDefine, workspaceRootOf} from './sourceLinkDefine.js';

const packageRoot = process.cwd();

describe('source link define', () => {
    it('resolves the package and workspace paths', () => {
        const defined = JSON.parse(
            sourceLinkDefine(packageRoot, {} as NodeJS.ProcessEnv)[
                'globalThis.__BLONG_SOURCE_LINK__'
            ]!,
        ) as {ci: boolean; repository: string; branch: string; packagePath: string};
        expect(workspaceRootOf(packageRoot)).not.toBe(packageRoot);
        expect(defined).toMatchObject({
            ci: false,
            repository: 'feasibleone/blong',
            branch: 'main',
            packagePath: 'core/blong-browser',
        });
    });

    it('uses the pull request branch in a captured run', () => {
        const defined = JSON.parse(
            sourceLinkDefine(packageRoot, {
                CI: '1',
                GITHUB_REPOSITORY: 'acme/blong',
                GITHUB_HEAD_REF: 'feature/test-run',
                BLONG_VSCODE_REMOTE: 'vscode-remote/ssh-remote+ms-02',
            } as NodeJS.ProcessEnv)['globalThis.__BLONG_SOURCE_LINK__']!,
        ) as {ci: boolean; repository: string; branch: string; vscodeRemote?: string};
        expect(defined).toMatchObject({
            ci: true,
            repository: 'acme/blong',
            branch: 'feature/test-run',
            vscodeRemote: 'vscode-remote/ssh-remote+ms-02',
        });
    });
});
