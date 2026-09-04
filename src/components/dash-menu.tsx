"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteCategoryAction,
  deleteItemAction,
  moveCategoryAction,
  moveItemAction,
  saveCategoryAction,
  saveItemAction,
  type ItemInput,
} from "@/lib/actions";
import { cn, money } from "@/lib/util";

export interface CatEditorItem {
  id: string;
  name: string;
  nameAlt: string;
  description: string;
  descriptionAlt: string;
  price: number;
  tags: string[];
  allergens: string[];
  imageUrl: string;
  isAvailable: boolean;
  categoryId: string;
}

export interface CatEditorCat {
  id: string;
  name: string;
  nameAlt: string;
  description: string;
  descriptionAlt: string;
  isVisible: boolean;
  items: CatEditorItem[];
}

const ALLERGEN_SUGGESTIONS = [
  "gluten",
  "dairy",
  "nuts",
  "egg",
  "soy",
  "fish",
  "shellfish",
  "sesame",
  "sulphites",
];

export default function DashMenu(props: {
  venue: { name: string; currency: string };
  categories: CatEditorCat[];
}) {
  const router = useRouter();
  const [catEditor, setCatEditor] = useState<{ open: boolean; cat?: CatEditorCat }>({ open: false });
  const [itemEditor, setItemEditor] = useState<{ open: boolean; item?: CatEditorItem; catId?: string }>({ open: false });
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ error?: string } | undefined>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res && "error" in res && res.error) {
      alert(res.error);
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="serif text-3xl font-semibold text-cream">Menu editor</h1>
          <p className="mt-1 text-sm text-fog">
            {props.venue.name} · bilingual fields (EN / ΕΛ)
          </p>
        </div>
        <button
          onClick={() => setCatEditor({ open: true })}
          className="btn btn-gold"
          disabled={busy}
        >
          + New category
        </button>
      </div>

      {props.categories.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-fog-2">
          Your menu is empty. Add your first category to get started.
        </p>
      )}

      {props.categories.map((cat, ci) => (
        <section key={cat.id} className="card overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white/[0.02] px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className={cn("serif text-xl font-semibold", cat.isVisible ? "text-cream" : "text-fog line-through")}>
                  {cat.name || "Untitled"}
                </h2>
                <span className="text-xs text-fog">{cat.nameAlt}</span>
              </div>
              <p className="truncate text-xs text-fog">{cat.description}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                  cat.isVisible ? "bg-good/15 text-good" : "bg-fog/10 text-fog",
                )}
              >
                {cat.isVisible ? "visible" : "hidden"}
              </span>
              <button className="btn btn-ghost !px-2 !py-1 text-xs" disabled={ci === 0} onClick={() => run(() => moveCategoryAction(cat.id, -1))}>↑</button>
              <button className="btn btn-ghost !px-2 !py-1 text-xs" disabled={ci === props.categories.length - 1} onClick={() => run(() => moveCategoryAction(cat.id, 1))}>↓</button>
              <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => setCatEditor({ open: true, cat })}>Edit</button>
              <button
                className="btn btn-danger !px-2 !py-1 text-xs"
                onClick={() => {
                  if (confirm(`Delete category "${cat.name}" and all its items?`))
                    run(() => deleteCategoryAction(cat.id));
                }}
              >
                Delete
              </button>
            </div>
          </header>

          {cat.items.length > 0 && (
            <ul className="divide-y divide-line/60">
              {cat.items.map((it, ii) => (
                <li key={it.id} className="group flex items-center gap-3 px-4 py-2.5">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      it.isAvailable ? "bg-good" : "bg-danger/70",
                    )}
                    title={it.isAvailable ? "Available" : "Sold out"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={cn("truncate text-sm font-bold", it.isAvailable ? "text-cream" : "text-fog line-through")}>
                        {it.name}
                      </p>
                      {it.nameAlt && <span className="truncate text-xs text-fog-2">{it.nameAlt}</span>}
                      {it.tags.map((t) => (
                        <span key={t} className="rounded border border-gold/30 bg-gold/10 px-1 py-px text-[9px] font-extrabold text-gold-2">{t}</span>
                      ))}
                    </div>
                    <p className="truncate text-xs text-fog">{it.description}</p>
                  </div>
                  <span className="shrink-0 text-sm font-extrabold text-gold-2">{money(it.price)}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button className="btn btn-ghost !px-2 !py-0.5 text-xs" disabled={ii === 0} onClick={() => run(() => moveItemAction(it.id, -1))}>↑</button>
                    <button className="btn btn-ghost !px-2 !py-0.5 text-xs" disabled={ii === cat.items.length - 1} onClick={() => run(() => moveItemAction(it.id, 1))}>↓</button>
                    <button className="btn btn-ghost !px-2 !py-0.5 text-xs" onClick={() => setItemEditor({ open: true, item: it })}>Edit</button>
                    <button
                      className="btn btn-danger !px-2 !py-0.5 text-xs"
                      onClick={() => {
                        if (confirm(`Delete "${it.name}"?`)) run(() => deleteItemAction(it.id));
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {cat.items.length === 0 && (
            <p className="px-4 py-4 text-center text-xs text-fog-2">No items in this category yet.</p>
          )}
          <button
            className="w-full border-t border-line bg-white/[0.01] px-4 py-2.5 text-xs font-bold text-gold-2 hover:bg-gold/5"
            onClick={() => setItemEditor({ open: true, catId: cat.id })}
          >
            + Add item to {cat.name}
          </button>
        </section>
      ))}

      {catEditor.open && (
        <CategoryModal
          cat={catEditor.cat}
          onClose={() => setCatEditor({ open: false })}
          onSave={async (input) => {
            const ok = await run(() =>
              saveCategoryAction({
                id: catEditor.cat?.id,
                ...input,
              }),
            );
            if (ok) setCatEditor({ open: false });
          }}
          busy={busy}
        />
      )}

      {itemEditor.open && (
        <ItemModal
          item={itemEditor.item}
          catId={itemEditor.catId ?? itemEditor.item?.categoryId}
          categories={props.categories}
          currency={props.venue.currency}
          onClose={() => setItemEditor({ open: false })}
          onSave={async (input) => {
            const ok = await run(() => saveItemAction(input));
            if (ok) setItemEditor({ open: false });
          }}
          busy={busy}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- category modal */

function CategoryModal(props: {
  cat?: CatEditorCat;
  onClose: () => void;
  onSave: (v: { name: string; nameAlt: string; description: string; descriptionAlt: string; isVisible: boolean }) => Promise<void>;
  busy: boolean;
}) {
  const c = props.cat;
  const [form, setForm] = useState({
    name: c?.name ?? "",
    nameAlt: c?.nameAlt ?? "",
    description: c?.description ?? "",
    descriptionAlt: c?.descriptionAlt ?? "",
    isVisible: c?.isVisible ?? true,
  });
  return (
    <Modal title={c ? "Edit category" : "New category"} onClose={props.onClose}>
      <div className="space-y-3">
        <Field label="Name (EN)">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Signature" />
        </Field>
        <Field label="Name (ΕΛ)">
          <input className="input" value={form.nameAlt} onChange={(e) => setForm({ ...form, nameAlt: e.target.value })} placeholder="Υπογραφή" />
        </Field>
        <Field label="Description (EN)">
          <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="House creations" />
        </Field>
        <Field label="Description (ΕΛ)">
          <input className="input" value={form.descriptionAlt} onChange={(e) => setForm({ ...form, descriptionAlt: e.target.value })} placeholder="Δικές μας δημιουργίες" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-cream">
          <input
            type="checkbox"
            checked={form.isVisible}
            onChange={(e) => setForm({ ...form, isVisible: e.target.checked })}
            className="h-4 w-4 accent-[#c9a45c]"
          />
          Visible on the guest menu
        </label>
      </div>
      <ModalActions
        busy={props.busy}
        onCancel={props.onClose}
        onSave={() => props.onSave(form)}
      />
    </Modal>
  );
}

/* ---------------------------------------------------------------- item modal */

function ItemModal(props: {
  item?: CatEditorItem;
  catId?: string;
  categories: CatEditorCat[];
  currency: string;
  onClose: () => void;
  onSave: (v: ItemInput) => Promise<void>;
  busy: boolean;
}) {
  const it = props.item;
  const [form, setForm] = useState({
    name: it?.name ?? "",
    nameAlt: it?.nameAlt ?? "",
    description: it?.description ?? "",
    descriptionAlt: it?.descriptionAlt ?? "",
    price: it ? String(it.price) : "",
    tags: it?.tags ?? [],
    allergens: it?.allergens ?? [],
    imageUrl: it?.imageUrl ?? "",
    isAvailable: it?.isAvailable ?? true,
    categoryId: props.catId ?? props.categories[0]?.id ?? "",
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Modal title={it ? "Edit item" : "New item"} onClose={props.onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name (EN)">
          <input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ambrosia Sour" />
        </Field>
        <Field label="Name (ΕΛ)">
          <input className="input" value={form.nameAlt} onChange={(e) => set({ nameAlt: e.target.value })} placeholder="Ambrosia Sour" />
        </Field>
        <div className="col-span-2">
          <Field label="Description (EN)">
            <input className="input" value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Barrel-aged whiskey, honey, lemon…" />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Description (ΕΛ)">
            <input className="input" value={form.descriptionAlt} onChange={(e) => set({ descriptionAlt: e.target.value })} placeholder="Παλαιωμένο ουίσκι, μέλι, λεμόνι…" />
          </Field>
        </div>
        <Field label={`Price (${props.currency})`}>
          <input
            className="input"
            type="number"
            min="0"
            step="0.1"
            value={form.price}
            onChange={(e) => set({ price: e.target.value })}
            placeholder="9.50"
          />
        </Field>
        <Field label="Category">
          <select
            className="input"
            value={form.categoryId}
            onChange={(e) => set({ categoryId: e.target.value })}
          >
            {props.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <div className="col-span-2">
          <Field label="Tags (TOP, NEW…)" hint="Separate with commas or Enter">
            <TagInput
              value={form.tags}
              onChange={(v) => set({ tags: v })}
              suggestions={["TOP", "NEW", "BESTSELLER", "VEGAN", "SPICY"]}
            />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Allergens">
            <TagInput
              value={form.allergens}
              onChange={(v) => set({ allergens: v })}
              suggestions={ALLERGEN_SUGGESTIONS}
              emoji
            />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Image URL (optional)">
            <input className="input" value={form.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} placeholder="https://…" />
          </Field>
        </div>
        <label className="col-span-2 flex items-center gap-2 text-sm text-cream">
          <input
            type="checkbox"
            checked={form.isAvailable}
            onChange={(e) => set({ isAvailable: e.target.checked })}
            className="h-4 w-4 accent-[#c9a45c]"
          />
          Available (shown on menu — uncheck to mark sold out)
        </label>
      </div>
      <ModalActions
        busy={props.busy}
        onCancel={props.onClose}
        onSave={() =>
          props.onSave({
            id: it?.id,
            categoryId: form.categoryId,
            name: form.name,
            nameAlt: form.nameAlt,
            description: form.description,
            descriptionAlt: form.descriptionAlt,
            price: Number(form.price),
            tags: form.tags,
            allergens: form.allergens,
            imageUrl: form.imageUrl,
            isAvailable: form.isAvailable,
          })
        }
      />
    </Modal>
  );
}

/* ---------------------------------------------------------------- primitives */

function Modal(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button aria-label="Close" onClick={props.onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="animate-pop relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gold/25 bg-panel p-6 shadow-glow">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="serif text-xl font-semibold text-cream">{props.title}</h3>
          <button onClick={props.onClose} className="btn btn-ghost !px-2.5 !py-1 text-xs">✕</button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">
        {props.label}
        {props.hint && <span className="ml-1 normal-case tracking-normal text-fog-2">· {props.hint}</span>}
      </label>
      {props.children}
    </div>
  );
}

function ModalActions(props: { busy: boolean; onCancel: () => void; onSave: () => void }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button onClick={props.onCancel} className="btn btn-ghost">Cancel</button>
      <button onClick={props.onSave} disabled={props.busy} className="btn btn-gold">
        {props.busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function TagInput(props: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  emoji?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const { value, onChange, suggestions, emoji } = props;
  const add = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (!value.includes(t)) onChange([...value, t]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-line bg-white/[0.02] p-2">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-md border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold-2">
            {emoji ? `${t} ` : ""}{t}
            <button onClick={() => onChange(value.filter((x) => x !== t))} className="font-bold text-fog hover:text-danger">×</button>
          </span>
        ))}
        <input
          className="min-w-24 flex-1 bg-transparent px-1 text-xs text-cream outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => add(draft)}
          placeholder={value.length ? "" : "Add…"}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {suggestions
          .filter((s) => !value.includes(s))
          .map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="chip !px-2 !py-0.5 !text-[10px]"
            >
              + {s}
            </button>
          ))}
      </div>
    </div>
  );
}
