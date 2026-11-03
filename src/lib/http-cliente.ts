export async function lerJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, cache: "no-store" });
  if (r.status === 401) throw new Error("Sua sessão terminou. Entre novamente para continuar.");
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || d.erro) throw new Error(d?.erro || "Não foi possível carregar os dados. Tente novamente.");
  return d as T;
}
