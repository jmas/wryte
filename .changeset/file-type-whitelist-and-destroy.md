---
'@jmas/wryte': minor
---

Add a file-type whitelist and an explicit destroy method:

- `config.fileTypes` (`string[] | null`, default `null` = any file allowed) restricts which files may be added to the document. `insertFiles` fires `wryte-file-reject` for non-matching files before `wryte-file-accept`, the context-menu and toolbar file inputs set their `accept` attribute from it, and the `<wryte-editor filetypes="...">` attribute parses the same way. `editor.isFileTypeAllowed(file)` is the public check, with `fileTypeMatches(file, patterns)` / `acceptAttribute(patterns)` exported for host applications (HTML `<input accept>` semantics: exact MIME type, `type/*` wildcard, or `.ext` extension; case-insensitive).

- `editor.destroy()` tears down the editor: it unmounts the ProseMirror view, removes injected style sets, detaches listeners, closes the context menu, and releases the element for GC.
