// Memória da equipa: docs/ambiente.md, docs/divida-tecnica.md, docs/resumos/{decisoes,ondas}.
import { join } from 'node:path';
import { lerTexto, listarFicheiros, mtime } from './leitura.mjs';

function secao(texto, titulo) {
  const re = new RegExp(`^## ${titulo}[^\\n]*\\n([\\s\\S]*?)(?=^## |\\Z)`, 'm');
  const m = re.exec(texto + '\n## ');
  return m ? m[1] : '';
}

export function lerAmbiente(raiz, docs) {
  const caminho = join(raiz, docs.ambiente);
  const texto = lerTexto(caminho)?.replace(/<!--[\s\S]*?-->/g, '');
  if (!texto) return { fatos: [], achados: [], mtime: null };
  const fatos = [];
  for (const linha of secao(texto, 'Fatos confirmados').split('\n')) {
    const m = /^- (.+)$/.exec(linha);
    if (m) fatos.push(m[1].replace(/\*\*/g, '').trim());
  }
  const achados = [];
  const blocoAchados = secao(texto, 'Achados recentes');
  for (const parte of blocoAchados.split(/^### /m).slice(1)) {
    const [cab, ...resto] = parte.split('\n');
    const partes = cab.split('·').map((s) => s.trim());
    const corpo = resto.join('\n');
    const campo = (nome) => {
      const m = new RegExp(`\\*\\*${nome}[^:]*:\\*\\*\\s*([^\\n]+)`).exec(corpo);
      return m ? m[1].replace(/\*\*/g, '').trim() : null;
    };
    achados.push({
      data: partes[0] ?? '',
      agente: partes[1] ?? '',
      titulo: partes.slice(2).join(' · '),
      contorno: campo('Contorno'),
      correcao: campo('Correção da causa necessária'),
    });
  }
  return { fatos, achados, mtime: mtime(caminho) };
}

export function lerDivida(raiz, docs) {
  const texto = lerTexto(join(raiz, docs.divida));
  if (!texto) return [];
  const itens = [];
  const linhas = texto.split('\n');
  let modulo = '';
  for (let i = 0; i < linhas.length; i += 1) {
    const h = /^## (M\d+\..+)$/.exec(linhas[i]);
    if (h) modulo = h[1].trim();
    const m = /^- \*\*(DT-\d+)\*\*\s*·\s*(\d{4}-\d{2}-\d{2})\s*·\s*change `([^`]+)`\s*·\s*([^·]+?)\s*·?\s*(`[^`]+`)?\s*$/.exec(linhas[i]);
    if (m) {
      const descricao = (linhas[i + 1] ?? '').trim();
      const resp = /Responsável sugerido:\s*([a-z-]+)/.exec(descricao);
      itens.push({ id: m[1], data: m[2], change: m[3], origem: m[4].trim(), local: m[5]?.replace(/`/g, '') ?? null, modulo, descricao: descricao.replace(/Responsável sugerido:.*$/, '').trim(), responsavel: resp?.[1] ?? null });
    }
  }
  return itens;
}

export function lerDecisoes(raiz, docs) {
  const caminho = join(raiz, docs.decisoes);
  const texto = lerTexto(caminho);
  if (!texto) return { registos: [], atualizacao: null, mtime: null };
  const registos = [];
  for (const linha of texto.split('\n')) {
    const m = /^- (§\d+(?:\.\d+)?):\s*(.+)$/.exec(linha);
    if (m) registos.push({ id: m[1], texto: m[2].trim() });
  }
  const at = /\*\*Atualização:\*\*\s*([^\n]+)/.exec(texto);
  return { registos, atualizacao: at ? at[1].slice(0, 400) : null, mtime: mtime(caminho) };
}

export function lerOndas(raiz, docs) {
  const pasta = join(raiz, docs.ondas);
  const ondas = [];
  for (const f of listarFicheiros(pasta, '.md')) {
    if (f.endsWith('README.md')) continue;
    const texto = lerTexto(f) ?? '';
    const titulo = /^#\s+(.+)$/m.exec(texto)?.[1] ?? f;
    const resumo = /Em resumo:\s*([^\n]+)/.exec(texto)?.[1] ?? null;
    const licoes = [];
    const bloco = /^## (?:Lições|Aprendizados|O que aprendemos)[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(texto);
    if (bloco) for (const l of bloco[1].split('\n')) { const m = /^- (.+)$/.exec(l); if (m) licoes.push(m[1].replace(/\*\*/g, '').trim()); }
    ondas.push({ ficheiro: f.slice(raiz.length + 1), titulo, resumo, licoes });
  }
  return ondas;
}

/** Padrões recorrentes nos achados de revisão (todas as changes, ativas e arquivadas). */
export function padroesDeRevisao(changes) {
  const contagem = new Map();
  const porResponsavel = new Map();
  let total = 0;
  for (const c of [...changes.ativas, ...changes.arquivadas]) {
    for (const r of c.revisao.rodadas) {
      for (const a of r.achados) {
        total += 1;
        const chave = a.categoria;
        contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
        const resp = a.responsavel.replace(/\s.*$/, '');
        if (!porResponsavel.has(resp)) porResponsavel.set(resp, new Map());
        const m = porResponsavel.get(resp);
        m.set(chave, (m.get(chave) ?? 0) + 1);
      }
    }
  }
  const top = [...contagem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([categoria, n]) => ({ categoria, n, pct: total ? Math.round((n / total) * 100) : 0 }));
  const porAgente = {};
  for (const [resp, m] of porResponsavel) {
    const [categoria, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    porAgente[resp] = { categoria, n, total: [...m.values()].reduce((s, v) => s + v, 0) };
  }
  return { total, top, porAgente };
}

/** Perguntas em aberto para o desenvolvedor (docs/ensemble/perguntas-abertas.md). */
export function lerPerguntas(raiz, docs) {
  if (!docs.perguntas) return [];
  const texto = lerTexto(join(raiz, docs.perguntas));
  if (!texto) return [];
  const itens = [];
  for (const parte of texto.split(/^### /m).slice(1)) {
    const [cab, ...resto] = parte.split('\n');
    const m = /^(P-\d+)\s*·\s*(.+?)\s*·\s*(aberta|respondida[^\n]*)$/.exec(cab.trim());
    if (!m) continue;
    const corpo = resto.join('\n');
    const campo = (nome) => new RegExp(`\\*\\*${nome}[^:]*:\\*\\*\\s*([^\\n]+)`).exec(corpo)?.[1]?.trim() ?? null;
    itens.push({ id: m[1], titulo: m[2], estado: m[3].trim(), pergunta: campo('Pergunta'), porque: campo('Por que importa'), recomendacao: campo('Recomenda') });
  }
  return itens;
}
