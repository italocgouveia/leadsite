import { detectarCliches, detectarHorarios, detectarDepoimentos } from "../deteccao";

/**
 * Testes dos detectores. Autocontido de propósito: a versão anterior lia um
 * HTML gerado em public/, e quebrou assim que o arquivo foi apagado.
 *
 * Rode com: npm run test:deteccao
 */

type Caso = { nome: string; html: string; espera: "pega" | "limpo" };

const CASOS: Caso[] = [
  // --- horário inventado (o lead nunca traz esse dado) ---
  { nome: "intervalo de dias", html: "<p>Atendimento de terça a sábado</p>", espera: "pega" },
  { nome: "dias com sufixo", html: "<p>Segunda-feira à sexta-feira</p>", espera: "pega" },
  { nome: "faixa de horas", html: "<p>Funcionamos das 9h às 18h</p>", espera: "pega" },
  { nome: "horas com dois pontos", html: "<p>De 8:00 as 17:00</p>", espera: "pega" },
  { nome: "aberto todos os dias", html: "<p>Aberto todos os dias</p>", espera: "pega" },
  { nome: "horário de atendimento", html: "<p>Horário de atendimento: consulte</p>", espera: "pega" },
  { nome: "atendemos de", html: "<p>Atendemos de segunda a sexta</p>", espera: "pega" },

  // --- clichês de IA ---
  { nome: "paralelismo", html: "<p>Não é só um corte, é uma experiência nova</p>", espera: "pega" },
  { nome: "estatística +500", html: "<p>+500 clientes atendidos</p>", espera: "pega" },
  { nome: "estatística 100%", html: "<p>100% de satisfação garantida</p>", espera: "pega" },
  { nome: "excelência", html: "<p>Excelência em cada serviço</p>", espera: "pega" },
  { nome: "CTA retórico", html: "<p>Pronto para transformar seu visual?</p>", espera: "pega" },
  { nome: "ritual de", html: "<p>Rituais de nutrição profunda</p>", espera: "pega" },
  {
    nome: "3 etiquetas CAPS",
    html: "<div><p>QUEM SOMOS</p><p>NOSSOS SERVICOS</p><p>ONDE ESTAMOS</p></div>",
    espera: "pega",
  },

  // --- depoimento inventado ---
  { nome: "citação assinada", html: '<p>“Atendimento impecável, saí renovada e muito feliz!” Mariana</p>', espera: "pega" },
  { nome: "cliente verificado", html: "<p>cliente verificado</p>", espera: "pega" },
  { nome: "seção depoimentos", html: "<h2>Depoimentos</h2>", espera: "pega" },
  { nome: "o que os clientes dizem", html: "<h2>O que nossos clientes dizem</h2>", espera: "pega" },

  // --- texto que deve passar limpo ---
  { nome: "texto simples", html: "<p>Corte, barba e finalização. Agende pelo WhatsApp.</p>", espera: "limpo" },
  { nome: "endereço", html: "<p>Rua José Andraus, 65 - Martins, Uberlândia</p>", espera: "limpo" },
  { nome: "serviços concretos", html: "<p>Escova, coloração e hidratação.</p>", espera: "limpo" },
  {
    nome: "uma etiqueta CAPS só",
    html: "<div><p>NOSSOS SERVICOS</p><h2>Corte e barba</h2></div>",
    espera: "limpo",
  },
];

let falhas = 0;

for (const caso of CASOS) {
  const horarios = detectarHorarios(caso.html);
  const cliches = detectarCliches(caso.html);
  const depo = detectarDepoimentos(caso.html);
  const pegou = horarios.length > 0 || cliches.length > 0 || depo.length > 0;
  const ok = caso.espera === "pega" ? pegou : !pegou;

  if (!ok) falhas++;

  const achados = [...horarios, ...cliches, ...depo].join(", ") || "-";
  console.log(`${ok ? "OK   " : "FALHA"} ${caso.nome.padEnd(24)} ${achados}`);
}

console.log(
  falhas === 0
    ? `\n${CASOS.length} casos, todos passaram.`
    : `\n${falhas} de ${CASOS.length} casos falharam.`,
);

process.exit(falhas === 0 ? 0 : 1);
