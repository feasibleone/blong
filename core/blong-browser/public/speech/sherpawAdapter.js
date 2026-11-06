/**
 * sherpawAdapter.js — a browser runtime for the feedback mode's sherpa engine
 * (`@@T-612`, `@@D-758`, `@@D-760`).
 *
 * The mode's engines talk to one contract: `createOnlineRecognizer(config)` where
 * `config` carries the four model URLs, and the answer has `createStream`,
 * `isReady`, `decode`, `isEndpoint`, `reset` and `getResult`. This file is that
 * contract in the browser, on top of **sherpaw** — a WebAssembly build of
 * sherpa-onnx published as ES modules with its own `asr.wasm`, so a page needs no
 * server and no build step.
 *
 * Why not the npm `sherpa-onnx` package: it is the Node build. It requires
 * `sherpa-onnx-wasm-nodejs.js` and reads model files through `fs`, and a browser
 * importing it throws `NODERAWFS is currently only supported on Node.js
 * environment`. sherpaw's build takes its model files from the WebAssembly
 * filesystem, which is why the four URLs are written into it here.
 *
 * Loaded as `import('http://…/speech/sherpawAdapter.js')` — see the
 * `Components/Feedback/Sherpa` story, which does exactly that with the published
 * Bulgarian Zipformer.
 */

/**
 * The runtime, from jsDelivr: the package's own entry, so its relative imports
 * and its `new URL('./prebuilt/asr.wasm', import.meta.url)` resolve on the CDN.
 * The `+esm` bundle of the same package would inline the module and leave that
 * `import.meta.url` pointing at a rewritten file, which loses the wasm.
 */
const RUNTIME = 'https://cdn.jsdelivr.net/npm/@sherpaw/asr@0.3.0/dist/index.js';

/** Long-lived: the module is 13.8 MB and the wasm heap is shared by every box. */
let apiPromise;
let modulePromise;

/** The URLs already written into the filesystem, by URL. */
const written = new Map();

async function runtime() {
    apiPromise ??= import(/* @vite-ignore */ RUNTIME);
    const api = await apiPromise;
    modulePromise ??= api.initASRModule();
    const module = await modulePromise;
    return {api, module};
}

/**
 * Put one model file into the WebAssembly filesystem and answer its path.
 *
 * The name is the engine's, not the URL's, so a second recogniser built from a
 * different model replaces the files instead of colliding with them. A freed
 * name is unlinked first, because `FS_createDataFile` refuses an existing path.
 */
async function materialize(module, url, name) {
    const known = written.get(url);
    if (known) return known;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${name}: ${response.status} ${response.statusText} — ${url}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    try {
        module.FS_createDataFile('/', name, bytes, true, false);
    } catch {
        module.FS_unlink?.(`/${name}`);
        module.FS_createDataFile('/', name, bytes, true, false);
    }
    const path = `/${name}`;
    written.set(url, path);
    return path;
}

/**
 * The contract the feedback mode's `sherpa` engine calls.
 *
 * `config` is sherpa's own shape — `featConfig`, `modelConfig.transducer`,
 * `modelConfig.tokens`, `decodingMethod` — with the difference that the file
 * fields are **URLs**, which is what a portal deployment can carry.
 */
export async function createOnlineRecognizer(config) {
    const {api, module} = await runtime();
    const model = config?.modelConfig ?? {};
    const transducer = model.transducer ?? {};

    const [encoder, decoder, joiner, tokens] = await Promise.all([
        materialize(module, transducer.encoder, 'speech-encoder.onnx'),
        materialize(module, transducer.decoder, 'speech-decoder.onnx'),
        materialize(module, transducer.joiner, 'speech-joiner.onnx'),
        materialize(module, model.tokens, 'speech-tokens.txt'),
    ]);

    const recognizer = api.createOnlineRecognizer(
        module,
        api.createOnlineRecognizerConfig(api.OnlineRecognizerTypes.Transducer, {
            featConfig: {
                sampleRate: config?.featConfig?.sampleRate ?? 16000,
                featureDim: config?.featConfig?.featureDim ?? 80,
            },
            modelConfig: {
                transducer: {encoder, decoder, joiner},
                tokens,
                numThreads: model.numThreads ?? 1,
                provider: model.provider ?? 'cpu',
                debug: model.debug ?? 0,
            },
            decodingMethod: config?.decodingMethod ?? 'greedy_search',
            maxActivePaths: config?.maxActivePaths ?? 4,
        }),
    );

    // The recogniser already answers with the six methods the engine calls, so
    // this forwards rather than wraps: `recognizer.getResult(stream).text` is the
    // shape both sides agree on.
    return {
        createStream: () => recognizer.createStream(),
        isReady: stream => recognizer.isReady(stream),
        decode: stream => recognizer.decode(stream),
        isEndpoint: stream => recognizer.isEndpoint(stream),
        reset: stream => recognizer.reset(stream),
        getResult: stream => recognizer.getResult(stream),
    };
}
