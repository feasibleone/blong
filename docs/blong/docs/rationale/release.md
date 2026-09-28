# Release

## The problem

Blong is consumed in two very different ways. A deployment runs the framework as a container image
whose entry point is the `blong` CLI, and a realm that reuses a package — `blong-chain`,
`semantic-log`, `blong-openapi` — installs it from npm. The repository, meanwhile, is a Rush
monorepo, so a change to one package can be a change to several, and the version printed by a
running service has to be traceable back to a commit.

A manual release ritual does not survive that: someone must remember which packages changed, decide
each version, write the changelog, publish in the right order, build the image and tell the
deployment repository that a new image exists. Every one of those steps is a chance to publish a
package that depends on a version nobody released yet — and the failure is discovered by a consumer,
not by the pipeline.

## The approach

**The release is a consequence of a merge, not a separate act.** The last commit that prepared the
pipeline is titled `fix: prepare for publishing`, and the model it introduced has held since: a
workflow on every push to `main` asks release-please to maintain a release pull request. That pull
request carries the version bumps and the changelogs; merging it is the moment a release exists.
There is no separate "do the release" button, and nothing is published by a step whose only
justification is that someone ran it.

**Versions are per package, derived from the change itself.** A manifest lists every package in the
monorepo — 32 of them, each with its current version — and the bump comes from the
conventional-commit type in the merged title. A feature in one realm releases that realm; the others
keep their versions. The alternative, one version for the whole repository, would force every
consumer of a small package to take a release note for a realm it does not use.

**Publishing is opt-in per package.** A package is published when it declares a `ci-publish` script,
and skipped when it does not — so a package can live in the monorepo without entering the registry,
and a package that should stop being published says so by renaming the script rather than by editing
the pipeline. The same shape governs the image: the workflow discovers the Dockerfiles that exist
and builds them, producing a single `v<version>` tag from the manifest, which makes an image tag
immutable and a deployment reproducible.

**The release is not the only consumer of the pipeline, and it reuses the gate.** A pull request and
a push to `main` call reusable workflows from a shared `actions` repository rather than
reimplementing the steps here. The consequence to accept is that the pipeline's logic — what a
"green" run means, how the image is scanned, how the CD repository is notified — is maintained in
one place for several repositories, and the version this repository pins is a moving branch rather
than a commit.

**Supply chain is part of the release, not an afterthought.** The npm publish runs with provenance
attestation and public access, which is why the release job asks for an OIDC token; the image is
scanned and fails the build on a critical vulnerability before it is pushed; and only then does the
pipeline dispatch to the repository that deploys it.

## Trade-offs

- **No prerelease channel.** Every published version is a stable one; there is no `-next` or `-rc`
  line to try a change with a consumer before releasing it. The release pull request is the only
  preview, and it is a diff, not an installable version.
- **A tag never triggers a release.** The version tag is created by the release itself, so the
  pipeline cannot be driven by tagging a commit — a deliberate choice, since a tag is easy to move.
- **Independent versions in a repository that asks for consistency.** Rush is configured to prefer
  consistent versions, and this pipeline lives with the opposite: 32 packages whose versions differ
  because they drifted apart honestly. The cost is that a dependency upgrade can require a bump in
  more than one package in the same release.
- **Nothing publishes while the release pull request is open.** A fix that must ship immediately
  still waits for a merge and a release run, and that latency is the price of having a human in the
  loop.

The pipeline's behaviour is defined by the workflows in `.github/workflows/` and the release-please
manifest at the repository root; the priorities that make it a merge-gated flow rather than a manual
ritual are the ones described in [goals](./goals.md).
