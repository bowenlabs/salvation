---
"@thebes/cadmea": patch
---

CollectionEdit: fix an infinite autosave loop in the draft/versioned edit path.

The draft path never re-baselines the form after a save, so `dirty` stays true;
meanwhile `draftActions` is typically a reactive getter (its `saving`/`canPublish`
read the consumer's mutation signals — see `createCollectionEditPage`), so the
autosave effect re-runs on every save's `isPending` toggle. Together these
re-armed the debounce forever — a single edit turned into a save every
`autosaveMs` indefinitely, flooding the server and tripping any write
rate-limit (which then made Publish fail too).

The autosave effect now records the editable payload it last saved and skips
re-arming when the content is unchanged, so a given edit autosaves exactly once.
Manual "Save draft" is unaffected.
