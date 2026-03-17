"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PetData = {
  id: string;
  name: string;
  ownerName: string;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  bio: string | null;
  type: string;
  breed: string | null;
  state: string | null;
  tags: string[];
  photos: string[];
  isActive: boolean;
  createdAt: string;
  voteCount: number;
  commentCount: number;
  contestEntryCount: number;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
    city: string | null;
    state: string | null;
    createdAt: string;
  };
  contestEntries: Array<{
    id: string;
    createdAt: string;
    contest: {
      id: string;
      name: string;
      startDate: string;
      endDate: string;
      isActive: boolean;
    };
  }>;
};

export function AdminPetEditor({ pet }: { pet: PetData }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: pet.name,
    ownerName: pet.ownerName,
    ownerFirstName: pet.ownerFirstName || "",
    ownerLastName: pet.ownerLastName || "",
    bio: pet.bio || "",
    type: pet.type,
    breed: pet.breed || "",
    state: pet.state || "",
    tags: pet.tags.join(", "),
    photos: pet.photos,
    isActive: pet.isActive,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const sortedEntries = useMemo(
    () => [...pet.contestEntries].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [pet.contestEntries]
  );

  async function saveChanges(nextOverride?: Partial<typeof form>) {
    setSaving(true);
    setMessage("");

    const nextForm = { ...form, ...nextOverride };

    try {
      const res = await fetch(`/api/admin/pets/${pet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...nextForm,
          tags: nextForm.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update pet");

      setForm({
        name: data.pet.name,
        ownerName: data.pet.ownerName,
        ownerFirstName: data.pet.ownerFirstName || "",
        ownerLastName: data.pet.ownerLastName || "",
        bio: data.pet.bio || "",
        type: data.pet.type,
        breed: data.pet.breed || "",
        state: data.pet.state || "",
        tags: Array.isArray(data.pet.tags) ? data.pet.tags.join(", ") : "",
        photos: Array.isArray(data.pet.photos) ? data.pet.photos : [],
        isActive: Boolean(data.pet.isActive),
      });
      setMessage("Saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update pet");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  }

  function removePhoto(photoUrl: string) {
    setForm((current) => ({ ...current, photos: current.photos.filter((photo) => photo !== photoUrl) }));
  }

  async function toggleActive(nextActive: boolean) {
    const confirmed = window.confirm(
      nextActive
        ? "Reactivate this pet?"
        : "Remove this pet from contests? This only sets isActive=false and does not delete the user account."
    );

    if (!confirmed) return;
    await saveChanges({ isActive: nextActive });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-surface-900">Pet Details</h2>
              <p className="text-sm text-surface-500">Edit the pet profile without touching the owner account.</p>
            </div>
            <div className="flex gap-2">
              {form.isActive ? (
                <button onClick={() => toggleActive(false)} className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100">
                  Remove Pet from Contest
                </button>
              ) : (
                <button onClick={() => toggleActive(true)} className="rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100">
                  Reactivate Pet
                </button>
              )}
              <button onClick={() => saveChanges()} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>

          {message && (
            <div className={`rounded-lg border px-4 py-2.5 text-sm font-medium ${message === "Saved." ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
              {message}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pet Name">
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input-field" />
            </Field>
            <Field label="Owner Name">
              <input value={form.ownerName} onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))} className="input-field" />
            </Field>
            <Field label="Owner First Name">
              <input value={form.ownerFirstName} onChange={(e) => setForm((f) => ({ ...f, ownerFirstName: e.target.value }))} className="input-field" />
            </Field>
            <Field label="Owner Last Name">
              <input value={form.ownerLastName} onChange={(e) => setForm((f) => ({ ...f, ownerLastName: e.target.value }))} className="input-field" />
            </Field>
            <Field label="Type">
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input-field">
                <option value="DOG">DOG</option>
                <option value="CAT">CAT</option>
                <option value="OTHER">OTHER</option>
              </select>
            </Field>
            <Field label="Breed">
              <input value={form.breed} onChange={(e) => setForm((f) => ({ ...f, breed: e.target.value }))} className="input-field" />
            </Field>
            <Field label="State">
              <input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} className="input-field" />
            </Field>
            <Field label="Tags (comma separated)">
              <input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} className="input-field" />
            </Field>
          </div>

          <Field label="Bio">
            <textarea value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} rows={4} className="input-field resize-none" />
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium text-surface-700">Photo Management</p>
            {form.photos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-200 p-6 text-sm text-surface-400">No photos on this pet.</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {form.photos.map((photo) => (
                  <div key={photo} className="relative overflow-hidden rounded-xl border border-surface-200 bg-white">
                    <img src={photo} alt="" className="h-36 w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(photo)}
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-sm text-white hover:bg-black"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-surface-400">Removing a thumbnail updates the pet&apos;s `photos` array on save — it does not delete the owner or account.</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Pet Snapshot</h3>
            <div className="space-y-2 text-sm">
              <Row label="Status" value={form.isActive ? "Active" : "Inactive"} />
              <Row label="Votes" value={pet.voteCount.toLocaleString()} />
              <Row label="Comments" value={pet.commentCount.toLocaleString()} />
              <Row label="Contest Entries" value={pet.contestEntryCount.toLocaleString()} />
              <Row label="Created" value={new Date(pet.createdAt).toLocaleDateString()} />
            </div>
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Owner Account</h3>
            <div className="space-y-2 text-sm text-surface-700">
              <Row label="Name" value={pet.user.name || "—"} />
              <Row label="Email" value={pet.user.email || "—"} />
              <Row label="Role" value={pet.user.role} />
              <Row label="Location" value={[pet.user.city, pet.user.state].filter(Boolean).join(", ") || "—"} />
              <Row label="Joined" value={new Date(pet.user.createdAt).toLocaleDateString()} />
            </div>
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Contest Entries</h3>
            {sortedEntries.length === 0 ? (
              <p className="text-sm text-surface-400">This pet is not entered in any contests.</p>
            ) : (
              <ul className="space-y-3">
                {sortedEntries.map((entry) => (
                  <li key={entry.id} className="rounded-xl border border-surface-100 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-surface-800">{entry.contest.name}</p>
                        <p className="text-xs text-surface-400">
                          {new Date(entry.contest.startDate).toLocaleDateString()} — {new Date(entry.contest.endDate).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${entry.contest.isActive ? "bg-emerald-100 text-emerald-700" : "bg-surface-200 text-surface-500"}`}>
                        {entry.contest.isActive ? "Active" : "Closed"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-surface-400">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-surface-500">{label}</span>
      <span className="font-medium text-surface-800 text-right">{value}</span>
    </div>
  );
}
