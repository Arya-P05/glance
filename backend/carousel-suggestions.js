const SUGGESTION_COUNT = 5;
const SLIDE_COUNT = 5;
const signature = ids => [...ids].sort().join(',');
const imageKey = post => post.storage_path || post.id;

export function validateSuggestions(value, candidates, previous = [], blockedCovers = []) {
  const blocked = new Set(blockedCovers);
  const allowed = new Map(candidates.map(post => [post.id, post]));
  const used = new Set();
  const seen = new Set(previous.map(item => signature(item.post_ids)));
  if (!Array.isArray(value) || !value.length || value.length > SUGGESTION_COUNT) throw new Error('No valid carousel suggestions returned');
  return value.map(item => {
    if (!item || !Array.isArray(item.postIds) || item.postIds.length !== SLIDE_COUNT ||
        new Set(item.postIds).size !== SLIDE_COUNT || item.postIds.some(id => !allowed.has(id)) ||
        seen.has(signature(item.postIds))) throw new Error('Suggestion repeated an image or an already reviewed grouping; try again');
    if (blocked.has(item.postIds[0])) throw new Error('This image cannot be reused as a first slide');
    const keys = item.postIds.map(id => imageKey(allowed.get(id)));
    if (new Set(keys).size !== SLIDE_COUNT || keys.some(key => used.has(key))) throw new Error('Suggestion repeated an image; try again');
    if (typeof item.title !== 'string' || !item.title.trim() || typeof item.reason !== 'string' || !item.reason.trim()) throw new Error('Suggestion is missing its explanation');
    keys.forEach(key => used.add(key));
    seen.add(signature(item.postIds));
    return { title: item.title.slice(0, 120), reason: item.reason.slice(0, 600), post_ids: item.postIds };
  });
}

const captionWords = caption => new Set(String(caption || '').toLowerCase().match(/[a-z]{3,}/g) || []);
function captionOverlap(a, b) {
  if (!a.size || !b.size) return 0;
  return [...a].filter(word => b.has(word)).length / Math.max(a.size, b.size);
}

export function buildCarouselSuggestions(posts, carousels = [], previous = [], covers = [], random = Math.random) {
  const recent = carousels.filter(item => item.status === 'posted')
    .sort((a, b) => String(b.posted_at || '').localeCompare(String(a.posted_at || ''))).slice(0, 20);
  const excluded = new Set([...carousels.filter(item => ['ready', 'posting'].includes(item.status)), ...recent]
    .flatMap(item => (item.instagram_carousel_items || []).map(slide => slide.post_id)));
  const excludedPaths = new Set(posts.filter(post => excluded.has(post.id)).map(imageKey));
  const candidates = [...new Map(posts.filter(post => post.storage_path && !excluded.has(post.id) && !excludedPaths.has(imageKey(post)))
    .map(post => [imageKey(post), post])).values()];
  if (candidates.length < SUGGESTION_COUNT * SLIDE_COUNT) {
    throw new Error(`Need 25 eligible Library images for five suggestions; ${candidates.length} available outside the queue and recent posts.`);
  }
  const coverIds = new Set(covers.map(cover => cover.post_id));
  const coverPaths = new Set(covers.map(cover => cover.storage_path).filter(Boolean));
  const blockedCovers = candidates.filter(post => coverIds.has(post.id) || coverPaths.has(post.storage_path)).map(post => post.id);
  const blocked = new Set(blockedCovers);
  if (candidates.filter(post => !blocked.has(post.id)).length < SUGGESTION_COUNT) {
    throw new Error('Need five unused first slides for five suggestions. Add new Library images.');
  }
  const usage = new Map();
  for (const item of previous) for (const id of item.post_ids) usage.set(id, (usage.get(id) || 0) + 1);
  const words = new Map(candidates.map(post => [post.id, captionWords(post.caption)]));
  const seen = new Set(previous.map(item => signature(item.post_ids)));

  // Randomized retries avoid previously proposed sets, even with a small Library.
  // Reserve all five covers first so later groups cannot run out of eligible covers.
  for (let attempt = 0; attempt < 200; attempt++) {
    const ranked = candidates.map(post => ({ post, score: random() * 3 + 1 / (1 + (usage.get(post.id) || 0)) }))
      .sort((a, b) => b.score - a.score);
    const openings = ranked.filter(item => !blocked.has(item.post.id)).slice(0, SUGGESTION_COUNT);
    const reserved = new Set(openings.map(item => item.post.id));
    let remaining = ranked.filter(item => !reserved.has(item.post.id));
    const proposals = [];
    for (const { post: cover } of openings) {
      const selected = [cover];
      while (selected.length < SLIDE_COUNT) {
        remaining.sort((a, b) => {
          const variety = item => item.score - Math.max(...selected.map(post => captionOverlap(words.get(post.id), words.get(item.post.id))));
          return variety(b) - variety(a);
        });
        selected.push(remaining.shift().post);
      }
      const postIds = selected.map(post => post.id);
      if (seen.has(signature(postIds))) break;
      const title = String(cover.caption || '').split(/\n\s*\n|@/)[0].replace(/\s+/g, ' ').trim().slice(0, 80);
      proposals.push({
        title: title || `Library mix ${proposals.length + 1}`,
        reason: 'An unused cover with four eligible Library images, selected with a preference for less-used images and varied captions.',
        postIds,
      });
    }
    if (proposals.length === SUGGESTION_COUNT) return validateSuggestions(proposals, candidates, previous, blockedCovers);
  }
  throw new Error('Could not find five fresh groupings. Try again or add more Library images.');
}

async function readAll(query) {
  const rows = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await query().range(start, start + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

export async function suggestCarousels(db) {
  const [posts, carousels, history, covers] = await Promise.all([
    readAll(() => db.from('posts').select('id,storage_path,caption').eq('status', 'active').order('id')),
    readAll(() => db.from('instagram_carousels').select('id,status,posted_at,instagram_carousel_items(post_id)').in('status', ['ready', 'posting', 'posted']).order('id')),
    readAll(() => db.from('carousel_suggestions').select('post_ids,status').order('id')),
    readAll(() => db.from('instagram_cover_history').select('post_id,storage_path').order('storage_path')),
  ]);
  const suggestions = buildCarouselSuggestions(posts, carousels, history, covers);
  const saved = await db.from('carousel_suggestions').insert(suggestions);
  if (saved.error) throw saved.error;
  return suggestions;
}
