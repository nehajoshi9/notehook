import React from 'react';
import { Tag, CheckSquare, Square, Zap, FileText, MessageSquare } from 'lucide-react';

export const PASTEL_COLORS = {
  todo: '#dcfce7',       // Pastel Green
  decision: '#ffe1baff',   // Pastel Light Orange
  entity: '#e4d3fd',     // Pastel Purple
  note: '#fee2e2',       // Pastel Red
  message: '#e0f2fe',    // Pastel Blue for message pages
} as const;

export const TYPE_ICON_COLORS = {
  entity: 'text-purple-600',
  decision: 'text-orange-500',
  todo: 'text-emerald-600',
  note: 'text-red-600',
  message: 'text-sky-600',
} as const;

export const BRAND_COLORS = {
  logo: 'text-blue-800',
  logoHover: 'group-hover:text-blue-900',
  logoHex: '#1E40AF',
} as const;

export function getPastelColorForType(type: 'todo' | 'decision' | 'entity' | 'note' | 'message' | string): string {
  if (type === 'todo' || type === 'todo_board') return PASTEL_COLORS.todo;
  if (type === 'decision' || type === 'decision_log') return PASTEL_COLORS.decision;
  if (type === 'entity' || type === 'entity_index') return PASTEL_COLORS.entity;
  if (type === 'note' || type === 'note_index') return PASTEL_COLORS.note;
  if (type === 'message') return PASTEL_COLORS.message;
  return PASTEL_COLORS.message;
}

/**
 * Returns fixed pastel color based on item type or title fallback:
 * - Todos: Pastel Green (#dcfce7)
 * - Decisions: Pastel Light Orange (#ffe1baff)
 * - Entities: Pastel Purple (#e4d3fd)
 * - Notes: Pastel Red (#fee2e2)
 * - Messages: Pastel Blue (#e0f2fe)
 */
export function getPastelColorForTitle(title: string, type?: string): string {
  if (type) return getPastelColorForType(type);
  const clean = title.trim().toLowerCase();
  if (clean.startsWith('todo:') || clean.startsWith('@todo')) return PASTEL_COLORS.todo;
  if (clean.startsWith('decision:') || clean.startsWith('@decision')) return PASTEL_COLORS.decision;
  if (clean.startsWith('note:') || clean.startsWith('@note')) return PASTEL_COLORS.note;
  return PASTEL_COLORS.message;
}

export function getPlasticPillStyle(colorHex: string): React.CSSProperties {
  return {
    backgroundColor: colorHex,
    boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.65), 0 1px 2px rgba(0,0,0,0.05)',
    color: '#0f172a',
    border: '1px solid rgba(0,0,0,0.08)',
  };
}

export function PageTypeIcon({
  type,
  className = 'h-3.5 w-3.5 shrink-0',
  done,
}: {
  type: string;
  className?: string;
  done?: boolean;
}) {
  const baseType = type.replace(/(_index|_log|_board)$/, '');
  if (baseType === 'entity') {
    return <Tag className={`${className} ${TYPE_ICON_COLORS.entity}`} />;
  }
  if (baseType === 'decision') {
    return <Zap className={`${className} ${TYPE_ICON_COLORS.decision}`} />;
  }
  if (baseType === 'todo') {
    return done ? (
      <CheckSquare className={`${className} ${TYPE_ICON_COLORS.todo}`} />
    ) : (
      <Square className={`${className} ${TYPE_ICON_COLORS.todo}`} />
    );
  }
  if (baseType === 'note') {
    return <FileText className={`${className} ${TYPE_ICON_COLORS.note}`} />;
  }
  return <MessageSquare className={`${className} ${TYPE_ICON_COLORS.message}`} />;
}
