# Contributing

This repository has the browser extensions and prototype web apps built on the
[AI for Accessibility Toolkit](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit).

| Folder | What's in it |
|---|---|
| `extension/` | The original extension: popup, background and content script |
| `personalized-extension/` | The personalized extension: onboarding, memory, voice mode, the Adapter Builder and Skill Builder, the browser harness and the verification layer |
| `webapp/` | Prototype web apps that control the browser by voice or typed commands |

## Ways to contribute

### Share feedback

To try the extensions, follow [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md)
and use them on pages you visit. Then open an issue about what helped and what
went wrong. If you'd rather not use GitHub, you can email us instead (see
[SUPPORT.md](SUPPORT.md)).

### Improve the extensions

The extensions' code is in the folders above. For example, you could fix a bug
in the popup (`extension/src/popup/`) or in the Skill Builder
(`personalized-extension/extension/skill-builder/`). Look through the
[open issues](../../issues), or fix something you ran into.

### Add a skill, adapter, auditor or profile

A skill turns on a few adapters together for a specific need, e.g.,
`calm-browsing` turns on reduced motion, dark mode and focus mode. An adapter
is code that makes one change to a page, e.g., a reading ruler. These live in the
toolkit repository, so add them there by following its
[Adding to the catalog](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit/blob/main/docs/adding-to-the-catalog.md)
guide. The extensions here include them after we update the copy of the
toolkit in `vendor/`.

## Setting up

1. Install [Node.js](https://nodejs.org/) 20.19 or later.

2. Clone your fork.

```bash
git clone <your fork>
cd AI-for-Accessibility-Extension
```

3. Load an extension in Chrome. Open `chrome://extensions`, turn on
   **Developer mode**, click **Load unpacked** and choose `extension/` or
   `personalized-extension/extension/`.

You can load the extensions without building anything. For the personalized
extension, keep Developer mode on, and on Chrome 138 and later also turn on
**Allow User Scripts** on its **Details** page.

## Building

If you change code that goes into a bundle, rebuild and commit the output.

```bash
npm ci
npm --prefix personalized-extension ci
npm run build
```

Don't edit `*.bundle.js` files or files in `personalized-extension/extension/lib/`
by hand. CI checks that the committed files match a fresh build.

## Testing

You can run these two without installing anything:

```bash
npm test                  # Librarian tests
npm run check:loadable    # both extensions load from this checkout
```

After installing (see Building), you can also run:

```bash
node personalized-extension/test/verifier-test.mjs
npm --prefix personalized-extension test
```

If you changed a manifest, a service worker or a bundle, also run
`npm run check:chrome` (needs Chrome and the install from Building).

Then try your change in Chrome on a few kinds of pages, e.g., an article, a
form and a data table.

## Pull requests

Keep each PR to one change, and make sure `npm test` and
`npm run check:loadable` pass.

GitHub fills in this template when you open a PR. You can also copy it from
here:

```markdown
## What does this PR do?

<!-- A sentence or two. If it fixes an issue, add "Closes #123". -->

## Which parts of the repository does it change?

- [ ] Original extension (`extension/`)
- [ ] Personalized extension (`personalized-extension/`)
- [ ] Adapter Builder or Skill Builder (`personalized-extension/extension/adapter-builder/`, `personalized-extension/extension/skill-builder/`)
- [ ] Browser harness (`personalized-extension/extension/browser-harness/`)
- [ ] Verification layer (`personalized-extension/extension/validation/`)
- [ ] Web apps (`webapp/`)
- [ ] Docs

## Who does it help?

<!-- Which needs or profiles does this help? -->

## How did you test it?

- [ ] `npm test` and `npm run check:loadable` pass
- [ ] I loaded the extension in Chrome and tried the change on a few real pages
- [ ] If I changed a manifest or a service worker, `npm run check:chrome` passes
- [ ] If I changed code that goes into a bundle, I ran `npm run build` and committed the rebuilt files
```

If you're planning a bigger change, e.g., a new feature in the personalized
extension, please open an issue to discuss it before you start.

## Working with people with disabilities

- Involve people with disabilities in designing and testing what you build.
- Pay participants.
- Be careful with profile data, as it can reveal someone's disability.
- Don't create ability profiles without input from the community they are
  meant for.

## Questions

See [SUPPORT.md](SUPPORT.md) for how to reach us.

Thank you for your contributions!
