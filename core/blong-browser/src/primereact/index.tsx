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

export {confirmDialog} from 'primereact/confirmdialog';
export {confirmPopup} from 'primereact/confirmpopup';
export {SplitterPanel} from 'primereact/splitter';
export * from './shell.js';
// ── Type re-exports ──────────────────────────────────────────────────────────

export type {AutoCompleteProps} from 'primereact/autocomplete';
export type {AvatarProps} from 'primereact/avatar';
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
export type {MenuProps} from 'primereact/menu';
export type {MenubarProps} from 'primereact/menubar';
export type {MenuItem} from 'primereact/menuitem';
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

// ── Component wrappers ───────────────────────────────────────────────────────

import {AutoComplete as PrimeAutoComplete} from 'primereact/autocomplete';
import {BreadCrumb as PrimeBreadCrumb} from 'primereact/breadcrumb';
import {Calendar as PrimeCalendar} from 'primereact/calendar';
import {Card as PrimeCard} from 'primereact/card';
import {Checkbox as PrimeCheckbox} from 'primereact/checkbox';
import {Chips as PrimeChips} from 'primereact/chips';
import {Column as PrimeColumn} from 'primereact/column';
import {DataTable as PrimeDataTable} from 'primereact/datatable';
import {DataView as PrimeDataView} from 'primereact/dataview';
import {FileUpload as PrimeFileUpload} from 'primereact/fileupload';
import {Image as PrimeImage} from 'primereact/image';
import {InputMask as PrimeInputMask} from 'primereact/inputmask';
import {InputNumber as PrimeInputNumber} from 'primereact/inputnumber';
import {InputTextarea as PrimeInputTextarea} from 'primereact/inputtextarea';
import {MultiSelect as PrimeMultiSelect} from 'primereact/multiselect';
import {Panel as PrimePanel} from 'primereact/panel';
import {PanelMenu as PrimePanelMenu} from 'primereact/panelmenu';
import {ProgressBar as PrimeProgressBar} from 'primereact/progressbar';
import {SelectButton as PrimeSelectButton} from 'primereact/selectbutton';
import {Skeleton as PrimeSkeleton} from 'primereact/skeleton';
import {SplitButton as PrimeSplitButton} from 'primereact/splitbutton';
import {Splitter as PrimeSplitter} from 'primereact/splitter';
import {Steps as PrimeSteps} from 'primereact/steps';
import {TabMenu as PrimeTabMenu} from 'primereact/tabmenu';
import {Toolbar as PrimeToolbar} from 'primereact/toolbar';
import {Tree as PrimeTree} from 'primereact/tree';
import {TreeSelect as PrimeTreeSelect} from 'primereact/treeselect';
import {TreeTable as PrimeTreeTable} from 'primereact/treetable';
import React from 'react';
import {usePlaceholder} from '../hooks/useText.js';

import type {AutoCompleteProps} from 'primereact/autocomplete';
import type {BreadCrumbProps} from 'primereact/breadcrumb';
import type {CalendarProps} from 'primereact/calendar';
import type {CardProps} from 'primereact/card';
import type {CheckboxProps} from 'primereact/checkbox';
import type {ChipsProps} from 'primereact/chips';
import type {ColumnProps} from 'primereact/column';
import type {DataViewProps} from 'primereact/dataview';
import type {FileUploadProps} from 'primereact/fileupload';
import type {ImageProps} from 'primereact/image';
import type {InputMaskProps} from 'primereact/inputmask';
import type {InputNumberProps} from 'primereact/inputnumber';
import type {InputTextareaProps} from 'primereact/inputtextarea';
import type {MultiSelectProps} from 'primereact/multiselect';
import type {PanelProps} from 'primereact/panel';
import type {PanelMenuProps} from 'primereact/panelmenu';
import type {ProgressBarProps} from 'primereact/progressbar';
import type {SelectButtonProps} from 'primereact/selectbutton';
import type {SkeletonProps} from 'primereact/skeleton';
import type {SplitButtonProps} from 'primereact/splitbutton';
import type {SplitterProps} from 'primereact/splitter';
import type {StepsProps} from 'primereact/steps';
import type {TabMenuProps} from 'primereact/tabmenu';
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

// RadioButton — a single boolean as a radio, for a table cell that reads one
export {RadioButton} from 'primereact/radiobutton';
export type {RadioButtonProps} from 'primereact/radiobutton';

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

// InputTextarea — no meaningful non-null defaults (autoResize:false is default)
export function InputTextarea(props: InputTextareaProps) {
    return <PrimeInputTextarea {...props} />;
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
    placeholder,
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
            {...usePlaceholder(placeholder)}
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
    placeholder,
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
            {...usePlaceholder(placeholder)}
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
