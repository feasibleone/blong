/**
 * The key a model kind signs with — shared by the three model kinds, not a kind itself.
 *
 * It lives beside them because they all need it at call time: the kinds are imported on demand by
 * `adapter/server/engine.ts`, and this module is imported by whichever of them loads (`@@T-593`).
 */
import type {IAgentEngineAccount} from '@feasibleone/blong/types';

/**
 * The key an account signs with: the literal one it carries, or the value of the variable it names.
 *
 * A deployment keeps the key in a Secret and fills the variable from it, because a key written into
 * the tree is a key in git (`@@T-578`). A function of the environment rather than a field read, so the
 * resolution is one place and a test can hand it one.
 */
export const agentEngineKey = (
    account: Pick<IAgentEngineAccount, 'apiKey' | 'apiKeyEnv'>,
    environment: Record<string, string | undefined> = process.env,
): string | undefined =>
    account.apiKey ?? (account.apiKeyEnv ? environment[account.apiKeyEnv] : undefined);
