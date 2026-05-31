"use client";

import { useState, useEffect, useCallback } from "react";
import { ImageUpload } from "@/components/shared/ImageUpload";

// ─── TYPES ───────────────────────────────────────────────

type DemoPet = {
  id: string;
  name: string;
  type: string;
  breed: string | null;
  photos: string[];
  contestEntries: { contestId: string; contest: { id: string; name: string; isActive: boolean } }[];
};

type DemoAccount = {
  id: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    city: string | null;
    state: string | null;
    createdAt: string;
    pets: DemoPet[];
  };
};

type Contest = {
  id: string;
  name: string;
  type: string;
  petType: string;
  isActive: boolean;
  endDate: string;
  currentPhase: string;
  cutSize: number | null;
  activeCount: number;
  availableSlots: number | null;
};

type ScheduledPost = {
  id: string;
  postType: "POST" | "STORY";
  content: string;
  imageUrl: string | null;
  scheduledFor: string;
  status: "PENDING" | "PROCESSING" | "PUBLISHED" | "FAILED";
  errorMessage: string | null;
  user: { id: string; name: string | null; email: string | null; image: string | null };
};

// ─── MAIN ────────────────────────────────────────────────

export function DemoStudioClient() {
  const [tab, setTab] = useState<"accounts" | "contests" | "content" | "scheduled">("accounts");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Demo Studio</h1>
        <p className="text-sm text-surface-500 mt-1">
          Create demo accounts, add pets to contests, and generate AI-powered posts &amp; stories
        </p>
      </div>

      <div className="flex gap-2 border-b border-surface-200 pb-2 flex-wrap">
        {(
          [
            { id: "accounts", label: "👤 Accounts", desc: "Create & manage" },
            { id: "contests", label: "🏆 Contests", desc: "Enter & vote" },
            { id: "content", label: "✨ AI Content", desc: "Generate & schedule" },
            { id: "scheduled", label: "📅 Scheduled", desc: "Queue & status" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? "bg-brand-600 text-white" : "text-surface-600 hover:bg-surface-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "accounts" && <AccountsTab />}
      {tab === "contests" && <ContestsTab />}
      {tab === "content" && <ContentTab />}
      {tab === "scheduled" && <ScheduledTab />}
    </div>
  );
}

// ─── ACCOUNTS TAB ────────────────────────────────────────

function AccountsTab() {
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingAccount, setEditingAccount] = useState<DemoAccount | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [petName, setPetName] = useState("");
  const [petType, setPetType] = useState<"DOG" | "CAT" | "OTHER">("DOG");
  const [petBreed, setPetBreed] = useState("");
  const [petBio, setPetBio] = useState("");
  const [petPhotos, setPetPhotos] = useState<string[]>([""]);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/demo-studio/accounts");
      const data = await res.json();
      setAccounts(data.accounts || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/demo-studio/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, email, profileImage, city, state,
          petName, petType, petBreed, petBio,
          petPhotos: petPhotos.filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "Failed"); return; }
      setMsg(`Created account for ${data.user.name} with pet ${data.pet.name}`);
      setShowForm(false);
      resetForm();
      fetchAccounts();
    } catch {
      setMsg("Network error");
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setName(""); setEmail(""); setProfileImage(""); setCity(""); setState("");
    setPetName(""); setPetType("DOG"); setPetBreed(""); setPetBio(""); setPetPhotos([""]);
  };

  const autoFillEmail = () => {
    if (petName && !email) {
      const slug = petName.toLowerCase().replace(/\s+/g, ".");
      setEmail(`demo.${slug}.${Date.now().toString().slice(-4)}@vtfdemo.com`);
    }
  };

  const handleDeleteAccount = async (acc: DemoAccount) => {
    if (!confirm(`Delete "${acc.user.name}" and all their data? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/demo-studio/accounts?userId=${acc.user.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "Delete failed"); return; }
      setAccounts((prev) => prev.filter((a) => a.id !== acc.id));
      setMsg(`Deleted account "${acc.user.name}"`);
    } catch {
      setMsg("Network error");
    }
    setTimeout(() => setMsg(""), 4000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-surface-500">{accounts.length} demo account{accounts.length !== 1 ? "s" : ""}</p>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
          {showForm ? "Cancel" : "+ New Account"}
        </button>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm ${msg.includes("Created") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-surface-200 p-6 space-y-5">
          <h3 className="font-semibold text-surface-900">New Demo Account</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1">Owner Name *</label>
              <input required value={name} onChange={e => setName(e.target.value)} className="input-field w-full" placeholder="Alex Johnson" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1">Email *</label>
              <div className="flex gap-2">
                <input required value={email} onChange={e => setEmail(e.target.value)} className="input-field flex-1" placeholder="demo@example.com" />
                <button type="button" onClick={autoFillEmail} className="btn-secondary text-xs px-2">Auto</button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1">City</label>
              <input value={city} onChange={e => setCity(e.target.value)} className="input-field w-full" placeholder="New York" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1">State</label>
              <input value={state} onChange={e => setState(e.target.value)} className="input-field w-full" placeholder="NY" />
            </div>
            <div className="sm:col-span-2">
              <ImageUpload value={profileImage} onChange={setProfileImage} label="Profile Picture" placeholder="Paste URL or upload..." />
            </div>
          </div>

          <hr className="border-surface-200" />
          <h4 className="font-medium text-surface-800 text-sm">Pet Details</h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1">Pet Name *</label>
              <input required value={petName} onChange={e => setPetName(e.target.value)} onBlur={autoFillEmail} className="input-field w-full" placeholder="Buddy" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1">Type</label>
              <select value={petType} onChange={e => setPetType(e.target.value as "DOG" | "CAT" | "OTHER")} className="input-field w-full">
                <option value="DOG">Dog</option>
                <option value="CAT">Cat</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1">Breed</label>
              <input value={petBreed} onChange={e => setPetBreed(e.target.value)} className="input-field w-full" placeholder="Golden Retriever" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1">Bio</label>
              <input value={petBio} onChange={e => setPetBio(e.target.value)} className="input-field w-full" placeholder="Loves fetch and cuddles..." />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-2">Pet Photos</label>
            <div className="space-y-2">
              {petPhotos.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <ImageUpload
                    value={url}
                    onChange={(v) => {
                      const next = [...petPhotos];
                      next[i] = v;
                      setPetPhotos(next);
                    }}
                    label=""
                    placeholder={`Photo ${i + 1} URL`}
                  />
                  {petPhotos.length > 1 && (
                    <button type="button" onClick={() => setPetPhotos(petPhotos.filter((_, j) => j !== i))} className="text-red-500 text-xs px-2">✕</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setPetPhotos([...petPhotos, ""])} className="text-brand-600 text-xs hover:underline">
                + Add photo
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="btn-secondary text-sm">Cancel</button>
            <button type="submit" disabled={creating} className="btn-primary text-sm">
              {creating ? "Creating..." : "Create Account"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-surface-400">Loading...</p>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 text-surface-400">
          <p className="text-4xl mb-2">🎭</p>
          <p>No demo accounts yet. Create your first one above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onEdit={() => setEditingAccount(acc)}
              onDelete={() => handleDeleteAccount(acc)}
            />
          ))}
        </div>
      )}

      {editingAccount && (
        <EditAccountModal
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
          onSaved={(updated) => {
            setAccounts((prev) =>
              prev.map((a) => (a.id === updated.id ? updated : a))
            );
            setEditingAccount(null);
            setMsg(`Saved changes for "${updated.user.name}"`);
            setTimeout(() => setMsg(""), 4000);
          }}
        />
      )}
    </div>
  );
}

function AccountCard({
  account,
  onEdit,
  onDelete,
}: {
  account: DemoAccount;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const u = account.user;
  const pet = u.pets[0];
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-4 space-y-3">
      <div className="flex items-center gap-3">
        {u.image ? (
          <img src={u.image} alt={u.name || ""} className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-sm">
            {(u.name || "D")[0].toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-surface-900 text-sm truncate">{u.name}</p>
          <p className="text-xs text-surface-400 truncate">{u.email}</p>
        </div>
      </div>
      {pet && (
        <div className="flex gap-3 items-center">
          {pet.photos[0] ? (
            <img src={pet.photos[0]} alt={pet.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-surface-100 flex items-center justify-center text-lg flex-shrink-0">
              {pet.type === "DOG" ? "🐶" : pet.type === "CAT" ? "🐱" : "🐾"}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-surface-800 truncate">{pet.name}</p>
            <p className="text-xs text-surface-400">{pet.breed || pet.type}</p>
            <p className="text-xs text-surface-400">{pet.contestEntries.length} contest{pet.contestEntries.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between pt-1 border-t border-surface-100">
        <p className="text-xs text-surface-400">{u.pets.length} pet{u.pets.length !== 1 ? "s" : ""} · {new Date(u.createdAt).toLocaleDateString()}</p>
        <div className="flex gap-1.5">
          <button
            onClick={onEdit}
            className="rounded-lg bg-surface-100 px-2.5 py-1 text-xs font-medium text-surface-600 hover:bg-brand-50 hover:text-brand-700 transition-colors"
          >
            ✏️ Edit
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg bg-surface-100 px-2.5 py-1 text-xs font-medium text-surface-500 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

function EditAccountModal({
  account,
  onClose,
  onSaved,
}: {
  account: DemoAccount;
  onClose: () => void;
  onSaved: (updated: DemoAccount) => void;
}) {
  const u = account.user;
  const pet = u.pets[0];

  const [name, setName] = useState(u.name || "");
  const [email, setEmail] = useState(u.email || "");
  const [profileImage, setProfileImage] = useState(u.image || "");
  const [city, setCity] = useState(u.city || "");
  const [state, setState] = useState(u.state || "");
  const [petName, setPetName] = useState(pet?.name || "");
  const [petType, setPetType] = useState<"DOG" | "CAT" | "OTHER">((pet?.type as "DOG" | "CAT" | "OTHER") || "DOG");
  const [petBreed, setPetBreed] = useState(pet?.breed || "");
  const [petBio, setPetBio] = useState("");
  const [petPhotos, setPetPhotos] = useState<string[]>(pet?.photos.length ? pet.photos : [""]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/demo-studio/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: u.id,
          petId: pet?.id,
          name,
          email,
          profileImage: profileImage || undefined,
          city: city || undefined,
          state: state || undefined,
          petName: petName || undefined,
          petType,
          petBreed: petBreed || undefined,
          petBio: petBio || undefined,
          petPhotos: petPhotos.filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Save failed"); return; }

      // Build updated DemoAccount from response
      const updated: DemoAccount = {
        ...account,
        user: {
          ...u,
          name: data.user.name,
          email: data.user.email,
          image: data.user.image,
          city: data.user.city,
          state: data.user.state,
          pets: pet && data.pet
            ? u.pets.map((p) =>
                p.id === data.pet.id
                  ? { ...p, name: data.pet.name, type: data.pet.type, breed: data.pet.breed, photos: data.pet.photos }
                  : p
              )
            : u.pets,
        },
      };
      onSaved(updated);
    } catch {
      setErr("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-y-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-surface-100">
          <h3 className="text-base font-bold text-surface-900">Edit Demo Account</h3>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-700 text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          {err && <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>}

          <div>
            <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-3">Owner</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1">Name *</label>
                <input required value={name} onChange={e => setName(e.target.value)} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1">Email *</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1">City</label>
                <input value={city} onChange={e => setCity(e.target.value)} className="input-field w-full" placeholder="New York" />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1">State</label>
                <input value={state} onChange={e => setState(e.target.value)} className="input-field w-full" placeholder="NY" />
              </div>
              <div className="sm:col-span-2">
                <ImageUpload value={profileImage} onChange={setProfileImage} label="Profile Picture" placeholder="Paste URL or upload..." />
              </div>
            </div>
          </div>

          {pet && (
            <div>
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-3">Pet</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-surface-500 mb-1">Pet Name *</label>
                  <input required value={petName} onChange={e => setPetName(e.target.value)} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-500 mb-1">Type</label>
                  <select value={petType} onChange={e => setPetType(e.target.value as "DOG" | "CAT" | "OTHER")} className="input-field w-full">
                    <option value="DOG">Dog</option>
                    <option value="CAT">Cat</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-500 mb-1">Breed</label>
                  <input value={petBreed} onChange={e => setPetBreed(e.target.value)} className="input-field w-full" placeholder="Golden Retriever" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-500 mb-1">Bio</label>
                  <input value={petBio} onChange={e => setPetBio(e.target.value)} className="input-field w-full" placeholder="Loves fetch..." />
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-xs font-medium text-surface-500 mb-2">Photos</label>
                <div className="space-y-2">
                  {petPhotos.map((url, i) => (
                    <div key={i} className="flex gap-2">
                      <ImageUpload
                        value={url}
                        onChange={(v) => {
                          const next = [...petPhotos];
                          next[i] = v;
                          setPetPhotos(next);
                        }}
                        label=""
                        placeholder={`Photo ${i + 1}`}
                      />
                      {petPhotos.length > 1 && (
                        <button type="button" onClick={() => setPetPhotos(petPhotos.filter((_, j) => j !== i))} className="text-red-500 text-xs px-2">✕</button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => setPetPhotos([...petPhotos, ""])} className="text-brand-600 text-xs hover:underline">
                    + Add photo
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── CONTESTS TAB ────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  OPEN: "Open",
  TOP100: "Top 100",
  TOP25: "Top 25",
  TOP5: "Top 5",
  ENDED: "Ended",
};

const PHASE_COLORS: Record<string, string> = {
  OPEN: "bg-green-50 text-green-700",
  TOP100: "bg-blue-50 text-blue-700",
  TOP25: "bg-yellow-50 text-yellow-700",
  TOP5: "bg-orange-50 text-orange-700",
  ENDED: "bg-surface-100 text-surface-500",
};

function ContestsTab() {
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error" | "warn">("success");
  const [submitting, setSubmitting] = useState(false);

  const [selectedPetId, setSelectedPetId] = useState("");
  const [selectedContestId, setSelectedContestId] = useState("");
  const [votes, setVotes] = useState(50);
  const [voteType, setVoteType] = useState<"FREE" | "PAID">("PAID");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [accs, cons] = await Promise.all([
        fetch("/api/admin/demo-studio/accounts").then(r => r.json()),
        fetch("/api/admin/demo-studio/contests").then(r => r.json()),
      ]);
      setAccounts(accs.accounts || []);
      setContests(cons.contests || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const allPets = accounts.flatMap(acc =>
    acc.user.pets.map(pet => ({ ...pet, ownerName: acc.user.name, userId: acc.user.id }))
  );

  const selectedContest = contests.find(c => c.id === selectedContestId);
  const isFull = selectedContest?.availableSlots === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/demo-studio/contest-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId: selectedPetId, contestId: selectedContestId, votes, voteType }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "Failed"); setMsgType("error"); return; }

      let successMsg = `Entered "${data.contestName}"`;
      if (votes > 0) successMsg += ` with ${votes} ${voteType.toLowerCase()} votes`;
      if (data.eliminatedPetName) successMsg += ` · Eliminated "${data.eliminatedPetName}" (fewest votes)`;

      setMsg(successMsg);
      setMsgType(data.eliminatedPetName ? "warn" : "success");
      fetchData(); // refresh slot counts
    } catch {
      setMsg("Network error");
      setMsgType("error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p className="text-sm text-surface-400">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-surface-200 p-6 space-y-5">
        <h3 className="font-semibold text-surface-900">Add Demo Pet to Contest</h3>

        {msg && (
          <div className={`rounded-lg px-4 py-3 text-sm ${
            msgType === "error" ? "bg-red-50 text-red-700" :
            msgType === "warn" ? "bg-yellow-50 text-yellow-700" :
            "bg-green-50 text-green-700"
          }`}>
            {msg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Demo Pet *</label>
            <select required value={selectedPetId} onChange={e => setSelectedPetId(e.target.value)} className="input-field w-full">
              <option value="">Select a pet...</option>
              {allPets.map(pet => (
                <option key={pet.id} value={pet.id}>
                  {pet.name} ({pet.type}) — {pet.ownerName}
                </option>
              ))}
            </select>
            {allPets.length === 0 && <p className="text-xs text-surface-400 mt-1">No demo pets yet — create accounts first.</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Contest *</label>
            <select required value={selectedContestId} onChange={e => setSelectedContestId(e.target.value)} className="input-field w-full">
              <option value="">Select a contest...</option>
              {contests.map(c => {
                const slots = c.availableSlots;
                const slotLabel = slots === null ? "unlimited" : slots === 0 ? "FULL" : `${slots} slot${slots !== 1 ? "s" : ""}`;
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} · {PHASE_LABELS[c.currentPhase] || c.currentPhase} · {slotLabel} · {c.petType}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Contest info card */}
          {selectedContest && (
            <div className="rounded-lg border border-surface-200 p-3 space-y-2 bg-surface-50">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PHASE_COLORS[selectedContest.currentPhase] || "bg-surface-100 text-surface-500"}`}>
                  {PHASE_LABELS[selectedContest.currentPhase] || selectedContest.currentPhase}
                </span>
                {selectedContest.type === "FLAGSHIP" && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">FLAGSHIP</span>
                )}
                <span className="text-xs text-surface-500">ends {new Date(selectedContest.endDate).toLocaleDateString()}</span>
              </div>

              {selectedContest.cutSize !== null && (
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-surface-500">{selectedContest.activeCount} / {selectedContest.cutSize} active</span>
                    <span className={selectedContest.availableSlots === 0 ? "text-red-600 font-medium" : "text-green-600 font-medium"}>
                      {selectedContest.availableSlots === 0 ? "Full — will eliminate last place" : `${selectedContest.availableSlots} slots free`}
                    </span>
                  </div>
                  <div className="w-full bg-surface-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${isFull ? "bg-red-400" : "bg-green-400"}`}
                      style={{ width: `${Math.min(100, (selectedContest.activeCount / selectedContest.cutSize) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {isFull && (
                <p className="text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1.5">
                  ⚠️ Contest is full. Adding this pet will <strong>automatically eliminate</strong> the current last-place entry (fewest votes).
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1">Inject Votes</label>
              <input type="number" min={0} max={10000} value={votes} onChange={e => setVotes(Number(e.target.value))} className="input-field w-full" />
              <p className="text-xs text-surface-400 mt-1">0 = just enter, no votes</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1">Vote Type</label>
              <select value={voteType} onChange={e => setVoteType(e.target.value as "FREE" | "PAID")} className="input-field w-full">
                <option value="PAID">Paid</option>
                <option value="FREE">Free</option>
              </select>
            </div>
          </div>

          <button type="submit" disabled={submitting || !selectedPetId || !selectedContestId} className="btn-primary text-sm w-full">
            {submitting ? "Adding..." : isFull ? "Add & Eliminate Last Place" : "Enter Contest + Inject Votes"}
          </button>
        </form>
      </div>

      {/* Contest list overview */}
      {contests.length > 0 && (
        <div>
          <h4 className="font-medium text-surface-800 text-sm mb-3">Active Contests Overview</h4>
          <div className="space-y-2">
            {contests.map(c => (
              <div key={c.id} className="bg-white rounded-lg border border-surface-200 px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${PHASE_COLORS[c.currentPhase] || "bg-surface-100"}`}>
                    {PHASE_LABELS[c.currentPhase] || c.currentPhase}
                  </span>
                  <p className="text-sm font-medium text-surface-800 truncate">{c.name}</p>
                  <p className="text-xs text-surface-400 flex-shrink-0">{c.petType}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {c.cutSize !== null ? (
                    <p className={`text-xs font-medium ${c.availableSlots === 0 ? "text-red-600" : "text-green-600"}`}>
                      {c.activeCount}/{c.cutSize}
                      {c.availableSlots === 0 ? " · FULL" : ` · ${c.availableSlots} free`}
                    </p>
                  ) : (
                    <p className="text-xs text-surface-400">{c.activeCount} entries</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Demo pet contest status */}
      {allPets.length > 0 && (
        <div>
          <h4 className="font-medium text-surface-800 text-sm mb-3">Demo Pet Status</h4>
          <div className="space-y-2">
            {allPets.map(pet => (
              <div key={pet.id} className="bg-white rounded-lg border border-surface-200 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {pet.photos[0] ? (
                    <img src={pet.photos[0]} alt={pet.name} className="w-8 h-8 rounded-lg object-cover" />
                  ) : (
                    <span>{pet.type === "DOG" ? "🐶" : "🐱"}</span>
                  )}
                  <div>
                    <p className="text-sm font-medium text-surface-800">{pet.name}</p>
                    <p className="text-xs text-surface-400">{pet.ownerName}</p>
                  </div>
                </div>
                <div className="text-right">
                  {pet.contestEntries.length === 0 ? (
                    <span className="text-xs text-surface-400">No contests</span>
                  ) : (
                    <div className="flex flex-col gap-1 items-end">
                      {pet.contestEntries.map(ce => (
                        <span key={ce.contestId} className={`text-xs px-2 py-0.5 rounded-full ${ce.contest.isActive ? "bg-green-50 text-green-700" : "bg-surface-100 text-surface-500"}`}>
                          {ce.contest.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AI CONTENT TAB ──────────────────────────────────────

type GeneratedPost = {
  caption: string;
  hashtags?: string[];
  cta?: string;
  overlay?: string;
  emojis?: string[];
};

function ContentTab() {
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [msg, setMsg] = useState("");

  // Generation inputs
  const [imageUrl, setImageUrl] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [postType, setPostType] = useState<"POST" | "STORY">("POST");

  // Generated result
  const [generated, setGenerated] = useState<GeneratedPost | null>(null);
  const [editedCaption, setEditedCaption] = useState("");

  // Scheduling
  const [scheduledFor, setScheduledFor] = useState("");

  useEffect(() => {
    fetch("/api/admin/demo-studio/accounts")
      .then(r => r.json())
      .then(d => setAccounts(d.accounts || []))
      .finally(() => setLoading(false));

    // Default scheduled time: 1 hour from now
    const dt = new Date(Date.now() + 3600 * 1000);
    setScheduledFor(dt.toISOString().slice(0, 16));
  }, []);

  const selectedAccount = accounts.find(a => a.user.id === selectedUserId);
  const firstPet = selectedAccount?.user.pets[0];

  const handleGenerate = async () => {
    if (!imageUrl || !selectedUserId) {
      setMsg("Select an account and upload an image first");
      return;
    }
    if (!firstPet) {
      setMsg("Selected account has no pets");
      return;
    }
    setGenerating(true);
    setMsg("");
    setGenerated(null);
    try {
      const res = await fetch("/api/admin/demo-studio/generate-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          petName: firstPet.name,
          petType: firstPet.type,
          petBreed: firstPet.breed,
          postType,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "Generation failed"); return; }
      setGenerated(data.result);
      const fullCaption =
        postType === "POST"
          ? `${data.result.caption}\n\n${data.result.cta || ""}\n\n${(data.result.hashtags || []).join(" ")}`
          : data.result.caption;
      setEditedCaption(fullCaption.trim());
    } catch {
      setMsg("Network error");
    } finally {
      setGenerating(false);
    }
  };

  const handleSchedule = async () => {
    if (!selectedUserId || !editedCaption || !scheduledFor) {
      setMsg("Fill in account, caption, and schedule time");
      return;
    }
    setScheduling(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/demo-studio/scheduled-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          content: editedCaption,
          imageUrl: imageUrl || undefined,
          mediaType: "image",
          postType,
          scheduledFor: new Date(scheduledFor).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "Failed"); return; }
      setMsg(`Scheduled ${postType.toLowerCase()} for ${new Date(scheduledFor).toLocaleString()}`);
      setGenerated(null);
      setEditedCaption("");
      setImageUrl("");
    } catch {
      setMsg("Network error");
    } finally {
      setScheduling(false);
    }
  };

  const handlePostNow = async () => {
    if (!selectedUserId || !editedCaption) {
      setMsg("Select an account and generate or write a caption first");
      return;
    }
    setScheduling(true);
    setMsg("");
    try {
      // Schedule for right now — the admin can also click "Scheduled" tab and see it as PENDING
      // then trigger cron manually, or it will auto-fire within the cron interval
      const res = await fetch("/api/admin/demo-studio/scheduled-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          content: editedCaption,
          imageUrl: imageUrl || undefined,
          mediaType: "image",
          postType,
          scheduledFor: new Date(Date.now() - 1000).toISOString(), // 1s in past = immediately due
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "Failed"); return; }
      setMsg(`Queued for immediate publish. Check the Scheduled tab to confirm.`);
      setGenerated(null);
      setEditedCaption("");
      setImageUrl("");
    } catch {
      setMsg("Network error");
    } finally {
      setScheduling(false);
    }
  };

  if (loading) return <p className="text-sm text-surface-400">Loading...</p>;

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm ${msg.includes("Scheduled") || msg.includes("published") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: inputs */}
        <div className="bg-white rounded-xl border border-surface-200 p-6 space-y-4">
          <h3 className="font-semibold text-surface-900">Generate Content</h3>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Demo Account *</label>
            <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className="input-field w-full">
              <option value="">Select account...</option>
              {accounts.map(a => (
                <option key={a.user.id} value={a.user.id}>
                  {a.user.name} — {a.user.pets[0]?.name || "no pets"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Content Type</label>
            <div className="flex gap-2">
              {(["POST", "STORY"] as const).map(t => (
                <button key={t} type="button" onClick={() => setPostType(t)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${postType === t ? "bg-brand-600 text-white border-brand-600" : "border-surface-200 text-surface-600 hover:bg-surface-50"}`}>
                  {t === "POST" ? "📝 Post" : "📸 Story"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <ImageUpload value={imageUrl} onChange={setImageUrl} label="Photo *" placeholder="Upload or paste image URL..." />
            {imageUrl && (
              <img src={imageUrl} alt="preview" className="mt-2 rounded-lg w-full max-h-48 object-cover" />
            )}
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !imageUrl || !selectedUserId}
            className="btn-primary w-full text-sm"
          >
            {generating ? "Generating with Gemini AI..." : "✨ Generate Caption with AI"}
          </button>
        </div>

        {/* Right: result + scheduling */}
        <div className="bg-white rounded-xl border border-surface-200 p-6 space-y-4">
          <h3 className="font-semibold text-surface-900">Preview & Schedule</h3>

          {generated && postType === "POST" && (
            <div className="bg-surface-50 rounded-lg p-3 space-y-1 text-sm">
              <p className="font-medium text-surface-700">AI Suggestion</p>
              <p className="text-surface-600">{generated.caption}</p>
              {generated.cta && <p className="text-brand-600 font-medium">{generated.cta}</p>}
              {generated.hashtags && (
                <p className="text-surface-400 text-xs">{generated.hashtags.join(" ")}</p>
              )}
            </div>
          )}

          {generated && postType === "STORY" && (
            <div className="bg-surface-50 rounded-lg p-3 space-y-1 text-sm">
              <p className="font-medium text-surface-700">AI Suggestion</p>
              <p className="text-surface-600">{generated.caption}</p>
              {generated.overlay && <p className="text-brand-600 font-medium">Overlay: {generated.overlay}</p>}
              {generated.emojis && <p className="text-xl">{generated.emojis.join(" ")}</p>}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">
              Caption / Content {generated ? "(edit as needed)" : "(write manually or generate above)"}
            </label>
            <textarea
              value={editedCaption}
              onChange={e => setEditedCaption(e.target.value)}
              rows={5}
              className="input-field w-full resize-none"
              placeholder="Write or generate a caption..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Schedule For</label>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={e => setScheduledFor(e.target.value)}
              className="input-field w-full"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handlePostNow}
              disabled={scheduling || !editedCaption || !selectedUserId}
              className="btn-secondary flex-1 text-sm"
            >
              {scheduling ? "..." : "Post Now"}
            </button>
            <button
              type="button"
              onClick={handleSchedule}
              disabled={scheduling || !editedCaption || !selectedUserId || !scheduledFor}
              className="btn-primary flex-1 text-sm"
            >
              {scheduling ? "Scheduling..." : "Schedule"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SCHEDULED TAB ───────────────────────────────────────

function ScheduledTab() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "PENDING" | "PUBLISHED" | "FAILED">("ALL");

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/demo-studio/scheduled-posts");
      const data = await res.json();
      setPosts(data.posts || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setMsg("");
    try {
      const res = await fetch(`/api/admin/demo-studio/scheduled-posts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        setMsg(d.error || "Delete failed");
      } else {
        setPosts(posts.filter(p => p.id !== id));
      }
    } catch {
      setMsg("Network error");
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = filterStatus === "ALL" ? posts : posts.filter(p => p.status === filterStatus);

  const counts = {
    pending: posts.filter(p => p.status === "PENDING").length,
    published: posts.filter(p => p.status === "PUBLISHED").length,
    failed: posts.filter(p => p.status === "FAILED").length,
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Pending", count: counts.pending, color: "text-yellow-600 bg-yellow-50" },
          { label: "Published", count: counts.published, color: "text-green-600 bg-green-50" },
          { label: "Failed", count: counts.failed, color: "text-red-600 bg-red-50" },
        ].map(s => (
          <div key={s.label} className={`rounded-xl px-4 py-3 ${s.color}`}>
            <p className="text-2xl font-bold">{s.count}</p>
            <p className="text-xs font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {msg && <div className="rounded-lg px-4 py-3 text-sm bg-red-50 text-red-700">{msg}</div>}

      {/* Filter */}
      <div className="flex gap-2">
        {(["ALL", "PENDING", "PUBLISHED", "FAILED"] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${filterStatus === s ? "bg-brand-600 text-white" : "bg-surface-100 text-surface-600 hover:bg-surface-200"}`}>
            {s}
          </button>
        ))}
        <button onClick={fetchPosts} className="ml-auto text-xs text-surface-500 hover:text-surface-700">↻ Refresh</button>
      </div>

      {loading ? (
        <p className="text-sm text-surface-400">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-surface-400">
          <p className="text-4xl mb-2">📅</p>
          <p>No {filterStatus !== "ALL" ? filterStatus.toLowerCase() : ""} scheduled posts.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(post => (
            <ScheduledPostRow key={post.id} post={post} onDelete={handleDelete} deleting={deletingId === post.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduledPostRow({ post, onDelete, deleting }: { post: ScheduledPost; onDelete: (id: string) => void; deleting: boolean }) {
  const statusColors: Record<string, string> = {
    PENDING: "bg-yellow-50 text-yellow-700",
    PROCESSING: "bg-blue-50 text-blue-700",
    PUBLISHED: "bg-green-50 text-green-700",
    FAILED: "bg-red-50 text-red-700",
  };

  return (
    <div className="bg-white rounded-xl border border-surface-200 p-4 flex gap-4 items-start">
      {post.imageUrl ? (
        <img src={post.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <div className="w-16 h-16 rounded-lg bg-surface-100 flex items-center justify-center text-2xl flex-shrink-0">
          {post.postType === "STORY" ? "📸" : "📝"}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[post.status]}`}>
            {post.status}
          </span>
          <span className="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full">
            {post.postType}
          </span>
          <span className="text-xs text-surface-400 ml-auto">
            {new Date(post.scheduledFor).toLocaleString()}
          </span>
        </div>
        <p className="text-sm text-surface-700 line-clamp-2">{post.content}</p>
        <p className="text-xs text-surface-400 mt-1">
          {post.user.name} · {post.user.email}
        </p>
        {post.errorMessage && (
          <p className="text-xs text-red-600 mt-1">Error: {post.errorMessage}</p>
        )}
      </div>
      {post.status === "PENDING" && (
        <button
          onClick={() => onDelete(post.id)}
          disabled={deleting}
          className="text-xs text-red-500 hover:text-red-700 flex-shrink-0"
        >
          {deleting ? "..." : "Cancel"}
        </button>
      )}
    </div>
  );
}
