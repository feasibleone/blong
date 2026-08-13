---
name: blong-eip
description: Implement Enterprise Integration Patterns (EIP) as Blong handlers. Each pattern (Pipes and Filters, Content-Based Router, Splitter, Aggregator, Claim Check, etc.) maps to a single handler that calls downstream handlers via the handler proxy. Use this skill whenever the user mentions routing, filtering, splitting, aggregating, or transforming messages in a pipeline — even if they don't use the term 'EIP' or 'enterprise integration'.
---

# Implementing EIP Patterns

## Overview

[Enterprise Integration Patterns](https://www.enterpriseintegrationpatterns.com/) describe
well-known solutions for message-based integration problems. In Blong each pattern becomes a single
handler in `orchestrator/eip/` that receives a message and delegates to downstream handlers via the
`handler` proxy.

The downstream handlers can be real adapters in production or mock handlers during testing – the
pattern handler code never changes. See **blong-mock-test** for the testing side.

## Purpose

- **Routing:** forward messages to different handlers based on content or runtime state
- **Filtering:** discard or pass messages based on conditions
- **Transformation:** enrich, simplify, normalise, or wrap message payloads
- **Aggregation:** collect individual messages into batches
- **Resequencing:** sort out-of-order messages before processing
- **Claim Check:** store large payloads and pass a lightweight reference downstream

## File structure

```
realmname/
└── orchestrator/
    ├── eipDispatch.ts           # Dispatch orchestrator for the "eip" namespace
    └── eip/                     # Handler group "realmname.eip"
        ├── ~.schema.ts          # TypeBox type declarations & IRemoteHandler augmentation
        ├── eipMessageReturn.ts
        ├── eipMessagePipes.ts
        ├── eipMessageRoute.ts
        ├── eipMessageDynamic.ts
        ├── eipMessageFilter.ts
        ├── eipMessageRecipient.ts
        ├── eipMessageSplit.ts
        ├── eipMessageAggregate.ts
        ├── eipMessageSort.ts
        ├── eipMessageCompose.ts
        ├── eipMessageScatter.ts
        ├── eipMessageWrap.ts
        ├── eipMessageEnrich.ts
        ├── eipMessageSimplify.ts
        ├── eipMessageClaim.ts
        └── eipMessageNormalize.ts
```

## Dispatch orchestrator

Wire the handler group to a namespace using the dispatch orchestrator:

```ts
// realmname/orchestrator/eipDispatch.ts
import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: ['eip'],
            imports: 'realmname.eip',
        },
        integration: {
            // In integration mode also serve mock handlers under the same orchestrator
            namespace: ['eip', 'mock'],
            imports: ['realmname.eip', 'realmname.mock'],
        },
    },
}));
```

## Pattern implementations

### Request–Reply

Return the result of a downstream call unchanged.

```ts
// realmname/orchestrator/eip/eipMessageReturn.ts
import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function eipMessageReturn(
            {result}: {result: unknown},
            $meta: IMeta,
        ): Promise<unknown> {
            return result;
        },
);
```

### Pipes and Filters

Pass the message through a sequence of handlers.

```ts
// realmname/orchestrator/eip/eipMessagePipes.ts
import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({handler: {filterA, filterB}}) =>
        async function eipMessagePipes(params: unknown, $meta: IMeta): Promise<unknown> {
            const resultA = await filterA(params, $meta);
            return filterB(resultA, $meta);
        },
);
```

### Content-Based Router

Inspect a field in the message and forward to the appropriate handler.

```ts
// realmname/orchestrator/eip/eipMessageRoute.ts
import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({handler: {handlerA, handlerB}}) =>
        async function eipMessageRoute(
            {destination, ...rest}: {destination: string; [key: string]: unknown},
            $meta: IMeta,
        ): Promise<unknown> {
            if (destination === 'A') return handlerA(rest, $meta);
            return handlerB(rest, $meta);
        },
);
```

### Dynamic Router

Resolve the target handler name at runtime from the message itself.

```ts
// realmname/orchestrator/eip/eipMessageDynamic.ts
import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({handler}) =>
        async function eipMessageDynamic(
            {destination, ...rest}: {destination: string; [key: string]: unknown},
            $meta: IMeta,
        ): Promise<unknown> {
            const target = (handler as Record<string, (...args: unknown[]) => unknown>)[
                destination
            ];
            return target(rest, $meta);
        },
);
```

### Message Filter

Forward the message only when a condition is met.

```ts
// realmname/orchestrator/eip/eipMessageFilter.ts
import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({handler: {downstream}}) =>
        async function eipMessageFilter(
            {condition, ...rest}: {condition: boolean; [key: string]: unknown},
            $meta: IMeta,
        ): Promise<unknown> {
            if (condition) return downstream(rest, $meta);
            return undefined;
        },
);
```

### Recipient List

Send a message to multiple handlers. Supports parallel (default) and sequential execution.

```ts
// realmname/orchestrator/eip/eipMessageRecipient.ts
import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({handler: {handlerA, handlerB}}) =>
        async function eipMessageRecipient(
            {sequential, ...rest}: {sequential?: boolean; [key: string]: unknown},
            $meta: IMeta,
        ): Promise<unknown[]> {
            if (sequential) {
                const a = await handlerA(rest, $meta);
                const b = await handlerB(rest, $meta);
                return [a, b];
            }
            return Promise.all([handlerA(rest, $meta), handlerB(rest, $meta)]);
        },
);
```

### Splitter

Break a compound message into individual items and process each one.

```ts
// realmname/orchestrator/eip/eipMessageSplit.ts
import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({handler: {processItem}}) =>
        async function eipMessageSplit(
            {items, sequential}: {items: unknown[]; sequential?: boolean},
            $meta: IMeta,
        ): Promise<unknown[]> {
            if (sequential) {
                const results: unknown[] = [];
                for (const item of items) results.push(await processItem(item, $meta));
                return results;
            }
            return Promise.all(items.map(item => processItem(item, $meta)));
        },
);
```

### Aggregator

Collect individual messages until a batch size is reached, then process the batch. The factory
closure holds mutable state, so each orchestrator instance keeps its own list.

```ts
// realmname/orchestrator/eip/eipMessageAggregate.ts
import {type IMeta, handler} from '@feasibleone/blong';

const BATCH_SIZE = 3;

export default handler(({handler: {storeBatch}}) => {
    const list: unknown[] = [];
    return async function eipMessageAggregate(message: unknown, $meta: IMeta): Promise<unknown> {
        list.push(message);
        if (list.length >= BATCH_SIZE) {
            const batch = list.splice(0, list.length);
            return storeBatch({items: batch}, $meta);
        }
        return undefined;
    };
});
```

### Resequencer

Buffer out-of-order messages until a batch is complete, then sort and process in order.

```ts
// realmname/orchestrator/eip/eipMessageSort.ts
import {type IMeta, handler} from '@feasibleone/blong';

const BATCH_SIZE = 3;

export default handler(({handler: {processItem}}) => {
    const list: Array<{order: number; [key: string]: unknown}> = [];
    return async function eipMessageSort(
        params: {order: number; [key: string]: unknown},
        $meta: IMeta,
    ): Promise<unknown[] | undefined> {
        list.push(params);
        if (list.length >= BATCH_SIZE) {
            const sorted = list.splice(0, list.length).sort((a, b) => a.order - b.order);
            const results: unknown[] = [];
            for (const item of sorted) results.push(await processItem(item, $meta));
            return results;
        }
        return undefined;
    };
});
```

### Composed Message Processor

Split a message into independent parts, process each part, and merge the results.

```ts
// realmname/orchestrator/eip/eipMessageCompose.ts
import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({handler: {processA, processB}}) =>
        async function eipMessageCompose(
            {part1, part2}: {part1: unknown; part2: unknown},
            $meta: IMeta,
        ): Promise<unknown> {
            const [resultA, resultB] = await Promise.all([
                processA(part1, $meta),
                processB(part2, $meta),
            ]);
            return Object.assign({}, resultA, resultB);
        },
);
```

### Scatter-Gather

Send a message to a dynamic list of handlers in parallel and collect all results.

```ts
// realmname/orchestrator/eip/eipMessageScatter.ts
import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({handler}) =>
        async function eipMessageScatter(
            {destinations, ...rest}: {destinations: string[]; [key: string]: unknown},
            $meta: IMeta,
        ): Promise<unknown[]> {
            const map = handler as Record<string, (...args: unknown[]) => unknown>;
            return Promise.all(destinations.map(dest => map[dest](rest, $meta)));
        },
);
```

### Envelope Wrapper

Serialise the message payload into a protocol-specific envelope before forwarding.

```ts
// realmname/orchestrator/eip/eipMessageWrap.ts
import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({handler: {sendEnvelope}}) =>
        async function eipMessageWrap(params: unknown, $meta: IMeta): Promise<unknown> {
            const payload = Buffer.from(JSON.stringify(params)).toString('base64');
            return sendEnvelope({payload}, $meta);
        },
);
```

### Content Enricher

Fetch additional data from an external source and merge it into the message.

```ts
// realmname/orchestrator/eip/eipMessageEnrich.ts
import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({handler: {fetchEnrichment, processEnriched}}) =>
        async function eipMessageEnrich(params: unknown, $meta: IMeta): Promise<unknown> {
            const enrichment = await fetchEnrichment(params, $meta);
            return processEnriched(Object.assign({}, params, enrichment), $meta);
        },
);
```

### Content Filter

Remove sensitive or irrelevant fields before forwarding the message.

```ts
// realmname/orchestrator/eip/eipMessageSimplify.ts
import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({handler: {downstream}}) =>
        async function eipMessageSimplify(
            {sensitiveField: _drop, ...rest}: {sensitiveField?: unknown; [key: string]: unknown},
            $meta: IMeta,
        ): Promise<unknown> {
            return downstream(rest, $meta);
        },
);
```

### Claim Check

Store a large payload and pass a lightweight claim (ID) downstream; retrieve later.

```ts
// realmname/orchestrator/eip/eipMessageClaim.ts
import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({handler: {storageWrite, storageRead}}) =>
        async function eipMessageClaim(params: unknown, $meta: IMeta): Promise<unknown> {
            const {id} = await storageWrite(params, $meta);
            return storageRead({id}, $meta);
        },
);
```

### Normalizer

Translate messages from multiple source formats into a single canonical form.

```ts
// realmname/orchestrator/eip/eipMessageNormalize.ts
import {type IMeta, handler} from '@feasibleone/blong';

function toCanonical(format: string, value: unknown): string {
    const str = String(value);
    if (format === 'uppercase') return str.toUpperCase();
    if (format === 'lowercase') return str.toLowerCase();
    if (format === 'trim') return str.trim();
    return str;
}

export default handler(
    ({handler: {processCanonical}}) =>
        async function eipMessageNormalize(
            {format, value}: {format: string; value: unknown},
            $meta: IMeta,
        ): Promise<unknown> {
            return processCanonical({format, value: toCanonical(format, value)}, $meta);
        },
);
```

## TypeBox schema & type declarations

Declare handler signatures with TypeBox so the TypeScript compiler can verify call sites and the
framework can generate OpenAPI documentation:

```ts
// realmname/orchestrator/eip/~.schema.ts
import {validationHandlers} from '@feasibleone/blong';
import {Type, type Static} from 'typebox';

type eipMessageReturn = Static<typeof eipMessageReturn>;
const eipMessageReturn = Type.Function(
    [Type.Object({result: Type.Unknown()})],
    Type.Promise(Type.Unknown()),
    {description: 'Request-Reply: returns the given result'},
);

// ... one declaration per handler ...

export default validationHandlers({eipMessageReturn /*, ... */});

declare module '@feasibleone/blong' {
    interface IRemoteHandler {
        eipMessageReturn<T = ReturnType<eipMessageReturn>>(
            params: Parameters<eipMessageReturn>[0],
            $meta: IMeta,
        ): T;
    }
}
```

## Testing EIP handlers

Use **blong-mock-test** to replace downstream handler calls with mock implementations during
integration tests.

## Complete example

See `core/blong-eip/` for a working reference implementation of all 16 patterns.

## See also

- **blong-mock-test** – testing EIP handlers with mock handlers
- **blong-handler** – general handler documentation
- **blong-orchestrator** – dispatch orchestrator configuration
- [EIP patterns documentation](../../docs/blong/docs/patterns/eip) – conceptual overview
