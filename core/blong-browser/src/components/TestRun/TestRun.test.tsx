import {describe, expect, it} from 'vitest';
import {fireEvent, render, screen} from '../../test/render.js';
import {sessionFlowFailure, sessionFlowRun} from './fixtures/sessionFlow.js';
import {TestRun} from './TestRun.js';
import {emptyTestRun} from './testRunModel.js';

describe('TestRun', () => {
    it('renders every step and the assertion summary', () => {
        render(<TestRun run={sessionFlowRun()} />);
        expect(screen.getAllByTestId(/^test-run-step-/)).toHaveLength(11);
        expect(screen.getByText('✓ 39')).toBeInTheDocument();
        expect(screen.getAllByText('11/11').length).toBeGreaterThan(0);
        expect(screen.getAllByText('session flow').length).toBeGreaterThan(0);
    });

    it('shares a selection between the tree-table and the graph', () => {
        render(<TestRun run={sessionFlowRun()} />);
        fireEvent.click(screen.getByTestId('test-run-step-login'));
        expect(screen.getByTestId('test-run-step-login')).toHaveClass('is-selected');
        expect(screen.getByTestId('test-run-node-login')).toHaveClass('is-selected');
    });

    it('renders unlinked steps as graph-style nodes', () => {
        render(<TestRun run={sessionFlowRun()} />);
        const loose = screen.getByLabelText('Steps outside the dependency graph');
        expect(loose.querySelectorAll('.blong-test-run__graph-node')).toHaveLength(6);
        fireEvent.click(screen.getByRole('button', {name: 'explicitClose'}));
        expect(screen.getByRole('button', {name: 'explicitClose'})).toHaveClass('is-selected');
        expect(screen.getByTestId('test-run-step-explicitClose')).toHaveClass('is-selected');
    });

    it('opens the bottom details panel on the Log tab', () => {
        render(
            <TestRun
                run={sessionFlowRun()}
                defaultSelectedKey="login"
                defaultDetailsOpen
            />,
        );
        expect(screen.getByLabelText('Step details')).toHaveClass('blong-test-run__details');
        expect(screen.getByRole('tab', {name: /Log/})).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('the session id is a ULID')).toBeInTheDocument();
        expect(screen.getByText('session-created')).toBeInTheDocument();
    });

    it('keeps the details panel open when another step is selected', () => {
        render(
            <TestRun
                run={sessionFlowRun()}
                defaultSelectedKey="login"
                defaultDetailsOpen
            />,
        );
        fireEvent.click(screen.getByTestId('test-run-step-verifySession'));
        expect(screen.getByLabelText('Step details')).toBeInTheDocument();
        expect(screen.getByText('the session is active')).toBeInTheDocument();
    });

    it('does not auto-close the details panel on Escape', () => {
        render(
            <TestRun
                run={sessionFlowRun()}
                defaultSelectedKey="login"
                defaultDetailsOpen
            />,
        );
        fireEvent.keyDown(screen.getByRole('treegrid'), {key: 'Escape'});
        expect(screen.getByLabelText('Step details')).toBeInTheDocument();
        expect(screen.getByText('Run log')).toBeInTheDocument();
    });

    it('links captured source pointers through the configured base', () => {
        render(
            <TestRun
                run={sessionFlowRun()}
                defaultSelectedKey="login"
                defaultDetailsOpen
                sourceLink={{scheme: 'https', base: 'https://example.test/repo'}}
            />,
        );
        const links = screen.getAllByRole('link', {name: /testSessionFlow\.ts/});
        expect(links.length).toBeGreaterThan(0);
        expect(links[0].getAttribute('href')).toContain(
            'https://example.test/repo/realm/blong-access/server/test/test/testSessionFlow.ts#L',
        );
    });

    it('shows the failure in the counts and in the row', () => {
        render(<TestRun run={sessionFlowFailure()} />);
        expect(screen.getByText(/3 failed/)).toBeInTheDocument();
        expect(screen.getByText('✓ 32')).toBeInTheDocument();
        expect(screen.getByTestId('test-run-step-refreshToken')).toHaveClass(
            'blong-test-run__row--failed',
        );
    });

    it('collapses and expands a group', () => {
        render(
            <TestRun
                run={sessionFlowRun()}
                defaultCollapsed={['group:']}
            />,
        );
        expect(screen.queryByTestId('test-run-step-login')).toBeNull();
        fireEvent.click(screen.getByLabelText('Expand group'));
        expect(screen.getByTestId('test-run-step-login')).toBeInTheDocument();
    });

    it('moves the selection with the keyboard', () => {
        render(<TestRun run={sessionFlowRun()} />);
        fireEvent.keyDown(screen.getByRole('treegrid'), {key: 'ArrowDown'});
        expect(screen.getByTestId('test-run-step-login')).toHaveClass('is-selected');
        fireEvent.keyDown(screen.getByRole('treegrid'), {key: 'ArrowDown'});
        expect(screen.getByTestId('test-run-step-verifySession')).toHaveClass('is-selected');
    });

    it('shows an empty state for a run with no steps', () => {
        render(
            <TestRun
                run={emptyTestRun({
                    runId: 'empty',
                    name: 'empty run',
                    method: 'test.empty.flow',
                })}
            />,
        );
        expect(screen.getByText('No steps in this run')).toBeInTheDocument();
    });
});
