/**
 * ErrorBoundary — error boundary with typed Blong error display.
 *
 * Handles both React rendering errors and JSON-RPC validation errors.
 */

import React from 'react';

import type {RpcError, ValidationError} from '../types.js';

/** Props for the ErrorBoundary component. */
export interface ErrorBoundaryProps {
    children: React.ReactNode;
    /** Fallback UI to render on error. */
    fallback?: React.ReactNode;
    /** Called when an error is caught. */
    onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

/**
 * React error boundary that catches rendering errors.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {hasError: false, error: null};
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return {hasError: true, error};
    }

    componentDidCatch(error: Error, info: React.ErrorInfo): void {
        this.props.onError?.(error, info);
    }

    render(): React.ReactNode {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return React.createElement(
                'div',
                {className: 'blong-error-boundary'},
                React.createElement('h3', null, 'Something went wrong'),
                React.createElement(
                    'p',
                    null,
                    this.state.error?.message ?? 'An unexpected error occurred',
                ),
                React.createElement(
                    'button',
                    {
                        className: 'blong-btn blong-btn-primary',
                        onClick: () => this.setState({hasError: false, error: null}),
                    },
                    'Try Again',
                ),
            );
        }

        return this.props.children;
    }
}

/**
 * Display a typed Blong RPC error.
 */
export function RpcErrorDisplay({
    error,
    className = '',
}: {
    error: RpcError;
    className?: string;
}): React.ReactElement {
    return React.createElement(
        'div',
        {className: `blong-rpc-error ${className}`},
        React.createElement('h4', {className: 'blong-rpc-error-type'}, error.type),
        React.createElement('p', {className: 'blong-rpc-error-message'}, error.message),
        error.print &&
            React.createElement('p', {className: 'blong-rpc-error-print'}, error.print),
        error.validation &&
            error.validation.length > 0 &&
            React.createElement(
                'ul',
                {className: 'blong-rpc-error-validation'},
                ...error.validation.map((v: ValidationError, i: number) =>
                    React.createElement(
                        'li',
                        {key: i},
                        React.createElement('strong', null, v.field),
                        ': ',
                        v.message,
                    ),
                ),
            ),
    );
}

/**
 * Set field-level errors on a form from an RPC validation error response.
 *
 * Maps `validation` array from JSON-RPC error to react-hook-form `setError` calls.
 */
export function setFormErrors(
    setError: (name: string, error: {type: string; message: string}) => void,
    rpcError: RpcError,
): void {
    if (!rpcError.validation) return;

    for (const v of rpcError.validation) {
        setError(v.field, {
            type: v.type ?? 'server',
            message: v.message,
        });
    }
}
