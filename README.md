<div align="center">

# wryte

**A tag-first (markdown) rich text editor with a Trix-compatible API, built on [ProseMirror](https://prosemirror.net).**

[![npm version](https://img.shields.io/npm/v/@jmas/wryte?logo=npm&color=cb0000)](https://www.npmjs.com/package/@jmas/wryte)
[![npm downloads](https://img.shields.io/npm/dm/@jmas/wryte)](https://www.npmjs.com/package/@jmas/wryte)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/jmas/wryte/pulls)

[Docs](#quick-start) · [Demo](https://jmas.github.io/wryte/) · [npm](https://www.npmjs.com/package/@jmas/wryte) · [GitHub](https://github.com/jmas/wryte) · [Issues](https://github.com/jmas/wryte/issues)

</div>

Markdown is the source of truth: `element.value` reads and writes markdown, and `wryte-*` DOM events bubble from the editor element so you can listen anywhere (even on `document`).

## Installation

```sh
npm install @jmas/wryte
```

Peer dependencies are installed automatically with npm 7+; for older npm (or a strict package manager) install them explicitly:

```sh
npm install @jmas/wryte prosemirror-model prosemirror-state prosemirror-view \
  prosemirror-commands prosemirror-keymap prosemirror-inputrules \
  prosemirror-history prosemirror-schema-basic prosemirror-schema-list \
  prosemirror-markdown prosemirror-gapcursor
```

Then import the library (the `<wryte-editor>` custom element registers itself on import):

```js
import "@jmas/wryte"
```

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

Supported attributes: `value`, `name`, `placeholder`, `input` (id of a hidden `<input>` that holds the initial markdown and receives updates — Trix-style), `toolbar` (id of an existing toolbar element), `autofocus`, `disabled`, `readonly`, `required`, `abilities` (comma-separated whitelist, see [Abilities](#abilities)), `filetypes` (comma-separated MIME types / wildcards / extensions, see [Restricting file types](#restricting-file-types)), `groups` (semicolon-separated groups of attribute names to merge into a single cycling button, see [Grouping buttons](#grouping-buttons)).

### Autofocus

Control whether the editor grabs focus on load — as an HTML attribute, an element property, or a constructor option.

The `autofocus` attribute focuses the editor as soon as it is created. Because an attribute's mere presence enables it, pass `autofocus="false"` to turn it off explicitly:

```html
<wryte-editor autofocus></wryte-editor>        <!-- focuses on load -->
<wryte-editor autofocus="false"></wryte-editor> <!-- does not -->
```

The same flag is available as a `boolean` property: `element.autofocus` reflects the attribute (`true` unless the attribute is absent or literally `"false"`). Setting it to `true` on a live editor focuses it immediately:

```js
element.autofocus // true if the attribute is present and not "false"
element.autofocus = true // focuses the editor
element.autofocus = false
```

When building an editor programmatically, pass `autofocus: true` to `EditorOptions` (default `false`):

```js
const editor = new Editor(mount, { autofocus: true })
```

### Read-only

A read-only editor still renders its content and stays focusable, selectable and copyable — the user just can't type or format anything. The formatting bubble, the (+) block-insertion popup and the image tools all disappear.

Use the `readonly` attribute on the element (or the `readonly` property, which reflects it):

```html
<wryte-editor readonly></wryte-editor>
```

```js
element.readonly = true  // stop editing (property reflects the attribute)
element.readonly = false // allow editing again
```

The same flag is a constructor option for programmatic editors:

```js
const editor = new Editor(mount, { readonly: true })
editor.readonly // true
editor.readonly = false
```

Read-only differs from `disabled` in two ways: the value is still submitted with the form, and the editor remains selectable. `disabled` also blocks selection and suppresses the form value entirely. The `readonly`/`disabled` attributes work independently of each other, and `Editor#disable()`/`enable()` remain available for a runtime toggle.

## Uploads

The editor never uploads anything itself. Drop or paste a file and a **`wryte-upload-request`** event bubbles up; your listener validates, uploads, and reports back. Listen on the editor element or globally on `document`.

```js
document.addEventListener("wryte-upload-request", async (event) => {
  const { file, attachment, respond, progress } = event.detail

  if (file.size > 10 * 1024 * 1024) {
    respond({ error: { message: "File is too large" } })
    return
  }

  const upload = await myUploader(file, (fraction) => progress(fraction))
  respond({ url: upload.url, href: upload.href, width: upload.width, height: upload.height })
})
```

Previewable images and video files become **block cards** standing on their own line; every other file type stays inline as a text link inside the paragraph.

A video is a block image whose src is the video file: include a `poster` image URL in the response and the card shows it as the preview with a small play button in the corner; clicking the play button plays the video inline (clicking the card itself selects it, like a normal image). Without a poster the card shows a gray placeholder with the play button.

```js
document.addEventListener("wryte-upload-request", async (event) => {
  const { file, respond } = event.detail
  const { url, poster } = await myVideoUploader(file) // poster = thumbnail of the first frame
  respond({ url, poster })
})
```

Dropping files works the same way: dragging files onto the editor fires **`wryte-before-drop`** (cancelable — prevent it to ignore the whole drop) and inserts them at the drop point, then **`wryte-drop`** fires once the files are in. Pasting an image copied from your file manager (Ctrl+V) inserts it through the same pipeline — **`wryte-before-paste`** gates the file paste, then **`wryte-paste`** fires after. Files dropped/pasted with no data (plain text, or images already inside the document) fall through to ProseMirror's default handling.

Lifecycle events: `wryte-file-accept` (cancelable, or call `event.detail.reject("reason")` → `wryte-file-reject`), `wryte-attachment-add`, `wryte-upload-request`, `wryte-upload-start`, `wryte-upload-progress`, `wryte-upload-success`, `wryte-upload-error`, `wryte-attachment-edit`, `wryte-attachment-remove`.

### Restricting file types

By default any file can be added (picked, dropped or pasted). Pass `fileTypes` to whitelist which MIME types may be inserted — patterns follow the `<input accept>` syntax: exact types (`image/png`), `/*` wildcards (`image/*`, `video/*`), or bare extensions (`.pdf`). Matching is case-insensitive.

```js
const editor = new Editor(mount, {
  fileTypes: ["image/*", "video/*", ".pdf"],
})
```

```html
<wryte-editor filetypes="image/*, video/*, .pdf"></wryte-editor>
```

The whitelist is enforced on every insertion path — the file picker (`accept` is set on it), drag-and-drop and paste. A disallowed file fires `wryte-file-reject` and is skipped. `fileTypes: []` disables all file insertion; `editor.isFileTypeAllowed(file)` lets you check a file programmatically. The matcher is exported as `fileTypeMatches(file, patterns)`.

## Embeds

A URL typed on an empty line (then a space) or pasted as a lone line becomes a **link card**: a block `div.wryte-embed` (max-width 20rem, padded flex row) showing its host, which you fill with `title`, `image` and `host` via a bubbling **`wryte-embed-request`** event — the same pattern as uploads. The editor never fetches anything itself.

```js
document.addEventListener("wryte-embed-request", async (event) => {
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
document.addEventListener("wryte-image-request", async (event) => {
  const { url, attrs, respond, progress } = event.detail

  if (new URL(url).host === "my-cdn.example.com") return // already on our CDN

  // progress(fraction) drives the same circular progress overlay (no percent)
  // shown on top of the image while it's being re-hosted.
  const cdnUrl = await rehost(url, (fraction) => progress(fraction))
  respond({ url: cdnUrl })
})
```

- `progress(fraction)` shows the existing circular progress overlay over the current image (it stays visible underneath) and hides it once you respond.
- `respond({ url, ... })` swaps the image `src` and fires **`wryte-image-success`**; missing fields keep the current attributes (including `poster`, so a video-card image loaded without its preview can be filled in).
- `respond({ error: { message } })` resets the overlay, keeps the original image, and fires **`wryte-image-error`**.
- Each URL is requested once until it leaves the document; the resolved URL is marked requested too, so a successful swap never re-fires.
- Images uploaded through the editor (which have an attachment id) are skipped — they already go through `wryte-upload-request`.

## Events

All events bubble and are namespaced `wryte-*`: `wryte-before-initialize`, `wryte-initialize`, `wryte-change`, `wryte-render`, `wryte-sync`, `wryte-selection-change`, `wryte-attributes-change`, `wryte-actions-change`, `wryte-focus`, `wryte-blur`, `wryte-before-paste`, `wryte-paste`, `wryte-before-drop`, `wryte-drop`, `wryte-embed-request`, `wryte-embed-success`, `wryte-image-request`, `wryte-image-success`, `wryte-image-error`, `wryte-action-invoke`, `wryte-toolbar-dialog-show/hide`.

## Markdown scope

The editor parses and serializes a deliberately small, Trix-shaped markdown subset: headings `#`–`######`, bold `**`, italic `*`, strikethrough `~~`, spoiler `||text||` (hidden until hover), inline code `` ` ``, fenced code blocks ```` ```lang ````, bullet and numbered lists, blockquotes, links `[text](url)`, images `![alt](url)` (which round-trip as attachments), and a lone URL on a line (which becomes an embed card). Inline HTML is treated as literal text.

A video card serializes like any other image — `![filename](video-url)` — so the video URL survives round-trips; a `![…](*.mp4|webm|…)` line reloads as a playable video card, and the poster preview is re-supplied through `wryte-image-request` when it isn't stored.

## Abilities (sandbox whitelist)

Trix exposes no built-in way to restrict which formatting an editor supports — it only customizes the toolbar markup. wryte adds an `abilities` option for exactly that: a sandbox-style **whitelist** of what the editor may do. By default (option omitted) every capability is enabled; pass an array and the editor is restricted to exactly the listed abilities.

```js
import { Editor } from "@jmas/wryte"

const editor = new Editor(mount, {
  abilities: ["bold", "italic", "link", "quote", "list"],
})
```

```html
<wryte-editor abilities="bold, italic, link, quote, list"></wryte-editor>
```

Available abilities:

| Ability | Enables |
| --- | --- |
| `bold`, `italic`, `strike` | Separate bold / italic / strikethrough buttons and `Mod-b` / `Mod-i` (or a single cycling emphasis button when grouped, see [Grouping buttons](#grouping-buttons)) |
| `spoiler` | The `||text||` mark (its own button; half of the code/spoiler button when grouped) |
| `code` | The inline `` `code` `` mark (its own button; half of the code/spoiler button when grouped) |
| `link` | The link button/form, `setLink`, `Mod-k` |
| `heading` | Headings 2–3: `# ` input rule, the heading button, the (+) popup entry |
| `quote` | Blockquotes: `> ` input rule, the quote button |
| `list` | Bullet and numbered lists: `- ` / `1. ` input rules, the list buttons |
| `codeBlock` | Block-level code: the (+) popup code button, whole-block `code` |
| `horizontalRule` | `insertHorizontalRule` and the (+) popup rule entry |
| `attach` | File insertion: `insertFiles`, dropping or pasting files |
| `embed` | URL → link-card: typing/pasting a lone URL on an empty line |
| `image` | Block images: previewable files become block images, the image-tools bubble (alt text / remove) |
| `video` | Block video cards: video files become block images showing a poster preview with a play button |

What a disabled ability means:

- **No UI**: the button that would trigger it is hidden from the bubble menu, the (+) block-insertion popup, and the image-tools bubble (a popup with no enabled buttons never opens, and the (+) button disappears entirely when no block ability is on).
- **No operation**: the editor methods that apply it become no-ops (`activateAttribute`, `toggleAttribute`, `setLink`, `setBlockCode`, `insertHorizontalRule`, `insertEmbed`, `insertFiles`, `setImageAlt`, …), and `canActivateAttribute` returns `false`. Keyboard shortcuts (`Mod-b`, `Mod-i`, `Mod-k`) and the markdown input rules (`# `, `> `, `- `, `1. `, URL-on-a-line) are gated the same way.
- **No side effects**: with `attach` off, dropped/pasted files are ignored; with `image` or `video` off, those files are inserted as inline file links instead of embedded block cards.
- **Existing content is preserved**: loaded markdown round-trips even when an ability is disabled — you just can't *create* that formatting. Stripping it back (`deactivateAttribute`, unlink, heading → paragraph) always works.
- `abilities: []` disables everything, leaving a plain-text editor. `editor.abilityEnabled(name)` tells you whether an ability is on, and the exported `Ability` type / `ALL_ABILITIES` list the possible values. `code` is selection-aware: partial selections use the inline mark, whole-block selections the code block.

## Bubble menu & block insertion

Formatting follows the editor:

- **Text selected** → a formatting bubble appears above the selection (separate **bold**, *italic*, ~~strike~~, spoiler and inline-code buttons, links, headings, quotes, lists, undo/redo).
- **Caret in an empty line** → an inline **(+)** button appears on the right of the line; clicking it opens a block-insertion popup with **attachment, code, quote, heading and lists** only.
- **Right-click** is not intercepted — the browser's native context menu always shows. The wryte popup appears only for a text selection or the (+) button.

Enabled by default (`contextMenu: false` to disable). When an `abilities` whitelist is set, only the buttons for enabled abilities are shown.

### Grouping buttons

The formatting bubble (and the default toolbar) shows **one button per attribute** by default — `bold`, `italic` and `strike` are separate toggles. To merge several attributes into a single **cycling** button (e.g. the old Trix-style emphasis button that steps none → bold → italic → strike → none), configure `attributeGroups`: a list of groups, each group a list of attribute names that share one button. The button cycles through its group in order, skipping members whose ability is disabled.

```js
const editor = new Editor(mount, {
  attributeGroups: [
    ["bold", "italic", "strike"], // one emphasis button
    ["spoiler", "code"],          // one code/spoiler button
  ],
})
```

```html
<wryte-editor groups="bold, italic, strike; spoiler, code"></wryte-editor>
```

The element `groups` attribute mirrors the config: semicolons separate groups, commas separate the members of a group. A grouped button is keyed on the first member of its group, and `toggleAttribute` of any member cycles the whole group (`toggleAttribute("bold")` with the group above steps bold → italic → strike → none). Attributes that are not in any group keep their own toggle button. The default toolbar markup is generated from the same config, so an empty `<wryte-toolbar>` reflects the grouping too.

## Toolbar (optional)

The toolbar is **optional and detached**: the editor never creates or inserts one into the DOM. Supply an element (or the id of one) and it is wired as-is — you place and style it yourself. Buttons use `[data-wryte-attribute]` / `[data-wryte-action]`, and external actions named `x-*` dispatch `wryte-action-invoke`.

```js
const editor = new Editor(mount, { toolbar: document.querySelector("#my-toolbar") })
```

```html
<wryte-editor toolbar="my-toolbar"></wryte-editor>
```

The default toolbar markup is available as `defaultToolbarHTML(attributeGroups?)` from the `toolbar` module if you want a starting point (it reflects your `attributeGroups` config when passed).

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
