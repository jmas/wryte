const originalWarn = console.warn
console.warn = (message: unknown, ...args: unknown[]): void => {
  if (
    typeof message === 'string' &&
    message.startsWith('TextSelection endpoint not pointing into a node with inline content')
  ) {
    return
  }
  originalWarn(message, ...args)
}
