# Todo

Potential unfinished, deferred or future tasks spotted during implementation.

## List of incomplete tasks

- same queries are repeated in multiple places, they should be refactored into a single function
- avatar photo upload (initials-only for now — per user decision)
- allow multi statement in blong-dev sql
- create db admin ui
- create k8s admin ui
- tests are doing too many assertions instead of snapshotting
- compile queries to procedures
- combined storybook
- backend for the storybook
- translations from the DB

## List of completed tasks

- profile UI menu (top-right avatar) and profile page implemented (blong-access + blong-browser): `access.profile.get/edit/password.change`, AccountMenu, profile page, Playwright tests + screenshots
- preferred language returned during login (`login.token.create`/`restore`/`refresh` resolve the profile → `profile.language`) and applied to the UI (`setLanguage` + `translationsByLanguage` + `bgLocale` PrimeReact locale) — blong-access Playwright test screenshots the profile page in Bulgarian (`profile-bg.png`); tap assertions cover login/refresh
- menubar language switcher (`LanguageSwitcher`, left of the profile menu) for ad-hoc UI language switching — config-driven via `portal.languages`, falls back to `portal.translations` keys; blong-access Playwright test + screenshots (`language-switch-*.png`)
