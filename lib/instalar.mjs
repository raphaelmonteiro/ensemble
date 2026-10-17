// `ensemble install <projeto>`: põe o kernel no projeto. Nunca sobrescreve o que o projeto já tem,
// salvo com --force; preserva o bloco de contexto dos agentes ao atualizar o método.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { descobrir } from './descoberta.mjs';
import { existe, lerTexto } from './leitura.mjs';

const KERNEL = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'kernel');
const CONTEXTO = /<!-- ensemble:contexto:inicio -->[\s\S]*?<!-- ensemble:contexto:fim -->/;

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function escrever(caminho, conteudo, { force, relatorio, mantido }) {
  if (existe(caminho) && !force) { relatorio.mantidos.push(mantido ?? caminho); return false; }
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
  relatorio.escritos.push(caminho);
  return true;
}

/** Atualiza o método de um agente preservando o bloco de contexto já preenchido. */
function instalarAgente(origem, destino, { force, relatorio }) {
  const novo = lerTexto(origem);
  const atual = lerTexto(destino);
  if (atual && !force) {
    const bloco = CONTEXTO.exec(atual)?.[0];
    const ensemble = /ensemble:contexto/.test(atual);
    if (!ensemble) { relatorio.mantidos.push(`${destino} (agente próprio do projeto, não é do Ensemble; use --force para substituir)`); return; }
    const atualizado = bloco ? novo.replace(CONTEXTO, bloco) : novo;
    if (atualizado !== atual) { writeFileSync(destino, atualizado); relatorio.escritos.push(`${destino} (método atualizado, contexto preservado)`); }
    else relatorio.inalterados.push(destino);
    return;
  }
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, novo);
  relatorio.escritos.push(destino);
}

function montarConfig(desc, raiz) {
  return {
    nome: desc.nome,
    raiz,
    criadoEm: hoje(),
    frentes: desc.frentes.map((f) => ({
      nome: f.nome, agente: f.agente, dir: f.dir, git: f.git, branch: f.branch, integracao: f.integracao,
      gerenciador: f.gerenciador, subir: f.subir, gate: f.gate, e2e: f.e2e, ignorarSujeira: [],
    })),
    paralelo: Object.fromEntries(desc.frentes.map((f) => [f.nome, 2])),
    commits: { filtro: 'co-authored-claude', ignorarAutores: [] },
    docs: {},
    compose: desc.compose,
    documentos: desc.documentos,
  };
}

function preencherProjeto(modelo, desc) {
  const linhaFrente = (f) => `| ${f.nome} | ${f.agente} | \`${f.dir}\` | \`${f.git ?? '—'}\` | \`${f.branch ?? '?'}\` | \`${f.integracao ?? '?'}\` | <!-- preencher --> |`;
  const linhaCmd = (f) => `| ${f.nome} | ${f.subir ? `\`${f.subir}\`` : '<!-- preencher -->'} | ${f.gate.length ? f.gate.map((g) => `\`${g.comando}\``).join(' → ') : '<!-- preencher -->'} | ${f.gate.find((g) => g.rotulo === 'test') ? `\`${f.gate.find((g) => g.rotulo === 'test').comando}\`` : '<!-- preencher -->'} | ${f.e2e ? `\`${f.e2e.comando}\`` : '<!-- preencher -->'} |`;
  const stack = desc.frentes.map((f) => `- **${f.nome}** (\`${f.dir}\`): ${f.stack.length ? f.stack.join(', ') : 'sem manifesto reconhecido'}${f.gerenciador ? ` · ${f.gerenciador}` : ''}`).join('\n');
  return modelo
    .replaceAll('{{NOME}}', desc.nome)
    .replaceAll('{{DATA}}', hoje())
    .replace('{{FRENTES}}', desc.frentes.map(linhaFrente).join('\n') || '| <!-- preencher --> | | | | | | |')
    .replace('{{COMANDOS}}', desc.frentes.map(linhaCmd).join('\n') || '| <!-- preencher --> | | | | |')
    .replace('{{STACK}}', stack || '<!-- preencher -->');
}

function openspecInit(raiz, relatorio) {
  if (existe(join(raiz, 'openspec'))) { relatorio.mantidos.push('openspec/ (já existia)'); return; }
  const tem = spawnSync('sh', ['-c', 'command -v openspec'], { encoding: 'utf8' }).status === 0;
  if (!tem) { relatorio.avisos.push('CLI do OpenSpec não encontrado: instala com `npm i -g @fission-ai/openspec` e corre `openspec init --tools claude` na pasta do projeto.'); return; }
  const r = spawnSync('openspec', ['init', '--tools', 'claude', '--no-animation', '--language', 'pt-BR'], { cwd: raiz, encoding: 'utf8', input: '\n' });
  if (r.status === 0 && existe(join(raiz, 'openspec'))) relatorio.escritos.push('openspec/ + .claude/commands/opsx + .claude/skills/openspec-* (openspec init)');
  else relatorio.avisos.push(`openspec init falhou (código ${r.status}): ${(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ')}. Corre à mão: cd ${raiz} && openspec init --tools claude`);
}

export function instalar(raizIn, { force = false, semOpenspec = false } = {}) {
  const raiz = resolve(raizIn);
  if (!existe(raiz)) throw new Error(`pasta não existe: ${raiz}`);
  const relatorio = { escritos: [], mantidos: [], inalterados: [], avisos: [] };
  const desc = descobrir(raiz);
  relatorio.avisos.push(...desc.avisos);
  if (!desc.frentes.length) relatorio.avisos.push('nenhuma frente reconhecida (sem package.json com backend/frontend); o onboarding terá de preencher .ensemble/ensemble.json à mão');

  // 1. Agentes
  for (const f of readdirSync(join(KERNEL, 'agentes'))) instalarAgente(join(KERNEL, 'agentes', f), join(raiz, '.claude', 'agents', f), { force, relatorio });

  // 2. Comandos
  for (const f of readdirSync(join(KERNEL, 'comandos', 'ensemble'))) escrever(join(raiz, '.claude', 'commands', 'ensemble', f), lerTexto(join(KERNEL, 'comandos', 'ensemble', f)), { force: true, relatorio });

  // 3. Docs
  const docs = join(raiz, 'docs', 'ensemble');
  escrever(join(docs, 'projeto.md'), preencherProjeto(lerTexto(join(KERNEL, 'docs', 'projeto.md')), desc), { force, relatorio });
  for (const f of ['ambiente.md', 'divida-tecnica.md', 'decisoes.md', 'perguntas-abertas.md']) {
    escrever(join(docs, f), lerTexto(join(KERNEL, 'docs', f)).replaceAll('{{NOME}}', desc.nome).replaceAll('{{DATA}}', hoje()), { force, relatorio });
  }
  escrever(join(docs, 'ondas', 'README.md'), lerTexto(join(KERNEL, 'docs', 'ondas', 'README.md')), { force, relatorio });

  // 4. .ensemble
  const cfgPath = join(raiz, '.ensemble', 'ensemble.json');
  if (escrever(cfgPath, JSON.stringify(montarConfig(desc, raiz), null, 2) + '\n', { force, relatorio })) { /* novo */ }
  mkdirSync(join(raiz, '.ensemble'), { recursive: true });
  copyFileSync(join(KERNEL, 'scripts', 'gate-record.mjs'), join(raiz, '.ensemble', 'gate-record.mjs'));
  relatorio.escritos.push(join(raiz, '.ensemble', 'gate-record.mjs'));

  // 5. settings: agente padrão
  const settingsPath = join(raiz, '.claude', 'settings.json');
  let settings = {};
  try { settings = JSON.parse(lerTexto(settingsPath) ?? '{}'); } catch { settings = {}; }
  if (settings.agent !== 'tech-lead') { settings.agent = 'tech-lead'; mkdirSync(dirname(settingsPath), { recursive: true }); writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n'); relatorio.escritos.push(`${settingsPath} (agent: tech-lead)`); }

  // 6. OpenSpec
  if (!semOpenspec) openspecInit(raiz, relatorio);

  return { raiz, desc, relatorio };
}
