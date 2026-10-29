/**
 * Type for an image imported as an asset URL.
 *
 * Storybook is served by Vite, which turns an image import into the URL it
 * publishes. TypeScript does not know that on its own, and the fixtures import a
 * picture, so the shape is declared here rather than by pulling in all of
 * `vite/client`.
 */
declare module '*.jpg' {
    const url: string;
    export default url;
}
