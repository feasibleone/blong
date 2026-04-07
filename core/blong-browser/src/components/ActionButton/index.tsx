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
import {confirmDialog} from 'primereact/confirmdialog';
import {SplitButton} from 'primereact/splitbutton';
import {useRef, useState} from 'react';
import {useAction} from '../../hooks/useAction.js';
import {usePermission} from '../../hooks/usePermission.js';
import {useAppStore} from '../../state/appStore.js';
import type {IToolbarButton} from '../../types/action.js';
import {Button} from '../Button/index.js';

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
    align: _align,
    menu,
    params: extraParams,
    successHint,
    formId,
    className = '',
    onBusyChange,
    disabled: externalDisabled = false,
}: IActionButtonProps) {
    const permitted = usePermission(permission);
    const [loading, setLoading] = useState(false);
    const actionName = typeof actionRef === 'string' ? actionRef : actionRef?.name;
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
    const directMethod = method ?? actionName ?? '';
    const {call} = useAction(directMethod, mergedParams);
    const clearError = useAppStore(s => s.clearError);
    const showHint = useAppStore(s => s.showHint);
    const hintTargetRef = useRef<HTMLSpanElement>(null);

    if (!visible || !permitted) return null;

    const isDisabled = externalDisabled || enabled === false || loading;

    const doCall = async () => {
        if (shouldSubmit && formId) {
            const form = document.getElementById(formId) as HTMLFormElement | null;
            if (form) {
                // Trigger native form submit; the form's onSubmit handles validation
                form.requestSubmit();
                return;
            }
        }
        setLoading(true);
        onBusyChange?.(true);
        try {
            await call(callParams);
            if (successHint) showHint(hintTargetRef.current, successHint, false);
        } catch (err: unknown) {
            const e = err as {print?: string; message?: string};
            clearError(); // dismiss the global error dialog — we're showing it locally
            showHint(hintTargetRef.current, e.print ?? e.message ?? 'Error', true);
        } finally {
            setLoading(false);
            onBusyChange?.(false);
        }
    };

    const handleClick = () => {
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
        className: `blong-action-btn ${className}`,
    };

    if (menu && menu.length > 0) {
        const splitItems = menu.map(item => ({
            label: item.label,
            icon: item.icon,
            command: () => {
                const subAction = typeof item.action === 'string' ? item.action : item.action?.name;
                if (subAction) void call({...mergedParams, _action: subAction});
            },
        }));
        return (
            <span
                ref={hintTargetRef}
                style={{display: 'inline-block'}}
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
        >
            <Button {...buttonProps} />
        </span>
    );
}
