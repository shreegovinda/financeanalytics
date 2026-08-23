'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthSessionGuard from '@/components/AuthSessionGuard';
import BackButton from '@/components/BackButton';
import { apiGet, apiPost, apiPut, apiDelete, getErrorMessage } from '@/lib/api';

interface Category {
  id: string;
  name: string;
  color: string;
  is_default: boolean;
  parent_id?: string | null;
}

const COLORS = [
  { hex: '#ef4444', label: 'Red' },
  { hex: '#3b82f6', label: 'Blue' },
  { hex: '#22c55e', label: 'Green' },
  { hex: '#1f2937', label: 'Black' },
];

function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex gap-1.5">
      {COLORS.map((c) => (
        <button
          key={c.hex}
          type="button"
          title={c.label}
          onClick={() => onChange(c.hex)}
          className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-transform hover:scale-110 ${
            value === c.hex ? 'border-gray-800 scale-110' : 'border-transparent'
          }`}
          style={{ backgroundColor: c.hex }}
        />
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add root category
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6'); // default: Blue
  const [isCreating, setIsCreating] = useState(false);

  // Inline subcategory form (per-row "+ Sub" button)
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [subName, setSubName] = useState('');
  const [subColor, setSubColor] = useState('#22c55e'); // default: Green
  const [isCreatingSub, setIsCreatingSub] = useState(false);

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  async function fetchCategories(token: string) {
    try {
      const data = await apiGet<Category[]>('http://localhost:3001/api/categories', token);
      setCategories(data);
      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching categories:', getErrorMessage(err));
      setError('Failed to load categories');
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      void router.push('/auth');
      return;
    }
    void Promise.resolve().then(() => fetchCategories(token));
  }, [router]);

  const handleCreate = async (parentId: string | null = null) => {
    const name = parentId ? subName.trim() : newName.trim();
    const color = parentId ? subColor : newColor;

    if (!name) {
      setError('Name is required');
      return;
    }

    const conflict = categories.some(
      (c) => c.name.toLowerCase() === name.toLowerCase() && (c.parent_id ?? null) === parentId,
    );
    if (conflict) {
      setError('A category with this name already exists at this level');
      return;
    }

    setError(null);
    if (parentId) setIsCreatingSub(true);
    else setIsCreating(true);

    try {
      const token = localStorage.getItem('token');
      const created = await apiPost<Category>(
        'http://localhost:3001/api/categories',
        { name, color, parent_id: parentId },
        token ?? undefined,
      );
      setCategories((prev) => [...prev, created]);
      if (parentId) {
        setSubName('');
        setSubColor('#22c55e');
        setAddingSubFor(null);
      } else {
        setNewName('');
        setNewColor('#3b82f6');
      }
    } catch (err) {
      console.error('Error creating category:', getErrorMessage(err));
      setError('Failed to create category');
    } finally {
      if (parentId) setIsCreatingSub(false);
      else setIsCreating(false);
    }
  };

  const handleUpdate = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }

    const current = categories.find((c) => c.id === id);
    const conflict =
      current?.name !== trimmed &&
      categories.some(
        (c) =>
          c.id !== id &&
          c.name.toLowerCase() === trimmed.toLowerCase() &&
          (c.parent_id ?? null) === (current?.parent_id ?? null),
      );
    if (conflict) {
      setError('A category with this name already exists at this level');
      return;
    }

    setError(null);
    try {
      const token = localStorage.getItem('token');
      const updated = await apiPut<Category>(
        `http://localhost:3001/api/categories/${id}`,
        { name: editName, color: editColor },
        token ?? undefined,
      );
      setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditingId(null);
    } catch (err) {
      console.error('Error updating category:', getErrorMessage(err));
      setError('Failed to update category');
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const token = localStorage.getItem('token');
      await apiDelete(
        `http://localhost:3001/api/categories/${deleteConfirm.id}`,
        token ?? undefined,
      );
      const deletedId = deleteConfirm.id;
      setCategories((prev) => {
        const removed = new Set<string>([deletedId]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const c of prev) {
            if (!removed.has(c.id) && c.parent_id != null && removed.has(c.parent_id)) {
              removed.add(c.id);
              changed = true;
            }
          }
        }
        return prev.filter((c) => !removed.has(c.id));
      });
      setError(null);
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting category:', getErrorMessage(err));
      setError('Failed to delete category');
      setDeleteConfirm(null);
    }
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color);
    setAddingSubFor(null);
    setError(null);
  };

  const rootCategories = categories.filter((c) => !c.parent_id);
  const subcategoryCount = categories.length - rootCategories.length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_48%,#f8fafc_100%)]">
      <AuthSessionGuard />
      <div className="fixed inset-0 overflow-y-auto bg-slate-950/50 px-4 py-6 backdrop-blur-sm sm:py-10">
        <main className="mx-auto w-full max-w-3xl overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl">
          <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 px-6 py-6 text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_32%)]" />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-blue-100">Transaction setup</p>
                <h1 className="mt-1 text-2xl font-bold">Manage Categories</h1>
                <p className="mt-2 max-w-xl text-sm text-blue-100">
                  Keep categories simple. Add parent categories and optional subcategories only when
                  they help you review spending faster.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <BackButton fallbackHref="/dashboard" className="bg-white/95 shadow-sm" />
                <Link
                  href="/dashboard"
                  className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 cursor-pointer"
                >
                  Close
                </Link>
              </div>
            </div>
          </section>

          <section className="max-h-[calc(100vh-12rem)] overflow-y-auto px-6 py-6">
            {error && (
              <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="ml-3 text-red-400 hover:text-red-600 cursor-pointer"
                >
                  Close
                </button>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Categories
                </p>
                <p className="mt-2 text-2xl font-bold text-blue-950">{rootCategories.length}</p>
              </div>
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                  Subcategories
                </p>
                <p className="mt-2 text-2xl font-bold text-indigo-950">{subcategoryCount}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Total labels
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{categories.length}</p>
              </div>
            </div>

            <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Add category</h2>
                <p className="text-sm text-gray-500">
                  Create a top-level category for expenses or income.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="text"
                  placeholder="Category name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreate(null);
                  }}
                  className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <ColorPicker value={newColor} onChange={setNewColor} />
                <button
                  type="button"
                  onClick={() => void handleCreate(null)}
                  disabled={isCreating}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  {isCreating ? 'Adding...' : 'Add Category'}
                </button>
              </div>
            </section>

            <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Your categories</h2>
                  <p className="text-sm text-gray-500">
                    Edit names, colors, and subcategories inline.
                  </p>
                </div>
              </div>

              {rootCategories.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 px-6 py-10 text-center">
                  <p className="font-semibold text-blue-900">No categories yet</p>
                  <p className="mt-1 text-sm text-blue-700">Add your first category above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {rootCategories.map((parent) => {
                    const subcats = categories.filter((c) => c.parent_id === parent.id);
                    const isEditing = editingId === parent.id;
                    const isAddingSub = addingSubFor === parent.id;
                    const childCount = subcats.length;

                    return (
                      <div
                        key={parent.id}
                        className="overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-slate-50"
                      >
                        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                          {isEditing ? (
                            <>
                              <ColorPicker value={editColor} onChange={setEditColor} />
                              <input
                                autoFocus
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') void handleUpdate(parent.id);
                                  if (e.key === 'Escape') setEditingId(null);
                                }}
                                className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              <button
                                type="button"
                                onClick={() => void handleUpdate(parent.id)}
                                className="rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <span
                                  className="h-4 w-4 flex-shrink-0 rounded-full shadow-sm"
                                  style={{ backgroundColor: parent.color }}
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-gray-900">
                                    {parent.name}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {childCount} subcategor{childCount === 1 ? 'y' : 'ies'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddingSubFor(isAddingSub ? null : parent.id);
                                    setSubName('');
                                    setSubColor('#22c55e');
                                    setEditingId(null);
                                    setError(null);
                                  }}
                                  className="rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 cursor-pointer"
                                >
                                  {isAddingSub ? 'Hide Sub Form' : 'Add Sub'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startEdit(parent)}
                                  className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteConfirm({ id: parent.id, name: parent.name })
                                  }
                                  className="rounded-xl bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 cursor-pointer"
                                >
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        {isAddingSub && (
                          <div className="flex flex-col gap-3 border-t border-blue-100 bg-blue-50/70 px-4 py-3 sm:flex-row sm:items-center">
                            <input
                              type="text"
                              autoFocus
                              placeholder="Subcategory name"
                              value={subName}
                              onChange={(e) => setSubName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleCreate(parent.id);
                                if (e.key === 'Escape') setAddingSubFor(null);
                              }}
                              className="min-w-0 flex-1 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <ColorPicker value={subColor} onChange={setSubColor} />
                            <button
                              type="button"
                              onClick={() => void handleCreate(parent.id)}
                              disabled={isCreatingSub}
                              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                            >
                              {isCreatingSub ? 'Adding...' : 'Add Subcategory'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setAddingSubFor(null)}
                              className="rounded-xl px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-white/80 hover:text-gray-700 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}

                        {subcats.length > 0 && (
                          <div className="space-y-2 border-t border-gray-100 bg-white/60 px-4 py-3">
                            {subcats.map((sub) => {
                              const isEditingSub = editingId === sub.id;
                              return (
                                <div
                                  key={sub.id}
                                  className="flex flex-col gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm sm:flex-row sm:items-center"
                                >
                                  {isEditingSub ? (
                                    <>
                                      <ColorPicker value={editColor} onChange={setEditColor} />
                                      <input
                                        autoFocus
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') void handleUpdate(sub.id);
                                          if (e.key === 'Escape') setEditingId(null);
                                        }}
                                        className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => void handleUpdate(sub.id)}
                                        className="rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 cursor-pointer"
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingId(null)}
                                        className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200 cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <div className="flex min-w-0 flex-1 items-center gap-3">
                                        <span className="h-px w-4 bg-gray-300" />
                                        <span
                                          className="h-3 w-3 flex-shrink-0 rounded-full"
                                          style={{ backgroundColor: sub.color }}
                                        />
                                        <span className="truncate text-sm text-gray-700">
                                          {sub.name}
                                        </span>
                                      </div>
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          onClick={() => startEdit(sub)}
                                          className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setDeleteConfirm({ id: sub.id, name: sub.name })
                                          }
                                          className="rounded-xl bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 cursor-pointer"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </section>
        </main>
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm &&
        (() => {
          const childCount = categories.filter((c) => c.parent_id === deleteConfirm.id).length;
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm"
              onClick={(e) => {
                if (e.target === e.currentTarget) setDeleteConfirm(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setDeleteConfirm(null);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-dialog-title"
                className="w-full max-w-sm rounded-3xl border border-white/20 bg-white p-6 shadow-2xl"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                  Delete
                </div>
                <h3 id="delete-dialog-title" className="mb-2 text-lg font-bold text-gray-900">
                  Delete &quot;{deleteConfirm.name}&quot;?
                </h3>
                {childCount > 0 ? (
                  <p className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    This will also delete {childCount} subcategor{childCount === 1 ? 'y' : 'ies'}{' '}
                    and clear the category from any associated transactions.
                  </p>
                ) : (
                  <p className="mb-5 text-sm text-gray-500">This action cannot be undone.</p>
                )}
                <div className="flex gap-2 justify-end">
                  <button
                    autoFocus
                    onClick={() => setDeleteConfirm(null)}
                    className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
