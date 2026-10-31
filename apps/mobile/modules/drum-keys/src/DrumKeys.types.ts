/** One hardware key going down or up. */
export type KeyEvent = {
  /**
   * The key as the web's KeyboardEvent.key spells the ones the app uses: "s", "h", "1", " " (Space), "Escape", "Enter",
   * "ArrowLeft" / "ArrowRight" / "ArrowUp" / "ArrowDown". Pad keys and command keys are told apart in TypeScript.
   */
  key: string;
  /** Its USB HID usage (UIKeyboardHIDUsage). */
  code: number;
  down: boolean;
  shift: boolean;
  /** Option (the web's Alt). */
  alt: boolean;
  /** When it was pressed, HostClock ms (the same clock as DrumMidi's nowMs()). */
  timeMs: number;
  /** When native code sent the event, ms. */
  sentMs: number;
};

export type DebugInfo = { focused: boolean; keysSent: number; focusCalls: number; timebase: string };

export type DrumKeysEvents = {
  onKey: (e: KeyEvent) => void;
};
