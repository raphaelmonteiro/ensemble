// Descobre o mecânico de um projeto: frentes, git, branches, gerenciador de pacotes e comandos de gate.
// Só lê. O que não consegue inferir fica para o /ensemble:onboarding.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { existe, lerTexto } from './leitura.mjs';

const BACKEND = ['@nestjs/core', 'express', 'fastify', 'koa', 'hono', '@hapi/hapi', 'typeorm', 'prisma', '@prisma/client', 'sequelize', 'mongoose'];
const FRONTEND = ['react', 'vue', 'svelte', '@angular/core', 'next', 'nuxt', 'vite', 'solid-js', 'astro'];

function git(cwd, args) {
  try { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}

function gerenciador(dir) {
  if (existe(join(dir, 'bun.lockb')) || existe(join(dir, 'bun.lock'))) return 'bun';
  if (existe(join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existe(join(dir, 'yarn.lock'))) return 'yarn';
  if (existe(join(dir, 'package-lock.json'))) return 'npm';
  return null;
}

function lerPackage(dir) {
  const texto = lerTexto(join(dir, 'package.json'));
  if (!texto) return null;
  try { return JSON.parse(texto); } catch { return null; }
}

function classificar(pkg, nomePasta) {
  const deps = Object.keys({ ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) });
  const temBack = deps.some((d) => BACKEND.includes(d));
  const temFront = deps.some((d) => FRONTEND.includes(d));
  if (/front|web|client|app|ui/i.test(nomePasta) && temFront) return 'frontend';
  if (/back|api|server|service/i.test(nomePasta) && temBack) return 'backend';
  if (temFront && !temBack) return 'frontend';
  if (temBack) return 'backend';
  if (temFront) return 'frontend';
  return null;
}

function comandosDe(pkg, gm, dir) {
  const scripts = pkg?.scripts ?? {};
  const run = (s) => (gm === 'npm' ? `npm run ${s}` : `${gm} run ${s}`);
  const gate = [];
  const pega = (rotulo, candidatos) => { const s = candidatos.find((c) => scripts[c]); if (s) gate.push({ rotulo, comando: run(s) }); return s; };
  pega('lint', ['lint', 'eslint']);
  pega('format-check', ['format:check', 'format-check', 'prettier:check']);
  pega('typecheck', ['typecheck', 'type-check', 'tsc']);
  pega('test', ['test:unit', 'test']);
  pega('build', ['build']);
  const e2e = ['test:e2e', 'e2e', 'test:integration'].find((c) => scripts[c]);
  const makefile = lerTexto(join(dir, 'Makefile'));
  if (!gate.length && makefile) {
    for (const alvo of ['lint', 'format-check', 'typecheck', 'test', 'build']) if (new RegExp(`^${alvo}:`, 'm').test(makefile)) gate.push({ rotulo: alvo, comando: `make ${alvo}` });
  }
  return { gate, e2e: e2e ? { comando: run(e2e), variavelFiltro: 'FILTER' } : null, subir: scripts.dev ? run('dev') : scripts.start ? run('start') : null };
}

export function descobrir(raiz) {
  const nome = basename(raiz);
  const candidatos = [raiz];
  for (const e of readdirSync(raiz, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.') && !['node_modules', 'docs', 'dist', 'build', 'scripts', 'tests', 'test', 'postgres', 'openspec'].includes(e.name)) candidatos.push(join(raiz, e.name));
  }
  const gitRaiz = existe(join(raiz, '.git')) ? raiz : null;
  const frentes = [];
  const avisos = [];
  for (const dir of candidatos) {
    const pkg = lerPackage(dir);
    if (!pkg && dir !== raiz) continue;
    const gm = gerenciador(dir) ?? gerenciador(raiz) ?? (pkg ? 'npm' : null);
    const tipo = pkg ? classificar(pkg, basename(dir)) : null;
    if (!tipo) { if (pkg && dir !== raiz) avisos.push(`${relative(raiz, dir)}: package.json sem sinal de backend ou frontend; ignorado`); continue; }
    const gitDir = existe(join(dir, '.git')) ? dir : gitRaiz;
    if (!gitDir) { avisos.push(`${relative(raiz, dir) || '.'}: sem repositório git`); }
    const branch = gitDir ? git(gitDir, ['rev-parse', '--abbrev-ref', 'HEAD']) || null : null;
    const nomeFrente = tipo === 'backend' ? (frentes.some((f) => f.nome === 'backend') ? basename(dir) : 'backend') : (frentes.some((f) => f.nome === 'frontend') ? basename(dir) : 'frontend');
    const cmd = comandosDe(pkg, gm ?? 'npm', dir);
    frentes.push({
      nome: nomeFrente,
      agente: tipo === 'backend' ? 'backend-dev' : 'frontend-dev',
      dir: relative(raiz, dir) || '.',
      git: gitDir ? relative(raiz, gitDir) || '.' : null,
      branch,
      integracao: branch,
      gerenciador: gm,
      stack: Object.keys({ ...(pkg.dependencies ?? {}) }).filter((d) => BACKEND.includes(d) || FRONTEND.includes(d)).slice(0, 6),
      subir: cmd.subir,
      gate: cmd.gate,
      e2e: cmd.e2e,
    });
  }
  // Uma frente só por tipo com nome genérico: se houver só root, chama-se pelo tipo.
  const compose = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'].find((f) => existe(join(raiz, f))) ?? null;
  const documentos = ['CLAUDE.md', 'AGENTS.md', 'README.md'].filter((f) => existe(join(raiz, f))).map((f) => f);
  for (const f of frentes) for (const d of ['CLAUDE.md', 'AGENTS.md', 'README.md']) if (f.dir !== '.' && existe(join(raiz, f.dir, d))) documentos.push(`${f.dir}/${d}`);
  return { nome, frentes, compose, documentos, gitRaiz: gitRaiz ? '.' : null, avisos };
}
