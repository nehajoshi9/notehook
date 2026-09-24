import React from 'react';

export const PASTEL_COLORS = {
  todo: '#dcfce7',       // Pastel Green
  decision: '#fef08a',   // Pastel Yellow
  entity: '#e4d3fd',     // Pastel Purple
  note: '#fee2e2',       // Pastel Red
  message: '#e0f2fe',    // Pastel Blue for message pages
} as const;

export function getPastelColorForType(type: 'todo' | 'decision' | 'entity' | 'note' | 'message' | string): string {
  if (type === 'todo') return PASTEL_COLORS.todo;
  if (type === 'decision') return PASTEL_COLORS.decision;
  if (type === 'entity') return PASTEL_COLORS.entity;
  if (type === 'note') return PASTEL_COLORS.note;
  if (type === 'message') return PASTEL_COLORS.message;
  return PASTEL_COLORS.message;
}

/**
 * Returns fixed pastel color based on item type or title fallback:
 * - Todos: Pastel Green (#dcfce7)
 * - Decisions: Pastel Yellow (#fef08a)
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
