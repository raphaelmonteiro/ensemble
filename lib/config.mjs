// Configuração de um projeto: `.ensemble/ensemble.json` ou, sem ele, o layout legado do PLATO.
import { join } from 'node:path';
import { existe, lerTexto } from './leitura.mjs';

export const DOCS_ENSEMBLE = {
  projeto: 'docs/ensemble/projeto.md',
  ambiente: 'docs/ensemble/ambiente.md',
  divida: 'docs/ensemble/divida-tecnica.md',
  decisoes: 'docs/ensemble/decisoes.md',
  perguntas: 'docs/ensemble/perguntas-abertas.md',
  ondas: 'docs/ensemble/ondas',
};

const DOCS_PLATO = {
  projeto: 'CLAUDE.md',
  ambiente: 'docs/ambiente.md',
  divida: 'docs/divida-tecnica.md',
  decisoes: 'docs/resumos/decisoes-e-respostas-consolidadas.md',
  perguntas: null,
  ondas: 'docs/resumos/ondas',
};

function legadoPlato(raiz) {
  const frentes = [];
  if (existe(join(raiz, 'backend', '.git'))) frentes.push({ nome: 'backend', agente: 'backend-dev', secao: 1, dir: 'backend', git: 'backend', branch: 'v2', integracao: 'v2' });
  if (existe(join(raiz, 'frontend', '.git'))) frentes.push({ nome: 'frontend', agente: 'frontend-dev', secao: 2, dir: 'frontend', git: 'frontend', branch: 'integration', integracao: 'integration' });
  return { nome: 'plato', legado: true, frentes, docs: DOCS_PLATO, paralelo: { backend: 2, frontend: 2 } };
}

export function lerConfig(raiz) {
  const texto = lerTexto(join(raiz, '.ensemble', 'ensemble.json'));
  if (!texto) return legadoPlato(raiz);
  const cfg = JSON.parse(texto);
  return {
    legado: false,
    nome: cfg.nome ?? 'projeto',
    frentes: (cfg.frentes ?? []).map((f) => ({ secao: f.agente === 'frontend-dev' ? 2 : f.agente === 'devops' ? 0 : 1, ...f, git: f.git ?? f.dir ?? '.', dir: f.dir ?? '.' })),
    docs: { ...DOCS_ENSEMBLE, ...(cfg.docs ?? {}) },
    paralelo: cfg.paralelo ?? { backend: 2, frontend: 2 },
  };
}
