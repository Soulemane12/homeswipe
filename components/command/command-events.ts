export const OPEN_COMMAND_EVENT = "homeswipe:open-command";

/** Opens the command bar from anywhere, optionally pre-filled. */
export function openCommandBar(prefill?: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_EVENT, { detail: { prefill } }));
}
