import { ArrowDownIcon, CheckCircleIcon, PaperClipIcon, ShieldCheckIcon, TrashIcon, UserCircleIcon } from '@heroicons/react/24/outline'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useState, useRef, useEffect } from 'preact/hooks'
import type { TaskWithBlocked } from '../stores'
import { updateTask } from '../stores'
import type { Agent } from '@flux/shared'
import { AGENTS, AGENT_CONFIG } from '@flux/shared'

interface DraggableTaskCardProps {
  task: TaskWithBlocked
  epicColor?: string
  epicTitle?: string
  taskNumber?: number
  onClick?: () => void
  onDelete?: () => void
  onRefresh?: () => void
  condensed?: boolean
}

export function DraggableTaskCard({
  task,
  epicColor = '#9ca3af',
  epicTitle = 'Unassigned',
  taskNumber,
  onClick,
  onDelete,
  onRefresh,
  condensed = false,
}: DraggableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }

  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false)
  const agentDropdownRef = useRef<HTMLDivElement>(null)

  // Close the agent dropdown when clicking outside it
  useEffect(() => {
    if (!agentDropdownOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
        setAgentDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [agentDropdownOpen])

  const handleClick = () => {
    if (!isDragging && onClick) {
      onClick()
    }
  }

  const handleAgentChange = async (e: Event, newAgent: Agent | null) => {
    e.stopPropagation()
    setAgentDropdownOpen(false)
    await updateTask(task.id, { agent: newAgent ?? undefined })
    if (onRefresh) onRefresh()
  }

  const renderAgentBadge = () => {
    const agent = task.agent
    if (!agent) {
      return (
        <div class="relative" ref={agentDropdownRef}>
          <button
            class="flex items-center gap-0.5 text-base-content/30 hover:text-base-content/60 transition-colors text-xs"
            title="Assign agent"
            onClick={(e) => { e.stopPropagation(); setAgentDropdownOpen(!agentDropdownOpen) }}
          >
            <UserCircleIcon className="h-3.5 w-3.5" />
          </button>
          {agentDropdownOpen && (
            <div class="absolute z-50 top-5 left-0 bg-base-100 border border-base-300 rounded-lg shadow-lg py-1 min-w-[100px]">
              {AGENTS.map((a: Agent) => (
                <button
                  key={a}
                  class="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-base-200 text-left"
                  onClick={(e) => handleAgentChange(e, a)}
                >
                  <span class="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: AGENT_CONFIG[a].color }} />
                  {AGENT_CONFIG[a].label}
                </button>
              ))}
            </div>
          )}
        </div>
      )
    }
    const config = AGENT_CONFIG[agent]
    return (
      <div class="relative" ref={agentDropdownRef}>
        <button
          class="badge badge-xs font-medium border-0 text-white flex-shrink-0"
          style={{ backgroundColor: config.color }}
          title={`Agent: ${config.label} — click to change`}
          onClick={(e) => { e.stopPropagation(); setAgentDropdownOpen(!agentDropdownOpen) }}
        >
          {config.label}
        </button>
        {agentDropdownOpen && (
          <div class="absolute z-50 top-5 left-0 bg-base-100 border border-base-300 rounded-lg shadow-lg py-1 min-w-[110px]">
            <button
              class="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-base-200 text-left text-base-content/50"
              onClick={(e) => handleAgentChange(e, null)}
            >
              <span class="w-2 h-2 rounded-full bg-base-300 flex-shrink-0" />
              None
            </button>
            {AGENTS.map((a: Agent) => (
              <button
                key={a}
                class={`flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-base-200 text-left ${a === agent ? 'font-semibold' : ''}`}
                onClick={(e) => handleAgentChange(e, a)}
              >
                <span class="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: AGENT_CONFIG[a].color }} />
                {AGENT_CONFIG[a].label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Shared indicator badges for acceptance criteria and guardrails
  const renderMetaIndicators = (compact = false) => (
    <>
      {task.acceptance_criteria && task.acceptance_criteria.length > 0 && (
        <div class={`flex items-center ${compact ? 'gap-0.5 flex-shrink-0' : 'gap-1'} text-xs text-success/70`} title="Acceptance criteria">
          <CheckCircleIcon className="h-3.5 w-3.5" />
          <span>{task.acceptance_criteria.length}</span>
        </div>
      )}
      {task.guardrails && task.guardrails.length > 0 && (
        <div class={`flex items-center ${compact ? 'gap-0.5 flex-shrink-0' : 'gap-1'} text-xs text-info/70`} title="Guardrails">
          <ShieldCheckIcon className="h-3.5 w-3.5" />
          <span>{task.guardrails.length}</span>
        </div>
      )}
      {task.blob_ids && task.blob_ids.length > 0 && (
        <div class={`flex items-center ${compact ? 'gap-0.5 flex-shrink-0' : 'gap-1'} text-xs text-base-content/50`} title="Attachments">
          <PaperClipIcon className="h-3.5 w-3.5" />
          <span>{task.blob_ids.length}</span>
        </div>
      )}
    </>
  )

  // Condensed view
  if (condensed) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        class={`bg-base-100 rounded-lg shadow-sm px-3 py-2 cursor-grab hover:shadow-md transition-shadow active:cursor-grabbing touch-none ${
          task.blocked ? 'ring-2 ring-warning/50' : ''
        }`}
        onClick={handleClick}
        {...(listeners as any)}
        role={attributes.role}
        tabIndex={attributes.tabIndex}
        aria-pressed={attributes['aria-pressed']}
        aria-roledescription={attributes['aria-roledescription']}
        aria-describedby={attributes['aria-describedby']}
      >
        <div class="flex items-center gap-2">
          <span
            class="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: epicColor }}
          />
          <span class="font-medium text-sm truncate flex-1">{task.title}</span>
          <span class="text-xs font-mono text-base-content/30 flex-shrink-0" title="Task ID">{task.id}</span>
          {renderAgentBadge()}
          {task.blocked && (
            <span class="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded font-medium flex-shrink-0">
              Blocked
            </span>
          )}
          {renderMetaIndicators(true)}
          {task.status === 'planning' && (
            <progress class="progress progress-secondary w-8 flex-shrink-0" value={0} max={100} />
          )}
          {task.status === 'todo' && (
            <progress class="progress w-8 flex-shrink-0" value={0} max={100} />
          )}
          {task.status === 'in_progress' && (
            <>
              <progress class="progress progress-warning w-8 flex-shrink-0" />
              {task.workers && task.workers.length > 0 && task.workers.map(name => (
                <span key={name} class="badge badge-primary badge-xs flex-shrink-0">{name}</span>
              ))}
            </>
          )}
          {task.status === 'done' && (
            <progress class="progress progress-success w-8 flex-shrink-0" value={100} max={100} />
          )}
          {onDelete && (
            <button
              class="btn btn-ghost btn-xs text-error/40 hover:text-error flex-shrink-0"
              title="Delete task"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    )
  }

  // Normal view
  return (
    <div
      ref={setNodeRef}
      style={style}
      class={`bg-base-100 rounded-lg shadow-sm p-4 cursor-grab hover:shadow-md transition-shadow active:cursor-grabbing touch-none ${
        task.blocked ? 'ring-2 ring-warning/50' : ''
      }`}
      onClick={handleClick}
      {...(listeners as any)}
      role={attributes.role}
      tabIndex={attributes.tabIndex}
      aria-pressed={attributes['aria-pressed']}
      aria-roledescription={attributes['aria-roledescription']}
      aria-describedby={attributes['aria-describedby']}
    >
      {/* Epic Label + Task ID */}
      <div class="flex items-center gap-1.5 mb-2">
        <span
          class="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: epicColor }}
        />
        <span class="text-xs text-base-content/50 font-medium">{epicTitle}</span>
        <div class="ml-auto flex items-center gap-1.5">
          {renderAgentBadge()}
          <span class="text-xs font-mono text-base-content/30" title="Task ID">{task.id}</span>
          {task.blocked && (
            <span class="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded font-medium">
              Blocked
            </span>
          )}
        </div>
      </div>

      {/* Title */}
      <h4 class="font-semibold text-sm mb-1">{task.title}</h4>

      {/* Latest comment preview */}
      {task.comments && task.comments.length > 0 && (
        <p class="text-xs text-base-content/50 mb-3 line-clamp-2">
          {task.comments[task.comments.length - 1].body}
        </p>
      )}

      {/* Footer */}
      <div class="flex items-center justify-between mt-auto pt-2">
        <div class="flex items-center gap-2">
          {task.status === 'planning' && (
            <>
              <progress class="progress progress-secondary w-10" value={0} max={100} />
              <span class="badge badge-ghost badge-secondary badge-xs">Planning</span>
            </>
          )}
          {task.status === 'todo' && (
            <>
              <progress class="progress w-10" value={0} max={100} />
              <span class="badge badge-ghost badge-xs">To do</span>
            </>
          )}
          {task.status === 'in_progress' && (
            <>
              <progress class="progress progress-warning w-10" />
              <span class="badge badge-ghost badge-warning badge-xs">Agent working</span>
              {task.workers && task.workers.map(name => (
                <span key={name} class="badge badge-primary badge-xs">{name}</span>
              ))}
            </>
          )}
          {task.status === 'done' && (
            <>
              <progress class="progress progress-success w-10" value={100} max={100} />
              <span class="badge badge-ghost badge-success badge-xs">Done</span>
            </>
          )}
          {task.depends_on.length > 0 && (
            <div class={`flex items-center gap-1 text-xs ${task.blocked ? 'text-warning' : 'text-base-content/40'}`}>
              <ArrowDownIcon className="h-3.5 w-3.5" />
              <span>{task.depends_on.length}</span>
            </div>
          )}
          {renderMetaIndicators()}
        </div>

        {/* Task Number + Delete */}
        <div class="flex items-center gap-1">
          {taskNumber && (
            <span class="text-xs text-base-content/40">#{taskNumber}</span>
          )}
          {onDelete && (
            <button
              class="btn btn-ghost btn-xs text-error/40 hover:text-error"
              title="Delete task"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
