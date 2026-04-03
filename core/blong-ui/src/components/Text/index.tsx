/**
 * Text — i18n text component.
 */
import React from 'react';
import {useText} from '../../hooks/useText.js';

interface ITextProps {
    id: string;
    params?: Record<string, string | number>;
    prefix?: string;
    as?: keyof React.JSX.IntrinsicElements;
    className?: string;
}

export function Text({id, params, prefix, as: Tag = 'span', className}: ITextProps) {
    const key = prefix ? `${prefix}.${id}` : id;
    const text = useText(key, params);
    return <Tag className={className}>{text}</Tag>;
}
