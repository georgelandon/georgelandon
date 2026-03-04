# Topic images

Drop topic images in this folder and reference them from `topics.json`.

## Conventions (recommended)

- Use web-friendly formats: **.jpg**, **.png**, or **.svg**.
- Keep files reasonably small (e.g., < 500KB each).
- If you want multiple images per topic, add multiple entries under `"images"`.

Example (in `topics.json`):

```json
"images": [
  { "src": "assets/topics/sda-1.jpg", "alt": "GEO satellite concept" },
  { "src": "assets/topics/sda-2.png", "alt": "Light-curve simulation" }
]
```
