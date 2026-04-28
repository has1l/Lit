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
        <h1 className="text-3xl font-bold tracking-tight text-white">Профиль</h1>
        <p className="mt-2 text-slate-400">Основная информация о сотруднике.</p>
      </div>

      <Card className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="grid h-24 w-24 place-items-center rounded-[32px] bg-gradient-to-br from-slate-800 to-purple-800 text-2xl font-bold text-white ring-1 ring-purple-400/20">
          {profile.avatar}
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">{profile.fullName}</h2>
          <p className="mt-1 text-slate-400">{position}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-purple-500/10 px-3 py-1 text-sm font-semibold text-purple-300 ring-1 ring-purple-400/20">
              <BadgeCheck size={16} />
              Активный сотрудник
            </span>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <UserRound className="text-purple-300" />
          <p className="mt-4 text-sm text-slate-500">Должность</p>
          <p className="mt-1 font-bold text-white">{position}</p>
        </Card>
        <Card>
          <Building2 className="text-purple-300" />
          <p className="mt-4 text-sm text-slate-500">Отдел</p>
          <p className="mt-1 font-bold text-white">{profile.department}</p>
        </Card>
        <Card>
          <Mail className="text-purple-300" />
          <p className="mt-4 text-sm text-slate-500">Почта</p>
          <p className="mt-1 break-all font-bold text-white">{profile.email}</p>
        </Card>
        {hireDate && (
          <Card>
            <CalendarDays className="text-purple-300" />
            <p className="mt-4 text-sm text-slate-500">Дата найма</p>
            <p className="mt-1 font-bold text-white">{hireDate}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
