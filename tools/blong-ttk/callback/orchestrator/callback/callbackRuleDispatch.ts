/**
 * Rule-based callback dispatch using @infitx/decision
 *
 * Decision types (mapped from ml-testing-toolkit event types):
 * - fixedCallback: Send exact callback body defined in rule
 * - mockCallback: Generate mock callback from OpenAPI spec
 * - fixedErrorCallback: Send fixed error callback
 * - mockErrorCallback: Generate mock error callback
 * - noCallback: Suppress callback entirely
 * - fixedResponse: Return fixed synchronous response
 * - mockResponse: Generate mock synchronous response
 *
 * Rules YAML example:
 * ```yaml
 * rules:
 *   transfer-callback:
 *     when:
 *       method: POST
 *       path: /transfers
 *     then:
 *       fixedCallback:
 *         delay: 500
 *         body:
 *           transferState: COMMITTED
 * ```
 */

import type { IMeta } from '@feasibleone/blong';
import { handler } from '@feasibleone/blong';
import type { DecisionConfig, DecisionEngine } from '@infitx/decision';
import { createRequire } from 'module';

type DecisionFn = (config: string | DecisionConfig) => DecisionEngine;
const createDecision: DecisionFn = createRequire(import.meta.url)('@infitx/decision');

export default handler(() => ({
    callbackRuleDispatch: (
        context: {
            path: string;
            method: string;
            body?: unknown;
            pathParams?: Record<string, string>;
            queryParams?: Record<string, string>;
            /** YAML file path or inline @infitx/decision config */
            rules: string | DecisionConfig;
        },
        _$meta: IMeta,
    ) => {
        const engine = createDecision(context.rules);

        const fact = {
            path: context.path,
            method: context.method.toUpperCase(),
            body: context.body,
            pathParams: context.pathParams,
            queryParams: context.queryParams,
        };

        const results = engine.decide(fact);

        if (!results || results.length === 0) {
            return {decision: 'mockCallback', rule: null as string | number | null};
        }

        const {rule, decision, ...params} = results[0];
        return {rule, decision, ...params};
    },
}));
