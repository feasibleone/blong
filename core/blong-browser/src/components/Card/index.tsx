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


import React, {useCallback, useState, type ReactNode} from 'react';
import {Controller} from 'react-hook-form';
import {DropZone} from '../../design/DropZone.js';
import {SelectionIndicator} from '../../design/SelectionIndicator.js';
import {useDesignable} from '../../design/useDesignable.js';
import {useDesignMode} from '../../design/useDesignMode.js';
import {buildValidationRules} from '../../schema/validate.js';
import {useAppStore} from '../../state/appStore.js';
import type {IEnrichedFieldSchema, IEnrichedSchema} from '../../types/widget.js';
import {widgetRegistry} from '../../widgets/index.js';
import {useBlongForm, type IFormContext, type ITableSelection} from '../Form/FormContext.js';
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
    formCtx,
}: {
    fieldName: string;
    cardName: string;
    isLast: boolean;
    cardReadOnly: boolean | undefined;
    formCtx: IFormContext;
}) {
    const {active: isDesignMode, selected, select} = useDesignMode();
    const translations = useAppStore(s => s.translations);
    const fieldId = `field:${fieldName}:${cardName}`;
    const fieldSchema = formCtx.schema?.properties?.[fieldName];
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

    const fieldContent = renderField(fieldName, cardReadOnly, isLast, formCtx, translations);

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
    return resolveFieldSchema(
        {properties: schema.properties[head]?.properties},
        tail,
    );
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

/** Render a single field controlled by react-hook-form. */
function renderField(
    fieldName: string,
    cardReadOnly: boolean | undefined,
    isLast: boolean,
    ctx: IFormContext,
    translations: Record<string, string>,
    columnOverride?: string[],
): React.ReactNode {
    // Strip '#id' suffix (ICardWidgetEntry key) to get the real form field name
    const hashIdx = fieldName.indexOf('#');
    const baseName = hashIdx >= 0 ? fieldName.slice(0, hashIdx) : fieldName;
    // Derive id/data-testid:
    //   - ICardWidgetEntry (e.g. 'table#table1') → 'table1'
    //   - nested field (e.g. 'input.password')  → 'input-password'
    const instanceId = hashIdx >= 0
        ? fieldName.slice(hashIdx + 1)
        : baseName.replace(/\./g, '-');
    const {
        schema,
        control,
        errors,
        formValues,
        rawFormValues,
        loading,
        dropdowns,
        onChange,
        handleTableSelect,
    } = ctx;
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
            ? ({...fieldSchema, widget: {...fieldSchema.widget, columns: columnOverride}} as IEnrichedFieldSchema)
            : fieldSchema;
    if (!effectiveSchema) return null;

    const WidgetComponent = widgetRegistry.get(resolveWidgetType(effectiveSchema));
    if (!WidgetComponent) return null;

    const schemaReadOnly = cardReadOnly || effectiveSchema.readOnly;
    /** Transient disabled state (during save/load) — disables widget without changing its structure */
    const fieldDisabled = ctx.readOnly;
    const hasLabel = effectiveSchema.title !== '';

    if (loading) {
        return (
            <div
                key={fieldName}
                className={`field grid${isLast ? ' mb-0' : ''}`}
            >
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
        <div
            key={fieldName}
            className={`field grid${isLast ? ' mb-0' : ''}`}
        >
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
                    control={control}
                    rules={buildValidationRules(effectiveSchema)}
                    render={({field, fieldState}) => (
                        <WidgetComponent
                            id={instanceId}
                            name={baseName}
                            schema={effectiveSchema}
                            value={field.value}
                            onChange={val => {
                                field.onChange(val);
                                onChange?.(setFieldValue(rawFormValues, baseName, val));
                            }}
                            onBlur={field.onBlur}
                            error={fieldState.error}
                            readOnly={schemaReadOnly}
                            loading={loading}
                            disabled={fieldDisabled}
                            formValues={formValues}
                            dropdowns={dropdowns}
                            onSelect={
                                effectiveSchema.widget?.selectionMode === 'single'
                                    ? sel => handleTableSelect(baseName, sel)
                                    : undefined
                            }
                        />
                    )}
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
                            {getFieldError(errors as Record<string, unknown>, baseName)?.message ?? '{field} is invalid'}
                        </Text>
                    </small>
                </>
            )}
        </div>
    );
}

/**
 * Render a single field for a watch (master-detail) card.
 * Reads from the selected table row and writes back via setValue.
 */
function renderWatchField(
    rawFieldName: string,
    isLast: boolean,
    selection: ITableSelection,
    watchField: string,
    cardReadOnly: boolean | undefined,
    ctx: IFormContext,
): React.ReactNode {
    const {schema, rawFormValues, formValues, setValue, onChange} = ctx;

    const fieldName = rawFieldName.startsWith('$.edit.')
        ? rawFieldName.split('.').pop()!
        : rawFieldName;

    const itemsProps = schema?.properties?.[watchField]?.items?.properties as
        | Record<string, IEnrichedFieldSchema>
        | undefined;
    const fieldSchema: IEnrichedFieldSchema | undefined =
        itemsProps?.[fieldName] ?? schema?.properties?.[fieldName];
    if (!fieldSchema) return null;

    const WidgetComponent = widgetRegistry.get(resolveWidgetType(fieldSchema));
    if (!WidgetComponent) return null;

    const hasLabel = fieldSchema.title !== '';
    const arr = rawFormValues[watchField] as Record<string, unknown>[] | undefined;
    const currentVal = arr?.[selection.index]?.[fieldName];
    const widgetKey = `${fieldName}-${selection.index}-${String(currentVal)}`;

    return (
        <div
            key={fieldName}
            className={`field grid${isLast ? ' mb-0' : ''}`}
        >
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
                        const current = [
                            ...((rawFormValues[watchField] as Record<string, unknown>[]) ?? []),
                        ];
                        current[selection.index] = {
                            ...(current[selection.index] ?? {}),
                            [fieldName]: newVal,
                        };
                        setValue(watchField, current);
                        onChange?.({...rawFormValues, [watchField]: current});
                    }}
                    onBlur={() => {}}
                    readOnly={cardReadOnly || fieldSchema.readOnly}
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

    const formCtx = useBlongForm();
    const resolved = cardName && formCtx ? formCtx.cards[cardName] : undefined;
    const translations = useAppStore(s => s.translations);

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
    const resolvedLoading = resolved ? formCtx!.loading : loading;
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
                const selection = formCtx.tableSelections[watchField] ?? null;
                content = selection ? (
                    resolved.fields.map((rawFieldName, idx) =>
                        renderWatchField(
                            rawFieldName,
                            idx === resolved.fields.length - 1,
                            selection,
                            watchField,
                            cardReadOnly,
                            formCtx,
                        ),
                    )
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
                        formCtx={formCtx}
                    />
                ));
            } else {
                content = resolved.fields.map((fieldName, idx) =>
                    renderField(
                        fieldName,
                        cardReadOnly,
                        idx === resolved.fields.length - 1,
                        formCtx,
                        translations,
                        resolved.columnOverrides?.[fieldName],
                    ),
                );
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
