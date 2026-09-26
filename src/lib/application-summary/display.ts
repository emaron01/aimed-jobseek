const NOT_STATED = /^not stated\.?$/i;

export function statedListItems(items: readonly string[]): string[] {
  return items
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !NOT_STATED.test(item));
}
