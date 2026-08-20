"use client";

import { useState } from "react";

/**
 * Botão isolado só pra ter o clipboard: a lista de sites é server component
 * e não pode carregar estado nem handler de clique.
 */
export default function CopiarLink({ slug }: { slug: string }) {
  const [copiado, setCopiado] = useState(false);

  function copiar() {
    navigator.clipboard.writeText(`${window.location.origin}/s/${slug}`);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <button onClick={copiar} className="btn-secundario">
      {copiado ? "Copiado!" : "Copiar link"}
    </button>
  );
}
