# wryte

A tag-first (markdown) rich text editor with a Trix-compatible API, built on [ProseMirror](https://prosemirror.net).

Markdown is the source of truth: `element.value` reads and writes markdown, and `wryte-*` DOM events bubble from the editor element so you can listen anywhere (even on `document`).

## Quick start

The `<wryte-editor>` custom element is the first-class way to use the editor. It is **auto-registered** when the library loads — no setup needed.

Like Trix, you can keep the initial content in a hidden `<input>`: the editor reads it on init and writes every change back to it.

```html
<input type="hidden" id="content" name="content" value="## Hello" />
<wryte-editor input="content"></wryte-editor>
```

```js
import "@jmas/wryte"

const element = document.querySelector("wryte-editor")
element.value // current markdown (also mirrored into the hidden input)
element.value = "## New content"

element.editor // the Editor instance
element.editor.insertString(" more")
```

The element is form-associated where `ElementInternals` is available (with a hidden-input fallback elsewhere): it submits its markdown value under its `name` attribute and supports `required`, `checkValidity()`, `setCustomValidity()`, `form`, `disabled`, and form reset/disable callbacks.

You can also build an editor programmatically on any element:

```js
import { Editor } from "@jmas/wryte"

const editor = new Editor(document.querySelector("#editor"), {
  placeholder: "Write something…",
  value: "## Hello\n\nTag-first **markdown** editing.",
})

editor.toMarkdown() // the current value
editor.loadMarkdown("## New content")
```

Supported attributes: `value`, `name`, `placeholder`, `input` (id of a hidden `<input>` that holds the initial markdown and receives updates — Trix-style), `toolbar` (id of an existing toolbar element), `autofocus`, `disabled`, `required`.

## Uploads

The editor never uploads anything itself. Drop or paste a file and a **`wryte-upload-request`** event bubbles up; your listener validates, uploads, and reports back. Listen on the editor element or globally on `document`.

```js
document.addEventListener("wryte-upload-request", (event) => {
  const { file, attachment, respond, progress } = event.detail

  if (file.size > 10 * 1024 * 1024) {
    respond({ error: { message: "File is too large" } })
    return
  }

  const upload = await myUploader(file, (fraction) => progress(fraction))
  respond({ url: upload.url, href: upload.href, width: upload.width, height: upload.height })
})
```

Lifecycle events: `wryte-file-accept` (cancelable, or call `event.detail.reject("reason")` → `wryte-file-reject`), `wryte-attachment-add`, `wryte-upload-request`, `wryte-upload-start`, `wryte-upload-progress`, `wryte-upload-success`, `wryte-upload-error`, `wryte-attachment-edit`, `wryte-attachment-remove`.

## Embeds

A URL typed on an empty line (then a space) or pasted as a lone line becomes a **link card**: a block `div.wryte-embed` (max-width 20rem, padded flex row) showing its host, which you fill with `title`, `image` and `host` via a bubbling **`wryte-embed-request`** event — the same pattern as uploads. The editor never fetches anything itself.

```js
document.addEventListener("wryte-embed-request", (event) => {
  const { url, respond } = event.detail
  const { title, image, host } = await myMetadataFetcher(url)
  respond({ title, image, host })
})
```

The card renders a 1:1, cover-cropped, rounded `image` on the left, the `title` next to it, and the `host` under the title; with neither image nor title the host is vertically centered. A response that leaves a field out keeps the current card value (or the URL's host). Each URL is requested once until it leaves the document (`wryte-embed-success` fires when a response lands).

Insert a card programmatically with `insertEmbed(url)`:

```js
element.editor.insertEmbed("https://prosemirror.net")
```

Scope notes: inside a blockquote or list the typed URL degrades to a plain `link` mark instead of a card, and pasting a URL over an existing selection keeps it as plain text. A lone-URL line in markdown parses as an embed and serializes back to the bare URL.

## External image sources

When content with images is inserted (pasted, loaded from HTML/markdown, or part of the initial document), the editor fires a bubbling **`wryte-image-request`** for every image that has no attachment id (i.e. an image that was not uploaded through this editor). The image stays visible as-is; your listener re-processes the source — for example downloading a remote image and re-uploading it to your own CDN — then reports back. The editor never fetches or re-hosts anything itself.

```js
document.addEventListener("wryte-image-request", (event) => {
  const { url, attrs, respond, progress } = event.detail

  if (new URL(url).host === "my-cdn.example.com") return // already on our CDN

  // progress(fraction) drives the same circular progress overlay (no percent)
  // shown on top of the image while it's being re-hosted.
  const cdnUrl = await rehost(url, (fraction) => progress(fraction))
  respond({ url: cdnUrl })
})
```

- `progress(fraction)` shows the existing circular progress overlay over the current image (it stays visible underneath) and hides it once you respond.
- `respond({ url, ... })` swaps the image `src` and fires **`wryte-image-success`**; missing fields keep the current attributes.
- `respond({ error: { message } })` resets the overlay, keeps the original image, and fires **`wryte-image-error`**.
- Each URL is requested once until it leaves the document; the resolved URL is marked requested too, so a successful swap never re-fires.
- Images uploaded through the editor (which have an attachment id) are skipped — they already go through `wryte-upload-request`.

## Events

All events bubble and are namespaced `wryte-*`: `wryte-before-initialize`, `wryte-initialize`, `wryte-change`, `wryte-render`, `wryte-sync`, `wryte-selection-change`, `wryte-attributes-change`, `wryte-actions-change`, `wryte-focus`, `wryte-blur`, `wryte-before-paste`, `wryte-paste`, `wryte-embed-request`, `wryte-embed-success`, `wryte-image-request`, `wryte-image-success`, `wryte-image-error`, `wryte-action-invoke`, `wryte-toolbar-dialog-show/hide`.

## Markdown scope

The editor parses and serializes a deliberately small, Trix-shaped markdown subset: headings `#`–`######`, bold `**`, italic `*`, strikethrough `~~`, spoiler `||text||` (hidden until hover), inline code `` ` ``, fenced code blocks ```` ```lang ````, bullet and numbered lists, blockquotes, links `[text](url)`, images `![alt](url)` (which round-trip as attachments), and a lone URL on a line (which becomes an embed card). Inline HTML is treated as literal text.

## Bubble menu & block insertion

Formatting follows the editor:

- **Text selected** → a formatting bubble appears above the selection (an emphasis button cycling bold/italic/strike, a code/spoiler button, links, headings, quotes, lists, undo/redo).
- **Caret in an empty line** → an inline **(+)** button appears on the right of the line; clicking it opens a block-insertion popup with **attachment, code, quote, heading and lists** only.
- **Right-click / long-press** → a context menu opens at the pointer (block popup in an empty line, formatting bubble otherwise).

Enabled by default (`contextMenu: false` to disable).

## Toolbar (optional)

The toolbar is **optional and detached**: the editor never creates or inserts one into the DOM. Supply an element (or the id of one) and it is wired as-is — you place and style it yourself. Buttons use `[data-wryte-attribute]` / `[data-wryte-action]`, and external actions named `x-*` dispatch `wryte-action-invoke`.

```js
const editor = new Editor(mount, { toolbar: document.querySelector("#my-toolbar") })
```

```html
<wryte-editor toolbar="my-toolbar"></wryte-editor>
```

The default toolbar markup is available as `defaultToolbarHTML()` from the `toolbar` module if you want a starting point.

## Custom element

`<wryte-editor>` (and `<wryte-toolbar>`) are registered automatically on import. `registerElement()` is still exported for explicit/renamed registration:

```js
import { registerElement } from "wryte"
registerElement("my-editor")

const editor = document.querySelector("my-editor").editor
```

## Development

```sh
npm install
npm run dev        # preview page at http://localhost:5173
npm test           # vitest (jsdom)
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + build dist/ (ESM, CJS, d.ts)
```

## License

MIT
