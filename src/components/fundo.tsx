"use client";

import { useSyncExternalStore } from "react";
import { DitherBackground } from "@/components/ui/dither-background";

/**
 * Fundo animado do sistema inteiro.
 *
 * Fica `fixed` atrás de tudo, sem capturar clique. O véu radial por cima
 * mantém o miolo escuro o bastante para o texto continuar legível — os feixes
 * são claros e, sem ele, competem com listas de 200 linhas no centro da tela.
 */

const consultaMovimento = "(prefers-reduced-motion: reduce)";

function assinar(aoMudar: () => void) {
  const mq = window.matchMedia(consultaMovimento);
  mq.addEventListener("change", aoMudar);
  return () => mq.removeEventListener("change", aoMudar);
}

/**
 * `useSyncExternalStore` em vez de `useEffect` + `setState`: o valor vem de
 * fora do React e ler assim evita o render extra (e o lint do React 19).
 * No servidor devolve `true` para não mandar canvas no HTML inicial.
 */
function preferePoucoMovimento() {
  return window.matchMedia(consultaMovimento).matches;
}

export default function Fundo() {
  const reduzir = useSyncExternalStore(
    assinar,
    preferePoucoMovimento,
    () => true,
  );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      {!reduzir && (
        <DitherBackground
          waveColor={[0.23137254901960785, 0.5098039215686274, 0.9647058823529412]}
          enableMouseInteraction
          mouseRadius={0.4}
          colorNum={4}
          pixelSize={2}
          waveAmplitude={0.25}
          waveFrequency={5.5}
          waveSpeed={0.04}
        />
      )}
      {/* Véu: escurece o centro onde mora o conteúdo, deixa o brilho nas bordas. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(115% 85% at 50% 45%, rgba(5,5,5,0.92) 0%, rgba(5,5,5,0.78) 45%, rgba(5,5,5,0.35) 100%)",
        }}
      />
    </div>
  );
}
