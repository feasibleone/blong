# Website

The Blong documentation site, built with [Docusaurus](https://docusaurus.io/). The conventions for
the pages themselves — the three tiers, generated artefacts, diagrams and screenshots — are in the
**blong-docs** skill.

## Installation

```bash
yarn
```

## Local Development

```bash
yarn start
```

This command starts a local development server and opens up a browser window. Most changes are
reflected live without having to restart the server.

## Build

```bash
yarn build
```

This command generates static content into the `build` directory and can be served using any static
contents hosting service.

## Deployment

Using SSH:

```bash
USE_SSH=true yarn deploy
```

Not using SSH:

```bash
GIT_USER=<Your GitHub username> yarn deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to build the website and
push to the `gh-pages` branch. In this repository the deploy runs `npm run stage-storybook` first, so
the pages and the Storybooks they embed are published together; `npm run deploy-docs-only` skips
that step and leaves the last staged Storybooks out of the site.

## Storybooks

The site publishes the Storybooks of the packages it documents, so a page can show a story running
instead of a picture of one:

```mdx
<StorybookStory site="browser" id="editor--toolbar" title="The editor toolbar" />
```

Two things make that work: [`storybook-sites.json`](./storybook-sites.json) is the register of the
sites — which package builds which Storybook, and under what name — and
[`src/components/StorybookStory/`](./src/components/StorybookStory/) renders one, registered as an
MDX component in `src/theme/MDXComponents.jsx` so that no page has to import it. The conventions for
writing an embed and for choosing a story are in the **blong-docs** skill and in
[the Storybook pattern](./docs/patterns/blong-browser.md#storybook-pattern).

```bash
npm run stage-storybook                    # build every site into static/storybook/
npm run stage-storybook -- --only browser  # just one, which is what a page about a widget needs
npm run stage-storybook -- --dry-run       # what it would build, without building it
```

Staging is what makes the stories live, and it is a step of the *deploy* rather than of the build.
The trees are 10 to 30 MB each and they are build outputs of other packages, which is why this
package installs its own `node_modules` with npm and no monorepo build stands between a docs change
and a `docusaurus build`. `npm run build` — the shape CI runs — therefore builds the site without
them: every embed renders the poster it was given, and `blong-dev docs verify` counts the embeds that
rendered rather than the stories they would have loaded. `npm run start`, `npm run build`,
`npm run serve` and `npm run deploy` all serve whatever is staged, from the same origin as the page,
under `/storybook/<name>/`.

`npm run serve` here is **not** `docusaurus serve`: that one rewrites `/storybook/<name>/` to
`/storybook/<name>` and `iframe.html?id=…` to `iframe`, which resolves a published Storybook's
relative bundles one directory above where they live (every script 404s) and hands the preview a URL
with no story id (the story never renders) @@D-559. `npm run serve` is
`blong-dev docs serve`, which serves the build through the same small static server `docs verify`
loads; `npm run serve:docusaurus` keeps the Docusaurus one for anything that does not embed a story.
