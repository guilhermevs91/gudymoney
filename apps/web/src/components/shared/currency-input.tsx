'use client';

import { useRef } from 'react';
import { Input } from '@/components/ui/input';

interface CurrencyInputProps {
  value: string; // valor em string tipo "86.05"
  onChange: (value: string) => void; // retorna "86.05"
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Input de moeda com máscara automática.
 * O usuário digita apenas números (ex: 8605) e o componente
 * exibe "86,05" — sempre com 2 casas decimais implícitas.
 * O valor retornado no onChange é sempre no formato "86.05" (ponto decimal).
 */
export function CurrencyInput({ value, onChange, placeholder = '0,00', disabled, className }: CurrencyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Converte "86.05" → "8605" (apenas dígitos)
  function toRaw(val: string): string {
    return val.replace(/\D/g, '');
  }

  // Converte dígitos "8605" → "86,05" para exibição
  function toDisplay(digits: string): string {
    const n = parseInt(digits || '0', 10);
    return (n / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Converte dígitos "8605" → "86.05" para o estado
  function toFloat(digits: string): string {
    const n = parseInt(digits || '0', 10);
    return (n / 100).toFixed(2);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = toRaw(e.target.value);
    onChange(digits === '0' || digits === '' ? '' : toFloat(digits));
  }

  const displayValue = value ? toDisplay(toRaw((parseFloat(value) * 100).toFixed(0))) : '';

  return (
    <Input
      ref={inputRef}
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}
