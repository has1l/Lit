import { BadgeCheck, Building2, CalendarDays, Mail, UserRound } from 'lucide-react';
import Card from '../components/Card.jsx';
import { useEmployeeData } from '../hooks/useEmployeeData.js';
import { formatFull } from '../lib/format.js';

export default function Profile({ profile }) {
  const { data } = useEmployeeData();
  const dbProfile = data?.profile;

  if (!profile) return null;

  const position = dbProfile?.position || profile.role;
  const hireDate = dbProfile?.hire_date ? formatFull(dbProfile.hire_date) : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="page-eyebrow">Аккаунт сотрудника</p>
        <h1 className="text-3xl font-bold tracking-tight text-white">Профиль</h1>
        <p className="mt-2 text-slate-400">Основная информация о сотруднике.</p>
      </div>

      <Card className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="icon-tile h-24 w-24 rounded-[28px] text-2xl font-bold">
          {profile.avatar}
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">{profile.fullName}</h2>
          <p className="mt-1 text-slate-400">{position}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="status-chip inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold">
              <BadgeCheck size={16} />
              Активный сотрудник
            </span>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <UserRound className="text-slate-400" />
          <p className="metric-label mt-4">Должность</p>
          <p className="metric-value mt-1 font-bold">{position}</p>
        </Card>
        <Card>
          <Building2 className="text-slate-400" />
          <p className="metric-label mt-4">Отдел</p>
          <p className="metric-value mt-1 font-bold">{profile.department}</p>
        </Card>
        <Card>
          <Mail className="text-slate-400" />
          <p className="metric-label mt-4">Почта</p>
          <p className="metric-value mt-1 break-all font-bold">{profile.email}</p>
        </Card>
        {hireDate && (
          <Card>
            <CalendarDays className="text-slate-400" />
            <p className="metric-label mt-4">Дата найма</p>
            <p className="metric-value mt-1 font-bold">{hireDate}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
