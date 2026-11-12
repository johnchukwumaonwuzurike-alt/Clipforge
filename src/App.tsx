import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlignCenter, ArrowDownToLine, ChevronDown, Clapperboard, Film, FolderOpen,
  Layers3, LogIn, LogOut, Music2, Pause, Play, Plus, Save, Sparkles,
  Type, Upload, Volume2, X,
} from 'lucide-react'
import { cloud, cloudConfigured, CloudProject } from './cloud'

type Clip = { id: string; name: string; url: string; duration: number; blob?: Blob }
type Animation = 'none' | 'fade' | 'slide' | 'pop'
type Project = { id: string; name: string; clips: Clip[]; title: string; titleColor: string; fontSize: number; position: string; animation: Animation; music?: Clip; musicVolume: number; resolution: string; fps: number; bitrate: number }
const KEY = 'clipforge-project-v2'
const DB = 'clipforge-media'
const STORE = 'assets'
const emptyProject = (): Project => ({ id: crypto.randomUUID(), name: 'Untitled project', clips: [], title: 'Your story starts here', titleColor: '#ffffff', fontSize: 42, position: 'Center', animation: 'fade', musicVolume: 0.6, resolution: '1280x720', fps: 30, bitrate: 8 })
const fmt = (n: number) => `${String(Math.floor(Math.max(0, n) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, n) % 60)).padStart(2, '0')}`
const dbRequest = (): Promise<IDBDatabase> => new Promise((resolve, reject) => { const req = indexedDB.open(DB, 1); req.onupgradeneeded = () => req.result.createObjectStore(STORE); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
async function putAsset(id: string, blob: Blob) { const db = await dbRequest(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(blob, id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }); db.close() }
async function getAsset(id: string): Promise<Blob | undefined> { const db = await dbRequest(); const value = await new Promise<Blob | undefined>((resolve, reject) => { const req = db.transaction(STORE).objectStore(STORE).get(id); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) }); db.close(); return value }

export default function App() {
  const [project, setProject] = useState<Project>(emptyProject)
  const [activeId, setActiveId] = useState('')
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [notice, setNotice] = useState('')
  const [isDragging, setDragging] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [email, setEmail] = useState('')
  const [cloudProjects, setCloudProjects] = useState<CloudProject[]>([])
  const [showCloud, setShowCloud] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const musicInput = useRef<HTMLInputElement>(null)
  const active = project.clips.find((clip) => clip.id === activeId) ?? project.clips[0]
  const totalDuration = project.clips.reduce((sum, clip) => sum + clip.duration, 0)

  const patch = <K extends keyof Project>(key: K, value: Project[K]) => setProject((p) => ({ ...p, [key]: value }))
  const addMedia = useCallback(async (files: FileList | File[], kind: 'video' | 'audio') => {
    const accepted = Array.from(files).filter((file) => kind === 'video' ? file.type.startsWith('video/') : file.type.startsWith('audio/'))
    if (!accepted.length) { setNotice(`Choose a valid ${kind} file.`); return }
    const additions: Clip[] = []
    for (const file of accepted) {
      const id = crypto.randomUUID()
      await putAsset(id, file)
      additions.push({ id, name: file.name, url: URL.createObjectURL(file), duration: 0, blob: file })
    }
    if (kind === 'audio') { patch('music', additions[0]); setNotice(`Music track “${additions[0].name}” added.`) }
    else { setProject((p) => ({ ...p, clips: [...p.clips, ...additions] })); setActiveId((id) => id || additions[0].id); setNotice(`${additions.length} video clip${additions.length === 1 ? '' : 's'} added.`) }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const saved = localStorage.getItem(KEY)
        if (!saved) return
        const parsed = JSON.parse(saved) as Omit<Project, 'clips' | 'music'> & { clips: Omit<Clip, 'url' | 'blob'>[]; music?: Omit<Clip, 'url' | 'blob'> }
        const hydrate = async (item: Omit<Clip, 'url' | 'blob'>) => { const blob = await getAsset(item.id); return blob ? { ...item, blob, url: URL.createObjectURL(blob) } : null }
        const clips = (await Promise.all(parsed.clips.map(hydrate))).filter((c): c is Clip => Boolean(c))
        const music = parsed.music ? await hydrate(parsed.music) : undefined
        if (!cancelled) { setProject({ ...parsed, clips, music: music ?? undefined }); setActiveId(clips[0]?.id ?? '') }
      } catch { setNotice('Could not restore the local draft. Start a new project or import your media again.') }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const safe: Record<string, unknown> = { ...project, clips: project.clips.map(({ url: _url, blob: _blob, ...clip }) => clip), music: project.music ? (({ url: _url, blob: _blob, ...music }) => music)(project.music) : undefined }
    try { localStorage.setItem(KEY, JSON.stringify(safe)) } catch { setNotice('Browser storage is full. Remove large clips or save your project to the cloud.') }
  }, [project])

  useEffect(() => {
    if (!cloud) return
    cloud.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: listener } = cloud.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => () => { project.clips.forEach((clip) => URL.revokeObjectURL(clip.url)); if (project.music) URL.revokeObjectURL(project.music.url) }, [project.clips, project.music])

  const removeClip = (id: string) => { const item = project.clips.find((clip) => clip.id === id); if (item) URL.revokeObjectURL(item.url); const clips = project.clips.filter((clip) => clip.id !== id); patch('clips', clips); if (activeId === id) setActiveId(clips[0]?.id ?? '') }
  const moveClip = (id: string, direction: -1 | 1) => { const index = project.clips.findIndex((clip) => clip.id === id); const target = index + direction; if (target < 0 || target >= project.clips.length) return; const clips = [...project.clips]; [clips[index], clips[target]] = [clips[target], clips[index]]; patch('clips', clips) }
  const clipStart = (id: string) => project.clips.slice(0, project.clips.findIndex((clip) => clip.id === id)).reduce((sum, clip) => sum + clip.duration, 0)
  const onMetadata = () => { const el = videoRef.current; if (!el || !active) return; patch('clips', project.clips.map((clip) => clip.id === active.id ? { ...clip, duration: el.duration || clip.duration } : clip)) }

  const signIn = async () => { if (!cloud) { setNotice('Cloud features need Supabase setup. See the README for configuration.'); return } if (!email.trim()) { setNotice('Enter your email to receive a secure sign-in link.'); return } const { error } = await cloud.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } }); setNotice(error ? error.message : 'Check your email for a sign-in link.') }
  const signOut = async () => { await cloud?.auth.signOut(); setCloudProjects([]); setNotice('Signed out of cloud storage.') }
  const saveCloud = async () => {
    if (!cloud || !user) { setShowCloud(true); setNotice('Sign in to save projects to the cloud.'); return }
    setNotice('Saving project and media…')
    try {
      for (const clip of [...project.clips, ...(project.music ? [project.music] : [])]) {
        if (!clip.blob) continue
        const path = `${user.email}/${project.id}/${clip.id}-${clip.name.replace(/[^\w.-]/g, '_')}`
        const { error: uploadError } = await cloud.storage.from('project-media').upload(path, clip.blob, { upsert: true, contentType: clip.blob.type })
        if (uploadError) throw uploadError
      }
      const record = { id: project.id, user_id: user.email, name: project.name, state: { ...project, clips: project.clips.map(({ url: _url, blob: _blob, ...c }) => c), music: project.music ? (({ url: _url, blob: _blob, ...m }) => m)(project.music) : null }, updated_at: new Date().toISOString() }
      const { error } = await cloud.from('projects').upsert(record)
      if (error) throw error
      setNotice('Project and media saved to your cloud account.')
      await listCloudProjects()
    } catch (error) { setNotice(error instanceof Error ? `Cloud save failed: ${error.message}` : 'Cloud save failed. Check your Supabase setup.') }
  }
  const listCloudProjects = async () => { if (!cloud || !user) return; const { data, error } = await cloud.from('projects').select('id,name,updated_at').order('updated_at', { ascending: false }); if (error) setNotice(error.message); else setCloudProjects(data ?? []) }
  const loadCloudProject = async (id: string) => {
    if (!cloud || !user) return
    const { data, error } = await cloud.from('projects').select('state').eq('id', id).single()
    if (error || !data) { setNotice(error?.message ?? 'Project not found'); return }
    const state = data.state as Project
    const restore = async (clip: Clip) => {
      const prefix = `${user.email}/${id}/${clip.id}-`
      const { data: objects } = await cloud.storage.from('project-media').list(`${user.email}/${id}`)
      const match = objects?.find((obj) => obj.name.startsWith(`${clip.id}-`))
      if (!match) return null
      const { data: blob, error: downloadError } = await cloud.storage.from('project-media').download(prefix + match.name.slice(clip.id.length + 1))
      if (downloadError || !blob) return null
      await putAsset(clip.id, blob)
      return { ...clip, blob, url: URL.createObjectURL(blob) }
    }
    try { const clips = (await Promise.all((state.clips ?? []).map(restore))).filter((c): c is Clip => Boolean(c)); const music = state.music ? await restore(state.music) : null; setProject({ ...state, clips, music: music ?? undefined }); setActiveId(clips[0]?.id ?? ''); setShowCloud(false); setNotice('Cloud project loaded.') } catch { setNotice('Could not load cloud media. Check the storage bucket and policies.') }
  }

  const animateTitle = (ctx: CanvasRenderingContext2D, elapsed: number, width: number, height: number) => {
    if (!project.title.trim()) return
    const progress = Math.min(1, elapsed / 0.8)
    let alpha = 1, offset = 0, scale = 1
    if (project.animation === 'fade') alpha = progress
    if (project.animation === 'slide') offset = (1 - progress) * height * 0.08
    if (project.animation === 'pop') scale = 0.7 + 0.3 * progress
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(width / 2, (project.position === 'Top' ? height * 0.17 : project.position === 'Bottom' ? height * 0.83 : height / 2) + offset); ctx.scale(scale, scale)
    ctx.fillStyle = project.titleColor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${project.fontSize * width / 800}px Arial`; ctx.shadowColor = '#000b'; ctx.shadowBlur = 12; ctx.fillText(project.title, 0, 0, width * 0.86); ctx.restore()
  }

  const exportVideo = async () => {
    if (!project.clips.length || !canvasRef.current || !videoRef.current) { setNotice('Add video clips before exporting.'); return }
    if (!('MediaRecorder' in window) || !canvasRef.current.captureStream) { setNotice('Video export requires a recent Chromium-based browser.'); return }
    setExporting(true)
    const canvas = canvasRef.current, video = videoRef.current
    const [width, height] = project.resolution.split('x').map(Number)
    canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) { setExporting(false); return }
    let audioContext: AudioContext | undefined
    let musicElement: HTMLAudioElement | undefined
    try {
      const output = new MediaStream(canvas.captureStream(project.fps).getVideoTracks())
      audioContext = new AudioContext()
      const destination = audioContext.createMediaStreamDestination()
      const musicEl = document.createElement('audio'); musicElement = musicEl
      if (project.music) { musicEl.src = project.music.url; musicEl.volume = project.musicVolume; musicEl.loop = true; const musicSource = audioContext.createMediaElementSource(musicEl); musicSource.connect(destination); await audioContext.resume(); await musicEl.play().catch(() => undefined) }
      const audioTracks = destination.stream.getAudioTracks()
      audioTracks.forEach((track) => output.addTrack(track))
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(MediaRecorder.isTypeSupported)
      const recorder = new MediaRecorder(output, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: project.bitrate * 1_000_000 })
      const chunks: Blob[] = []; recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      const complete = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
      recorder.start(250)
      let elapsed = 0
      for (const clip of project.clips) {
        video.src = clip.url; video.muted = true
        await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error(`Unable to read ${clip.name}`)) })
        video.currentTime = 0; await video.play()
        const start = performance.now()
        await new Promise<void>((resolve) => {
          const paint = () => { if (!video.paused && !video.ended) { ctx.fillStyle = '#08090b'; ctx.fillRect(0, 0, width, height); const scale = Math.min(width / video.videoWidth, height / video.videoHeight); const w = video.videoWidth * scale, h = video.videoHeight * scale; ctx.drawImage(video, (width - w) / 2, (height - h) / 2, w, h); animateTitle(ctx, elapsed + (performance.now() - start) / 1000, width, height); requestAnimationFrame(paint) } }
          video.onended = () => resolve(); requestAnimationFrame(paint)
        })
        elapsed += clip.duration || video.duration || 0
      }
      recorder.stop(); await complete; musicElement?.pause(); await audioContext.close(); output.getTracks().forEach((track) => track.stop())
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${project.name.replace(/[^\w-]/g, '-')}-clipforge.webm`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('Export complete. Downloaded WebM video.')
    } catch (error) { musicElement?.pause(); await audioContext?.close().catch(() => undefined); setNotice(error instanceof Error ? `Export failed: ${error.message}` : 'Export failed.') }
    finally { setExporting(false); setPlaying(false); video.pause() }
  }

  const currentTime = (active ? clipStart(active.id) : 0) + time
  const dragDrop = async (event: React.DragEvent) => { event.preventDefault(); setDragging(false); await addMedia(event.dataTransfer.files, 'video') }

  return <div className="app-shell" onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={dragDrop}>
    <header className="topbar"><a className="brand" href="#home"><span className="brand-mark"><Clapperboard size={19}/></span>clipforge<span className="brand-dot">.</span></a><div className="project-name"><span className="project-status"/><input aria-label="Project name" value={project.name} onChange={(e) => patch('name', e.target.value)}/><ChevronDown size={14}/></div><div className="top-actions"><button className="ghost-button" onClick={() => setNotice('Draft autosaves in this browser.')}><Save size={14}/> Saved locally</button><button className="ghost-button" onClick={saveCloud}><Upload size={14}/> Cloud save</button><button className="export-button" onClick={exportVideo} disabled={!project.clips.length || exporting}><ArrowDownToLine size={16}/>{exporting ? 'Rendering…' : 'Export'}</button></div></header>
    <main className="workspace"><aside className="sidebar"><div className="sidebar-heading">CREATE</div><button className="nav-item active"><Film size={17}/>Editor</button><button className="nav-item" onClick={() => videoInput.current?.click()}><FolderOpen size={17}/>Media library <span className="count">{project.clips.length}</span></button><button className="nav-item" onClick={() => { setShowCloud(true); void listCloudProjects() }}><Layers3 size={17}/>Projects</button><div className="sidebar-heading tools-heading">TOOLS</div><button className="nav-item selected-tool"><Type size={17}/>Text & titles</button><button className="nav-item" onClick={() => musicInput.current?.click()}><Music2 size={17}/>Music</button><div className="sidebar-bottom"><div className="tip-card"><div className="tip-icon"><Sparkles size={16}/></div><strong>Creator studio</strong><p>Arrange clips, animate titles, add a soundtrack, and export your story.</p><button onClick={() => videoInput.current?.click()}>Add video <span>→</span></button></div><div className="sidebar-footer"><span>Clipforge v0.3</span>{user ? <button className="icon-button" onClick={signOut} aria-label="Sign out"><LogOut size={16}/></button> : <button className="icon-button" onClick={() => setShowCloud(true)} aria-label="Sign in"><LogIn size={16}/></button>}</div></div></aside>
    <section className="editor-area"><div className="editor-heading"><div><div className="eyebrow">VIDEO EDITOR</div><h1>Your next story <span>starts here.</span></h1><p>Arrange clips, add a soundtrack, and make it yours.</p></div><div className="editor-buttons"><button className="add-media" onClick={() => videoInput.current?.click()}><Plus size={16}/> Add video</button><button className="add-media" onClick={() => musicInput.current?.click()}><Music2 size={16}/> Add music</button></div></div>
    <div className={`drop-zone ${isDragging ? 'dragging' : ''}`}><div className="drop-inner"><Upload size={18}/><span>Drop video clips anywhere to add them to the timeline</span></div></div>
    <div className="stage-row"><div className="preview-column"><div className="preview-frame">{active ? <video key={active.id} ref={videoRef} src={active.url} onLoadedMetadata={onMetadata} onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { const index = project.clips.findIndex((c) => c.id === active.id); if (index < project.clips.length - 1) { setActiveId(project.clips[index + 1].id); setTime(0) } else setPlaying(false) }}/> : <div className="empty-preview"><div className="empty-icon"><Film size={24}/></div><strong>Your canvas is waiting</strong><span>Upload videos to build your timeline</span><button onClick={() => videoInput.current?.click()}><Upload size={15}/> Choose videos</button></div>}{active && project.title && <div className={`title-preview title-${project.position.toLowerCase()} anim-${project.animation}`} style={{ color: project.titleColor, fontSize: `clamp(18px, ${project.fontSize / 8}vw, ${project.fontSize}px)` }}>{project.title}</div>}<div className="preview-badge"><span/>PREVIEW</div></div><div className="transport"><button className="play-button" onClick={() => { if (!videoRef.current) return; if (videoRef.current.paused) void videoRef.current.play(); else videoRef.current.pause() }} disabled={!active}>{playing ? <Pause size={17} fill="currentColor"/> : <Play size={17} fill="currentColor"/>}</button><span className="timecode">{fmt(currentTime)} <i>/</i> {fmt(totalDuration)}</span><input aria-label="Seek clip" type="range" min="0" max={active?.duration || 1} step="0.1" value={time} onChange={(e) => { setTime(Number(e.target.value)); if (videoRef.current) videoRef.current.currentTime = Number(e.target.value) }}/><button className="volume-button"><Volume2 size={17}/></button></div></div>
    <aside className="inspector"><div className="inspector-title"><span><Type size={16}/>Title & export</span></div><label className="field-label" htmlFor="title-input">TITLE TEXT</label><textarea id="title-input" rows={2} value={project.title} onChange={(e) => patch('title', e.target.value)}/><div className="field-row"><label className="field-label">ANIMATION</label><select value={project.animation} onChange={(e) => patch('animation', e.target.value as Animation)}><option value="none">None</option><option value="fade">Fade in</option><option value="slide">Slide in</option><option value="pop">Pop in</option></select></div><div className="field-row"><label className="field-label">POSITION</label><select value={project.position} onChange={(e) => patch('position', e.target.value)}><option>Top</option><option>Center</option><option>Bottom</option></select></div><div className="field-row"><label className="field-label">SIZE · {project.fontSize}px</label></div><input className="size-slider" type="range" min="20" max="72" value={project.fontSize} onChange={(e) => patch('fontSize', Number(e.target.value))}/><div className="field-row color-row"><label className="field-label">COLOR</label><input type="color" value={project.titleColor} onChange={(e) => patch('titleColor', e.target.value)}/><span>{project.titleColor.toUpperCase()}</span></div><div className="inspector-divider"/><div className="field-label">EXPORT SETTINGS</div><div className="field-row"><label className="field-label">SIZE</label><select value={project.resolution} onChange={(e) => patch('resolution', e.target.value)}><option value="1280x720">720p</option><option value="1920x1080">1080p</option><option value="3840x2160">4K</option></select></div><div className="field-row"><label className="field-label">FRAME RATE</label><select value={project.fps} onChange={(e) => patch('fps', Number(e.target.value))}><option value="24">24 fps</option><option value="30">30 fps</option><option value="60">60 fps</option></select></div><div className="field-row"><label className="field-label">BITRATE · {project.bitrate} Mbps</label></div><input className="size-slider" type="range" min="2" max="20" value={project.bitrate} onChange={(e) => patch('bitrate', Number(e.target.value))}/></aside></div>
    <section className="timeline-panel"><div className="timeline-header"><div className="timeline-title"><Layers3 size={16}/><strong>Timeline</strong><span>{project.clips.length} clips · {fmt(totalDuration)}</span></div><div className="timeline-actions"><button className="timeline-add" onClick={() => videoInput.current?.click()}><Plus size={15}/> Video</button><button className="timeline-add" onClick={() => musicInput.current?.click()}><Music2 size={15}/> Music</button></div></div><div className="timeline-ruler"><span>00:00</span><span>00:05</span><span>00:10</span><span>00:15</span><span>00:20</span><span>00:25</span></div><div className="timeline-track"><div className="track-label"><Film size={14}/><span>Video</span></div><div className="track-content">{project.clips.length ? project.clips.map((clip, i) => <div key={clip.id} className={`clip-card ${clip.id === active?.id ? 'active-clip' : ''}`} style={{ width: `${Math.max(145, Math.min((clip.duration || 8) * 20, 380))}px` }} onClick={() => { setActiveId(clip.id); setTime(0) }} role="button" tabIndex={0}><div className="clip-thumbnails">{Array.from({ length: 5 }, (_, j) => <div key={j} className={`thumb thumb-${(i + j) % 4}`}><Film size={13}/></div>)}</div><span className="clip-name">{clip.name}</span><div className="clip-controls"><button aria-label="Move clip left" onClick={(e) => { e.stopPropagation(); moveClip(clip.id, -1) }}>‹</button><button aria-label="Move clip right" onClick={(e) => { e.stopPropagation(); moveClip(clip.id, 1) }}>›</button><button aria-label={`Remove ${clip.name}`} onClick={(e) => { e.stopPropagation(); removeClip(clip.id) }}><X size={12}/></button></div></div>) : <button className="track-empty" onClick={() => videoInput.current?.click()}><Plus size={15}/> Add video clips</button>}</div></div><div className="timeline-track title-track"><div className="track-label"><Type size={14}/><span>Title</span></div><div className="track-content">{project.title ? <div className={`title-clip anim-${project.animation}`} style={{ width: `${Math.max(150, Math.min(totalDuration * 20 || 180, 400))}px` }}><Type size={13}/><span>{project.title} · {project.animation}</span></div> : <span className="track-hint">Type a title to add it to your project</span>}</div></div><div className="timeline-track music-track"><div className="track-label"><Music2 size={14}/><span>Music</span></div><div className="track-content">{project.music ? <div className="music-clip" style={{ width: `${Math.max(150, Math.min(totalDuration * 20 || 180, 400))}px` }}><Music2 size={13}/><span>{project.music.name}</span><input aria-label="Music volume" type="range" min="0" max="1" step="0.05" value={project.musicVolume} onChange={(e) => patch('musicVolume', Number(e.target.value))}/><button onClick={() => patch('music', undefined)} aria-label="Remove music"><X size={12}/></button></div> : <button className="track-empty" onClick={() => musicInput.current?.click()}><Plus size={15}/> Add background music</button>}</div></div></section><div className="bottom-hint"><span><Sparkles size={14}/> Media stays on your device unless cloud save is used</span><span>WebM export · 720p / 1080p / 4K</span></div>
    </section></main>
    {showCloud && <div className="modal-backdrop" onClick={() => setShowCloud(false)}><section className="cloud-modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setShowCloud(false)} aria-label="Close"><X size={17}/></button><h2>Cloud projects</h2>{!cloudConfigured ? <><p>Set up Supabase to enable accounts and cloud media backups. Local editing and exports work without an account.</p><code>VITE_SUPABASE_URL<br/>VITE_SUPABASE_ANON_KEY</code></> : user ? <><p>Signed in as <strong>{user.email}</strong></p><button className="export-button" onClick={saveCloud}><Upload size={15}/> Save current project</button><button className="timeline-add" onClick={listCloudProjects}>Refresh projects</button><div className="cloud-list">{cloudProjects.map((item) => <button key={item.id} onClick={() => loadCloudProject(item.id)}><span>{item.name}</span><small>{new Date(item.updated_at).toLocaleString()}</small></button>)}</div><button className="text-button" onClick={signOut}>Sign out</button></> : <><p>Sign in with an email magic link to back up and access your projects across devices.</p><input className="email-input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)}/><button className="export-button" onClick={signIn}><LogIn size={15}/> Send sign-in link</button></>}</section></div>}
    {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={14}/></button></div>}
    <input ref={videoInput} className="hidden-input" type="file" accept="video/*" multiple onChange={(e) => { if (e.target.files) void addMedia(e.target.files, 'video'); e.target.value = '' }}/><input ref={musicInput} className="hidden-input" type="file" accept="audio/*" onChange={(e) => { if (e.target.files) void addMedia(e.target.files, 'audio'); e.target.value = '' }}/><canvas ref={canvasRef} className="hidden-canvas"/>
  </div>
}
