'use client';

import { useState, useEffect } from 'react';
import { X, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChangelogEntry {
  version: string;
  date: string;
  sections: {
    label: string;
    items: string[];
  }[];
}

const SECTION_STYLES: Record<string, { label: string; className: string }> = {
  Adicionado: { label: 'Adicionado', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  Alterado:   { label: 'Alterado',   className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  Corrigido:  { label: 'Corrigido',  className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  Removido:   { label: 'Removido',   className: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

function parseChangelog(raw: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];

  // Quebra por seções de versão: ## [x.y.z] - YYYY-MM-DD
  const versionBlocks = raw.split(/\n(?=## \[)/);

  for (const block of versionBlocks) {
    const headerMatch = block.match(/^## \[([^\]]+)\]\s*-\s*(\d{4}-\d{2}-\d{2})/);
    if (!headerMatch) continue;

    const version = headerMatch[1];
    const date = headerMatch[2];
    const sections: ChangelogEntry['sections'] = [];

    // Quebra pelas sub-seções ### Adicionado / Corrigido / etc.
    const sectionBlocks = block.split(/\n(?=### )/);
    for (const sec of sectionBlocks) {
      const secMatch = sec.match(/^### (.+)/);
      if (!secMatch) continue;

      const label = secMatch[1].trim();
      const items = sec
        .split('\n')
        .filter((l) => l.startsWith('- '))
        .map((l) => l.replace(/^- /, '').trim());

      if (items.length > 0) {
        sections.push({ label, items });
      }
    }

    if (sections.length > 0) {
      entries.push({ version, date, sections });
    }
  }

  return entries;
}

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  currentVersion: string;
}

export function ChangelogModal({ open, onClose, currentVersion }: Props) {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    fetch('/changelog.txt')
      .then((r) => r.text())
      .then((text) => {
        const parsed = parseChangelog(text);
        setEntries(parsed.slice(0, 3));
      })
      .catch(() => setEntries([]));
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Novidades — v{currentVersion}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Carregando changelog…
            </p>
          )}

          {entries.map((entry, i) => (
            <div key={entry.version}>
              {/* Version heading */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  v{entry.version}
                </span>
                <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
                {i === 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 ml-auto">
                    atual
                  </span>
                )}
              </div>

              {/* Sections */}
              <div className="space-y-3">
                {entry.sections.map((sec) => {
                  const style = SECTION_STYLES[sec.label] ?? {
                    label: sec.label,
                    className: 'bg-muted text-muted-foreground border-border',
                  };
                  return (
                    <div key={sec.label}>
                      <span
                        className={cn(
                          'inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border mb-1.5',
                          style.className,
                        )}
                      >
                        {style.label}
                      </span>
                      <ul className="space-y-1">
                        {sec.items.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {i < entries.length - 1 && <div className="mt-5 border-t" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}