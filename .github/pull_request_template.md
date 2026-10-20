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
