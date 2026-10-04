import { readFile } from 'node:fs/promises';
import { reviewPersonaReport } from '../src/domain/persona/review.ts';

try {
  const path = process.argv[2];
  if (!path)
    throw new Error(
      'Use npm run review:persona -- <caminho-do-relatório.json>.',
    );
  const result = reviewPersonaReport(JSON.parse(await readFile(path, 'utf8')));
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'passed') process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Relatório inválido.');
  process.exitCode = 1;
}
