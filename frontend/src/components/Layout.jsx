import { Bell, LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useMemo, useState } from 'react';
import { managerNavItems, navItems } from '../data/mockData.js';
import { useAuth } from '../store/AuthContext.jsx';
import EmployeeOnboarding from './EmployeeOnboarding.jsx';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const visibleNavItems = viewMode === 'manager' ? managerNavItems : navItems;
  const mobileNavItems = useMemo(() => {
    const items = visibleNavItems.filter((item) => !item.divider);
    const primaryIds = viewMode === 'manager'
      ? ['team', 'store', 'chat', 'documents']
      : ['dashboard', 'goals', 'store', 'chat'];
    const primary = primaryIds.map((id) => items.find((item) => item.id === id)).filter(Boolean);
    const more = items.filter((item) => !primaryIds.includes(item.id));
    return { primary, more };
  }, [viewMode, visibleNavItems]);

  function openPage(pageId) {
    setActivePage(pageId);
    setMobileMenuOpen(false);
  }

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
                onClick={() => openPage(item.id)}
                data-tour={viewMode === 'employee' ? `employee-nav-${item.id}` : undefined}
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
        <header className="fintech-topbar fixed inset-x-0 top-0 z-40 border-b px-3 py-2.5 sm:px-6 sm:py-3 lg:sticky lg:inset-x-auto lg:z-20 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div className="lg:hidden">
              <div className="flex items-center gap-2">
                <Mascot state="idle" size="sm" />
                <p className="text-lg font-bold text-white">Техна</p>
              </div>
            </div>
            <div className="hidden lg:block">
              <p className="text-sm text-slate-400">
                Рабочий кабинет · {ROLE_LABEL[profile?.rbacRole] || 'Гость'}
              </p>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                data-tour={viewMode === 'employee' ? 'employee-theme-toggle' : undefined}
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
                data-tour={viewMode === 'employee' ? 'employee-logout' : undefined}
                className="fintech-control grid h-11 w-11 place-items-center rounded-2xl transition hover:bg-red-500/15 hover:text-red-200"
                aria-label="Выйти"
                title="Выйти"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-3 pb-28 pt-24 sm:px-6 sm:pt-24 lg:px-8 lg:pb-10 lg:pt-6">
          {children}
        </main>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            aria-label="Закрыть меню"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fintech-panel absolute inset-x-3 bottom-24 rounded-3xl p-3 shadow-2xl">
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Разделы
            </p>
            <div className="grid grid-cols-2 gap-2">
              {mobileNavItems.more.map((item) => {
                const Icon = item.icon;
                const isActive = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => openPage(item.id)}
                    data-tour={viewMode === 'employee' ? `employee-nav-${item.id}` : undefined}
                    className={`fintech-nav-item flex items-center gap-2 rounded-2xl px-3 py-3 text-left text-sm font-semibold ${
                      isActive ? 'fintech-nav-active' : ''
                    }`}
                  >
                    <Icon size={18} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Mobile bottom-nav ───────────────────────────────────── */}
      <nav className="fintech-mobile-nav fixed inset-x-0 bottom-0 z-50 border-t px-1.5 py-2 shadow-[0_-10px_35px_rgba(0,0,0,0.18)] lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-0.5 pb-1">
          {mobileNavItems.primary.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => openPage(item.id)}
                data-tour={viewMode === 'employee' ? `employee-nav-${item.id}` : undefined}
                className={`fintech-nav-item flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${
                  isActive ? 'fintech-nav-active' : 'opacity-70'
                }`}
              >
                <Icon size={isActive ? 22 : 20} className="transition-transform duration-200" />
                {item.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((current) => !current)}
            className={`fintech-nav-item flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${
              mobileMenuOpen || mobileNavItems.more.some((item) => item.id === activePage) ? 'fintech-nav-active' : 'opacity-70'
            }`}
          >
            <Menu size={mobileMenuOpen ? 22 : 20} className="transition-transform duration-200" />
            Ещё
          </button>
        </div>
      </nav>

      <EmployeeOnboarding
        activePage={activePage}
        setActivePage={setActivePage}
        enabled={viewMode === 'employee'}
      />
    </div>
  );
}
