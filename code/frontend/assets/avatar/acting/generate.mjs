// Gera expressões (.exp3.json), movimentos (.motion3.json) e catálogo tipado
// para o rig Cubism da Kurisu. NÃO altera .moc3, textura, física nem o visual:
// só combina parâmetros que o rig já expõe.
//
// uso: node generate.mjs [--expression-ts caminho/expression.ts] [--ranges ranges.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (n, d) =>
  args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d;
const EXPR_TS = opt(
  'expression-ts',
  fileURLToPath(
    new URL(
      '../../../../backend/api/src/domain/persona/expression.ts',
      import.meta.url,
    ),
  ),
);
const RANGES = opt(
  'ranges',
  fileURLToPath(new URL('./ranges.json', import.meta.url)),
);
const OUT = fileURLToPath(new URL('./generated/', import.meta.url));

// Premissas de convenção (Cubism padrão). Se o preview mostrar o sinal invertido, troque aqui.
const CFG = {
  browAngleSign: 1, // +: sobrancelha "brava" (ponta interna para baixo)
  browFormSign: 1,
  fade: 0.45,
  tiers: { sutil: 0.4, media: 0.7, forte: 1 },
};

// Subconjunto utilizado; ranges.json contém as faixas reais dos 72 parâmetros.
const KNOWN = new Set(
  `ParamAngleX ParamAngleY ParamAngleZ ParamEyeLOpen ParamEyeLSmile ParamEyeROpen ParamEyeRSmile ParamEyeBallX ParamEyeBallY
ParamBrowLY ParamBrowRY ParamBrowLX ParamBrowRX ParamBrowLAngle ParamBrowRAngle ParamBrowLForm ParamBrowRForm ParamMouthForm
ParamMouthOpenY MouthX TongueOut ParamCheek Tears RageSign Yandere HandChange EyeballSize Smile Sad Angry Surprissed Scared
ParamBodyAngleX ParamBodyAngleY ParamBodyAngleZ ParamBreath TearIdle ParamHairSide ParamHairBack
UpperArmLPhy UpperArmRPhy LowerArmLPhy LowerArmLRhy HandLPhy HandLRhy`.split(
    /\s+/,
  ),
);

const ranges = RANGES ? JSON.parse(fs.readFileSync(RANGES, 'utf8')) : null; // { Id: [min,max,def] }
const clamp = (id, v) => {
  const r = ranges?.[id];
  return r ? Math.min(r[1], Math.max(r[0], v)) : v;
};
const round = (v) => Math.round(v * 1000) / 1000;

// Chaves da especificação -> parâmetros. Pares aceitam sufixo L/R (ex.: byL, eoR).
const PAIRS = {
  eo: ['ParamEye%Open', 'Multiply'],
  sm: ['ParamEye%Smile', 'Add'],
  by: ['ParamBrow%Y', 'Add'],
  ba: ['ParamBrow%Angle', 'Add'],
  bf: ['ParamBrow%Form', 'Add'],
};
const SINGLE = {
  gx: 'ParamEyeBallX',
  gy: 'ParamEyeBallY',
  mf: 'ParamMouthForm',
  mx: 'MouthX',
  tg: 'TongueOut',
  ch: 'ParamCheek',
  te: 'Tears',
  rs: 'RageSign',
  sz: 'EyeballSize',
  pSmile: 'Smile',
  pSad: 'Sad',
  pA: 'Angry',
  pSurp: 'Surprissed',
  pScared: 'Scared',
  hx: 'ParamAngleX',
  hy: 'ParamAngleY',
  hz: 'ParamAngleZ',
};

function expand(spec, k) {
  const out = [];
  const push = (Id, v, Blend) => {
    if (v === undefined) return;
    if (Id.includes('BrowLAngle') || Id.includes('BrowRAngle'))
      v *= CFG.browAngleSign;
    if (Id.includes('BrowLForm') || Id.includes('BrowRForm'))
      v *= CFG.browFormSign;
    const s = Blend === 'Multiply' ? 1 - (1 - v) * k : v * k;
    out.push({ Id, Value: round(clamp(Id, s)), Blend });
  };
  for (const [key, [tpl, blend]] of Object.entries(PAIRS)) {
    push(tpl.replace('%', 'L'), spec[key + 'L'] ?? spec[key], blend);
    push(tpl.replace('%', 'R'), spec[key + 'R'] ?? spec[key], blend);
  }
  for (const [key, id] of Object.entries(SINGLE)) push(id, spec[key], 'Add');
  return out;
}

// ---------- 50 emoções do expression.ts (intensidade máxima; as faixas escalam) ----------
const E = {
  neutra: { eo: 1 },
  curiosidade: { by: 0.35, gy: 0.2, hz: 5, hy: -3, mf: 0.1 },
  firmeza_calma: { by: -0.15, ba: 0.25, mf: -0.05, eo: 0.92, hy: -2 },
  ironia_leve: {
    eoL: 0.85,
    eoR: 0.7,
    byL: 0.25,
    byR: -0.1,
    ba: 0.15,
    mf: 0.35,
    mx: 0.4,
    hz: 4,
  },
  irritacao_leve: { by: -0.2, ba: 0.45, eo: 0.85, mf: -0.25, pA: 0.25 },
  constrangimento_leve: {
    ch: 0.35,
    gx: 0.4,
    gy: -0.25,
    by: 0.1,
    mf: 0.1,
    hx: 6,
    eo: 0.9,
  },
  preocupacao: { by: 0.2, ba: -0.5, eo: 0.95, mf: -0.25, pSad: 0.3, gy: -0.1 },
  autocritica_leve: {
    by: -0.1,
    ba: -0.2,
    gy: -0.35,
    mf: -0.2,
    hy: -5,
    eo: 0.85,
  },
  calor_discreto: { sm: 0.35, mf: 0.3, ch: 0.12, by: 0.05, eo: 0.9 },
  alegria_discreta: { sm: 0.45, mf: 0.5, ch: 0.15, pSmile: 0.35, eo: 0.9 },
  alegria: { sm: 0.8, mf: 0.8, ch: 0.25, pSmile: 0.8, by: 0.15 },
  entusiasmo: { sm: 0.7, mf: 0.9, ch: 0.3, pSmile: 1, by: 0.35, hy: 3, hz: -4 },
  divertimento: { sm: 0.7, mf: 0.65, mx: 0.2, ch: 0.2, pSmile: 0.6, hz: 5 },
  orgulho: { eo: 0.82, by: 0.1, ba: 0.2, mf: 0.45, hy: 5, pSmile: 0.25 },
  satisfacao: { sm: 0.5, mf: 0.45, eo: 0.85, pSmile: 0.4, hy: 2 },
  gratidao: {
    sm: 0.55,
    mf: 0.4,
    ch: 0.35,
    by: 0.2,
    ba: -0.25,
    pSmile: 0.4,
    hy: -4,
  },
  afeto: {
    sm: 0.65,
    mf: 0.55,
    ch: 0.45,
    by: 0.1,
    ba: -0.15,
    pSmile: 0.55,
    hz: -4,
  },
  ternura: {
    sm: 0.6,
    mf: 0.4,
    ch: 0.4,
    eo: 0.78,
    ba: -0.3,
    by: 0.1,
    pSmile: 0.4,
    hz: -6,
  },
  esperanca: { by: 0.35, ba: -0.3, mf: 0.3, gy: 0.25, pSmile: 0.2 },
  alivio: { sm: 0.35, eo: 0.7, mf: 0.3, by: 0.1, hy: -4, pSmile: 0.2 },
  serenidade: { eo: 0.72, sm: 0.2, mf: 0.2, by: 0.05 },
  surpresa: { by: 0.6, pSurp: 0.7 },
  espanto: { by: 0.9, pSurp: 1, ba: -0.1, hy: 4 },
  admiracao: { by: 0.5, pSurp: 0.4, sm: 0.2, mf: 0.35, gy: 0.15, pSmile: 0.2 },
  interesse: { by: 0.25, gy: 0.1, hz: 4, mf: 0.1 },
  duvida: {
    byL: 0.45,
    byR: -0.1,
    baL: 0.2,
    baR: 0.3,
    mf: -0.1,
    mx: -0.2,
    hz: 6,
  },
  confusao: {
    byL: 0.4,
    byR: 0.2,
    ba: -0.25,
    mf: -0.2,
    mx: -0.3,
    hz: 7,
    gx: 0.2,
    pSad: 0.1,
  },
  ceticismo: {
    eo: 0.75,
    byL: 0.3,
    byR: -0.15,
    ba: 0.2,
    mf: -0.15,
    mx: 0.2,
    gx: 0.35,
  },
  hesitacao: {
    by: 0.1,
    ba: -0.2,
    gx: -0.45,
    gy: -0.1,
    mf: -0.1,
    hx: 5,
    eo: 0.9,
  },
  constrangimento: {
    ch: 0.65,
    gx: 0.55,
    gy: -0.35,
    ba: -0.2,
    mf: 0.05,
    hx: 9,
    hy: -4,
    eo: 0.85,
  },
  vergonha: {
    ch: 1,
    gx: 0.6,
    gy: -0.5,
    ba: -0.35,
    mf: -0.1,
    hx: 12,
    hy: -8,
    eo: 0.78,
    pSad: 0.15,
  },
  vulnerabilidade: {
    by: 0.25,
    ba: -0.5,
    gy: -0.3,
    mf: -0.15,
    te: 0.15,
    eo: 0.9,
    pSad: 0.35,
    hy: -4,
  },
  saudade: {
    ba: -0.35,
    by: 0.1,
    eo: 0.8,
    gy: -0.25,
    mf: 0.1,
    sm: 0.2,
    pSad: 0.25,
  },
  nostalgia: { eo: 0.8, sm: 0.25, mf: 0.25, gy: 0.2, ba: -0.2, hz: -3 },
  tristeza: {
    pSad: 0.8,
    ba: -0.55,
    by: -0.05,
    eo: 0.8,
    mf: -0.45,
    gy: -0.35,
    hy: -6,
    te: 0.15,
  },
  melancolia: { pSad: 0.55, ba: -0.35, eo: 0.7, mf: -0.3, gy: -0.3, hy: -5 },
  decepcao: {
    pSad: 0.4,
    ba: -0.2,
    eo: 0.75,
    mf: -0.4,
    gy: -0.25,
    by: -0.1,
    hy: -4,
  },
  frustracao: { pA: 0.4, ba: 0.55, by: -0.25, eo: 0.8, mf: -0.35, mx: 0.15 },
  irritacao: { pA: 0.6, ba: 0.7, by: -0.35, eo: 0.78, mf: -0.4 },
  raiva: { pA: 1, ba: 0.9, by: -0.5, eo: 0.85, mf: -0.5, rs: 0.4 },
  indignacao: { pA: 0.8, ba: 0.8, eo: 1, mf: -0.35, hy: 3, rs: 0.2 },
  impaciencia: {
    pA: 0.3,
    ba: 0.35,
    eo: 0.7,
    by: -0.2,
    mf: -0.3,
    gx: 0.5,
    mx: -0.2,
  },
  desanimo: { pSad: 0.5, eo: 0.6, ba: -0.3, mf: -0.35, gy: -0.4, hy: -8 },
  tedio: { eo: 0.5, by: -0.1, mf: -0.2, gx: 0.5, hz: 5 },
  cansaco: { eo: 0.4, by: -0.1, ba: -0.15, mf: -0.15, gy: -0.3, hy: -7 },
  apreensao: { by: 0.4, ba: -0.45, pScared: 0.3, mf: -0.2, gx: -0.3 },
  medo: { pScared: 0.9, by: 0.55, ba: -0.5, mf: -0.3, te: 0.1 },
  inseguranca: {
    by: 0.2,
    ba: -0.35,
    gx: -0.4,
    gy: -0.2,
    mf: -0.15,
    hx: 6,
    eo: 0.95,
  },
  arrependimento: {
    pSad: 0.35,
    ba: -0.45,
    gy: -0.4,
    mf: -0.3,
    eo: 0.82,
    hy: -6,
  },
  culpa: {
    pSad: 0.45,
    ba: -0.5,
    gy: -0.5,
    mf: -0.35,
    eo: 0.78,
    hy: -8,
    ch: 0.15,
  },
};

// ---------- extras inspirados no anime/jogo (intensidade única) ----------
// ref: sprite do jogo (CRS_J?D/E_4000xxyy) ou print enviado.
const X = {
  piscadela_L: [
    { eoL: 0, smL: 0.5, eoR: 1, mf: 0.6, mx: 0.2, hz: 6, ch: 0.1, pSmile: 0.4 },
    'Piscadela com o olho L fechado',
    'JLD_40000200-202; prints 2 e 3',
  ],
  piscadela_R: [
    {
      eoR: 0,
      smR: 0.5,
      eoL: 1,
      mf: 0.6,
      mx: -0.2,
      hz: -6,
      ch: 0.1,
      pSmile: 0.4,
    },
    'Piscadela com o olho R fechado',
    'JLD_40000200-202; prints 2 e 3',
  ],
  piscadela_lingua_L: [
    { eoL: 0, smL: 0.5, mf: 0.7, tg: 1, hz: 6, ch: 0.25, pSmile: 0.5 },
    'Piscadela com a língua de fora',
    'print 5',
  ],
  lingua_de_fora: [
    { tg: 1, mf: 0.5, sm: 0.3, ch: 0.2, pSmile: 0.4, hz: 6 },
    'Língua de fora, brincalhona',
    'print 5',
  ],
  sorriso_olhos_fechados: [
    { eo: 0, sm: 1, mf: 0.7, ch: 0.2, pSmile: 0.5 },
    'Sorriso de olhos fechados (“É um prazer”)',
    'JLD_40000600-602; print 8',
  ],
  sorriso_largo_olhos_fechados_rubor: [
    { eo: 0, sm: 1, mf: 1, ch: 0.8, pSmile: 0.8, hz: -3 },
    'Sorriso largo, olhos fechados e rubor',
    'print 4',
  ],
  olhos_fechados_serena: [
    { eo: 0, mf: -0.05, by: -0.05, hy: -4, hz: -6 },
    'Olhos fechados, cabeça levemente inclinada',
    'JLD_4000a00-a02; print 10',
  ],
  suspiro: [
    { eo: 0.2, mf: -0.2, by: 0.1, ba: -0.15, hy: -6 },
    'Pálpebras caídas de suspiro',
    'JLD_40000400',
  ],
  desvio_olhar_esq: [
    { gx: -0.9, gy: -0.1, by: 0.1, hx: -8 },
    'Desvia o olhar para a esquerda da tela',
    'JLD_40000500',
  ],
  desvio_olhar_dir: [
    { gx: 0.9, gy: -0.1, by: 0.1, hx: 8 },
    'Desvia o olhar para a direita da tela',
    'JLD_40000500',
  ],
  olhar_para_cima_pensando: [
    { gx: -0.4, gy: 0.8, by: 0.2, hz: 5, hy: 3 },
    'Olha para cima enquanto pensa',
    'pose de reflexão',
  ],
  olhar_para_baixo_pensando: [
    { gx: 0.3, gy: -0.7, by: -0.05, hy: -5 },
    'Olha para baixo enquanto pondera',
    'JLD_40000300',
  ],
  hmph_emburrada: [
    {
      eo: 0.7,
      gx: 0.7,
      gy: -0.1,
      ba: 0.4,
      by: -0.15,
      mf: -0.5,
      mx: -0.2,
      hx: -10,
      hz: 5,
      pA: 0.2,
    },
    '“Hmph!”: vira o rosto, emburrada',
    'print 9',
  ],
  olhar_de_lado_cetico: [
    { eo: 0.6, gx: 0.85, by: -0.1, ba: 0.3, byL: 0.3, mf: -0.2, mx: 0.3 },
    'Olhar de lado, cético',
    'JLD_40000500',
  ],
  sobrancelha_levantada: [
    { byL: 0.8, byR: -0.1, baL: 0.2, mf: 0.15, mx: 0.3 },
    'Uma sobrancelha levantada',
    'prints 2 e 3',
  ],
  sorriso_de_canto: [
    { mf: 0.5, mx: 0.6, eoL: 0.8, eoR: 0.7, byL: 0.25, hz: 4, ch: 0.05 },
    'Sorriso de canto, provocador',
    'JLE_40000300-302',
  ],
  sorriso_convencido: [
    { eo: 0.7, sm: 0.3, mf: 0.55, mx: 0.3, by: -0.05, hy: 3, hz: -4 },
    'Sorriso convencido, queixo levemente erguido',
    'JLE_40000300',
  ],
  olhos_marejados: [
    {
      te: 0.7,
      pSad: 0.5,
      ba: -0.5,
      by: 0.3,
      eo: 0.95,
      mf: -0.2,
      gy: -0.15,
      hy: -3,
    },
    'Olhos marejados e brilhantes',
    'Aproximação usando Tears do rig; lágrimas não confirmadas nos sprites 40000c',
  ],
  chorando_contido: [
    { te: 1, pSad: 0.8, ba: -0.6, eo: 0.7, mf: -0.45, ch: 0.3, hy: -7 },
    'Choro contido',
    'Aproximação usando Tears do rig; lágrimas não confirmadas nos sprites 40000c',
  ],
  rubor_timido_olhando_de_lado: [
    { ch: 0.8, gx: 0.5, gy: -0.3, ba: -0.25, mf: 0.15, eo: 0.9, hx: 8 },
    'Rubor tímido, olhando de lado',
    'JLD_40000800-802; JLE_40000200-202',
  ],
  rubor_sorriso_timido: [
    { ch: 0.7, sm: 0.4, mf: 0.5, gx: 0.4, gy: -0.3, hx: 6, pSmile: 0.35 },
    'Rubor com sorriso tímido',
    'JLD_40000800-802',
  ],
  determinada_seria: [
    { eo: 0.9, by: -0.2, ba: 0.35, mf: -0.05, hy: -1 },
    'Séria e determinada',
    'JLD_40000700-702',
  ],
  atenta_ouvindo: [
    { by: 0.15, hz: 4, hy: -2 },
    'Atenta, ouvindo',
    'JLD_40000100',
  ],
  cabeca_inclinada_curiosa: [
    { by: 0.3, hz: 9, gx: 0.15, mf: 0.1 },
    'Cabeça inclinada, curiosa',
    'JLD_40000900-902',
  ],
  bufo_irritado: [
    { pA: 0.7, rs: 1, ba: 0.8, by: -0.4, eo: 0.8, mf: -0.5 },
    'Bufo irritado com sinal de raiva',
    'Aproximação usando Angry/RageSign do rig; sem correspondência comprovada no sprite 40000c',
  ],
  sombria_seria: [
    { eo: 0.7, by: -0.3, ba: 0.5, mf: -0.15, hy: 2 },
    'Olhar frio e sério',
    'JLE_40000500',
  ],
  susto_recuando: [
    { pScared: 1, by: 0.7, ba: -0.5, mf: -0.35, hy: 5 },
    'Susto, recuando a cabeça',
    'JLD_4000b00-b02',
  ],
  riso_leve_olhos_fechados: [
    { eo: 0.1, sm: 0.9, mf: 0.8, ch: 0.3, pSmile: 0.7, hz: -5 },
    'Riso leve de olhos fechados',
    'JLD_40000600-602',
  ],
  beicinho: [
    {
      mf: -0.55,
      by: 0.2,
      ba: -0.25,
      ch: 0.2,
      gx: 0.3,
      gy: -0.2,
      eo: 0.9,
      hz: 4,
    },
    'Beicinho, contrariada',
    'JLE_40000400-402',
  ],
};

// ---------- intenções -> acento extra / movimento ----------
const ACCENT = {
  provocacao_afetuosa: 'piscadela_L',
  brincadeira: 'lingua_de_fora',
  ironizar: 'sorriso_de_canto',
  questionar: 'sobrancelha_levantada',
  refletir: 'olhar_para_cima_pensando',
  ponderar: 'olhar_para_baixo_pensando',
  agradecer: 'sorriso_olhos_fechados',
  demonstrar_afeto: 'sorriso_largo_olhos_fechados_rubor',
  admitir_limite: 'desvio_olhar_esq',
  desculpar_se: 'rubor_timido_olhando_de_lado',
  discordar: 'olhar_de_lado_cetico',
  recusar: 'hmph_emburrada',
  limitar: 'determinada_seria',
  alertar: 'determinada_seria',
  cumprimentar: 'sorriso_olhos_fechados',
  despedir_se: 'sorriso_olhos_fechados',
  celebrar: 'riso_leve_olhos_fechados',
  encorajar: 'piscadela_R',
  ceder_turno: 'atenta_ouvindo',
  explorar: 'cabeca_inclinada_curiosa',
};
const MOTION_INTENT = {
  concordar: 'aceno_sim',
  discordar: 'negar_cabeca',
  refletir: 'pensando',
  recusar: 'virar_emburrada',
  desculpar_se: 'timida_virar_rosto',
  explorar: 'inclinar_curiosa',
  admitir_limite: 'desviar_olhar',
};
const MOTION_EMOTION = {
  surpresa: 'surpresa_recuo',
  espanto: 'surpresa_recuo',
  vergonha: 'timida_virar_rosto',
  cansaco: 'suspiro',
  tedio: 'suspiro',
};

// ---------- movimentos (poses de cabeça/corpo); graus nos ângulos ----------
const M = {
  aceno_sim: [
    1.6,
    {
      ParamAngleY: [
        [0, 0],
        [0.35, -9],
        [0.7, 1],
        [1.05, -7],
        [1.6, 0],
      ],
      ParamBodyAngleY: [
        [0, 0],
        [0.35, -2],
        [0.7, 0],
        [1.05, -1.5],
        [1.6, 0],
      ],
    },
  ],
  negar_cabeca: [
    1.8,
    {
      ParamAngleX: [
        [0, 0],
        [0.3, 10],
        [0.7, -10],
        [1.1, 8],
        [1.45, -5],
        [1.8, 0],
      ],
      ParamAngleZ: [
        [0, 0],
        [0.3, 3],
        [0.7, -3],
        [1.1, 2],
        [1.8, 0],
      ],
    },
  ],
  inclinar_curiosa: [
    2.4,
    {
      ParamAngleZ: [
        [0, 0],
        [0.6, 9],
        [1.8, 9],
        [2.4, 0],
      ],
      ParamAngleY: [
        [0, 0],
        [0.6, 3],
        [1.8, 3],
        [2.4, 0],
      ],
      ParamEyeBallY: [
        [0, 0],
        [0.6, 0.2],
        [1.8, 0.2],
        [2.4, 0],
      ],
    },
  ],
  desviar_olhar: [
    2.4,
    {
      ParamAngleX: [
        [0, 0],
        [0.5, 12],
        [1.7, 12],
        [2.4, 0],
      ],
      ParamEyeBallX: [
        [0, 0],
        [0.4, 0.8],
        [1.8, 0.8],
        [2.4, 0],
      ],
      ParamAngleY: [
        [0, 0],
        [0.5, -3],
        [1.7, -3],
        [2.4, 0],
      ],
    },
  ],
  virar_emburrada: [
    3.2,
    {
      ParamAngleX: [
        [0, 0],
        [0.5, -28],
        [2.4, -28],
        [3.2, 0],
      ],
      ParamAngleZ: [
        [0, 0],
        [0.5, 7],
        [2.4, 7],
        [3.2, 0],
      ],
      ParamBodyAngleX: [
        [0, 0],
        [0.5, -8],
        [2.4, -8],
        [3.2, 0],
      ],
      ParamEyeBallX: [
        [0, 0],
        [0.4, 0],
        [2.4, 0],
        [3.2, 0],
      ],
      ParamEyeLOpen: [
        [0, 1],
        [0.2, 0],
        [2.5, 0],
        [3.2, 1],
      ],
      ParamEyeROpen: [
        [0, 1],
        [0.2, 0],
        [2.5, 0],
        [3.2, 1],
      ],
      ParamMouthForm: [
        [0, 0],
        [0.4, -0.55],
        [2.4, -0.55],
        [3.2, 0],
      ],
      Angry: [
        [0, 0],
        [0.4, 0.65],
        [2.4, 0.65],
        [3.2, 0],
      ],
      Smile: [
        [0, 0],
        [3.2, 0],
      ],
    },
  ],
  suspiro: [
    3,
    {
      ParamBreath: [
        [0, 0],
        [1, 1],
        [1.3, 1],
        [2.6, 0],
        [3, 0],
      ],
      ParamAngleY: [
        [0, 0],
        [1, 3],
        [1.3, 3],
        [2, -6],
        [3, 0],
      ],
      ParamBodyAngleY: [
        [0, 0],
        [1, 1.5],
        [1.3, 1.5],
        [2, -2],
        [3, 0],
      ],
    },
  ],
  pensando: [
    3,
    {
      ParamEyeBallX: [
        [0, 0],
        [0.5, -0.4],
        [2.4, -0.4],
        [3, 0],
      ],
      ParamEyeBallY: [
        [0, 0],
        [0.5, 0.7],
        [2.4, 0.7],
        [3, 0],
      ],
      ParamAngleZ: [
        [0, 0],
        [0.7, 5],
        [2.3, 5],
        [3, 0],
      ],
      ParamAngleX: [
        [0, 0],
        [0.7, 6],
        [2.3, 6],
        [3, 0],
      ],
    },
  ],
  surpresa_recuo: [
    2.4,
    {
      ParamAngleY: [
        [0, 0],
        [0.25, 22],
        [1.1, 17],
        [2.4, 0],
      ],
      ParamBodyAngleY: [
        [0, 0],
        [0.25, 9],
        [1.1, 7],
        [2.4, 0],
      ],
      Surprissed: [
        [0, 0],
        [0.2, 1],
        [1.2, 1],
        [2.4, 0],
      ],
      ParamEyeLOpen: [
        [0, 1],
        [0.2, 1.4],
        [1.2, 1.3],
        [2.4, 1],
      ],
      ParamEyeROpen: [
        [0, 1],
        [0.2, 1.4],
        [1.2, 1.3],
        [2.4, 1],
      ],
      ParamBrowLY: [
        [0, 0],
        [0.2, 0.75],
        [1.2, 0.6],
        [2.4, 0],
      ],
      ParamBrowRY: [
        [0, 0],
        [0.2, 0.75],
        [1.2, 0.6],
        [2.4, 0],
      ],
      ParamMouthOpenY: [
        [0, 0],
        [0.2, 0.5],
        [1.2, 0.4],
        [2.4, 0],
      ],
      ParamMouthForm: [
        [0, 0],
        [0.2, -0.3],
        [1.2, -0.2],
        [2.4, 0],
      ],
      Smile: [
        [0, 0],
        [2.4, 0],
      ],
      Angry: [
        [0, 0],
        [2.4, 0],
      ],
    },
  ],
  timida_virar_rosto: [
    3,
    {
      ParamAngleX: [
        [0, 0],
        [0.6, 14],
        [2.3, 14],
        [3, 0],
      ],
      ParamAngleY: [
        [0, 0],
        [0.6, -6],
        [2.3, -6],
        [3, 0],
      ],
      ParamCheek: [
        [0, 0],
        [0.6, 0.8],
        [2.3, 0.8],
        [3, 0],
      ],
      ParamEyeBallX: [
        [0, 0],
        [0.5, 0.6],
        [2.3, 0.6],
        [3, 0],
      ],
    },
  ],
  piscar_lento: [
    1.2,
    {
      ParamEyeLOpen: [
        [0, 1],
        [0.35, 0],
        [0.6, 0],
        [1.2, 1],
      ],
      ParamEyeROpen: [
        [0, 1],
        [0.35, 0],
        [0.6, 0],
        [1.2, 1],
      ],
    },
  ],
};

// Complete the facial reaction so a previously selected face cannot leak
// tears, a smile or a sideways gaze into the authored gesture.
const FACE_REST = {
  Smile: 0,
  Angry: 0,
  Sad: 0,
  Scared: 0,
  Surprissed: 0,
  Tears: 0,
  RageSign: 0,
  ParamCheek: 0,
  TongueOut: 0,
  ParamEyeLSmile: 0,
  ParamEyeRSmile: 0,
  ParamEyeBallX: 0,
  ParamEyeBallY: 0,
  ParamBrowLY: 0,
  ParamBrowRY: 0,
  ParamBrowLAngle: 0,
  ParamBrowRAngle: 0,
  ParamBrowLForm: 0,
  ParamBrowRForm: 0,
};
for (const name of ['virar_emburrada', 'surpresa_recuo']) {
  const [duration, curves] = M[name];
  for (const [id, value] of Object.entries(FACE_REST))
    curves[id] ??= [
      [0, value],
      [duration, value],
    ];
}

// Renderer framing complements the existing torso deformation; no new rig.
const PRESENTATION = {
  surpresa_recuo: {
    scale: [
      [0, 1],
      [0.25, 0.9],
      [1.1, 0.93],
      [2.4, 1],
    ],
    x: [
      [0, 0],
      [2.4, 0],
    ],
    y: [
      [0, 0],
      [0.25, -0.05],
      [1.1, -0.035],
      [2.4, 0],
    ],
  },
};

// ---------- validações ----------
const src = fs.existsSync(EXPR_TS) ? fs.readFileSync(EXPR_TS, 'utf8') : null;
const enumOf = (name) => {
  const m = src?.match(
    new RegExp(name + ':\\s*z\\.enum\\(\\[([\\s\\S]*?)\\]\\)'),
  );
  return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null;
};
const emotions = enumOf('emotion');
const intents = enumOf('intent');
if (!emotions || !intents)
  throw new Error('Contrato de expressão ausente ou ilegível: ' + EXPR_TS);
const missing = emotions.filter((e) => !(e in E));
if (missing.length)
  throw new Error('Emoções sem especificação: ' + missing.join(', '));
for (const e of Object.keys(E))
  if (!emotions.includes(e))
    console.warn('! especificação sem emoção no schema:', e);
for (const k of Object.keys(ACCENT)) {
  if (!intents.includes(k))
    throw new Error('Intenção desconhecida em ACCENT: ' + k);
  if (!X[ACCENT[k]]) throw new Error('Acento inexistente: ' + ACCENT[k]);
}
for (const [k, v] of Object.entries(MOTION_INTENT)) {
  if (!intents.includes(k))
    throw new Error('Intenção desconhecida em MOTION_INTENT: ' + k);
  if (!M[v]) throw new Error('Movimento inexistente: ' + v);
}
for (const [k, v] of Object.entries(MOTION_EMOTION)) {
  if (!emotions.includes(k))
    throw new Error('Emoção desconhecida em MOTION_EMOTION: ' + k);
  if (!M[v]) throw new Error('Movimento inexistente: ' + v);
}

// ---------- escrita ----------
const w = (p, data) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(
    p,
    typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n',
  );
};
// Retire this exact generated file; no recursive cleanup and no source-model edits.
fs.rmSync(path.join(OUT, 'motions/amadeus/kz_risada_balanco.motion3.json'), {
  force: true,
});
// Write only our generated files; never recursively remove a caller-supplied path.
const exps = [];
const emitExp = (name, spec, k, meta) => {
  const Parameters = expand(spec, k);
  for (const p of Parameters)
    if (!KNOWN.has(p.Id) || !ranges[p.Id])
      throw new Error(`${name}: parâmetro inexistente no rig: ${p.Id}`);
  w(path.join(OUT, 'exp/amadeus', name + '.exp3.json'), {
    Type: 'Live2D Expression',
    FadeInTime: CFG.fade,
    FadeOutTime: CFG.fade,
    Parameters,
  });
  exps.push({
    Name: name,
    File: `exp/amadeus/${name}.exp3.json`,
    ...meta,
    referenceStatus:
      meta.kind === 'extra'
        ? 'illustrative-candidate'
        : 'parameter-combination',
  });
};
for (const emo of emotions) {
  if (emo === 'neutra') {
    emitExp('kz_neutra', E.neutra, 1, { kind: 'emotion', emotion: emo });
    continue;
  }
  for (const [tier, k] of Object.entries(CFG.tiers))
    emitExp(`kz_${emo}_${tier}`, E[emo], k, {
      kind: 'emotion',
      emotion: emo,
      tier,
    });
}
for (const [id, [spec, desc, ref]] of Object.entries(X))
  emitExp('kz_' + id, spec, 1, { kind: 'extra', desc, ref });

const motions = [];
for (const [id, [dur, curves]] of Object.entries(M)) {
  let segs = 0,
    pts = 0;
  const Curves = Object.entries(curves).map(([Id, p]) => {
    if (!KNOWN.has(Id) || !ranges[Id])
      throw new Error(`${id}: parâmetro inexistente: ${Id}`);
    if (p[0][0] !== 0 || p[p.length - 1][0] !== dur)
      throw new Error(`${id}/${Id}: a curva deve ir de 0 a ${dur}`);
    const s = [p[0][0], clamp(Id, p[0][1])];
    for (let i = 1; i < p.length; i++) {
      const [t0, v0] = p[i - 1],
        [t1, v1] = p[i],
        d = t1 - t0;
      s.push(
        1,
        round(t0 + d / 3),
        clamp(Id, v0),
        round(t0 + (2 * d) / 3),
        clamp(Id, v1),
        t1,
        clamp(Id, v1),
      );
    }
    segs += p.length - 1;
    pts += 1 + 3 * (p.length - 1);
    return { Target: 'Parameter', Id, Segments: s };
  });
  w(path.join(OUT, 'motions/amadeus', `kz_${id}.motion3.json`), {
    Version: 3,
    Meta: {
      Duration: dur,
      Fps: 30,
      Loop: false,
      AreBeziersRestricted: true,
      CurveCount: Curves.length,
      TotalSegmentCount: segs,
      TotalPointCount: pts,
      UserDataCount: 0,
      TotalUserDataSize: 0,
    },
    Curves,
  });
  motions.push({
    Name: 'kz_' + id,
    File: `motions/amadeus/kz_${id}.motion3.json`,
    FadeInTime: 0.4,
    FadeOutTime: 0.5,
  });
}
w(path.join(OUT, 'manifest.json'), {
  generatedBy: 'generate.mjs',
  fade: CFG.fade,
  rangesApplied: !!ranges,
  expressions: exps,
  motionGroup: 'Amadeus',
  motions,
});

const catalog = {
  emotions,
  intents,
  expressions: exps.map((e) => ({
    ...e,
    parameters: JSON.parse(fs.readFileSync(path.join(OUT, e.File), 'utf8'))
      .Parameters,
  })),
  motions: motions.map((m) => ({
    ...m,
    duration: JSON.parse(fs.readFileSync(path.join(OUT, m.File), 'utf8')).Meta
      .Duration,
    pose: Object.fromEntries(
      Object.entries(M[m.Name.slice(3)][1]).map(([Id, points]) => [
        Id,
        points.map(([time, value]) => [time, clamp(Id, value)]),
      ]),
    ),
    presentation: PRESENTATION[m.Name.slice(3)],
  })),
};
w(
  path.join(OUT, 'catalog.mjs'),
  `// Generated locally from curated parameter combinations. No avatar artwork.\nexport const ACTING_CATALOG = ${JSON.stringify(catalog, null, 2)};\n`,
);

// ---------- catálogo ----------
const cat = [
  `# Catálogo de expressões geradas\n`,
  `${exps.length} expressões (.exp3.json) e ${motions.length} movimentos. Tudo usa só parâmetros que o rig já expõe.\n`,
  `## Emoções do expression.ts (${emotions.length}) — arquivos \`kz_<emoção>_<sutil|media|forte>\`\n`,
  '| Emoção | Parâmetros em intensidade máxima |',
  '|---|---|',
  ...emotions.map(
    (e) =>
      `| ${e} | ${Object.entries(E[e])
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')} |`,
  ),
  `\n## Extras inspirados no anime/jogo (${Object.keys(X).length}) — arquivos \`kz_<nome>\`\n`,
  '| Nome | Descrição | Referência |',
  '|---|---|---|',
  ...Object.entries(X).map(([id, [, d, r]]) => `| ${id} | ${d} | ${r} |`),
  `\n## Movimentos (grupo \`${'Amadeus'}\`)\n`,
  '| Nome | Duração |',
  '|---|---|',
  ...Object.entries(M).map(([id, [d]]) => `| kz_${id} | ${d}s |`),
].join('\n');
w(path.join(OUT, 'catalog.md'), cat + '\n');
console.log(
  `ok: ${exps.length} expressões, ${motions.length} movimentos -> ${OUT}`,
);
