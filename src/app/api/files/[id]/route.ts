import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { id as idSchema } from "@/lib/validation";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { db, user } = await requireUser();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return new NextResponse("Niet gevonden", { status: 404 });
  const { data, error } = await db
    .from("files")
    .select("storage_path,name")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error || !data) return new NextResponse("Niet gevonden", { status: 404 });
  const signed = await db.storage
    .from("documents")
    .createSignedUrl(data.storage_path, 60, { download: data.name });
  if (signed.error) return new NextResponse("Downloaden lukte niet", { status: 500 });
  const response = NextResponse.redirect(signed.data.signedUrl);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
