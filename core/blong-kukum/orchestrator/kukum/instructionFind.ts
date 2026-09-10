import {library} from '@feasibleone/blong';
import {extractInstructions, walk} from '../../engine.ts';
import type {KukumLibContext, OperationParams} from '../../operation.ts';

/**
 * `kukum.instruction.find` — artifacts carrying coding-agent instructions.
 *
 * This is what a future built-in agent would read to know what still needs
 * doing; today it lets an external agent find its own outstanding notes.
 */
export default library(
    () =>
        async function instructionFind(this: KukumLibContext, params: OperationParams) {
            const host = this.platform;
            const root = host.resolve(params.target ?? '.');
            const all = await walk(host, root);
            const found: Array<{path: string; instructions: string[]}> = [];
            for (const file of all) {
                if (!/\.tsx?$/.test(file)) continue;
                const source = String(host.readFileSync(file, {encoding: 'utf-8'}));
                const lines = extractInstructions(source);
                if (lines.length)
                    found.push({path: host.relative(root, file), instructions: lines});
            }
            return {target: root, files: found};
        },
);
