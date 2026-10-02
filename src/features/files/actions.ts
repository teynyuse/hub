"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { id } from "@/lib/validation";
import type { ActionState } from "@/lib/types";
export async function uploadFile(_: ActionState, f: FormData): Promise<ActionState> {
  const { db, user } = await requireUser();
  const file = f.get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > 4194304)
    return { error: "Kies een bestand van maximaal 4 MB." };
  const name = file.name.slice(0, 255);
  const path = `${user.id}/${randomUUID()}`;
  const { error } = await db.storage
    .from("documents")
    .upload(path, file, { contentType: "application/octet-stream", upsert: false });
  if (error)
    return { error: "Uploaden lukte niet. Controleer je verbinding en de opslaginstellingen." };
  const record = await db
    .from("files")
    .insert({ user_id: user.id, name, storage_path: path, size_bytes: file.size });
  if (record.error) {
    await db.storage.from("documents").remove([path]);
    return { error: "Bestand registreren lukte niet. Probeer opnieuw." };
  }
  revalidatePath("/files");
  return { success: "Bestand opgeslagen." };
}
export async function deleteFile(_: ActionState, f: FormData): Promise<ActionState> {
  const { db, user } = await requireUser();
  const parsed = id.safeParse(f.get("id"));
  if (!parsed.success) return { error: "Ongeldig bestand." };
  const { data, error } = await db
    .from("files")
    .select("storage_path")
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .single();
  if (error || !data) return { error: "Bestand niet gevonden." };
  const removed = await db.storage.from("documents").remove([data.storage_path]);
  if (removed.error) return { error: "Bestand verwijderen lukte niet." };
  const record = await db.from("files").delete().eq("id", parsed.data).eq("user_id", user.id);
  if (record.error) return { error: "Registratie verwijderen lukte niet. Probeer opnieuw." };
  revalidatePath("/files");
  return {};
}
