import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Offline preparation only. No provider, production database or runtime prompt.
const workspace = fileURLToPath(new URL('../../../../', import.meta.url));
const reference = resolve(
  workspace,
  'code/backend/assets/persona/external/francesco-amadeus',
);
const source = resolve(reference, 'source');
const revision = '9d4726bd37dce9919af37904e442e49205f329b8';
const repository = 'https://github.com/FrancescoCaracciolo/Amadeus';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readText = async (file) =>
  (await readFile(resolve(source, file), 'utf8')).replace(/^\uFEFF/u, '');
const json = (file) => readFile(file, 'utf8').then(JSON.parse);

function within(root, path) {
  const target = resolve(root, path);
  const suffix = relative(root, target);
  if (suffix.startsWith('..') || isAbsolute(suffix)) {
    throw new Error('Referência de arquivo fora da pasta permitida.');
  }
  return target;
}

async function save(file, value) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function provenance(file, extra = {}) {
  return {
    repository,
    revision,
    file,
    url: `${repository}/blob/${revision}/${file}`,
    ...extra,
  };
}

export function parseDialogue(text) {
  const turns = [];
  let turn;
  let segment = 0;
  const lines = text.split(/\r?\n/u);
  const finish = () => {
    if (!turn) return;
    turn.text = turn.lines.join('\n').trim();
    delete turn.lines;
    turns.push(turn);
    turn = undefined;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^-{3,}\s*$/u.test(line)) {
      finish();
      segment++;
      continue;
    }
    // Parse source speaker labels; this is not a memory/topic recognizer.
    // Periods and digits in prose such as a timestamp cannot become speakers.
    const label = /^([\p{L}?][\p{L}\p{Zs}'?_-]{0,49}):[ \t]*(.*)$/u.exec(line);
    if (label) {
      finish();
      turn = {
        speaker: label[1].trim(),
        segment,
        lineStart: i + 1,
        lineEnd: i + 1,
        lines: [label[2]],
      };
    } else if (turn) {
      turn.lines.push(line);
      turn.lineEnd = i + 1;
    } else if (line.trim()) {
      throw new Error(`Texto sem autoria na linha ${i + 1}.`);
    }
  }
  finish();
  return turns;
}

export function prepareDialogue(turns) {
  const file = 'Dialogues/SG_Dialogues_EN.md';
  return turns.flatMap((turn, index) => {
    if (turn.speaker !== 'Kurisu' || !turn.text) return [];
    const context = turns
      .slice(Math.max(0, index - 3), index + 2)
      .filter((item) => item.segment === turn.segment);
    return [
      {
        id: `kurisu-dialogue-${String(turn.lineStart).padStart(5, '0')}`,
        namespace: 'fiction-reference',
        kind: 'dialogue-style-candidate',
        language: 'en',
        requiresCuration: true,
        autobiographicalEligible: false,
        chronology: 'unverified-relative-to-march-2010',
        provenance: provenance(file, {
          lineStart: turn.lineStart,
          lineEnd: turn.lineEnd,
        }),
        target: turn,
        context,
        duplicateKey: hash(turn.text),
      },
    ];
  });
}

export function prepareStory(text, maximum = 2400) {
  const file = 'Prompts/Story_EN.md';
  const headings = [...text.matchAll(/^## (.+)$/gmu)];
  return headings.flatMap((heading, index) => {
    const end = headings[index + 1]?.index ?? text.length;
    const start = heading.index + heading[0].length;
    // Contents is navigation, not a story source. Preserve the original file.
    if (heading[1].trim() === 'Contents') return [];
    const result = [];
    let offset = start;
    while (offset < end) {
      let stop = Math.min(end, offset + maximum);
      if (stop < end) {
        const boundary = text.lastIndexOf('\n', stop - 1);
        if (boundary > offset + maximum / 2) stop = boundary + 1;
        else {
          const space = text.lastIndexOf(' ', stop - 1);
          if (space > offset) stop = space + 1;
        }
      }
      const content = text.slice(offset, stop);
      if (content.trim()) {
        result.push({
          id: `kurisu-story-${offset}`,
          namespace: 'fiction-reference',
          kind: 'secondary-story-summary',
          language: 'en',
          requiresCuration: true,
          autobiographicalEligible: false,
          chronology: 'unverified-relative-to-march-2010',
          heading: heading[1].trim(),
          provenance: provenance(file, { charStart: offset, charEnd: stop }),
          text: content,
        });
      }
      offset = stop;
    }
    return result;
  });
}

async function inventory() {
  const tree = JSON.parse(await readText('github-tree.json'));
  if (tree.sha !== revision || tree.truncated) {
    throw new Error(
      'Snapshot do repositório não corresponde à revisão fixada.',
    );
  }
  return Promise.all(
    tree.tree
      .filter((entry) => entry.type === 'blob')
      .map(async (entry) => {
        const bytes = await readFile(within(source, entry.path));
        const blob = createHash('sha1')
          .update(`blob ${bytes.length}\0`)
          .update(bytes)
          .digest('hex');
        if (bytes.length !== entry.size || blob !== entry.sha) {
          throw new Error(`Fonte não corresponde ao Git: ${entry.path}`);
        }
        return {
          path: entry.path,
          bytes: bytes.length,
          sha256: hash(bytes),
          blob,
        };
      }),
  );
}

async function allFiles(root, directory = root) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error('Link não permitido nos assets.');
    if (entry.isDirectory()) result.push(...(await allFiles(root, path)));
    else if (entry.isFile()) {
      const bytes = await readFile(path);
      result.push({
        path: relative(root, path).replaceAll('\\', '/'),
        bytes: bytes.length,
        sha256: hash(bytes),
      });
    }
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

async function inspectAvatar(root, settingName, archive, url, modern) {
  const setting = await json(resolve(root, settingName));
  const refs = modern ? setting.FileReferences : setting;
  const textures = modern ? refs.Textures : refs.textures;
  const expressions = modern ? refs.Expressions : refs.expressions;
  const motions = modern ? refs.Motions : refs.motions;
  const moc = modern ? refs.Moc : refs.model;
  const entries = [
    moc,
    ...textures,
    modern ? refs.Physics : refs.physics,
    modern ? refs.DisplayInfo : refs.pose,
    ...expressions.map((e) => (modern ? e.File : e.file)),
    ...Object.values(motions).flatMap((group) =>
      group.flatMap((motion) =>
        [modern ? motion.File : motion.file, motion.sound].filter(Boolean),
      ),
    ),
  ].filter(Boolean);
  const files = await allFiles(root);
  const missing = entries.filter((path) => !files.some((f) => f.path === path));
  for (const path of entries) within(root, path);
  const expressionInventory = await Promise.all(
    expressions.map(async (entry) => {
      const file = modern ? entry.File : entry.file;
      const data = await json(within(root, file));
      return {
        name: modern ? entry.Name : entry.name,
        file,
        parameters: modern ? (data.Parameters ?? []) : (data.params ?? []),
      };
    }),
  );
  const imageInventory = await Promise.all(
    textures.map(async (path) => {
      const bytes = await readFile(within(root, path));
      if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
        throw new Error('Textura não é PNG.');
      }
      return {
        path,
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
      };
    }),
  );
  const display = modern ? await json(within(root, refs.DisplayInfo)) : null;
  const documented = new Set(display?.Parameters.map((p) => p.Id) ?? []);
  const used = new Set(
    expressionInventory.flatMap((e) => e.parameters.map((p) => p.Id ?? p.id)),
  );
  return {
    source: url,
    archiveSha256: hash(await readFile(archive)),
    localRoot: relative(workspace, root).replaceAll('\\', '/'),
    format: modern ? 'Cubism 3+ runtime' : 'Cubism 2.x runtime',
    setting: settingName,
    author: null,
    assetLicense: 'not-found-in-package',
    inspectedAt: '2026-10-06',
    renderValidated: false,
    mocHeader: (await readFile(within(root, moc)))
      .subarray(0, 8)
      .toString('hex'),
    missingReferences: missing,
    textures: imageInventory,
    expressions: expressionInventory,
    motionGroups: Object.fromEntries(
      Object.entries(motions).map(([name, group]) => [name, group.length]),
    ),
    groups: setting.Groups ?? [],
    displayParameters: display?.Parameters ?? [],
    expressionParametersAbsentFromDisplayInfo: modern
      ? [...used].filter((id) => !documented.has(id))
      : null,
    editableProjectIncluded: files.some((f) => /\.(cmox|cmo3)$/u.test(f.path)),
    files,
  };
}

async function main() {
  const files = await inventory();
  const turns = parseDialogue(await readText('Dialogues/SG_Dialogues_EN.md'));
  const dialogues = prepareDialogue(turns);
  const story = prepareStory(await readText('Prompts/Story_EN.md'));
  const emails = JSON.parse(await readText('Dialogues/emails.json')).map(
    (mail, index) => ({
      id: `kurisu-email-${index}`,
      namespace: 'fiction-reference',
      kind: 'fictional-email',
      language: 'en',
      requiresCuration: true,
      autobiographicalEligible: false,
      sender: mail.From ?? null,
      senderUnverified: true,
      provenance: provenance('Dialogues/emails.json', { arrayIndex: index }),
      original: mail,
    }),
  );
  const prepared = resolve(reference, 'prepared');
  await mkdir(prepared, { recursive: true });
  for (const [name, records] of Object.entries({ dialogues, story, emails })) {
    await writeFile(
      resolve(prepared, `${name}.jsonl`),
      records.map((record) => JSON.stringify(record)).join('\n') + '\n',
    );
  }
  const statistics = {
    repositoryFiles: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    dialogueTurns: turns.length,
    speakers: Object.fromEntries(
      [...new Set(turns.map((t) => t.speaker))].map((speaker) => [
        speaker,
        turns.filter((t) => t.speaker === speaker).length,
      ]),
    ),
    kurisuTurns: turns.filter((t) => t.speaker === 'Kurisu').length,
    emptyKurisuTurns: turns.filter((t) => t.speaker === 'Kurisu' && !t.text)
      .length,
    styleCandidates: dialogues.length,
    uniqueStyleTexts: new Set(dialogues.map((d) => d.duplicateKey)).size,
    storyChunks: story.length,
    storyHeadings: [...new Set(story.map((s) => s.heading))],
    emails: emails.length,
    emailsWithoutSender: emails.filter((e) => !e.sender).length,
  };
  await save(resolve(reference, 'manifest.json'), {
    repository,
    revision,
    inspectedAt: '2026-10-06',
    declaredRepositoryLicense: 'GPL-3.0 (see original LICENSE)',
    thirdPartyFictionAndAudioRights: 'not-independently-established',
    productionEnabled: false,
    translated: false,
    statistics,
    files,
  });
  const avatarRoot = resolve(workspace, 'code/frontend/assets/avatar');
  const avatars = await Promise.all([
    inspectAvatar(
      resolve(avatarRoot, 'local/kurisu'),
      'kurisu.model.json',
      resolve(avatarRoot, 'local/kurisu.tar.gz'),
      'https://nyarchlinux.moe/kurisu.tar.gz',
      false,
    ),
    inspectAvatar(
      resolve(avatarRoot, 'local/modern/Kurisu'),
      'Kurisu.model3.json',
      resolve(avatarRoot, 'local/Kurisu.zip'),
      'https://nyarchlinux.moe/Kurisu.zip',
      true,
    ),
  ]);
  await save(resolve(avatarRoot, 'kurisu-sources.manifest.json'), {
    productionEnabled: false,
    preferredCandidate: 'local/modern/Kurisu/Kurisu.model3.json',
    preferenceBasis:
      'modern format and documented expression/lip-sync controls',
    models: avatars,
  });
  console.log(
    JSON.stringify({
      ...statistics,
      avatars: avatars.map((a) => ({
        format: a.format,
        files: a.files.length,
        missingReferences: a.missingReferences,
        undocumentedExpressionParameters:
          a.expressionParametersAbsentFromDisplayInfo,
      })),
    }),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
