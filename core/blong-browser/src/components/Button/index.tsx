/**
 * Button — blong wrapper around PrimeReact Button.
 *
 * Automatically translates a string `label` prop via the `Text` component so
 * consumers pass plain English strings and translation is handled transparently.
 * Non-string labels (already ReactNode) are passed through unchanged.
 *
 * All PrimeReact ButtonProps are forwarded as-is.
 */
import {Button as PrimeButton, type ButtonProps} from 'primereact/button';
import {useAppStore} from '../../state/appStore.js';
import {Text} from '../Text/index.js';

export type {ButtonProps};

export function Button({'aria-label': ariaLabel, label, ...props}: ButtonProps) {
    const translations = useAppStore(s => s.translations);
    if (typeof label === 'string') {
        // Derive the accessible name from the translation dictionary (or fall back to the English
        // string). This must be passed explicitly because PrimeReact would otherwise stringify the
        // ReactElement label to "[object Object]" for aria-label.
        const accessibleName = ariaLabel ?? translations[label] ?? label;
        return (
            <PrimeButton
                {...props}
                label={<Text>{label}</Text>}
                aria-label={accessibleName}
            />
        );
    }
    return (
        <PrimeButton
            {...props}
            label={label}
            aria-label={ariaLabel}
        />
    );
}
