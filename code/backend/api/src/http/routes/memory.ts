import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  MemoryExtractorConfigurationSchema,
  MemoryExtractorEditSchema,
} from '../../domain/memory/extractor.ts';
import type { HttpServices } from '../dependencies.ts';
import {
  FactInputSchema,
  FactSchema,
  MemoryPolicySchema,
  MemoryPolicyEditSchema,
  SummarySchema,
  MemoryExportSchema,
  MemoryStatusSchema,
  MemorySourceSchema,
} from '../../domain/memory/model.ts';
import { security, errors } from './schemas/common.ts';

export function registerMemoryRoutes(
  instance: FastifyInstance,
  services: HttpServices,
) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  app.get(
    '/v1/memory/extractor',
    {
      schema: {
        security,
        response: { 200: MemoryExtractorConfigurationSchema, ...errors },
      },
    },
    () => services.memoryProvider.get(),
  );
  app.put(
    '/v1/memory/extractor',
    {
      schema: {
        security,
        body: MemoryExtractorEditSchema,
        response: { 200: MemoryExtractorConfigurationSchema, ...errors },
      },
    },
    async (req) => {
      await memory.prepareForConfiguration();

      return services.memoryProvider.configure(req.body);
    },
  );
  const params = z.strictObject({ id: z.uuid() });
  const memory = services.memory;
  app.post(
    '/v1/memory/consolidate',
    {
      schema: {
        security,
        response: {
          200: z.strictObject({
            merged: z.number().int(),
            skipped: z.number().int(),
          }),
          ...errors,
        },
      },
    },
    () => memory.consolidate(),
  );
  app.get(
    '/v1/memory/graph',
    {
      schema: {
        security,
        response: {
          200: z.object({
            nodes: z.array(z.object({ id: z.string(), label: z.string() })),
            edges: z.array(
              z.object({
                factId: z.uuid(),
                source: z.string(),
                target: z.string(),
                predicate: z.string(),
              }),
            ),
          }),
          ...errors,
        },
      },
    },
    () => memory.graph(),
  );
  app.get(
    '/v1/memory/summaries',
    {
      schema: {
        security,
        response: {
          200: z.object({ summaries: z.array(SummarySchema) }),
          ...errors,
        },
      },
    },
    async () => ({ summaries: await memory.summaries() }),
  );
  app.patch(
    '/v1/memory/summaries/:id',
    {
      schema: {
        security,
        params,
        body: z.strictObject({
          expectedVersion: z.number().int().positive(),
          permission: z.enum(['local-only', 'eligible']),
        }),
        response: { 200: SummarySchema, ...errors },
      },
    },
    (req) =>
      memory.permitSummary(
        req.params.id,
        req.body.expectedVersion,
        req.body.permission,
      ),
  );
  app.get(
    '/v1/memory/policy',
    { schema: { security, response: { 200: MemoryPolicySchema, ...errors } } },
    () => memory.policy(),
  );
  app.put(
    '/v1/memory/policy',
    {
      schema: {
        security,
        body: MemoryPolicyEditSchema,
        response: { 200: MemoryPolicySchema, ...errors },
      },
    },
    (req) => memory.configure(req.body),
  );
  app.get(
    '/v1/facts',
    {
      schema: {
        security,
        response: { 200: z.object({ facts: z.array(FactSchema) }), ...errors },
      },
    },
    async () => ({ facts: await memory.list() }),
  );
  app.post(
    '/v1/facts',
    {
      schema: {
        security,
        body: FactInputSchema,
        response: { 201: FactSchema, ...errors },
      },
    },
    async (req, reply) => reply.code(201).send(await memory.create(req.body)),
  );
  app.patch(
    '/v1/facts/:id',
    {
      schema: {
        security,
        params,
        body: FactInputSchema.extend({
          expectedVersion: z.number().int().positive(),
          status: z.enum(['suggested', 'confirmed']),
        }),
        response: { 200: FactSchema, ...errors },
      },
    },
    (req) => memory.edit(req.params.id, req.body.expectedVersion, req.body),
  );
  app.delete(
    '/v1/facts/:id',
    {
      schema: {
        security,
        params,
        body: z.strictObject({
          expectedVersion: z.number().int().positive(),
          eraseSources: z.boolean().default(false),
        }),
        response: {
          200: z.strictObject({ originalHistoryRetained: z.boolean() }),
          ...errors,
        },
      },
    },
    (req) =>
      memory.forget(
        req.params.id,
        req.body.expectedVersion,
        req.body.eraseSources,
      ),
  );
  app.post(
    '/v1/facts/:id/reject-interpretation',
    {
      schema: {
        security,
        params,
        body: z.strictObject({ expectedVersion: z.number().int().positive() }),
        response: { 200: FactSchema, ...errors },
      },
    },
    (req) =>
      memory.rejectInterpretation(req.params.id, req.body.expectedVersion),
  );
  app.get(
    '/v1/memory/status',
    { schema: { security, response: { 200: MemoryStatusSchema, ...errors } } },
    () => memory.status(),
  );
  app.get(
    '/v1/memory/export',
    { schema: { security, response: { 200: MemoryExportSchema, ...errors } } },
    async (_req, reply) => {
      reply.header(
        'content-disposition',
        'attachment; filename="amadeus-memory.json"',
      );
      reply.header('cache-control', 'no-store');

      return MemoryExportSchema.parse(await memory.export());
    },
  );
  app.post(
    '/v1/conversations/:id/memory/rebuild',
    {
      schema: {
        security,
        params,
        response: { 200: z.object({ queued: z.boolean() }), ...errors },
      },
    },
    (req) => memory.rebuild(req.params.id),
  );
  app.get(
    '/v1/conversations',
    {
      schema: {
        security,
        response: {
          200: z.object({
            conversations: z.array(
              z.object({ id: z.uuid(), createdAt: z.number() }),
            ),
          }),
          ...errors,
        },
      },
    },
    async () => ({ conversations: await memory.conversations() }),
  );
  app.get(
    '/v1/conversations/:id',
    {
      schema: {
        security,
        params,
        response: {
          200: z.object({ id: z.uuid(), turns: z.array(MemorySourceSchema) }),
          ...errors,
        },
      },
    },
    (req) => memory.conversation(req.params.id),
  );
  app.delete(
    '/v1/conversations/:id',
    {
      schema: {
        security,
        params,
        response: { 200: z.object({ deleted: z.boolean() }), ...errors },
      },
    },
    (req) => memory.deleteConversation(req.params.id),
  );
}
