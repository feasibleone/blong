import {validationHandlers} from '@feasibleone/blong';
import {Type, type Static} from 'typebox';

// EIP pattern handler signatures
type eipMessageReturn = Static<typeof eipMessageReturn>;
const eipMessageReturn = Type.Function(
    [Type.Object({result: Type.Unknown()})],
    Type.Promise(Type.Unknown()),
    {description: 'Request-Reply: returns the given result'},
);

type eipMessagePipes = Static<typeof eipMessagePipes>;
const eipMessagePipes = Type.Function([Type.Object({})], Type.Promise(Type.Unknown()), {
    description: 'Pipes and Filters: passes message through handler A then handler B',
});

type eipMessageRoute = Static<typeof eipMessageRoute>;
const eipMessageRoute = Type.Function(
    [Type.Object({destination: Type.String()}, {additionalProperties: Type.Unknown()})],
    Type.Promise(Type.Unknown()),
    {description: 'Content Based Router: routes to handler A or B based on destination'},
);

type eipMessageDynamic = Static<typeof eipMessageDynamic>;
const eipMessageDynamic = Type.Function(
    [Type.Object({destination: Type.String()}, {additionalProperties: Type.Unknown()})],
    Type.Promise(Type.Unknown()),
    {description: 'Dynamic Router: routes to a handler by dynamic name'},
);

type eipMessageFilter = Static<typeof eipMessageFilter>;
const eipMessageFilter = Type.Function(
    [Type.Object({condition: Type.Boolean()}, {additionalProperties: Type.Unknown()})],
    Type.Promise(Type.Unknown()),
    {description: 'Message Filter: passes message only if condition is true'},
);

type eipMessageRecipient = Static<typeof eipMessageRecipient>;
const eipMessageRecipient = Type.Function(
    [Type.Object({sequential: Type.Optional(Type.Boolean())}, {additionalProperties: Type.Unknown()})],
    Type.Promise(Type.Array(Type.Unknown())),
    {description: 'Recipient List: sends to both handler A and B (parallel or sequential)'},
);

type eipMessageSplit = Static<typeof eipMessageSplit>;
const eipMessageSplit = Type.Function(
    [Type.Object({items: Type.Array(Type.Unknown()), sequential: Type.Optional(Type.Boolean())})],
    Type.Promise(Type.Array(Type.Unknown())),
    {description: 'Splitter: processes each item via mockItemProcess (parallel or sequential)'},
);

type eipMessageAggregate = Static<typeof eipMessageAggregate>;
const eipMessageAggregate = Type.Function([Type.Object({})], Type.Promise(Type.Unknown()), {
    description: 'Aggregator: collects messages until batch size (3), then stores',
});

type eipMessageSort = Static<typeof eipMessageSort>;
const eipMessageSort = Type.Function(
    [Type.Object({order: Type.Number()}, {additionalProperties: Type.Unknown()})],
    Type.Promise(Type.Array(Type.Unknown())),
    {description: 'Resequencer: collects messages until batch size (3), sorts by order'},
);

type eipMessageCompose = Static<typeof eipMessageCompose>;
const eipMessageCompose = Type.Function(
    [Type.Object({part1: Type.Unknown(), part2: Type.Unknown()})],
    Type.Promise(Type.Unknown()),
    {description: 'Composer: calls handler A with part1 and handler B with part2, merges results'},
);

type eipMessageScatter = Static<typeof eipMessageScatter>;
const eipMessageScatter = Type.Function(
    [Type.Object({destinations: Type.Array(Type.String())}, {additionalProperties: Type.Unknown()})],
    Type.Promise(Type.Array(Type.Unknown())),
    {description: 'Scatter Gatherer: calls each destination handler and collects results'},
);

type eipMessageWrap = Static<typeof eipMessageWrap>;
const eipMessageWrap = Type.Function([Type.Object({})], Type.Promise(Type.Unknown()), {
    description: 'Envelope Wrapper: wraps params in base64 payload, calls mockItemProcess',
});

type eipMessageEnrich = Static<typeof eipMessageEnrich>;
const eipMessageEnrich = Type.Function([Type.Object({})], Type.Promise(Type.Unknown()), {
    description: 'Content Enricher: fetches enrichment data and augments params before processing',
});

type eipMessageSimplify = Static<typeof eipMessageSimplify>;
const eipMessageSimplify = Type.Function(
    [Type.Object({skip: Type.Optional(Type.Unknown())}, {additionalProperties: Type.Unknown()})],
    Type.Promise(Type.Unknown()),
    {description: 'Content Filter: removes the skip field before calling mockItemProcess'},
);

type eipMessageClaim = Static<typeof eipMessageClaim>;
const eipMessageClaim = Type.Function([Type.Object({})], Type.Promise(Type.Unknown()), {
    description: 'Claim Check: stores data and retrieves it by ID',
});

type eipMessageNormalize = Static<typeof eipMessageNormalize>;
const eipMessageNormalize = Type.Function(
    [Type.Object({format: Type.String(), value: Type.Unknown()})],
    Type.Promise(Type.Unknown()),
    {description: 'Normalizer: normalizes value by format before calling mockItemProcess'},
);

export default validationHandlers({
    eipMessageReturn,
    eipMessagePipes,
    eipMessageRoute,
    eipMessageDynamic,
    eipMessageFilter,
    eipMessageRecipient,
    eipMessageSplit,
    eipMessageAggregate,
    eipMessageSort,
    eipMessageCompose,
    eipMessageScatter,
    eipMessageWrap,
    eipMessageEnrich,
    eipMessageSimplify,
    eipMessageClaim,
    eipMessageNormalize,
});

declare module '@feasibleone/blong' {
    interface ISchema {
        eipMessageReturn<T = ReturnType<eipMessageReturn>>(
            params: Parameters<eipMessageReturn>[0],
            $meta: IMeta,
        ): T;
        eipMessagePipes<T = ReturnType<eipMessagePipes>>(
            params: Parameters<eipMessagePipes>[0],
            $meta: IMeta,
        ): T;
        eipMessageRoute<T = ReturnType<eipMessageRoute>>(
            params: Parameters<eipMessageRoute>[0] & {[key: string]: unknown},
            $meta: IMeta,
        ): T;
        eipMessageDynamic<T = ReturnType<eipMessageDynamic>>(
            params: Parameters<eipMessageDynamic>[0] & {[key: string]: unknown},
            $meta: IMeta,
        ): T;
        eipMessageFilter<T = ReturnType<eipMessageFilter>>(
            params: Parameters<eipMessageFilter>[0] & {[key: string]: unknown},
            $meta: IMeta,
        ): T;
        eipMessageRecipient<T = ReturnType<eipMessageRecipient>>(
            params: Parameters<eipMessageRecipient>[0] & {[key: string]: unknown},
            $meta: IMeta,
        ): T;
        eipMessageSplit<T = ReturnType<eipMessageSplit>>(
            params: Parameters<eipMessageSplit>[0],
            $meta: IMeta,
        ): T;
        eipMessageAggregate<T = ReturnType<eipMessageAggregate>>(
            params: Parameters<eipMessageAggregate>[0],
            $meta: IMeta,
        ): T;
        eipMessageSort<T = ReturnType<eipMessageSort>>(
            params: Parameters<eipMessageSort>[0] & {[key: string]: unknown},
            $meta: IMeta,
        ): T;
        eipMessageCompose<T = ReturnType<eipMessageCompose>>(
            params: Parameters<eipMessageCompose>[0],
            $meta: IMeta,
        ): T;
        eipMessageScatter<T = ReturnType<eipMessageScatter>>(
            params: Parameters<eipMessageScatter>[0] & {[key: string]: unknown},
            $meta: IMeta,
        ): T;
        eipMessageWrap<T = ReturnType<eipMessageWrap>>(
            params: Parameters<eipMessageWrap>[0],
            $meta: IMeta,
        ): T;
        eipMessageEnrich<T = ReturnType<eipMessageEnrich>>(
            params: Parameters<eipMessageEnrich>[0],
            $meta: IMeta,
        ): T;
        eipMessageSimplify<T = ReturnType<eipMessageSimplify>>(
            params: Parameters<eipMessageSimplify>[0] & {[key: string]: unknown},
            $meta: IMeta,
        ): T;
        eipMessageClaim<T = ReturnType<eipMessageClaim>>(
            params: Parameters<eipMessageClaim>[0],
            $meta: IMeta,
        ): T;
        eipMessageNormalize<T = ReturnType<eipMessageNormalize>>(
            params: Parameters<eipMessageNormalize>[0],
            $meta: IMeta,
        ): T;
    }
}
