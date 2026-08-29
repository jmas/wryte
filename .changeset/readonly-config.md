---
'@jmas/wryte': minor
---

Add read-only configuration: the `readonly` EditorOptions flag (default `false`) and the `readonly` attribute / reflected property on `<wryte-editor>` make the view non-editable while keeping it focusable, selectable and copyable — and, unlike `disabled`, never suppress the form value. `editor.readonly` getter/setter exposes the flag at runtime (the getter is also true after `disable()`), the view's `editable` prop is now `options.editable !== false && options.readonly !== true`, and the context menu's formatting bubble / (+) affordances are hidden in read-only mode.
