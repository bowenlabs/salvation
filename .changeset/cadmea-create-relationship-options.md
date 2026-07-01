---
"@thebes/cadmea": minor
---

cadmea: `createCollectionCreatePage` now forwards `relationshipOptions` (#98)

The edit factory (`createCollectionEditPage`) already forwarded `relationshipOptions` to `CollectionEdit`; the create factory did not, so a create form couldn't populate a `relationship` picker. This completes the #98 "template create-flow" consumer story: picking a `category` at create time now drives `admin.defaultFrom` (default the title from it) and `admin.appendOnCreate` (auto-insert a block bound to it) — the Portfolio page template in bowenlabs/themidwestartist.com#8. Additive, no behavior change for callers that don't pass it.
