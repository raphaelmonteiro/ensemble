/* Ensemble — cliente. Só lê /api/estado e desenha. */
const $ = (id) => document.getElementById(id);
let estado = null;
let agenteSelecionado = null;
let mostrarTodasAbertas = false;

const POSICOES = {
  'tech-lead': { x: 150, y: 4 },
  manager: { x: 150, y: 66, grupo: ['product-owner', 'devops'] },
  'backend-dev': { x: 56, y: 150 },
  'frontend-dev': { x: 150, y: 150 },
  qa: { x: 244, y: 150 },
  'code-reviewer': { x: 150, y: 206 },
};
const LINHAS = [
  [150, 30, 150, 66], [130, 96, 56, 150], [150, 96, 150, 150], [170, 96, 244, 150],
  [56, 176, 110, 208], [150, 176, 150, 206], [244, 176, 190, 208],
];

function h(tag, atributos = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) el.setAttribute(k, v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined) el.append(f.nodeType ? f : document.createTextNode(String(f)));
  return el;
}

function tempo(min) {
  if (min === null || min === undefined) return '—';
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  if (min < 60 * 24) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} d`;
}
function statusTexto(s) {
  return { trabalhando: 'a trabalhar', 'esperando-voce': 'à tua espera', terminou: 'terminou', parado: 'parado' }[s] ?? s;
}
function corStatus(s) {
  return { trabalhando: 'var(--laranja)', 'esperando-voce': 'var(--azul)', terminou: 'var(--verde)', parado: 'var(--cinza)' }[s] ?? 'var(--cinza)';
}

/* ---------- Topo ---------- */
function desenharTopo() {
  $('raiz').textContent = `${estado.projeto} · ${estado.raiz.replace(/^\/Users\/[^/]+/, '~')}`;
  const ativas = estado.changes.ativas;
  const emCurso = ativas.filter((c) => ['em andamento', 'mudanças pedidas', 'revisão aprovada', 'implementada', 'pronta para integrar'].includes(c.estado));
  const fila = ativas.length - emCurso.length;
  const cont = $('changes-ativas');
  cont.replaceChildren(
    h('span', { class: 'rot' }, 'changes'),
    ...emCurso.slice(0, 4).map((c) => h('span', { class: 'chip', title: c.estado }, h('i', { class: 'ponto', style: `background:${c.estado === 'mudanças pedidas' ? 'var(--laranja)' : c.estado === 'pronta para integrar' ? 'var(--verde)' : 'var(--ciano)'}` }), c.id)),
    fila > 0 ? h('span', { class: 'chip fila' }, `+${fila} na fila`) : null,
  );
  const ag = Object.values(estado.agentes);
  const p = estado.paralelo;
  const nomes = Object.keys(p);
  $('resumo').replaceChildren(
    h('span', {}, h('span', { style: 'color:var(--laranja)' }, '● '), `${ag.filter((a) => a.status === 'trabalhando').length} a trabalhar`),
    h('span', {}, h('span', { style: 'color:var(--azul)' }, '● '), `${ag.filter((a) => a.status === 'esperando-voce').length} à tua espera`),
    nomes.length ? h('span', { class: 'mono' }, `${nomes.map((n) => `${p[n].emCurso} ${n}`).join(' + ')} de ${nomes.map((n) => p[n].limite).join(' + ')}`) : null,
    h('span', { class: 'mono' }, `${estado.changes.arquivadas} arquivadas`),
  );
}

/* ---------- Mapa ---------- */
function no(a, extra = '') {
  const cls = ['no', a.status, extra, agenteSelecionado === a.nome ? 'selecionado' : ''].join(' ');
  return h('button', { type: 'button', class: cls, onclick: () => selecionar(a.nome), title: `${a.nome} · ${statusTexto(a.status)} · ${tempo(a.minutos)}` }, h('i', { class: `ponto ${a.status}` }), a.rotulo ?? a.nome);
}
function desenharMapa() {
  const ag = estado.agentes;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '300'); svg.setAttribute('height', '236'); svg.setAttribute('viewBox', '0 0 300 236'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<defs><marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#4B5567"/></marker></defs>` +
    LINHAS.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#4B5567" stroke-width="1.5" marker-end="url(#arr)"/>`).join('');
  const nos = [];
  for (const [nome, pos] of Object.entries(POSICOES)) {
    if (pos.grupo) {
      const g = h('div', { class: 'grupo', style: `left:${pos.x}px; top:${pos.y}px; height:30px` }, h('span', { class: 'rot' }, 'manager'), ...pos.grupo.filter((n) => ag[n]).map((n) => no(ag[n], 'pequeno')));
      nos.push(g);
    } else if (ag[nome]) {
      const el = no(ag[nome]);
      el.style.left = `${pos.x}px`; el.style.top = `${pos.y}px`;
      nos.push(el);
    }
  }
  for (const nome of Object.keys(ag)) if (!POSICOES[nome] && !Object.values(POSICOES).some((p) => p.grupo?.includes(nome))) nos.push(no(ag[nome]));
  $('mapa').replaceChildren(svg, ...nos);
}

/* ---------- Agentes ---------- */
function desenharAgentes() {
  const ordem = ['backend-dev', 'frontend-dev', 'code-reviewer', 'product-owner', 'qa', 'devops', 'tech-lead'];
  const lista = ordem.filter((n) => estado.agentes[n]).map((n) => estado.agentes[n]);
  const ativos = lista.filter((a) => a.status !== 'parado');
  const parados = lista.filter((a) => a.status === 'parado');
  const cartao = (a) => {
    const cls = `agente ${a.status} ${agenteSelecionado === a.nome ? 'selecionado' : ''}`;
    const filhos = [
      h('div', { class: 'linha' },
        h('i', { class: `ponto ${a.status}` }),
        h('span', { class: 'nome' }, a.nome),
        a.modelo ? h('span', { class: `tag ${a.modelo}` }, a.modelo) : null,
        a.change ? h('span', { class: `tag change ${a.nome === 'frontend-dev' ? 'frontend' : ''}` }, a.change + (a.task ? ` · ${a.task}` : '')) : null,
        h('span', { class: 'tempo' }, `${statusTexto(a.status)} · ${tempo(a.minutos)}`)),
      h('div', { class: 'frase' }, a.texto),
    ];
    if (a.progresso) {
      const b = h('div', { class: 'barra' });
      for (let i = 0; i < a.progresso.total; i += 1) b.append(h('i', { class: i < a.progresso.feitas ? 'feita' : i === a.progresso.feitas ? 'atual' : '' }));
      filhos.push(b);
      filhos.push(h('div', { class: 'sub' }, `${a.secao} · ${a.progresso.feitas}/${a.progresso.total} · ${a.commits} commit(s) registado(s)${a.gate ? ' · gate ' + a.gate : ''}${a.branch ? ' · ' + a.branch : ''}`));
    }
    return h('div', { class: cls, onclick: () => selecionar(a.nome) }, ...filhos);
  };
  $('agentes').replaceChildren(
    ...ativos.map(cartao),
    parados.length ? h('div', { class: 'sub', style: 'padding:2px 4px' }, parados.map((a) => `${a.nome} · parado`).join('   ')) : null,
  );
}

function selecionar(nome) {
  agenteSelecionado = agenteSelecionado === nome ? null : nome;
  desenharMapa(); desenharAgentes(); desenharNarrativas();
}

/* ---------- Narrativas ---------- */
function desenharNarrativas() {
  const filtro = agenteSelecionado && estado.frentes.some((f) => f.agente === agenteSelecionado) ? agenteSelecionado : null;
  $('filtro-narrativas').textContent = filtro ? `só ${filtro}` : 'todos os agentes';
  const lista = estado.narrativas.filter((n) => !filtro || n.agente === filtro).slice(0, 14);
  if (!lista.length) return $('narrativas').replaceChildren(h('div', { class: 'vazio' }, estado.frentes.length ? 'Sem commits recentes nas frentes.' : 'Nenhuma frente configurada em .ensemble/ensemble.json.'));
  $('narrativas').replaceChildren(...lista.map((n) => {
    const corta = (t, n = 240) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t);
    const corpoUtil = (n.corpo || '').split('\n').map((l) => l.trim()).filter((l) => l && !/^(Co-Authored-By|Claude-Session|Signed-off-by):/i.test(l))[0];
    const porque = n.porque.length
      ? n.porque.map((p) => h('div', { class: 'porque', title: p.texto }, h('b', {}, `Porquê (${p.tipo} ${p.id}): `), corta(p.texto)))
      : [h('div', { class: 'porque', style: 'color:var(--fraco)' }, corpoUtil ? corta(corpoUtil) : 'Sem referência a task, achado ou PV no commit; a razão fica só no diff.')];
    return h('div', { class: `narrativa ${n.agente === 'frontend-dev' ? 'frontend' : 'backend'}` },
      h('i', { class: 'ponto', style: `margin-top:6px;background:${n.agente === 'frontend-dev' ? 'var(--ciano)' : 'var(--verde)'}` }),
      h('div', { class: 'meio' },
        h('div', { class: 'cab' }, h('span', { class: 'nome' }, n.agente), n.change ? h('span', { class: `tag change ${n.repo}` }, n.change + (n.changeArquivada ? ' · arquivada' : '')) : null, h('span', { class: 'quando' }, `há ${tempo(n.minutos)}`)),
        h('div', { class: 'oque' }, n.oQue),
        ...porque,
        h('div', { class: 'pe' },
          h('button', { type: 'button', onclick: () => abrirCommit(n) }, `ver diff · ${n.ficheiros} ficheiro(s) · +${n.adicoes} −${n.remocoes}`),
          h('span', { class: 'mono' }, n.sha),
          n.refs.length ? h('span', {}, n.refs.slice(0, 2).join(', ')) : null)));
  }));
}

/* ---------- Decisões ---------- */
function desenharDecisoes() {
  const d = estado.decisoes;
  const itens = [];
  const tua = (x) => h('div', { class: 'item tua' }, h('span', { class: 'id' }, 'tua'), h('div', { class: 'texto' }, h('b', {}, x.id), ' ', x.texto.slice(0, 180), h('span', { class: 'sub' }, h('button', { class: 'abrir', type: 'button', onclick: () => abrirFicheiro(x.ficheiro) }, 'abrir tasks.md'))));
  for (const x of d.abertas.slice(0, mostrarTodasAbertas ? undefined : 3)) itens.push(tua(x));
  if (d.abertas.length > 3) itens.push(h('button', { class: 'abrir', type: 'button', style: 'text-align:left; padding:2px 4px; background:none; border:none; color:#9DB7E8; font-size:12px', onclick: () => { mostrarTodasAbertas = !mostrarTodasAbertas; desenharDecisoes(); } }, mostrarTodasAbertas ? 'mostrar menos' : `+${d.abertas.length - 3} propostas à espera da tua aprovação`));
  for (const x of d.perguntas ?? []) itens.push(h('div', { class: 'item tua' }, h('span', { class: 'id' }, x.id), h('div', { class: 'texto' }, x.texto.slice(0, 260), h('span', { class: 'sub' }, h('button', { class: 'abrir', type: 'button', onclick: () => abrirFicheiro(x.ficheiro) }, 'abrir perguntas-abertas.md')))));
  for (const x of d.bloqueios) itens.push(h('div', { class: 'item' }, h('span', { class: 'id', style: 'color:var(--vermelho)' }, 'revisão'), h('div', { class: 'texto' }, h('b', {}, x.id), ' ', x.texto, h('span', { class: 'sub' }, h('button', { class: 'abrir', type: 'button', onclick: () => abrirFicheiro(x.ficheiro) }, 'abrir review-report.md')))));
  for (const x of d.provisorias.slice(0, 4)) itens.push(h('div', { class: 'item' }, h('span', { class: 'id pv' }, x.id.split(' · ')[0]), h('div', { class: 'texto' }, x.texto.slice(0, 200), h('span', { class: 'sub' }, x.id.split(' · ')[1], ' · PO decide em lote no fim da seção'))));
  if (!itens.length) itens.push(h('div', { class: 'vazio' }, 'Nenhuma decisão em aberto.'));
  itens.push(h('div', { class: 'sec-titulo' }, `Últimos registos (${(estado.docs.decisoes || '').split('/').pop()})`));
  for (const r of d.registos.slice(0, 4)) itens.push(h('div', { class: 'item' }, h('span', { class: 'id' }, r.id), h('div', { class: 'texto' }, r.texto.slice(0, 160))));
  $('decisoes').replaceChildren(...itens);
}

/* ---------- Memória ---------- */
function desenharMemoria() {
  const m = estado.memoria;
  const itens = [];
  if (m.padroes.top.length) {
    const t = m.padroes.top[0];
    itens.push(h('div', { class: 'bloco' }, h('span', { class: 'rot' }, `padrão recorrente · ${m.padroes.total} achados de revisão`), h('span', {}, `"${t.categoria}" é ${t.pct}% dos achados (${t.n}). `, m.padroes.top.slice(1, 3).map((x) => `${x.categoria} ${x.pct}%`).join(' · ')),
      ...Object.entries(m.padroes.porAgente).filter(([n]) => /dev$/.test(n)).map(([n, v]) => h('span', { class: 'sub' }, `${n}: mais apontado por "${v.categoria}" (${v.n} de ${v.total}) → vale lembrar antes de codar.`))));
  }
  for (const a of m.achados.slice(0, 3)) itens.push(h('div', { class: 'bloco' }, h('span', { class: 'rot' }, `ambiente · achado · ${a.data} · ${a.agente}`), h('span', {}, a.titulo), a.contorno ? h('span', { class: 'sub' }, 'Contorno: ', a.contorno.slice(0, 160)) : null));
  for (const f of m.fatos.slice(-3).reverse()) itens.push(h('div', { class: 'bloco' }, h('span', { class: 'rot' }, 'ambiente · fato confirmado'), h('span', {}, f.slice(0, 220))));
  for (const o of m.ondas.slice(-1)) itens.push(h('div', { class: 'bloco' }, h('span', { class: 'rot' }, `onda · ${o.titulo}`), h('span', {}, o.resumo ?? 'Relatório da onda.'), ...o.licoes.slice(0, 2).map((l) => h('span', { class: 'sub' }, '· ', l.slice(0, 160)))));
  for (const d of m.divida.slice(0, 3)) itens.push(h('div', { class: 'bloco' }, h('span', { class: 'rot' }, `dívida · ${d.id} · ${d.modulo}`), h('span', {}, d.descricao.slice(0, 180)), h('span', { class: 'sub' }, `${d.change} · ${d.responsavel ?? '—'}`)));
  if (!itens.length) itens.push(h('div', { class: 'vazio' }, 'Ainda vazia: enche-se com os fatos do ambiente, achados de revisão, dívida e relatórios de onda.'));
  itens.push(h('div', { class: 'sub', style: 'padding:2px 4px' }, `${m.fatos.length} fatos · ${m.achados.length} achados · ${m.totalDivida} itens de dívida · ${m.ondas.length} onda(s)`));
  $('memoria').replaceChildren(...itens);
}

/* ---------- Gaveta ---------- */
async function abrirTexto(titulo, url) {
  $('gaveta-titulo').textContent = titulo;
  $('gaveta-corpo').textContent = 'a carregar…';
  $('gaveta').hidden = false;
  try {
    const r = await fetch(url);
    $('gaveta-corpo').textContent = r.ok ? await r.text() : `Erro ${r.status}`;
  } catch (e) { $('gaveta-corpo').textContent = String(e); }
}
const abrirCommit = (n) => abrirTexto(`${n.repo} · ${n.sha}`, `/api/commit?repo=${n.repo}&sha=${n.shaCompleto}`);
const abrirFicheiro = (caminho) => abrirTexto(caminho, `/api/ficheiro?caminho=${encodeURIComponent(caminho)}`);
$('gaveta-fechar').addEventListener('click', () => { $('gaveta').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('gaveta').hidden = true; });

/* ---------- Ciclo ---------- */
function desenharTudo() {
  if (estado.erro) { $('narrativas').replaceChildren(h('pre', { class: 'vazio' }, estado.erro)); return; }
  desenharTopo(); desenharMapa(); desenharAgentes(); desenharNarrativas(); desenharDecisoes(); desenharMemoria();
  $('gerado').textContent = `lido às ${new Date(estado.geradoEm).toLocaleTimeString('pt-PT')}`;
}
async function carregar() {
  try {
    const r = await fetch('/api/estado');
    estado = await r.json();
    desenharTudo();
  } catch (e) {
    $('estado-ligacao').textContent = `sem servidor: ${e.message}`;
    $('estado-ligacao').className = 'desligado';
  }
}
function ligarEventos() {
  const es = new EventSource('/api/eventos');
  es.addEventListener('ola', () => { $('estado-ligacao').textContent = 'ao vivo'; $('estado-ligacao').className = 'ligado'; });
  es.addEventListener('mudou', carregar);
  es.onerror = () => { $('estado-ligacao').textContent = 'a religar…'; $('estado-ligacao').className = 'desligado'; };
}
carregar();
ligarEventos();
setInterval(carregar, 30000);
