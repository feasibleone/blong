import { v4 } from 'uuid';

import type { adapter, meta } from './adapter.js';

export default function loop(fn, handlers, context = {requests: undefined, waiting: undefined, buffer: undefined}) {
    const checkDeadlock = deadlockChecker(handlers);
    context.requests = new Map();
    context.waiting = new Set();
    context.buffer = Buffer.alloc(0);
    if (typeof fn === 'function') {
        return (params, promise) => async({signal}) => {
            const $meta = getMeta(params, handlers);
            const encodedPacket = await sendEncode(handlers, context, params, checkDeadlock);
            if (!encodedPacket) return [encodedPacket, $meta];
            const frame = await exec(handlers, fn, handlers.pack ? encodedPacket[0] : encodedPacket);
            return checkError(await decodeReceive(handlers, context, frame, checkDeadlock));
        };
    } else if (fn.readable && fn.writable) {
        function cleanup() {
            fn.removeListener('data', streamData);
            fn.removeListener('close', streamClose);
            fn.removeListener('error', streamError);
        }
        function streamClose() {
            cleanup();
            event(handlers, context, 'disconnected', handlers.log?.info);
        }
        function streamError(error) {
            handlers.error(handlers.errors['adapter.stream']({ context, error }), { method: 'adapter.pull' });
        }
        async function streamData(frame) {
            try {
                let receivedPacket = await decodeReceive(handlers, context, frame, checkDeadlock);
                while (receivedPacket) {
                    const dispatchedPacket = await dispatch(handlers, receivedPacket);
                    if (dispatchedPacket) fn?.write(dispatchedPacket);
                    receivedPacket = await decodeReceive(handlers, context, undefined, checkDeadlock);
                }
            } catch (error) {
                fn.destroy(error);
            }
        }
        fn.on('error', streamError);
        fn.on('close', streamClose);
        fn.on('data', streamData);
        handlers.config.socketTimeOut && fn.setTimeout(handlers.config.socketTimeOut, () => {
            fn.destroy(handlers.errors['handlers.socketTimeout']({params: {timeout: handlers.config.socketTimeOut}}));
        });
        return (params, promise) => async({signal}) => {
            const $meta = getMeta(params, handlers);
            const result = new Promise((resolve, reject) => {
                $meta.dispatch = (...params) => {
                    delete $meta.dispatch;
                    if ($meta.mtid !== 'error') {
                        resolve(params);
                    } else {
                        reject(params[0]);
                    }
                };
            });
            try {
                const encodedPacket = await sendEncode(handlers, context, params, checkDeadlock);
                if (!encodedPacket) return [encodedPacket, $meta];
                fn.write(handlers.pack ? encodedPacket[0] : encodedPacket);
                return result;
            } catch (error) {
                return handleError(handlers, error, $meta);
            }
        };
    }
}

function getMeta(params, handlers) {
    if (!params.length) throw handlers.errors['adapter.missingParameters']();
    else if (params.length === 1 || !params[params.length - 1]) throw handlers.errors['adapter.missingMeta']();
    const $meta = params[params.length - 1] = Object.assign({}, params[params.length - 1]);
    $meta.method = $meta.method?.split('/').pop();
    return $meta;
}

function handleError(handlers, error, $meta) {
    handlers.error(error, $meta);
    if ($meta) {
        $meta.mtid = 'error';
        $meta.errorCode = error?.code;
        $meta.errorMessage = error?.message;
    }
    return [error, $meta];
}

function checkError(dataPacket) {
    const $meta = dataPacket.length > 1 && dataPacket[dataPacket.length - 1];
    if ($meta.mtid === 'error' || dataPacket[0] instanceof Error) throw dataPacket[0];
    return dataPacket;
}

async function sendEncode(adapter: ReturnType<adapter>, context, dataPacket, checkDeadlock) {
    checkDeadlock(dataPacket);
    // send
    const $meta = dataPacket.length > 1 && dataPacket[dataPacket.length - 1];
    const validate = adapter.findValidation($meta);
    if (validate) dataPacket[0] = validate.apply(adapter, dataPacket);
    const {fn, name} = adapter.getConversion($meta, 'send');
    if (fn) {
        dataPacket[0] = await fn.apply(adapter, Array.prototype.concat(dataPacket, context));
        adapter.log?.trace?.({
            message: dataPacket,
            $meta: {method: name, mtid: 'convert'},
            ...context?.session && {log: context.session.log}
        });
    }
    // encode
    adapter.log?.debug?.({
        message: typeof dataPacket[0] === 'object' ? dataPacket[0] : {value: dataPacket[0]},
        $meta,
        ...context?.session && {log: context.session.log}
    });
    let encodeBuffer = adapter.imported.encode ? await adapter.imported.encode(dataPacket[0], $meta, context, adapter.log) : dataPacket;
    traceMeta(adapter, context, $meta, 'out/', 'in/');
    if (adapter.imported.pack) {
        const sizeAdjust = (adapter.imported.encode && adapter.imported.unpackSize) ? adapter.config.format.sizeAdjust : 0;
        encodeBuffer = adapter.imported.pack({size: encodeBuffer?.length + sizeAdjust, data: encodeBuffer});
        encodeBuffer = encodeBuffer.slice(0, encodeBuffer.length - sizeAdjust);
        adapter.bytesSent?.(encodeBuffer.length);
    }
    if (encodeBuffer) {
        adapter.msgSent?.(1);
        !adapter.imported.encode && adapter.log?.trace?.({
            $meta: {
                mtid: 'payload',
                method: $meta.method ? $meta.method + '.encode' : 'adapter.encode'
            },
            message: encodeBuffer,
            ...context?.session && {log: context.session.log}
        });
        return adapter.imported.pack ? [encodeBuffer, $meta] : encodeBuffer;
    }
    return [encodeBuffer, $meta];
}

function traceMeta(adapter: ReturnType<adapter>, context, $meta, set, get, time?) {
    // if ($meta && !$meta.timer && $meta.mtid === 'request') {
    //     $meta.timer = packetTimer(adapter.bus.getPath($meta.method), '*', adapter.config.id, $meta.timeout);
    // }
    if ($meta?.trace && context) {
        if ($meta.mtid === 'request') { // todo improve what needs to be tracked
            context.requests.set(set + $meta.trace, {
                $meta
                // end: !time && timeoutManager.startRequest($meta, adapter.errors['adapter.timeout'], error => {
                //     context.requests.delete(set + $meta.trace);
                //     $meta.mtid = 'error';
                //     $meta.dispatch && $meta.dispatch(error, $meta);
                // })
            });
            return $meta;
        } else if ($meta.mtid === 'response' || $meta.mtid === 'error') {
            const request = context.requests.get(get + $meta.trace);
            if (request) {
                context.requests.delete(get + $meta.trace);
                request.end?.();
                request.$meta?.timer && time && request.$meta.timer('exec', time);
                return Object.assign(request.$meta, $meta);
            } else {
                return $meta;
            }
        }
    } else {
        return $meta;
    }
}

async function exec(adapter: ReturnType<adapter>, fn, execPacket) {
    const $meta = execPacket.length > 1 && execPacket[execPacket.length - 1];
    if ($meta?.mtid === 'request') $meta.mtid = 'response';
    if ($meta?.mtid === 'notification') $meta.mtid = 'discard';
    try {
        return [await fn.apply(adapter, execPacket), $meta];
    } catch (error) {
        return handleError(adapter, error, $meta);
    }
}

function getFrame(adapter: ReturnType<adapter>, buffer) {
    let result;
    let size;
    if (adapter.imported.unpackSize) {
        const tmp = adapter.imported.unpackSize(buffer);
        if (tmp) {
            size = tmp.size;
            result = adapter.imported.unpack(tmp.data, {size: tmp.size - adapter.config.format.sizeAdjust});
        } else {
            result = false;
        }
    } else {
        result = adapter.imported.unpack(buffer);
    }
    if (adapter.config.maxReceiveBuffer) {
        if (!result && buffer.length > adapter.config.maxReceiveBuffer) {
            throw adapter.errors['adapter.bufferOverflow']({params: {max: adapter.config.maxReceiveBuffer, size: buffer.length}});
        }
        if (!result && size > adapter.config.maxReceiveBuffer) { // fail early
            throw adapter.errors['adapter.bufferOverflow']({params: {max: adapter.config.maxReceiveBuffer, size}});
        }
    }
    return result;
}

const metaFromContext = (context, rest?) => ({
    ...context && {
        conId: context.conId
    },
    forward: {
        'x-b3-traceid': v4().replace(/-/g, '')
    },
    ...rest
});

function deadlockChecker(adapter: ReturnType<adapter>) {
    const stackId = '->' + (adapter.config.stackId || adapter.config.id) + '(';
    const extendStack = adapter.config.debug
        ? (stack, method) => stack + stackId + method + ')'
        : (stack) => stack + stackId + ')';
    const {noRecursion} = adapter.config;
    let observe;
    switch (noRecursion) {
        case 'trace':
        case 'debug':
        case 'info':
        case 'warn': {
            observe = (error, params) => {
                adapter.log?.[noRecursion]?.(adapter.errors[error]({params}));
                return true;
            };
            break;
        }
        case 'error':
        case true:
            observe = (error, params) => {
                throw adapter.errors[error]({params});
            };
            break;
        default:
            observe = () => true;
            break;
    }
    return packet => {
        const $meta = packet?.length > 1 && packet[packet.length - 1];
        if (!$meta) return observe('adapter.noMeta');
        if ($meta.mtid !== 'request' && $meta.mtid !== 'notification') return true;
        if (!$meta.forward) return observe('adapter.noMetaForward', {method: $meta.method});
        const stack = $meta.forward['x-ut-stack'];
        if (!stack && !noRecursion) return true;
        const traceId = $meta.forward['x-b3-traceid'];
        if (!traceId) return observe('adapter.noTraceId', {method: $meta.method});
        if (!stack && noRecursion) {
            $meta.forward['x-ut-stack'] = extendStack('', $meta.method);
            return true;
        }
        if (stack.indexOf(stackId) < 0) {
            $meta.forward['x-ut-stack'] = extendStack(stack, $meta.method);
            return true;
        }
        return observe('adapter.deadlock', {method: $meta.method, traceId, sequence: extendStack(stack, $meta.method)});
    };
}

async function decodeReceive(adapter: ReturnType<adapter>, context, dataPacket, checkDeadlock) {
    // frame
    if (adapter.imported.unpack) {
        if (dataPacket) {
            adapter.bytesReceived?.(dataPacket.length);
            !adapter.imported.decode && adapter.log?.trace?.({
                $meta: { mtid: 'payload', method: 'adapter.decode' },
                message: dataPacket,
                ...context?.session && { log: context.session.log }
            });
            // todo check buffer size
            context.buffer = Buffer.concat([context.buffer, dataPacket]);
        }
        const frame = getFrame(adapter, context.buffer);
        if (frame) {
            context.buffer = frame.rest;
            dataPacket = frame.data;
        } else return;
    }
    // decode
    const time = false; // timing.now();
    adapter.msgReceived?.(1);
    if (adapter.imported.decode) {
        const $meta = metaFromContext(context);
        try {
            dataPacket = [await adapter.imported.decode(dataPacket, $meta, context, adapter.log), traceMeta(adapter, context, $meta, 'in/', 'out/', time)];
        } catch (decodeError) {
            $meta.mtid = 'error';
            if (!decodeError || !decodeError.keepConnection) {
                throw adapter.errors['adapter.disconnect'](decodeError);
            } else {
                dataPacket = [decodeError, $meta];
            }
        }
    } else if (dataPacket?.constructor?.name === 'Buffer') {
        dataPacket = [{payload: dataPacket}, metaFromContext(context, {mtid: 'notification', opcode: 'payload'})];
    } else {
        const $meta = (dataPacket.length > 1) && dataPacket[dataPacket.length - 1];
        $meta && context?.conId && ($meta.conId = context.conId);
        (dataPacket.length > 1) && (dataPacket[dataPacket.length - 1] = traceMeta(adapter, context, $meta, 'in/', 'out/', time));
    }
    checkDeadlock(dataPacket);
    return await receive(adapter, context, dataPacket);
}

async function receive(adapter: ReturnType<adapter>, context, dataPacket) {
    const $meta = dataPacket.length > 1 && dataPacket[dataPacket.length - 1];
    try {
        const {fn, name} = adapter.getConversion($meta, 'receive');
        if (fn) {
            dataPacket[0] = await fn.apply(adapter, Array.prototype.concat(dataPacket, context));
            adapter.log?.trace?.({
                message: dataPacket,
                $meta: { method: name, mtid: 'convert' },
                ...context?.session && { log: context.session.log }
            });
        }
        const validate = adapter.findValidation($meta);
        if (validate) dataPacket[0] = validate.apply(adapter, dataPacket);
        return dataPacket;
    } catch (error) {
        return handleError(adapter, error, $meta);
    }
}

const CONNECTED = Symbol('adapter.pull.CONNECTED');

async function dispatch(adapter: ReturnType<adapter>, dispatchPacket) {
    const $meta = (dispatchPacket.length > 1 && dispatchPacket[dispatchPacket.length - 1]) || {};
    if ($meta.dispatch) {
        // reportTimes(adapter, $meta);
        return $meta.dispatch.apply(adapter, dispatchPacket);
    }
    if (!dispatchPacket || !dispatchPacket[0]) {
        return;
    }
    if (dispatchPacket[0] === CONNECTED) {
        return;
    }
    const mtid = $meta.mtid;
    const opcode = $meta.opcode;
    const method = $meta.method;

    const portDispatchResult = (isError, dispatchResult) => {
        const $metaResult = (!isError && dispatchResult.length > 1 && dispatchResult[dispatchResult.length - 1]) || {};
        if (mtid === 'request' && $metaResult.mtid !== 'discard') {
            if (!$metaResult.opcode) $metaResult.opcode = opcode;
            if (!$metaResult.method) $metaResult.method = method;
            $metaResult.mtid = isError ? 'error' : 'response';
            $metaResult.reply = $meta.reply;
            $metaResult.timer = $meta.timer;
            $metaResult.dispatch = $meta.dispatch;
            $metaResult.trace = $meta.trace;
            if ($meta.request) $metaResult.request = $meta.request;
            if (isError) {
                adapter.error(dispatchResult, $meta);
                return [dispatchResult, $metaResult];
            } else {
                return dispatchResult;
            }
        }
    };

    if (mtid === 'error') {
        if (adapter.config.disconnectOnError) {
            throw adapter.errors['adapter.unhandled'](dispatchPacket[0]);
        } else {
            return dispatchPacket;
        }
    }

    let result;
    try {
        result = await adapter.dispatch(...dispatchPacket);
    } catch (error) {
        return portDispatchResult(true, error);
    }
    return portDispatchResult(false, result);
}

async function event(adapter: ReturnType<adapter>, context, event, logger, stream?) {
    context && (typeof logger === 'function') && logger({
        $meta: {mtid: 'event', method: 'adapter.' + event},
        connection: context,
        ...context && context.session && {log: context.session.log}
    });
    if (event === 'disconnected') {
        if (context && context.requests && context.requests.size) {
            Array.from(context.requests.values()).forEach((request: {$meta: meta}) => {
                request.$meta.mtid = 'error';
                request.$meta.dispatch && request.$meta.dispatch(adapter.errors['adapter.disconnectBeforeResponse'](), request.$meta);
            });
            context.requests.clear();
        }
        if (context?.waiting?.size) {
            Array.from(context.waiting.values()).forEach((end: (error: Error) => void) => {
                end(adapter.errors['adapter.disconnectBeforeResponse']());
            });
        }
    }
    const decodedPacket = [undefined, {
        mtid: 'event',
        method: event,
        conId: context && context.conId,
        // timer: packetTimer('event.' + event, false, adapter.config.id),
        forward: {
            'x-b3-traceid': v4().replace(/-/g, ''),
            'x-ut-stack': undefined
        }
    }];

    const receivedPacket = await receive(adapter, context, decodedPacket);
    const dispatchedPacket = await dispatch(adapter, receivedPacket);
    if (dispatchedPacket) stream?.write(dispatchedPacket);
}

// todo drain on connect
// todo timing
// todo packet tracing
// todo abort signal
