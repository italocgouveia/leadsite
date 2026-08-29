"use client";

import { useEffect, useRef } from "react";

/**
 * Fundo "Dither": onda em ruído fbm, quantizada com matriz de Bayer.
 *
 * O componente original (react-bits) vem como React Three Fiber e puxa
 * `three` + `@react-three/fiber` + `postprocessing` — cerca de 700 KB para um
 * efeito que é, no fim, UM fragment shader numa quad de tela cheia. Aqui ele
 * está escrito em WebGL puro: mesma imagem, zero dependência nova.
 *
 * Parâmetros iguais aos do studio do react-bits.
 */

const VERTEX = `
attribute vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }
`;

/**
 * Bayer por composição, o truque clássico: `bayer2` resolve o bloco 2x2 com
 * aritmética, e cada nível maior soma o nível anterior em escala. Evita
 * tabela indexada, que em GLSL 1.0 exige índice constante.
 */
const FRAGMENT = `
precision highp float;

uniform vec2  uResolucao;
uniform float uTempo;
uniform vec2  uMouse;
uniform float uRaioMouse;
uniform float uCores;
uniform float uAmplitude;
uniform float uFrequencia;
uniform float uVelocidade;
uniform vec3  uCor;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float ruido(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 giro = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * ruido(p);
    p = giro * p * 2.0;
    a *= 0.5;
  }
  return v;
}

float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uResolucao;

  // Corrige a proporção para a onda não esticar em tela larga.
  vec2 p = (frag * 2.0 - uResolucao) / min(uResolucao.x, uResolucao.y);

  float t = uTempo * uVelocidade;
  float onda = fbm(p * uFrequencia * 0.35 + vec2(t, t * 0.7));
  onda += 0.5 * fbm(p * uFrequencia * 0.9 - vec2(t * 1.3, t));
  onda *= uAmplitude * 4.0;

  // Interação do mouse: um realce suave em volta do cursor.
  float d = distance(uv, uMouse);
  onda += smoothstep(uRaioMouse, 0.0, d) * 0.35;

  float brilho = clamp(onda * 0.5 + 0.5, 0.0, 1.0);
  brilho = pow(brilho, 1.6);

  /**
   * Quantização com dithering ordenado.
   *
   * Somar o valor de Bayer ANTES de arredondar é o que troca faixas chapadas
   * por aquele padrão de pontinhos: cada pixel arredonda para um lado
   * diferente conforme sua posição na matriz.
   */
  float limiar = bayer2(frag * 0.5) * 0.25 + bayer2(frag);
  float passos = max(uCores, 2.0);
  float q = floor(brilho * passos + limiar) / passos;

  gl_FragColor = vec4(uCor * q, 1.0);
}
`;

function compilar(gl: WebGLRenderingContext, tipo: number, fonte: string) {
  const s = gl.createShader(tipo);
  if (!s) return null;
  gl.shaderSource(s, fonte);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error("Dither, shader:", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

export function DitherBackground({
  waveColor = [0.23137254901960785, 0.5098039215686274, 0.9647058823529412],
  enableMouseInteraction = true,
  mouseRadius = 0.4,
  colorNum = 4,
  pixelSize = 2,
  waveAmplitude = 0.25,
  waveFrequency = 5.5,
  waveSpeed = 0.04,
}: {
  waveColor?: [number, number, number] | number[];
  enableMouseInteraction?: boolean;
  mouseRadius?: number;
  colorNum?: number;
  pixelSize?: number;
  waveAmplitude?: number;
  waveFrequency?: number;
  waveSpeed?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /**
   * A cor entra nas dependências como TRÊS NÚMEROS, não como array.
   *
   * `waveColor={[0.23, 0.51, 0.96]}` cria um array novo a cada render do pai.
   * Com o array na lista de dependências, qualquer re-render derrubava e
   * recriava o contexto WebGL inteiro — recompilando o shader e realocando os
   * buffers. Pior: o navegador limita quantos contextos WebGL existem ao mesmo
   * tempo (16 no Chrome), então repetir isso acaba matando o fundo em silêncio.
   *
   * Números primitivos comparam por valor e o efeito só roda quando a cor
   * realmente muda.
   */
  const [corR, corG, corB] = waveColor;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    });
    if (!gl) return;

    const vs = compilar(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compilar(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("Dither, link:", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    // Quad de tela cheia: dois triângulos, quatro vértices.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const attr = gl.getAttribLocation(prog, "pos");
    gl.enableVertexAttribArray(attr);
    gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uResolucao = u("uResolucao");
    const uTempo = u("uTempo");
    const uMouse = u("uMouse");

    gl.uniform1f(u("uRaioMouse"), mouseRadius);
    gl.uniform1f(u("uCores"), colorNum);
    gl.uniform1f(u("uAmplitude"), waveAmplitude);
    gl.uniform1f(u("uFrequencia"), waveFrequency);
    gl.uniform1f(u("uVelocidade"), waveSpeed);
    gl.uniform3f(u("uCor"), corR, corG, corB);

    /**
     * `pixelSize` é resolução, não pós-processamento.
     *
     * Renderizar em 1/pixelSize e deixar o CSS ampliar com
     * `image-rendering: pixelated` dá exatamente o mesmo resultado visual do
     * efeito de pixelar — e custa 1/4 dos pixels com pixelSize 2. Fazer o
     * shader rodar em resolução cheia para depois quantizar seria pagar caro
     * por uma imagem que vai ser jogada fora.
     */
    const passo = Math.max(1, pixelSize);
    function dimensionar() {
      if (!canvas || !gl) return;
      const l = Math.max(1, Math.floor(window.innerWidth / passo));
      const a = Math.max(1, Math.floor(window.innerHeight / passo));
      canvas.width = l;
      canvas.height = a;
      gl.viewport(0, 0, l, a);
      gl.uniform2f(uResolucao, l, a);
    }

    const mouse = { x: 0.5, y: 0.5 };
    function aoMover(e: MouseEvent) {
      // Y invertido: WebGL conta de baixo para cima.
      mouse.x = e.clientX / window.innerWidth;
      mouse.y = 1 - e.clientY / window.innerHeight;
    }

    dimensionar();
    window.addEventListener("resize", dimensionar);
    if (enableMouseInteraction) window.addEventListener("mousemove", aoMover);

    const inicio = performance.now();
    let quadro = 0;
    function desenhar() {
      if (!gl) return;
      gl.uniform1f(uTempo, (performance.now() - inicio) / 1000);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      quadro = requestAnimationFrame(desenhar);
    }
    desenhar();

    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("resize", dimensionar);
      window.removeEventListener("mousemove", aoMover);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, [
    corR,
    corG,
    corB,
    enableMouseInteraction,
    mouseRadius,
    colorNum,
    pixelSize,
    waveAmplitude,
    waveFrequency,
    waveSpeed,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
