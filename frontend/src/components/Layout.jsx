import { Bell, LogOut, Moon, Sun } from 'lucide-react';
import { managerNavItems, navItems } from '../data/mockData.js';
import { useAuth } from '../store/AuthContext.jsx';
import Mascot from './Mascot.jsx';

const ROLE_LABEL = {
  employee: 'Сотрудник',
  manager:  'Руководитель',
  hr:       'HR',
};

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <Mascot state="idle" size="md" />
      <div>
        <p className="text-xl font-bold tracking-tight text-white">Техна</p>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
          1221 Systems
        </p>
      </div>
    </div>
  );
}

export default function Layout({
  activePage,
  setActivePage,
  children,
  theme,
  setTheme,
  viewMode,
  profile,
}) {
  const { logout } = useAuth();
  const visibleNavItems = viewMode === 'manager' ? managerNavItems : navItems;

  return (
    <div className="min-h-screen lg:flex">
      {/* ─── Sidebar ──────────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-800 bg-slate-950/80 p-6 backdrop-blur-xl lg:block">
        <Brand />

        <nav className="mt-10 space-y-2">
          {visibleNavItems.map((item) => {
            if (item.divider) {
              return (
                <div key={item.label} className="pb-1 pt-5">
                  <p className="px-4 text-xs font-semibold uppercase tracking-widest text-slate-600">
                    {item.label}
                  </p>
                </div>
              );
            }
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left font-medium transition ${
                  isActive
                    ? 'bg-purple-600/35 text-white ring-1 ring-purple-500/40'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <Icon size={20} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="absolute inset-x-6 bottom-6 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-800 text-sm font-bold text-white ring-1 ring-slate-700">
            {profile?.avatar}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{profile?.fullName}</p>
            <p className="truncate text-xs text-slate-400">{profile?.department}</p>
          </div>
          <button
            onClick={logout}
            className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-slate-300 ring-1 ring-slate-800 transition hover:bg-red-500/20 hover:text-red-200"
            aria-label="Выйти"
            title="Выйти"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ─── Content + topbar ────────────────────────────────────── */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/55 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div className="lg:hidden">
              <Brand />
            </div>
            <div className="hidden lg:block">
              <p className="text-sm text-slate-400">
                Рабочий кабинет · {ROLE_LABEL[profile?.rbacRole] || 'Гость'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-slate-300 ring-1 ring-slate-800 transition hover:bg-slate-800"
                aria-label="Переключить тему"
              >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>

              <button className="relative grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-slate-300 ring-1 ring-slate-800 transition hover:bg-slate-800">
                <Bell size={20} />
                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-purple-500" />
              </button>

              <div className="hidden items-center gap-3 sm:flex">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-800 text-sm font-bold text-white ring-1 ring-slate-700">
                  {profile?.avatar}
                </div>
                <div>
                  <p className="font-semibold text-white">{profile?.fullName}</p>
                  <p className="text-sm text-slate-400">{profile?.role}</p>
                </div>
              </div>

              <button
                onClick={logout}
                className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-slate-300 ring-1 ring-slate-800 transition hover:bg-red-500/20 hover:text-red-200 lg:hidden"
                aria-label="Выйти"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>

      {/* ─── Mobile bottom-nav (Liquid-Glass-inspired) ───────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 px-2 py-2 shadow-[0_-10px_35px_rgba(0,0,0,0.28)] backdrop-blur-xl lg:hidden">
        <div className="no-scrollbar mx-auto flex max-w-md gap-1 overflow-x-auto">
          {visibleNavItems.filter((item) => !item.divider).map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`flex min-w-20 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-xs font-semibold transition ${
                  isActive ? 'bg-purple-600/25 text-white' : 'text-slate-500'
                }`}
              >
                <Icon size={21} />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
