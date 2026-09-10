// The package ships TypeScript sources (there is no `dist/`), so the component
// is imported as source rather than as the compiled `BlongGraph.js` sibling,
// which is gitignored and only exists on a machine that has built the package.
export {BlongGraph} from './BlongGraph.tsx';
