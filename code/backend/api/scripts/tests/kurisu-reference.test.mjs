import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseDialogue,
  prepareDialogue,
  prepareStory,
} from '../prepare-kurisu-reference.mjs';

test('preserva autoria e fala multilinha; horário no texto não vira personagem', () => {
  const turns = parseDialogue(
    'Okabe: Uma pergunta.\n\nKurisu: Minha resposta.\nExactly. An hour ago. August 13th, 2010. 2:00 PM.\nOutra linha.\n\nDaru: Meu comentário.',
  );
  assert.equal(turns.length, 3);
  const records = prepareDialogue(turns);
  assert.equal(records.length, 1);
  assert.equal(records[0].target.speaker, 'Kurisu');
  assert.match(records[0].target.text, /2:00 PM/u);
  assert.equal(records[0].context[0].speaker, 'Okabe');
  assert.equal(records[0].context.at(-1).speaker, 'Daru');
  assert.equal(records[0].autobiographicalEligible, false);
  assert.equal(records[0].requiresCuration, true);
});

test('não atravessa separadores nem usa falas vazias como resposta de estilo', () => {
  const records = prepareDialogue(
    parseDialogue(
      'Okabe: Primeira cena.\nKurisu: \n----\nDaru: Segunda cena.\nKurisu: Resposta nova.',
    ),
  );
  assert.equal(records.length, 1);
  assert.equal(records[0].context.length, 2);
  assert.ok(records[0].context.every((turn) => turn.segment === 1));
});

test('não atribui silenciosamente texto sem cabeçalho a um personagem', () => {
  assert.throws(
    () => parseDialogue('Texto inicial sem autoria.\nKurisu: Oi.'),
    /autoria/u,
  );
});

test('divide história sem inventar capítulo, mudar texto ou promover resumo a vivência', () => {
  const text =
    '## Contents\nNavegação.\n## Chapter A\n' +
    'Conteúdo longo. '.repeat(25) +
    '\n## Chapter B\nOutro conteúdo.';
  const records = prepareStory(text, 80);
  assert.ok(records.length > 2);
  assert.ok(records.every((r) => r.heading !== 'Contents'));
  for (const record of records) {
    assert.equal(
      record.text,
      text.slice(record.provenance.charStart, record.provenance.charEnd),
    );
    assert.ok(record.text.length <= 80);
    assert.equal(record.kind, 'secondary-story-summary');
    assert.equal(record.autobiographicalEligible, false);
  }
  const first = records.filter((r) => r.heading === 'Chapter A');
  assert.equal(
    first.map((r) => r.text).join(''),
    '\n' + 'Conteúdo longo. '.repeat(25) + '\n',
  );
});
