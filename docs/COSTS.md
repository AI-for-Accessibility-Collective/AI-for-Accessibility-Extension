# What it costs to use

Many features of these extensions are free and never leave your computer.
Some features use an AI service, and that part can cost money. This page
explains which is which, in plain terms, before you set anything up.

## Free, always

These work with no account, no key, and no cost, and nothing about the page
you are reading leaves your browser:

- Bigger text, more spacing, and the dyslexia-friendly font
- Dark mode and reduced brightness
- Reduced motion (stopping animations and autoplaying video)
- Focus mode and decluttering (hiding ads and side content)
- Reader mode, reading ruler, magnifier
- Bigger click targets, keyboard navigation helpers, skip links

If these cover your needs, you can stop reading here — you never need an API
key.

## Features that use an AI service

Some features need an AI model to look at the page and write something new:

- Descriptions of images that have none (alt text)
- Captions for video and audio
- Rewriting complicated text in plainer language
- Translation, summaries, and word definitions

These run on **your own key** for Google's Gemini service. That means: you
create a free Google AI Studio account, copy a string of letters called an
**API key**, and paste it into the extension once. The extension then uses
your key when — and only when — you use an AI feature.

We know this is a real barrier. It asks you to do setup work and to carry a
cost so that pages someone else built become usable. Making this easier (or funded) is an active
question for the project, not something we consider solved.

## Getting a key, step by step

1. Go to <https://aistudio.google.com/apikey> and sign in with a Google
   account (any Gmail account works).
2. Select **Create API key**. A long string of letters and numbers appears.
3. Copy it.
4. In Chrome, click the extension's icon in the toolbar, open **Settings**,
   and paste the key into the API key box. You only do this once.

Your key is stored in your browser's own storage and is sent only to Google
when an AI feature runs. See [DATA-AND-PRIVACY.md](DATA-AND-PRIVACY.md) for
exactly what travels where.

## What it is likely to cost

Google currently offers a **free tier** — a daily allowance of AI requests at
no charge. For many people, ordinary browsing with a
few AI features on stays inside the free tier. One trade-off to know: on
the free tier, what you send may be used by Google to improve Gemini.

Beyond the free tier, you pay Google directly for what you use, and Google
states that paid-tier data is not used to improve its services. Both of
these are Google's terms, not ours — check their current pages.
More detail on what leaves your computer:
[DATA-AND-PRIVACY.md](DATA-AND-PRIVACY.md).

Measured cost estimates for common uses are an open item — we would rather
publish honest numbers than fast ones.

## Keeping costs down

- Turn on only the AI features you use. Everything in the "free, always"
  list costs nothing regardless.
- The free tier resets daily; if you hit the limit, the AI features pause
  and everything else keeps working.
- You can remove your key at any time in Settings. The extension keeps
  working; the AI features simply switch off.
