# Security policy

This policy covers the Chrome extensions in this repository. The toolkit
library and its hosted service have their own policy in the
[toolkit repository](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit/blob/main/SECURITY.md).

## Before you install a custom adapter

Custom adapters can read and change everything on the pages they run on,
including anything you type there. We lint their code, but we don't sandbox
them: they run as Chrome user scripts with full access to the page. Only
install adapters from people you trust.

Turning an adapter off undoes its changes to the page. It doesn't undo
anything a harmful adapter read or sent while it was running.

## Supported versions

There are no releases yet, so only the latest `main` branch is supported.

## Reporting a vulnerability

Please don't open a public issue.

1. Go to this repository's **Security** tab and click **Report a
   vulnerability**. If you can't, email the address in
   [MAINTAINERS.md](MAINTAINERS.md).

2. Include a description, steps to reproduce, the possible impact, and a fix
   if you have one.

We aim to reply within a week.

## API keys

- The original extension stores two optional keys in `chrome.storage.sync`: a
  Gemini key and a Fal.ai key. The personalized extension stores only a Gemini
  key. Keys in sync storage follow you to other Chrome browsers signed into the
  same Google account.
- The Gemini key is only sent to Google's API, over HTTPS. The Gemini API takes
  the key as a URL query parameter, and avoiding that would need a proxy
  server.
- If you set a Fal.ai key in the original extension, audio and video
  transcription tries Fal.ai first. The key goes in a request header to
  `https://fal.run`, along with the URL of the media. Without a Fal.ai key,
  transcription uses Gemini only.
- The extensions don't log or send API keys anywhere else.

## Code that runs on pages

- Content scripts run in an isolated world, separate from the page's own
  scripts.
- AI-generated text is inserted with `textContent`.
- Reader mode removes scripts, event handlers and links with executable
  schemes (e.g., `javascript:`) from an article before inserting it with
  `innerHTML`.
- The extensions' own code doesn't use `eval()` or `document.write()`. Custom
  adapters are the exception. The personalized extension runs their code as
  user scripts, or with `new Function()` on older Chrome versions.

## Where your data is

A plain-language version of this section is in
[docs/DATA-AND-PRIVACY.md](docs/DATA-AND-PRIVACY.md). If the two ever
disagree, this page is correct.

- Synced through your Google account (`chrome.storage.sync`, which copies it
  to every Chrome browser signed into the same account): your ability profile, suggestion
  suppressions, cross-app grants, extension settings, API keys, and the remote
  server URL and token if remote mode is set up.
- On this device only (`chrome.storage.local`): the memory (the observation
  log, memory shards, pending proposals, the site index, rendered views and the
  share-audit log) and saved skills.
- Sent off the device only when you use a feature that needs it:
  - page content to the Gemini API, when a key is set
  - the needs you type during onboarding or in the builders, which go into the
    prompts sent to the Gemini API
  - microphone audio to the Gemini Live API, while voice mode is on
  - media URLs to Fal.ai, when that key is set
  - Librarian calls, including your profile, to your own server, when remote
    mode is on
- By default, nothing is remembered about you on banking, health and
  government sites unless you turn it on for that site. The pages are still
  adapted.
- Remote mode is off by default. If you set a server URL and token in the
  options page, Librarian calls, including your profile, go to that server. If
  you build the extension from a local config file, it can already have a
  server set. A plain install from this repository can't, because that file is
  never committed. The server URL must use HTTPS, except for `localhost`,
  `127.0.0.1` and `::1`. A stored URL that doesn't meet this is refused, and
  the extension stays in local mode.
- Sharing with another app needs a grant that you approve and can revoke.
  Revoking deletes the grant and stops further reads, but it can't delete what
  the other app already received. Free text you wrote and confidence scores are
  never shared through a grant.
- No user data goes to third parties other than the Gemini API (for AI
  features), Fal.ai (if you set that key) and your own server (if you turn on
  remote mode).
- Both extensions ask for access to all sites (`<all_urls>`) to adapt any
  page. The memory records only things you do on purpose (changing a setting,
  applying a profile, saving an action or starting an agent task), not your
  browsing or typing.

## Dependencies

- We try to use as few dependencies as possible.
- Bundled third-party code is pinned to exact versions and listed in
  [VENDORED.md](VENDORED.md).

## For contributors

1. Don't use `innerHTML` with user or AI-generated content unless you sanitize
   it.
2. Don't use `eval()`, `Function()` or similar.
3. Use `textContent` to insert text.
4. Validate everything from outside sources, including AI responses and user
   input.
5. Keep dependencies up to date.
