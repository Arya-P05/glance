/** Select only approved, available tracks; history is oldest to newest. */
export function selectCarouselMusic({config, availableIds, history = [], text = ''}) {
  const available = new Set(availableIds.map(String));
  const last = history.at(-1)?.track_id;
  const eligible = config.tracks.filter(t => available.has(t.track_id) && t.track_id !== last);
  if (!eligible.length) throw new Error('No approved non-repeating music available; do not publish silently.');
  const words = new Set(text.toLowerCase().match(/[a-z]+/g) || []);
  const matching = eligible.filter(t => t.keywords.some(word => words.has(word)));
  const pool = matching.length ? matching : eligible;
  const lastUsed = id => history.findLastIndex(entry => entry.track_id === id);
  return [...pool].sort((a,b) => lastUsed(a.track_id) - lastUsed(b.track_id))[0];
}
