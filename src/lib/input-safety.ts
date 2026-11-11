// Names typed into the demo are stored as entered and shown back to staff.
// React escapes them on screen, but they also reach exports and messages, so
// markup-like characters are refused at the point of entry instead.
export function containsMarkup(value: string): boolean {
  return /[<>]/.test(value);
}
