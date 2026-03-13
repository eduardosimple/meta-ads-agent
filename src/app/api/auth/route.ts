import { NextRequest, NextResponse } from "next/server";
import { signToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json({ error: "Senha obrigatória" }, { status: 400 });
    }

    const AUTH_PASSWORD = process.env.AUTH_PASSWORD;
    if (!AUTH_PASSWORD) {
      return NextResponse.json(
        { error: "Servidor não configurado" },
        { status: 500 }
      );
    }

    if (password !== AUTH_PASSWORD) {
      return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
    }

    const token = await signToken({ sub: "admin" });

    return NextResponse.json({ token });
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
