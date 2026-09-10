## What does this PR do?

## Which part(s) does it affect?

- [ ] Original extension (`extension/`)
- [ ] Personalized extension (`personalized-extension/`)
- [ ] Adapter Builder / Skill Builder (`personalized-extension/extension/{adapter,skill}-builder/`)
- [ ] Browser harness (`personalized-extension/extension/browser-harness/`)
- [ ] Validation layer (`personalized-extension/extension/validation/`)
- [ ] Voice/Text Control (`webapp/`)
- [ ] Docs

Auditors, adapters, profiles, the toolkit core and the CLI are canonical in
the [toolkit repository](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit).
A change to any of those goes there, and arrives here through a vendor pin
bump and rebuild (see "Builds and tests" in the README).

## Who benefits?

Which profiles/disabilities does this help?

## How to test

1. `npm test` (Librarian regression gate) and `npm run check:loadable`
2. Load the extension in Chrome: `chrome://extensions` → Developer mode →
   Load unpacked → `extension/`, or `personalized-extension/extension/` for
   the personalized one
3. If your change affects the committed bundles: `npm ci` in both roots,
   `npm run build`, and commit the rebuilt outputs (CI fails on drift). If
   you touched a manifest or service worker, run `npm run check:chrome` too
4. ...

## Committed build outputs

If this PR changes a `*.bundle.js`, a file under
`personalized-extension/extension/lib/`, or anything under a `dist/`
directory, say which build produced it and in which repository. These are
generated files, not hand-edited ones.
