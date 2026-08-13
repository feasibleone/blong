# blong-browser — Storybook & Unit-Test Conventions

Localized reference — load only when writing/editing stories or `src/**/*.test.tsx`.

## Storybook conventions

- **Language / translations:** Set `lang: 'bg'` (or any registered locale code) as a story arg —
  `withDispatch` activates translations and PrimeReact locale automatically. See the **blong-i18n**
  skill for setup details.

```ts
export const ToolbarBG: StoryFn = Template.bind({});
ToolbarBG.args = {lang: 'bg'};
```

- **Toast notifications:** The global `withDispatch` decorator shows a success toast after mutations
  (excludes `portal.dropdown.list` and methods ending with `Get/Load/Find/List/Fetch`). Control per
  story via `decorators: [withDispatch({}, {notify: false})]` (suppress), `{notify: ['method.name']}`
  (specific), or `{notify: true}` (all).
  `NotifyConfig = boolean | string[] | ((method: string) => boolean)`.

- **`play()` functions:** Use the modern Storybook 10 pattern — `canvas` and `userEvent` are provided
  as play context args (`canvas` is pre-scoped, no need for `within`). Run play functions in unit
  tests by passing `{canvas: within(container), userEvent}`. For translated stories, see
  **blong-i18n** for which labels are translated and which aren't.

```ts
MyStory.play = async ({canvas, userEvent}) => {
    await userEvent.click(await canvas.findByText('Row label'));
    // A small wait may be needed in Storybook (real browser, real CSS transitions).
    // In vitest unit tests cssTransition is disabled so no wait is necessary there.
    await new Promise(r => setTimeout(r, 200));
};
```

- **Important**: `<Form>` must always have a real `onSubmit` handler attached (via `handleSubmit`
  even when no `onSubmit` prop is provided) — otherwise the browser will navigate on form submit.

## Unit test conventions

Tests live in `src/**/*.test.tsx` and run with Vitest (`npx vitest run`).

- **Test render wrapper** (`src/test/render.tsx`): Use `render()` from `../../test/render.js` — it
  wraps the component in `PrimeReactProvider value={{cssTransition: false, ripple: false}}` and
  `BlongProvider` (via `makeHandlerProxy`). This disables all PrimeReact animations, so overlays and
  dropdowns open synchronously with no real-time delays.

- **`pr_id_*` normalisation** (`src/test/setup.ts`): A snapshot serializer strips PrimeReact's
  internal incrementing component IDs (`pr_id_55=""`, `aria-controls="pr_id_55_panel"`, …) from
  every DOM snapshot. This makes snapshots counter-independent — they reflect structure, not
  identity.

- **No `setTimeout` waits**: Because dispatch mocks resolve immediately and transitions are
  synchronous, arbitrary `setTimeout` waits are not needed. `await findByTestId(...)` and
  `await waitFor(...)` already yield to pending microtasks on their first poll. Do not add
  `await act(async () => { await new Promise(r => setTimeout(r, N)); })` guards unless a test
  genuinely depends on real elapsed time (e.g. debounce logic).

- **`act()` warnings from PrimeReact**: PrimeReact's Dropdown/Select components schedule
  focus-management callbacks via `setTimeout(0)`. These fire during `@testing-library/react`'s
  `waitFor()` polling window, where `IS_REACT_ACT_ENVIRONMENT` is temporarily set to `false` by the
  library's internal `asyncWrapper`. The combination produces harmless "not configured to support
  act" noise in console output when play() functions call `canvas.findByText()` or similar async
  queries. `src/test/setup.ts` suppresses this specific message globally (and only this message)
  since it is a known PrimeReact + testing-library incompatibility — not a defect in our code. All
  other console.error output is preserved.

- **`flushEffects` helper** (`src/test/render.tsx`): Drains the macro-task queue inside `act()` so
  PrimeReact's post-interaction focus-management timers are flushed before the final `findByTestId`
  snapshot assertion. Use it after `await act(() => Story.play!({...}))` calls that trigger user
  interactions on PrimeReact components, and before play() is called (to drain initial-render
  timers):

```tsx
if (MyStory.play) {
    await flushEffects(); // drain initial-render PrimeReact timers
    await act(() => MyStory.play!({canvas: within(container), userEvent: userEvent.setup()}));
    await flushEffects(); // drain post-interaction timers
}
```

- **Zustand store mutations in tests**: If a test mutates global Zustand store state (e.g. calling
  `useAppStore.getState().setTranslations(...)`) and components that subscribe to that store are
  mounted, wrap the mutations in `await act(async () => { ... })` so React processes the resulting
  re-renders inside act. This applies to both setup and tear-down (`finally`) blocks.

- **Snapshot tests**:

```tsx
it('Basic render equals snapshot', async () => {
    const {findByTestId} = render(<Basic />, {dispatch});
    expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
});
```

After interactions via a `play()` function, wrap it in `act` and flush PrimeReact timers:

```tsx
it('After interaction equals snapshot', async () => {
    const {findByTestId, container} = render(<MyStory />, {dispatch});
    if (MyStory.play) {
        await flushEffects(); // drain PrimeReact init timers before play() calls findByText
        await act(() => MyStory.play!({canvas: within(container), userEvent: userEvent.setup()}));
        await flushEffects(); // drain post-interaction PrimeReact timers
    }
    expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
});
```

Update stale snapshots with `npx vitest run -u`.
