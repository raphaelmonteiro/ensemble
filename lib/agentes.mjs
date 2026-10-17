// Lê .claude/agents/*.md (nome, descrição, modelo, cor) e a estrutura da equipa.
import { basename, join } from 'node:path';
import { lerFrontmatter, lerTexto, listarFicheiros } from './leitura.mjs';

/** Posição no mapa mental e grupo (a anotação do Raphael: Team = Dev / Manager / Tech Lead). */
const EQUIPA = {
  'tech-lead': { grupo: 'tech-lead', rotulo: 'tech-lead' },
  'product-owner': { grupo: 'manager', rotulo: 'po' },
  devops: { grupo: 'manager', rotulo: 'devops' },
  'backend-dev': { grupo: 'dev', rotulo: 'backend' },
  'frontend-dev': { grupo: 'dev', rotulo: 'frontend' },
  qa: { grupo: 'dev', rotulo: 'qa' },
  'code-reviewer': { grupo: 'revisao', rotulo: 'code-reviewer' },
};

/** Ligações do fluxo (de → para), tiradas do ciclo de uma change no tech-lead.md. */
export const LIGACOES = [
  ['tech-lead', 'product-owner'],
  ['tech-lead', 'devops'],
  ['product-owner', 'backend-dev'],
  ['product-owner', 'frontend-dev'],
  ['backend-dev', 'code-reviewer'],
  ['frontend-dev', 'code-reviewer'],
  ['code-reviewer', 'qa'],
  ['qa', 'product-owner'],
];

export function lerAgentes(raiz) {
  const pasta = join(raiz, '.claude', 'agents');
  const agentes = {};
  for (const ficheiro of listarFicheiros(pasta, '.md')) {
    const { meta, corpo } = lerFrontmatter(lerTexto(ficheiro));
    const nome = meta.name || basename(ficheiro, '.md');
    const equipa = EQUIPA[nome] ?? { grupo: 'outro', rotulo: nome };
    agentes[nome] = {
      nome,
      descricao: meta.description ?? '',
      modelo: meta.model ?? null,
      cor: meta.color ?? null,
      ferramentas: meta.tools ?? '',
      ficheiro: `.claude/agents/${basename(ficheiro)}`,
      grupo: equipa.grupo,
      rotulo: equipa.rotulo,
      primeiraLinha: (corpo.trim().split('\n')[0] ?? '').slice(0, 200),
    };
  }
  return agentes;
}
