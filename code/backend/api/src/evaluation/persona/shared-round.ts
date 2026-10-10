import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { createEvaluationBudget } from './budget.ts';

/** Authors and both judge types share one durable ledger and exclusive lock. */
export async function openSharedEvaluationRound(
  directory: URL,
  maxUsd: number,
  manifestHash: string,
) {
  if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > 5) {
    throw new Error('Informe orçamento explícito, entre zero e US$ 5.');
  }

  await mkdir(directory, { recursive: true });
  const lockPath = new URL('quality-v2-1.lock', directory);
  const lock = await open(lockPath, 'wx');
  const ledgerPath = new URL('quality-v2-1-budget.json', directory);

  try {
    let previous;

    try {
      previous = JSON.parse(await readFile(ledgerPath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    if (
      previous &&
      (previous.round !== 'quality-v2.1' ||
        previous.maxUsd !== maxUsd ||
        previous.manifestHash !== manifestHash ||
        !Number.isFinite(previous.committedUsd) ||
        previous.committedUsd < 0)
    ) {
      throw new Error('Rodada congelada: orçamento ou manifesto divergente.');
    }

    const prior = previous?.committedUsd ?? 0;

    if (prior >= maxUsd) {
      throw new Error('EVALUATION_BUDGET_EXHAUSTED');
    }

    const budget = createEvaluationBudget(maxUsd - prior);
    const snapshot = () => ({
      ...budget.snapshot(),
      roundMaxUsd: maxUsd,
      priorCommittedUsd: prior,
      roundCommittedUsd: prior + budget.snapshot().committedUsd,
    });
    let writes = Promise.resolve();

    const replaceLedger = async (temp: URL) => {
      for (let attempt = 0; ; attempt++) {
        try {
          await rename(temp, ledgerPath);

          return;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;

          if (
            !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '') ||
            attempt >= 6
          ) {
            throw error;
          }

          // Windows scanners/readers may briefly hold the destination open.
          // Retry only the local replacement, never the paid request.
          await new Promise((resolve) =>
            setTimeout(resolve, 25 * (attempt + 1)),
          );
        }
      }
    };

    return {
      budget,
      snapshot,
      persist(reportPath: URL, report: Record<string, unknown>) {
        const pending = writes.then(async () => {
          report.budget = snapshot();
          // Reserve the money durably first, even if writing the report fails.
          const temp = new URL('quality-v2-1-budget.tmp', directory);
          await writeFile(
            temp,
            JSON.stringify(
              {
                round: 'quality-v2.1',
                maxUsd,
                manifestHash,
                committedUsd: snapshot().roundCommittedUsd,
                report: reportPath.pathname,
                updatedAt: new Date().toISOString(),
              },
              null,
              2,
            ),
          );
          await replaceLedger(temp);
          await writeFile(reportPath, JSON.stringify(report, null, 2));
        });
        writes = pending;

        return pending;
      },
      async close() {
        await writes.catch(() => undefined);
        await lock.close();
        await unlink(lockPath);
      },
    };
  } catch (error) {
    await lock.close();
    await unlink(lockPath);

    throw error;
  }
}
