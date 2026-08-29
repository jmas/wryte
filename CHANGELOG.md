# @jmas/wryte

## 0.5.0

### Minor Changes

- 3574dac: Add read-only configuration: the `readonly` EditorOptions flag (default `false`) and the `readonly` attribute / reflected property on `<wryte-editor>` make the view non-editable while keeping it focusable, selectable and copyable — and, unlike `disabled`, never suppress the form value. `editor.readonly` getter/setter exposes the flag at runtime (the getter is also true after `disable()`), the view's `editable` prop is now `options.editable !== false && options.readonly !== true`, and the context menu's formatting bubble / (+) affordances are hidden in read-only mode.

## 0.4.0

### Minor Changes

- 77941aa: Add an `abilities` whitelist option (sandbox-style, like `<iframe sandbox>`): pass an array of `Ability` names and the editor is restricted to exactly those capabilities. `null` (default) enables everything, `[]` enables nothing (plain-text editing).
  
  Gated on the whitelist: the formatting bubble, the (+) block-insertion popup and the image-tools bubble (buttons for disabled abilities are hidden; a popup with no buttons never opens), the editor operations (`activateAttribute`/`toggleAttribute`, `setLink`, `setBlockCode`, `insertHorizontalRule`, `insertEmbed`, `insertFiles`/`insertAttachments`, `setImageAlt`), the `Mod-b`/`Mod-i`/`Mod-k` shortcuts, and the markdown input rules. Deactivation of loaded formatting still works. With `image` off, previewable files become inline file links instead of block images.
  
  New exports: `Ability` type and `ALL_ABILITIES`; `editor.abilityEnabled(ability)` is the public check. The `<wryte-editor>` element accepts a comma-separated `abilities` attribute (e.g. `abilities="bold, italic, link"`).

## 0.3.0

### Minor Changes

- 0643046: Add image alt-text editing (Trix-style): selecting a block image opens an image-tools bubble with **Edit alt text** and **Remove**. The alt form (input + Apply/Remove) mirrors the link form and stores the value on the image node via the new `Editor#setImageAlt(alt)`. Right-clicking an image NodeSelects it and opens the same bubble.

## 0.2.3

### Patch Changes

- Wrap block images in a `.wryte-image` node view that shows an SVG progress circle while the upload is pending; the circle is driven by `editor.updateAttachmentProgress` on `wryte-upload-request`'s `progress()`.
- Highlight a selected block image wrapper (`.wryte-image.wryte-selected`) alongside the existing image/hr/embed selection outline.

## 0.2.2

### Patch Changes

- Polish the embed card: the host strips a leading `www.` prefix, the title clamps to two lines, and the host truncates with an ellipsis.
- Replace the horizontal-rule icon with a simple line.

## 0.2.1

### Patch Changes

- Document the embed-card feature in the README: an `insertEmbed(url)` example and the scope notes (typed URL inside a blockquote/list degrades to a link mark, pasted URL over a selection stays plain text).

## 0.2.0

### Minor Changes

- Add embed cards: a URL typed or pasted into an empty line becomes a block card (`div.wryte-embed`, max-width 10rem) showing its host, filled via the new `wryte-embed-request`/`wryte-embed-success` events (`respond({ title, image, host })`). A lone-URL paragraph in markdown parses as an embed and serializes back to the bare URL.
