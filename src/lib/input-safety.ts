/**
 * Detects markup-like characters in user-entered name fields.
 *
 * Names typed into the demo are stored as entered and shown back to staff.
 * React escapes them on screen, but they also reach exports and messages, so
 * markup-like characters are refused at the point of entry instead.
 *
 * @param value - The input string to inspect for markup characters.
 * @returns True if the string contains markup characters (`<` or `>`), false otherwise.
 */
export function containsMarkup(value: string): boolean {
  return /[<>]/.test(value);
}
