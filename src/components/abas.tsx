"use client";

export default function Abas<T extends string>({
  abas,
  ativa,
  aoTrocar,
}: {
  abas: { valor: T; rotulo: string }[];
  ativa: T;
  aoTrocar: (v: T) => void;
}) {
  return (
    <div className="surgir mb-5 flex gap-1.5 overflow-x-auto">
      {abas.map((a) => (
        <button
          key={a.valor}
          onClick={() => aoTrocar(a.valor)}
          className={`whitespace-nowrap rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition ${
            ativa === a.valor
              ? "bg-[var(--azul)] text-white"
              : "bg-[var(--superficie)] text-[var(--texto-2)] hover:text-[var(--texto)]"
          }`}
        >
          {a.rotulo}
        </button>
      ))}
    </div>
  );
}
