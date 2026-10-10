# The image, the artifact and the build context

Two things travel to a cluster, and confusing them costs days. The **framework image** carries the
runtime: the loader, the adapters, the realms the framework ships. The **artifact** carries the
suite and the realms it loads, fetched into a volume by the deployer. A handler change therefore
needs a new artifact, an adapter change a new image, and neither shows up until the process that was
running is restarted — the volume keeps serving whatever it already unpacked.

## A deployment is not a publish

`rush deploy` honours each package's `.npmignore` unless the scenario sets
`includeNpmIgnoreFiles: true`, and the option's name reads backwards: the default already _applies_
the ignore files. A publish list answers "what does a consumer of this package need", while a
running suite imports whatever its own modules import — `plan.ts` beside the handler that uses it,
`realm/blong-login/server.ts`, `core/blong/knex.ts`. Those are exactly the files no entry point
names, so the first artifact was one file short per package and nothing failed until a pod imported
the missing module (F-376).

Every deploy config sets the option now — `common/config/rush/deploy.json`, which is the one the
image itself is built under (`rush deploy -p @feasibleone/blong-gogo`), and the two scenarios the
artifacts come from. What it buys is visible in the tree that comes out of it: 869 MB, beside the 1
GB image that ships it, measured rather than remembered (`du -sh common/deploy`, `podman images`),
where the filtered tree was about half of that. The figure is worth keeping in view, because it is
the honest size of a package that can boot, and "optimising" it back is how the missing-file failure
returns.

## `.dockerignore` is not `.gitignore`

Both files list paths to leave out, and they mean different things: git tracks a working tree, while
a build context is what gets sent to the builder. They are also matched by different rules, and that
is what made the first fix miss: podman reads a pattern without a slash against the context root
only, where gitignore reads it at every depth, so leaving out `.vscode-test` left
`ext/rest-fs/.vscode-test` — fifteen downloaded editors, some 15 GB — in the context, with every
package's `node_modules` (9 GB), `.tap` and `coverage` beside it. Only writing the patterns as
`**/…` cured it (F-379). A multi-stage build adds the other half: the builder stage stays behind as
a _dangling_ image, two of them at 26 GB each, on a disk that was 62 GB full before the first
successful run. A prune and the ignores brought it to 9.3 GB. Nothing warns about either half: the
build succeeds, and the space is simply gone.

## One COPY per category, because podman has no `COPY --parents`

The Dockerfile copied the repository with `COPY --parents`, a BuildKit feature that podman's buildah
rejects — and podman is the runtime the k3d runbook prescribes (F-373). The image therefore copies
one folder per package category (`core`, `realm`, `suite`, `demo`, `test`, `tools`, `docs`, `ext`),
and `common` whole, because the lockfile, the Rush configuration and the launcher the install runs
are configuration rather than source.

The copies are split across two layers, and that split is what the shape is for. The manifest layer
is one `COPY` per package `package.json`, generated from `rush.json` by
`node core/blong-gogo/docker/manifests.mjs --write` and gated by the same script's `--check`, so a
package added without regenerating it is a stale block rather than a missing directory at runtime.
Copying whole categories above the install instead puts every source file in front of it, and any
edit anywhere then re-ran the dependency tree _and_ `node-rdkafka`'s native build — ten to fifteen
minutes for a comment. The Dockerfile's own comment records that trap, which is where the split is
argued. The source layer below is the eight categories, so an edit there invalidates that layer and
nothing above it; what it still costs is the context, which carries the sources of categories a
framework image never deploys.

Narrowing it further is a separate decision rather than a bug fix. The deploy trees under
`common/deploy` are what the image actually runs, so copying those plus `rush.json` would be smaller
and more precise — at the price of an image that no longer matches the repository it was built from,
which is a trade the next person to debug a container deserves to know about before making.

## What this means in practice

The two halves have different lifetimes, and that is the whole consequence. A handler change travels
in the artifact, so it needs `rush deploy`, a zip, a publish and a re-prefetch of the volume. An
adapter change travels in the image, so it needs a rebuilt image, imported into every node. A CRD
change travels in neither: the install owns the CRD and a reconcile skips it deliberately
(`apply.ts` carries the reason), so the regenerated tree has to be applied again. Whichever it is,
the process that was running has to be restarted, because the volume keeps serving what it already
unpacked.

Sizes to keep in view, measured beside the tree they describe rather than remembered: the framework
image is 1 GB and the deploy tree inside it 869 MB (`podman images`, `du -sh common/deploy`), while
the suite artifact is 682 MB zipped and carries test output it does not need (T-264).

See the [kustomize pattern](../patterns/kustomize.md) for the operational version of the same list —
the layout, the volume and the artifact fields a reader sets — and
[the kustomize rationale](./kustomize.md) for why the deployer fetches the artifact rather than the
application.
