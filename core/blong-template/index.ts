/**
 * blong-template — TypeScript template engine for the Blong framework.
 *
 * Two execution modes:
 *
 *   • **Trusted** (default exports): Uses `vm.compileFunction` with a template
 *     cache. Fast. Intended for developer-authored templates in config files,
 *     email templates bundled with the application, etc.
 *
 *   • **Safe** (`safe.*`): Uses `vm.runInNewContext` with a null-prototype
 *     sandbox. No access to host globals. Intended for templates written or
 *     edited by end-users.
 *
 * The `blong` helper namespace is available in every template expression:
 *
 * ```
 * ${blong.xml`<item>${value}</item>`}
 * ${blong.html(userInput)}
 * ${blong.join(items, ', ')}
 * ```
 */
export type {BlongHelpers} from './helpers.ts';

export {compile, render} from './engine.ts';
export {escapeHtml, escapeJson, escapeXml, htmlTag, jsonTag, xmlTag} from './escape.ts';
export {helpers} from './helpers.ts';
export {renderAll, safeRenderAll} from './renderAll.ts';
export {safeCompile, safeRender} from './safe.ts';
