"use client";
import { useState, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { Page } from "@/lib/types";
import { savePage } from "./actions";
export function PageEditor({ page }: { page: Page }) {
  const [name, setName] = useState(page.title);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const revision = useRef(0);
  function changed() {
    revision.current += 1;
    setDirty(true);
    setStatus("");
  }
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } })],
    content: page.content,
    immediatelyRender: false,
    onUpdate: changed,
    editorProps: { attributes: { "aria-label": "Pagina-inhoud", class: "page-content" } },
  });
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  // Capture navigation at document level so internal links do not lose unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const check = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest("a[href]");
      if (
        anchor &&
        !window.confirm("Je hebt onopgeslagen wijzigingen. Wil je deze pagina verlaten?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", check, true);
    return () => document.removeEventListener("click", check, true);
  }, [dirty]);
  async function save() {
    if (!editor) return;
    const current = revision.current;
    setPending(true);
    try {
      const result = await savePage(page.id, name, editor.getJSON());
      setStatus(result.error ?? result.success ?? "");
      if (!result.error && revision.current === current) setDirty(false);
    } catch {
      setStatus("Bewaren lukte niet. Probeer opnieuw.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <label className="page-title-field">
          Titel
          <input
            value={name}
            maxLength={200}
            onChange={(e) => {
              setName(e.target.value);
              changed();
            }}
          />
        </label>
        <div className="row">
          <span role="status" className="muted">
            {status || (dirty ? "Onopgeslagen" : "")}
          </span>
          <button className="primary" disabled={pending || !editor} onClick={save}>
            {pending ? "Bewaren…" : "Bewaren"}
          </button>
        </div>
      </div>
      <div className="panel editor">
        <div className="toolbar" role="toolbar" aria-label="Tekstopmaak">
          <button disabled={!editor} onClick={() => editor?.chain().focus().toggleBold().run()}>
            Vet
          </button>
          <button disabled={!editor} onClick={() => editor?.chain().focus().toggleItalic().run()}>
            Cursief
          </button>
          <button
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            Kop
          </button>
          <button
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            Lijst
          </button>
          <button
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            Nummering
          </button>
          <button
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          >
            Citaat
          </button>
          <button disabled={!editor} onClick={() => editor?.chain().focus().undo().run()}>
            Ongedaan
          </button>
        </div>
        <EditorContent editor={editor} />
      </div>
    </>
  );
}
