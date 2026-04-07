'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface SlideCaptchaProps {
  onVerified: () => void;
}

export function SlideCaptcha({ onVerified }: SlideCaptchaProps) {
  const [verified, setVerified] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const posRef = useRef(0); // ref para acesso síncrono nos touch handlers

  const THUMB_SIZE = 52; // maior para facilitar o toque
  const THRESHOLD = 0.85;

  function getTrackWidth() {
    return (trackRef.current?.offsetWidth ?? 260) - THUMB_SIZE;
  }

  // Pointer API (desktop + alguns mobile)
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (verified) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    startXRef.current = e.clientX - posRef.current;
  }, [verified]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || verified) return;
    const newPos = Math.min(Math.max(e.clientX - startXRef.current, 0), getTrackWidth());
    posRef.current = newPos;
    setPos(newPos);
  }, [dragging, verified]);

  const finish = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    const trackWidth = getTrackWidth();
    if (posRef.current >= trackWidth * THRESHOLD) {
      posRef.current = trackWidth;
      setPos(trackWidth);
      setVerified(true);
      onVerified();
    } else {
      posRef.current = 0;
      setPos(0);
    }
  }, [dragging, onVerified]);

  // Touch API nativa — necessária para preventDefault funcionar (passive: false)
  useEffect(() => {
    const thumb = thumbRef.current;
    if (!thumb) return;

    function onTouchStart(e: TouchEvent) {
      if (verified) return;
      e.preventDefault(); // impede scroll da página
      const touch = e.touches[0]!;
      setDragging(true);
      startXRef.current = touch.clientX - posRef.current;
    }

    function onTouchMove(e: TouchEvent) {
      e.preventDefault(); // impede scroll da página durante arraste
      const touch = e.touches[0]!;
      const newPos = Math.min(Math.max(touch.clientX - startXRef.current, 0), getTrackWidth());
      posRef.current = newPos;
      setPos(newPos);
    }

    function onTouchEnd() {
      setDragging(false);
      const trackWidth = getTrackWidth();
      if (posRef.current >= trackWidth * THRESHOLD) {
        posRef.current = trackWidth;
        setPos(trackWidth);
        setVerified(true);
        onVerified();
      } else {
        posRef.current = 0;
        setPos(0);
      }
    }

    // passive: false é obrigatório para preventDefault funcionar em touch events
    thumb.addEventListener('touchstart', onTouchStart, { passive: false });
    thumb.addEventListener('touchmove', onTouchMove, { passive: false });
    thumb.addEventListener('touchend', onTouchEnd);
    thumb.addEventListener('touchcancel', onTouchEnd);

    return () => {
      thumb.removeEventListener('touchstart', onTouchStart);
      thumb.removeEventListener('touchmove', onTouchMove);
      thumb.removeEventListener('touchend', onTouchEnd);
      thumb.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [verified, onVerified]);

  const progress = getTrackWidth() > 0 ? pos / getTrackWidth() : 0;

  return (
    <div
      ref={trackRef}
      className="relative h-13 w-full rounded-md border bg-muted select-none overflow-hidden"
      style={{ height: 52 }}
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

      {/* Thumb */}
      <div
        ref={thumbRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        className={[
          'absolute top-0 bottom-0 flex items-center justify-center rounded-md',
          'cursor-grab active:cursor-grabbing',
          verified
            ? 'bg-primary text-primary-foreground'
            : 'bg-background border shadow-sm text-muted-foreground hover:bg-accent',
          !dragging ? 'transition-[left] duration-200' : '',
        ].join(' ')}
        style={{
          left: pos,
          width: THUMB_SIZE,
          touchAction: 'none', // trava scroll nativo durante interação pointer
        }}
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
