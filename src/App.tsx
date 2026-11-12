import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react'
import {
  AlignCenter,
  ArrowDownToLine,
  ChevronDown,
  CircleHelp,
  Clapperboard,
  Film,
  FolderOpen,
  Layers3,
  Menu,
  Pause,
  Play,
  Plus,
  Save,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Type,
  Upload,
  Volume2,
  WandSparkles,
  X,
} from 'lucide-react'

type Clip = {
  id: string
  name: string
  url: string
  duration: number
  createdAt: number
}

type PersistedProject = {
  projectName: string
  title: string
  titleColor: string
  fontSize: number
  position: 'Top' | 'Center' | 'Bottom'
  clips: Clip[]
  activeId: string
}

const STORAGE_KEY = 'clipforge-project-v1'

const fmt = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '00:00'
  const safeSeconds = Math.max(0, seconds)
  const minutes = Math.floor(safeSeconds / 60)
  const secs = Math.floor(safeSeconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const defaultProjectName = 'Untitled project'

export default function App() {
  const [clips, setClips] = useState<Clip[]>([])
  const [activeId, setActiveId] = useState('')
  const [title, setTitle] = useState('Your story starts here')
  const [titleColor, setTitleColor] = useState('#ffffff')
  const [fontSize, setFontSize] = useState(42)
  const [position, setPosition] = useState<'Top' | 'Center' | 'Bottom'>('Center')
  const [projectName, setProjectName] = useState(defaultProjectName)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  const fileInput = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const activeClip = clips.find((clip) => clip.id === activeId) ?? null

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return

    try {
      const parsed = JSON.parse(saved) as Partial<PersistedProject>
      if (parsed.clips && Array.isArray(parsed.clips)) {
        setClips(parsed.clips)
      }
      if (parsed.projectName) setProjectName(parsed.projectName)
      if (parsed.title) setTitle(parsed.title)
      if (parsed.titleColor) setTitleColor(parsed.titleColor)
      if (typeof parsed.fontSize === 'number') setFontSize(parsed.fontSize)
      if (parsed.position) setPosition(parsed.position)
      if (parsed.activeId) setActiveId(parsed.activeId)
    } catch {
      setNotice('Saved draft could not be loaded, but your project is still ready.')
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const payload: PersistedProject = {
      projectName,
      title,
      titleColor,
      fontSize,
      position,
      clips,
      activeId,
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }, [activeId, clips, fontSize, position, projectName, title, titleColor])

  useEffect(() => {
    if (!clips.length && !activeId) {
      setDuration(0)
      setCurrent(0)
    }
  }, [activeId, clips.length])

  useEffect(() => {
    return () => {
      clips.forEach((clip) => URL.revokeObjectURL(clip.url))
    }
  }, [clips])

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('video/'))

    if (!files.length) {
      setNotice('Choose a valid video file to add it to your project.')
      return
    }

    const added = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      url: URL.createObjectURL(file),
      duration: 0,
      createdAt: Date.now(),
    }))

    setClips((current) => [...current, ...added])
    setActiveId((currentId) => currentId || added[0].id)
    setNotice(`${added.length} video${added.length === 1 ? '' : 's'} added to your project.`)
    event.target.value = ''
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('video/'))
    if (!files.length) {
      setNotice('Drag a video file into the editor to start creating.')
      return
    }

    const added = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      url: URL.createObjectURL(file),
      duration: 0,
      createdAt: Date.now(),
    }))

    setClips((current) => [...current, ...added])
    setActiveId((currentId) => currentId || added[0].id)
    setNotice(`${added.length} video${added.length === 1 ? '' : 's'} dropped into your project.`)
  }

  const removeClip = (id: string) => {
    const match = clips.find((clip) => clip.id === id)
    if (match) URL.revokeObjectURL(match.url)

    const remaining = clips.filter((clip) => clip.id !== id)
    setClips(remaining)
    if (activeId === id) setActiveId(remaining[0]?.id ?? '')
    setNotice('Clip removed from the timeline.')
  }

  const saveDraft = () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        projectName,
        title,
        titleColor,
        fontSize,
        position,
        clips,
        activeId,
      } satisfies PersistedProject),
    )
    setNotice('Project saved locally in your browser.')
  }

  const onLoadedMetadata = () => {
    const video = videoRef.current
    if (!video || !activeClip) return
    setDuration(video.duration || 0)
    setCurrent(0)
    setClips((current) =>
      current.map((clip) =>
        clip.id === activeClip.id ? { ...clip, duration: video.duration || clip.duration || 0 } : clip,
      ),
    )
  }

  const drawFrame = (video: HTMLVideoElement, ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.fillStyle = '#08090b'
    ctx.fillRect(0, 0, width, height)

    const videoWidth = video.videoWidth || 1280
    const videoHeight = video.videoHeight || 720
    const scale = Math.min(width / videoWidth, height / videoHeight)
    const drawWidth = videoWidth * scale
    const drawHeight = videoHeight * scale
    const drawX = (width - drawWidth) / 2
    const drawY = (height - drawHeight) / 2

    ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight)

    if (title.trim()) {
      ctx.fillStyle = titleColor
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `700 ${fontSize}px Inter, Arial, sans-serif`
      ctx.shadowColor = 'rgba(0,0,0,0.75)'
      ctx.shadowBlur = 12
      const y = position === 'Top' ? height * 0.17 : position === 'Bottom' ? height * 0.83 : height / 2
      ctx.fillText(title, width / 2, y)
      ctx.shadowBlur = 0
    }
  }

  const exportVideo = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !activeClip) {
      setNotice('Add a video before exporting.')
      return
    }

    if (!('MediaRecorder' in window) || !canvas.captureStream) {
      setNotice('This browser cannot export video. Try current Chrome or Edge.')
      return
    }

    setExporting(true)
    setNotice('Preparing your render…')

    try {
      const width = 1280
      const height = 720
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas context is unavailable.')

      const sourceStream = video.captureStream ? video.captureStream() : null
      const canvasStream = canvas.captureStream(30)
      const stream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...(sourceStream ? sourceStream.getAudioTracks() : []),
      ])

      const preferredMimeTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      const mimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: Blob[] = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }

      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
      })

      video.currentTime = 0
      video.muted = true
      await video.play()

      recorder.start(250)
      const tick = () => {
        if (video.ended || video.paused) return
        drawFrame(video, ctx, width, height)
        requestAnimationFrame(tick)
      }

      tick()
      await new Promise<void>((resolve) => {
        video.addEventListener('ended', () => resolve(), { once: true })
      })

      recorder.stop()
      await stopped
      stream.getTracks().forEach((track) => track.stop())

      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${activeClip.name.replace(/\.[^.]+$/, '')}-clipforge.webm`
      link.click()
      URL.revokeObjectURL(url)

      setNotice('Video exported successfully.')
      video.pause()
      setPlaying(false)
    } catch (error) {
      setNotice(error instanceof Error ? `Export failed: ${error.message}` : 'Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const togglePlayback = async () => {
    if (!videoRef.current) return

    if (videoRef.current.paused) {
      try {
        await videoRef.current.play()
        setPlaying(true)
      } catch {
        setNotice('Playback is blocked by the browser. Try clicking the video area again.')
      }
    } else {
      videoRef.current.pause()
      setPlaying(false)
    }
  }

  const resetProject = () => {
    setClips([])
    setActiveId('')
    setTitle('Your story starts here')
    setTitleColor('#ffffff')
    setFontSize(42)
    setPosition('Center')
    setProjectName(defaultProjectName)
    setCurrent(0)
    setDuration(0)
    localStorage.removeItem(STORAGE_KEY)
    setNotice('Project reset. You can start a fresh edit.')
  }

  return (
    <div className="app-shell" onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>
      <header className="topbar">
        <a className="brand" href="#home" aria-label="Clipforge home"><span className="brand-mark"><Clapperboard size={19} /></span><span>clipforge</span><span className="brand-dot">.</span></a>
        <div className="project-name" title={projectName}><span className="project-status" /> {projectName}</div>
        <div className="top-actions">
          <button className="ghost-button" onClick={saveDraft}><Save size={14} /> Save</button>
          <button className="ghost-button" onClick={resetProject}><X size={14} /> Reset</button>
          <button className="export-button" onClick={exportVideo} disabled={!activeClip || exporting}><ArrowDownToLine size={16} />{exporting ? 'Exporting…' : 'Export video'}</button>
          <button className="icon-button mobile-menu" aria-label="Menu"><Menu size={18} /></button>
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading">CREATE</div>
          <button className="nav-item active"><Film size={17} /> Editor</button>
          <button className="nav-item" onClick={() => fileInput.current?.click()}><FolderOpen size={17} /> Media library <span className="count">{clips.length}</span></button>
          <button className="nav-item" onClick={() => setNotice('More templates are on the roadmap.')}><Sparkles size={17} /> Templates <span className="soon">SOON</span></button>

          <div className="sidebar-heading tools-heading">TOOLS</div>
          <button className="nav-item selected-tool"><Type size={17} /> Text & titles</button>
          <button className="nav-item" onClick={() => setNotice('Adjustments will be added in the next pass.')}><SlidersHorizontal size={17} /> Adjust</button>
          <button className="nav-item" onClick={() => setNotice('Audio tools are on the roadmap.')}><Volume2 size={17} /> Audio</button>

          <div className="sidebar-bottom">
            <div className="tip-card">
              <div className="tip-icon"><WandSparkles size={16} /></div>
              <strong>Make something great</strong>
              <p>Bring your clips together and tell your story with text, motion, and export-ready renders.</p>
              <button onClick={() => fileInput.current?.click()}>Add your first clip <span>→</span></button>
            </div>

            <div className="sidebar-footer">
              <span>Clipforge v0.2</span>
              <button className="icon-button" aria-label="Settings"><Settings2 size={16} /></button>
            </div>
          </div>
        </aside>

        <section className="editor-area">
          <div className="editor-heading">
            <div>
              <div className="eyebrow">VIDEO EDITOR</div>
              <h1>Your next story <span>starts here.</span></h1>
              <p>Shape your footage into something worth sharing.</p>
            </div>
            <button className="add-media" onClick={() => fileInput.current?.click()}><Plus size={16} /> Add media</button>
          </div>

          <div className="drop-zone ${isDragging ? 'dragging' : ''}">
            <div className="drop-inner">
              <Upload size={18} />
              <span>Drag and drop video files here</span>
            </div>
          </div>

          <div className="stage-row">
            <div className="preview-column">
              <div className="preview-frame">
                {activeClip ? (
                  <video
                    key={activeClip.id}
                    ref={videoRef}
                    src={activeClip.url}
                    onLoadedMetadata={onLoadedMetadata}
                    onTimeUpdate={() => setCurrent(videoRef.current?.currentTime ?? 0)}
                    onPause={() => setPlaying(false)}
                    onPlay={() => setPlaying(true)}
                    onEnded={() => setPlaying(false)}
                    controls={false}
                  />
                ) : (
                  <div className="empty-preview">
                    <div className="empty-icon"><Film size={24} /></div>
                    <strong>Your canvas is waiting</strong>
                    <span>Upload a video to start creating</span>
                    <button onClick={() => fileInput.current?.click()}><Upload size={15} /> Choose a video</button>
                  </div>
                )}

                {activeClip && title && (
                  <div className={`title-preview title-${position.toLowerCase()}`} style={{ color: titleColor, fontSize: `clamp(18px, ${fontSize / 8}vw, ${fontSize}px)` }}>{title}</div>
                )}

                <div className="preview-badge"><span /> PREVIEW</div>
              </div>

              <div className="transport">
                <button className="play-button" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlayback} disabled={!activeClip}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
                <span className="timecode">{fmt(current)} <i>/</i> {fmt(duration)}</span>
                <input aria-label="Seek video" type="range" min="0" max={duration || 1} step="0.1" value={current} onChange={(event) => {
                  const time = Number(event.target.value)
                  setCurrent(time)
                  if (videoRef.current) videoRef.current.currentTime = time
                }} disabled={!activeClip} />
                <button className="volume-button" aria-label="Volume"><Volume2 size={17} /></button>
                <button className="more-button" aria-label="More options">···</button>
              </div>
            </div>

            <aside className="inspector">
              <div className="inspector-title">
                <span><Type size={16} /> Text overlay</span>
                <button className="icon-button" aria-label="Close text settings"><X size={15} /></button>
              </div>

              <label className="field-label" htmlFor="title-input">YOUR TITLE</label>
              <textarea id="title-input" rows={3} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Type something memorable…" />

              <div className="field-row">
                <label className="field-label">PROJECT</label>
                <input className="project-input" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Untitled project" />
              </div>

              <div className="field-row size-row">
                <label className="field-label" htmlFor="font-size">SIZE</label>
                <span className="size-value">{fontSize}px</span>
              </div>
              <input id="font-size" className="size-slider" type="range" min="20" max="72" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} />

              <div className="field-row color-row">
                <label className="field-label" htmlFor="title-color">COLOR</label>
                <input id="title-color" type="color" value={titleColor} onChange={(event) => setTitleColor(event.target.value)} />
                <span>{titleColor.toUpperCase()}</span>
              </div>

              <div className="field-label position-label">POSITION</div>
              <div className="position-options">
                {(['Top', 'Center', 'Bottom'] as const).map((item) => (
                  <button key={item} className={position === item ? 'position-option chosen' : 'position-option'} onClick={() => setPosition(item)}><AlignCenter size={15} />{item}</button>
                ))}
              </div>

              <div className="inspector-note"><Sparkles size={14} /> Changes appear instantly in your preview.</div>
            </aside>
          </div>

          <section className="timeline-panel">
            <div className="timeline-header">
              <div className="timeline-title"><Layers3 size={16} /><strong>Timeline</strong><span>{clips.length} {clips.length === 1 ? 'clip' : 'clips'}</span></div>
              <button className="timeline-add" onClick={() => fileInput.current?.click()}><Plus size={15} /> Add media</button>
            </div>

            <div className="timeline-ruler">
              <span>00:00</span>
              <span>00:05</span>
              <span>00:10</span>
              <span>00:15</span>
              <span>00:20</span>
              <span>00:25</span>
            </div>

            <div className="timeline-track">
              <div className="track-label"><Film size={14} /><span>Video</span></div>
              <div className="track-content">
                {clips.length ? (
                  clips.map((clip, index) => (
                    <div
                      key={clip.id}
                      className={clip.id === activeId ? 'clip-card active-clip' : 'clip-card'}
                      style={{ width: `${Math.max(170, Math.min((clip.duration || 10) * 20, 400))}px` }}
                      onClick={() => setActiveId(clip.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => event.key === 'Enter' && setActiveId(clip.id)}
                    >
                      <div className="clip-thumbnails">
                        {Array.from({ length: 5 }, (_, thumbIndex) => (
                          <div key={`${clip.id}-${thumbIndex}`} className={`thumb thumb-${(index + thumbIndex) % 4}`}><Film size={13} /></div>
                        ))}
                      </div>
                      <span className="clip-name">{clip.name}</span>
                      <button className="remove-clip" aria-label={`Remove ${clip.name}`} onClick={(event) => { event.stopPropagation(); removeClip(clip.id) }}><X size={12} /></button>
                    </div>
                  ))
                ) : (
                  <button className="track-empty" onClick={() => fileInput.current?.click()}><Plus size={15} /> Drop a video here or browse files</button>
                )}
              </div>
            </div>

            <div className="timeline-track title-track">
              <div className="track-label"><Type size={14} /><span>Title</span></div>
              <div className="track-content">
                {title && activeClip ? (
                  <div className="title-clip" style={{ width: `${Math.max(160, Math.min((duration || 10) * 20, 420))}px` }}><Type size={13} /><span>{title}</span></div>
                ) : (
                  <span className="track-hint">Add a title using the text panel</span>
                )}
              </div>
            </div>

            <div className="timeline-playhead" style={{ left: `calc(94px + ${duration ? Math.min(current / duration * 65, 65) : 0}%)` }} />
          </section>

          <div className="bottom-hint">
            <span><Sparkles size={14} /> Everything stays on your device</span>
            <span>Made for creators, by creators</span>
          </div>
        </section>
      </main>

      {notice && (
        <div className="toast" role="status">
          {notice}
          <button onClick={() => setNotice('')} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      <input ref={fileInput} className="hidden-input" type="file" accept="video/*" multiple onChange={addFiles} />
      <canvas ref={canvasRef} className="hidden-canvas" />
    </div>
  )
}
