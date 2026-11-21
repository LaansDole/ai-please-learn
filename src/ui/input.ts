/** Held / just-pressed state for the key codes one env listens to. */
export class InputTracker {
  private codes: Set<string>;
  private held = new Set<string>();
  private pressed = new Set<string>();

  constructor(codes: string[]) { this.codes = new Set(codes); }

  /** True when the code belongs to the env, so the caller can preventDefault. */
  down(code: string): boolean {
    if (!this.codes.has(code)) return false;
    if (!this.held.has(code)) { this.held.add(code); this.pressed.add(code); }   // key repeat is not a new press
    return true;
  }

  up(code: string): boolean {
    if (!this.codes.has(code)) return false;
    this.held.delete(code);
    return true;
  }

  /** Returns the state and clears `pressed`. */
  take(): { held: string[]; pressed: string[] } {
    const out = { held: [...this.held], pressed: [...this.pressed] };
    this.pressed.clear();
    return out;
  }

  clear(): void { this.held.clear(); this.pressed.clear(); }
}
