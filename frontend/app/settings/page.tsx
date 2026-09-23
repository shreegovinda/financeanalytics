'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthSessionGuard from '@/components/AuthSessionGuard';
import BankSettings from '@/components/BankSettings';
import BackButton from '@/components/BackButton';
import PhoneInput from '@/components/PhoneInput';
import { useToast } from '@/components/Toast';
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  getErrorMessage,
  userAPI,
  aiAPI,
  exportAPI,
  accountAPI,
  UserProfile,
  AICatalogueResponse,
  CostTransparency,
} from '@/lib/api';
import {
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
  SUPPORTED_TIMEZONES,
  SUPPORTED_DATE_FORMATS,
  SUPPORTED_TIME_FORMATS,
  formatCurrency,
  formatCustomDate,
  formatCustomDateTime,
} from '@/lib/formatters';
import { notifyPreferencesChanged, useUserPreferences } from '@/lib/date';
import { useTranslation, SUPPORTED_LANGUAGES } from '@/lib/translations';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

type SettingsTab = 'profile' | 'preferences' | 'ai' | 'banks' | 'categories' | 'data' | 'activity';

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('tab');
      if (
        p === 'profile' ||
        p === 'preferences' ||
        p === 'ai' ||
        p === 'banks' ||
        p === 'categories' ||
        p === 'data' ||
        p === 'activity'
      ) {
        return p;
      }
    }
    return 'profile';
  });

  const { addToast } = useToast();

  // Categories state
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [isCreating, setIsCreating] = useState(false);

  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [subName, setSubName] = useState('');
  const [subColor, setSubColor] = useState('#22c55e');
  const [isCreatingSub, setIsCreatingSub] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  // User Profile & Password state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [preferencesSaved, setPreferencesSaved] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);

  // Password rotation state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Cost Transparency & Platform Footprint state
  const [costTransparency, setCostTransparency] = useState<CostTransparency | null>(null);
  const [isLoadingCost, setIsLoadingCost] = useState(false);

  const { t } = useTranslation();
  const { ratesUpdated, refreshRates } = useUserPreferences();
  const [isRefreshingRates, setIsRefreshingRates] = useState(false);

  // Regional & International Preferences state
  const [currency, setCurrency] = useState('INR');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [locale, setLocale] = useState('en-IN');
  const [language, setLanguage] = useState('en');
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
  const [timeFormat, setTimeFormat] = useState('12h');
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);

  // AI & BYOK state (Step 7 & 8)
  const [aiCatalogue, setAiCatalogue] = useState<AICatalogueResponse | null>(null);
  const [selectedProvider, setSelectedProvider] = useState('gemini');
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
  const [keyMode, setKeyMode] = useState<'admin' | 'personal'>('admin');
  const [personalApiKeyInput, setPersonalApiKeyInput] = useState('');
  const [isSavingAi, setIsSavingAi] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);

  // Data Export state (Step 9)
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Account Closure state (Step 10)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  async function loadData(token: string) {
    try {
      const [cats, prof, aiCat, costRes] = await Promise.all([
        apiGet<Category[]>(`${API_BASE_URL}/api/categories`, token).catch(() => []),
        userAPI.getProfile(token).catch(() => null),
        aiAPI.getCatalogue(token).catch(() => null),
        accountAPI.getCostTransparency(token).catch(() => null),
      ]);

      setCategories(cats);
      if (prof?.user) {
        setProfile(prof.user);
        setName(prof.user.name || '');
        setEmail(prof.user.email || '');
        setPhone(prof.user.phone || '');
        setCurrency(prof.user.currency || 'INR');
        setTimezone(prof.user.timezone || 'Asia/Kolkata');
        setLocale(prof.user.locale || 'en-IN');
        setLanguage(prof.user.language || 'en');
        setDateFormat(prof.user.date_format || 'DD/MM/YYYY');
        setTimeFormat(prof.user.time_format || '12h');
      }

      if (aiCat) {
        setAiCatalogue(aiCat);
        setSelectedProvider(aiCat.currentPreferences.provider || 'gemini');
        setSelectedModel(aiCat.currentPreferences.model || 'gemini-2.5-flash');
        setKeyMode(aiCat.currentPreferences.keyMode || 'admin');
      }

      if (costRes?.transparency) {
        setCostTransparency(costRes.transparency);
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Error loading settings:', getErrorMessage(err));
      setError('Failed to load settings data');
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const handlePopState = () => {
      const p = new URLSearchParams(window.location.search).get('tab');
      if (
        p === 'profile' ||
        p === 'preferences' ||
        p === 'ai' ||
        p === 'banks' ||
        p === 'categories' ||
        p === 'data'
      ) {
        setActiveTab(p);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      void router.push('/auth');
      return;
    }
    void Promise.resolve().then(() => loadData(token));
  }, [router]);

  // Categories handlers
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
        `${API_BASE_URL}/api/categories`,
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
        `${API_BASE_URL}/api/categories/${id}`,
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
      await apiDelete(`${API_BASE_URL}/api/categories/${deleteConfirm.id}`, token ?? undefined);
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

  // User Profile personal details save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) return;

    if (!name.trim()) {
      setError('Name cannot be empty.');
      addToast('error', 'Name cannot be empty.');
      return;
    }
    if (phone.trim() && !/^\+[1-9]\d{7,14}$/.test(phone.trim())) {
      setError('A valid mobile number with country code is required.');
      addToast('error', 'A valid mobile number with country code is required.');
      return;
    }

    setIsSavingProfile(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await userAPI.updateProfile(
        {
          name: name.trim(),
          phone: phone.trim() || undefined,
        },
        token,
      );
      if (res.token) {
        localStorage.setItem('token', res.token);
      }
      setProfile(res.user);
      setName(res.user.name || '');
      setEmail(res.user.email || '');
      setPhone(res.user.phone || '');
      try {
        const stored = localStorage.getItem('user');
        const parsed = stored ? JSON.parse(stored) : {};
        localStorage.setItem('user', JSON.stringify({ ...parsed, ...res.user }));
        notifyPreferencesChanged();
      } catch {
        // ignore
      }
      setSuccessMessage('Profile details updated successfully.');
      addToast('success', 'Profile details updated successfully.');
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3500);
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      addToast('error', msg);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Password rotation save
  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) return;

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      addToast('error', 'New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.');
      addToast('error', 'New passwords do not match.');
      return;
    }

    setIsSavingPassword(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await apiPut<{ success: boolean; token: string }>(
        `${API_BASE_URL}/api/auth/password`,
        { currentPassword, newPassword },
        token,
      );
      localStorage.setItem('token', res.token);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setShowPasswordForm(false);
      setSuccessMessage('Password updated successfully.');
      addToast('success', 'Password updated successfully.');
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      addToast('error', msg);
    } finally {
      setIsSavingPassword(false);
    }
  };

  // Regional & Format preferences save
  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) return;

    setError(null);
    setSuccessMessage(null);
    setIsSavingPreferences(true);

    try {
      const res = await userAPI.updateProfile(
        {
          currency,
          timezone,
          locale,
          language,
          date_format: dateFormat,
          time_format: timeFormat,
        },
        token,
      );
      setProfile(res.user);
      try {
        const stored = localStorage.getItem('user');
        const parsed = stored ? JSON.parse(stored) : {};
        localStorage.setItem('user', JSON.stringify({ ...parsed, ...res.user }));
        notifyPreferencesChanged();
      } catch {
        // ignore
      }
      setSuccessMessage('Regional & format preferences saved successfully.');
      addToast('success', 'Regional and display preferences updated successfully.');
      setPreferencesSaved(true);
      setTimeout(() => setPreferencesSaved(false), 3500);
      void accountAPI
        .getCostTransparency(token)
        .then((r) => {
          if (r?.transparency) setCostTransparency(r.transparency);
        })
        .catch(() => {});
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      addToast('error', msg);
    } finally {
      setIsSavingPreferences(false);
    }
  };

  // AI preferences save
  const handleSaveAiPreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) return;

    setError(null);
    setSuccessMessage(null);
    setIsSavingAi(true);

    try {
      await aiAPI.updatePreferences(
        { provider: selectedProvider, model: selectedModel, keyMode },
        token,
      );
      setSuccessMessage('AI model and provider preferences saved.');
      addToast('success', 'AI provider and model settings saved successfully.');
      setAiSaved(true);
      setTimeout(() => setAiSaved(false), 3500);
      void accountAPI
        .getCostTransparency(token)
        .then((r) => {
          if (r?.transparency) setCostTransparency(r.transparency);
        })
        .catch(() => {});
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      addToast('error', msg);
    } finally {
      setIsSavingAi(false);
    }
  };

  // Personal AI key save
  const handleSavePersonalKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) return;
    if (!personalApiKeyInput.trim()) {
      setError('Please enter your API key.');
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSavingKey(true);

    try {
      await aiAPI.saveKey(selectedProvider, personalApiKeyInput.trim(), token);
      try {
        await aiAPI.updatePreferences(
          { provider: selectedProvider, model: selectedModel, keyMode: 'personal' },
          token,
        );
      } catch {
        // Preferences auto-switched by backend
      }
      setKeyMode('personal');
      setPersonalApiKeyInput('');
      const updatedCat = await aiAPI.getCatalogue(token);
      setAiCatalogue(updatedCat);
      setSuccessMessage(`Encrypted personal key for ${selectedProvider} saved and activated.`);
      void accountAPI
        .getCostTransparency(token)
        .then((r) => {
          if (r?.transparency) setCostTransparency(r.transparency);
        })
        .catch(() => {});
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSavingKey(false);
    }
  };

  // Personal AI key delete
  const handleDeletePersonalKey = async (providerId: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;

    setError(null);
    setSuccessMessage(null);

    try {
      await aiAPI.deleteKey(providerId, token);
      const updatedCat = await aiAPI.getCatalogue(token);
      setAiCatalogue(updatedCat);
      if (keyMode === 'personal' && selectedProvider === providerId) {
        setKeyMode('admin');
      }
      setSuccessMessage(`Personal key for ${providerId} removed.`);
      void accountAPI
        .getCostTransparency(token)
        .then((r) => {
          if (r?.transparency) setCostTransparency(r.transparency);
        })
        .catch(() => {});
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  // Data Export handlers
  const handleExportJson = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setIsExportingJson(true);
    setError(null);
    try {
      await exportAPI.downloadJson(token);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsExportingJson(false);
    }
  };

  const handleExportPdf = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setIsExportingPdf(true);
    setError(null);
    try {
      await exportAPI.downloadPdf(token);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Account Closure handler
  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) return;

    setError(null);
    setIsDeletingAccount(true);

    try {
      await accountAPI.deleteAccount(
        { password: deletePassword, confirmPhrase: deleteConfirmText },
        token,
      );
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/auth?closed=true';
    } catch (err) {
      setError(getErrorMessage(err));
      setIsDeletingAccount(false);
    }
  };

  const rootCategories = categories.filter((c) => !c.parent_id);
  const subcategoryCount = categories.length - rootCategories.length;
  const currentProviderConfig = aiCatalogue?.catalogue.providers.find(
    (p) => p.id === selectedProvider,
  );

  const isProfileDirty = Boolean(
    profile &&
    (name.trim() !== (profile.name || '').trim() || phone.trim() !== (profile.phone || '').trim()),
  );

  const isPreferencesDirty = Boolean(
    profile &&
    (currency !== (profile.currency || 'INR') ||
      timezone !== (profile.timezone || 'Asia/Kolkata') ||
      locale !== (profile.locale || 'en-IN') ||
      language !== (profile.language || 'en') ||
      dateFormat !== (profile.date_format || 'DD/MM/YYYY') ||
      timeFormat !== (profile.time_format || '12h')),
  );

  const isAiDirty = Boolean(
    aiCatalogue &&
    (selectedProvider !== (aiCatalogue.currentPreferences.provider || 'gemini') ||
      selectedModel !== (aiCatalogue.currentPreferences.model || 'gemini-2.5-flash') ||
      keyMode !== (aiCatalogue.currentPreferences.keyMode || 'admin')),
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/70 pb-20">
      <AuthSessionGuard />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header Hero Card */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 p-6 sm:p-8 text-white shadow-lg">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_32%)]" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-200">
                Account & Platform Settings
              </p>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
                Settings & Preferences
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-blue-100">
                Manage personal details, regional formatting, AI models & keys, bank accounts,
                categories, and data privacy.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {profile?.role === 'admin' && (
                <Link
                  href="/admin"
                  className="rounded-xl bg-white/20 px-3.5 py-2 text-xs text-white hover:bg-white/30 font-semibold cursor-pointer backdrop-blur-md transition shadow-xs"
                >
                  Admin Dashboard
                </Link>
              )}
              <BackButton variant="dark" fallbackHref="/dashboard" label="Back to Dashboard" />
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="relative z-10 mt-8 flex flex-wrap gap-2 rounded-2xl bg-black/25 p-2 backdrop-blur-md border border-white/15 shadow-inner">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`relative z-10 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer ${
                activeTab === 'profile'
                  ? 'bg-white text-blue-950 shadow-md font-bold scale-[1.02]'
                  : 'text-blue-100 hover:text-white hover:bg-white/15'
              }`}
            >
              <span>👤</span>
              <span>{t('profileTabName', 'Profile & Account')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preferences')}
              className={`relative z-10 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer ${
                activeTab === 'preferences'
                  ? 'bg-white text-blue-950 shadow-md font-bold scale-[1.02]'
                  : 'text-blue-100 hover:text-white hover:bg-white/15'
              }`}
            >
              <span>🌐</span>
              <span>{t('regionalTabName', 'Regional & Formats')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ai')}
              className={`relative z-10 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer ${
                activeTab === 'ai'
                  ? 'bg-white text-blue-950 shadow-md font-bold scale-[1.02]'
                  : 'text-blue-100 hover:text-white hover:bg-white/15'
              }`}
            >
              <span>🤖</span>
              <span>{t('aiTabName', 'AI Models & Keys')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('banks')}
              className={`relative z-10 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer ${
                activeTab === 'banks'
                  ? 'bg-white text-blue-950 shadow-md font-bold scale-[1.02]'
                  : 'text-blue-100 hover:text-white hover:bg-white/15'
              }`}
            >
              <span>🏦</span>
              <span>{t('banksTabName', 'Bank Accounts')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              className={`relative z-10 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer ${
                activeTab === 'categories'
                  ? 'bg-white text-blue-950 shadow-md font-bold scale-[1.02]'
                  : 'text-blue-100 hover:text-white hover:bg-white/15'
              }`}
            >
              <span>🏷️</span>
              <span>{t('categoriesTabName', 'Categories')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('data')}
              className={`relative z-10 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer ${
                activeTab === 'data'
                  ? 'bg-white text-blue-950 shadow-md font-bold scale-[1.02]'
                  : 'text-blue-100 hover:text-white hover:bg-white/15'
              }`}
            >
              <span>🛡️</span>
              <span>{t('privacyTabName', 'Data & Privacy')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('activity')}
              className={`relative z-10 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer ${
                activeTab === 'activity'
                  ? 'bg-white text-blue-950 shadow-md font-bold scale-[1.02]'
                  : 'text-blue-100 hover:text-white hover:bg-white/15'
              }`}
            >
              <span>📋</span>
              <span>{t('logsTabName', 'Activity Logs')}</span>
            </button>
          </div>
        </section>

        {/* Main Content Area */}
        <main className="mt-8 space-y-6">
          {error && (
            <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="ml-3 text-red-400 hover:text-red-600 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              <span>{successMessage}</span>
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="ml-3 text-green-400 hover:text-green-600 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* TAB 1: PROFILE & ACCOUNT */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              {/* Personal Details Form */}
              <form
                onSubmit={handleSaveProfile}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Personal Details</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Update your name and primary contact number.
                    </p>
                  </div>
                  {profile?.role && (
                    <span className="rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-700">
                      {profile.role === 'admin' ? 'Administrator' : 'Standard User'}
                    </span>
                  )}
                </div>

                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={email}
                        readOnly
                        aria-readonly="true"
                        placeholder="name@example.com"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 pr-24 cursor-default"
                      />
                      {profile?.email_verified && email === profile?.email && (
                        <span className="absolute right-2.5 top-2.5 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          ✓ Verified
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      Primary email used for sign-in and account recovery. It cannot be changed from
                      profile settings.
                    </p>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1.5">
                      Mobile Number
                    </label>
                    <PhoneInput value={phone} onChange={setPhone} variant="light" />
                    <p className="mt-1.5 text-xs text-gray-400">
                      Select your country calling code and enter your mobile number. Used for
                      WhatsApp statement ingestion.
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  {profileSaved && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.5"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      Profile saved!
                    </span>
                  )}
                  <button
                    type="submit"
                    disabled={isSavingProfile || !isProfileDirty}
                    className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    {isSavingProfile
                      ? 'Saving Details...'
                      : isProfileDirty
                        ? 'Save Profile Details'
                        : 'No Changes to Save'}
                  </button>
                </div>
              </form>

              {/* Password & Security Card */}
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Security & Password</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Rotate your account password regularly to protect your financial data.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPasswordForm((prev) => !prev)}
                    className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
                  >
                    {showPasswordForm ? 'Hide Password Form' : 'Change Password'}
                  </button>
                </div>

                {showPasswordForm && (
                  <form
                    onSubmit={handlePasswordSave}
                    className="mt-5 space-y-4 rounded-2xl bg-slate-50 p-5"
                  >
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1.5">
                          Current Password
                        </label>
                        <input
                          type="password"
                          required
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1.5">
                          New Password
                        </label>
                        <input
                          type="password"
                          required
                          minLength={8}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1.5">
                          Confirm New Password
                        </label>
                        <input
                          type="password"
                          required
                          minLength={8}
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={
                          isSavingPassword ||
                          !currentPassword ||
                          !newPassword ||
                          !confirmNewPassword
                        }
                        className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer"
                      >
                        {isSavingPassword ? 'Updating Password...' : 'Update Password'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Cost Transparency & Resource Footprint Card */}
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-gray-900">
                        Cost Transparency & Resource Footprint
                      </h2>
                      <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                        Open Transparency
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      Committed to user information rights. See the exact itemized cloud compute,
                      encrypted vault storage, and AI processing Finlytix expends on your account.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const token = localStorage.getItem('token');
                      if (token) {
                        setIsLoadingCost(true);
                        accountAPI
                          .getCostTransparency(token)
                          .then((res) => {
                            if (res.transparency) setCostTransparency(res.transparency);
                          })
                          .catch(() => {})
                          .finally(() => setIsLoadingCost(false));
                      }
                    }}
                    disabled={isLoadingCost}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
                  >
                    <span>↻</span> {isLoadingCost ? 'Refreshing...' : 'Refresh Costs'}
                  </button>
                </div>

                {costTransparency ? (
                  <div className="mt-6 space-y-6">
                    {/* Metric Highlights */}
                    <div className="grid gap-4 sm:grid-cols-4">
                      <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/70 to-indigo-50/50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                          Total Cost-to-Serve
                        </p>
                        <p className="mt-1 text-2xl font-bold text-gray-900">
                          {formatCurrency(
                            costTransparency.costs.total_platform_cost,
                            costTransparency.currency,
                            locale,
                          )}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">Cumulative platform expense</p>
                      </div>

                      <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-teal-50/50 p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                            AI Intelligence
                          </p>
                          {costTransparency.is_byok && (
                            <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide">
                              BYOK $0
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-2xl font-bold text-gray-900">
                          {formatCurrency(
                            costTransparency.costs.total_ai_cost,
                            costTransparency.currency,
                            locale,
                          )}
                        </p>
                        <p className="mt-1 text-xs text-emerald-600 font-medium truncate">
                          {costTransparency.is_byok
                            ? 'Zero platform cost (Personal key)'
                            : `${costTransparency.ai_provider} (${costTransparency.ai_model})`}
                        </p>
                      </div>

                      <div className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50/70 to-fuchsia-50/50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-purple-700">
                          Encrypted Vault
                        </p>
                        <p className="mt-1 text-2xl font-bold text-gray-900">
                          {costTransparency.usage.storage_formatted}
                        </p>
                        <p className="mt-1 text-xs text-purple-600 font-medium">
                          {formatCurrency(
                            costTransparency.costs.storage_cost,
                            costTransparency.currency,
                            locale,
                          )}{' '}
                          storage cost
                        </p>
                      </div>

                      <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50/70 to-orange-50/50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                          Compute & Ledger DB
                        </p>
                        <p className="mt-1 text-2xl font-bold text-gray-900">
                          {formatCurrency(
                            costTransparency.costs.compute_cost,
                            costTransparency.currency,
                            locale,
                          )}
                        </p>
                        <p className="mt-1 text-xs text-amber-600 font-medium">
                          {costTransparency.usage.transactions_count} ledger records
                        </p>
                      </div>
                    </div>

                    {/* Itemized Breakdown Table */}
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                      <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                        <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
                          <tr>
                            <th className="px-4 py-3">Resource Component</th>
                            <th className="px-4 py-3">Units & Workload</th>
                            <th className="px-4 py-3 text-right">Incurred Cost</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          <tr>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">
                                AI Statement Extraction & Parsing
                              </div>
                              <div className="text-xs text-gray-500">
                                Multimodal document OCR and schema parsing via{' '}
                                {costTransparency.ai_provider}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">
                              {costTransparency.usage.statements_processed} statements processed
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900">
                              {formatCurrency(
                                costTransparency.costs.ai_parsing_cost,
                                costTransparency.currency,
                                locale,
                              )}
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">
                                AI Intelligent Categorization Engine
                              </div>
                              <div className="text-xs text-gray-500">
                                Automated merchant tagging, spend categorization & taxonomy
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">
                              {costTransparency.usage.transactions_count} ledger transactions
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900">
                              {formatCurrency(
                                costTransparency.costs.ai_categorization_cost,
                                costTransparency.currency,
                                locale,
                              )}
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">
                                Finlytix AI Copilot & Assistant
                              </div>
                              <div className="text-xs text-gray-500">
                                Financial queries, chat analysis & deep-dive questions
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">
                              {costTransparency.usage.chat_messages_count} messages answered
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900">
                              {formatCurrency(
                                costTransparency.costs.ai_chat_cost,
                                costTransparency.currency,
                                locale,
                              )}
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">
                                Encrypted Vault Storage
                              </div>
                              <div className="text-xs text-gray-500">
                                AES encrypted bank statement PDFs, spreadsheets & artifacts
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">
                              {costTransparency.usage.storage_formatted} (
                              {costTransparency.usage.statements_total} files)
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900">
                              {formatCurrency(
                                costTransparency.costs.storage_cost,
                                costTransparency.currency,
                                locale,
                              )}
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">
                                PostgreSQL Ledger & Compute Indexing
                              </div>
                              <div className="text-xs text-gray-500">
                                ACID transactional integrity, index maintenance, search & audit logs
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">
                              {costTransparency.usage.transactions_count +
                                costTransparency.usage.chat_messages_count}{' '}
                              operations
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900">
                              {formatCurrency(
                                costTransparency.costs.compute_cost,
                                costTransparency.currency,
                                locale,
                              )}
                            </td>
                          </tr>
                        </tbody>
                        <tfoot className="bg-gray-50 font-semibold text-gray-900">
                          <tr>
                            <td
                              colSpan={2}
                              className="px-4 py-3 text-right text-xs uppercase tracking-wider"
                            >
                              Total Incurred Platform Cost:
                            </td>
                            <td className="px-4 py-3 text-right text-base font-bold text-blue-600">
                              {formatCurrency(
                                costTransparency.costs.total_platform_cost,
                                costTransparency.currency,
                                locale,
                              )}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* BYOK & Transparency Disclosures */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-2">
                      <div className="flex items-center gap-2 font-semibold text-slate-900">
                        <span className="text-sm">🛡️</span>{' '}
                        {costTransparency.disclosures.transparency_commitment}
                      </div>
                      <p className="text-slate-600 leading-relaxed">
                        {costTransparency.disclosures.byok_notice}
                      </p>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1 border-t border-slate-200">
                        <span className="text-slate-500">
                          {costTransparency.disclosures.rates_notice}
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('ai')}
                          className="text-blue-600 hover:text-blue-700 font-semibold hover:underline cursor-pointer inline-flex items-center gap-1"
                        >
                          Configure AI & BYOK Keys →
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 flex items-center justify-center p-8 rounded-xl border border-dashed border-gray-200 text-sm text-gray-500">
                    Loading cost transparency metrics...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: CATEGORIES */}
          {activeTab === 'categories' && (
            <div>
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
                      if (e.key === 'Enter') void handleCreate();
                    }}
                    className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <div className="flex items-center gap-3">
                    <ColorPicker value={newColor} onChange={setNewColor} />
                    <button
                      type="button"
                      onClick={() => void handleCreate()}
                      disabled={isCreating}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                    >
                      {isCreating ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                </div>
              </section>

              <section className="mt-6">
                <h2 className="mb-3 text-lg font-semibold text-gray-900">Your categories</h2>
                {rootCategories.length === 0 ? (
                  <p className="text-sm text-gray-500">No categories created yet.</p>
                ) : (
                  <div className="space-y-3">
                    {rootCategories.map((cat) => {
                      const subs = categories.filter((c) => c.parent_id === cat.id);
                      const isEditingThis = editingId === cat.id;
                      return (
                        <div
                          key={cat.id}
                          className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-3">
                            {isEditingThis ? (
                              <div className="flex flex-1 items-center gap-2">
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1 text-sm focus:outline-none"
                                />
                                <ColorPicker value={editColor} onChange={setEditColor} />
                                <button
                                  type="button"
                                  onClick={() => void handleUpdate(cat.id)}
                                  className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="rounded-lg bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2.5">
                                  <span
                                    className="h-3.5 w-3.5 rounded-full"
                                    style={{ backgroundColor: cat.color }}
                                  />
                                  <span className="font-medium text-gray-900">{cat.name}</span>
                                  {subs.length > 0 && (
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                                      {subs.length}
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setAddingSubFor(addingSubFor === cat.id ? null : cat.id)
                                    }
                                    className="rounded-xl bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 cursor-pointer"
                                  >
                                    + Sub
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => startEdit(cat)}
                                    className="rounded-xl bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirm({ id: cat.id, name: cat.name })}
                                    className="rounded-xl bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Add subcategory inline */}
                          {addingSubFor === cat.id && (
                            <div className="mt-3 flex flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center">
                              <input
                                type="text"
                                placeholder={`Subcategory for ${cat.name}`}
                                value={subName}
                                onChange={(e) => setSubName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') void handleCreate(cat.id);
                                }}
                                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs focus:outline-none"
                              />
                              <div className="flex items-center gap-2">
                                <ColorPicker value={subColor} onChange={setSubColor} />
                                <button
                                  type="button"
                                  onClick={() => void handleCreate(cat.id)}
                                  disabled={isCreatingSub}
                                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                                >
                                  {isCreatingSub ? 'Adding...' : 'Add'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAddingSubFor(null)}
                                  className="rounded-lg bg-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-300 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Subcategories list */}
                          {subs.length > 0 && (
                            <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-2.5">
                              {subs.map((sub) => {
                                const isEditingSub = editingId === sub.id;
                                return (
                                  <div
                                    key={sub.id}
                                    className="flex items-center justify-between pl-4 py-1 text-xs"
                                  >
                                    {isEditingSub ? (
                                      <div className="flex flex-1 items-center gap-2">
                                        <input
                                          type="text"
                                          value={editName}
                                          onChange={(e) => setEditName(e.target.value)}
                                          className="flex-1 rounded border border-gray-300 px-2 py-1 focus:outline-none"
                                        />
                                        <ColorPicker value={editColor} onChange={setEditColor} />
                                        <button
                                          type="button"
                                          onClick={() => void handleUpdate(sub.id)}
                                          className="rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-700 cursor-pointer"
                                        >
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingId(null)}
                                          className="rounded bg-gray-100 px-2 py-1 text-gray-700 cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="flex items-center gap-2">
                                          <span className="h-px w-3 bg-gray-300" />
                                          <span
                                            className="h-2.5 w-2.5 rounded-full"
                                            style={{ backgroundColor: sub.color }}
                                          />
                                          <span className="text-gray-700">{sub.name}</span>
                                        </div>
                                        <div className="flex gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => startEdit(sub)}
                                            className="text-slate-500 hover:text-slate-800 cursor-pointer"
                                          >
                                            Edit
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setDeleteConfirm({ id: sub.id, name: sub.name })
                                            }
                                            className="text-red-500 hover:text-red-700 cursor-pointer"
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
            </div>
          )}

          {/* TAB 2: BANK ACCOUNTS */}
          {activeTab === 'banks' && <BankSettings />}

          {/* TAB: REGIONAL & FORMAT PREFERENCES */}
          {activeTab === 'preferences' && (
            <form onSubmit={handleSavePreferences} className="space-y-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-1 mb-5">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {t('regionalTabName', 'Regional & Display Formats')}
                  </h2>
                  <p className="text-sm text-gray-500">
                    Customize your interface language, display currency, timezone, date, and time
                    formatting.
                  </p>
                </div>

                {/* Live Rates Status Banner */}
                <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50/80 via-blue-50/60 to-emerald-50/50 p-4 sm:flex-row sm:items-center sm:justify-between shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm text-base">
                      ⚡
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                        {t('liveRatesActive', 'Live Internet Exchange Rates Active')}
                      </p>
                      <p className="text-xs text-indigo-700/80">
                        Live market rates synced from Open Exchange &amp; ECB (USD Pivot)
                        {ratesUpdated
                          ? ` • Last synced: ${new Date(ratesUpdated).toLocaleTimeString()}`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      setIsRefreshingRates(true);
                      await refreshRates();
                      setIsRefreshingRates(false);
                      addToast('success', 'Exchange rates updated from live internet source.');
                    }}
                    disabled={isRefreshingRates}
                    className="inline-flex items-center gap-1.5 self-start rounded-xl border border-indigo-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-indigo-700 shadow-2xs hover:bg-indigo-50 active:scale-95 transition cursor-pointer disabled:opacity-50 sm:self-center"
                  >
                    <span className={isRefreshingRates ? 'animate-spin' : ''}>🔄</span>
                    <span>{isRefreshingRates ? 'Syncing...' : 'Sync Live Rates'}</span>
                  </button>
                </div>

                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1.5">
                      {t('interfaceLanguage', 'Interface Language')}
                    </label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none bg-white"
                    >
                      {SUPPORTED_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label} ({l.nativeLabel})
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">
                      Changes the display language across the entire application in real time.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1.5">
                      {t('currencyLabel', 'Display Currency')}
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none bg-white"
                    >
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">
                      Default currency used for ledger totals, charts, and cash flow.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1.5">
                      {t('timezoneLabel', 'Timezone')}
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none bg-white"
                    >
                      {SUPPORTED_TIMEZONES.map((tz) => (
                        <option key={tz.code} value={tz.code}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">
                      Used to group transaction timestamps and month cutoffs.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1.5">
                      Number Locale &amp; Separators
                    </label>
                    <select
                      value={locale}
                      onChange={(e) => setLocale(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none bg-white"
                    >
                      {SUPPORTED_LOCALES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">
                      Determines comma formatting (e.g., 1,00,000 vs 100,000).
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1.5">
                      {t('dateFormatLabel', 'Date Format')}
                    </label>
                    <select
                      value={dateFormat}
                      onChange={(e) => setDateFormat(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none bg-white"
                    >
                      {SUPPORTED_DATE_FORMATS.map((df) => (
                        <option key={df.code} value={df.code}>
                          {df.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">
                      Applied across all transaction tables, statements, and calendar pickers.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1.5">
                      {t('timeFormatLabel', 'Time Format')}
                    </label>
                    <select
                      value={timeFormat}
                      onChange={(e) => setTimeFormat(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none bg-white"
                    >
                      {SUPPORTED_TIME_FORMATS.map((tf) => (
                        <option key={tf.code} value={tf.code}>
                          {tf.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">
                      Used for upload audit logs and report timestamps.
                    </p>
                  </div>
                </div>

                {/* Live Formatting Preview Card */}
                <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-800 mb-2">
                    ✨ Live Formatting Preview
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3 text-xs text-blue-950">
                    <div className="rounded-xl bg-white p-3 border border-blue-200">
                      <p className="text-gray-500 text-[11px]">Formatted Date</p>
                      <p className="text-sm font-bold text-gray-900 mt-0.5">
                        {formatCustomDate(new Date(), dateFormat)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-3 border border-blue-200">
                      <p className="text-gray-500 text-[11px]">Formatted Date &amp; Time</p>
                      <p className="text-sm font-bold text-gray-900 mt-0.5">
                        {formatCustomDateTime(new Date(), dateFormat, timeFormat, timezone)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-3 border border-blue-200">
                      <p className="text-gray-500 text-[11px]">Formatted Currency</p>
                      <p className="text-sm font-bold text-gray-900 mt-0.5">
                        {formatCurrency(125000.5, currency, locale)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  {preferencesSaved && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.5"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {t('savedSuccess', 'Preferences saved!')}
                    </span>
                  )}
                  <button
                    type="submit"
                    disabled={isSavingPreferences || !isPreferencesDirty}
                    className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    {isSavingPreferences
                      ? t('saving', 'Saving Preferences...')
                      : isPreferencesDirty
                        ? t('savePreferences', 'Save Preferences')
                        : t('savedSuccess', 'Preferences Saved')}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* TAB 4: AI & BYOK (Step 7 & 8) */}
          {activeTab === 'ai' && (
            <div className="space-y-6">
              <form
                onSubmit={handleSaveAiPreferences}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <h2 className="text-lg font-semibold text-gray-900">AI Model & Provider Choice</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Select which AI model processes your bank statements and answers chat queries.
                </p>

                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1.5">
                      Provider
                    </label>
                    <select
                      value={selectedProvider}
                      onChange={(e) => {
                        const prov = e.target.value;
                        setSelectedProvider(prov);
                        const provConf = aiCatalogue?.catalogue.providers.find(
                          (p) => p.id === prov,
                        );
                        const defModel =
                          provConf?.models.find((m) => m.isDefault)?.id || provConf?.models[0]?.id;
                        if (defModel) setSelectedModel(defModel);
                      }}
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      {aiCatalogue?.catalogue.providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1.5">
                      Model
                    </label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      {currentProviderConfig?.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label} {m.isDefault ? '(Default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Mode selection: Admin vs BYOK */}
                <div className="mt-6">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">
                    API Key Billing Mode
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-all ${
                        keyMode === 'admin'
                          ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="keyMode"
                        checked={keyMode === 'admin'}
                        onChange={() => setKeyMode('admin')}
                        className="mt-1 text-blue-600"
                      />
                      <div>
                        <p className="font-semibold text-gray-900">Platform Managed</p>
                        <p className="text-xs text-gray-500">
                          Included with your Finlytix account under standard fair usage limits.
                        </p>
                      </div>
                    </label>

                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-all ${
                        keyMode === 'personal'
                          ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="keyMode"
                        checked={keyMode === 'personal'}
                        onChange={() => setKeyMode('personal')}
                        className="mt-1 text-blue-600"
                      />
                      <div>
                        <p className="font-semibold text-gray-900">Personal API Key (BYOK)</p>
                        <p className="text-xs text-gray-500">
                          Direct billing to your AI provider account. Zero platform rate limits.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-3">
                  {aiSaved && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.5"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      Settings saved!
                    </span>
                  )}
                  <button
                    type="submit"
                    disabled={isSavingAi || !isAiDirty}
                    className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    {isSavingAi ? 'Saving...' : isAiDirty ? 'Save AI Selection' : 'Settings Saved'}
                  </button>
                </div>
              </form>

              {/* BYOK Encrypted Key Section */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="text-base font-semibold text-gray-900">
                  Encrypted Personal Keys ({currentProviderConfig?.label})
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  Keys are stored using authenticated AES-256-GCM application encryption and never
                  returned in plaintext.
                </p>

                {currentProviderConfig?.userKeyConfigured ? (
                  <div className="mt-4 flex items-center justify-between rounded-xl border border-green-200 bg-green-50 p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-200 text-green-800 text-xs font-bold">
                        ✓
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-green-900">
                          Key Active: {currentProviderConfig.keyHint}
                        </p>
                        <p className="text-xs text-green-700">
                          Secured with authenticated AES-256-GCM encryption.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeletePersonalKey(selectedProvider)}
                      className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-200 cursor-pointer"
                    >
                      Remove Key
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSavePersonalKey} className="mt-4 space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        type="password"
                        placeholder={`Enter your ${currentProviderConfig?.label} API key`}
                        value={personalApiKeyInput}
                        onChange={(e) => setPersonalApiKeyInput(e.target.value)}
                        className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={isSavingKey}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50 cursor-pointer"
                      >
                        {isSavingKey ? 'Encrypting...' : 'Save & Encrypt Key'}
                      </button>
                    </div>
                    {currentProviderConfig?.docsUrl && (
                      <p className="text-xs text-gray-500">
                        Need a key? Get one from{' '}
                        <a
                          href={currentProviderConfig.docsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {currentProviderConfig.label} console ↗
                        </a>
                      </p>
                    )}
                  </form>
                )}

                {/* Disclosures box */}
                <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
                  <p className="font-semibold text-slate-800">Security & Billing Disclosures:</p>
                  <p>• {aiCatalogue?.catalogue.disclosures.adminPaidNotice}</p>
                  <p>• {aiCatalogue?.catalogue.disclosures.personalKeyNotice}</p>
                  <p>• {aiCatalogue?.catalogue.disclosures.dataTransferNotice}</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: DATA EXPORT (Step 9) */}
          {activeTab === 'data' && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">Export Your Data</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Pursuant to your data rights, you can request and download a complete archive of
                  your financial information, parsed records, and transaction history.
                </p>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-bold text-white">
                          JSON
                        </span>
                        <h3 className="font-bold text-gray-900">Machine-Readable Archive</h3>
                      </div>
                      <p className="mt-2 text-xs text-gray-600">
                        Contains complete structured JSON records of all your profile settings, bank
                        accounts, statements, draft extractions, transactions, categories, bills,
                        chat history, and consent records.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportJson}
                      disabled={isExportingJson}
                      className="mt-4 w-full rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer shadow"
                    >
                      {isExportingJson ? 'Preparing JSON...' : 'Download Full Archive (.json)'}
                    </button>
                  </div>

                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-indigo-600 px-2 py-1 text-xs font-bold text-white">
                          PDF
                        </span>
                        <h3 className="font-bold text-gray-900">Financial Summary Report</h3>
                      </div>
                      <p className="mt-2 text-xs text-gray-600">
                        A formatted, printable PDF summary containing your account overview, net
                        cash flow, debit/credit totals, statement coverage, and legal consent
                        provenance.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportPdf}
                      disabled={isExportingPdf}
                      className="mt-4 w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer shadow"
                    >
                      {isExportingPdf ? 'Generating PDF...' : 'Download Summary Report (.pdf)'}
                    </button>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500">
                  <p className="font-semibold text-slate-700">Confidentiality Note:</p>
                  <p className="mt-1">
                    Data exports strictly omit authentication credentials, password hashes, and
                    active verification tokens for security.
                  </p>
                </div>
              </div>

              {/* Danger Zone: Account Closure & Data Deletion Card */}
              <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100 text-red-600 text-sm font-bold">
                    ⚠️
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-red-900">
                      Account Closure & Data Deletion
                    </h2>
                    <p className="text-xs text-gray-500">
                      Permanently delete your account and all associated personal financial records.
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-xs text-red-800 space-y-1.5">
                  <p className="font-bold">What will be permanently wiped:</p>
                  <ul className="list-disc pl-5 space-y-1 text-red-700">
                    <li>All uploaded bank statement files, drafts, and extraction records.</li>
                    <li>
                      All ledger transactions, expense categories, merchant bills, and line items.
                    </li>
                    <li>Your entire assistant chat history and preferences.</li>
                    <li>All stored personal AI keys and active session tokens across devices.</li>
                  </ul>
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(true)}
                    className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 shadow transition cursor-pointer"
                  >
                    Permanently Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Activity & Audit Logs</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Review your account security updates, profile modifications, and regional
                    preference changes.
                  </p>
                </div>
                <Link
                  href="/activity"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer"
                >
                  <span>Open Full Activity Page</span>
                  <span>→</span>
                </Link>
              </div>

              <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-xs text-blue-900 flex items-start gap-3">
                <span className="text-lg">🔒</span>
                <div>
                  <p className="font-semibold">Security & Privacy Protection</p>
                  <p className="mt-0.5 text-blue-800">
                    Finlytix tracks audit events for your security. Passwords, password hashes, and
                    active authentication tokens are strictly excluded from logs and can never be
                    retrieved or viewed.
                  </p>
                </div>
              </div>

              <div className="mt-6 text-center py-6">
                <p className="text-sm text-slate-600">
                  Access the dedicated, filterable, and paginated timeline of your complete account
                  history:
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-3">
                  <Link
                    href="/activity"
                    className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-slate-800 transition cursor-pointer"
                  >
                    View All Activity Logs
                  </Link>
                  <Link
                    href="/assistant"
                    className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Ask AI: &quot;When did I change password?&quot;
                  </Link>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDeleteModal(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-3xl border border-white/20 bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600 font-bold">
              ⚠️
            </div>
            <h3 className="text-lg font-bold text-gray-900">Close Account Permanently?</h3>
            <p className="mt-1 text-xs text-gray-500">
              Please enter your password to confirm identity before we permanently delete your
              account and personal records.
            </p>

            <form onSubmit={handleDeleteAccount} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3.5 py-2 text-sm focus:border-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Type <span className="font-bold text-red-600">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  placeholder="DELETE"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3.5 py-2 text-sm focus:border-red-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeletingAccount}
                  className="rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer shadow"
                >
                  {isDeletingAccount ? 'Closing...' : 'Permanently Delete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Category Confirmation Modal */}
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
                    This will also delete {childCount} subcategor
                    {childCount === 1 ? 'y' : 'ies'} and clear the category from any associated
                    transactions.
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
