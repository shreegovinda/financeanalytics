'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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

function StyledSelect({
  value,
  onChange,
  children,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none pl-3 pr-8 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 cursor-pointer hover:border-gray-300 transition-colors"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}

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

    if (!name) { setError('Name is required'); return; }

    const conflict = categories.some(
      (c) => c.name.toLowerCase() === name.toLowerCase() && (c.parent_id ?? null) === parentId,
    );
    if (conflict) { setError('A category with this name already exists at this level'); return; }

    setError(null);
    if (parentId) setIsCreatingSub(true); else setIsCreating(true);

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
      if (parentId) setIsCreatingSub(false); else setIsCreating(false);
    }
  };

  const handleUpdate = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) { setError('Name is required'); return; }

    const current = categories.find((c) => c.id === id);
    const conflict = current?.name !== trimmed && categories.some(
      (c) => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase() && (c.parent_id ?? null) === (current?.parent_id ?? null),
    );
    if (conflict) { setError('A category with this name already exists at this level'); return; }

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
      await apiDelete(`http://localhost:3001/api/categories/${deleteConfirm.id}`, token ?? undefined);
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Categories</h1>
          <Link
            href="/dashboard"
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 cursor-pointer ml-3">✕</button>
          </div>
        )}

        {/* Add Category */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">New Category</p>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Category name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(null); }}
              className="flex-1 px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 bg-white transition-colors hover:border-gray-300"
            />
            <ColorPicker value={newColor} onChange={setNewColor} />
            <button
              onClick={() => void handleCreate(null)}
              disabled={isCreating}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition-colors shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              {isCreating ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>

        {/* Category List */}
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {rootCategories.length === 0 ? (
            <div className="px-4 py-10 text-center text-gray-400 text-sm">
              No categories yet. Add one above.
            </div>
          ) : (
            rootCategories.map((parent) => {
              const subcats = categories.filter((c) => c.parent_id === parent.id);
              const isEditing = editingId === parent.id;
              const isAddingSub = addingSubFor === parent.id;
              const childCount = subcats.length;

              return (
                <div key={parent.id}>
                  {/* Parent row */}
                  <div className="flex items-center gap-3 px-4 py-3">
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
                          className="flex-1 px-3 py-1.5 text-sm text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                        <button
                          onClick={() => void handleUpdate(parent.id)}
                          className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <div
                          className="w-4 h-4 rounded-full flex-shrink-0"
                          style={{ backgroundColor: parent.color }}
                        />
                        <span className="flex-1 text-sm font-medium text-gray-800">{parent.name}</span>
                        {childCount > 0 && (
                          <span className="text-xs text-gray-400 mr-1">{childCount} sub</span>
                        )}
                        <button
                          onClick={() => {
                            setAddingSubFor(isAddingSub ? null : parent.id);
            setSubName('');
            setSubColor('#22c55e');
            setEditingId(null);
                            setError(null);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded-md cursor-pointer transition-colors"
                          title="Add subcategory"
                        >
                          + Sub
                        </button>
                        <button
                          onClick={() => startEdit(parent)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer transition-colors"
                          title="Edit"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828 9 16l.172-2.828z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ id: parent.id, name: parent.name })}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md cursor-pointer transition-colors"
                          title="Delete"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>

                  {/* Inline add subcategory form */}
                  {isAddingSub && (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border-t border-blue-100">
                      <div className="w-px h-5 bg-blue-200 ml-2 mr-1 flex-shrink-0" />
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
                        className="flex-1 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                      <ColorPicker value={subColor} onChange={setSubColor} />
                      <button
                        onClick={() => void handleCreate(parent.id)}
                        disabled={isCreatingSub}
                        className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                      >
                        {isCreatingSub ? '…' : 'Add'}
                      </button>
                      <button
                        onClick={() => setAddingSubFor(null)}
                        className="text-xs px-2 py-1.5 text-gray-500 hover:text-gray-700 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Subcategory rows */}
                  {subcats.map((sub) => {
                    const isEditingSub = editingId === sub.id;
                    return (
                      <div key={sub.id} className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border-t border-gray-100">
                        <div className="w-px h-4 bg-gray-300 ml-2 flex-shrink-0" />
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
                              className="flex-1 px-3 py-1.5 text-sm text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            />
                            <button
                              onClick={() => void handleUpdate(sub.id)}
                              className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: sub.color }}
                            />
                            <span className="flex-1 text-sm text-gray-600">{sub.name}</span>
                            <button
                              onClick={() => startEdit(sub)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer transition-colors"
                              title="Edit"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828 9 16l.172-2.828z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setDeleteConfirm({ id: sub.id, name: sub.name })}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md cursor-pointer transition-colors"
                              title="Delete"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Delete confirmation modal */}
      {deleteConfirm && (() => {
        const childCount = categories.filter((c) => c.parent_id === deleteConfirm.id).length;
        return (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={(e) => { if (e.target === e.currentTarget) setDeleteConfirm(null); }}
            onKeyDown={(e) => { if (e.key === 'Escape') setDeleteConfirm(null); }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-dialog-title"
              className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4"
            >
              <h3 id="delete-dialog-title" className="text-base font-semibold text-gray-900 mb-2">
                Delete &quot;{deleteConfirm.name}&quot;?
              </h3>
              {childCount > 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                  This will also delete {childCount} subcategor{childCount === 1 ? 'y' : 'ies'} and clear the category from any associated transactions.
                </p>
              ) : (
                <p className="text-sm text-gray-500 mb-4">This action cannot be undone.</p>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  autoFocus
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 cursor-pointer"
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
