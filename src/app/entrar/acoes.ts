"use server";

import { signIn, signOut } from "@/auth";

export async function entrarComGoogle() {
  await signIn("google", { redirectTo: "/" });
}

export async function sair() {
  await signOut({ redirectTo: "/entrar" });
}
