import { describe, expect, it } from 'vitest'
import { Editor } from '../src/index'

function makeEditor(): Editor {
  const element = document.createElement('div')
  return new Editor(element, { toolbar: false, contextMenu: false })
}

function injectedStyles(): string {
  return [...document.querySelectorAll('style')]
    .map((s) => s.textContent ?? '')
    .join('\n')
}

describe('trailing break after an inline attachment', () => {
  it('collapses the empty line ProseMirror adds after a trailing inline attachment', () => {
    const editor = makeEditor()
    editor.loadHTML('<p><span data-wryte-attachment="z" data-wryte-url="https://e.com/a.pdf">a.pdf</span></p>')
    document.body.appendChild(editor.element)
    editor.focus()

    const p = editor.element.querySelector('p')!
    expect(p.querySelector('br.ProseMirror-trailingBreak')).not.toBeNull()
    expect(p.lastElementChild?.classList.contains('ProseMirror-trailingBreak')).toBe(true)

    const styles = injectedStyles()
    expect(styles).toContain('br.ProseMirror-trailingBreak:last-child')
    expect(styles).toContain('[data-wryte-attachment]:first-child')
    expect(styles).toContain('line-height:0')
  })

  it('keeps the block image rule injected', () => {
    makeEditor()
    const styles = injectedStyles()
    expect(styles).toContain('img[data-wryte-attachment]')
    expect(styles).toContain('img.ProseMirror-separator')
  })

  it('injects a visible horizontal-rule style with top and bottom spacing', () => {
    makeEditor()
    const styles = injectedStyles()
    expect(styles).toContain('.ProseMirror hr')
    expect(styles).toContain('margin:1.5rem 0')
    expect(styles).toContain('height:1px')
    expect(styles).toContain('background:#d4d4d8')
  })
})
