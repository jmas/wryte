import { Plugin, PluginKey, type EditorState } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type { Node as PMNode } from 'prosemirror-model'

// Block nodes that get a visible highlight while selected: block images,
// horizontal rules and embed cards. Inline attachments are text-sized and are
// left alone.
function isHighlightable(node: PMNode): boolean {
  return node.type.name === 'image' || node.type.name === 'horizontal_rule' || node.type.name === 'embed'
}

// Positions of highlightable block nodes fully covered by the selection
// (a NodeSelection over the node itself, or a range that spans it).
function selectedNodePositions(state: EditorState): number[] {
  const { from, to } = state.selection
  const positions: number[] = []
  state.doc.descendants((node, pos) => {
    if (!isHighlightable(node)) return
    if (from <= pos && to >= pos + node.nodeSize) positions.push(pos)
    return false
  })
  return positions
}

const SELECTED_CLASS = 'wryte-selected'

const selectionHighlightKey = new PluginKey<number[]>('wryte-selection-highlight')

function syncHighlight(view: EditorView): void {
  const positions = new Set(selectionHighlightKey.getState(view.state) ?? [])
  // Drop the class from everything that had it, then re-apply to the nodes
  // under the current selection. Cheap: docs are small and only the leaf DOM
  // elements are touched.
  view.dom.querySelectorAll<HTMLElement>(`img.${SELECTED_CLASS}, hr.${SELECTED_CLASS}, .wryte-embed.${SELECTED_CLASS}, .wryte-image.${SELECTED_CLASS}`).forEach((element) => {
    element.classList.remove(SELECTED_CLASS)
  })
  for (const pos of positions) {
    const dom = view.nodeDOM(pos) as HTMLElement | null | undefined
    if (dom && dom.classList) dom.classList.add(SELECTED_CLASS)
  }
}

// Highlights block images and horizontal rules that the selection covers, so a
// clicked or range-selected image/hr is visibly marked instead of silently
// changing the underlying PM selection. Rendered as a border/outline via the
// `.wryte-selected` class (injected by the Editor).
export function selectionHighlightPlugin(): Plugin<number[]> {
  return new Plugin<number[]>({
    key: selectionHighlightKey,
    state: {
      init: () => [],
      apply(tr, prev, _oldState, newState) {
        if (!tr.docChanged && !tr.selectionSet) return prev
        return selectedNodePositions(newState)
      },
    },
    view: (view) => {
      const update = (): void => syncHighlight(view)
      // The plugin `update` is not invoked on the very first render (the view
      // factory runs instead), so sync once here too.
      update()
      return { update, destroy: () => {} }
    },
  })
}
