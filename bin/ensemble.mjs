#!/usr/bin/env node
// CLI do Ensemble.
//   ensemble install <projeto> [--force] [--sem-openspec]   instala o método (agentes, docs, openspec, gate-record)
//   ensemble descobrir <projeto>                            mostra o que o instalador inferiu, sem escrever nada
//   ensemble painel [projeto] [--porta 4321]                abre o painel ao vivo (só leitura)
//   ensemble status [projeto]                               resumo em texto do estado da equipa
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const [comando, ...resto] = process.argv.slice(2);
const flags = new Set(resto.filter((a) => a.startsWith('--')));
const args = resto.filter((a) => !a.startsWith('--'));
const valor = (nome, padrao) => { const i = resto.indexOf(nome); return i >= 0 && resto[i + 1] ? resto[i + 1] : padrao; };
const projeto = resolve(args[0] ?? process.cwd());

const USO = `uso:
  ensemble install <projeto> [--force] [--sem-openspec]
  ensemble descobrir <projeto>
  ensemble painel [projeto] [--porta 4321]
  ensemble status [projeto]`;

switch (comando) {
  case 'install': {
    const { instalar } = await import(`${AQUI}/../lib/instalar.mjs`);
    const { raiz, desc, relatorio } = instalar(projeto, { force: flags.has('--force'), semOpenspec: flags.has('--sem-openspec') });
    console.log(`Ensemble instalado em ${raiz}\n`);
    console.log(`Frentes: ${desc.frentes.map((f) => `${f.nome} (${f.dir}, ${f.branch ?? 'sem branch'}, gate: ${f.gate.length} passo(s)${f.e2e ? ' + e2e' : ''})`).join('; ') || 'nenhuma'}`);
    if (relatorio.escritos.length) console.log(`\nEscritos (${relatorio.escritos.length}):\n  ${relatorio.escritos.map((x) => x.replace(raiz + '/', '')).join('\n  ')}`);
    if (relatorio.mantidos.length) console.log(`\nMantidos (já existiam; --force substitui):\n  ${relatorio.mantidos.map((x) => x.replace(raiz + '/', '')).join('\n  ')}`);
    if (relatorio.inalterados.length) console.log(`\nInalterados: ${relatorio.inalterados.length} agente(s) já no método atual.`);
    if (relatorio.avisos.length) console.log(`\nAvisos:\n  ${relatorio.avisos.join('\n  ')}`);
    console.log(`\nPróximo passo: na pasta do projeto, abre o Claude Code e corre /ensemble:onboarding.\nDepois: ensemble painel ${raiz}`);
    break;
  }
  case 'descobrir': {
    const { descobrir } = await import(`${AQUI}/../lib/descoberta.mjs`);
    console.log(JSON.stringify(descobrir(projeto), null, 2));
    break;
  }
  case 'painel': {
    const { iniciarPainel } = await import(`${AQUI}/../servidor.mjs`);
    iniciarPainel({ raiz: projeto, porta: Number(valor('--porta', process.env.PORTA ?? 4321)) });
    break;
  }
  case 'status': {
    const { montarEstado } = await import(`${AQUI}/../lib/estado.mjs`);
    const e = montarEstado(projeto);
    console.log(`${e.projeto} · ${e.raiz}${e.legado ? ' (layout legado)' : ''}`);
    for (const a of Object.values(e.agentes)) console.log(`  ${a.status.padEnd(14)} ${a.nome.padEnd(14)} ${a.change ? `[${a.change}${a.task ? ' ' + a.task : ''}] ` : ''}${a.texto}`);
    console.log(`changes ativas: ${e.changes.ativas.length} · arquivadas: ${e.changes.arquivadas} · perguntas abertas: ${e.decisoes.perguntas.length} · propostas à espera: ${e.decisoes.abertas.length}`);
    break;
  }
  default:
    console.log(USO);
    process.exit(comando ? 2 : 0);
}
