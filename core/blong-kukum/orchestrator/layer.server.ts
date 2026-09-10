import {layer} from '@feasibleone/blong';

/**
 * The kukum API is tooling, not a business domain — it is useful under every
 * intent (dev, integration, microservice, prod), unlike the default
 * `integration`-only activation for orchestrator folders.
 */
export default layer({default: true, microservice: true, integration: true, prod: true});
