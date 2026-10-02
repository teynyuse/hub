import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { id as idSchema } from "@/lib/validation";
import { PageEditor } from "@/features/space/page-editor";
import type { Page } from "@/lib/types";
export default async function SpacePage({ params }: { params: Promise<{ id: string }> }) {
  const { db, user } = await requireUser();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const { data, error } = await db
    .from("pages")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error || !data) notFound();
  return <PageEditor key={id} page={data as Page} />;
}
