import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { AlignCenter, ArrowDownToLine, Clapperboard, Film, FolderOpen, Layers3, LogIn, LogOut, Music2, Pause, Play, Plus, Save, Sparkles, Type, Upload, Volume2, X } from 'lucide-react'
import { cloudConfigured, supabase } from './cloud'

type Animation = 'none' | 'fade' | 'slide' | 'pop'
type Media = { id: string; name: string; duration: number; url: string; blob?: Blob }
type StoredMedia = Pick<Media, 'id' | 'name' | 'duration'>
type Project = { id: string; name: string; clips: Media[]; music?: Media; musicVolume: number; title: string; titleColor: string; fontSize: number; position: 'Top' | 'Center' | 'Bottom'; animation: Animation; resolution: '1280x720' | '1920x1080' | '3840x2160'; fps: 24 | 30 | 60; bitrate: number }
type StoredProject = Omit<Project, 'clips' | 'music'> & { clips: StoredMedia[]; music?: StoredMedia; mediaPaths?: Record<string, string> }
const KEY = 'clipforge-project-v3'
const DB_NAME = 'clipforge-media-v1'
const STORE = 'assets'
const freshProject = (): Project => ({ id: crypto.randomUUID(), name: 'Untitled project', clips: [], musicVolume: 0.6, title: 'Your story starts here', titleColor: '#ffffff', fontSize: 42, position: 'Center', animation: 'fade', resolution: '1280x720', fps: 30, bitrate: 8 })
const clock = (seconds: number) => { const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
const openDb = () => new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE) }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
async function writeBlob(id: string, blob: Blob) { const db = await openDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(blob, id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }); db.close() }
async function readBlob(id: string) { const db = await openDb(); const blob = await new Promise<Blob | undefined>((resolve, reject) => { const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(id); request.onsuccess = () => resolve(request.result as Blob | undefined); request.onerror = () => reject(request.error) }); db.close(); return blob }
const toStored = (media: Media): StoredMedia => ({ id: media.id, name: media.name, duration: media.duration })

export default function App() {
  const [project, setProject] = useState<Project>(freshProject)
  const [activeId, setActiveId] = useState('')
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState('')
  const [dragging, setDragging] = useState(false)
  const [modal, setModal] = useState(false)
  const [email, setEmail] = useState('')
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [cloudProjects, setCloudProjects] = useState<{ id: string; name: string; updated_at: string }[]>([])
  const videoInput = useRef<HTMLInputElement>(null)
  const audioInput = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const active = project.clips.find((clip) => clip.id === activeId) ?? project.clips[0] ?? null
  const totalDuration = project.clips.reduce((sum, clip) => sum + clip.duration, 0)
  const activeStart = active ? project.clips.slice(0, project.clips.findIndex((clip) => clip.id === active.id)).reduce((sum, clip) => sum + clip.duration, 0) : 0

  const patch = <K extends keyof Project>(key: K, value: Project[K]) => setProject((current) => ({ ...current, [key]: value }))
  const saveLocal = (item: Project) => {
    try { localStorage.setItem(KEY, JSON.stringify({ ...item, clips: item.clips.map(toStored), music: item.music ? toStored(item.music) : undefined })) }
    catch { setNotice('Browser storage is full; remove large media or use cloud save.') }
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const raw = localStorage.getItem(KEY)
        if (!raw) return
        const saved = JSON.parse(raw) as StoredProject
        const hydrate = async (item: StoredMedia): Promise<Media | null> => { const blob = await readBlob(item.id); return blob ? { ...item, blob, url: URL.createObjectURL(blob) } : null }
        const clips = (await Promise.all((saved.clips ?? []).map(hydrate))).filter((item): item is Media => item !== null)
        const music = saved.music ? await hydrate(saved.music) : null
        if (!cancelled) { setProject({ ...freshProject(), ...saved, clips, music: music ?? undefined }); setActiveId(clips[0]?.id ?? '') }
      } catch { if (!cancelled) setNotice('Could not restore the local draft.') }
    }
    void load()
    return () => { cancelled = true }
  }, [])
  useEffect(() => { saveLocal(project) }, [project])
  useEffect(() => {
    const client = supabase
    if (!client) return
    void client.auth.getSession().then(({ data }) => setUser(data.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null))
    const { data } = client.auth.onAuthStateChange((_event, session) => setUser(session?.user ? { id: session.user.id, email: session.user.email } : null))
    return () => data.subscription.unsubscribe()
  }, [])

  const addVideos = async (files: FileList | File[]) => {
    const valid = Array.from(files).filter((file) => file.type.startsWith('video/'))
    if (!valid.length) { setNotice('Choose one or more valid video files.'); return }
    const added: Media[] = []
    for (const file of valid) { const id = crypto.randomUUID(); await writeBlob(id, file); added.push({ id, name: file.name, duration: 0, blob: file, url: URL.createObjectURL(file) }) }
    setProject((current) => ({ ...current, clips: [...current.clips, ...added] })); setActiveId((id) => id || added[0].id); setNotice(`${added.length} clip${added.length === 1 ? '' : 's'} added.`)
  }
  const addMusic = async (files: FileList | File[]) => {
    const file = Array.from(files).find((item) => item.type.startsWith('audio/'))
    if (!file) { setNotice('Choose a valid audio file.'); return }
    const id = crypto.randomUUID(); await writeBlob(id, file); setProject((current) => ({ ...current, music: { id, name: file.name, duration: 0, blob: file, url: URL.createObjectURL(file) } })); setNotice(`Added soundtrack: ${file.name}`)
  }
  const onFiles = (event: ChangeEvent<HTMLInputElement>, kind: 'video' | 'audio') => { const files = event.target.files; if (files) void (kind === 'video' ? addVideos(files) : addMusic(files)); event.target.value = '' }
  const removeClip = (id: string) => { const clips = project.clips.filter((clip) => clip.id !== id); if (activeId === id) { setActiveId(clips[0]?.id ?? ''); setTime(0) }; patch('clips', clips) }
  const moveClip = (id: string, delta: -1 | 1) => { const index = project.clips.findIndex((clip) => clip.id === id); const next = index + delta; if (index < 0 || next < 0 || next >= project.clips.length) return; const clips = [...project.clips]; [clips[index], clips[next]] = [clips[next], clips[index]]; patch('clips', clips) }
  const metadataLoaded = () => { const video = videoRef.current; if (!video || !active) return; patch('clips', project.clips.map((clip) => clip.id === active.id ? { ...clip, duration: video.duration || clip.duration } : clip)) }
  const onEnded = () => { const index = project.clips.findIndex((clip) => clip.id === active?.id); const next = project.clips[index + 1]; if (next) { setActiveId(next.id); setTime(0) } else setPlaying(false) }
  const togglePlay = async () => { const video = videoRef.current; if (!video) return; if (video.paused) { try { await video.play() } catch { setNotice('Could not start playback.') } } else video.pause() }

  const drawTitle = (ctx: CanvasRenderingContext2D, width: number, height: number, elapsed: number) => {
    if (!project.title.trim()) return
    const progress = Math.min(1, elapsed / 0.7)
    let alpha = 1; let offsetY = 0; let scale = 1
    if (project.animation === 'fade') alpha = progress
    if (project.animation === 'slide') { alpha = progress; offsetY = (1 - progress) * height * 0.08 }
    if (project.animation === 'pop') scale = 0.72 + progress * 0.28
    const y = project.position === 'Top' ? height * 0.16 : project.position === 'Bottom' ? height * 0.84 : height / 2
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(width / 2, y + offsetY); ctx.scale(scale, scale); ctx.fillStyle = project.titleColor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${project.fontSize * width / 800}px Arial`; ctx.shadowColor = '#000b'; ctx.shadowBlur = 12; ctx.fillText(project.title, 0, 0, width * 0.88); ctx.restore()
  }
  const exportVideo = async () => {
    if (!project.clips.length || !canvasRef.current) { setNotice('Add video clips before exporting.'); return }
    if (!('MediaRecorder' in window) || !canvasRef.current.captureStream) { setNotice('WebM export needs a recent Chrome, Edge, or Firefox browser.'); return }
    setExporting(true); setNotice('Preparing WebM render…')
    const canvas = canvasRef.current; const [width, height] = project.resolution.split('x').map(Number); canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d'); if (!ctx) { setExporting(false); setNotice('Canvas rendering is unavailable.'); return }
    const video = document.createElement('video'); video.playsInline = true; video.preload = 'auto'
    let audioContext: AudioContext | undefined; let soundtrack: HTMLAudioElement | undefined
    try {
      const stream = canvas.captureStream(project.fps)
      if (project.music?.url) { audioContext = new AudioContext(); const destination = audioContext.createMediaStreamDestination(); soundtrack = new Audio(project.music.url); soundtrack.loop = true; const source = audioContext.createMediaElementSource(soundtrack); const gain = audioContext.createGain(); gain.gain.value = project.musicVolume; source.connect(gain); gain.connect(destination); await audioContext.resume(); await soundtrack.play(); destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track)) }
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: project.bitrate * 1_000_000 }); const chunks: Blob[] = []; recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }; const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() }); recorder.start(250)
      for (const clip of project.clips) {
        video.src = clip.url; await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error(`Unable to open ${clip.name}`)) }); video.currentTime = 0; const startedAt = performance.now(); await video.play()
        await new Promise<void>((resolve) => { const paint = () => { if (video.ended || video.paused) { resolve(); return }; const scale = Math.min(width / video.videoWidth, height / video.videoHeight); const w = video.videoWidth * scale; const h = video.videoHeight * scale; ctx.fillStyle = '#08090b'; ctx.fillRect(0, 0, width, height); ctx.drawImage(video, (width - w) / 2, (height - h) / 2, w, h); drawTitle(ctx, width, height, (performance.now() - startedAt) / 1000); requestAnimationFrame(paint) }; video.onended = () => resolve(); requestAnimationFrame(paint) })
      }
      recorder.stop(); await stopped; soundtrack?.pause(); await audioContext?.close(); stream.getTracks().forEach((track) => track.stop()); const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${project.name.trim().replace(/[^\w-]+/g, '-') || 'clipforge'}-render.webm`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1200); setNotice('WebM render complete and downloaded.')
    } catch (error) { soundtrack?.pause(); await audioContext?.close().catch(() => undefined); setNotice(error instanceof Error ? `Export failed: ${error.message}` : 'Export failed.') }
    finally { video.pause(); setExporting(false); setPlaying(false) }
  }
  const signIn = async () => { const client = supabase; if (!client) { setNotice('Configure Supabase environment variables to enable cloud accounts.'); return }; if (!email.trim()) { setNotice('Enter your email address first.'); return }; const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } }); setNotice(error ? error.message : 'Check your email for a secure sign-in link.') }
  const signOut = async () => { await supabase?.auth.signOut(); setCloudProjects([]); setNotice('Signed out.') }
  const listCloudProjects = async () => { const client = supabase; if (!client || !user) return; const { data, error } = await client.from('projects').select('id,name,updated_at').order('updated_at', { ascending: false }); if (error) setNotice(error.message); else setCloudProjects(data ?? []) }
  const saveCloud = async () => {
    const client = supabase
    if (!client || !user) { setModal(true); setNotice('Sign in to save projects to the cloud.'); return }
    try {
      const paths: Record<string, string> = {}
      for (const media of [...project.clips, ...(project.music ? [project.music] : [])]) { const blob = media.blob ?? await readBlob(media.id); if (!blob) throw new Error(`Missing local media: ${media.name}`); const path = `${user.id}/${project.id}/${media.id}-${media.name.replace(/[^\w.-]/g, '_')}`; const { error } = await client.storage.from('project-media').upload(path, blob, { upsert: true, contentType: blob.type }); if (error) throw error; paths[media.id] = path }
      const state: StoredProject = { ...project, clips: project.clips.map(toStored), music: project.music ? toStored(project.music) : undefined, mediaPaths: paths }
      const { error } = await client.from('projects').upsert({ id: project.id, user_id: user.id, name: project.name, state, updated_at: new Date().toISOString() }); if (error) throw error
      setNotice('Project and media saved to cloud.'); await listCloudProjects()
    } catch (error) { setNotice(error instanceof Error ? `Cloud save failed: ${error.message}` : 'Cloud save failed.') }
  }
  const loadCloudProject = async (id: string) => {
    const client = supabase; if (!client || !user) return
    const { data, error } = await client.from('projects').select('state').eq('id', id).single(); if (error || !data) { setNotice(error?.message ?? 'Project not found.'); return }
    try {
      const stored = data.state as StoredProject
      const hydrate = async (item: StoredMedia): Promise<Media | null> => { const path = stored.mediaPaths?.[item.id]; if (!path) return null; const { data: blob, error: downloadError } = await client.storage.from('project-media').download(path); if (downloadError || !blob) return null; await writeBlob(item.id, blob); return { ...item, blob, url: URL.createObjectURL(blob) } }
      const clips = (await Promise.all(stored.clips.map(hydrate))).filter((item): item is Media => item !== null); const music = stored.music ? await hydrate(stored.music) : null; setProject({ ...stored, clips, music: music ?? undefined }); setActiveId(clips[0]?.id ?? ''); setModal(false); setNotice('Cloud project loaded.')
    } catch { setNotice('Could not restore cloud media. Check the Supabase storage policies.') }
  }

  return <div className="app-shell" onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }} onDrop={(event) => { event.preventDefault(); setDragging(false); void addVideos(event.dataTransfer.files) }}>
    <header className="topbar"><div className="brand"><span className="brand-mark"><Clapperboard size={19}/></span>clipforge<span className="brand-dot">.</span></div><div className="project-name"><span className="project-status"/><input aria-label="Project name" value={project.name} onChange={(event) => patch('name', event.target.value)}/></div><div className="top-actions"><button className="ghost-button" onClick={() => { saveLocal(project); setNotice('Draft saved in this browser.') }}><Save size={14}/>Save</button><button className="ghost-button" onClick={saveCloud}><Upload size={14}/>Cloud save</button><button className="export-button" onClick={exportVideo} disabled={!project.clips.length || exporting}><ArrowDownToLine size={15}/>{exporting ? 'Rendering…' : 'Export'}</button></div></header>
    <main className="workspace"><aside className="sidebar"><div className="sidebar-heading">CREATE</div><button className="nav-item active"><Film size={17}/>Editor</button><button className="nav-item" onClick={() => videoInput.current?.click()}><FolderOpen size={17}/>Media library <span className="count">{project.clips.length}</span></button><button className="nav-item" onClick={() => { setModal(true); void listCloudProjects() }}><Layers3 size={17}/>Projects</button><div className="sidebar-heading tools-heading">TOOLS</div><button className="nav-item selected-tool"><Type size={17}/>Text & titles</button><button className="nav-item" onClick={() => audioInput.current?.click()}><Music2 size={17}/>Background music</button><div className="sidebar-bottom"><div className="tip-card"><div className="tip-icon"><Sparkles size={16}/></div><strong>Creator studio</strong><p>Arrange clips, animate a title, add music, and render locally.</p><button onClick={() => videoInput.current?.click()}>Add video <span>→</span></button></div><div className="sidebar-footer"><span>Clipforge v0.3</span>{user ? <button className="icon-button" onClick={signOut} aria-label="Sign out"><LogOut size={16}/></button> : <button className="icon-button" onClick={() => setModal(true)} aria-label="Sign in"><LogIn size={16}/></button>}</div></div></aside>
    <section className="editor-area"><div className="editor-heading"><div><div className="eyebrow">VIDEO EDITOR</div><h1>Your next story <span>starts here.</span></h1><p>Sequence clips, add a soundtrack, and make it yours.</p></div><div className="editor-buttons"><button className="add-media" onClick={() => videoInput.current?.click()}><Plus size={15}/>Add video</button><button className="add-media" onClick={() => audioInput.current?.click()}><Music2 size={15}/>Add music</button></div></div>
    <div className={`drop-zone ${dragging ? 'dragging' : ''}`}><div className="drop-inner"><Upload size={18}/><span>Drop video clips anywhere to add them to the timeline</span></div></div>
    <div className="stage-row"><div className="preview-column"><div className="preview-frame">{active ? <video key={active.id} ref={videoRef} src={active.url} onLoadedMetadata={metadataLoaded} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={onEnded}/> : <div className="empty-preview"><div className="empty-icon"><Film size={24}/></div><strong>Your canvas is waiting</strong><span>Upload videos to build a timeline</span><button onClick={() => videoInput.current?.click()}><Upload size={15}/>Choose videos</button></div>}{active && project.title && <div key={`${active.id}-${project.animation}`} className={`title-preview title-${project.position.toLowerCase()} anim-${project.animation}`} style={{ color: project.titleColor, fontSize: `clamp(18px, ${project.fontSize / 8}vw, ${project.fontSize}px)` }}>{project.title}</div>}<div className="preview-badge"><span/>PREVIEW</div></div><div className="transport"><button className="play-button" onClick={togglePlay} disabled={!active}>{playing ? <Pause size={17} fill="currentColor"/> : <Play size={17} fill="currentColor"/>}</button><span className="timecode">{clock(activeStart + time)} <i>/</i> {clock(totalDuration)}</span><input aria-label="Seek active clip" type="range" min="0" max={active?.duration || 1} step="0.1" value={time} onChange={(event) => { const value = Number(event.target.value); setTime(value); if (videoRef.current) videoRef.current.currentTime = value }}/><button className="volume-button" aria-label="Volume"><Volume2 size={17}/></button></div></div>
    <aside className="inspector"><div className="inspector-title"><span><Type size={16}/>Title & export</span></div><label className="field-label" htmlFor="title-input">TITLE TEXT</label><textarea id="title-input" rows={2} value={project.title} onChange={(event) => patch('title', event.target.value)}/><div className="field-row"><label className="field-label">ANIMATION</label><select value={project.animation} onChange={(event) => patch('animation', event.target.value as Animation)}><option value="none">None</option><option value="fade">Fade in</option><option value="slide">Slide in</option><option value="pop">Pop in</option></select></div><div className="field-row"><label className="field-label">POSITION</label><select value={project.position} onChange={(event) => patch('position', event.target.value as Project['position'])}><option>Top</option><option>Center</option><option>Bottom</option></select></div><div className="field-row"><label className="field-label">SIZE · {project.fontSize}px</label></div><input className="size-slider" type="range" min="20" max="72" value={project.fontSize} onChange={(event) => patch('fontSize', Number(event.target.value))}/><div className="field-row color-row"><label className="field-label">COLOR</label><input type="color" value={project.titleColor} onChange={(event) => patch('titleColor', event.target.value)}/><span>{project.titleColor.toUpperCase()}</span></div><div className="inspector-divider"/><div className="field-label">EXPORT SETTINGS</div><div className="field-row"><label className="field-label">RESOLUTION</label><select value={project.resolution} onChange={(event) => patch('resolution', event.target.value as Project['resolution'])}><option value="1280x720">720p</option><option value="1920x1080">1080p</option><option value="3840x2160">4K</option></select></div><div className="field-row"><label className="field-label">FRAME RATE</label><select value={project.fps} onChange={(event) => patch('fps', Number(event.target.value) as Project['fps'])}><option value={24}>24 fps</option><option value={30}>30 fps</option><option value={60}>60 fps</option></select></div><div className="field-row"><label className="field-label">BITRATE · {project.bitrate} Mbps</label></div><input className="size-slider" type="range" min="2" max="20" value={project.bitrate} onChange={(event) => patch('bitrate', Number(event.target.value))}/></aside></div>
    <section className="timeline-panel"><div className="timeline-header"><div className="timeline-title"><Layers3 size={16}/><strong>Timeline</strong><span>{project.clips.length} clips · {clock(totalDuration)}</span></div><div className="timeline-actions"><button className="timeline-add" onClick={() => videoInput.current?.click()}><Plus size={14}/>Video</button><button className="timeline-add" onClick={() => audioInput.current?.click()}><Music2 size={14}/>Music</button></div></div><div className="timeline-ruler"><span>00:00</span><span>00:05</span><span>00:10</span><span>00:15</span><span>00:20</span><span>00:25</span></div><div className="timeline-track"><div className="track-label"><Film size={14}/><span>Video</span></div><div className="track-content">{project.clips.length ? project.clips.map((clip, index) => <div key={clip.id} className={`clip-card ${clip.id === active?.id ? 'active-clip' : ''}`} style={{ width: `${Math.max(145, Math.min((clip.duration || 8) * 20, 380))}px` }} onClick={() => { setActiveId(clip.id); setTime(0) }} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') { setActiveId(clip.id); setTime(0) } }}><div className="clip-thumbnails">{Array.from({ length: 5 }, (_, idx) => <div key={idx} className={`thumb thumb-${(index + idx) % 4}`}><Film size={12}/></div>)}</div><span className="clip-name">{clip.name}</span><div className="clip-controls"><button aria-label="Move clip left" onClick={(event) => { event.stopPropagation(); moveClip(clip.id, -1) }}>‹</button><button aria-label="Move clip right" onClick={(event) => { event.stopPropagation(); moveClip(clip.id, 1) }}>›</button><button aria-label={`Remove ${clip.name}`} onClick={(event) => { event.stopPropagation(); removeClip(clip.id) }}><X size={12}/></button></div></div>) : <button className="track-empty" onClick={() => videoInput.current?.click()}><Plus size={14}/>Add video clips</button>}</div></div><div className="timeline-track title-track"><div className="track-label"><Type size={14}/><span>Title</span></div><div className="track-content">{project.title ? <div className={`title-clip anim-${project.animation}`} style={{ width: `${Math.max(150, Math.min(totalDuration * 20 || 180, 400))}px` }}><AlignCenter size={13}/><span>{project.title} · {project.animation}</span></div> : <span className="track-hint">Add title text in the inspector</span>}</div></div><div className="timeline-track music-track"><div className="track-label"><Music2 size={14}/><span>Music</span></div><div className="track-content">{project.music ? <div className="music-clip" style={{ width: `${Math.max(160, Math.min(totalDuration * 20 || 180, 420))}px` }}><Music2 size={13}/><span>{project.music.name}</span><input aria-label="Music volume" type="range" min="0" max="1" step="0.05" value={project.musicVolume} onChange={(event) => patch('musicVolume', Number(event.target.value))}/><button aria-label="Remove music" onClick={() => patch('music', undefined)}><X size={12}/></button></div> : <button className="track-empty" onClick={() => audioInput.current?.click()}><Plus size={14}/>Add background music</button>}</div></div></section><div className="bottom-hint"><span><Sparkles size={14}/>Media remains local unless cloud save is used</span><span>WebM · 720p / 1080p / 4K</span></div></section></main>
    {modal && <div className="modal-backdrop" onClick={() => setModal(false)}><section className="cloud-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setModal(false)} aria-label="Close"><X size={17}/></button><h2>Cloud projects</h2>{!cloudConfigured ? <><p>Configure Supabase to enable accounts and cloud media backups. Local editing works without an account.</p><code>VITE_SUPABASE_URL<br/>VITE_SUPABASE_ANON_KEY</code></> : user ? <><p>Signed in as <strong>{user.email}</strong></p><button className="export-button" onClick={saveCloud}><Upload size={14}/>Save current project</button><button className="timeline-add" onClick={() => void listCloudProjects()}>Refresh projects</button><div className="cloud-list">{cloudProjects.map((item) => <button key={item.id} onClick={() => void loadCloudProject(item.id)}><span>{item.name}</span><small>{new Date(item.updated_at).toLocaleString()}</small></button>)}</div><button className="text-button" onClick={() => void signOut()}>Sign out</button></> : <><p>Sign in using an email magic link to access projects across devices.</p><input className="email-input" type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)}/><button className="export-button" onClick={() => void signIn()}><LogIn size={14}/>Send sign-in link</button></>}</section></div>}
    {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={14}/></button></div>}
    <input ref={videoInput} className="hidden-input" type="file" accept="video/*" multiple onChange={(event) => onFiles(event, 'video')}/><input ref={audioInput} className="hidden-input" type="file" accept="audio/*" onChange={(event) => onFiles(event, 'audio')}/><canvas ref={canvasRef} className="hidden-canvas"/>
  </div>
}
