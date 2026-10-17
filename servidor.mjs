#!/usr/bin/env node
// Ensemble — painel ao vivo da equipa de agentes do PLATO.
// Só lê o workspace do plato (openspec, docs, .claude/agents, git). Nunca escreve lá.
//
//   node servidor.mjs                  → http://127.0.0.1:4321 (plato em ../plato)
//   PLATO=/outro/caminho PORTA=5000 node servidor.mjs

import { createServer } from 'node:http';
import { readFileSync, watch, existsSync, realpathSync } from 'node:fs';
import { dirname, extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerConfig } from './lib/config.mjs';
import { montarEstado } from './lib/estado.mjs';
import { mostrarCommit } from './lib/git.mjs';
import { lerTexto } from './lib/leitura.mjs';

export function iniciarPainel({ raiz, porta = Number(process.env.PORTA ?? 4321) }) {
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = realpathSync(resolve(raiz));
const PORTA = porta;
const HOST = '127.0.0.1';
const CLIENTE = join(AQUI, 'cliente');

if (!existsSync(join(RAIZ, 'openspec'))) {
  console.error(`Não encontro openspec/ em ${RAIZ}. Corre \`ensemble install ${RAIZ}\` primeiro ou indica outro projeto.`);
  process.exit(1);
}
const CONFIG = lerConfig(RAIZ);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };

// Cache curto do estado (ler tudo custa alguns ms; o git é o mais lento).
let cache = { em: 0, estado: null };
function estado() {
  if (Date.now() - cache.em > 2000 || !cache.estado) {
    try {
      cache = { em: Date.now(), estado: montarEstado(RAIZ) };
    } catch (erro) {
      cache = { em: Date.now(), estado: { erro: String(erro?.stack ?? erro), geradoEm: new Date().toISOString() } };
    }
  }
  return cache.estado;
}

// Clientes ligados por SSE; avisamos quando algo muda nas fontes.
const ouvintes = new Set();
let temporizador = null;
function avisar(motivo) {
  cache.em = 0;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    for (const res of ouvintes) res.write(`event: mudou\ndata: ${JSON.stringify({ motivo, em: Date.now() })}\n\n`);
  }, 400);
}

function observar(caminho, rotulo) {
  if (!existsSync(caminho)) return;
  try {
    watch(caminho, { recursive: true }, (_evento, nome) => {
      if (nome && /(^|\/)(node_modules|\.git\/objects|\.git\/logs|dist)(\/|$)/.test(nome)) return;
      avisar(`${rotulo}: ${nome ?? ''}`);
    });
  } catch (erro) {
    console.warn(`Sem observação em ${caminho}: ${erro.message}`);
  }
}
observar(join(RAIZ, 'openspec', 'changes'), 'openspec');
observar(join(RAIZ, 'docs'), 'docs');
observar(join(RAIZ, '.claude', 'agents'), 'agentes');
const gits = [...new Set(CONFIG.frentes.map((f) => resolve(RAIZ, f.git ?? f.dir ?? '.')))];
for (const g of gits) {
  const rotulo = g === RAIZ ? 'git' : g.slice(RAIZ.length + 1);
  observar(join(g, '.git', 'refs'), `${rotulo}/refs`);
  observar(join(g, '.git', 'worktrees'), `${rotulo}/worktrees`);
  // Refs empacotadas (packed-refs) e HEAD mudam sem passar por refs/.
  for (const f of ['HEAD', 'packed-refs']) if (existsSync(join(g, '.git', f))) { try { watch(join(g, '.git', f), () => avisar(`${rotulo}/${f}`)); } catch { /* ignorar */ } }
}
// Rede de segurança: um aviso a cada 60 s, mesmo sem evento.
setInterval(() => avisar('relógio'), 60000);

function json(res, corpo, codigo = 200) {
  res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

function ficheiroDoPlato(res, relativo) {
  // Só ficheiros .md dentro do plato, sem sair da raiz.
  const limpo = normalize(relativo).replace(/^(\.\.(\/|\\|$))+/, '');
  const caminho = resolve(RAIZ, limpo);
  if (!caminho.startsWith(RAIZ + '/') || !caminho.endsWith('.md')) return json(res, { erro: 'caminho recusado' }, 400);
  const texto = lerTexto(caminho);
  if (texto === null) return json(res, { erro: 'não encontrado' }, 404);
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  res.end(texto);
}

const servidor = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}`);
  if (req.method !== 'GET') return json(res, { erro: 'só leitura' }, 405);

  if (url.pathname === '/api/estado') return json(res, estado());
  if (url.pathname === '/api/commit') {
    const texto = mostrarCommit(RAIZ, CONFIG, url.searchParams.get('repo') ?? '', url.searchParams.get('sha') ?? '');
    if (!texto) return json(res, { erro: 'commit não encontrado' }, 404);
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(texto);
  }
  if (url.pathname === '/api/ficheiro') return ficheiroDoPlato(res, url.searchParams.get('caminho') ?? '');
  if (url.pathname === '/api/eventos') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(`event: ola\ndata: ${Date.now()}\n\n`);
    ouvintes.add(res);
    req.on('close', () => ouvintes.delete(res));
    return undefined;
  }

  // Ficheiros estáticos do cliente.
  const nome = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const caminho = resolve(CLIENTE, nome);
  if (!caminho.startsWith(CLIENTE + '/') || !existsSync(caminho)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('não encontrado');
  }
  res.writeHead(200, { 'content-type': MIME[extname(caminho)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  return res.end(readFileSync(caminho));
});

servidor.listen(PORTA, HOST, () => {
  console.log(`Ensemble · ${CONFIG.nome}${CONFIG.legado ? ' (layout legado, sem .ensemble/ensemble.json)' : ''} · a ler ${RAIZ}`);
  console.log(`Abre http://${HOST}:${PORTA}  (só leitura; Ctrl+C para parar)`);
});
return servidor;
}

// Execução direta: `node servidor.mjs [projeto]` (padrão: PLATO ou ../plato, por compatibilidade).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const AQUI = dirname(fileURLToPath(import.meta.url));
  iniciarPainel({ raiz: process.argv[2] ?? process.env.PLATO ?? join(AQUI, '..', 'plato') });
}
