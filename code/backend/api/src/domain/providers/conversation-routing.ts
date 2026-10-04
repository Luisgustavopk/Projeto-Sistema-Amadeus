/** Conservative allowlist: unrecognized requests remain with the cloud chain. */
export function isCasualConversation(text: string): boolean {
  const normalized = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase();

  if (
    !normalized ||
    normalized.length > 300 ||
    /\b(codigo|program\w*|implement\w*|calcu\w*|demonst\w*|prov\w*|teorema|analis\w*|compar\w*|pesquis\w*|expli\w*|diagnostic\w*|invest\w*|contrat\w*|medicamento)\b/.test(
      normalized,
    )
  ) {
    return false;
  }

  const greeting = normalized
    .replace(/[.,!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    /^(?:(?:oi|ola|e ai|bom dia|boa tarde|boa noite)(?: (?:tudo bem|como vai|como voce esta|como voce ta|como e que ta|como vai voce|como ta|como esta|beleza))*|(?:tudo bem|como vai|como voce esta|como foi (?:seu|o seu) dia|obrigad[oa]|valeu|ate mais|tchau))$/.test(
      greeting,
    ) ||
    /^(hmm?[, ]*)?((entao[, ]*)?(me )?(conta|conte|inventa|invente) (uma )?historia|fala qualquer coisa|me conta algo|voce (e|esta|ta)|nao estou bem|estou (bem|triste|feliz)|eu achei|lembra\??$)/.test(
      normalized,
    )
  );
}
