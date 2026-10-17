// Git só leitura: log, worktrees, show --stat. Nunca muda nada nos repositórios.
import { execFileSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';
import { existe } from './leitura.mjs';

const SEP = '\u001f';
const FIM = '\u001e';

function git(repo, args) {
  try {
    return execFileSync('git', ['-C', repo, '--no-pager', ...args], { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

/**
 * Lê o git de uma frente. Num monorepo (git da raiz, frente numa subpasta) só ficam os commits
 * que tocam a subpasta da frente.
 */
export function lerFrente(raiz, frente, limite = 60) {
  const gitDir = resolve(raiz, frente.git ?? frente.dir ?? '.');
  const dirFrente = resolve(raiz, frente.dir ?? '.');
  const subpasta = relative(gitDir, dirFrente).replace(/\\/g, '/');
  if (!existe(join(gitDir, '.git'))) return { nome: frente.nome, existe: false, commits: [], worktrees: [], branch: null };
  const branch = git(gitDir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim() || null;
  const worktrees = [];
  let atual = null;
  for (const linha of git(gitDir, ['worktree', 'list', '--porcelain']).split('\n')) {
    if (linha.startsWith('worktree ')) { atual = { caminho: linha.slice(9), branch: null }; worktrees.push(atual); }
    else if (atual && linha.startsWith('branch ')) atual.branch = linha.slice(7).replace('refs/heads/', '');
  }
  // FIM no início: cada bloco = cabeçalho + corpo + numstat do mesmo commit.
  const formato = FIM + ['%H', '%h', '%aI', '%an', '%D', '%s', '%b'].join(SEP);
  const bruto = git(gitDir, ['log', '--all', `-n${limite}`, '--date=iso-strict', `--format=${formato}`, '--numstat']);
  const commits = [];
  for (const bloco of bruto.split(FIM)) {
    const texto = bloco.trim();
    if (!texto) continue;
    const partes = texto.split(SEP);
    if (partes.length < 7) continue;
    const corpoENumstat = partes.slice(6).join(SEP);
    const linhas = corpoENumstat.split('\n');
    const ficheiros = [];
    const corpo = [];
    for (const l of linhas) {
      const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(l);
      if (m) ficheiros.push({ adicoes: m[1] === '-' ? 0 : Number(m[1]), remocoes: m[2] === '-' ? 0 : Number(m[2]), caminho: m[3] });
      else corpo.push(l);
    }
    if (subpasta && !ficheiros.some((f) => f.caminho.startsWith(subpasta + '/'))) continue;
    commits.push({
      frente: frente.nome,
      agente: frente.agente,
      sha: partes[0],
      shaCurto: partes[1],
      data: partes[2],
      autor: partes[3],
      refs: partes[4].split(',').map((r) => r.trim()).filter(Boolean),
      assunto: partes[5],
      corpo: corpo.join('\n').trim(),
      ficheiros: ficheiros.length,
      adicoes: ficheiros.reduce((s, f) => s + f.adicoes, 0),
      remocoes: ficheiros.reduce((s, f) => s + f.remocoes, 0),
    });
  }
  return { nome: frente.nome, existe: true, branch, worktrees, commits, gitDir };
}

/** `git show --stat` de um commit (só leitura), para o detalhe no cliente. */
export function mostrarCommit(raiz, config, nomeFrente, sha) {
  if (!/^[0-9a-f]{6,40}$/i.test(sha)) return null;
  const frente = config.frentes.find((f) => f.nome === nomeFrente);
  if (!frente) return null;
  const gitDir = resolve(raiz, frente.git ?? frente.dir ?? '.');
  if (!existe(join(gitDir, '.git'))) return null;
  return git(gitDir, ['show', '--stat=100', '--format=%H%n%an · %aI%n%s%n%n%b', sha]) || null;
}
