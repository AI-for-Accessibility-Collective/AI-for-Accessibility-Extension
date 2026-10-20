# Contributing

This repository has the browser extensions and prototype web apps built on the
[AI for Accessibility Toolkit](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit).

| Folder | What's in it |
|---|---|
| `extension/` | The original extension: popup, background and content script |
| `personalized-extension/` | The personalized extension: onboarding, memory, voice mode, the Adapter Builder and Skill Builder, the browser harness and the validation layer |
| `webapp/` | Prototype web apps that control the browser by voice or typed commands |

## Ways to contribute

### Share feedback

Try one of the extensions on pages you use, then open an issue about where it
helped and where it got things wrong. If you'd rather not use GitHub, you can
email us instead (see [SUPPORT.md](SUPPORT.md)).

### Improve the extensions

Fix a bug or improve something in one of the folders above. For bigger
changes, please open an issue first.

### Add a skill, adapter, auditor or profile

These live in the toolkit repository, so add them there (see its
[CONTRIBUTING.md](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit/blob/main/CONTRIBUTING.md)).
The extensions here include them after we update the copy of the toolkit in
`vendor/`.

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

You can load the extensions without building anything first. Keep Developer
mode on for the personalized extension, as the adapters it generates run as
user scripts.

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

These two need no install:

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
`npm run check:loadable` pass. When you open a PR, GitHub fills in our
template, which asks:

- What does this PR do?
- Which parts does it affect?
- Who does it help?
- How did you test it?
- If it changes a committed bundle, which build made it?

## Working with people with disabilities

- Involve people with disabilities in designing and testing what you build.
- Pay participants.
- Be careful with profile data, as it can reveal someone's disability.
- Don't create ability profiles without input from the community they are
  meant for.

## Questions

See [SUPPORT.md](SUPPORT.md) for how to reach us.

Thank you for your contributions!
