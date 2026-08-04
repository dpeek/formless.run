export function fieldKeyLabel(key: string): string {
  return key
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll(/[-_]/g, " ")
    .replace(/^\w/, (match) => match.toUpperCase());
}
