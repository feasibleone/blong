/**
 * The PrimeReact components the portal shell renders before any page loads.
 *
 * `index.tsx` wraps every PrimeReact component the package uses, which is right for
 * the widgets but wrong for the login screen: a dev server serves one module per
 * request and does not tree-shake, so importing three symbols from that barrel made
 * the browser fetch all of them — 45 pre-bundled PrimeReact chunks (1.5 MB, of which
 * the shell needs 0.3 MB) before the login form could paint. Every Playwright test
 * pays that load in a fresh browser context, so the shell imports what it draws from
 * this module instead. `index.tsx` re-exports it, so the public surface is unchanged.
 *
 * Same contract as `index.tsx`: a wrapper exists to hard-code the non-null defaults
 * PrimeReact's `defaultProps` used to supply, which React 19 no longer applies.
 * Consumers should import from `index.js` unless they are the shell itself — the split is @@D-745.
 */
import {Avatar as PrimeAvatar} from 'primereact/avatar';
import {Button as PrimeButton, type ButtonProps} from 'primereact/button';
import {ConfirmDialog as PrimeConfirmDialog} from 'primereact/confirmdialog';
import {ConfirmPopup as PrimeConfirmPopup} from 'primereact/confirmpopup';
import {Dialog as PrimeDialog} from 'primereact/dialog';
import {Dropdown as PrimeDropdown} from 'primereact/dropdown';
import {InputText as PrimeInputText, type InputTextProps} from 'primereact/inputtext';
import {Menu as PrimeMenu} from 'primereact/menu';
import {Menubar as PrimeMenubar} from 'primereact/menubar';
import {Message as PrimeMessage} from 'primereact/message';
import {OverlayPanel as PrimeOverlayPanel} from 'primereact/overlaypanel';
import {Password as PrimePassword} from 'primereact/password';
import {ProgressSpinner as PrimeProgressSpinner} from 'primereact/progressspinner';
import type {TabPanelProps as PrimeTabPanelProps} from 'primereact/tabview';
import {TabPanel as PrimeTabPanel, TabView as PrimeTabView} from 'primereact/tabview';
import {Toast as PrimeToast} from 'primereact/toast';
import React from 'react';
import {Text} from '../components/Text/Text.js';
import {nameOfLabel} from '../feedback/ids.js';
import {FeedbackPath, useFeedbackActive, useFeedbackNode} from '../feedback/useFeedbackTarget.js';
import {usePlaceholder} from '../hooks/useText.js';
import {useAppStore} from '../state/appStore.js';

import type {AvatarProps} from 'primereact/avatar';
import type {ConfirmDialogProps} from 'primereact/confirmdialog';
import type {ConfirmPopupProps} from 'primereact/confirmpopup';
import type {DialogProps} from 'primereact/dialog';
import type {DropdownProps} from 'primereact/dropdown';
import type {MenuProps} from 'primereact/menu';
import type {MenubarProps} from 'primereact/menubar';
import type {MenuItem} from 'primereact/menuitem';
import type {MessageProps} from 'primereact/message';
import type {OverlayPanelProps} from 'primereact/overlaypanel';
import type {PasswordProps} from 'primereact/password';
import type {ProgressSpinnerProps} from 'primereact/progressspinner';
import type {TabViewProps} from 'primereact/tabview';
import type {ToastProps} from 'primereact/toast';

// ── Re-exported functions / utilities (not affected by defaultProps removal) ─

export {addLocale, locale, PrimeReactProvider} from 'primereact/api';

// ── Types ────────────────────────────────────────────────────────────────────

/** The prop types of the components above, re-exported so a shell component can annotate its
 *  own props without reaching past this module into `primereact/*`. */
export type {
    AvatarProps,
    ButtonProps,
    ConfirmDialogProps,
    ConfirmPopupProps,
    DialogProps,
    DropdownProps,
    InputTextProps,
    MenubarProps,
    MenuItem,
    MenuProps,
    MessageProps,
    OverlayPanelProps,
    PasswordProps,
    ProgressSpinnerProps,
    TabViewProps,
    ToastProps,
};

/** TabPanelProps extended with the `__TYPE` discriminator PrimeReact TabView uses to identify
 *  panel children. React 19 removed defaultProps support, so callers pass `__TYPE="TabPanel"`
 *  explicitly; this type makes that prop valid. */
export type TabPanelProps = PrimeTabPanelProps & {__TYPE?: string};

// ── Component wrappers ───────────────────────────────────────────────────────

// Avatar — shape:'square', size:'normal', imageAlt:'avatar'
export function Avatar({
    shape = 'square',
    size = 'normal',
    imageAlt = 'avatar',
    ...props
}: AvatarProps) {
    return (
        <PrimeAvatar
            shape={shape}
            size={size}
            imageAlt={imageAlt}
            {...props}
        />
    );
}

// Button — iconPos:'left', plus the label translation and feedback annotation.
export function Button({
    'aria-label': ariaLabel,
    label,
    iconPos = 'left',
    feedbackName,
    ...props
}: ButtonProps & {feedbackName?: string}) {
    const translations = useAppStore(s => s.translations);
    // The slug is only derived while the mode is on: a button that is not being
    // annotated costs one context read and nothing else (`@@D-667`).
    const active = useFeedbackActive();
    const name = active
        ? (feedbackName ?? nameOfLabel(typeof label === 'string' ? label : ariaLabel))
        : undefined;
    const node = useFeedbackNode('button', name, typeof label === 'string' ? label : ariaLabel);
    if (typeof label === 'string') {
        const accessibleName = ariaLabel ?? translations[label] ?? label;
        return (
            <PrimeButton
                {...node?.attributes}
                {...props}
                iconPos={iconPos}
                label={
                    (node ? (
                        <FeedbackPath path={node.path}>
                            <Text>{label}</Text>
                        </FeedbackPath>
                    ) : (
                        <Text>{label}</Text>
                    )) as unknown as string
                }
                aria-label={accessibleName}
            />
        );
    }
    return (
        <PrimeButton
            {...node?.attributes}
            {...props}
            iconPos={iconPos}
            label={label}
            aria-label={ariaLabel}
        />
    );
}

// ConfirmDialog — no meaningful non-null defaults
export function ConfirmDialog(props: ConfirmDialogProps) {
    return <PrimeConfirmDialog {...props} />;
}

// ConfirmPopup — dismissable:true
export function ConfirmPopup({dismissable = true, ...props}: ConfirmPopupProps) {
    return (
        <PrimeConfirmPopup
            dismissable={dismissable}
            {...props}
        />
    );
}

// Dialog — modal:true, position:'center', draggable:true, resizable:true, closable:true,
//          closeOnEscape:true, focusOnShow:true, showHeader:true, keepInViewport:true, minX:0, minY:0
export function Dialog({
    modal = true,
    position = 'center',
    draggable = true,
    resizable = true,
    closable = true,
    closeOnEscape = true,
    focusOnShow = true,
    showHeader = true,
    keepInViewport = true,
    minX = 0,
    minY = 0,
    baseZIndex = 0,
    ...props
}: DialogProps) {
    return (
        <PrimeDialog
            modal={modal}
            position={position}
            draggable={draggable}
            resizable={resizable}
            closable={closable}
            closeOnEscape={closeOnEscape}
            focusOnShow={focusOnShow}
            showHeader={showHeader}
            keepInViewport={keepInViewport}
            minX={minX}
            minY={minY}
            baseZIndex={baseZIndex}
            {...props}
        />
    );
}

// Dropdown — dropdownIcon:'pi pi-chevron-down', scrollHeight:'200px', filterMatchMode:'contains'
export function Dropdown({
    dropdownIcon = 'pi pi-chevron-down',
    scrollHeight = '200px',
    filterMatchMode = 'contains',
    placeholder,
    ...props
}: DropdownProps) {
    return (
        <PrimeDropdown
            dropdownIcon={dropdownIcon}
            scrollHeight={scrollHeight}
            filterMatchMode={filterMatchMode}
            {...usePlaceholder(placeholder)}
            {...props}
        />
    );
}

// InputText — no meaningful non-null/non-false defaults (validateOnly:false is the default)
export function InputText({placeholder, ...props}: InputTextProps) {
    return (
        <PrimeInputText
            {...usePlaceholder(placeholder)}
            {...props}
        />
    );
}

// Menubar — no meaningful non-null defaults
export function Menubar(props: MenubarProps) {
    return <PrimeMenubar {...props} />;
}

// Menu — popup:false, popupAlignment:'left', tabIndex:0, autoZIndex:true, baseZIndex:0
export type Menu = PrimeMenu;
export function Menu({
    ref,
    popup = false,
    popupAlignment = 'left',
    tabIndex = 0,
    autoZIndex = true,
    baseZIndex = 0,
    ...props
}: MenuProps & {ref?: React.Ref<PrimeMenu>}) {
    return (
        <PrimeMenu
            ref={ref}
            popup={popup}
            popupAlignment={popupAlignment}
            tabIndex={tabIndex}
            autoZIndex={autoZIndex}
            baseZIndex={baseZIndex}
            {...props}
        />
    );
}

// Message — severity:'info'
export function Message({severity = 'info', ...props}: MessageProps) {
    return (
        <PrimeMessage
            severity={severity}
            {...props}
        />
    );
}

// OverlayPanel — dismissable:true
export type OverlayPanel = PrimeOverlayPanel;
export function OverlayPanel({
    ref,
    dismissable = true,
    ...props
}: OverlayPanelProps & {ref?: React.Ref<PrimeOverlayPanel>}) {
    return (
        <PrimeOverlayPanel
            dismissable={dismissable}
            ref={ref}
            {...props}
        />
    );
}

// Password — feedback:true, mediumRegex:'...', strongRegex:'...'
export function Password({
    feedback = false,
    mediumRegex = '^(((?=.*[a-z])(?=.*[A-Z]))|((?=.*[a-z])(?=.*[0-9]))|((?=.*[A-Z])(?=.*[0-9])))(?=.{6,})',
    strongRegex = '^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{8,})',
    ...props
}: PasswordProps) {
    return (
        <PrimePassword
            feedback={feedback}
            mediumRegex={mediumRegex}
            strongRegex={strongRegex}
            {...props}
        />
    );
}

// ProgressSpinner — strokeWidth:'2', fill:'none', animationDuration:'2s'
export function ProgressSpinner({
    strokeWidth = '2',
    fill = 'none',
    animationDuration = '2s',
    ...props
}: ProgressSpinnerProps) {
    return (
        <PrimeProgressSpinner
            strokeWidth={strokeWidth}
            fill={fill}
            animationDuration={animationDuration}
            {...props}
        />
    );
}

// TabPanel — thin wrapper that adds `__TYPE` to the prop type.
// React 19 no longer applies defaultProps, so PrimeReact's TabView cannot auto-inject
// __TYPE:'TabPanel' onto elements.  Callers pass it explicitly; this wrapper makes that valid.
// TabView never mounts TabPanel — it only reads element.props — so the wrapper is transparent.
export function TabPanel({__TYPE: _type, ...props}: TabPanelProps) {
    return <PrimeTabPanel {...(props as PrimeTabPanelProps)} />;
}

// TabView — activeIndex:0, renderActiveOnly:true
export function TabView({activeIndex = 0, renderActiveOnly = true, ...props}: TabViewProps) {
    return (
        <PrimeTabView
            activeIndex={activeIndex}
            renderActiveOnly={renderActiveOnly}
            {...props}
        />
    );
}

// Toast — position:'top-right', baseZIndex:0, appendTo:'self'
export type Toast = PrimeToast;
export function Toast({
    ref,
    position = 'top-right',
    baseZIndex = 0,
    appendTo = 'self',
    ...props
}: ToastProps & {ref?: React.Ref<PrimeToast>}) {
    return (
        <PrimeToast
            position={position}
            baseZIndex={baseZIndex}
            appendTo={appendTo}
            ref={ref}
            {...props}
        />
    );
}
