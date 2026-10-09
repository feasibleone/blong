import {readFileSync} from 'node:fs';
import type {IBlongDeploymentSpec, IPlanOptions} from './plan.ts';
import {planOptionsFromSpec} from './plan.ts';

/**
 * spec.ts — the `BlongDeployment` a process was asked to generate a tree for.
 *
 * The operator does not hold the suite it reconciles: it loads the target suite's artifact in a
 * short-lived child process and hands it the CR's spec (T-234, D-395). The spec travels as a file
 * rather than as a dozen `--kustomize.*` flags because it is nested — external services, the
 * volume, the UI — and a file is the one form that needs no escaping and reads the way the CR does.
 *
 * A file that is missing or is not JSON fails loudly: the operator and its child disagreeing about
 * a generation must never look like a plan derived from defaults, which is the answer that would
 * deploy something nobody asked for.
 */
export const readSpecFile = (file?: string): Partial<IPlanOptions> => {
    if (!file) return {};
    const raw = readFileSync(file, 'utf8');
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new Error(`spec file "${file}" is not JSON: ${(error as Error).message}`);
    }
    // A whole custom resource is accepted as well as its `spec` alone: the operator writes the spec,
    // and a reader debugging a generation tends to have the CR itself to hand.
    const document = parsed as {spec?: IBlongDeploymentSpec} & IBlongDeploymentSpec;
    return planOptionsFromSpec(document?.spec ?? document);
};
