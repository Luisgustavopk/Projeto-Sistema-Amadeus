import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { loadConfig } from '../src/config/index.ts';
import { openDatabase } from '../src/adapters/database/index.ts';
import { createPersonaReferenceRepository } from '../src/adapters/database/persona-reference-repository.ts';
import { createLocalMemoryEmbeddings } from '../src/adapters/embeddings/local.ts';
import { createLocalMemoryReranker } from '../src/adapters/embeddings/reranker.ts';
import { loadPersonaReferenceCatalog } from '../src/application/persona/reference-catalog.ts';
import { createPersonaReferenceRetrieval } from '../src/application/persona/reference-retrieval.ts';

const command = process.argv[2] ?? 'status';
const args = process.argv.slice(3);
if (
  !['status', 'import', 'index', 'check'].includes(command) ||
  args.some((arg) => !arg.startsWith('--database='))
)
  throw new Error(
    'Use status, import, index ou check; --database=file:... é opcional.',
  );
const config = loadConfig();
const database = await openDatabase(
  args.find((arg) => arg.startsWith('--database='))?.slice(11) ??
    config.DATABASE_URL,
);
const embeddings = config.MEMORY_SEMANTIC_ENABLED
  ? createLocalMemoryEmbeddings(config.MEMORY_MODEL_CACHE_DIRECTORY)
  : undefined;
const repository = createPersonaReferenceRepository(database.client);
const reranker =
  embeddings && config.MEMORY_RERANK_ENABLED
    ? createLocalMemoryReranker(config.MEMORY_MODEL_CACHE_DIRECTORY)
    : undefined;
const references = createPersonaReferenceRetrieval(
  repository,
  embeddings,
  undefined,
  reranker,
);
try {
  if (command !== 'status')
    await repository.synchronize(await loadPersonaReferenceCatalog());
  await references.start();
  if (embeddings && ['index', 'check'].includes(command))
    await references.index();
  if (command === 'check') {
    const queries = [
      [
        'elogio',
        'Sua explicação foi ótima. Gostei de como você ligou os dois pontos.',
      ],
      ['reparo', 'Aquilo soou grosseiro. Eu só estava tentando entender.'],
      ['saudacao', 'Olá, passei para conversar um pouco.'],
      [
        'discordancia',
        'O resultado caiu, então não existe nenhuma outra explicação.',
      ],
      ['english', 'That conclusion is too strong; we have only tried it once.'],
      [
        'lore',
        'Na história de Steins;Gate, como funciona o Reading Steiner do Okabe?',
      ],
      [
        'desconhecido',
        'Quantas hélices tem aquele equipamento que nunca descrevi?',
      ],
    ];
    const results = [];
    for (const [id, query] of queries) {
      // Match the shape used by the turn processor, with no previous turn here.
      const lookupQuery = `Pessoa agora: ${query}\nContexto anterior: `;
      for (const maxExamples of [0, 2, 4, 6]) {
        const started = performance.now();
        const selected = await references.retrieve(
          lookupQuery,
          new globalThis.AbortController().signal,
          {
            focus: query,
            maxExamples,
            maxLore: 0,
            characters: 6000,
            waitMs: 30000,
          },
        );
        results.push({
          id,
          query,
          lookupQuery,
          maxExamples,
          actualExamples: selected.examples.length,
          selected: selected.examples.map((entry) => ({
            id: entry.id,
            situation: entry.situation,
            sources: entry.provenance,
          })),
          characters: selected.characters,
          state: selected.state,
          milliseconds: performance.now() - started,
        });
      }
    }
    const lore = await references.retrieve(
      `Pessoa agora: ${queries.find((item) => item[0] === 'lore')[1]}\nContexto anterior: `,
      new globalThis.AbortController().signal,
      {
        focus: queries.find((item) => item[0] === 'lore')[1],
        maxExamples: 0,
        maxLore: 2,
        waitMs: 30000,
      },
    );
    const directory = new URL('../data/refinement/', import.meta.url);
    await mkdir(directory, { recursive: true });
    const path = new URL(
      `${Date.now()}-persona-reference-check.json`,
      directory,
    );
    await writeFile(
      path,
      JSON.stringify(
        {
          status: references.status(),
          results,
          lore,
          paidCalls: 0,
          limitation:
            'Diagnóstico de recuperação local; não mede naturalidade ou fidelidade da geração do Llama.',
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify(
        {
          report: path.pathname,
          status: references.status(),
          results: results.map((result) => ({
            id: result.id,
            maxExamples: result.maxExamples,
            actualExamples: result.actualExamples,
            characters: result.characters,
            state: result.state,
            milliseconds: result.milliseconds,
          })),
          lore: lore.lore.map((entry) => entry.id),
          paidCalls: 0,
        },
        null,
        2,
      ),
    );
  } else
    console.log(
      JSON.stringify({ ...references.status(), paidCalls: 0 }, null, 2),
    );
} finally {
  await references.close();
  await embeddings?.close();
  await reranker?.close();
  database.client.close();
}
