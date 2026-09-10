# What to expect: where this works, where it doesn't, and what could go wrong

This is research software — a set of working experiments called technology
probes, built to learn what AI-driven adaptation can and cannot do. This
page explains what that means for you.

## What it does well today

- Visual and layout changes on ordinary content pages: text size, spacing,
  contrast, dark mode, decluttering, reduced motion. These are reliable and
  reversible.
- Reading help on article-like pages: reader mode, reading ruler, focus
  mode.
- Filling in missing basics that page authors left out — image
  descriptions, button labels — when an AI key is set. Usually helpful,
  sometimes wrong.

## Where it struggles or fails

- **Complex web apps.** Pages that are really applications — spreadsheets,
  design tools, maps, some booking flows — often break the adaptations or
  ignore them.
- **AI-written content can be wrong.** A generated image description or
  simplified paragraph can be inaccurate, and if you cannot see the
  original you may have no way to notice. Treat AI descriptions as a
  helpful guess, not a fact, anywhere accuracy matters.
- **Pages change under it.** A site update can silently break an adaptation
  that worked yesterday.
- **It cannot yet tell you what it changed.** An adapted page can look and
  behave quite differently from the original, and today the extension does
  not give you a summary of what it altered. A verification layer that does
  this exists in the project's research code but is not active for users in
  the current build. Until it is, know that "this page looked different for
  me" is a real possibility in any conversation about a page.
- **The profiles are starting points, not descriptions of you.** Picking
  "low vision" or "dyslexia" turns on a bundle of settings that many people
  with that experience find useful. It is not a claim about what you need —
  change anything, and the extension should learn from your changes.
- **It can guess wrong about you.** The personalized extension suggests
  things based on patterns. AI models are most reliable about average
  needs and least reliable at the edges — which is exactly where
  accessibility work matters. Every suggestion waits for your yes; decline
  anything that doesn't fit, and it should not come back.

## What this is not

- **Not a replacement for your assistive technology.** Keep your screen
  reader, magnifier, switch access, or anything else you rely on. This
  layers on top; it does not substitute.
- **Not a guarantee of accessibility.** A page adapted by this tool has not
  become "accessible" in the legal or standards sense. If you are a site
  owner reading this: this tool existing does not shift your
  responsibility to build accessibly — see the note to developers in the
  [README](../README.md).
- **Not finished.** Features may change or disappear between updates while
  the research continues.

## Named risks, and what we do about them

The teams behind this asked themselves how this project could harm the
people it means to serve. The honest list, with the current state of each
mitigation:

| Risk | What we do about it | Status |
|---|---|---|
| You believe it adapts most pages well when it doesn't | This page; examples of failure as well as success; a test-bench for measuring adaptation quality | Test-bench: planned, see the toolkit [ROADMAP](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit/blob/main/ROADMAP.md) |
| An adapted page differs from the original without you knowing | The verification layer describes changes | Built as research code; **not active for users yet** |
| Developers treat this as a reason to skip building accessibly | The README says plainly it is not; links to guidance on building accessibly from the start | In place |
| The cost of access shifts onto you (key + compute) | Plain setup instructions ([COSTS.md](COSTS.md)); funded-compute options under discussion | Instructions in place; funding unresolved |
| The system infers a need you don't have | Everything is suggest-only with your consent; observation-based inference ships only after consented data collection | Consent gate in place |
| A study collects more than you agreed to | Research deployments require their own consent forms and disclosures | Policy stated in [DATA-AND-PRIVACY.md](DATA-AND-PRIVACY.md) |

## Telling us what happened

When an adaptation helps, fails, or does something strange, we genuinely
want to know — that is what a research probe is for. Open an issue on this
repository and say what page you were on, what you expected, and what
happened instead. If writing an issue on GitHub is a barrier itself, that's
useful for us to hear too — email the Collective contact listed in
[MAINTAINERS.md](../MAINTAINERS.md).
