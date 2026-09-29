import { Children, isValidElement, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A pixel-art drop-down that stands in for the browser's <select>: same props and
 * <option> children, and onChange gets `{ target: { value } }` like the real thing.
 * It matches the dirt-and-grass HUD, and it works while the mouse is locked to the
 * game (a native drop-down can't be opened then).
 */

interface Opt {
  value: string;
  label: ReactNode;
  disabled: boolean;
}

export interface SelectProps {
  value: string | number | undefined;
  onChange: (e: { target: { value: string } }) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  title?: string;
  'aria-label'?: string;
}

function collect(children: ReactNode, out: Opt[]): Opt[] {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    const el = c as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>;
    if (el.type === 'option') {
      const text = el.props.children;
      out.push({ value: String(el.props.value ?? (typeof text === 'string' ? text : '')), label: text, disabled: !!el.props.disabled });
    } else if (el.props.children !== undefined) collect(el.props.children, out);
  });
  return out;
}

export function Select({ value, onChange, children, disabled, className, title, 'aria-label': ariaLabel }: SelectProps) {
  const options = collect(children, []);
  const current = String(value ?? '');
  const selected = options.find((o) => o.value === current) ?? options[0];
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ left: number; top: number; width: number; up: boolean; max: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const pick = (v: string) => {
    setOpen(false);
    if (v !== current) onChange({ target: { value: v } });
    button.current?.focus();
  };

  // Place the list under the button (or above it when there is no room), outside any
  // scrolling panel so it is never clipped.
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const r = button.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const up = below < 160 && above > below;
    setAt({ left: r.left, top: up ? r.top : r.bottom, width: Math.max(r.width, 140), up, max: Math.max(80, Math.min(320, up ? above : below)) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    const scroll = (e: Event) => {
      if (!list.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', away, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('scroll', scroll, true);
    return () => {
      window.removeEventListener('mousedown', away, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open]);

  const step = (dir: number) => {
    const enabled = options.filter((o) => !o.disabled);
    const i = enabled.findIndex((o) => o.value === current);
    const next = enabled[Math.max(0, Math.min(enabled.length - 1, i + dir))];
    if (next && next.value !== current) onChange({ target: { value: next.value } });
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`px-select${open ? ' open' : ''}${className ? ` ${className}` : ''}`}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          // Arrow keys change the value like a native select; they don't pan the camera.
          if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            step(e.code === 'ArrowDown' ? 1 : -1);
          }
        }}
      >
        <span className="px-select-value">{selected?.label ?? ''}</span>
        <span className="px-select-arrow" aria-hidden>
          ▾
        </span>
      </button>
      {open &&
        at &&
        createPortal(
          <div
            ref={list}
            className="px-select-list"
            role="listbox"
            aria-label={ariaLabel}
            style={{ left: at.left, width: at.width, maxHeight: at.max, ...(at.up ? { bottom: window.innerHeight - at.top } : { top: at.top }) }}
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === current}
                className={`px-select-opt${o.value === current ? ' on' : ''}`}
                disabled={o.disabled}
                onClick={() => pick(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
