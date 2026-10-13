import { useEffect, useRef, useState } from 'react';
import guide from './guide.json';
import { css } from './styles';

const SERVICE = 'http://127.0.0.1:3848';
const DRAFT_KEY = 'glance.summer-roll.brief.v1';
type Scene = typeof guide.scenes[number];
type Frame = { id: string; title: string; scene: string; quality: 'medium' | 'high'; status: 'generating' | 'ready' | 'failed'; createdAt: string; prompt: string; imageUrl?: string; error?: string; model: string };
type ServiceState = { ready: boolean; busy: boolean; model: string; frames: Frame[] };
const categories = ['All scenes', ...new Set(guide.scenes.map(scene => scene.category))];
const energies = ['All moments', 'High energy', 'Quiet', 'In between'];

export default function SummerRoll() {
  const [selected, setSelected] = useState(guide.scenes[0].id);
  const [title, setTitle] = useState(guide.scenes[0].title);
  const [scene, setScene] = useState(guide.scenes[0].scene);
  const [quality, setQuality] = useState<'medium' | 'high'>('medium');
  const [category, setCategory] = useState('All scenes');
  const [energy, setEnergy] = useState('All moments');
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [service, setService] = useState<ServiceState | null>(null);
  const [connection, setConnection] = useState('Connecting to the studio…');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeTab, setActiveTab] = useState<'compose' | 'roll' | 'guide'>('compose');
  const pending = useRef<{ key: string; id: string } | null>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (stored && typeof stored.title === 'string' && typeof stored.scene === 'string') {
        setTitle(stored.title); setScene(stored.scene);
        setSelected(typeof stored.selected === 'string' ? stored.selected : '');
        if (stored.quality === 'high' || stored.quality === 'medium') setQuality(stored.quality);
      }
    } catch { /* The default scene stays usable when local storage is unavailable. */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, scene, selected, quality })); } catch { /* Saving the brief is optional. */ }
  }, [loaded, title, scene, selected, quality]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    async function refresh() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(`${SERVICE}/state`, { signal: controller.signal });
        if (!response.ok) throw new Error('Service unavailable');
        const state: ServiceState = await response.json();
        if (!stopped) { setService(state); setConnection(''); }
      } catch {
        if (!stopped) setConnection('Studio offline. In backend, run npm run summer-roll. Your brief is kept here.');
      } finally {
        clearTimeout(timeout);
        if (!stopped) timer = setTimeout(refresh, 2500);
      }
    }
    void refresh();
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const filtered = guide.scenes.filter(item => (category === 'All scenes' || item.category === category) && (energy === 'All moments' || item.energy === energy) && `${item.title} ${item.scene}`.toLowerCase().includes(query.toLowerCase()));
  const current = guide.scenes.find(item => item.id === selected);
  const frames = service?.frames || [];
  const complete = frames.filter(frame => frame.status === 'ready').length;
  const prompt = `${guide.treatment}\n\nSCENE\n${scene.trim()}\n\nDeliver one square 1:1 photograph. No text or graphic elements.`;
  const valid = title.trim().length > 0 && title.length <= 100 && scene.trim().length >= 20 && scene.length <= 4000;

  function choose(item: Scene) {
    setSelected(item.id); setTitle(item.title); setScene(item.scene); setError('');
    setActiveTab('compose');
  }
  function surprise() {
    const pool = filtered.filter(item => item.id !== selected);
    if (pool.length) choose(pool[Math.floor(Math.random() * pool.length)]);
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setNotice('Prompt copied'); }
    catch { setError('Clipboard access is unavailable. Expand the full prompt to select and copy it.'); }
  }
  async function generate() {
    if (!valid || sending || service?.busy) return;
    setSending(true); setError('');
    const key = JSON.stringify({ title, scene, quality });
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    try {
      const response = await fetch(`${SERVICE}/frames`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, scene, quality, requestId: pending.current.id }), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok) { pending.current = null; throw new Error(result.error || 'Unable to start this frame.'); }
      pending.current = null;
      setService(previous => previous ? { ...previous, busy: result.status === 'generating', frames: [result, ...previous.frames.filter(frame => frame.id !== result.id)] } : previous);
      setActiveTab('roll');
      setNotice('Frame started. You can keep browsing scenes.');
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== 'Failed to fetch' ? cause.message : 'Could not reach the studio. Check the connection, then retry.');
    } finally { setSending(false); }
  }

  return <main className="summer-roll">
    <style>{css}</style>
    <header className="sr-header"><a href="/" className="sr-brand">glance <span>/ summer roll</span></a><span className="sr-status"><i className={!connection && service?.ready ? 'on' : ''} />{connection.startsWith('Connecting') ? 'Connecting…' : connection ? 'Studio offline' : service?.ready ? 'Studio ready' : 'API key needed'}</span></header>
    <div className="sr-intro"><div><div className="sr-eyebrow">A CAMERA ROLL WORTH KEEPING</div><h1>Some days stay with you.</h1><p>Small adventures. Ordinary afternoons. Photographs that feel like you were there.</p></div><div className="sr-stamp"><span>SUMMER ROLL</span><strong>01—30</strong><span>SCENES TO REMEMBER</span></div></div>
    <nav className="sr-tabs" aria-label="Summer roll sections">{(['compose', 'roll', 'guide'] as const).map(tab => <button key={tab} aria-current={activeTab === tab ? 'page' : undefined} onClick={() => setActiveTab(tab)}>{tab === 'compose' ? 'Make a photograph' : tab === 'roll' ? `Your roll${complete ? ` · ${complete}` : ''}` : 'The feeling'}<span /></button>)}<span className="sr-format">1:1 photographs · Always text-free</span></nav>
    <div className="sr-notice" role="status" aria-live="polite">{notice}</div>
    {connection && <div className="sr-banner">{connection}</div>}
    {!connection && service && !service.ready && <div className="sr-banner">Add OPENAI_API_KEY to backend/.env and restart the Summer roll service to generate. You can explore scenes and copy prompts now.</div>}
    {error && <div className="sr-error" role="alert">{error}</div>}

    {activeTab === 'compose' && <div className="sr-workspace">
      <aside className="sr-library"><div className="sr-section-heading"><h2>Find a moment</h2><span>30 scenes</span></div>
        <label className="sr-search"><span aria-hidden="true">⌕</span><input aria-label="Search scenes" placeholder="A place, a feeling, a moment…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="sr-filters"><select aria-label="Setting" value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select><select aria-label="Energy" value={energy} onChange={event => setEnergy(event.target.value)}>{energies.map(item => <option key={item}>{item}</option>)}</select></div>
        <div className="sr-scene-list">{filtered.map(item => <button key={item.id} className={`sr-scene ${selected === item.id ? 'selected' : ''}`} aria-pressed={selected === item.id} onClick={() => choose(item)}><span className={`sr-thumbnail ${item.category.toLowerCase().replace(' ', '-')}`} aria-hidden="true"><span /></span><span className="sr-scene-text"><strong>{item.title}</strong><small>{item.energy} <span>·</span> {item.light}</small></span><span className="sr-arrow" aria-hidden="true">↗</span></button>)}{!filtered.length && <p className="sr-empty-search">No scenes match. Try another setting or clear your search.</p>}</div>
        <button className="sr-shuffle" disabled={filtered.filter(item => item.id !== selected).length === 0} onClick={surprise}>↻ &nbsp; Find me another moment</button>
      </aside>
      <div className="sr-editor">
        <div className="sr-section-heading"><span className="sr-eyebrow">YOUR NEXT FRAME</span><button className="sr-text-button" onClick={() => { setSelected(''); setTitle(''); setScene(''); setError(''); }}>Write my own ↗</button></div>
        <label className="sr-title-label"><span className="sr-sr-only">Frame title</span><input className="sr-title-input" aria-label="Frame title" maxLength={100} value={title} placeholder="Give this moment a name" onChange={event => setTitle(event.target.value)} /></label>
        <div className="sr-tags"><span>{current?.category || 'Your own scene'}</span><span>{current?.energy || 'A moment to remember'}</span><span>Square · 1024 × 1024</span></div>
        <label className="sr-field-label" htmlFor="sr-scene-brief">What happens in this photograph?</label>
        <textarea id="sr-scene-brief" maxLength={4000} value={scene} onChange={event => setScene(event.target.value)} placeholder="Who is there? What are they doing? Where is their friend holding the camera? Describe the light and the little details." />
        <div className="sr-field-note"><span>Keep the moment specific. Let the style take care of the rest.</span><span>{scene.length}/4000</span></div>
        <div className="sr-treatment"><div className="sr-treatment-top"><span className="sr-eyebrow">THE SAME CAMERA, EVERY TIME</span><span aria-hidden="true">◉</span></div><h3>A memory, with all its imperfections.</h3><p>Fine grain. Sun-faded color. A friend behind the lens. Room for the landscape. Nothing posed, nothing written on top.</p><div className="sr-swatches" aria-label="Palette: faded blue, seafoam, muted teal, olive, warm haze, deep shadows">{['#a8c3cc','#b5c7b1','#6c9290','#7a8060','#dbbc94','#364543'].map(color => <i key={color} style={{ background: color }} />)}<span>Natural light, imperfectly remembered</span></div></div>
        <details className="sr-prompt"><summary>Read the full generation prompt <span>+</span></summary><p className="sr-prompt-text">{prompt}</p><button className="sr-text-button" onClick={() => copy(prompt)}>Copy full prompt ↗</button></details>
        <div className="sr-generate"><label>Image quality<select aria-label="Image quality" value={quality} onChange={event => setQuality(event.target.value as 'medium' | 'high')}><option value="medium">Standard</option><option value="high">High detail</option></select></label><button className="sr-primary" disabled={!valid || sending || !service?.ready || !!connection || service.busy} onClick={generate}>{sending ? 'Starting…' : service?.busy ? 'A frame is developing…' : 'Make this photograph'} <span aria-hidden="true">↗</span></button></div>
        <p className="sr-generation-note">One frame at a time. Generation can take a few minutes.</p>
      </div>
    </div>}

    {activeTab === 'roll' && <section className="sr-roll"><div className="sr-section-heading"><div><h2>Your summer, frame by frame.</h2><p>Make a few. Keep the ones that feel real.</p></div><button className="sr-secondary" onClick={() => setActiveTab('compose')}>Make another ↗</button></div>
      {!frames.length ? <div className="sr-empty"><div className="sr-empty-frame"><span>01</span><span>Your first memory<br />goes here.</span><span>SUMMER ROLL</span></div><h3>A roll waiting to happen.</h3><p>Start with a scene. Every finished photograph will be saved here.</p><button className="sr-primary" onClick={() => setActiveTab('compose')}>Find a moment ↗</button></div> : <div className="sr-contact-sheet">{frames.map((frame, index) => <article className="sr-photo" key={frame.id}><div className="sr-photo-image">{frame.status === 'ready' && frame.imageUrl ? <a href={`${SERVICE}${frame.imageUrl}`} target="_blank" rel="noreferrer" aria-label={`Open ${frame.title}`}><img src={`${SERVICE}${frame.imageUrl}`} alt={frame.scene} loading="lazy" /></a> : <div className={`sr-developing ${frame.status}`}><span aria-hidden="true">{frame.status === 'failed' ? '↺' : '◌'}</span><h3>{frame.status === 'failed' ? 'This frame didn’t develop.' : 'A moment in the making.'}</h3><p>{frame.status === 'failed' ? frame.error : 'Your photograph is developing. Feel free to explore another scene.'}</p></div>}</div><div className="sr-photo-caption"><span>{String(frames.length - index).padStart(2, '0')}</span><h3>{frame.title}</h3></div><div className="sr-photo-actions"><button onClick={() => { setSelected(''); setTitle(frame.title); setScene(frame.scene); setQuality(frame.quality); setError(''); setActiveTab('compose'); }}>Use brief</button>{frame.status === 'ready' && <a href={`${SERVICE}${frame.imageUrl}?download=1`}>Download PNG ↓</a>}</div><details className="sr-frame-details"><summary>Frame details</summary><p>{new Date(frame.createdAt).toLocaleString()} · {frame.model} · {frame.quality}</p><p>{frame.scene}</p><button onClick={() => copy(frame.prompt)}>Copy original prompt</button></details></article>)}</div>}
    </section>}

    {activeTab === 'guide' && <section className="sr-guide"><div className="sr-guide-intro"><span className="sr-eyebrow">THE FEELING, NOT THE FORMULA</span><h2>Different days.<br />The same summer.</h2><p>The consistency lives in the camera, color and atmosphere. Let the people, places and moments change.</p><a href={guide.source} target="_blank" rel="noreferrer">Read the original conversation ↗</a></div><div className="sr-principles">{guide.principles.map((principle, index) => <article key={principle.title}><span>0{index + 1}</span><div><h3>{principle.title}</h3><p>{principle.detail}</p></div></article>)}</div><div className="sr-rhythm"><span className="sr-eyebrow">GIVE YOUR ROLL A RHYTHM</span><div>{[['High energy','A jump, a splash, a run downhill.'],['Quiet','Bare feet over a dock. The last light in a valley.'],['In between','A snack stop. A ferry crossing. The ride home.']].map(([label, detail]) => <button key={label} onClick={() => { setEnergy(label); setCategory('All scenes'); setQuery(''); setActiveTab('compose'); }}><h3>{label} ↗</h3><p>{detail}</p></button>)}</div></div></section>}
    <footer className="sr-footer"><span>SUMMER ROLL / A GLANCE EXPERIMENT</span><span>Keep the feeling. Let the moment change.</span></footer>
  </main>;
}
