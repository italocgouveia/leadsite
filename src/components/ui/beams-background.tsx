"use client";

import { useEffect, useRef } from "react";

/**
 * Feixes de luz subindo em diagonal, desenhados em canvas.
 *
 * Adaptado do componente original para virar CAMADA DE FUNDO, não uma seção
 * de herói: saíram o `h1`, o `min-h-screen` e o wrapper que centralizava
 * conteúdo. Aqui ele só pinta atrás de tudo.
 *
 * Sem `motion/react` e sem `cn`: o único uso da biblioteca era pulsar a
 * opacidade de um `div` entre 0.05 e 0.15 em 10s, o que é uma animação CSS.
 * Trazer um pacote de animação inteiro para o bundle por causa disso seria
 * caro numa tela que já carrega listas de 200 linhas.
 */

type Intensidade = "subtle" | "medium" | "strong";

type Feixe = {
  x: number;
  y: number;
  largura: number;
  comprimento: number;
  angulo: number;
  velocidade: number;
  opacidade: number;
  matiz: number;
  pulso: number;
  velocidadePulso: number;
};

const OPACIDADE: Record<Intensidade, number> = {
  subtle: 0.7,
  medium: 0.85,
  strong: 1,
};

const TOTAL_FEIXES = 30;

function criarFeixe(largura: number, altura: number): Feixe {
  return {
    x: Math.random() * largura * 1.5 - largura * 0.25,
    y: Math.random() * altura * 1.5 - altura * 0.25,
    largura: 30 + Math.random() * 60,
    comprimento: altura * 2.5,
    angulo: -35 + Math.random() * 10,
    velocidade: 0.6 + Math.random() * 1.2,
    opacidade: 0.12 + Math.random() * 0.16,
    matiz: 190 + Math.random() * 70,
    pulso: Math.random() * Math.PI * 2,
    velocidadePulso: 0.02 + Math.random() * 0.03,
  };
}

export function BeamsBackground({
  className = "",
  intensity = "strong",
}: {
  className?: string;
  intensity?: Intensidade;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const feixes: Feixe[] = [];
    let quadro = 0;

    /**
     * Resolução limitada a 1x, mesmo em tela retina.
     *
     * Tudo aqui passa por `blur(35px)` — desenhar em 2x significa calcular
     * quatro vezes mais pixels para depois borrar a diferença toda. Num
     * monitor grande isso é a diferença entre rolar liso e engasgar numa
     * lista de 200 leads.
     */
    const escala = () => Math.min(window.devicePixelRatio || 1, 1);

    function dimensionar() {
      if (!canvas || !ctx) return;
      const dpr = escala();
      const l = window.innerWidth;
      const a = window.innerHeight;

      canvas.width = l * dpr;
      canvas.height = a * dpr;
      canvas.style.width = `${l}px`;
      canvas.style.height = `${a}px`;

      /**
       * `setTransform` e não `scale`.
       *
       * `scale` MULTIPLICA a transformação atual. O original chamava `scale`
       * a cada resize, então redimensionar a janela três vezes deixava tudo
       * 8x maior e os feixes sumiam para fora da tela.
       */
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      /**
       * Os feixes vivem em pixels de CSS, não de dispositivo.
       *
       * O original criava com `canvas.width/height` (já multiplicados pelo
       * dpr) mas desenhava depois do `scale`, ou seja, num sistema de
       * coordenadas diferente. Em tela retina os feixes nasciam fora da área
       * visível.
       */
      feixes.length = 0;
      for (let i = 0; i < TOTAL_FEIXES; i++) feixes.push(criarFeixe(l, a));
    }

    /** Recicla o feixe que saiu por cima, distribuído em três colunas. */
    function reciclar(f: Feixe, indice: number) {
      const l = window.innerWidth;
      const a = window.innerHeight;
      const coluna = indice % 3;
      const vao = l / 3;

      f.y = a + 100;
      f.x = coluna * vao + vao / 2 + (Math.random() - 0.5) * vao * 0.5;
      f.largura = 100 + Math.random() * 100;
      f.velocidade = 0.5 + Math.random() * 0.4;
      f.matiz = 190 + (indice * 70) / TOTAL_FEIXES;
      f.opacidade = 0.2 + Math.random() * 0.1;
      f.comprimento = a * 2.5;
    }

    function desenhar(f: Feixe) {
      if (!ctx) return;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate((f.angulo * Math.PI) / 180);

      const o =
        f.opacidade * (0.8 + Math.sin(f.pulso) * 0.2) * OPACIDADE[intensity];

      const g = ctx.createLinearGradient(0, 0, 0, f.comprimento);
      g.addColorStop(0, `hsla(${f.matiz}, 85%, 65%, 0)`);
      g.addColorStop(0.1, `hsla(${f.matiz}, 85%, 65%, ${o * 0.5})`);
      g.addColorStop(0.4, `hsla(${f.matiz}, 85%, 65%, ${o})`);
      g.addColorStop(0.6, `hsla(${f.matiz}, 85%, 65%, ${o})`);
      g.addColorStop(0.9, `hsla(${f.matiz}, 85%, 65%, ${o * 0.5})`);
      g.addColorStop(1, `hsla(${f.matiz}, 85%, 65%, 0)`);

      ctx.fillStyle = g;
      ctx.fillRect(-f.largura / 2, 0, f.largura, f.comprimento);
      ctx.restore();
    }

    function animar() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.filter = "blur(35px)";

      for (let i = 0; i < feixes.length; i++) {
        const f = feixes[i];
        f.y -= f.velocidade;
        f.pulso += f.velocidadePulso;
        if (f.y + f.comprimento < -100) reciclar(f, i);
        desenhar(f);
      }

      quadro = requestAnimationFrame(animar);
    }

    dimensionar();
    window.addEventListener("resize", dimensionar);
    animar();

    return () => {
      window.removeEventListener("resize", dimensionar);
      cancelAnimationFrame(quadro);
    };
  }, [intensity]);

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0" />
      {/**
       * O pulso lento que o original fazia com `motion`. Em CSS não custa
       * JavaScript nenhum e o navegador anima fora da thread principal.
       *
       * Sem o `backdropFilter: blur(50px)` do original: ele borrava um canvas
       * que já sai borrado de dentro, e filtro de fundo em tela cheia é dos
       * efeitos mais caros que existem no navegador.
       */}
      <div className="beams-pulso absolute inset-0 bg-[#050505]" />
    </div>
  );
}
