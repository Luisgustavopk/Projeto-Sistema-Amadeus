/** Compose reactions without replacing the emotion with an unrelated gesture. */
export const ACCENTS = {
  provocacao_afetuosa: 'kz_piscadela_L',
  brincadeira: 'kz_lingua_de_fora',
  ironizar: 'kz_sorriso_de_canto',
  questionar: 'kz_sobrancelha_levantada',
  refletir: 'kz_olhar_para_cima_pensando',
  ponderar: 'kz_olhar_para_baixo_pensando',
  agradecer: 'kz_sorriso_olhos_fechados',
  demonstrar_afeto: 'kz_rubor_sorriso_timido',
  admitir_limite: 'kz_desvio_olhar_esq',
  desculpar_se: 'kz_rubor_timido_olhando_de_lado',
  discordar: 'kz_olhar_de_lado_cetico',
  recusar: 'kz_hmph_emburrada',
  limitar: 'kz_determinada_seria',
  alertar: 'kz_determinada_seria',
  cumprimentar: 'kz_sorriso_olhos_fechados',
  despedir_se: 'kz_sorriso_olhos_fechados',
  celebrar: 'kz_riso_leve_olhos_fechados',
  encorajar: 'kz_piscadela_R',
  ceder_turno: 'kz_atenta_ouvindo',
  explorar: 'kz_cabeca_inclinada_curiosa',
};
const WARM = new Set([
  'neutra',
  'curiosidade',
  'interesse',
  'alegria_discreta',
  'calor_discreto',
  'alegria',
  'entusiasmo',
  'divertimento',
  'orgulho',
  'satisfacao',
  'gratidao',
  'afeto',
  'ternura',
  'esperanca',
  'alivio',
  'serenidade',
  'admiracao',
]);
const WARM_ACCENTS = new Set([
  'provocacao_afetuosa',
  'brincadeira',
  'agradecer',
  'demonstrar_afeto',
  'cumprimentar',
  'despedir_se',
  'celebrar',
  'encorajar',
]);
export function planActing(event, catalog) {
  if (
    !catalog.emotions.includes(event.emotion) ||
    !catalog.intents.includes(event.intent) ||
    !Number.isFinite(event.intensity) ||
    event.intensity < 0 ||
    event.intensity > 1
  )
    throw new TypeError('Expressão fora do contrato.');
  const tier =
    event.intensity < 0.34
      ? 'sutil'
      : event.intensity < 0.67
        ? 'media'
        : 'forte';
  const name =
    event.emotion === 'neutra' ? 'kz_neutra' : `kz_${event.emotion}_${tier}`;
  const base = catalog.expressions.find((e) => e.Name === name);
  let accent = event.intensity >= 0.4 ? ACCENTS[event.intent] : undefined;
  if (WARM_ACCENTS.has(event.intent) && !WARM.has(event.emotion))
    accent = undefined;
  const parameters = new Map(base.parameters.map((p) => [p.Id, { ...p }]));
  // Base parameters own the face. An accent may only add unowned controls.
  for (const p of catalog.expressions.find((e) => e.Name === accent)
    ?.parameters ?? [])
    if (!parameters.has(p.Id)) parameters.set(p.Id, { ...p });
  return { name, accent, parameters: [...parameters.values()] };
}
