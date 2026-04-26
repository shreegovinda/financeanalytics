'use client';

import { useEffect, useState } from 'react';
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

export default function SettingsPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#3b82f6');
  const [newCategoryParentId, setNewCategoryParentId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
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

  const handleCreateCategory = async () => {
    const trimmedName = newCategoryName.trim();

    if (!trimmedName) {
      setError('Category name is required');
      return;
    }

    if (trimmedName.length > 100) {
      setError('Category name must be 100 characters or less');
      return;
    }

    const conflict = categories.some(
      (c) =>
        c.name.toLowerCase() === trimmedName.toLowerCase() &&
        (c.parent_id ?? null) === (newCategoryParentId ?? null),
    );
    if (conflict) {
      setError('A category with this name already exists at this level');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const newCategory = await apiPost<Category>(
        'http://localhost:3001/api/categories',
        {
          name: newCategoryName,
          color: newCategoryColor,
          parent_id: newCategoryParentId,
        },
        token ?? undefined,
      );
      setCategories([...categories, newCategory]);
      setNewCategoryName('');
      setNewCategoryColor('#3b82f6');
      setNewCategoryParentId(null);
    } catch (err) {
      console.error('Error creating category:', getErrorMessage(err));
      setError('Failed to create category');
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateCategory = async (id: string) => {
    const trimmedName = editName.trim();

    if (!trimmedName) {
      setError('Category name is required');
      return;
    }

    if (trimmedName.length > 100) {
      setError('Category name must be 100 characters or less');
      return;
    }

    const currentCategory = categories.find((c) => c.id === id);
    if (
      currentCategory?.name !== trimmedName &&
      categories.some(
        (c) =>
          c.id !== id &&
          c.name.toLowerCase() === trimmedName.toLowerCase() &&
          (c.parent_id ?? null) === (currentCategory?.parent_id ?? null),
      )
    ) {
      setError('A category with this name already exists at this level');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const updated = await apiPut<Category>(
        `http://localhost:3001/api/categories/${id}`,
        {
          name: editName,
          color: editColor,
        },
        token ?? undefined,
      );
      setCategories(categories.map((c) => (c.id === id ? updated : c)));
      setEditingId(null);
      setError(null);
    } catch (err) {
      console.error('Error updating category:', getErrorMessage(err));
      setError('Failed to update category');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    const category = categories.find((c) => c.id === id);
    if (category) {
      setDeleteConfirm({ id, name: category.name });
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;

    try {
      const token = localStorage.getItem('token');
      await apiDelete(`http://localhost:3001/api/categories/${deleteConfirm.id}`, token ?? undefined);
      // Also remove all descendants that were cascade-deleted server-side
      const deletedId = deleteConfirm.id;
      setCategories((prev) => {
        const removedIds = new Set<string>();
        removedIds.add(deletedId);
        // Collect all transitive children (handles arbitrary nesting depth)
        let changed = true;
        while (changed) {
          changed = false;
          for (const c of prev) {
            if (!removedIds.has(c.id) && c.parent_id != null && removedIds.has(c.parent_id)) {
              removedIds.add(c.id);
              changed = true;
            }
          }
        }
        return prev.filter((c) => !removedIds.has(c.id));
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
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-6 py-6">
            <div className="h-8 bg-slate-200 rounded w-32 animate-pulse" />
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-8">
          <div className="space-y-8">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 h-48 animate-pulse" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
            <p className="text-slate-600 text-sm mt-1">Manage your categories and preferences</p>
          </div>
          <Link href="/dashboard" className="inline-flex items-center gap-2 px-4 py-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-4 rounded-lg flex items-start gap-3 animate-in">
            <svg className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="font-medium">{error}</p>
          </div>
        )}

        <div className="grid gap-8">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-6">
              <h2 className="text-xl font-bold text-white">Add New Category</h2>
              <p className="text-blue-100 text-sm mt-1">Create a new category for your transactions</p>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Category Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Food, Transport"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 placeholder-slate-400 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Parent Category</label>
                  <select
                    value={newCategoryParentId || ''}
                    onChange={(e) => setNewCategoryParentId(e.target.value || null)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 transition-all bg-white"
                  >
                    <option value="">Top Level</option>
                    {categories
                      .filter((c) => !c.parent_id)
                      .map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newCategoryColor}
                      onChange={(e) => setNewCategoryColor(e.target.value)}
                      className="w-12 h-10 border border-slate-300 rounded-lg cursor-pointer hover:border-slate-400 transition"
                    />
                    <span className="text-xs text-slate-600 font-mono">{newCategoryColor}</span>
                  </div>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={handleCreateCategory}
                    disabled={isCreating}
                    className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {isCreating ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-slate-600 to-slate-700 px-6 py-6">
              <h2 className="text-xl font-bold text-white">Manage Categories</h2>
              <p className="text-slate-200 text-sm mt-1">Edit or delete your transaction categories</p>
            </div>

            <div className="p-6">
              {categories.filter((c) => !c.parent_id).length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-12 h-12 text-slate-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p className="text-slate-600">No categories yet. Create one to get started!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {categories
                    .filter((c) => !c.parent_id)
                    .map((parentCat) => {
                      const subcats = categories.filter((c) => c.parent_id === parentCat.id);
                      const isExpanded = expandedCategories.has(parentCat.id);

                      return (
                        <div key={parentCat.id}>
                          <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all group">
                            {editingId === parentCat.id ? (
                              <div className="flex-1 flex items-center gap-3">
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                />
                                <input
                                  type="color"
                                  value={editColor}
                                  onChange={(e) => setEditColor(e.target.value)}
                                  className="w-10 h-10 border border-slate-300 rounded-lg cursor-pointer"
                                />
                                <button
                                  onClick={() => handleUpdateCategory(parentCat.id)}
                                  className="px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition cursor-pointer"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="px-3 py-2 bg-slate-300 text-slate-700 text-sm rounded-lg hover:bg-slate-400 transition cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-3 flex-1">
                                  {subcats.length > 0 && (
                                    <button
                                      onClick={() => {
                                        const newExpanded = new Set(expandedCategories);
                                        if (isExpanded) {
                                          newExpanded.delete(parentCat.id);
                                        } else {
                                          newExpanded.add(parentCat.id);
                                        }
                                        setExpandedCategories(newExpanded);
                                      }}
                                      className="text-slate-400 hover:text-slate-600 w-5 flex items-center justify-center cursor-pointer transition-colors"
                                    >
                                      <svg className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                      </svg>
                                    </button>
                                  )}
                                  {!subcats.length && <div className="w-5" />}
                                  <div
                                    className="w-5 h-5 rounded-md flex-shrink-0"
                                    style={{ backgroundColor: parentCat.color }}
                                  />
                                  <span className="font-medium text-slate-900">{parentCat.name}</span>
                                  {subcats.length > 0 && (
                                    <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">{subcats.length} sub</span>
                                  )}
                                </div>

                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => startEdit(parentCat)}
                                    className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                                    title="Edit"
                                  >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCategory(parentCat.id)}
                                    className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                    title="Delete"
                                  >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>

                          {isExpanded && subcats.length > 0 && (
                            <div className="ml-4 mt-2 space-y-2 border-l-2 border-slate-200 pl-4">
                              {subcats.map((subcat) => (
                                <div key={subcat.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors group">
                                  {editingId === subcat.id ? (
                                    <div className="flex-1 flex items-center gap-3">
                                      <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                      />
                                      <input
                                        type="color"
                                        value={editColor}
                                        onChange={(e) => setEditColor(e.target.value)}
                                        className="w-10 h-10 border border-slate-300 rounded-lg cursor-pointer"
                                      />
                                      <button
                                        onClick={() => handleUpdateCategory(subcat.id)}
                                        className="px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition cursor-pointer"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={() => setEditingId(null)}
                                        className="px-3 py-2 bg-slate-300 text-slate-700 text-sm rounded-lg hover:bg-slate-400 transition cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex items-center gap-3">
                                        <div className="w-5" />
                                        <div
                                          className="w-4 h-4 rounded flex-shrink-0"
                                          style={{ backgroundColor: subcat.color }}
                                        />
                                        <span className="text-slate-700">{subcat.name}</span>
                                      </div>

                                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                          onClick={() => startEdit(subcat)}
                                          className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                                          title="Edit"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                          </svg>
                                        </button>
                                        <button
                                          onClick={() => handleDeleteCategory(subcat.id)}
                                          className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                          title="Delete"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

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
              className="bg-white rounded-xl shadow-2xl p-6 max-w-sm mx-4"
            >
              <h3 id="delete-dialog-title" className="text-lg font-semibold text-slate-900 mb-2">Delete Category</h3>
              <p className="text-slate-600 mb-3">
                Are you sure you want to delete <span className="font-medium">&quot;{deleteConfirm.name}&quot;</span>? This action cannot be undone.
              </p>
              {childCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-800">
                  <strong>Warning:</strong> This will also permanently delete {childCount} subcategor{childCount === 1 ? 'y' : 'ies'} and clear the category from any associated transactions.
                </div>
              )}
              <div className="flex gap-3 justify-end">
                <button
                  autoFocus
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 transition cursor-pointer"
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
