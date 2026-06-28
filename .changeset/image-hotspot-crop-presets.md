---
"@thebes/cadmea": minor
---

feat: crop-editor ratio presets, circle + custom crop, and source dimensions

`ImageHotspotField` gains aspect-ratio presets, a circle crop shape, and custom
crop dimensions. Ratio crops use the image's source dimensions captured at
upload; older uploads without them fall back to the manual edge inputs.
