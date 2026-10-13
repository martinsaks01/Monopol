/* Egne temaer som er importert som JSON lagres i nettleseren. */
import type { Theme } from '../game/types';
import { validateTheme } from '../game/engine';
import { BUILT_IN_THEMES } from './index';

const KEY = 'monopol.customThemes.v1';

export function customThemes(): Theme[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function allThemes(): (Theme & { builtIn?: boolean })[] {
  return [...BUILT_IN_THEMES.map((t) => ({ ...t, builtIn: true })), ...customThemes()];
}

export function importTheme(text: string): Theme {
  const t = JSON.parse(text) as Theme;
  const errors = validateTheme(t);
  if (errors.length) throw new Error(errors.join('\n'));
  t.id = t.id || `tema-${Date.now()}`;
  t.name = t.name || 'Importert tema';
  const list = customThemes().filter((x) => x.id !== t.id);
  list.push(t);
  localStorage.setItem(KEY, JSON.stringify(list));
  return t;
}

export function deleteTheme(id: string) {
  localStorage.setItem(KEY, JSON.stringify(customThemes().filter((t) => t.id !== id)));
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
}

export function pickTextFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.readAsText(f);
    };
    input.click();
  });
}
