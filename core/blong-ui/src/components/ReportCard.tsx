/**
 * ReportCard — filters + table + optional charts.
 *
 * Combines a filter form with a data table for report-style views.
 */

import React, {useCallback, useState} from 'react';
import {useForm} from 'react-hook-form';
import type {FieldValues} from 'react-hook-form';

import type {BlongSchema} from '../types.js';
import {TableCard} from './TableCard.js';
import type {TableCardProps} from './TableCard.js';
import {resolveField} from '../factory/FieldResolver.js';
import {renderField} from '../factory/FieldResolver.js';
import type {BlongSchemaProperty} from '../types.js';

/** Props for the ReportCard component. */
export interface ReportCardProps extends Omit<TableCardProps, 'criteria'> {
    /** Schema for the filter form fields. */
    filterSchema?: BlongSchema;
    /** Filter field names to display. */
    filterFields?: string[];
}

/**
 * ReportCard component — filter form + data table.
 *
 * @example
 * ```tsx
 * <ReportCard
 *     schema={responseSchema}
 *     filterSchema={filterSchema}
 *     filterFields={['dateFrom', 'dateTo', 'status']}
 *     fetchMethod="report.transaction.find"
 *     title="Transaction Report"
 * />
 * ```
 */
export function ReportCard({
    filterSchema,
    filterFields = [],
    ...tableProps
}: ReportCardProps): React.ReactElement {
    const [criteria, setCriteria] = useState<Record<string, unknown>>({});
    const form = useForm<FieldValues>();

    const handleFilter = useCallback(
        (data: FieldValues) => {
            // Remove empty values
            const cleaned: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(data)) {
                if (value != null && value !== '') {
                    cleaned[key] = value;
                }
            }
            setCriteria(cleaned);
        },
        [],
    );

    const filterForm = filterSchema
        ? React.createElement(
              'form',
              {
                  className: 'blong-report-filters',
                  onSubmit: form.handleSubmit(handleFilter),
              },
              ...filterFields.map(fieldName => {
                  const prop = filterSchema.properties?.[fieldName];
                  if (!prop) return null;
                  const field = resolveField(
                      fieldName,
                      prop as BlongSchemaProperty,
                      filterSchema.required as string[],
                  );
                  return renderField(field, form);
              }),
              React.createElement(
                  'button',
                  {type: 'submit', className: 'blong-btn blong-btn-primary'},
                  'Apply Filters',
              ),
              React.createElement(
                  'button',
                  {
                      type: 'button',
                      className: 'blong-btn blong-btn-secondary',
                      onClick: () => {
                          form.reset();
                          setCriteria({});
                      },
                  },
                  'Clear',
              ),
          )
        : null;

    return React.createElement(
        'div',
        {className: 'blong-report-card'},
        filterForm,
        React.createElement(TableCard, {
            ...tableProps,
            criteria,
        }),
    );
}
