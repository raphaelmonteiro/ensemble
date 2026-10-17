// Lê openspec/changes/<id>/{tasks,review-report,qa-report,design,proposal}.md.
import { join } from 'node:path';
import { lerTexto, listarPastas, mtime } from './leitura.mjs';

const SECAO = /^## (\d)\.\s+([^(]+?)\s*(?:\(([^)]+)\))?\s*$/;
const TASK = /^- \[( |x|X)\]\s+(\d+\.\d+)\s+(.*)$/;
const COMENTARIO = /<!--\s*([a-z0-9 çãé]+?)(?:\s*\(([^)]+)\))?:\s*([\s\S]*?)-->/g;
const RODADA = /^## Rodada\s+(\d+)([^\n]*)$/;
const ACHADO = /^- (R\d+)\s*·\s*([^·]+?)\s*·\s*categoria:\s*([^·]+?)\s*·\s*severidade:\s*([^·]+?)\s*·\s*responsável:\s*([^·\n]+?)(?:\s*·\s*(.*))?$/;

function lerTasks(texto) {
  const resultado = { cabecalho: [], secoes: [], aguardaAprovacao: false, aprovada: false, total: 0, feitas: 0 };
  if (!texto) return resultado;
  const linhas = texto.split('\n');
  let secao = null;
  for (const linha of linhas) {
    if (linha.startsWith('> ')) {
      resultado.cabecalho.push(linha.slice(2).replace(/\*\*/g, '').trim());
      continue;
    }
    const s = SECAO.exec(linha);
    if (s) {
      secao = { numero: Number(s[1]), nome: s[2].trim(), agente: (s[3] ?? '').trim(), tasks: [], commits: [], repo: null, gate: null, aplicados: null, e2e: null, semTarefas: false, texto: '' };
      resultado.secoes.push(secao);
      continue;
    }
    if (!secao) continue;
    secao.texto += linha + '\n';
    const t = TASK.exec(linha);
    if (t) {
      const feita = t[1].toLowerCase() === 'x';
      const dep = /<!--\s*depende de:\s*([^>]*?)\s*-->/.exec(t[3]);
      secao.tasks.push({
        id: t[2],
        feita,
        texto: t[3].replace(/<!--[\s\S]*?-->/g, '').trim(),
        dependeDe: dep ? dep[1].split(/[,\s]+/).filter(Boolean) : [],
      });
      resultado.total += 1;
      if (feita) resultado.feitas += 1;
    }
    if (/^Sem tarefas nesta seção/i.test(linha.trim())) secao.semTarefas = true;
  }
  for (const s of resultado.secoes) {
    for (const m of s.texto.matchAll(COMENTARIO)) {
      const chave = m[1].trim();
      const valor = m[3].trim();
      if (chave === 'commits') {
        s.repo = m[2] ?? null;
        s.commits = valor.split(/\s+/).filter((x) => /^[0-9a-f]{6,40}$/i.test(x));
      } else if (chave === 'gate') s.gate = valor;
      else if (chave === 'aplicados') s.aplicados = valor;
      else if (chave === 'e2e') s.e2e = valor;
    }
    if (!s.repo) s.repo = s.numero === 1 ? 'backend' : s.numero === 2 ? 'frontend' : null;
  }
  const cab = resultado.cabecalho.join(' ');
  resultado.aguardaAprovacao = /aguardando aprovação/i.test(cab);
  resultado.aprovada = /\bAPROVADA\b/.test(cab);
  resultado.dispensada = /Revisão de código dispensada/i.test(cab);
  return resultado;
}

function lerRevisao(texto) {
  const rodadas = [];
  if (!texto) return { rodadas, ultima: null };
  let atual = null;
  for (const linha of texto.split('\n')) {
    const r = RODADA.exec(linha);
    if (r) {
      atual = { numero: Number(r[1]), titulo: r[2].replace(/^\s*[—-]\s*/, '').trim(), resultado: null, achados: [] };
      rodadas.push(atual);
      continue;
    }
    if (!atual) continue;
    const res = /^Resultado:\s*(.+)$/.exec(linha.trim());
    if (res && !atual.resultado) atual.resultado = res[1].trim();
    const a = ACHADO.exec(linha);
    if (a) atual.achados.push({ id: a[1], local: a[2].trim(), categoria: a[3].trim(), severidade: a[4].trim(), responsavel: a[5].trim(), contexto: (a[6] ?? '').trim(), texto: '' });
    else if (atual.achados.length && /^\s{2,}\S/.test(linha) && !linha.trim().startsWith('-')) {
      const ultimo = atual.achados[atual.achados.length - 1];
      if (!ultimo.texto) ultimo.texto = linha.trim();
    }
  }
  return { rodadas, ultima: rodadas[rodadas.length - 1] ?? null };
}

function lerQa(texto) {
  if (!texto) return null;
  const primeira = texto.split('\n')[0] ?? '';
  const res = /Resultado:\s*(.+)$/.exec(primeira);
  return { titulo: primeira.replace(/^#\s*/, ''), resultado: res ? res[1].trim() : null };
}

function lerProvisorias(design) {
  if (!design) return [];
  const itens = [];
  const vistos = new Set();
  for (const linha of design.split('\n')) {
    const m = /(PV-\d+)/.exec(linha);
    if (!m || vistos.has(m[1])) continue;
    const limpa = linha.replace(/^[\s\-*>#]+/, '').trim();
    if (limpa.length < 20) continue;
    vistos.add(m[1]);
    itens.push({ id: m[1], texto: limpa.slice(0, 260) });
  }
  return itens;
}

function lerProposal(texto) {
  if (!texto) return { titulo: null };
  const t = /^#\s+(.+)$/m.exec(texto);
  return { titulo: t ? t[1].trim() : null };
}

function lerChange(raiz, pasta, arquivada) {
  const base = join(raiz, 'openspec', 'changes', arquivada ? 'archive' : '', pasta);
  const ler = (nome) => lerTexto(join(base, nome));
  const tasks = lerTasks(ler('tasks.md'));
  const revisao = lerRevisao(ler('review-report.md'));
  const qa = lerQa(ler('qa-report.md'));
  const id = arquivada ? pasta.replace(/^\d{4}-\d{2}-\d{2}-/, '') : pasta;
  return {
    id,
    pasta: `openspec/changes/${arquivada ? 'archive/' : ''}${pasta}`,
    arquivada,
    dataArquivo: arquivada ? (/^(\d{4}-\d{2}-\d{2})/.exec(pasta)?.[1] ?? null) : null,
    titulo: lerProposal(ler('proposal.md')).titulo,
    tasks,
    revisao,
    qa,
    provisorias: lerProvisorias(ler('design.md')),
    mtimes: {
      tasks: mtime(join(base, 'tasks.md')),
      revisao: mtime(join(base, 'review-report.md')),
      qa: mtime(join(base, 'qa-report.md')),
      design: mtime(join(base, 'design.md')),
      proposal: mtime(join(base, 'proposal.md')),
    },
    estado: null,
  };
}

function derivarEstado(c) {
  if (c.arquivada) return 'arquivada';
  if (c.tasks.aguardaAprovacao) return 'aguarda aprovação';
  if (c.qa?.resultado && /APROVADO/.test(c.qa.resultado)) return 'pronta para integrar';
  if (c.revisao.ultima?.resultado && /APROVADO/.test(c.revisao.ultima.resultado) && c.tasks.feitas === c.tasks.total && c.tasks.total > 0) return 'revisão aprovada';
  if (c.revisao.ultima?.resultado && /MUDANÇAS/.test(c.revisao.ultima.resultado)) return 'mudanças pedidas';
  if (c.tasks.feitas > 0 && c.tasks.feitas < c.tasks.total) return 'em andamento';
  if (c.tasks.total > 0 && c.tasks.feitas === c.tasks.total) return 'implementada';
  if (c.tasks.aprovada) return 'aprovada, sem commits';
  return 'na fila';
}

export function lerChanges(raiz) {
  const pastaAtivas = join(raiz, 'openspec', 'changes');
  const ativas = listarPastas(pastaAtivas).filter((p) => p !== 'archive').map((p) => lerChange(raiz, p, false));
  const arquivadas = listarPastas(join(pastaAtivas, 'archive')).map((p) => lerChange(raiz, p, true));
  for (const c of [...ativas, ...arquivadas]) c.estado = derivarEstado(c);
  return { ativas, arquivadas };
}
