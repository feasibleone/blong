import React from 'react'
import type {Meta, StoryObj} from '@storybook/react-vite'
import {within, userEvent, expect} from '@storybook/test'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {VisuallyHidden, SkipLink, LiveRegion, FocusTrap} from '../src/components/Accessibility.js'

const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}})

const meta: Meta<typeof FocusTrap> = {
    title: 'Components/Accessibility',
    component: FocusTrap,
    decorators: [
        (Story) => (
            <QueryClientProvider client={queryClient}>
                <Story />
            </QueryClientProvider>
        ),
    ],
}
export default meta
type Story = StoryObj<typeof FocusTrap>

export const VisuallyHiddenStory: Story = {
    name: 'VisuallyHidden',
    render: () => (
        <div style={{padding: '16px'}}>
            <p>The following text is visually hidden but readable by screen readers:</p>
            <VisuallyHidden>This text is only visible to screen readers.</VisuallyHidden>
            <p>(Nothing appears between these two paragraphs visually.)</p>
        </div>
    ),
}

export const SkipLinkStory: Story = {
    name: 'SkipLink',
    render: () => (
        <div style={{padding: '16px'}}>
            <SkipLink href="#main-content">Skip to main content</SkipLink>
            <p>Tab into this area to reveal the skip link.</p>
            <div id="main-content" tabIndex={-1}>
                <p>Main content area</p>
            </div>
        </div>
    ),
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement)
        await userEvent.tab()
        const skipLink = canvas.getByText('Skip to main content')
        expect(skipLink).toBeInTheDocument()
    },
}

function LiveRegionDemo() {
    const [msg, setMsg] = React.useState('')
    return (
        <div>
            <button onClick={() => setMsg('Item saved successfully!')}>Save Item</button>
            <LiveRegion message={msg} />
            <div aria-live="off" data-testid="status">{msg}</div>
        </div>
    )
}

export const LiveRegionStory: Story = {
    name: 'LiveRegion',
    render: () => <LiveRegionDemo />,
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement)
        const button = canvas.getByText('Save Item')
        await userEvent.click(button)
        const status = canvas.getByTestId('status')
        expect(status.textContent).toBe('Item saved successfully!')
    },
}

function FocusTrapDemo() {
    const [active, setActive] = React.useState(false)
    return (
        <div>
            <button onClick={() => setActive(true)}>Open Dialog</button>
            {active && (
                <FocusTrap active>
                    <div role="dialog" style={{border: '1px solid', padding: '16px'}}>
                        <p>Focus is trapped here</p>
                        <button>Action 1</button>
                        <button>Action 2</button>
                        <button onClick={() => setActive(false)}>Close</button>
                    </div>
                </FocusTrap>
            )}
        </div>
    )
}

export const FocusTrapStory: Story = {
    name: 'FocusTrap',
    render: () => <FocusTrapDemo />,
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement)
        const openButton = canvas.getByText('Open Dialog')
        await userEvent.click(openButton)
        const dialog = canvas.getByRole('dialog')
        expect(dialog).toBeInTheDocument()
    },
}
