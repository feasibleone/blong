/**
 * Card — container component grouping related fields with a label.
 * Extends PrimeReact Card; design-mode-aware.
 *
 * Two modes:
 *
 * 1. **Context-driven** (`cardName` prop): resolves its title, fields, and read-only
 *    state from the nearest Form's FormContext and renders the fields directly.
 *    This is the normal mode inside a Form/Deck hierarchy.
 *
 * 2. **Passthrough** (no `cardName`): behaves as a plain titled container and
 *    renders `children` as-is. Used for standalone layout and stories.
 */
import {useDndContext, useDraggable, useDroppable} from '@dnd-kit/core';
import {Card as PrimeCard, Skeleton} from '../../primereact/index.js';
import './index.css';

import type {IEnrichedFieldSchema, IEnrichedSchema} from '@feasibleone/blong';
import React, {useCallback, useMemo, useRef, useState, type ReactNode} from 'react';
import {
    Controller,
    type ControllerFieldState,
    type ControllerRenderProps,
    type UseFormStateReturn,
} from 'react-hook-form';
import {DropZone} from '../../design/DropZone.js';
import {SelectionIndicator} from '../../design/SelectionIndicator.js';
import {useDesignable} from '../../design/useDesignable.js';
import {useDesignMode} from '../../design/useDesignMode.js';
import {buildValidationRules} from '../../schema/validate.js';
import {useAppStore} from '../../state/appStore.js';
import {widgetRegistry} from '../../widgets/index.js';
import {
    useBlongForm,
    useBlongFormState,
    useFormValues,
    type ITableSelection,
} from '../Form/FormContext.js';
import {Text} from '../Text/index.js';

export interface ICardProps {
    /** Card title shown in the header */
    title?: string | ReactNode;
    children?: ReactNode;
    readOnly?: boolean;
    loading?: boolean;
    collapsible?: boolean;
    /** Additional CSS class */
    className?: string;
    /** Unique element ID for design-mode anchoring */
    id?: string;
    /**
     * When provided, the card resolves its title, fields, and read-only state
     * from the nearest Form context and renders its own fields.
     * The `children` prop is ignored when cardName is active.
     */
    cardName?: string;
    /** Column index within the form grid — supplied by Deck for design-mode DnD. */
    colIdx?: number;
}

// ---------------------------------------------------------------------------
// DraggableFieldRow — wraps a single field row with drag + selection in design mode
// ---------------------------------------------------------------------------

function DraggableFieldRow({
    fieldName,
    cardName,
    isLast,
    cardReadOnly,
}: {
    fieldName: string;
    cardName: string;
    isLast: boolean;
    cardReadOnly: boolean | undefined;
}) {
    const {active: isDesignMode, selected, select} = useDesignMode();
    // fieldLabel only needs schema (stable context) — no volatile context required.
    const stableCtx = useBlongForm();
    const fieldId = `field:${fieldName}:${cardName}`;
    const fieldSchema = stableCtx?.schema?.properties?.[fieldName];
    const fieldLabel = fieldSchema?.title ?? fieldName;
    const isSelected = selected?.id === fieldId;

    // Read active drag type so we only show insert indicator when dragging another field
    const {active: dragCtx} = useDndContext();
    const activeDragType = dragCtx?.data?.current?.type as string | undefined;

    const {
        attributes,
        listeners,
        setNodeRef: setDragRef,
        isDragging,
    } = useDraggable({
        id: fieldId,
        data: {type: 'field', fieldName, cardName, label: fieldLabel, sourceId: cardName},
        disabled: !isDesignMode,
    });

    // Same element is also a drop target: dropping a field onto it inserts the dragged field before it.
    const {setNodeRef: setDropRef, isOver: isDropOver} = useDroppable({
        id: fieldId,
        disabled: !isDesignMode,
    });

    const fieldRef = useCallback(
        (node: Element | null) => {
            setDragRef(node as HTMLElement | null);
            setDropRef(node as HTMLElement | null);
        },
        [setDragRef, setDropRef],
    );

    const handleClick = useCallback(
        (e: React.MouseEvent) => {
            if (!isDesignMode) return;
            e.stopPropagation();
            select({id: fieldId, type: 'field', label: fieldLabel});
        },
        [isDesignMode, fieldId, fieldLabel, select],
    );

    // FieldRow handles its own context subscriptions (stable + state + values)
    const fieldContent = (
        <FieldRow
            fieldName={fieldName}
            cardReadOnly={cardReadOnly}
            isLast={isLast}
        />
    );

    if (!isDesignMode) return fieldContent;

    return (
        <div
            ref={fieldRef}
            style={{opacity: isDragging ? 0.4 : 1}}
            className={[
                'blong-field-row--design',
                isSelected ? 'blong-field-row--design--selected' : '',
                isDragging ? 'blong-field-row--design--dragging' : '',
                isDropOver && !isDragging && activeDragType === 'field'
                    ? 'blong-field-row--design--over'
                    : '',
            ]
                .filter(Boolean)
                .join(' ')}
            onClick={handleClick}
            {...attributes}
            {...listeners}
        >
            {fieldContent}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Field rendering — lives here because only Card renders fields
// ---------------------------------------------------------------------------

function resolveWidgetType(fieldSchema: IEnrichedFieldSchema): string {
    if (fieldSchema.widget?.type) return fieldSchema.widget.type;
    const fmt = fieldSchema.format;
    if (fmt === 'date') return 'date';
    if (fmt === 'date-time' || fmt === 'dateTime') return 'dateTime';
    if (fmt === 'time') return 'time';
    if (fieldSchema.type === 'boolean') return 'boolean';
    if (fieldSchema.type === 'integer') return 'integer';
    if (fieldSchema.type === 'number') return 'number';
    return 'input';
}

/**
 * Resolve a dot-notation field path to its leaf IEnrichedFieldSchema.
 * E.g. 'input.input' → schema.properties.input.properties.input.
 * '#id' suffixes (column-override keys like 'table#table1') are stripped before resolution.
 */
function resolveFieldSchema(
    schema: IEnrichedSchema | undefined,
    fieldPath: string,
): IEnrichedFieldSchema | undefined {
    if (!schema?.properties) return undefined;
    // Strip '#id' suffix from ICardWidgetEntry column-override keys
    const hashIdx = fieldPath.indexOf('#');
    const basePath = hashIdx >= 0 ? fieldPath.slice(0, hashIdx) : fieldPath;
    const dot = basePath.indexOf('.');
    if (dot === -1) return schema.properties[basePath];
    const head = basePath.slice(0, dot);
    const tail = basePath.slice(dot + 1);
    return resolveFieldSchema({properties: schema.properties[head]?.properties}, tail);
}

/**
 * Deep-set a value at a dot-notation path within a plain object.
 * E.g. setFieldValue({}, 'input.input', 'v') → {input: {input: 'v'}}.
 */
function setFieldValue(
    obj: Record<string, unknown>,
    path: string,
    value: unknown,
): Record<string, unknown> {
    const dot = path.indexOf('.');
    if (dot === -1) return {...obj, [path]: value};
    const head = path.slice(0, dot);
    const tail = path.slice(dot + 1);
    return {
        ...obj,
        [head]: setFieldValue((obj[head] as Record<string, unknown>) ?? {}, tail, value),
    };
}

/**
 * Read a react-hook-form FieldErrors value at a dot-notation path.
 * RHF stores nested errors as nested objects, not flat 'a.b' keys.
 */
function getFieldError(
    errors: Record<string, unknown>,
    path: string,
): {message?: string} | undefined {
    const dot = path.indexOf('.');
    if (dot === -1) return errors[path] as {message?: string} | undefined;
    const head = path.slice(0, dot);
    const tail = path.slice(dot + 1);
    return getFieldError((errors[head] as Record<string, unknown>) ?? {}, tail);
}

/**
 * FieldRow — renders a single field row controlled by react-hook-form.
 *
 * Subscribes to FormValuesContext (fast) and FormStateContext (slow) directly
 * so that Card itself does not rerender every time a field value changes.
 * Only FieldRow instances rerender when their subscribed context changes.
 *
 * All hooks are called unconditionally (before any early returns) to satisfy
 * React's rules of hooks. `validationRules` and `renderController` are memoised
 * so that Controller — which is React.memo'd internally by react-hook-form —
 * can skip rerenders when neither the schema nor the field/form state has changed.
 */
function FieldRow({
    fieldName,
    cardReadOnly,
    isLast,
    columnOverride,
}: {
    fieldName: string;
    cardReadOnly: boolean | undefined;
    isLast: boolean;
    columnOverride?: string[];
}) {
    // ── Context subscriptions (all unconditional) ──────────────────────────────
    const stableCtx = useBlongForm();
    const stateCtx = useBlongFormState();
    const valuesCtx = useFormValues();
    const translations = useAppStore(s => s.translations);

    // Safe-extract with defaults so hook deps below never see undefined
    const schema = stableCtx?.schema;
    const control = stableCtx?.control;
    const dropdowns = stableCtx?.dropdowns;
    const onChange = stableCtx?.onChange;
    const handleTableSelect = stableCtx?.handleTableSelect;
    const {readOnly: fieldDisabled = false, loading = false} = stateCtx ?? {};
    const {
        formValues = {} as Record<string, unknown>,
        rawFormValues = {} as Record<string, unknown>,
        errors = {},
    } = valuesCtx ?? {};

    // ── Pure derivations (no hooks) ────────────────────────────────────────────

    // Strip '#id' suffix (ICardWidgetEntry key) to get the real form field name
    const hashIdx = fieldName.indexOf('#');
    const baseName = hashIdx >= 0 ? fieldName.slice(0, hashIdx) : fieldName;
    // Derive id/data-testid:
    //   - ICardWidgetEntry (e.g. 'table#table1') → 'table1'
    //   - nested field (e.g. 'input.password')  → 'input-password'
    const instanceId = hashIdx >= 0 ? fieldName.slice(hashIdx + 1) : baseName.replace(/\./g, '-');

    const rawSchema: IEnrichedFieldSchema | undefined = resolveFieldSchema(schema, fieldName);
    const dropdownKey = rawSchema?.widget?.dropdown;
    const fieldSchema: IEnrichedFieldSchema | undefined =
        dropdowns && dropdownKey && dropdowns[dropdownKey] && rawSchema
            ? ({
                  ...rawSchema,
                  widget: {
                      ...rawSchema.widget!,
                      options: dropdowns[dropdownKey],
                      dropdown: undefined,
                  },
              } as IEnrichedFieldSchema)
            : rawSchema;
    // Apply column override from ICardWidgetEntry (e.g. show only certain columns in a table)
    const effectiveSchema: IEnrichedFieldSchema | undefined =
        fieldSchema && columnOverride
            ? ({
                  ...fieldSchema,
                  widget: {...fieldSchema.widget, columns: columnOverride},
              } as IEnrichedFieldSchema)
            : fieldSchema;

    const WidgetComponent = effectiveSchema
        ? widgetRegistry.get(resolveWidgetType(effectiveSchema))
        : undefined;

    const schemaReadOnly =
        cardReadOnly || effectiveSchema?.readOnly || effectiveSchema?.widget?.readOnly;

    // Whether this field's widget reports table row selections (for onSelect wiring)
    const needsOnSelect =
        effectiveSchema?.widget?.selectionMode === 'single' ||
        effectiveSchema?.widget?.type === 'navigator';

    // ── Hooks that depend on derived values (still unconditional) ──────────────

    // Keep the latest rawFormValues in a ref so the Controller render callback
    // can always access it without having it as a dependency.  This avoids the
    // callback being recreated purely because rawFormValues changed — a per-
    // keystroke event — when only the ref value needs updating.
    const rawFormValuesRef = useRef(rawFormValues);
    rawFormValuesRef.current = rawFormValues;

    // Memoize validation rules — effectiveSchema is derived from the stable context
    // and fieldName, so it almost never changes during a user's editing session.
    // Keeping it stable prevents Controller from seeing a new `rules` object on
    // every FieldRow render.
    const validationRules = useMemo(
        () => (effectiveSchema ? buildValidationRules(effectiveSchema) : {}),
        [effectiveSchema],
    );

    // Memoize the Controller render callback.
    //
    // Deps explanation:
    //  - rawFormValues is intentionally excluded — read via rawFormValuesRef so the
    //    callback stays stable even when unrelated fields are being typed into.
    //  - formValues IS included because widgets need it for cascade-dropdown
    //    filtering; cascade options must update when a parent field changes.
    //  - All other deps are derived from the stable context or slow state and
    //    therefore change rarely.
    //
    // Because react-hook-form's Controller is wrapped with React.memo, a stable
    // render reference allows Controller to skip its own rerender when the field's
    // value hasn't changed (e.g. when another field is selected in a table).
    const renderController = useCallback(
        ({
            field,
            fieldState,
        }: {
            field: ControllerRenderProps<Record<string, unknown>, string>;
            fieldState: ControllerFieldState;
            formState: UseFormStateReturn<Record<string, unknown>>;
        }) => {
            // Both are non-null here: FieldRow returns null before the <Controller>
            // JSX if either is undefined (see early returns further below).
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const Widget = WidgetComponent!;
            return (
                <Widget
                    id={instanceId}
                    name={baseName}
                    schema={effectiveSchema!}
                    value={field.value}
                    onChange={(val: unknown) => {
                        field.onChange(val);
                        // Use ref to avoid capturing a stale rawFormValues closure
                        onChange?.(setFieldValue(rawFormValuesRef.current, baseName, val));
                    }}
                    onBlur={field.onBlur}
                    error={fieldState.error}
                    readOnly={schemaReadOnly}
                    loading={loading}
                    disabled={fieldDisabled}
                    formValues={formValues}
                    dropdowns={dropdowns}
                    onSelect={needsOnSelect ? handleTableSelect : undefined}
                />
            );
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            WidgetComponent,
            instanceId,
            baseName,
            effectiveSchema,
            onChange,
            schemaReadOnly,
            loading,
            fieldDisabled,
            formValues,
            dropdowns,
            needsOnSelect,
            handleTableSelect,
        ],
    );

    // ── Conditional returns — must be after all hooks (React rules-of-hooks) ────
    // All hooks above are called unconditionally.  The hook computations are cheap
    // (context reads, ref updates, useMemo with stable deps) so the cost of running
    // them before bailing out is negligible compared to the benefit of keeping the
    // hook call order stable across renders.
    if (!stableCtx || !stateCtx || !valuesCtx) return null;
    if (!effectiveSchema || !WidgetComponent) return null;

    const hasLabel = effectiveSchema.title !== '';

    if (loading) {
        return (
            <div className={`field grid${isLast ? ' mb-0' : ''}`}>
                {hasLabel && (
                    <label className="col-12 md:col-4">
                        <Text>{effectiveSchema.title ?? baseName}</Text>
                    </label>
                )}
                <div className={`flex align-items-center col-12${hasLabel ? ' md:col-8' : ''}`}>
                    <Skeleton className="p-inputtext w-full" />
                </div>
            </div>
        );
    }

    return (
        <div className={`field grid${isLast ? ' mb-0' : ''}`}>
            {hasLabel && (
                <label
                    htmlFor={instanceId}
                    className={`col-12 md:col-4${
                        effectiveSchema.required ? ' blong-required' : ''
                    }`}
                >
                    <Text>{effectiveSchema.title ?? baseName}</Text>
                </label>
            )}
            <div
                className={`flex align-items-center relative col-12${hasLabel ? ' md:col-8' : ''}`}
            >
                <Controller
                    name={baseName}
                    control={control!}
                    rules={validationRules}
                    render={renderController}
                />
                {effectiveSchema.description && (
                    <small className="blong-field-hint">{effectiveSchema.description}</small>
                )}
            </div>
            {getFieldError(errors as Record<string, unknown>, baseName) && (
                <>
                    <small className="col-12 md:col-4" />
                    <small className="p-error blong-field-error col-12 md:col-8">
                        <Text
                            params={{
                                field:
                                    translations[effectiveSchema.title ?? baseName] ??
                                    effectiveSchema.title ??
                                    baseName,
                                minLength: effectiveSchema.minLength ?? 0,
                                maxLength: effectiveSchema.maxLength ?? 0,
                                minimum: effectiveSchema.minimum ?? 0,
                                maximum: effectiveSchema.maximum ?? 0,
                            }}
                        >
                            {getFieldError(errors as Record<string, unknown>, baseName)?.message ??
                                '{field} is invalid'}
                        </Text>
                    </small>
                </>
            )}
        </div>
    );
}

/**
 * WatchFieldRow — renders a single field from a master-detail (watch) card.
 *
 * Reads from the selected table row and writes back via setValue.
 * Subscribes to FormValuesContext (fast) and FormStateContext (slow) directly
 * so that the parent Card component does not rerender when values change.
 */
function WatchFieldRow({
    rawFieldName,
    isLast,
    selection,
    watchField,
    cardReadOnly,
}: {
    rawFieldName: string;
    isLast: boolean;
    selection: ITableSelection;
    watchField: string;
    cardReadOnly: boolean | undefined;
}) {
    const stableCtx = useBlongForm();
    const stateCtx = useBlongFormState();
    const valuesCtx = useFormValues();

    if (!stableCtx || !stateCtx || !valuesCtx) return null;

    const {schema, setValue, onChange, handleTableSelect} = stableCtx;
    const {rawFormValues, formValues} = valuesCtx;

    const fieldName = rawFieldName.startsWith('$.edit.')
        ? rawFieldName.split('.').pop()!
        : rawFieldName;

    const itemsProps =
        schema?.properties?.[watchField]?.items?.properties ??
        (schema?.properties?.[watchField]?.properties as
            | Record<string, IEnrichedFieldSchema>
            | undefined);
    const fieldSchema: IEnrichedFieldSchema | undefined =
        itemsProps?.[fieldName] ?? schema?.properties?.[fieldName];
    if (!fieldSchema) return null;

    const WidgetComponent = widgetRegistry.get(resolveWidgetType(fieldSchema));
    if (!WidgetComponent) return null;

    const hasLabel = fieldSchema.title !== '';
    const arr = rawFormValues[watchField] as Record<string, unknown>[] | undefined;
    // For listAction tables the form array is empty; fall back to the selection row directly
    const hasFormData = Array.isArray(arr) && arr.length > selection.index;
    const currentVal = hasFormData
        ? (arr as Record<string, unknown>[])[selection.index]?.[fieldName]
        : selection.row?.[fieldName];
    const widgetKey = `${fieldName}-${selection.index}-${String(currentVal)}`;

    return (
        <div className={`field grid${isLast ? ' mb-0' : ''}`}>
            {hasLabel && (
                <label
                    htmlFor={fieldName}
                    className="col-12 md:col-4"
                >
                    <Text>{fieldSchema.title ?? fieldName}</Text>
                </label>
            )}
            <div
                className={`flex align-items-center relative col-12${hasLabel ? ' md:col-8' : ''}`}
            >
                <WidgetComponent
                    key={widgetKey}
                    name={fieldName}
                    schema={fieldSchema}
                    value={currentVal}
                    onChange={newVal => {
                        if (hasFormData) {
                            // Form-owned mode: update react-hook-form value
                            const current = [...(arr as Record<string, unknown>[])];
                            current[selection.index] = {
                                ...(current[selection.index] ?? {}),
                                [fieldName]: newVal,
                            };
                            setValue(watchField, current);
                            onChange?.({...rawFormValues, [watchField]: current});
                        } else {
                            // listAction mode: update tableSelections.row so detail re-renders
                            const updatedRow = {...selection.row, [fieldName]: newVal};
                            handleTableSelect(watchField, {
                                row: updatedRow,
                                index: selection.index,
                            });
                        }
                    }}
                    onBlur={() => {}}
                    readOnly={cardReadOnly || fieldSchema.readOnly || fieldSchema.widget?.readOnly}
                    formValues={formValues}
                />
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Card component
// ---------------------------------------------------------------------------

export function Card({
    title,
    children,
    readOnly,
    loading,
    collapsible,
    className,
    id,
    cardName,
    colIdx,
}: ICardProps) {
    const [collapsed, setCollapsed] = useState(false);
    const {active: isDesignMode} = useDesignMode();
    const elementId = id ?? (cardName ? `card-${cardName}` : 'card');

    // Subscribe to stable context (schema, cards) and slow-changing state (tableSelections, loading).
    // Card does NOT subscribe to FormValuesContext (fast), so it does NOT rerender on every keystroke.
    const formCtx = useBlongForm();
    const formState = useBlongFormState();
    const resolved = cardName && formCtx ? formCtx.cards[cardName] : undefined;

    // When cardName is active, prefer resolved values over explicit props
    const resolvedTitle: string | ReactNode | undefined = resolved ? resolved.label : title;
    const titleLabel = typeof resolvedTitle === 'string' ? resolvedTitle : (cardName ?? elementId);

    const {isSelected, select, dragProps, setRef, designClass, style} = useDesignable(
        elementId,
        'card',
        {
            colIdx,
            cardName,
            label: titleLabel,
            sourceId: colIdx,
        },
    );
    const resolvedCollapsible = resolved ? resolved.config.collapsible : collapsible;
    // loading and readOnly come from FormStateContext (slow) — not from FormValuesContext (fast).
    const resolvedLoading = resolved ? (formState?.loading ?? false) : loading;
    const cardReadOnly = resolved ? resolved.config.readOnly : readOnly;

    // Build content
    let content: React.ReactNode;
    if (cardName && formCtx) {
        if (!resolved) {
            // Unknown card name — render a visible error stub
            content = (
                <span className="p-error text-sm">❌ Card &quot;{cardName}&quot; not found</span>
            );
        } else {
            const rawWatch = resolved.config.watch;
            if (rawWatch) {
                const watchField = rawWatch.startsWith('$.selected.')
                    ? rawWatch.slice('$.selected.'.length)
                    : rawWatch;
                // tableSelections comes from FormStateContext (slow) — Card rerenders only on
                // row selection events, not on every field-value change.
                const selection = (formState?.tableSelections ?? {})[watchField] ?? null;
                content = selection ? (
                    resolved.fields.map((rawFieldName, idx) => (
                        <WatchFieldRow
                            key={rawFieldName}
                            rawFieldName={rawFieldName}
                            isLast={idx === resolved.fields.length - 1}
                            selection={selection}
                            watchField={watchField}
                            cardReadOnly={cardReadOnly}
                        />
                    ))
                ) : (
                    <span className="p-text-secondary text-sm">Select a row to see details</span>
                );
            } else if (isDesignMode) {
                content = resolved.fields.map((fieldName, idx) => (
                    <DraggableFieldRow
                        key={fieldName}
                        fieldName={fieldName}
                        cardName={cardName!}
                        isLast={idx === resolved.fields.length - 1}
                        cardReadOnly={cardReadOnly}
                    />
                ));
            } else {
                // FieldRow handles its own context subscriptions (stable + state + values).
                // Card itself does NOT rerender when values change.
                content = resolved.fields.map((fieldName, idx) => (
                    <FieldRow
                        key={fieldName}
                        fieldName={fieldName}
                        cardReadOnly={cardReadOnly}
                        isLast={idx === resolved.fields.length - 1}
                        columnOverride={resolved.columnOverrides?.[fieldName]}
                    />
                ));
            }
        }
    } else {
        content = children;
    }

    // Title node — collapse toggle (whole card is draggable via wrapper div in design mode)
    const titleNode =
        resolvedTitle || resolvedCollapsible ? (
            <span
                className="blong-card__label"
                onClick={
                    resolvedCollapsible
                        ? e => {
                              e.stopPropagation();
                              setCollapsed(c => !c);
                          }
                        : undefined
                }
                style={resolvedCollapsible ? {cursor: 'pointer'} : undefined}
            >
                {resolvedCollapsible && (
                    <i
                        className={`pi ${
                            collapsed ? 'pi-chevron-right' : 'pi-chevron-down'
                        } blong-card__collapse-icon`}
                    />
                )}
                {typeof resolvedTitle === 'string' ? <Text>{resolvedTitle}</Text> : resolvedTitle}
            </span>
        ) : undefined;

    const cardClassName =
        [
            collapsed ? 'blong-card--collapsed' : '',
            resolvedLoading ? 'blong-card--loading' : '',
            designClass,
            !isDesignMode ? (className ?? '') : '',
        ]
            .filter(Boolean)
            .join(' ') || undefined;

    const cardBody = (
        <>
            {!collapsed && (
                <div className="blong-card__body">
                    {resolvedLoading && !(cardName && formCtx) ? (
                        <div className="blong-card__skeleton">
                            {[1, 2, 3].map(i => (
                                <div
                                    key={i}
                                    className="blong-skeleton-row"
                                />
                            ))}
                        </div>
                    ) : (
                        content
                    )}
                    {isDesignMode && cardName && (
                        <DropZone
                            id={`card-end:${cardName}`}
                            accept="field"
                            sourceId={cardName}
                        />
                    )}
                </div>
            )}
            {isSelected && (
                <SelectionIndicator
                    id={elementId}
                    label={typeof resolvedTitle === 'string' ? resolvedTitle : elementId}
                />
            )}
        </>
    );

    // In design mode: wrap PrimeCard with a div so dnd-kit refs attach to a real DOM element
    // (PrimeReact 8 Card is a class component that does not forward refs).
    if (isDesignMode && setRef) {
        return (
            <div
                ref={setRef}
                className={[className ?? '', 'blong-design-card-wrapper'].filter(Boolean).join(' ')}
                style={style}
                onClick={select}
                {...(dragProps as React.HTMLAttributes<HTMLDivElement>)}
            >
                <PrimeCard
                    id={elementId}
                    title={titleNode}
                    className={cardClassName}
                >
                    {cardBody}
                </PrimeCard>
            </div>
        );
    }

    return (
        <PrimeCard
            id={elementId}
            title={titleNode}
            className={
                [
                    collapsed ? 'blong-card--collapsed' : '',
                    resolvedLoading ? 'blong-card--loading' : '',
                    className ?? '',
                ]
                    .filter(Boolean)
                    .join(' ') || undefined
            }
        >
            {!collapsed && (
                <div className="blong-card__body">
                    {resolvedLoading && !(cardName && formCtx) ? (
                        <div className="blong-card__skeleton">
                            {[1, 2, 3].map(i => (
                                <div
                                    key={i}
                                    className="blong-skeleton-row"
                                />
                            ))}
                        </div>
                    ) : (
                        content
                    )}
                </div>
            )}
        </PrimeCard>
    );
}
