#!/usr/bin/env node
// gate-record (Ensemble): roda o gate rápido da frente (+ e2e filtrado) e grava no tasks.md da change
// as linhas `<!-- commits (<frente>): ... -->` e `<!-- gate: <frente> <sha> · ... -->`.
//
//   node .ensemble/gate-record.mjs FRENTE=backend CHANGE=<id> SECTION=1 [FILTER=<suítes>] [BASE=<sha>]
//
// Lê `.ensemble/ensemble.json` (frentes, comandos). Só grava no tasks.md; nunca commita.
// Códigos: 0 verde e gravado; 1 algum passo falhou (linha vermelha gravada); 2 parâmetro, tasks.md ou seção
// ausente; 9 árvore suja (nada rodou nem foi gravado). Node >= 22, só módulos nativos.
// Derivado do gate-lib do PLATO (change optimize-agent-workflow).
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const PROJETO = resolve(AQUI, '..');
const CONFIG = JSON.parse(readFileSync(join(AQUI, 'ensemble.json'), 'utf8'));

const COMMITS_LINE = /^<!-- commits(?: \(([a-z0-9-]+)(?:, [^)]*)?\))?: ?(.*?) ?-->$/;
const BEFORE_REBASE_LINE = /^<!-- commits(?: \(([a-z0-9-]+)(?:, [^)]*)?\))? antes do rebase:/;

const params = {};
for (const arg of process.argv.slice(2)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(arg);
  if (m) params[m[1]] = m[2];
}
const get = (k) => (params[k] || process.env[k] || '').trim();
const frenteNome = get('FRENTE');
const change = get('CHANGE');
const section = get('SECTION');
const filter = get('FILTER');
const base = get('BASE');

function fail(code, msg) {
  console.error(`gate-record: ${msg}`);
  process.exit(code);
}
const USO = 'uso: node .ensemble/gate-record.mjs FRENTE=<frente> CHANGE=<id> SECTION=<n> [FILTER=...] [BASE=<sha>]';
if (!frenteNome || !change || !/^\d+$/.test(section)) fail(2, USO);
const frente = (CONFIG.frentes ?? []).find((f) => f.nome === frenteNome);
if (!frente) fail(2, `frente "${frenteNome}" não está em .ensemble/ensemble.json (${(CONFIG.frentes ?? []).map((f) => f.nome).join(', ')})`);

const dirFrente = resolve(PROJETO, frente.dir ?? '.');
const gitDir = resolve(PROJETO, frente.git ?? frente.dir ?? '.');
const git = (args, cwd = gitDir) => spawnSync('git', args, { cwd, encoding: 'utf8' });
if (git(['rev-parse', '--show-toplevel']).status !== 0) fail(2, `${gitDir} não é um repositório git`);
const subpasta = relative(gitDir, dirFrente).replace(/\\/g, '/');

const tasksPath = join(PROJETO, 'openspec', 'changes', change, 'tasks.md');
if (!existsSync(tasksPath)) fail(2, `tasks.md não encontrado: ${tasksPath}`);

const sectionRange = (lines) => {
  const head = lines.findIndex((l) => new RegExp(`^## ${section}\\.`).test(l));
  if (head < 0) return null;
  let end = lines.findIndex((l, i) => i > head && /^## /.test(l));
  if (end < 0) end = lines.length;
  return { head, end };
};
const lines = readFileSync(tasksPath, 'utf8').split('\n');
const range = sectionRange(lines);
if (!range) fail(2, `a seção ${section} não existe em ${tasksPath}`);

// Árvore suja: qualquer alteração dentro da frente (num monorepo, só a subpasta da frente conta).
const ignorar = new Set(frente.ignorarSujeira ?? []);
const sujo = git(['status', '--porcelain'])
  .stdout.split('\n')
  .filter((l) => l.trim())
  .map((l) => l.slice(3).trim())
  .filter((p) => !ignorar.has(p) && (!subpasta || p.startsWith(subpasta + '/')));
if (sujo.length) fail(9, `alteração não commitada na frente ${frenteNome}; commite antes (nada foi rodado nem gravado):\n${sujo.join('\n')}`);

const head = git(['rev-parse', '--short=7', 'HEAD']).stdout.trim();
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
const integracao = frente.integracao ?? frente.branch ?? 'main';

// Commits já registados desta frente na seção.
const mine = (rotulo) => rotulo === frenteNome || (rotulo === undefined && String(frente.secao ?? '') === section);
const parseCommits = (l) => {
  const m = COMMITS_LINE.exec(l.trim());
  return m && mine(m[1]) ? (m[2].match(/\b[0-9a-f]{7,40}\b/g) ?? []) : null;
};
const listed = lines.slice(range.head + 1, range.end).map(parseCommits).find((c) => c !== null) ?? [];
const exists = (sha) => git(['cat-file', '-e', `${sha}^{commit}`]).status === 0;
const reachable = (sha) => exists(sha) && git(['merge-base', '--is-ancestor', sha, 'HEAD']).status === 0;
const rebased = listed.length > 0 && !listed.every(reachable);

function rangeStart() {
  if (base) return base;
  if (branch !== integracao && branch !== 'HEAD') {
    const mb = git(['merge-base', integracao, 'HEAD']);
    if (mb.status === 0) return mb.stdout.trim();
  }
  if (listed.length > 0 && !rebased) return listed[listed.length - 1];
  return null;
}
const start = rangeStart();
if (!start) fail(2, 'o primeiro registro no branch de integração exige BASE=<sha> (último commit anterior a esta seção)');
if (!exists(start)) fail(2, `BASE ou ponto de partida inexistente: ${start}`);

const filtroCommits = CONFIG.commits?.filtro ?? 'co-authored-claude';
const log = git(['log', '--reverse', '--no-merges', '--format=%h%x1f%an%x1f%B%x1e', `${start}..HEAD`]).stdout;
const found = log
  .split('\x1e')
  .map((e) => e.trim())
  .filter(Boolean)
  .map((e) => { const [sha, autor, corpo = ''] = e.split('\x1f'); return { sha, autor, corpo }; })
  .filter((c) => filtroCommits !== 'co-authored-claude' || /^Co-Authored-By: Claude/im.test(c.corpo))
  .filter((c) => !(CONFIG.commits?.ignorarAutores ?? []).some((a) => c.autor.includes(a)))
  .filter((c) => {
    if (!subpasta) return true;
    const nomes = git(['show', '--name-only', '--format=', c.sha]).stdout.split('\n').filter(Boolean);
    return nomes.some((n) => n.startsWith(subpasta + '/'));
  })
  .map((c) => c.sha);
const merged = rebased ? found : [...listed.map((s) => s.slice(0, 7)), ...found.filter((s) => !listed.some((l) => l.startsWith(s)))];

// Gate: roda cada passo, grava o código real.
const stamp = new Date();
const pad = (n) => String(n).padStart(2, '0');
const date = `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}`;
const time = `${pad(stamp.getHours())}:${pad(stamp.getMinutes())}`;
const logDir = join(process.env.ENSEMBLE_HOME ?? join(homedir(), '.ensemble'), 'gate-logs', CONFIG.nome ?? 'projeto');
mkdirSync(logDir, { recursive: true });
const logFile = join(logDir, `${change}-s${section}-${frenteNome}-${head}-${date.replaceAll('-', '')}-${time.replace(':', '')}.log`);

const passos = [...(frente.gate ?? [])];
if (frente.e2e?.comando) {
  if (filter && filter !== 'none') passos.push({ rotulo: 'e2e', comando: frente.e2e.comando, env: { [frente.e2e.variavelFiltro ?? 'FILTER']: filter } });
  else passos.push({ rotulo: 'e2e', dispensado: true });
}
if (!passos.length) fail(2, `a frente ${frenteNome} não tem comandos de gate em ensemble.json`);

const resultados = passos.map((p) => {
  if (p.dispensado) return { rotulo: p.rotulo, codigo: 0, texto: `${p.rotulo} dispensado`, dispensado: true };
  const fd = openSync(logFile, 'a');
  writeFileSync(fd, `\n===== ${p.rotulo}: ${p.comando} =====\n`);
  const r = spawnSync('sh', ['-c', p.comando], { cwd: dirFrente, stdio: ['ignore', fd, fd], env: { ...process.env, ...(p.env ?? {}) }, maxBuffer: 1 << 28 });
  closeSync(fd);
  const codigo = r.status ?? 1;
  const saida = readFileSync(logFile, 'utf8');
  const parte = saida.slice(saida.lastIndexOf(`===== ${p.rotulo}:`));
  const jest = /^Tests:.*?(\d+) total/m.exec(parte);
  const vitest = /^\s*Tests\s+.*\((\d+)\)/m.exec(parte);
  const total = jest?.[1] ?? vitest?.[1];
  console.error(`gate-record: ${p.rotulo} -> ${codigo}`);
  return { rotulo: p.rotulo, codigo, texto: `${codigo}${total ? ` (${total} testes${p.env?.FILTER ? `; FILTER=${p.env.FILTER}` : ''})` : ''}` };
});

const gateLine = `<!-- gate: ${frenteNome} ${head} · ${date} ${time} · ` + resultados.map((r) => (r.dispensado ? r.texto : `${r.rotulo} ${r.texto}`)).join(' · ') + ` · log ${logFile.replace(homedir(), '~')} -->`;

// Grava no tasks.md (relido: outro agente pode ter editado a seção durante o gate).
const fresh = readFileSync(tasksPath, 'utf8').split('\n');
const fRange = sectionRange(fresh);
if (!fRange) fail(2, `a seção ${section} sumiu de ${tasksPath}`);
const isMyGate = (l) => l.trim().startsWith(`<!-- gate: ${frenteNome} `);
const isMyRebase = (l) => { const m = BEFORE_REBASE_LINE.exec(l.trim()); return Boolean(m) && mine(m[1]); };
const body = fresh.slice(fRange.head + 1, fRange.end).filter((l) => !isMyGate(l) && !isMyRebase(l));
const at = body.findIndex((l) => parseCommits(l) !== null);
const newCommits = `<!-- commits (${frenteNome}): ${merged.join(' ')} -->`;
const extra = [];
if (rebased) extra.push(`<!-- commits (${frenteNome}) antes do rebase: ${listed.join(' ')} -->`);
extra.push(gateLine);
if (at < 0) {
  let last = body.length;
  while (last > 0 && body[last - 1].trim() === '') last -= 1;
  body.splice(last, 0, newCommits, ...extra);
} else body.splice(at, 1, newCommits, ...extra);
writeFileSync(tasksPath, [...fresh.slice(0, fRange.head + 1), ...body, ...fresh.slice(fRange.end)].join('\n'));

console.error(gateLine);
process.exit(resultados.some((r) => r.codigo !== 0) ? 1 : 0);
