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
}

export default function SettingsPage(): JSX.Element {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#3b82f6');
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      void router.push('/login');
      return;
    }

    fetchCategories(token);
  }, [router]);

  const fetchCategories = async (token: string) => {
    try {
      const data = await apiGet<Category[]>('http://localhost:3001/api/categories', token);
      setCategories(data);
      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching categories:', getErrorMessage(err));
      setError('Failed to load categories');
      setIsLoading(false);
    }
  };

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

    if (categories.some((c) => c.name.toLowerCase() === trimmedName.toLowerCase())) {
      setError('A category with this name already exists');
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
        },
        token,
      );
      setCategories([...categories, newCategory]);
      setNewCategoryName('');
      setNewCategoryColor('#3b82f6');
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
    if (currentCategory?.name !== trimmedName && categories.some((c) => c.name.toLowerCase() === trimmedName.toLowerCase())) {
      setError('A category with this name already exists');
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
        token,
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
    if (!confirm('Are you sure you want to delete this category?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await apiDelete(`http://localhost:3001/api/categories/${id}`, token);
      setCategories(categories.filter((c) => c.id !== id));
      setError(null);
    } catch (err) {
      console.error('Error deleting category:', getErrorMessage(err));
      setError('Failed to delete category');
    }
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="h-8 bg-gray-200 rounded w-32 animate-pulse" />
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="space-y-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="h-6 bg-gray-200 rounded w-48 mb-6 animate-pulse" />
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 bg-gray-200 rounded animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
          <Link href="/dashboard" className="text-blue-600 hover:text-blue-800">
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-50 border-l-4 border-red-600 text-red-700 px-4 py-4 rounded-lg mb-6 flex items-start gap-3">
            <svg className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <p className="font-medium">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Create New Category</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <input
              type="text"
              placeholder="Category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="flex items-center gap-2">
              <input
                type="color"
                value={newCategoryColor}
                onChange={(e) => setNewCategoryColor(e.target.value)}
                className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
              />
              <span className="text-sm text-gray-600">{newCategoryColor}</span>
            </div>

            <button
              onClick={handleCreateCategory}
              disabled={isCreating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {isCreating ? 'Creating...' : 'Create Category'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Categories</h2>

          <div className="space-y-3">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                {editingId === cat.id ? (
                  <div className="flex-1 flex items-center gap-4">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                    />
                    <button
                      onClick={() => handleUpdateCategory(cat.id)}
                      className="px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-2 bg-gray-400 text-white text-sm rounded hover:bg-gray-500 transition"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-6 h-6 rounded"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-medium text-gray-800">{cat.name}</span>
                      {cat.is_default && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                          Default
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {!cat.is_default && (
                        <>
                          <button
                            onClick={() => startEdit(cat)}
                            className="px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 transition"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
