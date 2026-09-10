/**
 * Template enumeration is owned by `@feasibleone/blong-lib/template` so that
 * the runtime (`createRealm`), the publish bundler (`scripts/copy-template.mjs`)
 * and `blong-kukum`'s primitive scaffolder all share one definition of "what
 * counts as a template file".
 *
 * This module is kept as the stable import path for the gogo-side consumers.
 */
export {
    listTemplateFiles,
    TEMPLATE_FILES_IGNORE,
    type ListTemplateFilesOptions,
} from '@feasibleone/blong-lib/template';
