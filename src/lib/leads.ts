import { db, leads, type Lead } from "@/lib/db";
import { inArray } from "drizzle-orm";
import { variantesTelefoneBR } from "@/lib/telefone";

/**
 * ÚNICO lugar do sistema que acha um lead pelo número de WhatsApp de quem
 * mandou uma mensagem. Webhook de resposta, inbox, automações e qualquer
 * integração futura devem chamar esta função — duas cópias da mesma busca
 * divergem cedo ou tarde, e a que divergir é a que perde a resposta de um
 * lead de verdade.
 *
 * Considera a variante com e sem o nono dígito do celular brasileiro (ver
 * `variantesTelefoneBR`), porque o WhatsApp às vezes devolve o número sem
 * ele mesmo quando o lead foi cadastrado com. Continua sendo igualdade
 * EXATA no banco — cada variante é um `eq` próprio, nunca `LIKE`/`contains`.
 */
export async function buscarLeadPorWhatsapp(numero: string): Promise<Lead | undefined> {
  const digitos = String(numero ?? "").replace(/\D/g, "");
  if (!digitos) return undefined;

  const candidatos = variantesTelefoneBR(digitos).map((d) => `https://wa.me/${d}`);

  const [lead] = await db.select().from(leads).where(inArray(leads.whatsapp, candidatos)).limit(1);
  return lead;
}
