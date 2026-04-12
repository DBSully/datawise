"use client";

import { useState } from "react";
import { updateProfileNameAction } from "./actions";

type ProfileFormProps = {
  initialName: string;
};

export function ProfileForm({ initialName }: ProfileFormProps) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const hasChanged = name.trim() !== initialName;

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const result = await updateProfileNameAction(name);
    setSaving(false);
    if (result.error) {
      setMessage({ type: "error", text: result.error });
    } else {
      setMessage({ type: "success", text: "Name updated." });
    }
  }

  return (
    <div className="border-t border-slate-100 pt-4">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
        Full Name
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setMessage(null);
          }}
          className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !hasChanged}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {message && (
        <p
          className={`mt-1.5 text-xs ${
            message.type === "success" ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
