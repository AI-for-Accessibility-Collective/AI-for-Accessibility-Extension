<div align="center">


# AI for Accessibility Extension

**Chrome extensions that adapt web pages to what each person needs**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

</div>

This repository has two Chrome extensions from the AI for Accessibility
Collective. On the websites you visit, they can make text bigger, turn the page
dark, stop moving content, describe pictures, add captions and rewrite
complicated text in plainer language. The personalized extension also learns
what helps you over time and suggests changes.

This is an early research version. Things may break or change, and we haven't
yet tested how well the page fixes work for any particular person. Please keep
using the assistive technology you rely on, e.g., your screen reader or
magnifier.

## Who this is for

- People who want web pages adapted to their needs, including people with
  disabilities. Start with [Install](#install) or the
  [Getting Started guide](docs/GETTING-STARTED.md). No programming needed.
- Developers working on the extensions, the Adapter and Skill Builders or the
  web apps. See [For developers](#for-developers).
- Developers building their own apps on the toolkit. See the
  [toolkit repository](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit).

## Install

You need a computer with Google Chrome (not a phone or tablet). Installing takes
about ten minutes, and you can remove it completely afterwards (see
[Removing it](#removing-it-and-erasing-what-it-learned)).

The [Getting Started guide](docs/GETTING-STARTED.md) goes through every step
with screenshots. The short version:

1. Download this repository (the green **Code** button, then **Download ZIP**)
   and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the `extension` folder inside the
   unzipped folder.
4. Open a news article, click the new icon next to the address bar, and choose
   a profile such as **Low Vision**.

For the personalized extension (onboarding, memory and adapters built for you),
load `personalized-extension/extension/` the same way. The adapters it builds
run as Chrome user scripts, so on Chrome 138 and later you also need to turn on
**Allow User Scripts** on the extension's **Details** page.

If something isn't working, see [Troubleshooting](docs/TROUBLESHOOTING.md).

### API key and cost

Bigger text, dark mode, spacing, focus mode and decluttering are free and work
right away without an account.

The AI features (describing images, captions, plain-language rewrites and
translation) need a Gemini API key from Google. To get one, sign in to
[Google AI Studio](https://aistudio.google.com/apikey) with a Google account,
create a key, and paste it into the extension's **API Keys** section once.
Google gives everyone a free daily allowance, and you only pay Google if you go
over it.

[docs/COSTS.md](docs/COSTS.md) explains what's free, what can cost money and
how to keep costs down.

## Before you rely on it

- Custom adapters (page fixes that you build or that someone shares with you)
  can read and change everything on the pages they run on, including what you
  type. We check their code for obvious problems, but that doesn't make a
  harmful one safe. Only add adapters from people you trust (see
  [SECURITY.md](SECURITY.md)).
- On banking, health and government sites, the extensions still adapt the
  page, but they don't remember anything about you there unless you turn that
  on.
- What the extensions learn about your needs is stored on your computer. Your
  profile, settings and API keys are saved to your Google account through
  Chrome sync, so they follow you to Chrome on your other computers. Page
  content goes to Google's AI only when you use an AI feature with your key.
  Remote mode, which sends your profile to a server, is off unless you set it
  up. Nothing is shared with another app unless you approve it, and you can
  take that back at any time. More on this in
  [docs/DATA-AND-PRIVACY.md](docs/DATA-AND-PRIVACY.md).
- See [docs/WHAT-TO-EXPECT.md](docs/WHAT-TO-EXPECT.md) for where it works
  well, where it fails and what could go wrong. For other assistive tools
  and guidance, see the
  [W3C Web Accessibility Initiative](https://www.w3.org/WAI/).

## Removing it, and erasing what it learned

1. Open `chrome://extensions`.
2. Find the extension and click **Remove**, then confirm.

This deletes everything it stored on your computer, including what it learned
about you. Chrome sync removes the copies of your profile and settings from your
Google account once the extension is gone from all your browsers. Your Gemini
API key keeps working at Google until you delete it in
[Google AI Studio](https://aistudio.google.com/apikey).

## Updating

The extension doesn't update itself. To update, download the ZIP again, replace
the old folder with the new one, and click the refresh arrow on the extension
at `chrome://extensions`.

## Getting help

- If you're stuck, check [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md). If
  your problem isn't there, [open an issue](../../issues) with what you clicked
  and what you saw.
- To tell us what worked and what didn't, see "Telling us what happened" in
  [docs/WHAT-TO-EXPECT.md](docs/WHAT-TO-EXPECT.md).
- If GitHub is hard to use, you can email us instead (see
  [SUPPORT.md](SUPPORT.md)).

---

## For developers

### What's in this repository

- `extension/`: the original extension, with its profiles, auditors, adapters
  and popup. Load this folder directly.
- `personalized-extension/`: the personalized extension, with onboarding, a
  memory of what helps you, the Adapter Builder and Skill Builder, voice mode
  and a browser harness. Load its `extension/` folder.
- `webapp/`: two prototype web apps (text control and voice control) and a
  copy of the browser harness.
- `docs/`: docs for the extensions ([index](docs/README.md)).
- [VENDORED.md](VENDORED.md): where the third-party code in this repository
  comes from.

The toolkit these are built on (the core library, the tools catalog and the
hosted service) is in the
[toolkit repository](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit).
New skills, adapters, auditors and profiles go there. Open work is tracked in
the toolkit's
[ROADMAP.md](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit/blob/main/ROADMAP.md)
and in this repository's issues.

### Where things moved

This repository was split out of the toolkit repository with its full history.
`toolkit/`, `tools/`, `server/`, `cli/`, `examples/` and the core design docs
are now in the toolkit repository. `projects/` and `webapp/` stayed here.

### Builds and tests

The committed bundles are what Chrome loads. They're built from two toolkit
packages, `@ai4a11y/toolkit` and `@ai4a11y/tools`, which are stored as
tarballs in `vendor/` and pinned to one toolkit commit in `vendor/PIN.json`. To
move to a newer toolkit, run `node scripts/update-vendor.mjs --commit <sha>`.
CI checks that the tarballs match the pinned commit and that the committed
bundles match a fresh build.

```bash
npm ci && (cd personalized-extension && npm ci)
npm run build    # both extensions, from a fresh clone, no sibling checkout
```

`npm test` runs the Librarian tests (86 checks, no install needed). The other
tests are in `personalized-extension/test/` (see
[CONTRIBUTING.md](CONTRIBUTING.md#testing)).

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). You can share feedback, improve the
extensions, or add skills and adapters in the toolkit repository.

If you build web pages, these extensions don't replace building them
accessibly. The
[W3C guide to planning accessibility](https://www.w3.org/WAI/planning-and-managing/)
is a good place to start.

### Security and license

Report security problems through [SECURITY.md](SECURITY.md), not in a public
issue. Licensed under Apache 2.0 ([LICENSE](LICENSE)).

---

<h2 align="center">AI for Accessibility Collective</h2>

<div align="center">
<p>
  <a href="https://www.stanford.edu/"><img src="docs/logos/stanford.png" alt="Stanford University logo, links to the Stanford website" height="38"></a>
  &nbsp;&nbsp;
  <a href="https://www.washington.edu/"><img src="docs/logos/uw.png" alt="University of Washington logo, links to the UW website" height="32"></a>
  &nbsp;&nbsp;
  <a href="https://www.media.mit.edu/"><img src="docs/logos/mit.png" alt="MIT Media Lab logo, links to the Media Lab website" height="35"></a>
  &nbsp;&nbsp;
  <a href="https://www.disabilityinnovation.com/"><img src="docs/logos/gdi.jpg" alt="UCL Global Disability Innovation Hub logo, links to the GDI Hub website" height="35"></a>
  &nbsp;&nbsp;
  <a href="https://www.google.org/"><img src="docs/logos/google.png" alt="Google.org logo, links to the Google.org website" height="28"></a>
</p>

</div>
