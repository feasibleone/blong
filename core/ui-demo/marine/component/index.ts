/**
 * marine/component/index.ts — model-driven component handler registration.
 *
 * Uses createModelHandlers() from blong-browser to automatically generate
 * Browse / New / Open pages for all marine entities defined in the model.
 *
 * This replaces the previous per-entity component handler files.
 * Pages are generated on demand using Explorer and Editor components
 * from blong-browser, enriched with models from marine/model/.
 */
import {createModelHandlers} from '@feasibleone/blong-browser';
import models from '../model/index.js';

export default createModelHandlers(models);
