import { Editor } from '../src/index'

const element = document.querySelector<HTMLElement & { editor: Editor | null; value: string }>('#editor')
const output = document.querySelector<HTMLElement>('#output')
const log = document.querySelector<HTMLElement>('#log')
if (!element || !output || !log) throw new Error('preview page is missing #editor, #output or #log')

const outputEl = output
const logEl = log

const editor = element.editor
if (!editor) throw new Error('wryte-editor did not initialize')
const editorInstance: Editor = editor

function render(): void {
  outputEl.textContent = editorInstance.toMarkdown()
}

const recentEvents: string[] = []
function record(name: string): void {
  recentEvents.push(name)
  logEl.textContent = recentEvents.slice(-10).join('\n')
}

const events = [
  'wryte-change',
  'wryte-selection-change',
  'wryte-attributes-change',
  'wryte-focus',
  'wryte-blur',
  'wryte-attachment-add',
  'wryte-upload-request',
  'wryte-upload-progress',
  'wryte-upload-success',
  'wryte-upload-error',
  'wryte-embed-request',
  'wryte-embed-success',
  'wryte-image-request',
  'wryte-image-success',
  'wryte-image-error',
] as const
for (const name of events) {
  element.addEventListener(name, (event) => record((event as CustomEvent).type))
}
element.addEventListener('wryte-change', render)

// Reveal the block-insertion (+) on a trailing empty line.
const end = editorInstance.toMarkdown().length
editorInstance.setSelectedRange([end, end])
editorInstance.insertLineBreak()
editorInstance.focus()

render()

element.addEventListener('wryte-embed-request', (event) => {
  const detail = (event as CustomEvent).detail as {
    url: string
    respond: (result: { title: string; image: string }) => void
  }
  console.log('wryte-embed-request:', detail.url)
  const host = new URL(detail.url).host
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
  console.log('wryte-upload-request:', detail.file.name, detail.file.size, detail.file.type)

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
  console.log('wryte-image-request:', detail.url)

  // Simulate downloading the external image and re-uploading it to our CDN:
  // the original image stays visible, the progress circle shows while
  // uploading, then the src swaps to the new URL.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#fef3c7"/><text x="320" y="190" font-family="sans-serif" font-size="30" text-anchor="middle" fill="#b45309">cdn: ${new URL(detail.url).host}</text></svg>`
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
