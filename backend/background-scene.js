export function normalizeBackgroundScene(value) {
  if (typeof value === 'string') {
    const description = value.trim();
    return description ? { name: 'Generated moment', description } : null;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return null;
}
