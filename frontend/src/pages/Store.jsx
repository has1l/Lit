import { Check, Infinity, Loader2, Package, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import { useAuth } from '../store/AuthContext.jsx';
import {
  approveRequest, createStoreItem, declineRequest,
  deleteStoreItem, fetchStoreItems, fetchStoreRequests, purchaseItem,
} from '../api/store.js';
import { fetchGamificationStats } from '../api/goals.js';

const DIFFICULTY_COLORS = {
  easy:   'text-green-400 bg-green-500/10 ring-green-400/25',
  medium: 'text-yellow-300 bg-yellow-500/10 ring-yellow-400/25',
  hard:   'text-red-400 bg-red-500/10 ring-red-400/25',
};

function AddItemModal({ onClose, onCreate }) {
  const [title, setTitle]       = useState('');
  const [desc, setDesc]         = useState('');
  const [cost, setCost]         = useState(100);
  const [qty, setQty]           = useState(-1);
  const [saving, setSaving]     = useState(false);

  async function handleSave() {
    if (!title.trim() || cost <= 0) return;
    setSaving(true);
    const item = await createStoreItem({
      title: title.trim(), description: desc.trim(),
      cost_points: Number(cost), quantity: Number(qty),
    }).catch(() => null);
    setSaving(false);
    if (item) onCreate(item);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <Card className="w-full max-w-md">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold text-white">Новый товар</h2>
          <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-800 text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название"
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-white outline-none placeholder:text-slate-500 focus:border-purple-500" />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Описание (необязательно)" rows={2}
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-white outline-none placeholder:text-slate-500 focus:border-purple-500 resize-none" />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-slate-400">Стоимость (очки)</label>
              <input type="number" min={1} value={cost} onChange={(e) => setCost(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-white outline-none focus:border-purple-500" />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-slate-400">Количество (-1 = ∞)</label>
              <input type="number" min={-1} value={qty} onChange={(e) => setQty(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-white outline-none focus:border-purple-500" />
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Добавить'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function Store() {
  const { user } = useAuth();
  const role = user?.role || 'employee';
  const isManager = role === 'manager' || role === 'hr';

  const [items, setItems]           = useState([]);
  const [requests, setRequests]     = useState([]);
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [showAdd, setShowAdd]       = useState(false);
  const [purchasing, setPurchasing] = useState(null);
  const [tab, setTab]               = useState('shop');
  const [toast, setToast]           = useState(null);

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    Promise.all([
      fetchStoreItems(),
      fetchStoreRequests(),
      fetchGamificationStats(),
    ]).then(([i, r, s]) => {
      setItems(i);
      setRequests(r);
      setStats(s);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handlePurchase(item) {
    if (item.my_request?.status === 'pending') return;
    if (item.available === 0) return;
    if (stats && stats.points_total < item.cost_points) {
      showToast(`Не хватает очков: нужно ${item.cost_points}, у вас ${stats.points_total}`, false);
      return;
    }
    setPurchasing(item.id);
    try {
      const res = await purchaseItem(item.id);
      setStats((s) => s ? { ...s, points_total: res.points_remaining } : s);
      setItems((prev) => prev.map((i) =>
        i.id === item.id ? { ...i, my_request: { id: res.request.id, status: 'pending' } } : i
      ));
      showToast('Заявка отправлена! Ожидайте одобрения.');
    } catch (e) {
      showToast(e?.message || 'Ошибка при покупке', false);
    } finally {
      setPurchasing(null);
    }
  }

  async function handleDelete(id) {
    await deleteStoreItem(id).catch(() => {});
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function handleApprove(reqId) {
    const updated = await approveRequest(reqId).catch(() => null);
    if (updated) setRequests((prev) => prev.map((r) => r.id === reqId ? { ...r, status: 'approved' } : r));
  }

  async function handleDecline(reqId) {
    const updated = await declineRequest(reqId).catch(() => null);
    if (updated) setRequests((prev) => prev.map((r) => r.id === reqId ? { ...r, status: 'declined' } : r));
  }

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-10 text-slate-400">
        <Loader2 size={20} className="animate-spin" />
        <span>Загрузка магазина...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed inset-x-3 bottom-24 z-50 rounded-2xl px-5 py-3 text-sm font-semibold shadow-xl sm:inset-x-auto sm:bottom-6 sm:right-6 ${
          toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Шапка */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="metric-label">Магазин наград</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-4xl">
              Потрать баллы с пользой
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Обменивай заработанные очки на реальные бонусы — абонементы, мерч, привилегии.
            </p>
          </div>
          {stats && (
            <div className="shrink-0 rounded-2xl bg-purple-600/15 px-5 py-4 text-right ring-1 ring-purple-400/25">
              <p className="text-3xl font-bold text-white">{stats.points_total}</p>
              <p className="text-xs font-semibold uppercase tracking-widest text-purple-300">очков</p>
            </div>
          )}
        </div>
      </Card>

      {/* Вкладки */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setTab('shop')}
          className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
            tab === 'shop' ? 'bg-purple-600/20 text-purple-200 ring-1 ring-purple-400/30' : 'text-slate-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2"><ShoppingBag size={16} />Каталог</span>
        </button>
        {isManager && (
          <button
            onClick={() => setTab('requests')}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
              tab === 'requests' ? 'bg-purple-600/20 text-purple-200 ring-1 ring-purple-400/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <Package size={16} />Заявки
              {pendingCount > 0 && (
                <span className="rounded-full bg-purple-600 px-2 py-0.5 text-xs text-white">{pendingCount}</span>
              )}
            </span>
          </button>
        )}
        {!isManager && (
          <button
            onClick={() => setTab('requests')}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
              tab === 'requests' ? 'bg-purple-600/20 text-purple-200 ring-1 ring-purple-400/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2"><Package size={16} />Мои заявки</span>
          </button>
        )}
      </div>

      {/* Каталог */}
      {tab === 'shop' && (
        <div className="space-y-4">
          {isManager && (
            <div className="flex justify-end">
              <Button onClick={() => setShowAdd(true)} className="w-full gap-2 sm:w-auto">
                <Plus size={16} />Добавить товар
              </Button>
            </div>
          )}

          {items.length === 0 ? (
            <Card>
              <div className="py-8 text-center">
                <ShoppingBag size={40} className="mx-auto text-slate-600" />
                <p className="mt-4 font-semibold text-white">Магазин пуст</p>
                <p className="mt-2 text-sm text-slate-400">Руководитель добавит товары в ближайшее время.</p>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => {
                const canBuy = stats && stats.points_total >= item.cost_points && item.available !== 0;
                const isPending = item.my_request?.status === 'pending';
                const isApproved = item.my_request?.status === 'approved';
                const outOfStock = item.available === 0;

                return (
                  <div
                    key={item.id}
                    className="relative flex flex-col rounded-3xl border border-slate-700 bg-slate-950/45 p-5 transition hover:border-purple-400/30"
                  >
                    {isManager && (
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-xl text-slate-600 hover:bg-red-500/10 hover:text-red-400 transition"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}

                    <div className="flex items-start gap-3">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-purple-600/12 text-purple-200 ring-1 ring-purple-400/20">
                        <ShoppingBag size={22} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-white leading-tight">{item.title}</h3>
                        {item.description && (
                          <p className="mt-1 text-sm text-slate-400 leading-5">{item.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-2xl font-bold text-white">{item.cost_points}</span>
                        <span className="ml-1 text-xs font-semibold uppercase tracking-widest text-slate-400">очков</span>
                      </div>
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        {item.available === -1 ? <><Infinity size={13} /> ∞</> : `${item.available} шт.`}
                      </span>
                    </div>

                    <div className="mt-4">
                      {isApproved ? (
                        <div className="flex items-center gap-2 rounded-2xl bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-400 ring-1 ring-green-400/20">
                          <Check size={16} />Одобрено
                        </div>
                      ) : isPending ? (
                        <div className="rounded-2xl bg-yellow-500/10 px-4 py-2 text-sm font-semibold text-yellow-300 ring-1 ring-yellow-400/20">
                          Заявка на рассмотрении
                        </div>
                      ) : outOfStock ? (
                        <div className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-500">
                          Закончилось
                        </div>
                      ) : (
                        <Button
                          className="w-full"
                          onClick={() => handlePurchase(item)}
                          disabled={!canBuy || purchasing === item.id}
                        >
                          {purchasing === item.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : canBuy ? 'Получить' : 'Не хватает очков'}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Заявки */}
      {tab === 'requests' && (
        <Card>
          <h2 className="text-xl font-bold text-white">{isManager ? 'Заявки на награды' : 'Мои заявки'}</h2>
          <div className="mt-5 space-y-3">
            {requests.length === 0 ? (
              <p className="text-sm text-slate-500">Заявок нет.</p>
            ) : (
              requests.map((req) => (
                <div key={req.id} className="flex flex-col gap-3 rounded-2xl border border-slate-700 bg-slate-950/45 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white">{req.item_title}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      {isManager ? req.employee_name : 'Вы'} · {req.cost_points} очков · {req.created_at?.slice(0, 10)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
                    {req.status === 'pending' ? (
                      isManager ? (
                        <>
                          <button
                            onClick={() => handleApprove(req.id)}
                            className="rounded-xl bg-green-600/15 px-3 py-1.5 text-sm font-semibold text-green-300 ring-1 ring-green-400/25 hover:bg-green-600/25 transition"
                          >
                            Одобрить
                          </button>
                          <button
                            onClick={() => handleDecline(req.id)}
                            className="rounded-xl bg-red-600/10 px-3 py-1.5 text-sm font-semibold text-red-400 ring-1 ring-red-400/20 hover:bg-red-600/20 transition"
                          >
                            Отклонить
                          </button>
                        </>
                      ) : (
                        <span className="rounded-full bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-yellow-300 ring-1 ring-yellow-400/20">
                          На рассмотрении
                        </span>
                      )
                    ) : req.status === 'approved' ? (
                      <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-400 ring-1 ring-green-400/20">
                        Одобрено
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400 ring-1 ring-red-400/20">
                        Отклонено
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {showAdd && (
        <AddItemModal
          onClose={() => setShowAdd(false)}
          onCreate={(item) => { setItems((prev) => [...prev, { ...item, my_request: null, available: item.quantity }]); setShowAdd(false); }}
        />
      )}
    </div>
  );
}
