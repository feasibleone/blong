import {describe, expect, it} from 'vitest';
import {render, screen} from '../../test/render.js';
import {Page} from './index.js';

describe('Page', () => {
    it('renders children', () => {
        render(
            <Page>
                <div data-testid="content">Hello</div>
            </Page>,
        );
        expect(screen.getByTestId('content')).toBeInTheDocument();
    });

    it('renders title when provided', () => {
        render(
            <Page title="My Page">
                <span />
            </Page>,
        );
        expect(screen.getByText('My Page')).toBeInTheDocument();
    });

    it('does not render title when omitted', () => {
        const {container} = render(
            <Page>
                <span />
            </Page>,
        );
        expect(container.querySelector('.blong-page-title')).toBeNull();
    });

    it('renders breadcrumbs when provided', () => {
        render(
            <Page breadcrumbs={[{label: 'Home'}, {label: 'Items'}]}>
                <span />
            </Page>,
        );
        expect(screen.getByText('Items')).toBeInTheDocument();
    });

    it('does not render toolbar when toolbar arrays are empty', () => {
        const {container} = render(
            <Page>
                <span />
            </Page>,
        );
        expect(container.querySelector('.blong-page-toolbar')).toBeNull();
    });

    it('renders toolbar when toolbar buttons are provided', () => {
        const {container} = render(
            <Page toolbar={[{label: 'Save', action: 'save.item.run'}]}>
                <span />
            </Page>,
        );
        expect(container.querySelector('.blong-page-toolbar')).toBeInTheDocument();
    });

    it('renders toolbar container when toolbarRight is provided', () => {
        const {container} = render(
            <Page toolbarRight={[{label: 'Export', action: 'export.item'}]}>
                <span />
            </Page>,
        );
        expect(container.querySelector('.blong-page-toolbar')).toBeInTheDocument();
    });

    it('applies custom className', () => {
        const {container} = render(
            <Page className="my-custom">
                <span />
            </Page>,
        );
        expect(container.querySelector('.blong-page.my-custom')).toBeInTheDocument();
    });
});
