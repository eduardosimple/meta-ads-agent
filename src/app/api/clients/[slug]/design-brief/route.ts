import { NextRequest, NextResponse } from "next/server";
import { getDesignBrief } from "@/lib/design-briefs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const brief = await getDesignBrief(params.slug);
  if (!brief) return NextResponse.json({ brief: null });
  return NextResponse.json({ brief });
}
