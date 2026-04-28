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
      <aside className="fintech-sidebar fixed inset-y-0 left-0 z-30 hidden w-72 border-r p-6 lg:block">
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
                className={`fintech-nav-item flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left font-medium ${
                  isActive
                    ? 'fintech-nav-active'
                    : ''
                }`}
              >
                <Icon size={20} />
                {item.label}
              </button>
            );
          })}
        </nav>

      </aside>

      {/* ─── Content + topbar ────────────────────────────────────── */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-72">
        <header className="fintech-topbar sticky top-0 z-20 border-b px-4 py-4 sm:px-6 lg:px-8">
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
                className="fintech-control grid h-11 w-11 place-items-center rounded-2xl transition hover:border-purple-400/40"
                aria-label="Переключить тему"
              >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>

              <button
                className="fintech-control relative grid h-11 w-11 place-items-center rounded-2xl transition hover:border-purple-400/40"
                aria-label="Уведомления"
              >
                <Bell size={20} />
                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-purple-500" />
              </button>

              <div className="hidden items-center gap-3 sm:flex">
                <div className="icon-tile h-11 w-11 rounded-2xl text-sm font-bold">
                  {profile?.avatar}
                </div>
                <div>
                  <p className="font-semibold text-white">{profile?.fullName}</p>
                  <p className="text-sm text-slate-400">{profile?.role}</p>
                </div>
              </div>

              <button
                onClick={logout}
                className="fintech-control grid h-11 w-11 place-items-center rounded-2xl transition hover:bg-red-500/15 hover:text-red-200"
                aria-label="Выйти"
                title="Выйти"
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

      {/* ─── Mobile bottom-nav ───────────────────────────────────── */}
      <nav className="fintech-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t px-2 py-2 shadow-[0_-10px_35px_rgba(0,0,0,0.18)] lg:hidden">
        <div className="no-scrollbar mx-auto flex max-w-md gap-1 overflow-x-auto">
          {visibleNavItems.filter((item) => !item.divider).map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`fintech-nav-item flex min-w-[4.5rem] flex-col items-center gap-1 rounded-2xl px-2 py-2 text-xs font-semibold ${
                  isActive ? 'fintech-nav-active' : ''
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
