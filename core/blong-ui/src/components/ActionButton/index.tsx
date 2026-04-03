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
import { Button } from 'primereact/button';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { SplitButton } from 'primereact/splitbutton';
import { useState } from 'react';
import { useAction } from '../../hooks/useAction.js';
import { usePermission } from '../../hooks/usePermission.js';
import type { IToolbarButton } from '../../types/action.js';

export interface IActionButtonProps extends IToolbarButton {
    /** Extra params passed to action at call site */
    params?: Record<string, unknown>;
    /** Ref to the form element to submit before calling */
    formId?: string;
    className?: string;
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
    formId,
    className = '',
}: IActionButtonProps) {
    const permitted = usePermission(permission);
    const [loading, setLoading] = useState(false);
    const actionName = typeof actionRef === 'string' ? actionRef : actionRef?.name;
    const actionParamsOverride = typeof actionRef === 'object' && actionRef !== null ? actionRef.params : undefined;
    const mergedParams = {...(actionParamsOverride ?? {}), ...(extraParams ?? {})};
    const directMethod = method ?? actionName ?? '';
    const {call} = useAction(directMethod, mergedParams);

    if (!visible || !permitted) return null;

    const isDisabled = enabled === false || loading;

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
        try {
            await call(mergedParams);
        } finally {
            setLoading(false);
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
            <>
                <ConfirmDialog />
                <SplitButton {...buttonProps} model={splitItems} />
            </>
        );
    }

    return (
        <>
            <ConfirmDialog />
            <Button {...buttonProps} />
        </>
    );
}
