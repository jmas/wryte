import { Attachment, Editor, EventName } from '../src/index'

const themeToggle = document.querySelector<HTMLButtonElement>('#theme-toggle')
themeToggle?.addEventListener('click', () => {
  const root = document.documentElement
  if (root.dataset.theme === 'dark') {
    delete root.dataset.theme
    themeToggle.textContent = 'Dark'
  } else {
    root.dataset.theme = 'dark'
    themeToggle.textContent = 'Light'
  }
})

type EditorElement = HTMLElement & { editor: Editor | null; value: string }

function el(id: string): EditorElement {
  const node = document.getElementById(id)
  if (!node) throw new Error(`preview page is missing #${id}`)
  return node as EditorElement
}

function requireEditor(element: EditorElement, id: string): Editor {
  const editor = element.editor
  if (!editor) throw new Error(`wryte-editor did not initialize for #${id}`)
  return editor
}

const hero = el('editor')
const heroEditor = requireEditor(hero, 'editor')

const toolbarEl = el('toolbar-editor')
const toolbarEditor = requireEditor(toolbarEl, 'toolbar-editor')

const restricted = el('restricted')
const restrictedEditor = requireEditor(restricted, 'restricted')

const output = document.querySelector<HTMLPreElement>('#output')!
const toolbarOutput = document.querySelector<HTMLPreElement>('#toolbar-output')!
const restrictedOutput = document.querySelector<HTMLPreElement>('#restricted-output')!
const stateEl = document.querySelector<HTMLPreElement>('#state')!
const logEl = document.querySelector<HTMLPreElement>('#log')!

function render(): void {
  output.textContent = heroEditor.toMarkdown()
  toolbarOutput.textContent = toolbarEditor.toMarkdown()
  restrictedOutput.textContent = restrictedEditor.toMarkdown()
}

// --- Event log (hero editor) ---

const recentEvents: string[] = []
function record(entry: string): void {
  recentEvents.push(entry)
  logEl.textContent = recentEvents.slice(-12).join('\n')
}

function describe(name: string, detail: Record<string, unknown>): string {
  switch (name) {
    case 'wryte-selection-change':
      return `${name} → [${(detail.selection as [number, number] | undefined)?.join(', ') ?? '?'}]`
    case 'wryte-attributes-change': {
      const attrs = (detail.attributes ?? {}) as Record<string, unknown>
      const active = Object.keys(attrs).filter((key) => attrs[key])
      return `${name} → ${active.join(', ') || 'none'}`
    }
    case 'wryte-actions-change': {
      const actions = (detail.actions ?? {}) as { undo?: boolean; redo?: boolean }
      return `${name} → undo:${actions.undo ? '✓' : '✗'} redo:${actions.redo ? '✓' : '✗'}`
    }
    case 'wryte-attachment-add':
    case 'wryte-attachment-edit':
    case 'wryte-attachment-remove': {
      const attachment = detail.attachment as Attachment | undefined
      return `${name} → ${attachment?.getFilename() ?? attachment?.id ?? '?'}`
    }
    case 'wryte-file-accept':
    case 'wryte-file-reject': {
      const file = detail.file as File | undefined
      const reason = detail.reason != null ? ` (${String(detail.reason)})` : ''
      return `${name} → ${file?.name ?? '?'}${reason}`
    }
    case 'wryte-upload-start':
    case 'wryte-upload-request': {
      const file = detail.file as File | undefined
      return `${name} → ${file?.name ?? '?'}`
    }
    case 'wryte-upload-progress': {
      const file = detail.file as File | undefined
      const progress = detail.progress != null ? ` ${Math.round(Number(detail.progress) * 100)}%` : ''
      return `${name} → ${file?.name ?? '?'}${progress}`
    }
    case 'wryte-upload-success':
    case 'wryte-upload-error': {
      const attachment = detail.attachment as Attachment | undefined
      const error = detail.error ? ` (${((detail.error as { message?: string }).message ?? 'failed')})` : ''
      return `${name} → ${attachment?.getFilename() ?? '?'}${error}`
    }
    case 'wryte-embed-request':
    case 'wryte-embed-success':
    case 'wryte-image-request':
    case 'wryte-image-success':
    case 'wryte-image-error':
      return `${name} → ${String(detail.url ?? '?')}`
    case 'wryte-before-drop':
    case 'wryte-drop': {
      const files = detail.files as File[] | undefined
      return `${name} → ${files?.length ?? 0} file(s)`
    }
    case 'wryte-action-invoke':
      return `${name} → ${String(detail.action ?? '?')}`
    default:
      return name
  }
}

for (const name of Object.values(EventName)) {
  hero.addEventListener(name, (event) => {
    const custom = event as CustomEvent
    record(describe(custom.type, (custom.detail ?? {}) as Record<string, unknown>))
  })
}

// --- Live state (hero editor) ---

const ATTRIBUTE_NAMES = [
  'bold',
  'italic',
  'strike',
  'spoiler',
  'code',
  'href',
  'heading2',
  'heading3',
  'quote',
  'bullet',
  'number',
]

function renderState(): void {
  const [start, end] = heroEditor.getSelectedRange()
  const active = ATTRIBUTE_NAMES.filter((name) => heroEditor.attributeIsActive(name))
  const lines = [
    `selection:   [${start}, ${end}]`,
    `edited:      ${heroEditor.edited}`,
    `empty:       ${heroEditor.isEmpty}`,
    `undo/redo:   ${heroEditor.canUndo() ? 'can' : 'no'} / ${heroEditor.canRedo() ? 'can' : 'no'}`,
    `attachments: ${heroEditor.getAttachments().length}`,
    `active:      ${active.join(', ') || '—'}`,
  ]
  stateEl.textContent = lines.join('\n')
}

// --- API buttons (hero editor) ---

const api = document.querySelector<HTMLDivElement>('#api')!
const initialMarkdown = heroEditor.toMarkdown()

const actions: Array<[label: string, run: () => void]> = [
  ['Undo', () => heroEditor.undo()],
  ['Redo', () => heroEditor.redo()],
  ['Insert text', () => heroEditor.insertString('text from the API ')],
  ['Insert embed', () => heroEditor.insertEmbed('https://example.com')],
  ['Insert image', () => heroEditor.insertFile(new File([''], 'demo.png', { type: 'image/png' }))],
  ['Horizontal rule', () => heroEditor.insertHorizontalRule()],
  ['Toggle quote', () => heroEditor.toggleAttribute('quote')],
  ['Clear', () => heroEditor.clear()],
  ['Reload demo', () => heroEditor.loadMarkdown(initialMarkdown)],
]
for (const [label, run] of actions) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'btn'
  button.textContent = label
  button.addEventListener('click', run)
  api.appendChild(button)
}

// --- Fake backend: embed / upload / image handlers, shared by the editors
// that exercise those pipelines. The library never uploads anything itself. ---

function hostOf(url: string): string {
  try {
    return new URL(url).host || 'inline data'
  } catch {
    return url
  }
}

function bindFakeBackend(element: EditorElement): void {
  element.addEventListener('wryte-embed-request', (event) => {
    const detail = (event as CustomEvent).detail as {
      url: string
      respond: (result: { title: string; image: string }) => void
    }
    const host = hostOf(detail.url)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#fef3c7"/><text x="320" y="190" font-family="sans-serif" font-size="32" text-anchor="middle" fill="#b45309">${host}</text></svg>`
    detail.respond({
      title: detail.url,
      image: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    })
  })

  element.addEventListener('wryte-upload-request', (event) => {
    const detail = (event as CustomEvent).detail as {
      file: File
      respond: (result: { url: string; width?: number; height?: number }) => void
      progress: (fraction: number) => void
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#dbeafe"/><text x="320" y="190" font-family="sans-serif" font-size="36" text-anchor="middle" fill="#2563eb">${detail.file.name}</text></svg>`
    const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

    let progress = 0
    const timer = setInterval(() => {
      progress = Math.min(1, progress + 0.25)
      detail.progress(progress)
      if (progress >= 1) {
        clearInterval(timer)
        detail.respond({ url, width: 640, height: 360 })
      }
    }, 200)
  })

  element.addEventListener('wryte-image-request', (event) => {
    const detail = (event as CustomEvent).detail as {
      url: string
      respond: (result: { url: string; alt?: string }) => void
      progress: (fraction: number) => void
    }
    // Simulate downloading the external image and re-uploading it to our CDN:
    // the original stays visible, the progress ring shows while uploading,
    // then the src swaps to the new URL.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#fef3c7"/><text x="320" y="190" font-family="sans-serif" font-size="30" text-anchor="middle" fill="#b45309">cdn: ${hostOf(detail.url)}</text></svg>`
    const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

    detail.progress(0.05)
    let progress = 0.05
    const timer = setInterval(() => {
      progress = Math.min(1, progress + 0.2)
      detail.progress(progress)
      if (progress >= 1) {
        clearInterval(timer)
        detail.respond({ url, alt: 're-hosted on our CDN' })
      }
    }, 200)
  })
}

bindFakeBackend(hero)
bindFakeBackend(toolbarEl)

// --- Initial rendering ---

// Reveal the block-insertion (+) on a trailing empty line once focused.
const end = heroEditor.toMarkdown().length
heroEditor.setSelectedRange([end, end])
heroEditor.insertLineBreak()

for (const name of [
  'wryte-change',
  'wryte-selection-change',
  'wryte-attributes-change',
  'wryte-actions-change',
  'wryte-attachment-add',
  'wryte-attachment-edit',
  'wryte-attachment-remove',
] as const) {
  hero.addEventListener(name, renderState)
  toolbarEl.addEventListener(name, render)
}
render()
renderState()
