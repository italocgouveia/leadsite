/**
 * Categorias de negócio pra busca.
 *
 * Não são os `types` da Places API — são termos de busca em português, que é
 * o que o Text Search entende melhor pro mercado brasileiro. Ex: buscar
 * "salão de beleza" traz mais e melhor que o type `beauty_salon`.
 *
 * A busca aceita texto livre também; esta lista é atalho, não limite.
 */

export type Categoria = { termo: string; grupo: string };

export const CATEGORIAS: Categoria[] = [
  // Beleza e estética — o nicho que mais vende site
  { termo: "salão de beleza", grupo: "Beleza e Estética" },
  { termo: "barbearia", grupo: "Beleza e Estética" },
  { termo: "clínica de estética", grupo: "Beleza e Estética" },
  { termo: "studio de unhas", grupo: "Beleza e Estética" },
  { termo: "design de sobrancelhas", grupo: "Beleza e Estética" },
  { termo: "clínica de depilação", grupo: "Beleza e Estética" },
  { termo: "spa e massagem", grupo: "Beleza e Estética" },
  { termo: "micropigmentação", grupo: "Beleza e Estética" },

  // Alimentação
  { termo: "restaurante", grupo: "Alimentação" },
  { termo: "pizzaria", grupo: "Alimentação" },
  { termo: "hamburgueria", grupo: "Alimentação" },
  { termo: "lanchonete", grupo: "Alimentação" },
  { termo: "cafeteria", grupo: "Alimentação" },
  { termo: "padaria", grupo: "Alimentação" },
  { termo: "confeitaria e doceria", grupo: "Alimentação" },
  { termo: "marmitaria", grupo: "Alimentação" },
  { termo: "açaiteria", grupo: "Alimentação" },
  { termo: "churrascaria", grupo: "Alimentação" },
  { termo: "sushi e comida japonesa", grupo: "Alimentação" },
  { termo: "bar e petiscaria", grupo: "Alimentação" },
  { termo: "food truck", grupo: "Alimentação" },
  { termo: "sorveteria", grupo: "Alimentação" },

  // Saúde
  { termo: "clínica odontológica", grupo: "Saúde" },
  { termo: "clínica de fisioterapia", grupo: "Saúde" },
  { termo: "clínica veterinária", grupo: "Saúde" },
  { termo: "psicólogo", grupo: "Saúde" },
  { termo: "nutricionista", grupo: "Saúde" },
  { termo: "clínica médica", grupo: "Saúde" },
  { termo: "laboratório de análises clínicas", grupo: "Saúde" },
  { termo: "ótica", grupo: "Saúde" },
  { termo: "farmácia de manipulação", grupo: "Saúde" },
  { termo: "fonoaudiólogo", grupo: "Saúde" },
  { termo: "quiropraxia", grupo: "Saúde" },

  // Fitness
  { termo: "academia", grupo: "Fitness" },
  { termo: "estúdio de pilates", grupo: "Fitness" },
  { termo: "crossfit", grupo: "Fitness" },
  { termo: "escola de dança", grupo: "Fitness" },
  { termo: "academia de lutas", grupo: "Fitness" },
  { termo: "personal trainer", grupo: "Fitness" },

  // Automotivo
  { termo: "oficina mecânica", grupo: "Automotivo" },
  { termo: "auto center", grupo: "Automotivo" },
  { termo: "lava jato estética automotiva", grupo: "Automotivo" },
  { termo: "funilaria e pintura", grupo: "Automotivo" },
  { termo: "auto elétrica", grupo: "Automotivo" },
  { termo: "borracharia", grupo: "Automotivo" },
  { termo: "concessionária de veículos", grupo: "Automotivo" },
  { termo: "despachante", grupo: "Automotivo" },

  // Serviços profissionais
  { termo: "escritório de advocacia", grupo: "Serviços Profissionais" },
  { termo: "escritório de contabilidade", grupo: "Serviços Profissionais" },
  { termo: "arquiteto", grupo: "Serviços Profissionais" },
  { termo: "engenheiro civil", grupo: "Serviços Profissionais" },
  { termo: "corretor de imóveis", grupo: "Serviços Profissionais" },
  { termo: "imobiliária", grupo: "Serviços Profissionais" },
  { termo: "corretora de seguros", grupo: "Serviços Profissionais" },
  { termo: "consultoria empresarial", grupo: "Serviços Profissionais" },
  { termo: "agência de marketing", grupo: "Serviços Profissionais" },
  { termo: "gráfica", grupo: "Serviços Profissionais" },

  // Casa e construção
  { termo: "loja de material de construção", grupo: "Casa e Construção" },
  { termo: "marcenaria", grupo: "Casa e Construção" },
  { termo: "serralheria", grupo: "Casa e Construção" },
  { termo: "vidraçaria", grupo: "Casa e Construção" },
  { termo: "empresa de climatização e ar condicionado", grupo: "Casa e Construção" },
  { termo: "empresa de energia solar", grupo: "Casa e Construção" },
  { termo: "dedetizadora", grupo: "Casa e Construção" },
  { termo: "empresa de limpeza", grupo: "Casa e Construção" },
  { termo: "paisagismo e jardinagem", grupo: "Casa e Construção" },
  { termo: "loja de móveis planejados", grupo: "Casa e Construção" },
  { termo: "piscineiro", grupo: "Casa e Construção" },

  // Comércio
  { termo: "pet shop", grupo: "Comércio" },
  { termo: "loja de roupas", grupo: "Comércio" },
  { termo: "loja de calçados", grupo: "Comércio" },
  { termo: "joalheria", grupo: "Comércio" },
  { termo: "floricultura", grupo: "Comércio" },
  { termo: "loja de bicicletas", grupo: "Comércio" },
  { termo: "assistência técnica de celular", grupo: "Comércio" },
  { termo: "loja de informática", grupo: "Comércio" },
  { termo: "distribuidora de bebidas", grupo: "Comércio" },
  { termo: "loja de suplementos", grupo: "Comércio" },
  { termo: "tabacaria", grupo: "Comércio" },

  // Educação
  { termo: "escola de idiomas", grupo: "Educação" },
  { termo: "curso preparatório", grupo: "Educação" },
  { termo: "escola de música", grupo: "Educação" },
  { termo: "autoescola", grupo: "Educação" },
  { termo: "escola infantil", grupo: "Educação" },
  { termo: "curso profissionalizante", grupo: "Educação" },

  // Eventos
  { termo: "buffet de festas", grupo: "Eventos" },
  { termo: "casa de festas infantil", grupo: "Eventos" },
  { termo: "fotógrafo", grupo: "Eventos" },
  { termo: "cerimonial de casamento", grupo: "Eventos" },
  { termo: "locação de equipamentos para festas", grupo: "Eventos" },
  { termo: "banda e músico para eventos", grupo: "Eventos" },

  // Turismo
  { termo: "pousada", grupo: "Turismo" },
  { termo: "hotel", grupo: "Turismo" },
  { termo: "agência de viagens", grupo: "Turismo" },
  { termo: "chácara para locação", grupo: "Turismo" },
];

export const GRUPOS = [...new Set(CATEGORIAS.map((c) => c.grupo))];

export function categoriasPorGrupo(): Record<string, Categoria[]> {
  return CATEGORIAS.reduce<Record<string, Categoria[]>>((acc, c) => {
    (acc[c.grupo] ??= []).push(c);
    return acc;
  }, {});
}
