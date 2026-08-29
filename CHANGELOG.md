# @jmas/wryte

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
