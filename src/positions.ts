import type { Node } from 'prosemirror-model'

interface CharEntry {
  offset: number
  pos: number
}

interface CharMap {
  chars: CharEntry[]
  length: number
}

// Builds a linear character map of a document: text characters in order, atoms
// count as a single character, and every block boundary counts as a "\n"
// character (matching how Trix counts positions over its document text). Each
// entry maps a text offset to the ProseMirror position where the character
// starts.
export function buildCharMap(doc: Node): CharMap {
  const chars: CharEntry[] = []
  let offset = 0

  const collect = (node: Node, pos: number): void => {
    if (node.isText) {
      const text = node.text ?? ''
      for (let i = 0; i < text.length; i++) {
        chars.push({ offset: offset++, pos: pos + i })
      }
    } else if (node.isAtom) {
      chars.push({ offset: offset++, pos })
    } else {
      let childOffset = 1
      node.forEach((child) => {
        collect(child, pos + childOffset)
        childOffset += child.nodeSize
      })
    }
  }

  doc.forEach((block, blockOffset) => {
    if (offset > 0) {
      // Newline separator between blocks, anchored at the block boundary.
      chars.push({ offset: offset++, pos: blockOffset })
    }
    // `blockOffset` is the block's start position; its first child begins at
    // `blockOffset + 1`, which `collect` adds via its own child offset.
    collect(block, blockOffset)
  })

  return { chars, length: offset }
}

export function textOffsetToPos(doc: Node, offset: number): number {
  const map = buildCharMap(doc)
  if (offset <= 0) return 1
  if (offset >= map.length) return lastInlinePos(doc)
  const entry = map.chars[offset]
  if (entry) return entry.pos
  // Fall back to the nearest preceding entry.
  for (let i = offset - 1; i >= 0; i--) {
    if (map.chars[i]) return map.chars[i].pos
  }
  return 1
}

// The last document position that points into inline content (i.e. a valid
// TextSelection endpoint at the end of the document).
export function lastInlinePos(doc: Node): number {
  let pos = doc.content.size
  while (pos > 0) {
    if (doc.resolve(pos).parent.isTextblock) return pos
    pos--
  }
  return 1
}

export function posToTextOffset(doc: Node, pos: number): number {
  const map = buildCharMap(doc)
  for (let i = map.chars.length - 1; i >= 0; i--) {
    if (map.chars[i].pos <= pos) return map.chars[i].offset + (pos - map.chars[i].pos)
  }
  return 0
}
