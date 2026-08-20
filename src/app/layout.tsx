import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Menu from "@/components/menu";
import Fundo from "@/components/fundo";
import { auth } from "@/auth";

/** As duas fontes do icgtech-three.vercel.app: Space Grotesk nos títulos. */
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
  variable: "--fonte-corpo",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--fonte-titulo",
});

export const metadata: Metadata = {
  title: "ICG Tech · Prospecção",
  description: "Encontre empresas que precisam de site e envie a proposta.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sessao = await auth().catch(() => null);
  return (
    <html lang="pt-BR" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="min-h-screen">
        <Fundo />
        <div className="relative flex min-h-screen">
          <Menu usuario={sessao?.user ?? null} />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
