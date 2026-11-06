/**
 * Feedback mode stories (`@@T-475`).
 *
 * The mode is a global overlay over an application, so the stories build one: a
 * small page of annotated boxes, the mode switched on, and the store cleaned up on
 * unmount so one story never bleeds into the next.
 *
 * What they show that a unit test cannot: the hover ring and the callouts are
 * geometry over a real page, so the shape of several boxes avoiding each other is
 * something to look at.
 */
import type {Meta, StoryObj} from '@storybook/react-vite';
import {useEffect, useMemo, useState, type ReactNode} from 'react';

import {useAppStore} from '../state/appStore.js';
import type {IFeedbackSpeechConfig} from '../types/portal.js';
import {FeedbackCallout} from './FeedbackCallout.js';
import {FeedbackOutline} from './FeedbackOutline.js';
import {FeedbackSubmitBar} from './FeedbackSubmitBar.js';
import {FeedbackToggle} from './FeedbackToggle.js';
import './feedback.css';
import {installSpeechEnvironment, type ISherpaModule} from './speech.js';
import {speechStop} from './useFeedbackSpeech.js';
import {FeedbackPageContext} from './useFeedbackTarget.js';

// ── Meta ───────────────────────────────────────────────────────────────────

const meta: Meta = {
    title: 'Components/Feedback',
    parameters: {layout: 'fullscreen'},
};
export default meta;

type Story = StoryObj<typeof meta>;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Seed the store as the stories need it and restore it on unmount.
 *
 * `feedback.enabled` lives in the merged portal config, which is what the toggle
 * reads — a story that only set the store flag would render no switch.
 */
function FeedbackSetup({
    active,
    items = {},
    speech,
    children,
}: {
    active: boolean;
    items?: Record<string, unknown>;
    /** Dictation in the callouts; `undefined` means the portal has no microphone. */
    speech?: IFeedbackSpeechConfig;
    children?: ReactNode;
}) {
    useEffect(() => {
        const previous = useAppStore.getState();
        useAppStore.setState({
            feedback: {active, items: items as never},
            portal: {
                ...previous.portal,
                portalConfig: {
                    name: 'storybook',
                    title: 'Feedback',
                    feedback: {enabled: true, ...(speech && {speech})},
                },
            },
        });
        return () => {
            useAppStore.setState({
                feedback: {active: false, items: {}},
                portal: {...previous.portal, portalConfig: previous.portal.portalConfig},
            });
        };
    }, [active, items, speech]);

    return (
        <FeedbackPageContext value={{subject: 'marine', object: 'coral', page: 'browse'}}>
            <div style={{padding: 24, display: 'grid', gap: 12, maxWidth: 520}}>
                <div style={{display: 'flex', justifyContent: 'flex-end'}}>
                    <FeedbackToggle />
                </div>
                <h3
                    data-feedback-id="marine.coral.browse/label"
                    data-feedback-kind="label"
                    data-feedback-label="Coral register"
                >
                    Coral register
                </h3>
                <div
                    data-feedback-id="marine.coral.browse/card:master"
                    data-feedback-kind="card"
                    data-feedback-label="Master"
                    style={{border: '1px solid #888', padding: 12, borderRadius: 4}}
                >
                    The card the comments below are about.
                </div>
                <div
                    data-feedback-id="marine.coral.browse/card:master/field:coral.coralName"
                    data-feedback-kind="field"
                    data-feedback-label="Name"
                    style={{border: '1px dashed #888', padding: 8}}
                >
                    Name field
                </div>
                {children}
            </div>
        </FeedbackPageContext>
    );
}

const twoItems = {
    'marine.coral.browse/card:master': {
        targetId: 'marine.coral.browse/card:master',
        targetKind: 'card',
        targetLabel: 'Master',
        commentText: 'This card is cut off at the bottom.',
    },
    'marine.coral.browse/card:master/field:coral.coralName': {
        targetId: 'marine.coral.browse/card:master/field:coral.coralName',
        targetKind: 'field',
        targetLabel: 'Name',
        commentText: 'The label says Name but it holds the species.',
    },
};

// ── Stories ────────────────────────────────────────────────────────────────

/** The mode off: the switch is in the menubar and nothing is painted. */
export const Inactive: Story = {
    render: () => <FeedbackSetup active={false} />,
};

/** The mode on with an empty draft: hovering a box paints it. */
export const Active: Story = {
    render: () => <FeedbackSetup active={true} />,
};

/** Two comments, each in its own callout, avoiding each other. */
export const Callouts: Story = {
    render: () => (
        <FeedbackSetup
            active={true}
            items={twoItems}
        />
    ),
};

/** The submit bar on its own, with a count in it. */
export const SubmitBar: Story = {
    render: () => (
        <FeedbackSubmitBar
            count={2}
            busy={false}
            cropping={false}
            cropped={false}
            onCrop={() => undefined}
            onSubmit={() => undefined}
            onDiscard={() => undefined}
        />
    ),
};

/** One callout on its own, at a fixed position. */
export const Callout: Story = {
    render: () => (
        <FeedbackCallout
            targetId="marine.coral.browse/table:corals/column:coralName"
            box={{x: 24, y: 24, width: 268, height: 172}}
            comment="The header wraps and cuts the text."
            onChange={() => undefined}
            onRemove={() => undefined}
            onMove={() => undefined}
            onResize={() => undefined}
        />
    ),
};

/**
 * One callout dictating, at fixed props (`@@D-758`).
 *
 * What a story can show that a test cannot: the pulsing microphone in the bevel,
 * the phrase being recognised drawn as a caption under the text the person
 * already owns, the two buttons that settle that phrase before the engine does
 * (`D-764`), and the switches under it (`D-763`).
 */
export const DictationCallout: Story = {
    render: () => (
        <FeedbackCallout
            targetId="marine.coral.browse/table:corals/column:coralName"
            box={{x: 24, y: 24, width: 268, height: 196}}
            comment="The header wraps and cuts the"
            speechAvailable={true}
            speechEngine="webSpeech"
            listening={true}
            interimText="species name in the second column of the table"
            level="speech"
            waitMs={8000}
            idle={2}
            onChange={() => undefined}
            onRemove={() => undefined}
            onMove={() => undefined}
            onResize={() => undefined}
            onListen={() => undefined}
            onToggleListen={() => undefined}
            onAcceptInterim={() => undefined}
            onClearInterim={() => undefined}
        />
    ),
};

/** One object, so the page's setup effect is not re-run on every render. */
const WEB_SPEECH: IFeedbackSpeechConfig = {engine: 'webSpeech'};

/**
 * The mode over a live page, with dictation on (`@@D-758`) — the story to try.
 *
 * Click the card or the name field and speak. Where the microphone is already
 * granted for this origin the new box starts listening by itself, and the first
 * time the microphone button in its bevel is what asks for permission. What the
 * engine has not finished hearing is drawn under the text and is replaced as it
 * is refined; a phrase that finishes is appended to the comment.
 *
 * Nothing here mounts the overlay: the package's decorator wraps every story in
 * `<App>`, which is what mounts `FeedbackLayer`, so turning the mode on in the
 * store is all this story has to do — and a second layer of its own would draw
 * every box and every submit bar twice.
 */
export const Dictation: Story = {
    render: () => (
        <FeedbackSetup
            active={true}
            speech={WEB_SPEECH}
        />
    ),
};

// ── sherpa, against the real model ─────────────────────────────────────────

/**
 * The model files the bench is wired to: a Bulgarian streaming Zipformer,
 * int8-quantised, published for sherpa-onnx (`@@T-612`).
 *
 * The encoder alone is 72.8 MB and the decoder, joiner and tokens add 0.8 MB, so
 * the whole download is about 73.6 MB. Hugging Face answers with
 * `access-control-allow-origin: *`, which is what makes the fetch possible from a
 * page at all.
 */
const BULGARIAN_MODEL = 'https://huggingface.co/preslaff/bulgarian-asr-zipformer/resolve/main/';

const MODEL_FILES = {
    encoder: `${BULGARIAN_MODEL}encoder-epoch-40-avg-8.int8.onnx`,
    decoder: `${BULGARIAN_MODEL}decoder-epoch-40-avg-8.int8.onnx`,
    joiner: `${BULGARIAN_MODEL}joiner-epoch-40-avg-8.int8.onnx`,
    tokens: `${BULGARIAN_MODEL}tokens.txt`,
};

interface IModelProbe {
    name: string;
    status: string;
    bytes: number;
}

/** Bytes as a person reads them, in the decimal megabytes a download shows. */
function megabytes(bytes: number): string {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** One panel row: a label above an input. */
function BenchField({
    label,
    value,
    onChange,
    placeholder,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}) {
    return (
        <label style={{display: 'grid', gap: 2}}>
            <span style={{opacity: 0.7}}>{label}</span>
            <input
                value={value}
                placeholder={placeholder}
                onChange={event => onChange(event.target.value)}
                spellCheck={false}
                style={{fontFamily: 'ui-monospace, monospace', fontSize: '0.68rem', padding: 2}}
            />
        </label>
    );
}

/**
 * The sherpa engine, against the real model — the story to test it in
 * (`@@D-758`, `@@T-612`).
 *
 * The model is not the problem: 73.6 MB over the network is a `fetch`. The
 * **runtime** is. `sherpa-onnx` on npm is the Node build — it requires
 * `sherpa-onnx-wasm-nodejs.js` and reads the model files with `fs` — so a browser
 * cannot import it, and the browser build ships as static JS + WASM + `.data`
 * files rather than an ES module. So the bench takes the runtime as a **URL**:
 * any ES module that exports `createOnlineRecognizer(config)` and returns a
 * recogniser with `createStream` / `isReady` / `decode` / `isEndpoint` / `reset` /
 * `getResult` fits, whether you build it around the official
 * `sherpa-onnx-wasm-main-asr.js` bundle or around another browser wrapper.
 *
 * `Check the model` fetches nothing but the headers, and is the honest answer to
 * "is the 73 MB reachable from here". `Start dictation` imports the runtime for
 * real, hands the four model URLs to it, and turns the mode on — then a click on
 * the card or the name field listens through the actual engine, with the phrase
 * under way drawn under the text as it is refined.
 */
function SherpaBench() {
    // The adapter this repository serves from Storybook's static directory: a
    // browser build of sherpa-onnx (`public/speech/sherpawAdapter.js`), so the
    // bench works out of the box. Paste another module URL to try a different
    // runtime — that is the whole contract.
    const [runtimeUrl, setRuntimeUrl] = useState(
        () => new URL('speech/sherpawAdapter.js', document.baseURI).href,
    );
    const [files, setFiles] = useState(MODEL_FILES);
    const [probe, setProbe] = useState<IModelProbe[]>([]);
    const [status, setStatus] = useState('The runtime is not loaded yet.');
    const [armed, setArmed] = useState(false);

    const speech = useMemo<IFeedbackSpeechConfig>(
        () => ({
            engine: 'sherpa',
            sherpa: {...files, ...(runtimeUrl.trim() && {module: runtimeUrl.trim()})},
        }),
        [files, runtimeUrl],
    );

    // A story is a page: leaving it must put the browser's own APIs back and
    // close a microphone it opened.
    useEffect(
        () => () => {
            speechStop();
            installSpeechEnvironment(undefined);
        },
        [],
    );

    const checkModel = async () => {
        setStatus('Asking each file for its size…');
        const rows = await Promise.all(
            Object.entries(files).map(async ([name, url]): Promise<IModelProbe> => {
                try {
                    // One byte, then the body is dropped: the size is what the
                    // bench needs, and a range read is also the thing to prove —
                    // a server that refuses ranges cannot stream a model into the
                    // runtime either. Dropping the body is this button's own
                    // abort, so the browser's request log shows it as a cancelled
                    // request; nothing failed. `HEAD` is not used because Hugging
                    // Face redirects it to its CDN, which leaves no size to read.
                    const answer = await fetch(url, {headers: {Range: 'bytes=0-0'}});
                    const range = answer.headers.get('content-range');
                    const bytes = Number(
                        range?.split('/').at(-1) ?? answer.headers.get('content-length') ?? 0,
                    );
                    await answer.body?.cancel();
                    return {name, status: `${answer.status} ${answer.statusText}`, bytes};
                } catch (error) {
                    return {
                        name,
                        status: `blocked: ${(error as Error).message}`,
                        bytes: 0,
                    };
                }
            }),
        );
        setProbe(rows);
        const total = rows.reduce((sum, row) => sum + row.bytes, 0);
        setStatus(
            rows.every(row => row.bytes)
                ? `All four files are reachable — ${megabytes(total)} in total.`
                : 'At least one file is out of reach, so the runtime will not start.',
        );
    };

    const start = async () => {
        const url = runtimeUrl.trim();
        if (!url) {
            setStatus(
                'Paste the URL of an ES module that exports createOnlineRecognizer; the npm ' +
                    'sherpa-onnx package is the Node build and will not load here.',
            );
            return;
        }
        // The import is the whole point of the bench: it is started before the
        // mode comes on, so a broken URL reports itself here rather than as a
        // silent box.
        const loaded = import(/* @vite-ignore */ url).then(module => {
            const candidate = module as {createOnlineRecognizer?: unknown; default?: unknown};
            const runtime = (
                'createOnlineRecognizer' in candidate ? candidate : candidate.default
            ) as ISherpaModule | undefined;
            if (!runtime?.createOnlineRecognizer) {
                throw new Error(`${url} exports no createOnlineRecognizer`);
            }
            return runtime;
        });
        installSpeechEnvironment({loadModule: () => loaded});
        setStatus(`Loading the runtime from ${url}…`);
        try {
            await loaded;
            setArmed(true);
            setStatus(
                'Runtime ready. Click the card or the name field: the recording starts ' +
                    'there, and the model downloads on the first phrase.',
            );
        } catch (error) {
            setStatus(`The runtime did not load: ${(error as Error).message}`);
        }
    };

    return (
        <>
            <FeedbackSetup
                active={armed}
                speech={speech}
            />
            {/* The mode's guard swallows clicks outside its own chrome, so the
                panel says it is chrome — `data-feedback-ui` is what lets a
                button in here still be a button while the mode is on. */}
            <div
                data-feedback-ui="sherpa-bench"
                style={{
                    position: 'fixed',
                    top: 16,
                    right: 16,
                    width: 380,
                    zIndex: 1200,
                    display: 'grid',
                    gap: 8,
                    padding: 12,
                    fontSize: '0.72rem',
                    color: '#111827',
                    background: '#fff',
                    border: '1px solid #6366f1',
                    borderRadius: 6,
                    boxShadow: '0 6px 18px rgb(0 0 0 / 25%)',
                }}
            >
                <strong>sherpa-onnx bench</strong>
                <BenchField
                    label="Runtime ES module (exports createOnlineRecognizer)"
                    value={runtimeUrl}
                    onChange={setRuntimeUrl}
                    placeholder="https://…/sherpa-browser-adapter.js"
                />
                <BenchField
                    label="Encoder"
                    value={files.encoder}
                    onChange={encoder => setFiles(previous => ({...previous, encoder}))}
                />
                <BenchField
                    label="Decoder"
                    value={files.decoder}
                    onChange={decoder => setFiles(previous => ({...previous, decoder}))}
                />
                <BenchField
                    label="Joiner"
                    value={files.joiner}
                    onChange={joiner => setFiles(previous => ({...previous, joiner}))}
                />
                <BenchField
                    label="Tokens"
                    value={files.tokens}
                    onChange={tokens => setFiles(previous => ({...previous, tokens}))}
                />
                <div style={{display: 'flex', gap: 6}}>
                    <button
                        type="button"
                        onClick={() => void checkModel()}
                    >
                        Check the model
                    </button>
                    <button
                        type="button"
                        onClick={() => void start()}
                    >
                        Start dictation
                    </button>
                </div>
                {probe.length > 0 && (
                    <ul style={{margin: 0, paddingLeft: 16}}>
                        {probe.map(row => (
                            <li key={row.name}>
                                {row.name}: {row.status} · {megabytes(row.bytes)}
                            </li>
                        ))}
                    </ul>
                )}
                <span style={{opacity: 0.8}}>{status}</span>
            </div>
        </>
    );
}

/** The sherpa engine wired to the published Bulgarian model (`@@T-612`). */
export const Sherpa: Story = {
    render: () => <SherpaBench />,
};

/** The rings on their own: the hover one dashed, the committed one solid. */
export const Outlines: Story = {
    render: () => (
        <div style={{position: 'relative', height: 160}}>
            <FeedbackOutline
                rect={{x: 24, y: 24, width: 220, height: 40}}
                targetId="marine.coral.browse/table:corals/column:coralName"
                tone="hover"
            />
            <FeedbackOutline
                rect={{x: 24, y: 96, width: 220, height: 40}}
                targetId="marine.coral.browse/card:master/field:coral.coralName/label"
                tone="item"
            />
        </div>
    ),
};
