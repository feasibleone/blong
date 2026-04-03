import '@testing-library/jest-dom';
import {vi} from 'vitest';

// PrimeReact uses ResizeObserver — polyfill for jsdom
global.ResizeObserver = vi.fn(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
}));

// scrollIntoView is not implemented in jsdom
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// matchMedia is not implemented in jsdom
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

// URL.createObjectURL / revokeObjectURL are not implemented in jsdom
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
global.URL.revokeObjectURL = vi.fn();
