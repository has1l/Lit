import { FileText, Loader2, WalletCards } from 'lucide-react';
import { useEmployeeData } from '../hooks/useEmployeeData.js';
import { formatDay, formatFull, formatAmount, paymentTypeRu } from '../lib/format.js';

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl bg-slate-800 p-5 ${className}`}>
      {children}
    </div>
  );
}

function daysUntilLabel(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(y, m - 1, d);
  const diff = Math.round((target - today) / 86_400_000);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  if (diff > 1) {
    if (diff % 10 === 1 && diff % 100 !== 11) return `через ${diff} день`;
    if (diff % 10 >= 2 && diff % 10 <= 4 && (diff % 100 < 10 || diff % 100 >= 20)) return `через ${diff} дня`;
    return `через ${diff} дней`;
  }
  return null;
}

function PaymentCard({ payment }) {
  if (!payment) return (
    <Card>
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-700 text-slate-500">
        <WalletCards size={24} />
      </div>
      <p className="mt-5 text-sm font-medium text-slate-500">Нет плановых выплат</p>
    </Card>
  );

  const until = daysUntilLabel(payment.payment_date);
  return (
    <Card>
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-purple-400/15 text-purple-300">
        <WalletCards size={24} />
      </div>
      <p className="mt-5 text-sm font-medium text-slate-400">{paymentTypeRu(payment.payment_type)}</p>
      <p className="mt-1 text-4xl font-bold text-white">{formatDay(payment.payment_date)}</p>
      <p className="mt-1 text-xl font-semibold text-purple-300">{formatAmount(payment.amount)}</p>
      {until && <p className="mt-2 text-sm text-slate-500">{until}</p>}
    </Card>
  );
}

export default function Salary() {
  const { data, loading, error } = useEmployeeData();

  const upcoming = data?.upcoming_payments ?? [];
  const recent = data?.recent_payments ?? [];

  const advance = upcoming.find((p) => p.payment_type === 'advance') ?? null;
  const salary = upcoming.find((p) => p.payment_type === 'salary') ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Зарплата</h1>
        <p className="mt-2 text-slate-400">Выплаты, даты начислений и расчетный лист.</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 size={20} className="animate-spin" />
          <span>Загрузка данных...</span>
        </div>
      ) : error ? (
        <p className="text-sm text-red-400">Не удалось загрузить данные о выплатах</p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <PaymentCard payment={advance} />
            <PaymentCard payment={salary} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_0.75fr]">
            <Card>
              <h2 className="text-xl font-bold text-white">Последние выплаты</h2>
              <div className="mt-5 divide-y divide-slate-700">
                {recent.length === 0 ? (
                  <p className="py-4 text-sm text-slate-500">История выплат не найдена</p>
                ) : (
                  recent.map((item) => (
                    <div key={`${item.payment_date}-${item.payment_type}`} className="flex items-center justify-between gap-4 py-4">
                      <div>
                        <p className="font-semibold text-white">{paymentTypeRu(item.payment_type)}</p>
                        <p className="mt-1 text-sm text-slate-500">{formatFull(item.payment_date)}</p>
                      </div>
                      <p className="text-lg font-bold text-white">{formatAmount(item.amount)}</p>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-700 text-slate-400">
                <FileText size={24} />
              </div>
              <h2 className="mt-5 text-xl font-bold text-white">Расчетный лист</h2>
              <p className="mt-3 text-slate-400">
                Расчетный лист за апрель. Детализация начислений будет доступна после закрытия периода.
              </p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
