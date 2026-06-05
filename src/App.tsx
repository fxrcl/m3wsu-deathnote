import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trash2, Plus, Search, FileDown, Table, RefreshCw, User, Activity,
  LayoutGrid, List, Shield, LogIn, LogOut, Key, X, Link
} from 'lucide-react';
import { ActionRecord } from './types';

const TOKEN_KEY = 'm3wsu_admin_token';

export default function App() {
  const [records, setRecords] = useState<ActionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [action, setAction] = useState('');
  const [faceitUrl, setFaceitUrl] = useState('');
  const [filter, setFilter] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [googleDocUrl, setGoogleDocUrl] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    fetchRecords();
    verifySession();
  }, []);

  const verifySession = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    try {
      const response = await fetch('/api/verify', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok && data.valid) {
        setIsAdmin(true);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch {
    }
  };

  const fetchRecords = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch('/api/records');
      if (!response.ok) throw new Error('Bad response');
      const data = await response.json();
      setRecords(data);
    } catch (error) {
      console.error('Failed to fetch records', error);
      setLoadError('Не удалось загрузить записи с сервера');
    } finally {
      setIsLoading(false);
    }
  };

  const saveToServer = async (newRecords: ActionRecord[]) => {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    const response = await fetch('/api/records', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(newRecords),
    });
    if (!response.ok) {
      throw new Error('Not authorized');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });
      const data = await response.json();
      if (response.ok && data.authenticated) {
        localStorage.setItem(TOKEN_KEY, data.token);
        setIsAdmin(true);
        setShowLoginModal(false);
        setPasswordInput('');
      } else {
        setLoginError(data.error || 'Неверный пароль');
      }
    } catch (err) {
      setLoginError('Не удалось установить связь с сервером');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
    } catch {
    }
    localStorage.removeItem(TOKEN_KEY);
    setIsAdmin(false);
  };

  const addRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert('Запись доступна только администратору.');
      return;
    }
    if (!nickname.trim() || !action.trim()) return;

    const newRecord: ActionRecord = {
      id: crypto.randomUUID(),
      nickname: nickname.trim(),
      action: action.trim(),
      timestamp: Date.now(),
      faceitUrl: faceitUrl.trim() || undefined,
    };

    const previous = records;
    const updatedRecords = [newRecord, ...records];
    setRecords(updatedRecords);
    setNickname('');
    setAction('');
    setFaceitUrl('');
    try {
      await saveToServer(updatedRecords);
    } catch {
      setRecords(previous);
      alert('Ошибка: Действие отклонено. Убедитесь, что вы авторизованы как администратор.');
    }
  };

  const deleteRecord = async (id: string) => {
    if (!isAdmin) {
      alert('Удаление записей доступно только администратору.');
      return;
    }
    const previous = records;
    const updatedRecords = records.filter(r => r.id !== id);
    setRecords(updatedRecords);
    try {
      await saveToServer(updatedRecords);
    } catch {
      setRecords(previous);
      alert('Ошибка: Действие отклонено. Убедитесь, что вы авторизованы как администратор.');
    }
  };

  const syncFromGoogleDocs = async () => {
    if (!isAdmin) {
      alert('Синхронизация доступна только администратору.');
      return;
    }
    if (!googleDocUrl.trim()) {
      alert('Пожалуйста, введите URL Google Таблицы (опубликованной как CSV)');
      return;
    }

    setIsSyncing(true);
    const previous = records;
    try {
      const response = await fetch(googleDocUrl);
      const csvText = await response.text();

      const rows = csvText.split('\n').slice(1);
      const newRecords: ActionRecord[] = rows
        .filter(row => row.trim())
        .map(row => {
          const columns = row.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
          const nick = columns[0];
          const act = columns[1];
          const faceit = columns[2];
          return {
            id: crypto.randomUUID(),
            nickname: nick || 'Unknown',
            action: act || 'No action',
            faceitUrl: faceit || undefined,
            timestamp: Date.now(),
          };
        });

      const updatedRecords = [...newRecords, ...records];
      setRecords(updatedRecords);
      await saveToServer(updatedRecords);
      alert(`Синхронизировано ${newRecords.length} записей`);
    } catch (error) {
      console.error('Sync failed', error);
      setRecords(previous);
      alert('Ошибка синхронизации. Убедитесь, что таблица опубликована как CSV и вы авторизованы как администратор.');
    } finally {
      setIsSyncing(false);
    }
  };

  const exportToJson = () => {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `m3wsu_records_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredRecords = useMemo(() => {
    return records.filter(r =>
      r.nickname.toLowerCase().includes(filter.toLowerCase())
    );
  }, [records, filter]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 relative min-h-screen flex flex-col">
      <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-bold tracking-tight text-white mb-2">M3WSU Death Note</h1>
            {isAdmin && (
              <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2.5 py-1 rounded-full border border-emerald-500/20 font-medium tracking-wide flex items-center gap-1">
                <Shield className="w-3.5 h-3.5" /> Админ
              </span>
            )}
          </div>
          <p className="text-stone-500 font-medium">Система логирования действий игроков</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-card border border-border rounded-lg p-1 flex gap-1">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-2 rounded-md transition-all ${viewMode === 'cards' ? 'bg-stone-800 text-white' : 'text-stone-500 hover:text-stone-300'}`}
              title="Вид карточек"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-md transition-all ${viewMode === 'table' ? 'bg-stone-800 text-white' : 'text-stone-500 hover:text-stone-300'}`}
              title="Вид таблицы"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button onClick={exportToJson} className="btn-secondary">
            <FileDown className="w-4 h-4" />
            Экспорт JSON
          </button>

          {isAdmin ? (
            <button onClick={handleLogout} className="btn-secondary text-red-400 hover:bg-red-500/10 hover:border-red-500/20">
              <LogOut className="w-4 h-4" />
              Выйти
            </button>
          ) : (
            <button onClick={() => { setLoginError(null); setShowLoginModal(true); }} className="btn-primary">
              <LogIn className="w-4 h-4" />
              Войти
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <aside className="space-y-6">
          {isAdmin ? (
            <>
              <section className="glass-card p-5 space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Добавить запись
                </h2>
                <form onSubmit={addRecord} className="space-y-3">
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-600 pointer-events-none z-10" />
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="Ник игрока"
                      className="input-field !pl-10"
                      required
                    />
                  </div>
                  <div className="relative">
                    <Activity className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-600 pointer-events-none z-10" />
                    <input
                      type="text"
                      value={action}
                      onChange={(e) => setAction(e.target.value)}
                      placeholder="Действие"
                      className="input-field !pl-10"
                      required
                    />
                  </div>
                  <div className="relative">
                    <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-600 pointer-events-none z-10" />
                    <input
                      type="url"
                      value={faceitUrl}
                      onChange={(e) => setFaceitUrl(e.target.value)}
                      placeholder="Ссылка на FACEIT (опционально)"
                      className="input-field !pl-10"
                    />
                  </div>
                  <button type="submit" className="btn-primary w-full">
                    Записать
                  </button>
                </form>
              </section>

              <section className="glass-card p-5 space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-2">
                  <Table className="w-4 h-4" /> Google Docs Sync
                </h2>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={googleDocUrl}
                    onChange={(e) => setGoogleDocUrl(e.target.value)}
                    placeholder="CSV URL Таблицы"
                    className="input-field"
                  />
                  <button
                    onClick={syncFromGoogleDocs}
                    disabled={isSyncing}
                    className="btn-secondary w-full disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    Синхронизировать
                  </button>
                  <p className="text-[10px] text-stone-600 leading-relaxed">
                    * Таблица должна быть опубликована: Файл → Поделиться → Опубликовать в интернете → Формат CSV.
                  </p>
                </div>
              </section>
            </>
          ) : (
            <section className="glass-card p-6">
              <div className="flex flex-col items-center text-center space-y-4 py-4">
                <div className="w-12 h-12 rounded-full bg-stone-900 border border-border flex items-center justify-center">
                  <Shield className="w-6 h-6 text-stone-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-stone-300">Режим просмотра</h3>
                  <p className="text-xs text-stone-500 leading-relaxed mt-2 max-w-[220px] mx-auto">
                    Вы вошли как гость. Вы можете просматривать, фильтровать лог и экспортировать его. Вносить изменения (добавлять/удалять записи) может только администратор.
                  </p>
                </div>
                <button
                  onClick={() => { setLoginError(null); setShowLoginModal(true); }}
                  className="btn-primary w-full mt-2"
                >
                  Войти как Администратор
                </button>
              </div>
            </section>
          )}
        </aside>

        <main className="lg:col-span-2 space-y-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-600 pointer-events-none z-10" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Поиск по нику..."
              className="input-field !pl-10 bg-card"
            />
          </div>

          <div className="space-y-3">
            {viewMode === 'cards' ? (
              <AnimatePresence mode="popLayout">
                {filteredRecords.map((record) => (
                  <motion.div
                    key={record.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="glass-card p-4 flex items-start justify-between group hover:border-stone-600 transition-colors"
                  >
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-stone-900 flex-shrink-0 flex items-center justify-center text-xs font-bold text-stone-400 border border-border">
                        {record.nickname.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2 mb-1">
                          <span className="font-semibold text-white truncate">{record.nickname}</span>
                          {record.faceitUrl && (
                            <a
                              href={record.faceitUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-orange-400 hover:text-orange-300 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded transition-all font-medium whitespace-nowrap"
                            >
                              <Link className="w-3 h-3" />
                              FACEIT
                            </a>
                          )}
                          <span className="text-[10px] text-stone-600 font-mono whitespace-nowrap">
                            {new Date(record.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm text-stone-400 break-words whitespace-pre-wrap">{record.action}</p>
                      </div>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => deleteRecord(record.id)}
                        className="p-2 text-stone-700 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            ) : (
              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-stone-900/50">
                        <th className="p-4 text-xs font-semibold uppercase tracking-wider text-stone-500">Игрок</th>
                        <th className="p-4 text-xs font-semibold uppercase tracking-wider text-stone-500">Действие</th>
                        <th className="p-4 text-xs font-semibold uppercase tracking-wider text-stone-500">Время</th>
                        {isAdmin && <th className="p-4 text-xs font-semibold uppercase tracking-wider text-stone-500 w-10"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence mode="popLayout">
                        {filteredRecords.map((record) => (
                          <motion.tr
                            key={record.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="border-b border-border/50 hover:bg-stone-800/20 transition-colors group"
                          >
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-white">{record.nickname}</span>
                                {record.faceitUrl && (
                                  <a
                                    href={record.faceitUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] text-orange-400 hover:text-orange-300 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded transition-all font-medium whitespace-nowrap"
                                  >
                                    <Link className="w-3 h-3" />
                                    FACEIT
                                  </a>
                                )}
                              </div>
                            </td>
                            <td className="p-4">
                              <p className="text-sm text-stone-400 break-words max-w-xs sm:max-w-md">
                                {record.action}
                              </p>
                            </td>
                            <td className="p-4 whitespace-nowrap">
                              <span className="text-xs text-stone-600 font-mono">
                                {new Date(record.timestamp).toLocaleString()}
                              </span>
                            </td>
                            {isAdmin && (
                              <td className="p-4">
                                <button
                                  onClick={() => deleteRecord(record.id)}
                                  className="p-2 text-stone-700 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            )}
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {isLoading && (
              <div className="text-center py-20 text-stone-600 border border-dashed border-border rounded-xl">
                Загрузка записей...
              </div>
            )}

            {!isLoading && loadError && (
              <div className="text-center py-20 text-red-400 border border-dashed border-red-500/30 rounded-xl space-y-3">
                <p>{loadError}</p>
                <button onClick={fetchRecords} className="btn-secondary mx-auto">Повторить</button>
              </div>
            )}

            {!isLoading && !loadError && filteredRecords.length === 0 && (
              <div className="text-center py-20 text-stone-600 border border-dashed border-border rounded-xl">
                Записей не найдено
              </div>
            )}
          </div>
        </main>
      </div>

      <footer className="mt-auto pt-16 pb-2 text-center">
        <a
          href="https://t.me/fxrcl"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[11px] text-stone-600 hover:text-stone-300 transition-colors"
        >
          by fxrcl
        </a>
      </footer>

      <AnimatePresence>
        {showLoginModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card p-6 w-full max-w-md relative select-none"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowLoginModal(false)}
                className="absolute top-4 right-4 text-stone-500 hover:text-stone-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col items-center text-center space-y-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-stone-900 border border-border flex items-center justify-center">
                  <Key className="w-6 h-6 text-stone-300" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Вход для Администратора</h3>
                  <p className="text-xs text-stone-500 mt-1">
                    Пожалуйста, введите пароль администратора, чтобы открыть доступ к управлению хрониками.
                  </p>
                </div>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-stone-400 uppercase tracking-widest block">Пароль</label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Введите пароль..."
                    className="input-field"
                    autoFocus
                    required
                  />
                </div>

                {loginError && (
                  <div className="text-xs text-red-400 font-medium bg-red-500/10 border border-red-500/10 p-2.5 rounded-lg">
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="btn-primary w-full disabled:opacity-50"
                >
                  {isLoggingIn ? 'Проверка...' : 'Войти'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
