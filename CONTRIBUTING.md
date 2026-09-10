# Contributing

This repository holds the browser-facing half of the project: the two Chrome
extensions and the prototype web apps. The tools catalog and the toolkit core
they are built from live in the
[toolkit repository](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit),
so the first question is which repo your contribution belongs in.

## Which repo does my contribution go to?

| I want to... | Where |
|--------------|-------|
| **Find an issue** (new auditor) | Toolkit repo → `tools/auditors/` |
| **Fix an issue** (new adapter) | Toolkit repo → `tools/adapters/` |
| **Combine adapters for a need** (new skill) | Toolkit repo → `toolkit/skills/builtin/` |
| **Add or tune a profile** | Toolkit repo → `tools/profiles/settings.json` |
| **Work on the skill engine** (the Engineer, `skill-builder.js`) | Toolkit repo → `toolkit/core/` |
| **Change the extension UI** (popup, background, content script) | Here → `extension/` |
| **Work on the Adapter Builder or Skill Builder UI, onboarding, memory, or voice mode** | Here → `personalized-extension/` |
| **Work on the web app prototypes** | Here → `webapp/` |

Rule of thumb from the catalog side: **need a new primitive → adapter (code);
need a new recipe → skill (no code).** A skill only composes adapters that
already exist. Both are toolkit-repo contributions; this repo picks them up
through its built bundles.

## Contributions we're looking for

Code is not the only kind. Right now, useful contributions here include:

- **Real-page reports.** Try an extension on pages you actually use and
  tell us where adaptations helped, failed, or misfired. This is research
  data, not just bug reporting.
- **Documentation for people, not programmers** — plainer wording,
  screenshots with good alt text for the install guide, translations.
- **Accessibility fixes to this repository itself** — image alt text,
  heading structure, diagrams that read well in a screen reader.
- **Extension UI work** — see the table above and open issues.

New adapters, auditors, profiles, and skills are wanted too — in the
toolkit repository, where its CONTRIBUTING lists what is most useful.

## Set up

```bash
git clone <your fork of this repository>
```

No build step is needed to run what is here: the bundles are committed.

- Chrome: `chrome://extensions` → Developer mode on → **Load unpacked** → `extension/`
- Personalized extension: **Load unpacked** → `personalized-extension/extension/` (keep Developer mode on; its generated adapters run as user scripts)

## The registry and settings vocabulary

The canonical registry moved into the toolkit:
[`personalized-extension/skills/registry.js`](personalized-extension/skills/registry.js)
is now a one-line re-export of `@ai4a11y/toolkit/registry`, whose
`settingsMeta` is the full settings vocabulary — every key, its type, and
its valid range — and is what `validateSkill` checks recipes against. When
an adapter lands in the toolkit repo's catalog, it becomes available here
through a one-line re-export in `personalized-extension/skills/builtin/`;
its registry entry (`supportAreas`, `settings`, a one-line `description`,
`quickStart: true` for fast onboarding) is made in the toolkit repo's
`toolkit/registry/tools.js`.

Note: the re-export files and the full builds resolve the toolkit code from
the vendored `@ai4a11y/toolkit` and `@ai4a11y/tools` packages, so the
bundles rebuild here: `npm ci` in both roots, then `npm run build`. Commit
the rebuilt outputs with your change; CI fails on stale bundles. See
"Builds and tests" in the README.

## Testing

```bash
npm test   # Librarian regression suite (86 checks, no install needed)
```

`personalized-extension/test/verifier-test.mjs` also runs here, now that
its imports resolve from the vendored packages; CI runs it. Two browser
tests need a local Chromium and are skipped in CI —
`personalized-extension/test/skills-page-test.js` and `demo-beats-e2e.js`.
Run them locally if you touched the Skill Builder page or the demo.

Then try your change on real pages: load the extension and use it. Test on
more than one kind of page (an article, a form, a data table).

## PR Guidelines

- One feature per PR
- Test on real sites
- `npm test` and `npm run check:loadable` must pass; both run on a bare
  checkout with no install
- If you touched a manifest, a service worker or a committed bundle, run
  `npm run check:chrome` too (needs Chrome and one `npm ci`)
- Describe who benefits (which disability/profile)
- The committed bundles are the runnable state. Do not hand-edit a
  `*.bundle.js` or a generated `personalized-extension/extension/lib/` file;
  if your change affects them, rebuild (`npm run build`) and commit the
  outputs, or CI fails on the drift

## What to expect from review

This is a time-boxed research project. During the active phase we review
as capacity allows; afterwards, review may be slow or paused while
longer-term maintainership is defined (see the toolkit repository's
ROADMAP, Governance). An unreviewed PR is a statement about our capacity,
not about your contribution.

## Forks and spin-offs

This project is a research probe with a deliberately small core. We do not
expect — or want — every idea to land in this repository. If it is useful
to you but you need it to go somewhere we aren't going, **fork it. That's
a success, not a defection.**

What we ask in return is the learnings. If your fork or spin-off teaches
you something — an adapter that worked, a design that didn't, a need the
ability model can't express, results from testing with the people you
built it for — open an issue or a short write-up telling us what you
found. Code back is welcome; understanding back is the part we can't get
any other way.

Practical notes for forkers:

- The Apache 2.0 license already permits all of this; this section is an
  invitation, not a condition.
- Please rename your fork enough that people don't mistake it for this
  project, and keep the "research probe, not validated, not a replacement
  for assistive technology" framing anywhere you inherit our claims.
- If you want your project listed alongside the others building on the
  toolkit, add it to the toolkit repository's `docs/projects.md` by pull
  request.

How outside contributions and forks will be handled longer term
(custodianship, reconciling forks) is still being defined; this section
will be updated when it is.

## Code Style

- ES modules, bundled by esbuild
- Use the AI provider abstraction for AI features (`utils/ai.js` in the
  `@ai4a11y/tools` package; canonical source in the toolkit repo)
- Document which profiles/disabilities the feature helps
- No large binaries — use Git LFS or link externally

## Ethics

- People with disabilities must be involved in design and evaluation
- Compensate participants
- Handle user profiles and personalization data carefully
- Don't simulate ability profiles without community input

## Questions?

Open an issue on this repository (or the toolkit repository's, per the
table above). Current contact routes: [MAINTAINERS.md](MAINTAINERS.md).
