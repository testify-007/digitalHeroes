'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props { charities: any[] }

const EMPTY = { name: '', description: '', logo_url: '', is_published: false }

export default function CharityPanel({ charities }: Props) {
  const router = useRouter()
  const [form, setForm]         = useState(EMPTY)
  const [editId, setEditId]     = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const startEdit = (c: any) => {
    setEditId(c.id)
    setForm({ name: c.name, description: c.description ?? '', logo_url: c.logo_url ?? '', is_published: c.is_published })
  }

  const handleSave = async () => {
    if (!form.name) { setError('Name is required.'); return }
    setSaving(true); setError(null)
    const supabase = createClient()
    const payload = {
      name: form.name,
      description: form.description || null,
      logo_url: form.logo_url || null,
      is_published: form.is_published,
      slug: form.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    }
    const { error: dbErr } = editId
      ? await supabase.from('charities').update(payload).eq('id', editId)
      : await supabase.from('charities').insert(payload)
    setSaving(false)
    if (dbErr) { setError(dbErr.message); return }
    setForm(EMPTY); setEditId(null)
    router.refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this charity? This cannot be undone.')) return
    setDeleting(id)
    const supabase = createClient()
    await supabase.from('charities').delete().eq('id', id)
    setDeleting(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{error}</div>
      )}

      {/* Form */}
      <div className="glass p-6">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">
          {editId ? 'Edit Charity' : 'Add New Charity'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} className="input" placeholder="Charity name" />
          </div>
          <div>
            <label className="label">Logo URL</label>
            <input value={form.logo_url} onChange={e => set('logo_url', e.target.value)} className="input" placeholder="https://…" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Description</label>
            <textarea
              value={form.description} onChange={e => set('description', e.target.value)}
              rows={3} className="input resize-none" placeholder="What does this charity do?"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              id="is_published" type="checkbox"
              checked={form.is_published} onChange={e => set('is_published', e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-brand-500 focus:ring-brand-500"
            />
            <label htmlFor="is_published" className="text-sm text-slate-300">Published (visible to public)</label>
          </div>
        </div>
        <div className="flex gap-3">
          {editId && (
            <button onClick={() => { setEditId(null); setForm(EMPTY) }} className="btn-secondary">
              Cancel
            </button>
          )}
          <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-60">
            {saving ? 'Saving…' : editId ? 'Update charity' : 'Add charity'}
          </button>
        </div>
      </div>

      {/* Charity list */}
      <div className="glass p-6">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">All Charities</h3>
        <div className="space-y-3">
          {charities.map(c => (
            <div key={c.id} className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/8">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                {c.logo_url
                  ? <img src={c.logo_url} alt={c.name} className="w-full h-full object-cover rounded-xl" />
                  : <span className="text-xs font-black text-white/60">{c.name.slice(0,2).toUpperCase()}</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white truncate">{c.name}</p>
                <p className="text-xs text-slate-500 truncate">{c.description ?? '—'}</p>
              </div>
              <div className="flex items-center gap-3">
                {c.is_published
                  ? <span className="badge-active">Published</span>
                  : <span className="badge-inactive">Draft</span>
                }
                <button onClick={() => startEdit(c)} className="btn-secondary !px-3 !py-1.5 !text-xs">Edit</button>
                <button onClick={() => handleDelete(c.id)} disabled={deleting === c.id} className="btn-danger disabled:opacity-60">
                  {deleting === c.id ? '…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
          {charities.length === 0 && (
            <p className="text-center text-slate-600 py-8 text-sm">No charities yet. Add one above.</p>
          )}
        </div>
      </div>
    </div>
  )
}
