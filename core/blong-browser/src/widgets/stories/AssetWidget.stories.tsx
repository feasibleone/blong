import type {Meta, StoryObj} from '@storybook/react-vite';

import type {IEnrichedFieldSchema} from '@feasibleone/blong';

import {withDispatch} from '../../../.storybook/dispatch.js';
import {AssetWidget} from '../AssetWidget.js';

/**
 * `AssetWidget` stories — a field that holds a stored file.
 *
 * The picture a story shows is a `data:` URI rather than a `blob://` reference, because a storybook has
 * no store behind it: the resolver leaves such a value alone, which is exactly the case a page has when
 * somebody pastes a link to a file that lives elsewhere (@@D-842). The document story goes the other way
 * and points at a reference, with the record answered by a stub — which is what makes the icon choice
 * visible.
 */
const meta: Meta<typeof AssetWidget> = {
    title: 'Widgets/AssetWidget',
    component: AssetWidget,
    parameters: {layout: 'padded'},
    tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof meta>;

/** A 64x64 PNG: a solid square, small enough to read in a story and in a snapshot. */
const PICTURE =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAWklEQVR4nO3OMQEAAAgDoC2' +
    '18B9oD0GwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4G0B' +
    'vX8B37sLZWQAAAAASUVORK5CYII=';

const schema = (widget: Record<string, unknown>): IEnrichedFieldSchema =>
    ({
        title: 'File',
        type: 'string',
        widget: {type: 'asset', namespace: 'party', accept: 'image/*', ...widget},
    }) as unknown as IEnrichedFieldSchema;

const noop = () => undefined;

/** A record that says what the file is, so the icon and the picture can be told apart. */
const record = (contentType: string) =>
    withDispatch({
        blobBlobGet: () =>
            Promise.resolve({
                key: 'report-notes',
                namespace: 'party',
                contentType,
                size: 1024,
                scopes: ['anonymous'],
                scopeMode: 'any',
                state: 'stored',
                temporary: false,
                createdAt: new Date(0).toISOString(),
            }),
    });

export const Empty: Story = {
    args: {
        name: 'photograph',
        schema: schema({}),
        value: null,
        onChange: noop,
        onBlur: noop,
    },
};

export const Picture: Story = {
    args: {
        name: 'photograph',
        schema: schema({}),
        value: PICTURE,
        onChange: noop,
        onBlur: noop,
    },
};

export const Document: Story = {
    args: {
        name: 'notes',
        schema: schema({accept: 'application/pdf'}),
        value: 'blob://party/report-notes',
        onChange: noop,
        onBlur: noop,
    },
    decorators: [record('application/pdf')],
};

export const ReadOnly: Story = {
    args: {
        name: 'photograph',
        schema: schema({}),
        value: PICTURE,
        onChange: noop,
        onBlur: noop,
        readOnly: true,
    },
};
