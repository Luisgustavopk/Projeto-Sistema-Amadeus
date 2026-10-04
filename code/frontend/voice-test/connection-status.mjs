export function describeCallClosure({ code, reason }) {
  if (code === 4001)
    return "Esta chamada foi substituída por outra conexão do mesmo usuário. Use apenas uma aba para conversar.";
  if (code === 1000) {
    return reason === "Voice connection expired"
      ? "A sessão chegou ao limite de duração. Conecte novamente."
      : null;
  }
  if (code === 1012)
    return "A API foi reiniciada. Conecte novamente para iniciar outra chamada.";
  if (code === 1008 && reason === "Invalid playback")
    return "A reprodução encontrou áudio inválido e encerrou a chamada (1008).";
  if (code === 1008)
    return "A chamada foi encerrada por uma falha de validação ou de áudio (1008). Consulte os eventos técnicos e o terminal da API.";
  if (code === 1009)
    return "A chamada recebeu uma mensagem acima do tamanho permitido (1009).";
  if (code === 1011)
    return "A API encerrou a chamada por uma falha interna (1011). Consulte o terminal da API.";
  return (
    "A chamada perdeu a conexão (" +
    code +
    "). Confira se a API continua em execução e conecte novamente."
  );
}
