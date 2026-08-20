"use client";

import { useSyncExternalStore } from "react";
import { ShaderBackground } from "@/components/ui/pulsing-border";

/**
 * Fundo animado do sistema inteiro.
 *
 * Fica `fixed` atrás de tudo, sem capturar clique. O shader pinta opaco, então
 * a opacidade + o véu radial por cima é o que mantém o miolo escuro o
 * suficiente para o texto continuar legível — sem isso, o brilho da borda
 * compete com o conteúdo nas laterais.
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
        <div className="absolute inset-0 opacity-[0.55]">
          <ShaderBackground className="h-full w-full" />
        </div>
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
