// Leitura de ficheiros: só leitura, nunca escreve no plato.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function lerTexto(caminho) {
  try {
    return readFileSync(caminho, 'utf8');
  } catch {
    return null;
  }
}

export function mtime(caminho) {
  try {
    return statSync(caminho).mtimeMs;
  } catch {
    return null;
  }
}

export function existe(caminho) {
  return existsSync(caminho);
}

export function listarPastas(caminho) {
  try {
    return readdirSync(caminho, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export function listarFicheiros(caminho, sufixo = '') {
  try {
    return readdirSync(caminho, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(sufixo))
      .map((e) => join(caminho, e.name))
      .sort();
  } catch {
    return [];
  }
}

/** Frontmatter YAML simples (chave: valor por linha). */
export function lerFrontmatter(texto) {
  if (!texto || !texto.startsWith('---')) return { meta: {}, corpo: texto ?? '' };
  const fim = texto.indexOf('\n---', 3);
  if (fim < 0) return { meta: {}, corpo: texto };
  const bloco = texto.slice(3, fim).trim();
  const meta = {};
  for (const linha of bloco.split('\n')) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(linha);
    if (m) meta[m[1]] = m[2].trim();
  }
  return { meta, corpo: texto.slice(fim + 4) };
}

export function minutosDesde(ms) {
  if (ms === null || ms === undefined) return null;
  return Math.round((Date.now() - ms) / 60000);
}
