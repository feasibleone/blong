/**
 * Dropdown registry — on-demand load and cache of named dropdown lists.
 *
 * Widgets declare their dropdown dependency by name:
 *   widget: {type: 'dropdown', dropdown: 'marine.species'}
 *
 * When a component needs the data, it calls:
 *   dropdownRegistry.get('marine.species', loader)
 *
 * The loader is responsible for calling the backend (e.g. via useHandler).
 * The registry deduplicates concurrent requests and caches the result.
 *
 * The naming convention for the backend handler is:
 *   {subject}.dropdown.list({name: 'marine.species'}) → [{value, label}]
 */
import type {IDropdownOption} from '@feasibleone/blong';

type LoaderFn = (name: string) => Promise<IDropdownOption[]>;
type BatchLoaderFn = (names: string[]) => Promise<Record<string, IDropdownOption[]>>;

class DropdownRegistry {
    private cache = new Map<string, IDropdownOption[]>();
    private pending = new Map<string, Promise<IDropdownOption[]>>();

    /**
     * Get a dropdown by name, loading it via the provided loader if not cached.
     *
     * @param name - Dropdown key, e.g. 'marine.species'
     * @param loader - Function that fetches the dropdown data from the backend
     */
    async get(name: string, loader: LoaderFn): Promise<IDropdownOption[]> {
        if (this.cache.has(name)) return this.cache.get(name)!;

        if (!this.pending.has(name)) {
            const promise = loader(name)
                .then(data => {
                    this.cache.set(name, data);
                    this.pending.delete(name);
                    return data;
                })
                .catch(err => {
                    this.pending.delete(name);
                    // Re-throw so callers (e.g. DropdownWidget) can handle the error
                    // (show a dialog, log the user out, etc.).
                    throw err;
                });
            this.pending.set(name, promise);
        }

        return this.pending.get(name)!;
    }

    /**
     * Pre-populate the cache without async loading (used by mocks and preload).
     */
    set(name: string, data: IDropdownOption[]): void {
        this.cache.set(name, data);
    }

    /**
     * Batch-preload multiple dropdowns.  Names already cached are skipped.
     *
     * @param names - Dropdown names to load
     * @param loader - Batch loader that returns a map of name → options
     */
    preload(names: string[], loader: BatchLoaderFn): Promise<void> {
        const missing = names.filter(n => !this.cache.has(n) && !this.pending.has(n));
        if (!missing.length) return Promise.resolve();

        const promise = loader(missing).then(results => {
            for (const [name, data] of Object.entries(results)) {
                this.cache.set(name, data);
                this.pending.delete(name);
            }
        });

        // Mark all as pending immediately to avoid duplicate requests
        for (const name of missing) {
            this.pending.set(
                name,
                promise.then(() => this.cache.get(name) ?? []),
            );
        }

        return promise.then(() => undefined);
    }

    /** Return true if the named dropdown is already loaded */
    has(name: string): boolean {
        return this.cache.has(name);
    }

    /** Clear the cache (useful in tests) */
    clear(): void {
        this.cache.clear();
        this.pending.clear();
    }
}

/** Singleton dropdown registry — shared across all components */
export const dropdownRegistry = new DropdownRegistry();
