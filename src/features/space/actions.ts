"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { title, id, validationMessage } from "@/lib/validation";
import type { ActionState } from "@/lib/types";
export async function createPage(_: ActionState, f: FormData): Promise<ActionState> {
  const { db, user } = await requireUser();
  let name;
  try {
    name = title.parse(f.get("title"));
  } catch (e) {
    return { error: validationMessage(e) };
  }
  const { data, error } = await db
    .from("pages")
    .insert({ user_id: user.id, title: name })
    .select("id")
    .single();
  if (error) return { error: "Pagina maken lukte niet." };
  revalidatePath("/", "layout");
  redirect(`/space/${data.id}`);
}
export async function savePage(
  pageId: string,
  name: string,
  content: unknown,
): Promise<ActionState> {
  const { db, user } = await requireUser();
  try {
    id.parse(pageId);
    name = title.parse(name);
    const serialized = JSON.stringify(content);
    if (serialized.length > 500000) throw new Error("Deze pagina is te groot.");
    if (!content || typeof content !== "object" || !("type" in content) || content.type !== "doc")
      throw new Error("Ongeldige pagina.");
  } catch (e) {
    return { error: validationMessage(e) };
  }
  const { data, error } = await db
    .from("pages")
    .update({ title: name, content })
    .eq("id", pageId)
    .eq("user_id", user.id)
    .select("id");
  if (error || !data?.length) return { error: "Pagina bewaren lukte niet." };
  revalidatePath("/", "layout");
  return { success: "Opgeslagen" };
}
