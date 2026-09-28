# Themes and visual variants

A theme decides how the application looks without deciding what it does. The same pages, the same
widgets and the same behaviour render in three visual identities — `standard` (the PrimeReact look
the components were built against), `glass` and `wood` — and a variant is chosen by configuration
rather than by a build.

The one thing worth being precise about, because it is easy to assume otherwise: **the configuration
selects a variant; the variant is a stylesheet.** Glass and wood are not a set of tokens that fill
in a shape — they are 601 and 1106 lines of scoped CSS respectively, plus (for wood) generated
textures and (for glass) a small runtime that keeps reflections in step. The config object names the
variant and supplies values such as `primary` and `fontSize`; it does not describe the identity.

![The coral editor in the glass variant, captured from the `editor--glass` story](./img/theme-glass.png)

![The same page in the wood variant, from `editor--wood`](./img/theme-wood.png)

## The configuration

`Theme.tsx` accepts an `IThemeConfig`:

```typescript
export type ThemeVariant = 'standard' | 'glass' | 'wood';

export interface IThemeConfig {
    type?: 'big' | 'compact';
    palette?: 'light' | 'dark';
    direction?: 'ltr' | 'rtl';
    primary?: string;
    variant?: ThemeVariant; // selects the visual identity
    name?: string; // a theme-option id from the registry, e.g. `glass`
    switcher?: boolean;
    fontSize?: number;
    languages?: Record<string, object>;
}
```

With nothing set, `variant` is `standard` — no variant class is added and the page renders on the
base theme. Set `variant: 'glass'` (or name the option through `name` or the switcher, which
persists its choice in `localStorage['blong.theme']`) and two markers appear. The provider puts one
on the document root, which is what the portal overlays are scoped by, and one on the application
wrapper beside the palette and density classes:

```html
<html class="blong-theme-glass">
    …
    <div class="blong-app blong-app-dark blong-app-compact blong-app-glass"></div>
</html>
```

For `standard` the root has no class at all and the wrapper stops at
`blong-app blong-app-dark blong-app-compact`; that difference is also how a test tells which variant
rendered. Every variant rule is scoped under one of those markers — `.blong-app-glass …`,
`.blong-theme-glass .p-dropdown-panel …` — which is what keeps a variant from being a fork of the
components. The only module that imports variant CSS is `Theme.tsx`.

## What a variant may change

| Concern            | How it is expressed                                                                     |
| ------------------ | --------------------------------------------------------------------------------------- |
| Surfaces           | Scoped rules for cards, panels, the toolbar, the inspector and table rows               |
| Inputs and widgets | Dropdown, select, checkbox and button styling under the portal marker                   |
| Portal overlays    | `.p-dropdown-panel`, and for wood also `.p-overlaypanel` and `.p-confirm-popup`         |
| Textures           | Images and CSS custom properties (wood grain, bevel, mesh), never inline in a component |
| Motion             | Glass adds a reflection pass with `--glare-angle` / `--glare-shift`                     |

### Where each variant lives

| Variant | Files                                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| Glass   | `components/Theme/glass.css` (601 lines), `glassReflection.ts`                                                          |
| Wood    | `components/Theme/wood.css` (1106 lines), generated `wood-assets.css`, `assets/wood-grain.png`, `assets/wood-edge.webp` |

Wood's textures are produced by `scripts/woodAssets.mjs` (`npm run theme:wood-assets`), so the
binary assets and the custom properties that reference them are regenerated together rather than
hand-edited. The runtime part is glass's alone: `updateGlassReflections` runs on an interval and on
resize, which is why the provider — not a component — owns it.

Glass styles the dropdown panel only; wood also styles the action hint and the confirm popup. A new
variant is expected to cover the same list, and the difference between the two is a gap rather than
a design.

## Modes

`palette` is `'light' | 'dark'`, but the sun/moon toggle is offered only for a PrimeReact family
that ships both — the switcher renders it when the registry option carries both palettes:

```typescript
const paletteToggle = Boolean(option.light && option.dark);
```

The glass and wood registry entries carry neither, so they are pinned to the base palette (dark by
default) and show no toggle, and neither variant's CSS has light/dark rules. This is asserted rather
than implied: the theme tests include "keeps blong variants on the dark base with no palette toggle"
and the switcher test asserts the toggle is absent for glass. A variant that wants both modes has to
add the light palette to its registry entry **and** the rules that respond to it.

## The boundary, and the one place it is crossed

A theme may change appearance; it may not change behaviour. The near-universal mechanism is CSS
scoping, and outside `Theme.tsx` no component branches on a variant name.

There is one counter-example, and it is worth recording rather than tidying away: the action button
gained a `failed` state with a two-second timer so the wood variant could paint the button that
errored rust-coloured. That is a behaviour change made for a theme — small, deliberate, and exactly
the shape of change the boundary is meant to prevent, because the component now knows something
about a skin. Treat it as the exception that shows why the rule needs stating.

## Reviewing a variant

A variant is reviewable without clicking through the application, because a story can set the theme
through a Storybook parameter:

```typescript
Glass.parameters = {theme: {variant: 'glass'}};
Wood.parameters = {theme: {variant: 'wood'}};
```

The decorator spreads the parameter over the default theme and resets the persisted choice per
story, so the story always renders the variant it names. The checkout contains paired stories bound
from the same page — `editor--glass` and `editor--wood`, plus a toolbar and a tilt pair — which is
the cheapest way to confirm that a change to one variant did not disturb the other.

Tests worth knowing about: `themeRegistry.test.ts` asserts that option ids are unique and that every
referenced PrimeReact folder has a loader (the failure mode being a theme option that silently loads
nothing); `Theme.test.tsx` and `ThemeSwitcher.test.tsx` cover variant selection, the palette toggle
rule and the root markers.

## Adding a variant

1. Add the registry entry (`id`, `label`, `variant`) in `themeRegistry.ts`.
2. Write the scoped stylesheet, with every rule under the variant marker, and import it from
   `Theme.tsx` only.
3. Cover the concerns in **What a variant may change** — surfaces, inputs and widgets, the three
   portal overlays, textures, and motion if the identity has any.
4. If the variant ships assets, generate them from a script so the images and the properties that
   name them cannot drift.
5. Add the paired story, and assert the selection rule in the theme tests.
