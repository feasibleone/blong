/**
 * MasterDetail — master table with detail form editing selected row.
 *
 * The detail card watches `$.selected` and edits the selected table row
 * via `$.edit` internal form state.
 */

import React, {useCallback, useEffect, useState} from 'react';
import {useForm, FormProvider} from 'react-hook-form';
import type {FieldValues} from 'react-hook-form';

import type {BlongSchema, Cards, Layout} from '../types.js';
import {TableFactory} from '../factory/TableFactory.js';
import {FormFactory} from '../factory/FormFactory.js';

/** Props for the MasterDetail component. */
export interface MasterDetailProps {
    /** Schema for the table (master). */
    tableSchema: BlongSchema;
    /** Schema for the detail form. */
    formSchema: BlongSchema;
    /** Cards for the detail form. */
    formCards: Cards;
    /** Layout for the detail form. */
    formLayout: Layout;
    /** Table data rows. */
    data: Record<string, unknown>[];
    /** Total records for pagination. */
    totalRecords?: number;
    /** Called when the form is submitted for a row. */
    onSubmit: (data: Record<string, unknown>, index: number) => Promise<void>;
    /** Called when data fetch params change (pagination/sorting). */
    onFetchParamsChange?: (params: Record<string, unknown>) => void;
    /** Whether data is loading. */
    isLoading?: boolean;
    /** Title for the master section. */
    masterTitle?: string;
    /** Title for the detail section. */
    detailTitle?: string;
    /** CSS class name. */
    className?: string;
}

/**
 * MasterDetail — combines a selection table with an edit form.
 *
 * @example
 * ```tsx
 * <MasterDetail
 *     tableSchema={listSchema}
 *     formSchema={editSchema}
 *     formCards={cards}
 *     formLayout={layout}
 *     data={items}
 *     onSubmit={handleSave}
 *     masterTitle="Users"
 *     detailTitle="Edit User"
 * />
 * ```
 */
export function MasterDetail({
    tableSchema,
    formSchema,
    formCards,
    formLayout,
    data,
    totalRecords = 0,
    onSubmit,
    onFetchParamsChange: _onFetchParamsChange,
    isLoading = false,
    masterTitle,
    detailTitle,
    className = '',
}: MasterDetailProps): React.ReactElement {
    const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
    const [selectedIndex, setSelectedIndex] = useState<number>(-1);

    const handleSelectionChange = useCallback(
        (selection: Record<string, unknown> | Record<string, unknown>[]) => {
            const row = Array.isArray(selection) ? selection[0] : selection;
            setSelectedRow(row ?? null);
            const idx = data.findIndex(
                r => JSON.stringify(r) === JSON.stringify(row),
            );
            setSelectedIndex(idx);
        },
        [data],
    );

    const handleFormSubmit = useCallback(
        async (formData: Record<string, unknown>) => {
            if (selectedIndex >= 0) {
                await onSubmit(formData, selectedIndex);
            }
        },
        [onSubmit, selectedIndex],
    );

    const masterSection = React.createElement(
        'div',
        {className: 'blong-master-section'},
        masterTitle && React.createElement('h4', null, masterTitle),
        React.createElement(TableFactory, {
            schema: tableSchema,
            data,
            totalRecords,
            selectionMode: 'single',
            selection: selectedRow ?? undefined,
            onSelectionChange: handleSelectionChange,
            isLoading,
        }),
    );

    const detailSection = selectedRow
        ? React.createElement(
              'div',
              {className: 'blong-detail-section'},
              detailTitle && React.createElement('h4', null, detailTitle),
              React.createElement(FormFactory, {
                  schema: formSchema,
                  cards: formCards,
                  layout: formLayout,
                  mode: 'edit',
                  defaultValues: selectedRow,
                  onSubmit: async (d) => handleFormSubmit(d),
              }),
          )
        : React.createElement(
              'div',
              {className: 'blong-detail-section blong-detail-empty'},
              React.createElement('p', null, 'Select a row to edit'),
          );

    return React.createElement(
        'div',
        {className: `blong-master-detail ${className}`},
        masterSection,
        detailSection,
    );
}
