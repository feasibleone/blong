/**
 * ActionButton — permission-aware button that triggers an action from the registry.
 *
 * Supports:
 *  - Action name string → looks up action registry, calls via useAction
 *  - Confirmation dialog before invocation
 *  - Loading indicator while in-flight
 *  - Submit form before calling (when submit=true)
 *  - Split-button variant when menu items are provided
 */
import {confirmDialog, SplitButton} from '../../primereact/index.js';

import {useQueryClient} from '@tanstack/react-query';
import {useRef, useState} from 'react';
import {useBlong} from '../../context/BlongContext.js';
import {useAction} from '../../hooks/useAction.js';
import {usePermission} from '../../hooks/usePermission.js';
import type {IDependantKind, IToolbarButton} from '../../index.js';
import {invalidateDropdowns} from '../../model/dropdownRegistry.js';
import {useAppStore} from '../../state/appStore.js';
import {Button} from '../Button/Button.js';

export interface IActionButtonProps extends IToolbarButton {
    /** Ref to the form element to submit before calling */
    formId?: string;
    className?: string;
    /** Called with true when the action starts, false when it finishes */
    onBusyChange?: (busy: boolean) => void;
    /** External disabled override — disables the button regardless of its configured `enabled` */
    disabled?: boolean;
}

export function ActionButton({
    label,
    icon,
    action: actionRef,
    method,
    permission,
    submit: shouldSubmit = false,
    confirm: confirmMessage,
    enabled = true,
    visible = true,
    menu,
    params: extraParams,
    successHint,
    refresh,
    deletion,
    formId,
    className = '',
    onBusyChange,
    disabled: externalDisabled = false,
}: IActionButtonProps) {
    const permitted = usePermission(permission);
    const [loading, setLoading] = useState(false);
    /**
     * Set for as long as the failure hint is on screen, so visual themes can
     * style the button that errored (the wood variant paints it rust).
     */
    const [failed, setFailed] = useState(false);
    const queryClient = useQueryClient();
    const actionMethod = typeof actionRef === 'string' ? actionRef : actionRef?.method;
    const actionParamsOverride =
        typeof actionRef === 'object' && actionRef !== null ? actionRef.params : undefined;
    // extraParams may be a pre-resolved Record; if it arrives as a non-object (rare, e.g. a
    // primitive wrapped by resolveTemplate), treat it as the whole call payload.
    const mergedParams =
        extraParams !== null && typeof extraParams === 'object' && !Array.isArray(extraParams)
            ? {...(actionParamsOverride ?? {}), ...(extraParams as Record<string, unknown>)}
            : {...(actionParamsOverride ?? {})};
    const callParams =
        extraParams !== null && typeof extraParams === 'object' && !Array.isArray(extraParams)
            ? mergedParams
            : ((extraParams as Record<string, unknown> | undefined) ?? mergedParams);
    const directMethod = method ?? actionMethod ?? '';
    const testId = directMethod ? `action-${directMethod.replace(/[/.]/g, '-')}` : undefined;
    const {call} = useAction(directMethod, 'mutation', mergedParams);
    const {handler} = useBlong();
    const clearError = useAppStore(s => s.clearError);
    const showHint = useAppStore(s => s.showHint);
    const hintTargetRef = useRef<HTMLSpanElement>(null);
    /**
     * A realm that implements no dependant scan answers with an error; asking again
     * on every click of every delete button would cost a round trip for a refused
     * call each time, so the answer is remembered for the session.
     */
    const scanUnsupportedRef = useRef<Set<string>>(new Set());

    if (!visible || !permitted) return null;

    const isDisabled = externalDisabled || enabled === false || loading;

    /** A failure shown beside the button, the same way a refused call is shown. */
    const fail = (message: string) => {
        clearError(); // dismiss the global error dialog — we're showing it locally
        showHint(hintTargetRef.current, message, true);
        setFailed(true);
        window.setTimeout(() => setFailed(false), 2000); // matches ActionHint's auto-dismiss
    };

    /**
     * Run one method, then refresh what the page shows. `method` is usually this
     * button's own action; a deletion mode may call the edit instead (deactivate).
     */
    const perform = async (target: string, params: Record<string, unknown>) => {
        setLoading(true);
        onBusyChange?.(true);
        try {
            if (target === directMethod) await call(params);
            else await handler[target](params, {});
            if (refresh && target) {
                const ns = target.split('.').slice(0, -1).join('.');
                if (ns) {
                    void queryClient.invalidateQueries({queryKey: [ns + '.find']});
                    void queryClient.invalidateQueries({queryKey: [ns + '.get']});
                }
            }
            // The call may have added, changed or removed a record another open
            // form picks from, so the option lists are read again on the next render.
            invalidateDropdowns();
            if (successHint) showHint(hintTargetRef.current, successHint, false);
            return true;
        } catch (err: unknown) {
            const e = err as {print?: string; message?: string};
            fail(e.print ?? e.message ?? 'Error');
            return false;
        } finally {
            setLoading(false);
            onBusyChange?.(false);
        }
    };

    /**
     * What still refers to the record, counted per kind.
     *
     * `undefined` means the question could not be asked — a realm with no route for
     * the object's `scan` — and the deletion falls back to the button's own
     * confirmation.
     */
    const scan = async (): Promise<{dependants: IDependantKind[]; total: number} | undefined> => {
        const scanAction = deletion?.scan;
        if (!scanAction || scanUnsupportedRef.current.has(scanAction)) return undefined;
        const keyField = deletion?.keyField;
        const id = keyField ? (callParams as Record<string, unknown>)[keyField] : undefined;
        if (!keyField || id === undefined || id === null) return undefined;
        try {
            // The route names the object, so the key travels as the params of a
            // delete would: `{athleteId: '...'}`.
            const result = (await handler[scanAction]({[keyField]: id}, {})) as {
                dependants?: IDependantKind[];
                total?: number;
            };
            return {
                dependants: Array.isArray(result?.dependants) ? result.dependants : [],
                total: Number(result?.total ?? 0),
            };
        } catch {
            scanUnsupportedRef.current.add(scanAction);
            return undefined;
        }
    };

    /** `3 conferrals, 2 participations` — how a message names what a delete takes. */
    const describe = (dependants: IDependantKind[]) =>
        dependants
            .map(entry => `${entry.count} ${entry.label}${entry.count === 1 ? '' : 's'}`)
            .join(', ');

    /**
     * The four deletion modes, decided from what the server reports.
     *
     * `deactivate` hides the record instead of removing it, `block` refuses with the
     * counts, `cascade` takes them without asking and `prompt` asks first. `@@D-784`
     */
    const runDeletion = async () => {
        const mode = deletion?.mode ?? 'prompt';
        const cascadeParam = deletion?.cascadeParam ?? 'cascade';
        if (mode === 'deactivate') {
            const flag = deletion?.flag;
            const edit = deletion?.edit;
            const read = deletion?.get;
            const keyField = deletion?.keyField;
            const object = deletion?.entity?.split('.')[1];
            if (!flag || !edit || !keyField || !object) {
                fail('This record cannot be deactivated: the model declares no flag field.');
                return;
            }
            const id = (callParams as Record<string, unknown>)[keyField];
            // The edit is validated against the model, so it is sent a whole record:
            // the column that hides it is changed, nothing else is.
            let current: Record<string, unknown> = {};
            if (read) {
                try {
                    const row = (await handler[read]({[keyField]: id}, {})) as Record<
                        string,
                        unknown
                    >;
                    const candidate = row?.[object];
                    if (candidate && typeof candidate === 'object') {
                        current = candidate as Record<string, unknown>;
                    }
                } catch {
                    // A read that fails leaves the flag alone as the only change.
                }
            }
            await perform(edit, {
                [object]: {...current, [keyField]: id, [flag.field]: flag.value ?? 'inactive'},
            });
            return;
        }

        const found = await scan();
        const references = found?.dependants.length ? describe(found.dependants) : '';
        const cascading = found ? {...callParams, [cascadeParam]: true} : callParams;

        if (mode === 'block') {
            if (found?.total) {
                fail(`Cannot delete this record: ${references} still refer to it.`);
                return;
            }
            await perform(directMethod, callParams);
            return;
        }

        if (mode === 'cascade') {
            await perform(directMethod, cascading);
            return;
        }

        // `prompt` — the default. With no scan answer there is nothing to add to the
        // button's own message, so the confirmation still reads as it did.
        const message = found?.total
            ? `Deleting this record also deletes ${references}. Continue?`
            : (confirmMessage ?? 'Delete the selected record?');
        confirmDialog({
            message,
            header: 'Confirm',
            icon: 'pi pi-exclamation-triangle',
            accept: () => void perform(directMethod, cascading),
        });
    };

    const doCall = async () => {
        if (shouldSubmit && formId) {
            const form = document.getElementById(formId) as HTMLFormElement | null;
            if (form) {
                // Trigger native form submit; the form's onSubmit handles validation
                form.requestSubmit();
                return;
            }
        }
        await perform(directMethod, callParams);
    };

    const handleClick = () => {
        if (deletion) {
            void runDeletion();
            return;
        }
        if (confirmMessage) {
            confirmDialog({
                message: confirmMessage,
                header: 'Confirm',
                icon: 'pi pi-exclamation-triangle',
                accept: () => void doCall(),
            });
        } else {
            void doCall();
        }
    };

    const buttonProps = {
        label,
        icon: loading ? 'pi pi-spinner pi-spin' : icon,
        disabled: isDisabled,
        onClick: handleClick,
        className: `blong-action-btn ${className}${failed ? ' blong-action-error' : ''}`,
        // The action is the stable name: a toolbar button keeps its identifier when
        // the label is reworded or translated (`@@T-488`).
        ...(actionMethod ? {feedbackName: actionMethod} : {}),
    };

    if (menu && menu.length > 0) {
        const splitItems = menu.map(item => ({
            label: item.label,
            icon: item.icon,
            command: () => {
                const subAction =
                    typeof item.action === 'string' ? item.action : item.action?.method;
                if (subAction) void call({...mergedParams, _action: subAction});
            },
        }));
        return (
            <span
                ref={hintTargetRef}
                style={{display: 'inline-block'}}
                data-testid={testId}
            >
                <SplitButton
                    {...buttonProps}
                    model={splitItems}
                />
            </span>
        );
    }

    return (
        <span
            ref={hintTargetRef}
            style={{display: 'inline-block'}}
            data-testid={testId}
        >
            <Button {...buttonProps} />
        </span>
    );
}
