/**
 * Viewer registry barrel — register the built-in generic viewers and
 * re-export the registry API.
 */
import {registerViewer} from './registry.js';
import {JsonViewer} from './JsonViewer.js';
import {KeyValueViewer} from './KeyValueViewer.js';
import {FileImageViewer} from './FileImageViewer.js';
import {PodLogViewer} from './PodLogViewer.js';
import {TableViewer} from './TableViewer.js';
import {YamlViewer} from './YamlViewer.js';
import {MessageViewer} from './MessageViewer.js';
import {DocumentViewer} from './DocumentViewer.js';
import {SecretViewer} from './SecretViewer.js';

export * from './registry.js';
export {JsonViewer} from './JsonViewer.js';
export {KeyValueViewer} from './KeyValueViewer.js';
export {FileImageViewer} from './FileImageViewer.js';
export {PodLogViewer} from './PodLogViewer.js';
export {TableViewer} from './TableViewer.js';
export {YamlViewer} from './YamlViewer.js';
export {MessageViewer} from './MessageViewer.js';
export {DocumentViewer} from './DocumentViewer.js';
export {SecretViewer} from './SecretViewer.js';

/** Register the built-in generic viewers. Idempotent — safe to call repeatedly. */
export function registerBuiltinViewers(): void {
    registerViewer('json', JsonViewer);
    registerViewer('keyValue', KeyValueViewer);
    registerViewer('file', FileImageViewer);
    registerViewer('image', FileImageViewer);
    registerViewer('podLog', PodLogViewer);
    registerViewer('log', PodLogViewer);
    registerViewer('table', TableViewer);
    registerViewer('yaml', YamlViewer);
    registerViewer('message', MessageViewer);
    registerViewer('document', DocumentViewer);
    registerViewer('secret', SecretViewer);
}

// Make the generic viewers available as soon as the barrel is imported.
registerBuiltinViewers();
