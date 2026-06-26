---
"@thebes/cadmea": minor
---

Split-pane live preview in the edit-page factory. `createCollectionEditPage`
gains an optional `preview` ({ url, allowedOrigin }) that renders a
`VisualEditingPane` beside the form (stacked on mobile, two-up on `lg`) and
streams the form's values into it as the client types. `draftActions.autosave`
is now forwarded too, so a draft-enabled collection can autosave while the
preview updates live.
