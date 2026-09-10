import {library} from '@feasibleone/blong';

/** The input both `text` handlers work from. */
export type TextParams = {
    /** Text given on the command line. */
    value?: string;
    /** A file to read the text from instead. */
    file?: string;
};

/** The slice of the platform this library needs (`IPlatformApi` structurally). */
type TextPlatform = {
    readFileSync(path: string, options: {encoding: BufferEncoding}): string | Buffer;
};

/**
 * The text a command should operate on — `--value`, or the contents of `--file`.
 *
 * A `library()` function rather than a handler: it has no endpoint of its own,
 * and both handlers need it. It is attached to the handler proxy as
 * `lib.textInput` for every handler in this group, so neither has to import it —
 * the framework's IoC rule.
 *
 * It reads the platform off `this`, exactly as a handler does. Under the `cli`
 * intent that is the Node platform, which is how a command reaches the
 * filesystem: no HTTP server and no browser sandbox are involved.
 */
export default library(
    () =>
        function textInput(this: {platform: TextPlatform}, params: TextParams): string {
            if (params.value !== undefined) return String(params.value);
            if (params.file !== undefined) {
                return String(this.platform.readFileSync(params.file, {encoding: 'utf-8'}));
            }
            // A real realm would define this in the error layer instead of throwing a
            // plain Error — see the `blong-error` skill. The demo keeps it short.
            throw new Error('provide --value=TEXT or --file=PATH');
        },
);
