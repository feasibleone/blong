/**
 * capture.ts — the screenshot of a submission (`@@T-466`, `@@D-658`).
 *
 * The Screen Capture API, not a DOM-to-image library: no dependency, and the
 * picture is what the person actually saw rather than a re-render that tends to
 * lose cross-origin images and web fonts. The costs are real and are the reason
 * the outcome is a value rather than an exception — the call needs a secure
 * context, shows a picker, and cannot run in an iframe without the
 * `display-capture` permission, so a refusal is a normal answer.
 *
 * The frame is downscaled, exported as a JPEG data URL and stepped down a quality
 * ladder until it fits the byte ceiling; the tracks are stopped in a `finally` so
 * the browser's capture indicator does not linger over the next thing the person
 * does.
 */

import type {IFeedbackShot} from '@feasibleone/blong';

import {FEEDBACK_CAPTURE_ATTR} from './ids.js';

export type FeedbackCaptureStatus = 'captured' | 'denied' | 'unavailable';

export interface ICaptureOutcome {
    status: FeedbackCaptureStatus;
    shot?: IFeedbackShot;
}

/** Widest picture kept; a 4K window is downscaled rather than stored whole. */
const MAX_WIDTH = 1600;
const QUALITIES = [0.72, 0.6, 0.45, 0.3, 0.2];

function nextFrame(): Promise<void> {
    return new Promise(resolve => {
        if (typeof requestAnimationFrame === 'undefined') resolve();
        else requestAnimationFrame(() => resolve());
    });
}

/** Hide the mode's chrome, take the picture, then put the chrome back. */
async function withHiddenOverlay<T>(capture: () => Promise<T>): Promise<T> {
    const root = typeof document === 'undefined' ? null : document.documentElement;
    root?.setAttribute(FEEDBACK_CAPTURE_ATTR, 'on');
    try {
        // Two frames: one for the style change to apply, one to be sure the paint
        // that shows it has happened before the frame is grabbed.
        await nextFrame();
        await nextFrame();
        return await capture();
    } finally {
        root?.removeAttribute(FEEDBACK_CAPTURE_ATTR);
    }
}

async function grabFrame(
    stream: MediaStream,
    maxBytes: number,
    region?: {x: number; y: number; width: number; height: number},
): Promise<IFeedbackShot | undefined> {
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    try {
        await video.play();
        const sourceWidth = video.videoWidth || MAX_WIDTH;
        const sourceHeight = video.videoHeight || Math.round(MAX_WIDTH * 0.5625);

        // The region arrives in viewport CSS pixels and the frame is the surface the
        // browser captured, so it is scaled by the frame's own ratio: what the person
        // outlined is what lands in the picture, whatever the display scale.
        const viewport = typeof window === 'undefined' ? undefined : window;
        const scaleX = viewport ? sourceWidth / viewport.innerWidth : 1;
        const scaleY = viewport ? sourceHeight / viewport.innerHeight : 1;
        const crop = region
            ? {
                  x: Math.max(0, Math.round(region.x * scaleX)),
                  y: Math.max(0, Math.round(region.y * scaleY)),
                  width: Math.min(sourceWidth, Math.round(region.width * scaleX)),
                  height: Math.min(sourceHeight, Math.round(region.height * scaleY)),
              }
            : {x: 0, y: 0, width: sourceWidth, height: sourceHeight};

        const scale = Math.min(
            1,
            MAX_WIDTH / Math.max(1, crop.width),
            // The frame is in the surface's pixels, which on a HiDPI display is two
            // or three times the viewport's: a picture left at that size is drawn by
            // the review page at that many times the size the person saw, and the
            // reviewer cannot map it to the page. So the picture keeps the CSS size
            // and only ever scales down from it (`@@T-490`).
            1 / Math.max(1, scaleX),
        );
        const width = Math.max(1, Math.round(crop.width * scale));
        const height = Math.max(1, Math.round(crop.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return undefined;
        context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);

        let shotData = canvas.toDataURL('image/jpeg', QUALITIES[0]);
        for (const quality of QUALITIES.slice(1)) {
            if (shotData.length <= maxBytes) break;
            shotData = canvas.toDataURL('image/jpeg', quality);
        }
        return {
            shotData,
            mimeType: 'image/jpeg',
            shotWidth: width,
            shotHeight: height,
            byteSize: shotData.length,
        };
    } finally {
        video.pause();
        video.srcObject = null;
    }
}

/**
 * Capture the screen, or say why not.
 *
 * `maxBytes` bounds the data URL, not the image: the payload travels through the
 * gateway's JSON body, whose limit is 1 MB by default. `region` is the part of the
 * viewport the submission keeps, in CSS pixels; without it the whole surface is
 * kept, and the caller's anchors are fractions of that same region (`@@T-490`).
 */
export async function captureScreen(
    maxBytes = 700_000,
    region?: {x: number; y: number; width: number; height: number},
): Promise<ICaptureOutcome> {
    const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    const getDisplayMedia = media?.getDisplayMedia?.bind(media);
    if (!getDisplayMedia) return {status: 'unavailable'};

    let stream: MediaStream | undefined;
    try {
        // The overlay is hidden for the picker as well as for the frame: the browser
        // previews the surface while the person chooses, and a box that shows up in
        // that preview is a box they may pick.
        const shot = await withHiddenOverlay(async () => {
            stream = await getDisplayMedia({
                video: {displaySurface: 'browser'},
                audio: false,
                // Chromium hints: default to this tab and offer it in the picker. A
                // browser that ignores them shows its own picker, which is why the
                // stored picture never claims to be this page — the URL and the anchors
                // are stored beside it for exactly that case.
                preferCurrentTab: true,
                selfBrowserSurface: 'include',
            } as DisplayMediaStreamOptions);
            return grabFrame(stream, maxBytes, region);
        });
        return shot ? {status: 'captured', shot} : {status: 'unavailable'};
    } catch (error) {
        const name = (error as {name?: string} | undefined)?.name;
        return {status: name === 'NotAllowedError' ? 'denied' : 'unavailable'};
    } finally {
        stream?.getTracks().forEach(track => track.stop());
    }
}
