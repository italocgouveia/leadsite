import { limpar, valido } from "@/lib/cnpj";

/**
 * Consulta os dados públicos de CNPJ da Receita Federal.
 *
 * Serve para uma coisa específica: descobrir o NOME DO DONO. Falar com a
 * recepção e pedir "o responsável" é como a ligação morre; pedir "o Ulisses"
 * é outra conversa. O quadro societário (QSA) é público, e é ele que dá o nome.
 *
 * O que isto NÃO faz, para não criar expectativa errada:
 *  - não devolve o celular do sócio (o QSA não tem contato de pessoa física);
 *  - o telefone que vem é o cadastrado na Receita, que muitas vezes é o do
 *    contador, não o do negócio;
 *  - MEI e empresário individual costumam vir com QSA vazio — nesses casos o
 *    dono é a própria razão social.
 *
 * Duas fontes gratuitas, sem chave. minhareceita.org primeiro por ser mais
 * rápido nos testes (620ms contra 1600ms); BrasilAPI como reserva.
 */

const FONTES = [
  (c: string) => `https://minhareceita.org/${c}`,
  (c: string) => `https://brasilapi.com.br/api/cnpj/v1/${c}`,
];

export type Socio = {
  nome: string;
  qualificacao: string;
  /** Sócio-administrador, presidente, diretor: quem decide. */
  decide: boolean;
};

export type DadosReceita = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacao: string | null;
  porte: string | null;
  aberturaEm: string | null;
  atividade: string | null;
  telefone: string | null;
  email: string | null;
  socios: Socio[];
};

/** Cargos que mandam. Sócio sem administração muitas vezes é só cotista. */
const DECIDE = /administrador|presidente|diretor|titular|s[óo]cio-?gerente/i;

type Bruto = {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string | null;
  descricao_situacao_cadastral?: string;
  situacao_cadastral?: string | number;
  porte?: string;
  data_inicio_atividade?: string;
  cnae_fiscal_descricao?: string;
  ddd_telefone_1?: string | null;
  email?: string | null;
  qsa?: { nome_socio?: string; nome?: string; qualificacao_socio?: string }[];
};

function normalizarTelefone(bruto: string | null | undefined): string | null {
  const d = String(bruto ?? "").replace(/\D/g, "");
  if (d.length < 10 || d.length > 11) return null;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  return `(${ddd}) ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
}

function normalizar(j: Bruto, cnpj: string): DadosReceita {
  const socios = (j.qsa ?? [])
    .map((s) => {
      const nome = (s.nome_socio ?? s.nome ?? "").trim();
      const qualificacao = (s.qualificacao_socio ?? "").trim();
      return { nome, qualificacao, decide: DECIDE.test(qualificacao) };
    })
    .filter((s) => s.nome)
    // Quem decide primeiro: é com essa pessoa que você quer falar.
    .sort((a, b) => Number(b.decide) - Number(a.decide));

  return {
    cnpj,
    razaoSocial: (j.razao_social ?? "").trim(),
    nomeFantasia: j.nome_fantasia?.trim() || null,
    situacao:
      j.descricao_situacao_cadastral ||
      String(j.situacao_cadastral ?? "") ||
      null,
    porte: j.porte ?? null,
    aberturaEm: j.data_inicio_atividade ?? null,
    atividade: j.cnae_fiscal_descricao ?? null,
    telefone: normalizarTelefone(j.ddd_telefone_1),
    email: j.email?.trim() || null,
    socios,
  };
}

export type ResultadoReceita =
  | { ok: true; dados: DadosReceita }
  | { ok: false; erro: string };

export async function consultarCnpj(entrada: string): Promise<ResultadoReceita> {
  const cnpj = limpar(entrada);

  // Barra antes de sair para a rede: número inválido nunca vai existir lá.
  if (!valido(cnpj)) {
    return { ok: false, erro: "CNPJ inválido — confira os números." };
  }

  let ultimoErro = "Não consegui falar com a Receita agora.";

  for (const montarUrl of FONTES) {
    try {
      const controle = new AbortController();
      const relogio = setTimeout(() => controle.abort(), 12_000);

      const res = await fetch(montarUrl(cnpj), {
        signal: controle.signal,
        headers: { Accept: "application/json", "User-Agent": "leadsite/1.0" },
      });
      clearTimeout(relogio);

      if (res.status === 404) {
        // 404 é resposta definitiva: não adianta tentar a outra fonte.
        return { ok: false, erro: "CNPJ não encontrado na base da Receita." };
      }
      if (!res.ok) {
        ultimoErro = `A consulta respondeu ${res.status}.`;
        continue;
      }

      const dados = normalizar((await res.json()) as Bruto, cnpj);
      if (!dados.razaoSocial) {
        ultimoErro = "A resposta veio sem razão social.";
        continue;
      }
      return { ok: true, dados };
    } catch {
      ultimoErro = "A consulta demorou demais ou a fonte está fora do ar.";
    }
  }

  return { ok: false, erro: ultimoErro };
}
