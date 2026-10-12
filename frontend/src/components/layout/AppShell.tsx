import { FolderPlus, Hexagon, Images, PackageOpen, PenTool } from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'
import { type Route, navigate } from '../../app/router'
import { errorMessage } from '../../services/apiClient'
import { useProjectStore } from '../../stores/projectStore'
import { toast } from '../../stores/toastStore'
import { Button, IconButton } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

interface AppShellProps {
  route: Route
  children: ReactNode
}

export function AppShell({ route, children }: AppShellProps) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-surface-700 bg-surface-900 px-4">
        <a href="#/" className="flex items-center gap-2 font-semibold text-white" aria-label="YOLO Polygon Annotator home">
          <Hexagon className="size-5 text-accent-400" aria-hidden />
          <span className="hidden sm:inline">YOLO Polygon Annotator</span>
        </a>
        <ProjectSelector />
        <MainNav route={route} />
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  )
}

function MainNav({ route }: { route: Route }) {
  const images = useProjectStore((s) => s.images)
  const editorTarget = route.name === 'editor' ? route.imageId : (images.find((i) => i.status === 'pending') ?? images[0])?.id
  const items = [
    { name: 'gallery', label: 'Images', icon: Images, onClick: () => navigate({ name: 'gallery' }) },
    {
      name: 'editor',
      label: 'Editor',
      icon: PenTool,
      disabled: !editorTarget,
      onClick: () => editorTarget && navigate({ name: 'editor', imageId: editorTarget }),
    },
    { name: 'export', label: 'Export', icon: PackageOpen, onClick: () => navigate({ name: 'export' }) },
  ] as const

  return (
    <nav aria-label="Main" className="ml-auto flex items-center gap-1">
      {items.map((item) => {
        const active = route.name === item.name
        const Icon = item.icon
        return (
          <button
            key={item.name}
            type="button"
            onClick={item.onClick}
            disabled={'disabled' in item && item.disabled}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-40 ${
              active ? 'bg-surface-700 text-white' : 'text-slate-400 hover:bg-surface-800 hover:text-white'
            }`}
          >
            <Icon className="size-4" aria-hidden />
            <span className="hidden md:inline">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function ProjectSelector() {
  const projects = useProjectStore((s) => s.projects)
  const projectId = useProjectStore((s) => s.projectId)
  const selectProject = useProjectStore((s) => s.selectProject)
  const createProject = useProjectStore((s) => s.createProject)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      await createProject(name.trim())
      setDialogOpen(false)
      setName('')
      navigate({ name: 'gallery' })
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-1">
      <label htmlFor="project-select" className="sr-only">
        Project
      </label>
      <select
        id="project-select"
        value={projectId ?? ''}
        onChange={(event) => {
          void selectProject(event.target.value)
          navigate({ name: 'gallery' })
        }}
        className="field-input h-9 max-w-[14rem] py-1"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <IconButton icon={FolderPlus} label="New project" onClick={() => setDialogOpen(true)} />
      <Dialog open={dialogOpen} title="New project" onClose={() => setDialogOpen(false)}>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-400">Project name</span>
            <input
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="e.g. EU licence plates"
              autoFocus
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={busy || !name.trim()}>
              Create
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
