import { readFile } from 'node:fs/promises';
import {
  ReferenceCatalogSchema,
  PersonaReferenceSchema,
  referenceHash,
  type PersonaReference,
} from '../../domain/persona/reference.ts';

export const personaCatalogUrl = new URL(
  import.meta.url.endsWith('.ts')
    ? '../../../../assets/persona/corpus-examples-v1.json'
    : './corpus-examples-v1.json',
  import.meta.url,
);
export const personaExamplesUrl = new URL(
  import.meta.url.endsWith('.ts')
    ? '../../../../assets/persona/corpus-examples-v1.md'
    : './corpus-examples-v1.md',
  import.meta.url,
);

export async function loadPersonaReferenceCatalog(
  includeRawStory = true,
): Promise<PersonaReference[]> {
  const catalog = ReferenceCatalogSchema.parse(
    JSON.parse(await readFile(personaCatalogUrl, 'utf8')),
  );

  if (
    referenceHash(await readFile(personaExamplesUrl, 'utf8')) !==
    catalog.sourceMarkdownHash
  ) {
    throw new Error(
      'Catálogo desatualizado; execute npm run prepare:persona-examples.',
    );
  }

  const entries = [...catalog.entries];

  if (!includeRawStory) {
    return entries;
  }

  const external = new URL(
    '../../../../assets/persona/external/francesco-amadeus/',
    import.meta.url,
  );
  let raw: string;

  try {
    raw = await readFile(new URL('prepared/story.jsonl', external), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return entries;
    }

    throw error;
  }

  const original = await readFile(
    new URL('source/Prompts/Story_EN.md', external),
    'utf8',
  );

  for (const line of raw.trim().split(/\r?\n/u)) {
    const record = JSON.parse(line) as {
      id: string;
      heading: string;
      text: string;
      provenance: {
        repository: string;
        revision: string;
        file: string;
        url: string;
        charStart: number;
        charEnd: number;
      };
    };

    if (
      original.slice(record.provenance.charStart, record.provenance.charEnd) !==
      record.text
    ) {
      throw new Error('Trecho de história não corresponde à fonte.');
    }

    entries.push(
      PersonaReferenceSchema.parse({
        id: record.id,
        kind: 'lore-source',
        reviewed: false,
        sceneGroup: record.id,
        situation: record.heading,
        sceneContext: 'Resumo secundário bruto, aguardando curadoria.',
        adaptationNote:
          'Arquivado para pesquisa; excluído do prompt e da indexação de produção.',
        direction: 'Fonte de pesquisa, não instrução nem memória do usuário.',
        text: record.text,
        chronology: 'posterior-or-unverified',
        autobiographicalEligible: false,
        provenance: [
          {
            sourceId: record.id,
            ...record.provenance,
            sourceHash: referenceHash(original),
          },
        ],
        directionSources: catalog.entries[0]!.directionSources,
      }),
    );
  }

  return entries;
}
