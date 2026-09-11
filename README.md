<div align="center">


# AI for Accessibility Extension

**Chrome extensions that adapt web pages, in real time, to what each person needs**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

</div>

This is an active research project from the AI for Accessibility Collective and 
is not a finished product. It is an early test version: things may break, change, 
or stop working without notice, and we have not yet formally tested how well
its page fixes work for any particular person. Please keep using the assistive 
technology you rely on; this does not replace a screen reader, magnifier, or 
anything else that works for you.

**What it does for you:** There are two versions, both of which you can install
in Chrome on your computer. In both versions, on websites you visit, it can make 
text bigger, turn the page dark, calm down moving content, describe pictures out loud 
or add captions, or simplify complicated writing. In the personalized version, it can learn 
over time what helps you and suggest more helpful changes.

## Who this is for

- **People who want a page adapted to their needs**, including people with
  disabilities anywhere in the world — start with [Install](#install)
  below, or the fuller [Getting Started guide](docs/GETTING-STARTED.md).
  No programming needed.
- **Developers contributing to the extensions** — extension code, the
  builders, and the web apps live here; see
  [For developers](#for-developers). New auditors, adapters, and profiles
  belong in the [toolkit repo](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit)'s
  `tools/`; skills in its `toolkit/skills/`.
- **Developers building on the toolkit, and other builders of agentic AI** —
  the [toolkit repository](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit)
  is your entry point.

## Install

You need a computer (not a phone or tablet) with Google Chrome. Installing
takes about ten minutes, is designed to be safe to try, and is fully reversible
(see [Removing it](#removing-it-and-erasing-what-it-learned)). The built
extension files are committed, so there is nothing to compile.

**The full walkthrough — with screenshots, written for people who have
never used GitHub — is [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md).
If any of the short version below is unfamiliar, start there.**

The short version: download this repository (green **Code** button →
**Download ZIP**) and unpack it; at `chrome://extensions`, turn on
**Developer mode**, select **Load unpacked**, and choose the unpacked
folder's `extension` subfolder. A new icon appears next to the address
bar — open a news article, click the icon, and choose a profile such as
**Low Vision** to see it work.

For the **personalized extension** (onboarding, memory, adapters built
for you), load `personalized-extension/extension/` the same way. The
adapters it builds for you run as Chrome "user scripts", which need one
more switch turned on —
[GETTING-STARTED.md](docs/GETTING-STARTED.md) shows where it is for your
version of Chrome.

Something not working? See
[Troubleshooting](docs/TROUBLESHOOTING.md).

### API key and cost

Many adaptations — bigger text, dark mode, spacing, focus, decluttering —
work immediately, free, with no account.

The AI features (describing images, captions, plain-language rewrites,
translation) need a **Gemini API key**: a password-like code from Google
that lets the extension use Google's AI on your behalf. Getting one
requires a Google account: get a key at
[Google AI Studio](https://aistudio.google.com/apikey) and paste it into
the extension popup once. Google currently gives everyone a free daily
allowance; staying inside it, the AI features cost nothing. Beyond it you
pay Google directly for what you use.

We have not yet published measured cost estimates. What is free, what can cost,
and how to keep costs down are written here: [docs/COSTS.md](docs/COSTS.md). 
We are also aware that asking disabled users to carry setup and compute costs to
make other people's pages usable is a burden in the wrong place, and
easing it is an open project concern.

## What to know before relying on it

- **Custom page fixes are powerful — treat them like software you
  install.** A custom adapter (a page fix built by you or shared by
  someone else) can read and change everything on the pages it runs on,
  including anything you type there. We check its code for obvious
  problems (it is linted), but it is **not sandboxed** — we cannot make a
  bad one harmless. Only add adapters from people you trust, with the same
  care you'd take installing an app. Details in [SECURITY.md](SECURITY.md).
- **Private sites stay private.** On banking, health, and government
  websites the extension can still adapt the page, but it does not take
  notes about you or your needs there unless you switch that on yourself.
- **Not a substitute.** This is not a replacement for screen readers,
  magnifiers, or any other assistive technology you rely on. For a broader
  (non-comprehensive) starting point on assistive tools and accessible-use
  guidance, see the [W3C Web Accessibility Initiative](https://www.w3.org/WAI/).
- **What we learn about you stays with you.** What the extension learns
  about your needs is stored on your own computer — by default, we do not
  collect it. Your profile, settings, and API keys are saved with your
  Google account (Chrome sync), so they follow you to Chrome on your other
  computers. Page content goes to Google's AI only when you use an AI
  feature with your own key. Sending your profile to a server ("remote
  mode") is off unless you set it up yourself, and a standard install from
  this repository cannot arrive with it preconfigured. Nothing is shared
  with any other app unless you approve it, and you can withdraw that
  approval at any time. See here for more details on data and privacy:
  [docs/DATA-AND-PRIVACY.md](docs/DATA-AND-PRIVACY.md); or here for more
  technical details: [SECURITY.md](SECURITY.md).
- **Know its limits.** Where it works well, where it fails, and what could
  go wrong: [docs/WHAT-TO-EXPECT.md](docs/WHAT-TO-EXPECT.md).

## Removing it, and erasing what it learned

Removing the extension is safe and complete:

1. Type `chrome://extensions` into the address bar and press Enter.
2. Find the extension's card and select **Remove**, then confirm.

Removing it deletes what it stored on this computer, including the memory
of what helps you. Profile and settings copies that Chrome synced to your
Google account are removed by Chrome's sync once the extension is gone
from your browsers. Your Gemini API key remains valid at Google — you can
delete the key itself at
[Google AI Studio](https://aistudio.google.com/apikey) if you no longer
want it to exist.

## Updating

A folder install does not update itself. To update, download the ZIP
again, delete the old folder, unpack the new one in its
place, and click the refresh arrow on the extension's card at
`chrome://extensions`. 

## Getting help, and telling us what happened

- Stuck installing or using the extension? Check out [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) first. If you don't see your problem described,
  [open an issue](../../issues) describing what you clicked and what you saw.
- We want to hear what worked and what didn't. See "Telling us what happened" in
  [docs/WHAT-TO-EXPECT.md](docs/WHAT-TO-EXPECT.md).
- If filing a GitHub issue is itself a barrier, we want to know that too.

---

## For developers

### What is in this repository

The repository holds the browser-facing half of the project: the original
Chrome extension, the personalized extension (onboarding, memory, the
Adapter Builder and Skill Builder), and two prototype web apps. The
toolkit core it is built on (the library, the tools catalog, the hosted
service) is canonical in the
[toolkit repository](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit).

- `extension/` — the original extension: profiles, auditors and adapters
  bundled in, popup UI. Loads as-is.
- `personalized-extension/` — the richer extension: onboarding, a memory
  that learns what helps you, the Adapter Builder and Skill Builder, voice
  mode, and an in-extension browser harness. Loads as-is from its
  `extension/` subfolder.
- `webapp/` — two full-stack prototypes (text control and voice control)
  plus a browser-harness copy. Candidates to return to their originating
  teams; kept here until that is decided.
- `docs/` — extension-facing docs ([index](docs/README.md)).
- [VENDORED.md](VENDORED.md) — provenance of third-party code committed in
  this tree.

Open work across the project is tracked in the toolkit repository's
[ROADMAP.md](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit/blob/main/ROADMAP.md);
extension-specific open items live in this repository's issues.

### Where things moved

This repository was split out of the toolkit repository with its **full
history preserved**, so every past version of every file is still here.
Paths that used to sit beside the extensions now live in the toolkit repo:
`toolkit/` (the core), `tools/` (auditors, adapters, profiles), `server/`
(the hosted service), `cli/`, `examples/`, and the core design docs.
`projects/` (team project code) and `webapp/` stayed here; the web apps are
candidates to return to their originating teams.

### Builds and tests

The committed bundles are the runnable state of both extensions, and this
repository rebuilds them itself. The toolkit code they are built from is
consumed as two packages, `@ai4a11y/toolkit` and `@ai4a11y/tools`, vendored
as packed tarballs under `vendor/` and pinned to one toolkit commit by
`vendor/PIN.json`. The source stays canonical in the toolkit repository; a
toolkit upgrade here is a deliberate pin bump
(`node scripts/update-vendor.mjs --commit <sha>`), and CI verifies both that
the tarballs match the pinned commit and that the committed bundles match a
fresh rebuild.

```bash
npm ci && (cd personalized-extension && npm ci)
npm run build    # both extensions, from a fresh clone, no sibling checkout
```

`npm test` runs the Librarian regression suite (86 checks, no install
needed), which is fully self-contained. `personalized-extension/test/`
holds the rest; `verifier-test.mjs` runs here too now that its imports
resolve from the vendored packages.

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version: one feature per
PR, say who benefits (which disability or profile), and involve people with
disabilities in design and evaluation. Building accessibly remains the page
author's responsibility; this project fixes barriers in pages, it does not
remove the reason to avoid creating them. Forks and spin-off versions are
part of how this project is meant to be used — see "Forks and spin-offs"
in [CONTRIBUTING.md](CONTRIBUTING.md).

### Security & License

Report vulnerabilities via [SECURITY.md](SECURITY.md), not public issues.
Licensed under Apache 2.0 ([LICENSE](LICENSE)).

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
