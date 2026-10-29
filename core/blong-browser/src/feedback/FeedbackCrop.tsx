/**
 * FeedbackCrop.tsx — the region the picture will keep (`@@T-490`).
 *
 * A full-viewport capture carries the whitespace around the thing being
 * discussed, which is exactly the part a reviewer gains nothing from. While the
 * mode is cropped, the page keeps working underneath and only a dashed rectangle
 * with a dimmed outside is added: drag it to move, the corner to resize, and the
 * submit takes the frame inside it.
 *
 * `data-feedback-ui` matters here more than anywhere: the rectangle covers the
 * page, so without it the guard would treat a drag as a click on whatever it
 * happens to be over.
 */

import {useTranslate} from '../hooks/useText.js';
import {FEEDBACK_UI_ATTR} from './ids.js';
import type {IFeedbackRect} from './placement.js';
import {useDrag} from './useDrag.js';

export interface IFeedbackCropProps {
    region: IFeedbackRect;
    onMove: (dx: number, dy: number) => void;
    onResize: (dx: number, dy: number) => void;
}

export function FeedbackCrop({region, onMove, onResize}: IFeedbackCropProps) {
    const t = useTranslate();
    const move = useDrag(onMove);
    const resize = useDrag(onResize);
    return (
        <div className="blong-feedback-crop" {...{[FEEDBACK_UI_ATTR]: 'crop'}}>
            <div
                className="blong-feedback-crop__box"
                style={{
                    left: region.x,
                    top: region.y,
                    width: region.width,
                    height: region.height,
                }}
                onPointerDown={move.start}
            >
                <span className="blong-feedback-crop__handle" onPointerDown={resize.start} />
            </div>
            <span className="blong-feedback-crop__hint">
                {t('Drag to choose the part the reviewer needs') ??
                    'Drag to choose the part the reviewer needs'}
            </span>
        </div>
    );
}
