// Junta tudo num só estado para o cliente. Tudo inferido de ficheiros e git; nada é escrito.
import { lerAgentes, LIGACOES } from './agentes.mjs';
import { lerChanges } from './changes.mjs';
import { lerConfig } from './config.mjs';
import { lerFrente } from './git.mjs';
import { minutosDesde } from './leitura.mjs';
import { lerAmbiente, lerDecisoes, lerDivida, lerOndas, lerPerguntas, padroesDeRevisao } from './memoria.mjs';

const A_TRABALHAR_MIN = 20;
const TERMINOU_MIN = 120;

function statusPorMinutos(min) {
  if (min === null) return 'parado';
  if (min <= A_TRABALHAR_MIN) return 'trabalhando';
  if (min <= TERMINOU_MIN) return 'terminou';
  return 'parado';
}

function proximaTask(secao) {
  const feitas = new Set(secao.tasks.filter((t) => t.feita).map((t) => t.id));
  return secao.tasks.find((t) => !t.feita && t.dependeDe.every((d) => feitas.has(d))) ?? secao.tasks.find((t) => !t.feita) ?? null;
}

function secoesDoAgente(changes, agente) {
  const lista = [];
  for (const c of changes.ativas) for (const s of c.tasks.secoes) if (s.agente === agente && s.tasks.length) lista.push({ change: c, secao: s });
  return lista;
}

/** Seções com trabalho real: change aprovada e (commits registados ou tasks marcadas). */
function temProgresso({ change, secao }) {
  return change.tasks.aprovada && (secao.commits.length > 0 || secao.tasks.some((t) => t.feita));
}

function fraseDev(changes, agente, repo) {
  const commitsRepo = repo?.commits ?? [];
  const candidatas = secoesDoAgente(changes, agente).filter(({ change }) => change.tasks.aprovada);
  const emCurso = candidatas.filter(({ secao }) => secao.tasks.some((t) => !t.feita));
  const ultimo = commitsRepo[0] ?? null;
  const cita = ({ change }) => ultimo && (ultimo.assunto + ' ' + ultimo.refs.join(' ')).includes(change.id);
  const porMtime = (a, b) => (b.change.mtimes.tasks ?? 0) - (a.change.mtimes.tasks ?? 0);
  const temOCommit = ({ secao }) => ultimo && secao.commits.some((sha) => ultimo.sha.startsWith(sha));
  const comProgresso = candidatas.filter(temProgresso).sort(porMtime);
  const proxima = emCurso.sort(porMtime)[0] ?? null;
  const alvo = candidatas.find(cita) ?? candidatas.find(temOCommit) ?? comProgresso.find((x) => emCurso.includes(x)) ?? comProgresso[0] ?? proxima;
  const base = { branch: repo?.branch ?? null, worktrees: repo?.worktrees?.length ?? 0 };
  if (!alvo) return { ...base, change: null, texto: ultimo ? `Último commit: ${ultimo.assunto}` : 'Sem seção em curso.', task: null, progresso: null };
  const t = proximaTask(alvo.secao);
  const feitas = alvo.secao.tasks.filter((x) => x.feita).length;
  const estadoChange = alvo.change.estado;
  let texto;
  if (t) texto = `${t.id} ${t.texto}`;
  else if (/mudanças/.test(estadoChange)) texto = `Seção completa; a aplicar os achados da revisão (${alvo.change.revisao.ultima?.achados.filter((a) => /bloqueante/.test(a.severidade)).map((a) => a.id).join(', ') || 'sem bloqueantes'}).`;
  else texto = `Seção completa (${feitas}/${alvo.secao.tasks.length}); change ${estadoChange}.${proxima && proxima !== alvo ? ` Próxima na fila: ${proxima.change.id}.` : ''}`;
  return {
    ...base,
    change: alvo.change.id,
    secao: `${alvo.secao.numero}. ${alvo.secao.nome}`,
    task: t?.id ?? null,
    texto,
    progresso: { feitas, total: alvo.secao.tasks.length },
    gate: alvo.secao.gate ? alvo.secao.gate.split('·').slice(0, 2).join('·').trim() : null,
    commits: alvo.secao.commits.length,
  };
}

function inferirAgentes({ agentes, changes, repos, ambiente, perguntas, config }) {
  const resultado = {};
  const ativas = changes.ativas;
  const maisRecente = (lista, chave) => lista.reduce((acc, c) => (c.mtimes[chave] && (!acc || c.mtimes[chave] > acc.mtimes[chave]) ? c : acc), null);
  const repoDoAgente = (agente) => config.frentes.filter((f) => f.agente === agente).map((f) => repos[f.nome]).filter(Boolean)[0] ?? null;

  for (const nome of Object.keys(agentes)) {
    let minutos = null;
    let frase = { texto: '', change: null };
    const repo = repoDoAgente(nome);
    if (repo) {
      const ultimo = repo.commits[0];
      minutos = ultimo ? minutosDesde(Date.parse(ultimo.data)) : null;
      frase = fraseDev(changes, nome, repo);
    } else if (nome === 'code-reviewer') {
      const c = maisRecente(ativas, 'revisao');
      minutos = c ? minutosDesde(c.mtimes.revisao) : null;
      const u = c?.revisao.ultima;
      frase = { change: c?.id ?? null, texto: u ? `Rodada ${u.numero} · ${u.resultado ?? 'sem resultado'} · ${u.achados.length} achado(s)` : 'Sem revisão em curso.' };
    } else if (nome === 'qa') {
      const c = maisRecente(ativas, 'qa');
      minutos = c ? minutosDesde(c.mtimes.qa) : null;
      frase = { change: c?.id ?? null, texto: c?.qa ? `QA · ${c.qa.resultado ?? 'em curso'}` : 'Sem QA em curso (changes só de backend não têm QA).' };
    } else if (nome === 'product-owner') {
      const c = ativas.reduce((acc, x) => { const m = Math.max(x.mtimes.proposal ?? 0, x.mtimes.tasks ?? 0); return m > (acc?.m ?? 0) ? { c: x, m } : acc; }, null);
      minutos = c ? minutosDesde(c.m) : null;
      const aguardam = ativas.filter((x) => x.tasks.aguardaAprovacao).length;
      frase = { change: c?.c.id ?? null, texto: aguardam ? `${aguardam} proposta(s) à espera de aprovação; última mexida em ${c?.c.id}` : c ? `Última mexida: ${c.c.id} (${c.c.estado})` : 'Sem change ativa. Próximo passo: pedir ao tech-lead a primeira change.' };
    } else if (nome === 'devops') {
      minutos = minutosDesde(ambiente.mtime);
      const infra = secoesDoAgente(changes, 'devops').filter(({ change, secao }) => change.tasks.aprovada && secao.tasks.some((t) => !t.feita));
      frase = infra.length ? { change: infra[0].change.id, texto: `${infra[0].secao.numero}. Infra: ${proximaTask(infra[0].secao)?.texto ?? ''}` } : { change: null, texto: `Ambiente: ${ambiente.fatos.length} fatos, ${ambiente.achados.length} achados em aberto.` };
    } else if (nome === 'tech-lead') {
      frase = { change: null, texto: 'Orquestra a equipa. Fala com ele no Claude Code.' };
    }
    resultado[nome] = { ...agentes[nome], minutos, status: statusPorMinutos(minutos), ...frase };
  }
  const esperaVoce = ativas.filter((c) => c.tasks.aguardaAprovacao);
  const perguntasAbertas = perguntas.filter((p) => p.estado === 'aberta');
  if (resultado['tech-lead']) {
    const alguemTrabalha = Object.values(resultado).some((a) => a.nome !== 'tech-lead' && a.status === 'trabalhando');
    const tl = resultado['tech-lead'];
    tl.status = esperaVoce.length || perguntasAbertas.length ? 'esperando-voce' : alguemTrabalha ? 'trabalhando' : 'parado';
    const partes = [];
    if (esperaVoce.length) { const ids = esperaVoce.map((c) => c.id); partes.push(`${ids.length} proposta(s) para aprovar (${ids.slice(0, 2).join(', ')}${ids.length > 2 ? `, +${ids.length - 2}` : ''})`); }
    if (perguntasAbertas.length) partes.push(`${perguntasAbertas.length} pergunta(s) em aberto (${perguntasAbertas.slice(0, 2).map((p) => p.id).join(', ')})`);
    if (partes.length) tl.texto = `À tua espera: ${partes.join('; ')}.`;
    else if (!ativas.length && !config.legado) tl.texto = 'Sem changes ainda. Começa por `/ensemble:onboarding` e depois pede a primeira change.';
    const mins = Object.values(resultado).map((a) => a.minutos ?? Infinity).filter(Number.isFinite);
    tl.minutos = mins.length ? Math.min(...mins) : null;
  }
  return resultado;
}

function encontrarChange(changes, commit) {
  const texto = `${commit.assunto} ${commit.refs.join(' ')}`;
  const todas = [...changes.ativas, ...changes.arquivadas];
  const explicita = todas.filter((c) => texto.includes(c.id)).sort((a, b) => b.id.length - a.id.length)[0];
  if (explicita) return explicita;
  for (const c of changes.ativas) for (const s of c.tasks.secoes) if (s.commits.some((sha) => commit.sha.startsWith(sha))) return c;
  return null;
}

function porque(change, commit) {
  const motivos = [];
  const declarado = /^Porqu[eê]:\s*(.+)$/im.exec(commit.corpo);
  if (declarado) motivos.push({ tipo: 'declarado', id: 'pelo agente', texto: declarado[1].trim() });
  if (!change) return motivos;
  const refsR = [...commit.assunto.matchAll(/\b(R\d+)\b/g)].map((m) => m[1]);
  const refsPV = [...commit.assunto.matchAll(/\b(PV-\d+)\b/g)].map((m) => m[1]);
  const refsTask = [...commit.assunto.matchAll(/\b(\d\.\d{1,2})\b/g)].map((m) => m[1]);
  for (const id of refsR) {
    for (const r of change.revisao.rodadas) {
      const a = r.achados.find((x) => x.id === id);
      if (a) { motivos.push({ tipo: 'revisão', id: `${id} · ${a.severidade}`, texto: a.texto || a.local }); break; }
    }
  }
  for (const id of refsPV) {
    const p = change.provisorias.find((x) => x.id === id);
    if (p) motivos.push({ tipo: 'provisória', id, texto: p.texto });
  }
  for (const id of refsTask) {
    for (const s of change.tasks.secoes) {
      const t = s.tasks.find((x) => x.id === id);
      if (t) { motivos.push({ tipo: 'task', id: `${id} (${s.agente})`, texto: t.texto }); break; }
    }
  }
  return motivos;
}

function narrativas(changes, repos) {
  const vistos = new Set();
  const todos = Object.values(repos).flatMap((r) => r.commits).filter((c) => (vistos.has(c.sha) ? false : vistos.add(c.sha)))
    .sort((a, b) => Date.parse(b.data) - Date.parse(a.data)).slice(0, 25);
  return todos.map((c) => {
    const change = encontrarChange(changes, c);
    return {
      repo: c.frente,
      agente: c.agente,
      sha: c.shaCurto,
      shaCompleto: c.sha,
      data: c.data,
      minutos: minutosDesde(Date.parse(c.data)),
      oQue: c.assunto,
      corpo: c.corpo,
      ficheiros: c.ficheiros,
      adicoes: c.adicoes,
      remocoes: c.remocoes,
      change: change?.id ?? null,
      changeArquivada: change?.arquivada ?? false,
      porque: porque(change, c),
      refs: c.refs.filter((r) => !r.startsWith('HEAD')),
    };
  });
}

function decisoes(changes, registos, perguntas, docs) {
  const abertas = changes.ativas.filter((c) => c.tasks.aguardaAprovacao).map((c) => ({ tipo: 'tua', id: c.id, texto: c.tasks.cabecalho[0] ?? 'Proposta aguardando aprovação.', ficheiro: `${c.pasta}/tasks.md` }));
  const perguntasAbertas = perguntas.filter((p) => p.estado === 'aberta').map((p) => ({ tipo: 'pergunta', id: p.id, texto: `${p.titulo}${p.pergunta ? ' — ' + p.pergunta : ''}${p.recomendacao ? ' · Recomendação: ' + p.recomendacao : ''}`, ficheiro: docs.perguntas }));
  const bloqueios = [];
  for (const c of changes.ativas) {
    const u = c.revisao.ultima;
    if (u && /MUDANÇAS/.test(u.resultado ?? '')) {
      const bloq = u.achados.filter((a) => /bloqueante/.test(a.severidade));
      bloqueios.push({ tipo: 'revisão', id: c.id, texto: `Rodada ${u.numero}: ${bloq.length} bloqueante(s) de ${u.achados.length} achado(s) · ${bloq.map((a) => `${a.id} → ${a.responsavel}`).join(', ') || 'só correções menores'}`, ficheiro: `${c.pasta}/review-report.md` });
    }
  }
  const provisorias = [];
  for (const c of changes.ativas) for (const p of c.provisorias.slice(0, 3)) provisorias.push({ tipo: 'provisória', id: `${p.id} · ${c.id}`, texto: p.texto, ficheiro: `${c.pasta}/design.md` });
  return { abertas, perguntas: perguntasAbertas, bloqueios, provisorias, registos: registos.registos.slice(-6).reverse(), atualizacao: registos.atualizacao };
}

export function montarEstado(raiz) {
  const config = lerConfig(raiz);
  const docs = config.docs;
  const agentes = lerAgentes(raiz);
  const changes = lerChanges(raiz);
  const repos = {};
  for (const f of config.frentes) repos[f.nome] = lerFrente(raiz, f);
  const ambiente = lerAmbiente(raiz, docs);
  const registos = lerDecisoes(raiz, docs);
  const divida = lerDivida(raiz, docs);
  const ondas = lerOndas(raiz, docs);
  const perguntas = lerPerguntas(raiz, docs);
  const padroes = padroesDeRevisao(changes);
  const inferidos = inferirAgentes({ agentes, changes, repos, ambiente, perguntas, config });

  // Em curso para a regra "2 backends + 2 frontends": change aprovada, com progresso nessa seção, ainda não integrada.
  const emCurso = (agente) => changes.ativas.filter((c) => c.estado !== 'pronta para integrar' && c.tasks.secoes.some((s) => s.agente === agente && s.tasks.length && temProgresso({ change: c, secao: s }))).length;
  const paralelo = {};
  for (const f of config.frentes) paralelo[f.nome] = { emCurso: emCurso(f.agente), limite: config.paralelo[f.nome] ?? 2 };

  return {
    geradoEm: new Date().toISOString(),
    raiz,
    projeto: config.nome,
    legado: config.legado,
    docs,
    agentes: inferidos,
    ligacoes: LIGACOES,
    frentes: config.frentes.map((f) => ({ nome: f.nome, agente: f.agente, dir: f.dir, branch: repos[f.nome]?.branch ?? f.branch ?? null, worktrees: repos[f.nome]?.worktrees ?? [] })),
    changes: {
      ativas: changes.ativas.map((c) => ({ id: c.id, titulo: c.titulo, estado: c.estado, pasta: c.pasta, feitas: c.tasks.feitas, total: c.tasks.total, aprovada: c.tasks.aprovada, aguardaAprovacao: c.tasks.aguardaAprovacao, secoes: c.tasks.secoes.map((s) => ({ numero: s.numero, nome: s.nome, agente: s.agente, feitas: s.tasks.filter((t) => t.feita).length, total: s.tasks.length, commits: s.commits.length, gate: Boolean(s.gate), semTarefas: s.semTarefas })), revisao: c.revisao.ultima ? { rodada: c.revisao.ultima.numero, resultado: c.revisao.ultima.resultado } : null, qa: c.qa?.resultado ?? null })),
      arquivadas: changes.arquivadas.length,
      ultimasArquivadas: changes.arquivadas.slice(-5).reverse().map((c) => ({ id: c.id, data: c.dataArquivo })),
    },
    paralelo,
    narrativas: narrativas(changes, repos),
    decisoes: decisoes(changes, registos, perguntas, docs),
    memoria: {
      fatos: ambiente.fatos,
      achados: ambiente.achados,
      divida: divida.slice(-8).reverse(),
      totalDivida: divida.length,
      padroes,
      ondas,
    },
  };
}
