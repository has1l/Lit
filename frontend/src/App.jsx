import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from './components/Layout.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import Mascot from './components/Mascot.jsx';
import { defaultViewMode, displayUser } from './lib/displayUser.js';
import Appeals from './pages/Appeals.jsx';
import Chat from './pages/Chat.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Documents from './pages/Documents.jsx';
import ManagerDashboard from './pages/ManagerDashboard.jsx';
import Profile from './pages/Profile.jsx';
import Questions from './pages/Questions.jsx';
import Salary from './pages/Salary.jsx';
import Vacation from './pages/Vacation.jsx';
import { useAuth } from './store/AuthContext.jsx';

export default function App() {
  const { user: authUser, status } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem('lit-theme') || 'dark');

  // Тема сразу — независимо от auth, чтобы splash-экран был в брендовом стиле
  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light');
    document.documentElement.classList.toggle('theme-dark',  theme === 'dark');
    localStorage.setItem('lit-theme', theme);
  }, [theme]);

  if (status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-4">
          <Mascot state="thinking" size="xl" />
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
            Подключаемся к&nbsp;1221 Systems…
          </p>
        </div>
      </div>
    );
  }

  if (status !== 'authenticated' || !authUser) {
    return <LoginScreen />;
  }

  return <Workspace authUser={authUser} theme={theme} setTheme={setTheme} />;
}

function Workspace({ authUser, theme, setTheme }) {
  const profile  = useMemo(() => displayUser(authUser),     [authUser]);
  const viewMode = defaultViewMode(authUser.role);  // 'employee' | 'manager'
  const initialPage = viewMode === 'manager' ? 'team' : 'dashboard';

  const [activePage,      setActivePage]      = useState(initialPage);
  const [draftPrompt,     setDraftPrompt]     = useState('');
  const [appeals,         setAppeals]         = useState([]);
  const [appealModalOpen, setAppealModalOpen] = useState(false);
  const [contactEmail,    setContactEmail]    = useState(null);

  const openChatWithPrompt = useCallback((prompt) => {
    setDraftPrompt(prompt);
    setActivePage('chat');
  }, []);

  const clearDraftPrompt = useCallback(() => setDraftPrompt(''), []);

  const openAppealModal = useCallback(() => {
    setActivePage('appeals');
    setAppealModalOpen(true);
  }, []);

  const openEmployeeChat = useCallback((email) => {
    setContactEmail(email);
    setActivePage('chat');
  }, []);

  const addAppeal = useCallback((appeal) => {
    setAppeals((current) => [
      { id: `HR-${1025 + current.length}`, status: 'Новое', ...appeal },
      ...current,
    ]);
  }, []);

  const employeePages = {
    dashboard: <Dashboard openChatWithPrompt={openChatWithPrompt} navigate={setActivePage} profile={profile} />,
    questions: <Questions openChatWithPrompt={openChatWithPrompt} />,
    chat: (
      <Chat
        draftPrompt={draftPrompt}
        clearDraftPrompt={clearDraftPrompt}
        onCreateAppeal={openAppealModal}
        openSection={setActivePage}
        viewMode="employee"
        profile={profile}
      />
    ),
    vacation: <Vacation openChatWithPrompt={openChatWithPrompt} />,
    salary:    <Salary />,
    documents: <Documents />,
    appeals: (
      <Appeals
        appeals={appeals}
        addAppeal={addAppeal}
        modalOpen={appealModalOpen}
        setModalOpen={setAppealModalOpen}
      />
    ),
    profile: <Profile profile={profile} />,
  };

  const managerPages = {
    team: <ManagerDashboard onOpenEmployeeChat={openEmployeeChat} />,
    chat: (
      <Chat
        draftPrompt=""
        clearDraftPrompt={() => {}}
        onCreateAppeal={openAppealModal}
        openSection={setActivePage}
        viewMode="manager"
        initialContactEmail={contactEmail}
        profile={profile}
      />
    ),
    vacation: <Vacation openChatWithPrompt={openChatWithPrompt} />,
    salary:   <Salary />,
    profile:  <Profile profile={profile} />,
  };

  const pages = viewMode === 'manager' ? managerPages : employeePages;

  return (
    <Layout
      activePage={activePage}
      setActivePage={setActivePage}
      theme={theme}
      setTheme={setTheme}
      viewMode={viewMode}
      profile={profile}
    >
      {pages[activePage] || pages[initialPage]}
    </Layout>
  );
}
