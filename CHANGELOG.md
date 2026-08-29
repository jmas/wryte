# @jmas/wryte

## 0.7.0

### Minor Changes

- 715ef1f: Add video uploads as block image cards with a poster-image preview, through the same upload pipeline as images:
  
  - **Video files become block image cards.** `insertFiles`/`insertAttachments` classifies `video/*` attachments as block `image` nodes (the same node type as pictures) whose `url` is the video file — same `wryte-file-accept` → `wryte-upload-request` → `respond`/`progress` lifecycle as images, including the circular progress overlay while the upload is pending. `respond({ url, ... })` may include a `poster` image URL: the card shows it as the preview face with a small play button in the corner (`ImageNodeView` renders a video card whenever the node's `contentType` is `video/*`), and clicking that button swaps in a real `<video controls autoplay>` that plays the file. Without a poster the card shows a gray placeholder with the play button. Clicking the card itself NodeSelects it like a normal image (selection, alt editing and remove all work as usual).
  
  - **Markdown stays an image**: a video serializes as `![filename](video-url)` and the video URL survives round-trips. The markdown/HTML parsers sniff `.mp4`/`.webm`/… srcs (`isVideoSrc`) into `contentType: 'video/*'`, so a `![x](clip.mp4)` line reloads as a playable video card instead of a broken `<img>`; the poster preview is re-supplied through the existing `wryte-image-request` flow (`respond` may now include `poster`).
  
  - **New `video` ability.** Mirrors `image`: with the ability off, video files degrade to inline `attachment` links. Added to the `Ability` type, `ALL_ABILITIES`, and the `<wryte-editor abilities>` attribute.
  
  The `poster` attr was added to the shared `AttachmentAttrs`/`Attachment` model (ignored by plain images and inline attachment nodes), so it flows through `respond()`, `attachment-edit`, `getAttachments`, HTML serialization (`data-wryte-poster` on the `<img>`), and snapshots like any other attribute.

## 0.6.0

### Minor Changes

- 5b257b0: Add a file-type whitelist and an explicit destroy method:
  
  - `config.fileTypes` (`string[] | null`, default `null` = any file allowed) restricts which files may be added to the document. `insertFiles` fires `wryte-file-reject` for non-matching files before `wryte-file-accept`, the context-menu and toolbar file inputs set their `accept` attribute from it, and the `<wryte-editor filetypes="...">` attribute parses the same way. `editor.isFileTypeAllowed(file)` is the public check, with `fileTypeMatches(file, patterns)` / `acceptAttribute(patterns)` exported for host applications (HTML `<input accept>` semantics: exact MIME type, `type/*` wildcard, or `.ext` extension; case-insensitive).
  
  - `editor.destroy()` tears down the editor: it unmounts the ProseMirror view, removes injected style sets, detaches listeners, closes the context menu, and releases the element for GC.

## 0.5.1

### Patch Changes

- e22a383: Silence the ProseMirror "TextSelection endpoint not pointing into a node with inline content" warning in tests (the editor intentionally sets selections at block-image boundaries).

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
