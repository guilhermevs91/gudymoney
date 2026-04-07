'use client';

import { useRef, useState, useCallback } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface SlideCaptchaProps {
  onVerified: () => void;
}

export function SlideCaptcha({ onVerified }: SlideCaptchaProps) {
  const [verified, setVerified] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);

  const THUMB_SIZE = 44;
  const THRESHOLD = 0.85; // 85% do track = verificado

  function getTrackWidth() {
    return (trackRef.current?.offsetWidth ?? 240) - THUMB_SIZE;
  }

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (verified) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    startXRef.current = e.clientX - pos;
  }, [verified, pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || verified) return;
    const newPos = Math.min(Math.max(e.clientX - startXRef.current, 0), getTrackWidth());
    setPos(newPos);
  }, [dragging, verified]);

  const onPointerUp = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    const trackWidth = getTrackWidth();
    if (pos >= trackWidth * THRESHOLD) {
      setPos(trackWidth);
      setVerified(true);
      onVerified();
    } else {
      // Volta para o início com animação
      setPos(0);
    }
  }, [dragging, pos, onVerified]);

  const progress = getTrackWidth() > 0 ? pos / getTrackWidth() : 0;

  return (
    <div
      ref={trackRef}
      className="relative h-11 w-full rounded-md border bg-muted select-none overflow-hidden"
    >
      {/* Faixa de progresso */}
      <div
        className="absolute inset-y-0 left-0 bg-primary/20 transition-none"
        style={{ width: pos + THUMB_SIZE }}
      />

      {/* Texto centralizado */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {verified ? (
          <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
            <CheckCircle2 className="h-4 w-4" />
            Verificado
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">
            {dragging && progress > 0.4 ? 'Solte para confirmar' : 'Arraste para verificar →'}
          </span>
        )}
      </div>

      {/* Thumb (botão deslizante) */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`absolute top-0 bottom-0 flex items-center justify-center cursor-grab active:cursor-grabbing rounded-md transition-colors
          ${verified ? 'bg-primary text-primary-foreground' : 'bg-background border shadow-sm text-muted-foreground hover:bg-accent'}
          ${!dragging ? 'transition-[left] duration-200' : ''}
        `}
        style={{ left: pos, width: THUMB_SIZE }}
      >
        {verified ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <span className="text-lg select-none">››</span>
        )}
      </div>
    </div>
  );
}
