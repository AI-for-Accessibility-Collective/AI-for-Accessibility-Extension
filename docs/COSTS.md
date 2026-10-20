# What it costs to use

Many features of the extensions are free and run only on your computer. Some
use an AI service, which can cost money.

## Free features

These work with no account or key, and nothing on the page leaves your
browser:

- Bigger text, more spacing and the dyslexia-friendly font
- Dark mode and lower brightness
- Reduced motion (stops animations and autoplaying video)
- Focus mode and decluttering (hides ads and side content)
- Reader mode, the reading ruler and the magnifier
- Bigger click targets, keyboard navigation and skip links

If these are all you need, you don't need an API key.

## Features that use AI

These need an AI model to read the page and write something new:

- Descriptions for images that have none (alt text)
- Captions for video and audio
- Rewriting complicated text in plainer language
- Translation, summaries and word definitions

They use your own key for Google's Gemini service. You create the key once and
paste it into the extension, and the extension uses it only when you use one of
these features.

This means you do the setup and pay for the AI yourself. We're still looking
for ways to make this easier or free.

## Getting a key

1. Go to <https://aistudio.google.com/apikey> and sign in with a Google account
   (any Gmail account works).
2. Click **Create API key** and copy the key.
3. In Chrome, click the extension's icon, open the **API Keys** section and
   paste the key into the **Gemini** box.

Your key is saved with your Chrome profile (Chrome sync copies it to Chrome on
your other computers), and it's only sent to Google when an AI feature runs.
[DATA-AND-PRIVACY.md](DATA-AND-PRIVACY.md) has the details of what is sent
where.

## What it might cost

Google has a free tier, which is a daily allowance of AI requests at no charge.
We expect ordinary browsing with a few AI features to stay inside it, but we
haven't measured this yet. On the free tier, Google may use what you send to
improve Gemini.

If you go over the free tier, you pay Google for what you use. Google says it
doesn't use paid-tier data to improve its products. These are Google's terms,
so please check their current pages.

## Keeping costs down

- Turn on only the AI features you use.
- The free tier resets every day. If you reach the limit, the AI features stop
  until the next day and everything else keeps working.
- You can remove your key at any time in the **API Keys** section.
