import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadPersonaReferenceCatalog,
  personaExamplesUrl,
  personaCatalogUrl,
} from '../../src/application/persona/reference-catalog.ts';
import {
  buildPersonaReferenceContext,
  referenceContextCharacters,
} from '../../src/application/persona/corpus-context.ts';
import { createPersonaReferenceRetrieval } from '../../src/application/persona/reference-retrieval.ts';
import {
  PersonaReferenceSchema,
  referenceHash,
} from '../../src/domain/persona/reference.ts';
import { MEMORY_EMBEDDING_DIMENSIONS } from '../../src/domain/memory/embeddings.ts';
import { openDatabase } from '../../src/adapters/database/index.ts';
import { createPersonaReferenceRepository } from '../../src/adapters/database/persona-reference-repository.ts';
import { contamination } from '../../src/evaluation/persona/diagnostics.ts';
import { createTurnProcessor } from '../../src/application/voice/turn-processor.ts';
import { createVoiceMetrics } from '../../src/application/voice/metrics.ts';
import type { ProviderInput } from '../../src/ports/provider.ts';

const cleanup: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) {
    await close();
  }
});
const vector = () => [
  1,
  ...Array<number>(MEMORY_EMBEDDING_DIMENSIONS - 1).fill(0),
];
const signal = () => new AbortController().signal;

describe('contextual persona references', () => {
  it('keeps the editorial catalog traceable and separate from unreviewed sources and heldout utterances', async () => {
    const entries = await loadPersonaReferenceCatalog(false);
    expect(
      entries.filter((entry) => entry.kind === 'style').length,
    ).toBeGreaterThanOrEqual(30);
    expect(entries.some((entry) => entry.dialogue.length >= 4)).toBe(true);

    for (const entry of entries) {
      expect(entry.autobiographicalEligible).toBe(false);
      expect(
        entry.provenance.every(
          (source) =>
            source.revision === '9d4726bd37dce9919af37904e442e49205f329b8',
        ),
      ).toBe(true);
      expect(entry.directionSources).toHaveLength(3);
    }

    const markdown = await readFile(personaExamplesUrl, 'utf8');
    expect(
      JSON.parse(await readFile(personaCatalogUrl, 'utf8')).sourceMarkdownHash,
    ).toBe(referenceHash(markdown));
    const heldout = JSON.parse(
      await readFile(
        new URL(
          '../../../evals/persona/quality-v2/heldout.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    expect(contamination(heldout.cases, [markdown])).toEqual([]);
  });

  it('persists lore in independent tables and invalidates stale vectors after a curation edit', async () => {
    const database = await openDatabase('file::memory:');
    cleanup.push(() => database.client.close());
    const repository = createPersonaReferenceRepository(database.client);
    const [style] = await loadPersonaReferenceCatalog(false);
    const raw = PersonaReferenceSchema.parse({
      ...style!,
      id: 'raw-story-test',
      kind: 'lore-source',
      reviewed: false,
      dialogue: [],
      text: 'Fiction reference awaiting review.',
      chronology: 'posterior-or-unverified',
    });
    await repository.synchronize([style!, raw]);
    await repository.saveVector(
      style!.id,
      referenceHash(JSON.stringify(style)),
      'fixture',
      vector(),
    );
    await repository.saveVector(
      raw.id,
      referenceHash(JSON.stringify(raw)),
      'fixture',
      vector(),
    );
    expect(
      [...(await repository.vectors('fixture'))].map(([id]) => id),
    ).toEqual([style!.id]);
    const changed = { ...style!, direction: 'Revised editorial direction.' };
    await repository.synchronize([changed, raw]);
    await repository.saveVector(
      style!.id,
      referenceHash(JSON.stringify(style)),
      'fixture',
      vector(),
    );
    expect((await repository.vectors('fixture')).size).toBe(0);
    const { rows } = await database.client.execute(
      'SELECT COUNT(*) AS count FROM memory_facts',
    );
    expect(Number(rows[0]!.count)).toBe(0);
    await repository.synchronize([changed]);
    expect((await repository.documents()).map((entry) => entry.id)).toEqual([
      style!.id,
    ]);
  });

  async function fixture(embed = vi.fn(async () => [vector()])) {
    const entries = (await loadPersonaReferenceCatalog(false))
      .filter((entry) => entry.kind === 'style')
      .slice(0, 8);
    const repository = {
      synchronize: async () => {},
      documents: async () => entries,
      vectors: async () =>
        new Map(entries.map((entry) => [entry.id, vector()])),
      saveVector: async () => {},
    };
    const close = vi.fn(async () => {});
    const rank = vi.fn(async (_query: string, documents: string[]) =>
      documents.map(() => 0.9),
    );
    const retriever = createPersonaReferenceRetrieval(
      repository,
      { key: 'fixture', embed, close },
      undefined,
      {
        key: 'fixture',
        close,
        rank,
      },
    );
    await retriever.start();
    cleanup.push(() => retriever.close());

    return { retriever, embed, rank, close, entries };
  }

  it('varies only the example cap, reuses query inference and measures the complete rendered context budget', async () => {
    const { retriever, embed, close } = await fixture();
    const sizes = [];

    for (const maxExamples of [0, 2, 4, 6]) {
      const selected = await retriever.retrieve(
        'A novel conversational situation.',
        signal(),
        { maxExamples, maxLore: 0, characters: 6000 },
      );
      sizes.push(selected.examples.length);
      expect(selected.characters).toBe(referenceContextCharacters(selected));
      expect(selected.characters).toBeLessThanOrEqual(6000);
      expect(selected.lore).toEqual([]);
    }

    expect(sizes).toEqual([0, 2, 4, 6]);
    expect(embed).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    const tiny = await retriever.retrieve(
      'A novel conversational situation.',
      signal(),
      { maxExamples: 6, maxLore: 0, characters: 10 },
    );
    expect(tiny.examples).toEqual([]);
    expect(tiny.characters).toBe(0);
  });

  it('uses recent context for candidates but ranks against the current utterance and keeps focused caches separate', async () => {
    const { retriever, rank, embed } = await fixture();
    const context =
      'The conversation mentioned science, thanks, and a correction.';
    await retriever.retrieve(context, signal(), { focus: 'Thank you.' });
    expect(embed).toHaveBeenCalledWith([context], 'query');
    expect(rank.mock.calls[0]![0]).toBe('Thank you.');
    await retriever.retrieve(context, signal(), {
      focus: 'That sounded rude.',
    });
    expect(rank.mock.calls[1]![0]).toBe('That sounded rude.');
    await retriever.retrieve(context, signal(), { focus: 'Thank you.' });
    expect(rank).toHaveBeenCalledTimes(2);
  });

  it('abstains on irrelevant scores and never imports raw lore into a prompt', async () => {
    const entries = await loadPersonaReferenceCatalog(false);
    const repository = {
      synchronize: async () => {},
      documents: async () => entries,
      vectors: async () =>
        new Map(entries.map((entry) => [entry.id, vector()])),
      saveVector: async () => {},
    };
    const retriever = createPersonaReferenceRetrieval(
      repository,
      { key: 'fixture', embed: async () => [vector()], close: async () => {} },
      undefined,
      {
        key: 'fixture',
        rank: async (_query, documents) => documents.map(() => 0.01),
        close: async () => {},
      },
    );
    await retriever.start();
    cleanup.push(() => retriever.close());
    const selection = await retriever.retrieve(
      'Unrelated information.',
      signal(),
    );
    expect(selection.examples).toEqual([]);
    expect(selection.lore).toEqual([]);
    expect(buildPersonaReferenceContext(selection)).toEqual({
      system: '',
      history: [],
    });
  });

  it('bounds foreground waits and does not mutate a timed-out selection when local inference finishes', async () => {
    let resolve!: (value: number[][]) => void;
    const embed = vi.fn(
      () =>
        new Promise<number[][]>((done) => {
          resolve = done;
        }),
    );
    const { retriever } = await fixture(embed);
    const timedOut = await retriever.retrieve('Delayed query.', signal(), {
      waitMs: 1,
    });
    expect(timedOut.state).toBe('timeout');
    expect(timedOut.examples).toEqual([]);
    resolve([vector()]);
    await new Promise((done) => setTimeout(done, 0));
    expect(timedOut.examples).toEqual([]);
    expect(
      (await retriever.retrieve('Delayed query.', signal())).examples.length,
    ).toBeGreaterThan(0);
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it('cancels an interrupted lookup and observes late inference failures', async () => {
    let reject!: (error: Error) => void;
    const { retriever } = await fixture(
      vi.fn(
        () =>
          new Promise<number[][]>((_, fail) => {
            reject = fail;
          }),
      ),
    );
    const controller = new AbortController();
    const pending = retriever.retrieve('Interrupted query.', controller.signal);
    controller.abort(new Error('User interrupted.'));
    await expect(pending).rejects.toThrow('User interrupted.');
    reject(new Error('Model unavailable.'));
    await new Promise((done) => setTimeout(done, 0));
  });

  it('injects demonstrations before real history without persisting them as user utterances', async () => {
    const entry = (await loadPersonaReferenceCatalog(false)).find(
      (entry) => entry.id === 'estilo-elogio-direto',
    )!;
    let input: ProviderInput | undefined;
    const updateTurn = vi.fn(async () => {});
    const history = {
      startSession: async () => {},
      endSession: async () => {},
      beginTurn: async () => {},
      updateTurn,
      recent: async () => [],
      addSegment: async () => {},
      setAudio: async () => {},
      acknowledge: async () => true,
    };
    const processor = createTurnProcessor(
      {
        execute: async () => {
          throw new Error('Voice is forbidden.');
        },
        executeStream: async function* (value) {
          input = value;
          yield {
            content:
              '<expression>{"memory":[],"intent":"agradecer","emotion":"calor_discreto","intensity":0.2}</expression>\nObrigada.',
            inputTokens: null,
            outputTokens: null,
          };
        },
      },
      history,
      createVoiceMetrics(),
      undefined,
      undefined,
      undefined,
      undefined,
      {
        retrieve: async () => ({
          examples: [entry],
          lore: [],
          characters: 1445,
          state: 'ready',
        }),
      },
    );
    await processor.process(
      {
        sessionId: 'fixture',
        conversationId: 'fixture',
        ownerId: 'fixture',
        turnId: 1,
        responseId: 'fixture',
        dataClass: 'synthetic',
        text: 'Real utterance.',
        profile: null,
        signal: signal(),
        speechEndedAt: performance.now(),
      },
      { send: () => {}, audio: async () => {} },
    );
    expect(input!.systemPrompt).toContain('<persona_reference_context>');
    expect(input!.history![0]!.content).toContain('[DEMONSTRAÇÃO');
    expect(input!.history).toHaveLength(entry.dialogue.length);
    expect(input!.content).toBe('Real utterance.');
    expect(updateTurn).toHaveBeenCalledWith('fixture', {
      userText: 'Real utterance.',
    });
    expect(
      updateTurn.mock.calls.some((call) =>
        JSON.stringify(call).includes('DEMONSTRAÇÃO'),
      ),
    ).toBe(false);
  });
});
