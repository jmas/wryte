---
"@jmas/wryte": minor
---

Add an `abilities` whitelist option (sandbox-style, like `<iframe sandbox>`): pass an array of `Ability` names and the editor is restricted to exactly those capabilities. `null` (default) enables everything, `[]` enables nothing (plain-text editing).

Gated on the whitelist: the formatting bubble, the (+) block-insertion popup and the image-tools bubble (buttons for disabled abilities are hidden; a popup with no buttons never opens), the editor operations (`activateAttribute`/`toggleAttribute`, `setLink`, `setBlockCode`, `insertHorizontalRule`, `insertEmbed`, `insertFiles`/`insertAttachments`, `setImageAlt`), the `Mod-b`/`Mod-i`/`Mod-k` shortcuts, and the markdown input rules. Deactivation of loaded formatting still works. With `image` off, previewable files become inline file links instead of block images.

New exports: `Ability` type and `ALL_ABILITIES`; `editor.abilityEnabled(ability)` is the public check. The `<wryte-editor>` element accepts a comma-separated `abilities` attribute (e.g. `abilities="bold, italic, link"`).
