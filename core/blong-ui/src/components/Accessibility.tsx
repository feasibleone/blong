/**
 * Accessibility utilities — WCAG 2.1 AA compliance helpers.
 */

import React from 'react';

/**
 * VisuallyHidden — renders content that is visually hidden but accessible
 * to screen readers.
 *
 * @example
 * ```tsx
 * <VisuallyHidden>Additional context for screen readers</VisuallyHidden>
 * ```
 */
export function VisuallyHidden({
    children,
}: {
    children: React.ReactNode;
}): React.ReactElement {
    return React.createElement(
        'span',
        {
            style: {
                position: 'absolute',
                width: '1px',
                height: '1px',
                padding: 0,
                margin: '-1px',
                overflow: 'hidden',
                clip: 'rect(0, 0, 0, 0)',
                whiteSpace: 'nowrap',
                border: 0,
            },
        },
        children,
    );
}

/**
 * SkipLink — keyboard shortcut to skip to main content.
 *
 * @example
 * ```tsx
 * <SkipLink targetId="main-content" />
 * ```
 */
export function SkipLink({
    targetId = 'main-content',
    label = 'Skip to main content',
}: {
    targetId?: string;
    label?: string;
}): React.ReactElement {
    return React.createElement(
        'a',
        {
            href: `#${targetId}`,
            className: 'blong-skip-link',
        },
        label,
    );
}

/**
 * LiveRegion — ARIA live region for dynamic content announcements.
 *
 * @example
 * ```tsx
 * <LiveRegion message={statusMessage} />
 * ```
 */
export function LiveRegion({
    message,
    politeness = 'polite',
}: {
    message: string;
    politeness?: 'polite' | 'assertive';
}): React.ReactElement {
    return React.createElement(
        'div',
        {
            role: 'status',
            'aria-live': politeness,
            'aria-atomic': 'true',
            className: 'blong-live-region',
            style: {
                position: 'absolute',
                width: '1px',
                height: '1px',
                overflow: 'hidden',
                clip: 'rect(0, 0, 0, 0)',
            },
        },
        message,
    );
}

/**
 * FocusTrap — traps focus within a container (for dialogs/modals).
 *
 * @example
 * ```tsx
 * <FocusTrap active={isModalOpen}>
 *     <Dialog />
 * </FocusTrap>
 * ```
 */
export function FocusTrap({
    children,
    active = true,
}: {
    children: React.ReactNode;
    active?: boolean;
}): React.ReactElement {
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!active || !ref.current) return;

        const container = ref.current;
        const focusableElements = container.querySelectorAll<HTMLElement>(
            'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        function handleKeyDown(e: KeyboardEvent): void {
            if (e.key !== 'Tab') return;
            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last?.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first?.focus();
                }
            }
        }

        container.addEventListener('keydown', handleKeyDown);
        first?.focus();

        return () => container.removeEventListener('keydown', handleKeyDown);
    }, [active]);

    return React.createElement('div', {ref}, children);
}
