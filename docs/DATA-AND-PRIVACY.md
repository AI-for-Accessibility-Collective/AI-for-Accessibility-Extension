# Your data: what is stored, what is sent, what is remembered

This page explains what these extensions know about you,
where that information lives, and when anything leaves your computer. The
precise technical statement is [SECURITY.md](../SECURITY.md); if anything
here seems to disagree with it, SECURITY.md wins and please tell us.

## The short version

- What the extension learns about your needs stays **on your computer**,
  unless you deliberately set up sharing.
- Page content is sent to an AI service **only** when you have set up an API
  key and an AI feature runs.
- Nothing is sold, and nothing goes to advertisers. There is no analytics or
  tracking code in these extensions.
- This is research software. Read [WHAT-TO-EXPECT.md](WHAT-TO-EXPECT.md)
  before relying on it.

## What the extension keeps, and where

**On this computer only.** The memory — the record of what has helped you,
site by site — stays in this browser on this device. That includes the log
of settings you changed, the preferences the system learned, suggestions
waiting for your yes or no, and adapters or skills built for you.

**Synced through your Google account.** Your ability profile (the summary of
your needs), your settings, and any API keys you entered are kept in
Chrome's sync storage. Chrome copies that to your other computers when you
sign into Chrome with the same Google account. If you would rather it stayed
on one machine, use a Chrome profile that isn't signed in, or don't enter
the key on shared machines.

## When something leaves your computer

Only in these cases:

1. **You use an AI feature.** The relevant part of the page — an image to
   describe, text to simplify, a video's address to caption — goes to the AI
   provider (Google's Gemini; Fal.ai only if you added that optional key)
   using your key. That provider's own privacy terms apply to what it
   receives. In particular, on Google's free tier what you send may be used
   to improve Google's AI services; on the paid tier Google states it is
   not. Their current terms control — see [COSTS.md](COSTS.md) and check
   Google's own pages.
2. **You turn on remote mode.** Remote mode is **off unless you configure
   it**. If you point the extension at a server (for example, one run by a
   research team you are working with), your profile and profile-related
   requests go to that server. Whoever runs that server can see them — ask
   who runs it and how long they keep data before you turn this on. If you
   received this extension from a research team with remote mode already set
   up, they should have told you this and asked your consent.
3. **You approve sharing with another app.** Another application can ask to
   read parts of your profile. Nothing is shared until you approve, you can
   revoke at any time, and revoking stops all further reads. Two things are
   never shared this way: text you wrote in your own words, and the system's
   internal confidence scores.

## Sensitive sites: banking, health, government

On banking, health, and government sites the extension defaults to
**remembering nothing**. It can still adapt the page for you (bigger text,
dark mode and so on), but it does not record observations about your needs
there unless you opt in for that site.

One limit: "adapting" still means the extension's code runs on the
page. The switch at the top of the popup turns adaptations off — but it is
all-or-nothing: there is no "never touch this one site" switch yet.
Individual settings can be scoped to a single site through the popup, and
if a true per-site off switch matters to you, telling us so is exactly the
kind of feedback this research needs.

## What is *not* collected

- No browsing history harvesting: the memory records deliberate acts (you
  changed a setting, applied a profile, saved an action, started a task),
  not the pages you visit or what you type.
- No third parties beyond the ones named above, ever.

## If you are taking part in a study

Research deployments may ask to collect more (for example, which adaptations
you accept or reject) to learn what people need. That only happens with its
own consent form that tells you exactly what is collected, who sees it, and
how to withdraw. If you are using a study build and did not get such a form,
stop and ask the team that gave it to you.

## Questions or worries

Open an issue on this repository, or report privately per
[SECURITY.md](../SECURITY.md) if it concerns a vulnerability.
