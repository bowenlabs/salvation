---
"@thebes/cadmea": minor
---

Autosave for draft-enabled collections. `CollectionEdit` gains opt-in
`draftActions.autosave` (with `autosaveMs`, default 1500): while the form is
dirty it debounce-saves the draft via `onSaveDraft` and shows a "Saving…/Saved"
status in the action bar, so clients never lose work. The manual Save
draft/Publish/Preview buttons are unchanged.
