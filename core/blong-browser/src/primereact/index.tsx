/**
 * PrimeReact intermediary components for blong-browser.
 *
 * React 19 removed support for `defaultProps` on function components. This file
 * wraps every PrimeReact component used in blong-browser and hard-codes the
 * non-null / non-undefined default prop values that PrimeReact previously relied
 * on `defaultProps` to supply.
 *
 * Consumers should import from this module instead of directly from 'primereact/*'.
 * Functions and types that are not affected (e.g. `addLocale`, `locale`, `confirmDialog`,
 * `SplitterPanel`, `TabPanel`) are re-exported as-is.
 */

// ── Re-exported functions / utilities (not affected by defaultProps removal) ─

export {addLocale, locale, PrimeReactProvider} from 'primereact/api';
export {confirmDialog} from 'primereact/confirmdialog';
export {confirmPopup} from 'primereact/confirmpopup';
export {SplitterPanel} from 'primereact/splitter';
// ── Type re-exports ──────────────────────────────────────────────────────────

export type {AutoCompleteProps} from 'primereact/autocomplete';
export type {BreadCrumbProps} from 'primereact/breadcrumb';
export type {ButtonProps} from 'primereact/button';
export type {CalendarProps} from 'primereact/calendar';
export type {CardProps} from 'primereact/card';
export type {CheckboxProps} from 'primereact/checkbox';
export type {ChipsProps} from 'primereact/chips';
export type {ColumnProps} from 'primereact/column';
export type {ConfirmDialogProps} from 'primereact/confirmdialog';
export type {ConfirmPopupProps} from 'primereact/confirmpopup';
export type {DataTableProps} from 'primereact/datatable';
export type {DataViewProps} from 'primereact/dataview';
export type {DialogProps} from 'primereact/dialog';
export type {DropdownProps} from 'primereact/dropdown';
export type {FileUploadProps} from 'primereact/fileupload';
export type {ImageProps} from 'primereact/image';
export type {InputMaskProps} from 'primereact/inputmask';
export type {InputNumberProps} from 'primereact/inputnumber';
export type {InputTextProps} from 'primereact/inputtext';
export type {InputTextareaProps} from 'primereact/inputtextarea';
export type {MenubarProps} from 'primereact/menubar';
export type {MessageProps} from 'primereact/message';
export type {MultiSelectProps} from 'primereact/multiselect';
export type {OverlayPanelProps} from 'primereact/overlaypanel';
export type {PanelProps} from 'primereact/panel';
export type {PanelMenuProps} from 'primereact/panelmenu';
export type {PasswordProps} from 'primereact/password';
export type {ProgressBarProps} from 'primereact/progressbar';
export type {ProgressSpinnerProps} from 'primereact/progressspinner';
export type {SelectButtonProps} from 'primereact/selectbutton';
export type {SkeletonProps} from 'primereact/skeleton';
export type {SplitButtonProps} from 'primereact/splitbutton';
export type {SplitterProps} from 'primereact/splitter';
export type {StepsProps} from 'primereact/steps';
export type {TabMenuProps} from 'primereact/tabmenu';
export type {TabViewProps} from 'primereact/tabview';
export type {ToastProps} from 'primereact/toast';
export type {ToolbarProps} from 'primereact/toolbar';
export type {TreeProps} from 'primereact/tree';
export type {TreeNode} from 'primereact/treenode';
export type {TreeSelectProps} from 'primereact/treeselect';
export type {TreeTableProps} from 'primereact/treetable';
/** Compatibility alias: renamed/split in PrimeReact 10 — use onSelectionChange event directly for new code. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataTableSelectionChangeParams = {value: any; originalEvent?: any};
/** Sort event type extracted from DataTableProps (DataTableStateEvent is not exported in v10). */
export type DataTableSortParams = Parameters<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    NonNullable<import('primereact/datatable').DataTableProps<Record<string, any>[]>['onSort']>
>[0];
/** TabPanelProps extended with the `__TYPE` discriminator PrimeReact TabView uses to identify
 *  panel children. React 19 removed defaultProps support, so callers pass `__TYPE="TabPanel"`
 *  explicitly; this type makes that prop valid. */
export type TabPanelProps = import('primereact/tabview').TabPanelProps & {__TYPE?: string};

// ── Component wrappers ───────────────────────────────────────────────────────

import {AutoComplete as PrimeAutoComplete} from 'primereact/autocomplete';
import {BreadCrumb as PrimeBreadCrumb} from 'primereact/breadcrumb';
import {Button as PrimeButton, type ButtonProps} from 'primereact/button';
import {Calendar as PrimeCalendar} from 'primereact/calendar';
import {Card as PrimeCard} from 'primereact/card';
import {Checkbox as PrimeCheckbox} from 'primereact/checkbox';
import {Chips as PrimeChips} from 'primereact/chips';
import {Column as PrimeColumn} from 'primereact/column';
import {ConfirmDialog as PrimeConfirmDialog} from 'primereact/confirmdialog';
import {ConfirmPopup as PrimeConfirmPopup} from 'primereact/confirmpopup';
import {DataTable as PrimeDataTable} from 'primereact/datatable';
import {DataView as PrimeDataView} from 'primereact/dataview';
import {Dialog as PrimeDialog} from 'primereact/dialog';
import {Dropdown as PrimeDropdown} from 'primereact/dropdown';
import {FileUpload as PrimeFileUpload} from 'primereact/fileupload';
import {Image as PrimeImage} from 'primereact/image';
import {InputMask as PrimeInputMask} from 'primereact/inputmask';
import {InputNumber as PrimeInputNumber} from 'primereact/inputnumber';
import {InputText as PrimeInputText} from 'primereact/inputtext';
import {InputTextarea as PrimeInputTextarea} from 'primereact/inputtextarea';
import {Menubar as PrimeMenubar} from 'primereact/menubar';
import {Message as PrimeMessage} from 'primereact/message';
import {MultiSelect as PrimeMultiSelect} from 'primereact/multiselect';
import {OverlayPanel as PrimeOverlayPanel} from 'primereact/overlaypanel';
import {Panel as PrimePanel} from 'primereact/panel';
import {PanelMenu as PrimePanelMenu} from 'primereact/panelmenu';
import {Password as PrimePassword} from 'primereact/password';
import {ProgressBar as PrimeProgressBar} from 'primereact/progressbar';
import {ProgressSpinner as PrimeProgressSpinner} from 'primereact/progressspinner';
import {SelectButton as PrimeSelectButton} from 'primereact/selectbutton';
import {Skeleton as PrimeSkeleton} from 'primereact/skeleton';
import {SplitButton as PrimeSplitButton} from 'primereact/splitbutton';
import {Splitter as PrimeSplitter} from 'primereact/splitter';
import {Steps as PrimeSteps} from 'primereact/steps';
import {TabMenu as PrimeTabMenu} from 'primereact/tabmenu';
import type {TabPanelProps as PrimeTabPanelProps} from 'primereact/tabview';
import {TabPanel as PrimeTabPanel, TabView as PrimeTabView} from 'primereact/tabview';
import {Toast as PrimeToast} from 'primereact/toast';
import {Toolbar as PrimeToolbar} from 'primereact/toolbar';
import {Tree as PrimeTree} from 'primereact/tree';
import {TreeSelect as PrimeTreeSelect} from 'primereact/treeselect';
import {TreeTable as PrimeTreeTable} from 'primereact/treetable';
import React from 'react';
import {Text} from '../components/Text/Text.js';
import {useAppStore} from '../state/appStore.js';

import type {AutoCompleteProps} from 'primereact/autocomplete';
import type {BreadCrumbProps} from 'primereact/breadcrumb';
import type {CalendarProps} from 'primereact/calendar';
import type {CardProps} from 'primereact/card';
import type {CheckboxProps} from 'primereact/checkbox';
import type {ChipsProps} from 'primereact/chips';
import type {ColumnProps} from 'primereact/column';
import type {ConfirmDialogProps} from 'primereact/confirmdialog';
import type {ConfirmPopupProps} from 'primereact/confirmpopup';
import type {DataViewProps} from 'primereact/dataview';
import type {DialogProps} from 'primereact/dialog';
import type {DropdownProps} from 'primereact/dropdown';
import type {FileUploadProps} from 'primereact/fileupload';
import type {ImageProps} from 'primereact/image';
import type {InputMaskProps} from 'primereact/inputmask';
import type {InputNumberProps} from 'primereact/inputnumber';
import type {InputTextProps} from 'primereact/inputtext';
import type {InputTextareaProps} from 'primereact/inputtextarea';
import type {MenubarProps} from 'primereact/menubar';
import type {MessageProps} from 'primereact/message';
import type {MultiSelectProps} from 'primereact/multiselect';
import type {OverlayPanelProps} from 'primereact/overlaypanel';
import type {PanelProps} from 'primereact/panel';
import type {PanelMenuProps} from 'primereact/panelmenu';
import type {PasswordProps} from 'primereact/password';
import type {ProgressBarProps} from 'primereact/progressbar';
import type {ProgressSpinnerProps} from 'primereact/progressspinner';
import type {SelectButtonProps} from 'primereact/selectbutton';
import type {SkeletonProps} from 'primereact/skeleton';
import type {SplitButtonProps} from 'primereact/splitbutton';
import type {SplitterProps} from 'primereact/splitter';
import type {StepsProps} from 'primereact/steps';
import type {TabMenuProps} from 'primereact/tabmenu';
import type {TabViewProps} from 'primereact/tabview';
import type {ToastProps} from 'primereact/toast';
import type {ToolbarProps} from 'primereact/toolbar';
import type {TreeProps} from 'primereact/tree';
import type {TreeSelectProps} from 'primereact/treeselect';
import type {TreeTableProps} from 'primereact/treetable';

// AutoComplete — delay:300, minLength:1, scrollHeight:'200px', dropdownIcon:'pi pi-chevron-down', removeTokenIcon:'pi pi-times-circle'
export function AutoComplete({
    delay = 300,
    minLength = 1,
    scrollHeight = '200px',
    dropdownIcon = 'pi pi-chevron-down',
    removeTokenIcon = 'pi pi-times-circle',
    ...props
}: AutoCompleteProps) {
    return (
        <PrimeAutoComplete
            delay={delay}
            minLength={minLength}
            scrollHeight={scrollHeight}
            dropdownIcon={dropdownIcon}
            removeTokenIcon={removeTokenIcon}
            {...props}
        />
    );
}

// BreadCrumb — no meaningful non-null defaults
export function BreadCrumb(props: BreadCrumbProps) {
    return <PrimeBreadCrumb {...props} />;
}

/**
 * Button — wraps PrimeReact Button with automatic label translation via the
 * `Text` component and a default `iconPos='left'`.
 */
export function Button({'aria-label': ariaLabel, label, iconPos = 'left', ...props}: ButtonProps) {
    const translations = useAppStore(s => s.translations);
    if (typeof label === 'string') {
        const accessibleName = ariaLabel ?? translations[label] ?? label;
        return (
            <PrimeButton
                {...props}
                iconPos={iconPos}
                label={(<Text>{label}</Text>) as unknown as string}
                aria-label={accessibleName}
            />
        );
    }
    return (
        <PrimeButton
            {...props}
            iconPos={iconPos}
            label={label}
            aria-label={ariaLabel}
        />
    );
}

// Calendar — showOnFocus:true, selectionMode:'single', iconPos:'right', hourFormat:'24', icon:'pi pi-calendar'
//            numberOfMonths:1, stepHour:1, stepMinute:1, stepSecond:1, stepMillisec:1
export function Calendar({
    showOnFocus = true,
    selectionMode = 'single',
    iconPos = 'right',
    hourFormat = '24',
    icon = 'pi pi-calendar' as CalendarProps['icon'],
    numberOfMonths = 1,
    stepHour = 1,
    stepMinute = 1,
    stepSecond = 1,
    stepMillisec = 1,
    shortYearCutoff = '+10',
    view = 'date',
    clearButtonClassName = 'p-button-secondary',
    todayButtonClassName = 'p-button-secondary',
    ...props
}: CalendarProps) {
    return (
        <PrimeCalendar
            showOnFocus={showOnFocus}
            selectionMode={selectionMode}
            iconPos={iconPos}
            hourFormat={hourFormat}
            icon={icon}
            numberOfMonths={numberOfMonths}
            stepHour={stepHour}
            stepMinute={stepMinute}
            stepSecond={stepSecond}
            stepMillisec={stepMillisec}
            shortYearCutoff={shortYearCutoff}
            view={view}
            clearButtonClassName={clearButtonClassName}
            todayButtonClassName={todayButtonClassName}
            {...props}
        />
    );
}

// Card — no meaningful non-null defaults
export function Card(props: CardProps) {
    return <PrimeCard {...props} />;
}

// Checkbox — trueValue:true, falseValue:false, icon:'pi pi-check'
export function Checkbox({
    trueValue = true,
    falseValue = false,
    icon = 'pi pi-check',
    ...props
}: CheckboxProps) {
    return (
        <PrimeCheckbox
            trueValue={trueValue}
            falseValue={falseValue}
            icon={icon}
            {...props}
        />
    );
}

// Chips — removable:true, allowDuplicate:true
export function Chips({removable = true, allowDuplicate = true, ...props}: ChipsProps) {
    return (
        <PrimeChips
            removable={removable}
            allowDuplicate={allowDuplicate}
            {...props}
        />
    );
}

// Column — showFilterMenu:true, showFilterMatchModes:true, showFilterOperator:true, showAddButton:true,
//          showApplyButton:true, showClearButton:true, showFilterMenuOptions:true,
//          dataType:'text', filterType:'text', maxConstraints:2, rowReorderIcon:'pi pi-bars',
//          alignFrozen:'left', cellEditValidatorEvent:'click', exportable:true, reorderable:true, resizeable:true
export function Column({
    showFilterMenu = true,
    showFilterMatchModes = true,
    showFilterOperator = true,
    showAddButton = true,
    showApplyButton = true,
    showClearButton = true,
    showFilterMenuOptions = true,
    dataType = 'text',
    filterType = 'text',
    maxConstraints = 2,
    rowReorderIcon = 'pi pi-bars',
    alignFrozen = 'left',
    cellEditValidatorEvent = 'click',
    exportable = true,
    reorderable = true,
    resizeable = true,
    ...props
}: ColumnProps) {
    return (
        <PrimeColumn
            showFilterMenu={showFilterMenu}
            showFilterMatchModes={showFilterMatchModes}
            showFilterOperator={showFilterOperator}
            showAddButton={showAddButton}
            showApplyButton={showApplyButton}
            showClearButton={showClearButton}
            showFilterMenuOptions={showFilterMenuOptions}
            dataType={dataType}
            filterType={filterType}
            maxConstraints={maxConstraints}
            rowReorderIcon={rowReorderIcon}
            alignFrozen={alignFrozen}
            cellEditValidatorEvent={cellEditValidatorEvent}
            exportable={exportable}
            reorderable={reorderable}
            resizeable={resizeable}
            {...props}
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

// DataTable — first:0, size:'normal', editMode:'cell', sortMode:'single', columnResizeMode:'fit',
//             defaultSortOrder:1, filterDelay:300, filterDisplay:'menu', pageLinkSize:5,
//             csvSeparator:',', exportFilename:'download', breakpoint:'960px',
//             paginatorPosition:'bottom', paginatorTemplate:'...', currentPageReportTemplate:'...',
//             loadingIcon:'pi pi-spinner', expandedRowIcon:'pi pi-chevron-down',
//             collapsedRowIcon:'pi pi-chevron-right', tabIndex:0, scrollDirection:'vertical',
//             stateStorage:'session', compareSelectionBy:'deepEquals'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataTable = PrimeDataTable<any>;
// Wrapper accepts any DataTable-compatible props. We use a permissive index signature here
// because DataTableProps<T> is a discriminated union (single/multiple/cell-single/cell-multiple)
// that rejects mixed props at compile time, which conflicts with dynamic selectionMode usage.
export function DataTable({
    ref,
    first = 0,
    size = 'normal',
    editMode = 'cell',
    sortMode = 'single',
    columnResizeMode = 'fit',
    defaultSortOrder = 1,
    filterDelay = 300,
    filterDisplay = 'menu',
    pageLinkSize = 5,
    csvSeparator = ',',
    exportFilename = 'download',
    breakpoint = '960px',
    paginatorPosition = 'bottom',
    paginatorTemplate = 'FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown',
    currentPageReportTemplate = '({currentPage} of {totalPages})',
    loadingIcon = 'pi pi-spinner',
    expandedRowIcon = 'pi pi-chevron-down',
    collapsedRowIcon = 'pi pi-chevron-right',
    tabIndex = 0,
    stateStorage = 'session',
    compareSelectionBy = 'deepEquals',
    ...props
}: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ref?: React.Ref<PrimeDataTable<any>>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}) {
    return (
        <PrimeDataTable
            first={first}
            size={size}
            editMode={editMode}
            sortMode={sortMode}
            columnResizeMode={columnResizeMode}
            defaultSortOrder={defaultSortOrder}
            filterDelay={filterDelay}
            filterDisplay={filterDisplay}
            pageLinkSize={pageLinkSize}
            csvSeparator={csvSeparator}
            exportFilename={exportFilename}
            breakpoint={breakpoint}
            paginatorPosition={paginatorPosition}
            paginatorTemplate={paginatorTemplate}
            currentPageReportTemplate={currentPageReportTemplate}
            loadingIcon={loadingIcon}
            expandedRowIcon={expandedRowIcon}
            collapsedRowIcon={collapsedRowIcon}
            tabIndex={tabIndex}
            stateStorage={stateStorage}
            compareSelectionBy={compareSelectionBy}
            ref={ref}
            {...props}
        />
    );
}

// DataView — layout:'list', first:0, paginatorPosition:'bottom', pageLinkSize:5,
//            loadingIcon:'pi pi-spinner', paginatorTemplate:'...', currentPageReportTemplate:'...'
export function DataView({
    layout = 'list',
    first = 0,
    paginatorPosition = 'bottom',
    pageLinkSize = 5,
    loadingIcon = 'pi pi-spinner',
    paginatorTemplate = 'FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown',
    currentPageReportTemplate = '({currentPage} of {totalPages})',
    ...props
}: DataViewProps) {
    return (
        <PrimeDataView
            layout={layout}
            first={first}
            paginatorPosition={paginatorPosition}
            pageLinkSize={pageLinkSize}
            loadingIcon={loadingIcon}
            paginatorTemplate={paginatorTemplate}
            currentPageReportTemplate={currentPageReportTemplate}
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
    ...props
}: DropdownProps) {
    return (
        <PrimeDropdown
            dropdownIcon={dropdownIcon}
            scrollHeight={scrollHeight}
            filterMatchMode={filterMatchMode}
            {...props}
        />
    );
}

// FileUpload — mode:'advanced', previewWidth:50
export type FileUpload = PrimeFileUpload;
export function FileUpload({
    ref,
    mode = 'advanced',
    previewWidth = 50,
    ...props
}: FileUploadProps & {ref?: React.Ref<PrimeFileUpload>}) {
    return (
        <PrimeFileUpload
            mode={mode}
            previewWidth={previewWidth}
            ref={ref}
            {...props}
        />
    );
}

// Image — no meaningful non-null defaults
export function Image(props: ImageProps) {
    return <PrimeImage {...props} />;
}

// InputMask — type:'text', slotChar:'_', autoClear:true
export function InputMask({
    type = 'text',
    slotChar = '_',
    autoClear = true,
    ...props
}: InputMaskProps) {
    return (
        <PrimeInputMask
            type={type}
            slotChar={slotChar}
            autoClear={autoClear}
            {...props}
        />
    );
}

// InputNumber — mode:'decimal', buttonLayout:'stacked', step:1, type:'text',
//               incrementButtonIcon:'pi pi-angle-up', decrementButtonIcon:'pi pi-angle-down', useGrouping:true
export function InputNumber({
    mode = 'decimal',
    buttonLayout = 'stacked',
    step = 1,
    type = 'text',
    incrementButtonIcon = 'pi pi-angle-up',
    decrementButtonIcon = 'pi pi-angle-down',
    useGrouping = true,
    ...props
}: InputNumberProps) {
    return (
        <PrimeInputNumber
            mode={mode}
            buttonLayout={buttonLayout}
            step={step}
            type={type}
            incrementButtonIcon={incrementButtonIcon}
            decrementButtonIcon={decrementButtonIcon}
            useGrouping={useGrouping}
            {...props}
        />
    );
}

// InputText — no meaningful non-null/non-false defaults (validateOnly:false is the default)
export function InputText(props: InputTextProps) {
    return <PrimeInputText {...props} />;
}

// InputTextarea — no meaningful non-null defaults (autoResize:false is default)
export function InputTextarea(props: InputTextareaProps) {
    return <PrimeInputTextarea {...props} />;
}

// Menubar — no meaningful non-null defaults
export function Menubar(props: MenubarProps) {
    return <PrimeMenubar {...props} />;
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

// MultiSelect — display:'comma', dropdownIcon:'pi pi-chevron-down', scrollHeight:'200px',
//              filterMatchMode:'contains', removeIcon:'pi pi-times-circle',
//              selectedItemsLabel:'{0} items selected', tabIndex:0
export function MultiSelect({
    display = 'comma',
    dropdownIcon = 'pi pi-chevron-down',
    scrollHeight = '200px',
    filterMatchMode = 'contains',
    removeIcon = 'pi pi-times-circle',
    selectedItemsLabel = '{0} items selected',
    tabIndex = 0,
    ...props
}: MultiSelectProps) {
    return (
        <PrimeMultiSelect
            display={display}
            dropdownIcon={dropdownIcon}
            scrollHeight={scrollHeight}
            filterMatchMode={filterMatchMode}
            removeIcon={removeIcon}
            selectedItemsLabel={selectedItemsLabel}
            tabIndex={tabIndex}
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

// Panel — expandIcon:'pi pi-plus', collapseIcon:'pi pi-minus'
export function Panel({
    expandIcon = 'pi pi-plus',
    collapseIcon = 'pi pi-minus',
    ...props
}: PanelProps) {
    return (
        <PrimePanel
            expandIcon={expandIcon}
            collapseIcon={collapseIcon}
            {...props}
        />
    );
}

// PanelMenu — no meaningful non-null defaults (multiple:false is default)
export function PanelMenu(props: PanelMenuProps) {
    return <PrimePanelMenu {...props} />;
}

// Password — feedback:true, mediumRegex:'...', strongRegex:'...'
export function Password({
    feedback = true,
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

// ProgressBar — showValue:true, unit:'%', mode:'determinate'
export function ProgressBar({
    showValue = true,
    unit = '%',
    mode = 'determinate',
    ...props
}: ProgressBarProps) {
    return (
        <PrimeProgressBar
            showValue={showValue}
            unit={unit}
            mode={mode}
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

// SelectButton — unselectable:true
export function SelectButton({unselectable = true, ...props}: SelectButtonProps) {
    return (
        <PrimeSelectButton
            unselectable={unselectable}
            {...props}
        />
    );
}

// Skeleton — shape:'rectangle', width:'100%', height:'1rem', animation:'wave'
export function Skeleton({
    shape = 'rectangle',
    width = '100%',
    height = '1rem',
    animation = 'wave',
    ...props
}: SkeletonProps) {
    return (
        <PrimeSkeleton
            shape={shape}
            width={width}
            height={height}
            animation={animation}
            {...props}
        />
    );
}

// SplitButton — dropdownIcon:'pi pi-chevron-down', loadingIcon:'pi pi-spinner pi-spin'
export function SplitButton({
    dropdownIcon = 'pi pi-chevron-down',
    loadingIcon = 'pi pi-spinner pi-spin',
    ...props
}: SplitButtonProps) {
    return (
        <PrimeSplitButton
            dropdownIcon={dropdownIcon}
            loadingIcon={loadingIcon}
            {...props}
        />
    );
}

// Splitter — gutterSize:4, layout:'horizontal', stateStorage:'session'
export function Splitter({
    gutterSize = 4,
    layout = 'horizontal',
    stateStorage = 'session',
    ...props
}: SplitterProps) {
    return (
        <PrimeSplitter
            gutterSize={gutterSize}
            layout={layout}
            stateStorage={stateStorage}
            {...props}
        />
    );
}

// Steps — activeIndex:0, readOnly:true
export function Steps({activeIndex = 0, readOnly = true, ...props}: StepsProps) {
    return (
        <PrimeSteps
            activeIndex={activeIndex}
            readOnly={readOnly}
            {...props}
        />
    );
}

// TabMenu — activeIndex:0
export function TabMenu({activeIndex = 0, ...props}: TabMenuProps) {
    return (
        <PrimeTabMenu
            activeIndex={activeIndex}
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

// Toolbar — no meaningful non-null defaults
export function Toolbar(props: ToolbarProps) {
    return <PrimeToolbar {...props} />;
}

// Tree — filterBy:'label', filterMode:'lenient', loadingIcon:'pi pi-spinner'
//         propagateSelectionUp:true, propagateSelectionDown:true, showHeader:true
export function Tree({
    filterBy = 'label',
    filterMode = 'lenient',
    loadingIcon = 'pi pi-spinner',
    propagateSelectionUp = true,
    propagateSelectionDown = true,
    showHeader = true,
    ...props
}: TreeProps) {
    return (
        <PrimeTree
            filterBy={filterBy}
            filterMode={filterMode}
            loadingIcon={loadingIcon}
            propagateSelectionUp={propagateSelectionUp}
            propagateSelectionDown={propagateSelectionDown}
            showHeader={showHeader}
            {...props}
        />
    );
}

// TreeSelect — display:'comma', dropdownIcon:'pi pi-chevron-down', scrollHeight:'400px',
//              filterBy:'label', filterMode:'lenient', selectionMode:'single'
export function TreeSelect({
    display = 'comma',
    dropdownIcon = 'pi pi-chevron-down',
    scrollHeight = '400px',
    filterBy = 'label',
    filterMode = 'lenient',
    selectionMode = 'single',
    ...props
}: TreeSelectProps) {
    return (
        <PrimeTreeSelect
            display={display}
            dropdownIcon={dropdownIcon}
            scrollHeight={scrollHeight}
            filterBy={filterBy}
            filterMode={filterMode}
            selectionMode={selectionMode}
            {...props}
        />
    );
}

// TreeTable — first:0, sortMode:'single', columnResizeMode:'fit', defaultSortOrder:1,
//             filterDelay:300, filterMode:'lenient', pageLinkSize:5, loadingIcon:'pi pi-spinner',
//             paginatorPosition:'bottom', paginatorTemplate:'...', currentPageReportTemplate:'...',
//             propagateSelectionUp:true, propagateSelectionDown:true, tabIndex:0, stateStorage:'session'
export function TreeTable({
    sortMode = 'single',
    columnResizeMode = 'fit',
    defaultSortOrder = 1,
    filterDelay = 300,
    filterMode = 'lenient',
    pageLinkSize = 5,
    loadingIcon = 'pi pi-spinner',
    paginatorPosition = 'bottom',
    paginatorTemplate = 'FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown',
    currentPageReportTemplate = '({currentPage} of {totalPages})',
    propagateSelectionUp = true,
    propagateSelectionDown = true,
    tabIndex = 0,
    ...props
}: TreeTableProps) {
    return (
        <PrimeTreeTable
            sortMode={sortMode}
            columnResizeMode={columnResizeMode}
            defaultSortOrder={defaultSortOrder}
            filterDelay={filterDelay}
            filterMode={filterMode}
            pageLinkSize={pageLinkSize}
            loadingIcon={loadingIcon}
            paginatorPosition={paginatorPosition}
            paginatorTemplate={paginatorTemplate}
            currentPageReportTemplate={currentPageReportTemplate}
            propagateSelectionUp={propagateSelectionUp}
            propagateSelectionDown={propagateSelectionDown}
            tabIndex={tabIndex}
            {...props}
        />
    );
}
