/**
 * useSubmit — form submission wrapper with toast feedback.
 */
import {useCallback, useState} from 'react';
import type {IBlongError} from '../types/action.js';
import {useToast} from './useToast.js';

export interface IUseSubmitOptions {
    successMessage?: string;
    errorMessage?: string;
    /** Called on successful submission */
    onSuccess?: (result: unknown) => void;
    /** Called on error */
    onError?: (error: IBlongError | Error) => void;
}

export interface IUseSubmitResult<T extends Record<string, unknown>> {
    submitting: boolean;
    submit: (values: T) => Promise<unknown>;
}

export function useSubmit<T extends Record<string, unknown>>(
    fn: (values: T) => Promise<unknown>,
    options: IUseSubmitOptions = {},
): IUseSubmitResult<T> {
    const {successMessage = 'Saved successfully', errorMessage = 'An error occurred'} = options;
    const [submitting, setSubmitting] = useState(false);
    const toast = useToast();

    const submit = useCallback(
        async (values: T) => {
            setSubmitting(true);
            try {
                const result = await fn(values);
                toast.success(successMessage);
                options.onSuccess?.(result);
                return result;
            } catch (err) {
                const error = err as IBlongError | Error;
                toast.error(
                    'type' in error ? ((error as IBlongError).print ?? errorMessage) : errorMessage,
                );
                options.onError?.(error);
                throw err;
            } finally {
                setSubmitting(false);
            }
        },
        [fn, successMessage, errorMessage, toast, options],
    );

    return {submitting, submit};
}
