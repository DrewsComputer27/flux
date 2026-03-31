import { useDroppable } from '@dnd-kit/core'
import { ComponentChildren } from 'preact'

interface DroppableColumnProps {
  id: string
  children: ComponentChildren
  isEmpty?: boolean
}

export function DroppableColumn({ id, children, isEmpty = false }: DroppableColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
  })

  return (
    <div
      ref={setNodeRef}
      class={`rounded-xl p-3 min-h-32 transition-all ${
        isOver
          ? 'bg-primary/10 ring-2 ring-primary/50'
          : isEmpty
          ? 'bg-base-200/50 border-2 border-dashed border-base-300'
          : 'bg-base-200/50'
      }`}
    >
      {isEmpty ? (
        <div class="h-full min-h-24 flex items-center justify-center">
          <span class="text-base-content/40 text-sm">No tasks</span>
        </div>
      ) : (
        <div class="space-y-3 max-h-[60vh] overflow-y-auto column-scroll pr-1">
          {children}
        </div>
      )}
    </div>
  )
}
