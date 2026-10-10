import { readFile, writeFile } from 'node:fs/promises';
import {
  ReferenceCatalogSchema,
  referenceHash,
} from '../src/domain/persona/reference.ts';

const root = new URL('../../assets/persona/', import.meta.url);
const external = new URL('external/francesco-amadeus/', root);
const markdown = await readFile(new URL('corpus-examples-v1.md', root), 'utf8');
const manifest = JSON.parse(
  await readFile(new URL('manifest.json', external), 'utf8'),
);
const records = (
  await Promise.all(
    ['dialogues', 'story'].map(async (name) =>
      (await readFile(new URL(`prepared/${name}.jsonl`, external), 'utf8'))
        .trim()
        .split(/\r?\n/u)
        .map(JSON.parse),
    ),
  )
).flat();
const directionFiles = [
  'source-v0.4.md',
  'reaction-repertoire-v0.2.md',
  'external/francesco-amadeus/curadoria.pt-BR.md',
];
const directionDocuments = await Promise.all(
  directionFiles.map(async (file) => ({
    file,
    text: await readFile(new URL(file, root), 'utf8'),
  })),
);
const sectionByExample = {
  'estilo-limite': ['3.3', '5.4'],
  'estilo-incerteza': ['3.3', '5.4'],
  'estilo-evidencia': ['3.2', '5.4'],
  'estilo-prova': ['3.2', '5.4'],
  'estilo-discordancia': ['3.2', '5.5'],
  'estilo-contraponto': ['3.2', '5.5'],
  'estilo-progresso': ['3.2', '5.4'],
  'estilo-iniciativa': ['3.2', '5.3'],
  'estilo-rotulo': ['3.4', '5.5'],
  'estilo-apelido': ['3.4', '5.5'],
  'estilo-elogio-ambiguo': ['3.5', '5.6'],
  'estilo-elogio-direto': ['3.7', '5.6'],
  'estilo-alivio': ['3.6', '5.6'],
  'estilo-afeto': ['3.6', '5.6'],
  'estilo-escuta': ['3.6', '5.5'],
  'estilo-cuidado': ['3.6', '5.5'],
};
function sectionRanges(text, prefixes) {
  const lines = text.replace(/\r\n?/gu, '\n').split('\n');
  return prefixes.map((prefix) => {
    const start = lines.findIndex(
      (line) =>
        /^#{1,3} /u.test(line.trim()) &&
        line
          .trim()
          .replace(/^#+\s*/u, '')
          .startsWith(prefix),
    );
    if (start < 0) throw new Error(`Seção documental ausente: ${prefix}`);
    let end = start + 1;
    while (end < lines.length && !/^#{1,3} /u.test(lines[end].trim())) end++;
    return { heading: lines[start].trim(), lineStart: start + 1, lineEnd: end };
  });
}
const entries = [];
for (const match of markdown.matchAll(/```json\s*([\s\S]*?)```/gu)) {
  const { sourceIds, ...entry } = JSON.parse(match[1]);
  const sources = sourceIds.map((id) => {
    const record = records.find((record) => record.id === id);
    if (
      !record ||
      record.provenance.revision !== manifest.revision ||
      record.provenance.repository !== manifest.repository ||
      (entry.kind !== 'lore' && record.target?.speaker !== 'Kurisu')
    )
      throw new Error(`Origem inválida: ${id}`);
    return record;
  });
  const provenance = await Promise.all(
    sources.map(async (record) => {
      const original = await readFile(
        new URL('source/' + record.provenance.file, external),
        'utf8',
      );
      if (
        referenceHash(original) !==
        manifest.files.find((file) => file.path === record.provenance.file)
          ?.sha256
      )
        throw new Error(`Snapshot difere do manifesto: ${record.id}`);
      if (record.target) {
        const excerpt = original
          .replace(/\r\n?/gu, '\n')
          .split('\n')
          .slice(record.provenance.lineStart - 1, record.provenance.lineEnd)
          .join('\n')
          .trim();
        if (
          !excerpt.startsWith('Kurisu:') ||
          excerpt.replace(/^Kurisu:\s*/u, '') !== record.target.text.trim()
        )
          throw new Error(`Fala não corresponde à origem: ${record.id}`);
      } else if (
        original.slice(
          record.provenance.charStart,
          record.provenance.charEnd,
        ) !== record.text
      )
        throw new Error(`Trecho não corresponde à origem: ${record.id}`);
      return {
        sourceId: record.id,
        ...record.provenance,
        sourceHash: referenceHash(original),
      };
    }),
  );
  const directionSources = directionDocuments.map(({ file, text }) => ({
    file,
    hash: referenceHash(text),
    sections: sectionRanges(
      text,
      file === 'source-v0.4.md'
        ? entry.kind === 'lore'
          ? ['4.2', '6.3']
          : (sectionByExample[entry.id] ?? ['3.7', '5.2', '5.3'])
        : file === 'reaction-repertoire-v0.2.md'
          ? ['Repertório contextual']
          : [
              'O que o corpus acrescenta',
              'Critérios para cada trecho selecionado',
            ],
    ),
  }));
  entries.push({
    ...entry,
    kind: entry.kind ?? 'style',
    reviewed: true,
    sceneGroup: sourceIds.toSorted().join('+'),
    chronology: entry.chronology ?? 'style-only',
    autobiographicalEligible: false,
    provenance,
    directionSources,
  });
}
const catalog = ReferenceCatalogSchema.parse({
  version: 1,
  curatedBy: 'editorial-adaptation-unvalidated-by-user',
  sourceMarkdownHash: referenceHash(markdown),
  entries,
});
await writeFile(
  new URL('corpus-examples-v1.json', root),
  JSON.stringify(catalog, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    styles: entries.filter((entry) => entry.kind === 'style').length,
    lore: entries.filter((entry) => entry.kind === 'lore').length,
    traceable: true,
    paidCalls: 0,
  }),
);
