import type { ReactNode } from "react";
import { DemoAutomacaoProvider } from "@/lib/demo-automacao/contexto";
import CabecalhoAutomacao from "@/components/automacao/cabecalho";

/**
 * O layout de /automacao: o provedor da demonstração e o cabeçalho comum.
 *
 * Tudo abaixo desta rota compartilha o mesmo estado em memória — trocar de
 * "Conversas IA" para "Contatos" não reinicia a demonstração, o que importa
 * numa apresentação em que você navega enquanto fala.
 *
 * O selo 🧪 MODO DEMONSTRAÇÃO fica no cabeçalho, e por isso aparece em todas
 * as cinco telas sem que nenhuma precise lembrar de colocá-lo.
 */
export default function AutomacaoLayout({ children }: { children: ReactNode }) {
  return (
    <DemoAutomacaoProvider>
      <div className="mx-auto max-w-6xl px-4 py-5">
        <CabecalhoAutomacao />
        {children}
      </div>
    </DemoAutomacaoProvider>
  );
}
