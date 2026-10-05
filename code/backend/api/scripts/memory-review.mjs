export function memoryReview(facts, now = Date.now()) {
  return facts.map((fact) => {
    const expired = fact.expiresAt !== null && fact.expiresAt <= now;
    const actionable = !expired && fact.status !== 'superseded';
    const ready =
      actionable &&
      fact.status === 'confirmed' &&
      fact.permission === 'eligible' &&
      fact.dataClass !== 'local-only';
    return {
      id: fact.id,
      text: fact.text,
      status: fact.status,
      permission: fact.permission,
      dataClass: fact.dataClass,
      version: fact.version,
      expiresAt: fact.expiresAt,
      state: expired
        ? 'expired'
        : fact.status === 'superseded'
          ? 'superseded'
          : ready
            ? 'eligible'
            : fact.status === 'suggested'
              ? 'needs-confirmation'
              : 'local-only',
      confirmLocal: actionable
        ? `npm run memory -- confirm --id=${fact.id} --permission=local-only`
        : null,
      confirmRemote:
        actionable && fact.dataClass !== 'local-only'
          ? `npm run memory -- confirm --id=${fact.id} --permission=eligible`
          : null,
      forget: `npm run memory -- forget --id=${fact.id} --version=${fact.version}`,
    };
  });
}

export function renderMemoryProcessing(status) {
  const pending = (status?.jobs ?? []).filter(
    (job) => job.status !== 'completed',
  );
  if (!pending.length) return '';
  const blocked = pending.filter((job) => job.lastError === 'QUOTA_EXCEEDED');
  return (
    `Memória em processamento: ${pending.length} trabalho(s) ainda sem concluir.` +
    (blocked.length
      ? ` ${blocked.length} aguardando cota do extrator. Aprovação automática não elimina essa espera.`
      : '') +
    '\nDetalhes: npm run memory -- status'
  );
}

export function renderMemoryReview(facts) {
  const entries = memoryReview(facts);
  if (!entries.length)
    return 'Nenhum fato para revisar. Aguarde o processamento da memória nas pausas ou após encerrar a conversa.';
  const labels = {
    expired: 'Vencido; não será recuperado.',
    superseded: 'Substituído por uma correção; não será recuperado.',
    eligible:
      'Confirmado e elegível; pode entrar no contexto remoto se relevante e permitido pela política.',
    'needs-confirmation':
      'Sugestão: ainda não entra no contexto. Revise o conteúdo antes de confirmar.',
    'local-only':
      'Confirmado para uso local; não entra no contexto de uma LLM remota.',
  };
  return entries
    .map((entry) =>
      [
        JSON.stringify(entry.text),
        `ID: ${entry.id} | versão: ${entry.version} | dados: ${entry.dataClass}`,
        labels[entry.state],
        ...(entry.state === 'needs-confirmation'
          ? ['Confirmar somente para uso local:', entry.confirmLocal]
          : []),
        ...((entry.state === 'needs-confirmation' ||
          entry.state === 'local-only') &&
        entry.confirmRemote
          ? ['Confirmar e permitir uso na LLM remota:', entry.confirmRemote]
          : []),
        'Esquecer (o histórico original permanece):',
        entry.forget,
      ].join('\n'),
    )
    .join('\n\n');
}
