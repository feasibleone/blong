import {Type, type TNumberOptions, type TSchemaOptions, type TStringOptions} from 'typebox';
import {monotonicFactory} from 'ulidx';
import _merge from 'ut-function.merge';
import {v4, v7} from 'uuid';
import _yaml from 'yaml';

// Core logic to merge two types (T is target, U is source/override)
type DeepMerge<T, U> = T extends object
    ? U extends object
        ? {
              [K in keyof T | keyof U]: K extends keyof T
                  ? K extends keyof U
                      ? DeepMerge<T[K], U[K]> // Recursively merge shared keys
                      : T[K]
                  : K extends keyof U
                    ? U[K]
                    : never;
          }
        : U
    : U;

// Variadic type to process N arguments
type DeepMergeAll<Ts extends readonly unknown[]> = Ts extends readonly [infer Head, ...infer Tail]
    ? Tail extends readonly []
        ? Head
        : DeepMerge<Head, DeepMergeAll<Tail>>
    : unknown;

/**
 * Checks if a value is a plain object (not null, not an array).
 */
function isObject(item: unknown): item is Record<string | symbol, unknown> {
    return item !== null && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Deeply merges source into target in-place, supporting Symbol keys.
 * Note: This mutates the target object.
 */
export function mergeWithSymbols<T extends object, U extends object>(
    target: T,
    source: U,
): DeepMergeAll<[T, U]> {
    if (source == null) return target as DeepMergeAll<[T, U]>;

    // Guard against null/undefined targets
    const dest = (target || {}) as Record<string | symbol, unknown>;

    for (const key of Reflect.ownKeys(source)) {
        const sourceValue = (source as Record<string | symbol, unknown>)[key];
        const targetValue = dest[key];

        if (isObject(targetValue) && isObject(sourceValue)) {
            // Recursively merge nested plain objects
            mergeWithSymbols(targetValue, sourceValue);
        } else if (sourceValue !== undefined) {
            // Assign primitives, arrays, or new objects directly
            dest[key] = sourceValue;
        }
    }

    return dest as DeepMergeAll<[T, U]>;
}

export const ulid: ReturnType<typeof monotonicFactory> = monotonicFactory();

function isSafeKey(key: string): boolean {
    return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

export function setProperty(obj: Record<string, unknown>, path: string, value: unknown): void {
    if (!path) return;
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!isSafeKey(part)) return;
        if (current[part] == null || typeof current[part] !== 'object') {
            current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
    }
    const lastPart = parts[parts.length - 1];
    if (isSafeKey(lastPart)) {
        current[lastPart] = value;
    }
}

// export default {merge, mergeWithSymbols, ulid, uuid4, uuid7, yaml, setProperty};

export const uuid4 = v4;
export const uuid7 = v7;
export const yaml = _yaml;
export const merge = _merge;

const _dateTime = () =>
    Type.Codec(Type.String({format: 'date-time'}))
        .Decode(value => new Date(value))
        .Encode(value => value.toISOString());

const _date = () =>
    Type.Codec(Type.String({format: 'date-time'}))
        .Decode(value => new Date(value))
        .Encode(value => value.toISOString().split('T')[0]);

export const type = {
    ...Type,
    // Convenience functions for common SQL column types
    increment: () =>
        Type.Optional(
            Type.Union([
                Type.Null(),
                Type.BigInt({readonly: true, default: 'auto-increment'}),
                Type.Integer({readonly: true, default: 'auto-increment'}),
            ]),
        ),
    integerNull: (options?: TNumberOptions) =>
        Type.Optional(Type.Union([Type.Null(), Type.Integer(options)])),
    integerNotNull: (options?: TNumberOptions) => Type.Integer(options),
    bigIntNull: (options?: TNumberOptions) =>
        Type.Optional(
            Type.Union([
                Type.Null(),
                Type.BigInt(options),
                Type.Integer(options),
                Type.String({pattern: '^-?\\d+$'}),
            ]),
        ),
    bigIntNotNull: (options?: TNumberOptions) =>
        Type.Union([
            Type.BigInt(options),
            Type.Integer(options),
            Type.String({pattern: '^-?\\d+$'}),
        ]),
    stringNull: (options?: TStringOptions) =>
        Type.Optional(Type.Union([Type.Null(), Type.String(options)])),
    stringNotNull: (options?: TStringOptions) => Type.String(options),
    numberNull: (options?: TNumberOptions) =>
        Type.Optional(Type.Union([Type.Null(), Type.Number(options)])),
    numberNotNull: (options?: TNumberOptions) => Type.Number(options),
    booleanNull: (options?: TSchemaOptions) =>
        Type.Optional(
            Type.Union([Type.Null(), Type.Boolean(options), type.Literal(0), type.Literal(1)]),
        ),
    booleanNotNull: (options?: TSchemaOptions) =>
        Type.Union([Type.Null(), Type.Boolean(options), type.Literal(0), type.Literal(1)]),
    dateNull: () => Type.Optional(Type.Union([Type.Null(), _date()])),
    dateNotNull: () => _date(),
    dateTimeNull: () => Type.Optional(Type.Union([Type.Null(), _dateTime()])),
    dateTimeNotNull: () => _dateTime(),
    ulid: () => Type.Optional(Type.Union([Type.Null(), Type.String({default: 'ulid'})])),
    uuid: () => Type.Optional(Type.Union([Type.Null(), Type.String({default: 'uuid'})])),
    uidNull: () => Type.Optional(Type.Union([Type.Null(), Type.String({format: 'uid'})])),
    uidNotNull: () => Type.String({format: 'uid'}),
};

export const rename = (object: object, value: string) =>
    Object.defineProperty<unknown>(object, 'name', {value});
export const group =
    (name: string, config?: {autoSnapshot?: boolean; mask?: string[]}) => (steps: unknown[]) => {
        Object.defineProperty(steps, 'name', {
            value: name,
            enumerable: false,
            writable: true,
        });
        if (config?.autoSnapshot !== undefined)
            Object.defineProperty(steps, 'autoSnapshot', {
                value: config.autoSnapshot,
                enumerable: false,
                writable: true,
            });
        if (config?.mask !== undefined)
            Object.defineProperty(steps, 'mask', {
                value: config.mask,
                enumerable: false,
                writable: true,
            });
        return steps;
    };
export const checkpoint = (name: string, ...markers: string[]) => {
    const arr: string[] = markers.length > 0 ? [...markers] : ['*'];
    return Object.assign(arr, {name});
};

// Code from https://github.com/perry-mitchell/ulidx/blob/main/source/crockford.ts
// cSpell:disable-next-line
const B32_CHARACTERS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function crockfordEncode(input: Uint8Array): string {
    const output = [];
    let bitsRead = 0;
    let buffer = 0;
    const reversedInput = new Uint8Array(input.slice().reverse());
    for (const byte of reversedInput) {
        buffer |= byte << bitsRead;
        bitsRead += 8;
        while (bitsRead >= 5) {
            output.unshift(buffer & 0x1f);
            buffer >>>= 5;
            bitsRead -= 5;
        }
    }
    if (bitsRead > 0) {
        output.unshift(buffer & 0x1f);
    }
    return output.map(byte => B32_CHARACTERS.charAt(byte)).join('');
}

export function crockfordDecode(input: string): Uint8Array {
    const sanitizedInput = input.toUpperCase().split('').reverse().join('');
    const output = [];
    let bitsRead = 0;
    let buffer = 0;
    for (const character of sanitizedInput) {
        const byte = B32_CHARACTERS.indexOf(character);
        if (byte === -1) {
            throw new Error(`Invalid base 32 character found in string: ${character}`);
        }
        buffer |= byte << bitsRead;
        bitsRead += 5;
        while (bitsRead >= 8) {
            output.unshift(buffer & 0xff);
            buffer >>>= 8;
            bitsRead -= 8;
        }
    }
    if (bitsRead >= 5 || buffer > 0) {
        output.unshift(buffer & 0xff);
    }
    return new Uint8Array(output);
}
