/**
 * Generic helper to autofocus and fully highlight/select the entire text of a page title.
 * Works seamlessly across both contentEditable elements (<h1 contentEditable ...>)
 * and standard HTML input/textarea elements.
 */
export function focusAndSelectTitle(element: HTMLElement | null, delayMs: number = 60): void {
  if (!element || typeof window === 'undefined') return;

  setTimeout(() => {
    if (!element) return;

    // For standard HTML input or textarea elements
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.focus({ preventScroll: true });
      element.select();
      return;
    }

    // For contentEditable elements (such as <h1 contentEditable ...>)
    element.focus({ preventScroll: true });
    try {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch (err) {
      console.error('Failed to select title contents', err);
    }
  }, delayMs);
}
