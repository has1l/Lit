import { FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import { deleteDocument, fetchDocuments, uploadDocument } from '../api/documents.js';
import { useEmployeeData } from '../hooks/useEmployeeData.js';
import { formatFull } from '../lib/format.js';
import { useAuth } from '../store/AuthContext.jsx';

const AUDIENCE_OPTIONS = [
  { value: 'all',      label: 'Все сотрудники' },
  { value: 'managers', label: 'Только руководители' },
  { value: 'hr',       label: 'Только HR' },
];

const AUDIENCE_CHIP = {
  all:      'bg-blue-500/10 text-blue-300 ring-blue-400/30',
  managers: 'bg-yellow-500/10 text-yellow-300 ring-yellow-400/30',
  hr:       'bg-purple-500/10 text-purple-300 ring-purple-400/30',
};

function audienceLabel(val) {
  return AUDIENCE_OPTIONS.find((o) => o.value === val)?.label || val;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function UploadZone({ onUploaded }) {
  const fileRef = useRef();
  const [audience, setAudience] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const doc = await uploadDocument(file, audience);
      onUploaded(doc);
      e.target.value = '';
    } catch (err) {
      setError(err.message || 'Ошибка загрузки');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-bold text-white">Загрузить документ в базу знаний</h2>
      <div className="flex flex-col gap-3 sm:flex-row">
        <select
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          className="fintech-input rounded-2xl px-4 py-3 text-white outline-none"
        >
          {AUDIENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <Button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex-1 gap-2"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {uploading ? 'Загрузка…' : 'Выбрать файл'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.doc,.xlsx,.xls"
          className="hidden"
          onChange={handleFile}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">Форматы: PDF, DOCX, XLSX · Макс. 20 МБ</p>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </Card>
  );
}

export default function Documents() {
  const { user } = useAuth();
  const { data } = useEmployeeData();
  const isHrOrManager = user?.role === 'hr' || user?.role === 'manager';

  const [corpDocs, setCorpDocs]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  const hireDate = data?.profile?.hire_date ? formatFull(data.profile.hire_date) : '—';
  const currentYear = new Date().getFullYear();

  const personalDocs = [
    { title: 'Справка 2-НДФЛ',    date: `За ${currentYear} год`,              status: 'Готово'  },
    { title: 'Трудовой договор',   date: `Подписан ${hireDate}`,               status: 'Архив'   },
    { title: 'Полис ДМС',          date: `Действует до 31.12.${currentYear}`,  status: 'Активен' },
  ];

  useEffect(() => {
    fetchDocuments()
      .then(setCorpDocs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id) {
    setDeletingId(id);
    try {
      await deleteDocument(id);
      setCorpDocs((prev) => prev.filter((d) => d.id !== id));
    } catch {}
    setDeletingId(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="page-eyebrow">Документооборот</p>
        <h1 className="text-3xl font-bold tracking-tight text-white">Документы</h1>
        <p className="mt-2 text-slate-400">Корпоративная база знаний и HR-материалы.</p>
      </div>

      {isHrOrManager && (
        <UploadZone onUploaded={(doc) => setCorpDocs((prev) => [doc, ...prev])} />
      )}

      {/* Корпоративная база знаний */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Корпоративная база знаний
        </h2>

        {loading ? (
          <div className="flex items-center gap-3 py-8 text-slate-400">
            <Loader2 size={20} className="animate-spin" />Загрузка…
          </div>
        ) : corpDocs.length === 0 ? (
          <Card>
            <div className="py-8 text-center">
              <FileText size={32} className="mx-auto text-slate-600" />
              <p className="mt-3 text-slate-400">
                {isHrOrManager ? 'Загрузите первый документ' : 'Документов пока нет'}
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {corpDocs.map((doc) => (
              <Card key={doc.id} className="flex items-center gap-4">
                <div className="icon-tile h-11 w-11 shrink-0 rounded-2xl">
                  <FileText size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-white sm:text-base">{doc.filename}</p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500 sm:text-xs">
                    {doc.uploader_name || doc.uploaded_by} · {formatDate(doc.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`hidden rounded-full px-2 py-0.5 text-[10px] font-bold uppercase sm:inline-block ${AUDIENCE_CHIP[doc.audience] || AUDIENCE_CHIP.all}`}>
                    {audienceLabel(doc.audience)}
                  </span>
                  {isHrOrManager && (
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={deletingId === doc.id}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-800 text-slate-400 transition hover:text-red-400 disabled:opacity-50"
                    >
                      {deletingId === doc.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Trash2 size={14} />}
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Личные документы — только для сотрудников */}
      {!isHrOrManager && (
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Мои документы</h2>
          <div className="space-y-3">
            {personalDocs.map((document) => (
              <Card key={document.title} className="flex items-center gap-4">
                <div className="icon-tile h-11 w-11 shrink-0 rounded-2xl">
                  <FileText size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{document.title}</p>
                  <p className="text-sm text-slate-500">{document.date}</p>
                </div>
                <span className="status-chip shrink-0 rounded-full px-3 py-1 text-sm font-semibold">
                  {document.status}
                </span>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
