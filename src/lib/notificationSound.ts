/**
 * Toca um som curto e discreto de notificação (dois tons ascendentes),
 * gerado via Web Audio API — não depende de nenhum arquivo de áudio externo.
 */
export function playNotificationSound() {
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();

    const tocarTom = (freq: number, inicio: number, duracao: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + inicio);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + inicio + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + duracao);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + duracao);
    };

    tocarTom(880, 0, 0.12);
    tocarTom(1174.66, 0.1, 0.18);

    setTimeout(() => ctx.close(), 500);
  } catch {
    // Ambientes sem suporte a Web Audio (raro) simplesmente não tocam o som.
  }
}
