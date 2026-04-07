/**
 * Text — i18n text component.
 *
 * Translates a string by looking it up in the app-store translation dictionary.
 * Two usage patterns:
 *   <Text id="key" />             — explicit key
 *   <Text>{someStringVar}</Text>  — raw text used as both key and fallback
 *
 * Non-string children are rendered as-is without translation.
 */
import React from 'react';
import {useText} from '../../hooks/useText.js';

interface ITextProps {
    /** Explicit translation key. */
    id?: string;
    /** Raw text used as both the translation key and the English fallback. */
    children?: React.ReactNode;
    params?: Record<string, string | number>;
    prefix?: string;
    as?: keyof React.JSX.IntrinsicElements;
    className?: string;
}

export function Text({id, children, params, prefix, as: Tag = 'span', className}: ITextProps) {
    const raw = typeof children === 'string' ? children : (id ?? '');
    const key = prefix ? `${prefix}.${raw}` : raw;
    const text = useText(key, params);
    // Pass through non-string children unchanged (already JSX)
    if (typeof children !== 'string' && id == null) return <>{children ?? null}</>;
    return <Tag className={className}>{text}</Tag>;
}
