---
'@jmas/wryte': minor
---

Add video uploads as block image cards with a poster-image preview, through the same upload pipeline as images:

- **Video files become block image cards.** `insertFiles`/`insertAttachments` classifies `video/*` attachments as block `image` nodes (the same node type as pictures) whose `url` is the video file — same `wryte-file-accept` → `wryte-upload-request` → `respond`/`progress` lifecycle as images, including the circular progress overlay while the upload is pending. `respond({ url, ... })` may include a `poster` image URL: the card shows it as the preview face with a small play button in the corner (`ImageNodeView` renders a video card whenever the node's `contentType` is `video/*`), and clicking that button swaps in a real `<video controls autoplay>` that plays the file. Without a poster the card shows a gray placeholder with the play button. Clicking the card itself NodeSelects it like a normal image (selection, alt editing and remove all work as usual).

- **Markdown stays an image**: a video serializes as `![filename](video-url)` and the video URL survives round-trips. The markdown/HTML parsers sniff `.mp4`/`.webm`/… srcs (`isVideoSrc`) into `contentType: 'video/*'`, so a `![x](clip.mp4)` line reloads as a playable video card instead of a broken `<img>`; the poster preview is re-supplied through the existing `wryte-image-request` flow (`respond` may now include `poster`).

- **New `video` ability.** Mirrors `image`: with the ability off, video files degrade to inline `attachment` links. Added to the `Ability` type, `ALL_ABILITIES`, and the `<wryte-editor abilities>` attribute.

The `poster` attr was added to the shared `AttachmentAttrs`/`Attachment` model (ignored by plain images and inline attachment nodes), so it flows through `respond()`, `attachment-edit`, `getAttachments`, HTML serialization (`data-wryte-poster` on the `<img>`), and snapshots like any other attribute.
