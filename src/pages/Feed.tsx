import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { ArrowLeft, ArrowDownRight, FileText, Search, X, Calendar, Filter, Download } from 'lucide-react';
import { formatTime } from '../utils/dateUtils';
import { WaybillModal } from '../components/waybills/WaybillModal';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { exportFeedToExcel } from '../utils/exportFeedToExcel';
import { showErrorNotification, showSuccessNotification } from '../utils/notifications';
import { useFeedPaginated } from '../hooks/useFeedPaginated';
import { API_CONFIG } from '../config/api';

const EXPORT_PAGE_SIZE = 500;
const LARGE_EXPORT_WARNING_THRESHOLD = 20000;

/** Нормализует дату транзакции из API (строка → { seconds, nanoseconds }) */
function normalizeTransactionForExport(t: Record<string, unknown>): Record<string, unknown> {
  if (t.date && typeof t.date === 'string') {
    const ms = new Date(t.date).getTime();
    return { ...t, date: { seconds: Math.floor(ms / 1000), nanoseconds: 0 } };
  }
  return t;
}

/**
 * Загружает все транзакции за период пагинированными запросами к API.
 * Без выбранных дат (allPeriod) запрашивает все транзакции.
 * Если передан entityId — только транзакции выбранной сущности (проект/клиент/иконка или "general").
 */
async function fetchAllTransactionsForExport(
  params: {
    dateFrom?: string | null;
    dateTo?: string | null;
    allPeriod: boolean;
    entityId?: string | null;
  },
  onProgress?: (count: number) => void
): Promise<Transaction[]> {
  const base = (API_CONFIG.BASE_URL || '').replace(/\/$/, '');
  const allTransactions: Transaction[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const searchParams = new URLSearchParams();
    searchParams.set('limit', String(EXPORT_PAGE_SIZE));
    searchParams.set('offset', String(offset));
    if (params.entityId) {
      searchParams.set('entityId', params.entityId);
    }
    if (!params.allPeriod) {
      if (params.dateFrom) searchParams.set('dateFrom', params.dateFrom);
      if (params.dateTo) searchParams.set('dateTo', params.dateTo);
    }
    const url = `${base}/api/transactions?${searchParams.toString()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Ошибка загрузки данных: ${response.status}`);
    const data = await response.json();
    const list = Array.isArray(data) ? data : (data.data ?? data.items ?? []);
    list.forEach((item: Record<string, unknown>) => {
      allTransactions.push(normalizeTransactionForExport(item) as Transaction);
    });
    onProgress?.(allTransactions.length);
    if (list.length < EXPORT_PAGE_SIZE) hasMore = false;
    else offset += EXPORT_PAGE_SIZE;
  }
  return allTransactions;
}

interface Transaction {
  id: string;
  fromUser: string;
  toUser: string;
  amount: number;
  description: string;
  date: {
    seconds: number;
    nanoseconds: number;
  };
  type: 'income' | 'expense';
  categoryId: string;
  waybillId?: string;
  waybillType?: 'income' | 'expense';
  waybillNumber?: string;
  waybillData?: {
    documentNumber: string;
    date: any;
    supplier?: string;
    project?: string;
    note: string;
    items: Array<{
      product: {
        name: string;
        unit: string;
      };
      quantity: number;
      price: number;
    }>;
  };
}

interface WaybillData {
  documentNumber: string;
  date: any;
  supplier: string;
  project?: string;
  note: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
    unit: string;
  }>;
}

export const Feed: React.FC = () => {
  console.log('Feed mounted');
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();
  
  // Используем оптимизированный хук для пагинированной загрузки
  const {
    transactions: paginatedTransactions,
    loading: paginatedLoading,
    hasMore,
    loadMore,
    totalCount
  } = useFeedPaginated({
    defaultDays: 60,
    pageSize: 50,
    enabled: !!user && !!isAdmin && !authLoading
  });

  const [selectedWaybill, setSelectedWaybill] = useState<WaybillData | null>(null);
  const [showWaybill, setShowWaybill] = useState(false);
  const [waybillType, setWaybillType] = useState<'income' | 'expense'>('expense');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null
  });
  const [showCalendar, setShowCalendar] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFromDate, setExportFromDate] = useState<string>('');
  const [exportToDate, setExportToDate] = useState<string>('');
  const [exportAllPeriod, setExportAllPeriod] = useState(false);
  const [exportError, setExportError] = useState<string>('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [pendingLargeExport, setPendingLargeExport] = useState<{
    transactions: Transaction[];
    fromDate: Date | null;
    toDate: Date | null;
    allPeriod: boolean;
    currentFilters: { searchQuery?: string; minAmount?: string; maxAmount?: string };
  } | null>(null);

  useEffect(() => {
    // Ждем завершения проверки авторизации
    if (authLoading) {
      return;
    }

    // Если пользователь не авторизован, перенаправляем на логин
    if (!user) {
      navigate('/login');
      return;
    }

    // Если пользователь не админ, перенаправляем на главную
    if (!isAdmin) {
      navigate('/');
      return;
    }
  }, [user, isAdmin, authLoading, navigate]);

  // ВСЕ ХУКИ ДОЛЖНЫ БЫТЬ ДО УСЛОВНЫХ RETURN
  const filteredTransactions = useMemo(() => {
    return paginatedTransactions.filter(transaction => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = (
      transaction.fromUser.toLowerCase().includes(searchLower) ||
      transaction.toUser.toLowerCase().includes(searchLower) ||
      transaction.description.toLowerCase().includes(searchLower) ||
      (transaction.waybillNumber && transaction.waybillNumber.toLowerCase().includes(searchLower)) ||
      Math.abs(transaction.amount).toString().includes(searchQuery)
    );

    const transactionDate = new Date(transaction.date.seconds * 1000);
    const matchesDateRange = (!dateRange.start || transactionDate >= dateRange.start) &&
                           (!dateRange.end || transactionDate <= dateRange.end);

    const amount = Math.abs(transaction.amount);
    const matchesAmountRange = (!minAmount || amount >= Number(minAmount)) &&
                             (!maxAmount || amount <= Number(maxAmount));

      return matchesSearch && matchesDateRange && matchesAmountRange;
    });
  }, [paginatedTransactions, searchQuery, dateRange, minAmount, maxAmount]);

  const runExportWithTransactions = useCallback(
    async (
      transactions: Transaction[],
      fromDate: Date | null,
      toDate: Date | null,
      allPeriod: boolean,
      filtersOverride?: { searchQuery?: string; minAmount?: string; maxAmount?: string }
    ) => {
      await exportFeedToExcel({
        transactions,
        fromDate,
        toDate,
        allPeriod,
        currentFilters: filtersOverride ?? {
          searchQuery: searchQuery || undefined,
          minAmount: minAmount || undefined,
          maxAmount: maxAmount || undefined,
        },
      });
      showSuccessNotification('Отчёт успешно экспортирован');
      setShowExportModal(false);
      setExportFromDate('');
      setExportToDate('');
      setExportAllPeriod(false);
      setPendingLargeExport(null);
    },
    [searchQuery, minAmount, maxAmount]
  );

  const formatDate = (timestamp: { seconds: number; nanoseconds: number }) => {
    const date = new Date(timestamp.seconds * 1000);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'СЕГОДНЯ';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'ВЧЕРА';
    } else {
      return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long'
      }).toUpperCase();
    }
  };

  const groupTransactionsByDate = () => {
    const grouped: { [key: string]: { transactions: Transaction[], total: number } } = {};
    filteredTransactions.forEach(transaction => {
      const dateKey = formatDate(transaction.date);
      if (!grouped[dateKey]) {
        grouped[dateKey] = { transactions: [], total: 0 };
      }
      grouped[dateKey].transactions.push(transaction);
      grouped[dateKey].total += Math.abs(transaction.amount);
    });
    return grouped;
  };

  // Показываем загрузку, пока проверяется авторизация (ПОСЛЕ ВСЕХ ХУКОВ)
  if (authLoading || (paginatedLoading && paginatedTransactions.length === 0)) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  const handleWaybillClick = async (transaction: Transaction) => {
    if (!transaction.waybillData) return;
    
    setSelectedWaybill({
      documentNumber: transaction.waybillNumber || '',
      date: transaction.waybillData.date,
      supplier: transaction.waybillData.supplier || transaction.waybillData.project || '',
      note: transaction.waybillData.note || '',
      items: transaction.waybillData.items.map(item => ({
        id: '',
        name: item.product.name,
        quantity: item.quantity,
        price: item.price,
        unit: item.product.unit
      }))
    });
    setWaybillType(transaction.type === 'income' ? 'income' : 'expense');
    setShowWaybill(true);
  };

  const handleExportClick = () => {
    setShowExportModal(true);
    setExportError('');
    // Устанавливаем сегодняшнюю дату по умолчанию для "По"
    if (!exportToDate) {
      const today = new Date();
      setExportToDate(today.toISOString().split('T')[0]);
    }
  };

  const handleExportSubmit = async () => {
    setExportError('');

    if (!exportAllPeriod) {
      if (!exportFromDate) {
        setExportError('Укажите дату начала периода');
        return;
      }
      if (exportFromDate && exportToDate && new Date(exportFromDate) > new Date(exportToDate)) {
        setExportError('Дата начала не может быть позже даты окончания');
        return;
      }
    }

    setExportLoading(true);
    setExportProgress(0);

    try {
      const dateFrom = exportAllPeriod ? null : (exportFromDate || null);
      const dateTo = exportAllPeriod ? null : (exportToDate || null);
      const allTransactions = await fetchAllTransactionsForExport(
        { dateFrom, dateTo, allPeriod: exportAllPeriod },
        (count) => setExportProgress(count)
      );

      if (allTransactions.length === 0) {
        showErrorNotification('Нет данных для экспорта за выбранный период');
        setExportLoading(false);
        setExportProgress(0);
        return;
      }

      if (allTransactions.length > LARGE_EXPORT_WARNING_THRESHOLD) {
        setPendingLargeExport({
          transactions: allTransactions,
          fromDate: exportFromDate ? new Date(exportFromDate) : null,
          toDate: exportToDate ? new Date(exportToDate) : null,
          allPeriod: exportAllPeriod,
          currentFilters: {
            searchQuery: searchQuery || undefined,
            minAmount: minAmount || undefined,
            maxAmount: maxAmount || undefined,
          },
        });
        setExportLoading(false);
        setExportProgress(0);
        return;
      }

      const fromDateObj = exportFromDate ? new Date(exportFromDate) : null;
      const toDateObj = exportToDate ? new Date(exportToDate) : null;
      await runExportWithTransactions(allTransactions, fromDateObj, toDateObj, exportAllPeriod);
    } catch (error) {
      console.error('Error exporting feed:', error);
      showErrorNotification(error instanceof Error ? error.message : 'Ошибка при экспорте отчёта');
    } finally {
      setExportLoading(false);
      setExportProgress(0);
    }
  };

  const handleConfirmLargeExport = async () => {
    if (!pendingLargeExport) return;
    setExportLoading(true);
    try {
      await runExportWithTransactions(
        pendingLargeExport.transactions,
        pendingLargeExport.fromDate,
        pendingLargeExport.toDate,
        pendingLargeExport.allPeriod,
        pendingLargeExport.currentFilters
      );
    } catch (error) {
      console.error('Error exporting feed:', error);
      showErrorNotification(error instanceof Error ? error.message : 'Ошибка при экспорте отчёта');
    } finally {
      setExportLoading(false);
      setPendingLargeExport(null);
    }
  };

  const handleExportCancel = () => {
    setShowExportModal(false);
    setExportFromDate('');
    setExportToDate('');
    setExportAllPeriod(false);
    setExportError('');
  };

  const groupedTransactions = groupTransactionsByDate();

  return (
    <div className="relative">
      <div className="fixed top-0 left-0 sm:left-64 right-0 bg-white z-50 transition-all duration-300">
        <div className={`bg-white border-b transition-all duration-200 ${showSearch ? 'max-h-14' : 'max-h-0 overflow-hidden'}`}>
          <div className="px-4 py-2 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по операциям..."
                className="w-full pl-9 pr-4 py-2 text-sm border-0 focus:ring-0 bg-gray-50 rounded-lg"
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
            <button
              onClick={() => {
                setSearchQuery('');
                setShowSearch(false);
              }}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="bg-white border-b px-4 sm:px-6 py-3 flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center">
            <button onClick={() => window.history.back()} className="ml-14 sm:ml-0 mr-4">
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </button>
            <h1 className="text-xl font-semibold text-gray-900">Лента</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleExportClick}
              disabled={exportLoading}
              className={`px-3 py-2 rounded-lg transition-colors duration-200 flex items-center gap-2 text-sm ${
                exportLoading
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-emerald-500 text-white hover:bg-emerald-600'
              }`}
              title={exportLoading ? 'Идёт экспорт...' : 'Скачать отчёт в Excel'}
            >
              {exportLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-500" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{exportLoading ? 'Экспорт...' : 'Скачать отчёт'}</span>
            </button>
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="p-2 hover:bg-gray-100 rounded-full"
            >
              <Search className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto bg-gray-100 min-h-screen pt-28 sm:pl-64">
        <div className="relative">
          {/* Правая колонка - статистика и фильтры */}
          <div className="hidden lg:block lg:fixed lg:right-6 lg:w-[400px]">
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Фильтры</h2>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="p-2 hover:bg-gray-100 rounded-full"
                  >
                    <Filter className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
                
                <div className={`space-y-4 ${showFilters ? 'block' : 'hidden'}`}>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Период
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowCalendar(!showCalendar)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 flex items-center justify-between"
                      >
                        <span className="text-sm text-gray-700">
                          {dateRange.start && dateRange.end
                            ? `${dateRange.start.toLocaleDateString('ru-RU')} - ${dateRange.end.toLocaleDateString('ru-RU')}`
                            : 'Выберите период'}
                        </span>
                        <Calendar className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                    {showCalendar && (
                      <div className="mt-2 p-4 bg-white border rounded-lg shadow-lg">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Начальная дата
                            </label>
                            <input
                              type="date"
                              value={dateRange.start ? dateRange.start.toISOString().split('T')[0] : ''}
                              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value ? new Date(e.target.value) : null }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Конечная дата
                            </label>
                            <input
                              type="date"
                              value={dateRange.end ? dateRange.end.toISOString().split('T')[0] : ''}
                              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value ? new Date(e.target.value) : null }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Сумма
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        placeholder="От"
                        value={minAmount}
                        onChange={(e) => setMinAmount(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                      <input
                        type="number"
                        placeholder="До"
                        value={maxAmount}
                        onChange={(e) => setMaxAmount(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setDateRange({ start: null, end: null });
                        setMinAmount('');
                        setMaxAmount('');
                      }}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                    >
                      Сбросить
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Статистика</h2>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500">Всего транзакций</p>
                    <p className="text-2xl font-semibold text-gray-900">{filteredTransactions.length}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Общая сумма</p>
                    <p className="text-2xl font-semibold text-red-600">
                      -{Math.round(filteredTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0)).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₸
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Левая колонка - список транзакций */}
          <div className="lg:mr-[424px]">
            <div className="space-y-6 mb-6 lg:mb-0">
              <div className="divide-y divide-gray-200">
                {Object.entries(groupTransactionsByDate()).map(([date, { transactions: dayTransactions }]) => {
                  // Используем уже отфильтрованные транзакции
                  const filteredDayTransactions = dayTransactions;

                  if (filteredDayTransactions.length === 0) return null;

                  const filteredTotal = filteredDayTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

                  return (
                    <div key={date} className="bg-white rounded-lg shadow-sm overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3">
                        <div className="flex justify-between items-center">
                          <h2 className="text-sm font-medium text-gray-500">{date}</h2>
                          <span className="text-sm font-medium text-gray-900">
                            {Math.round(filteredTotal).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₸
                          </span>
                        </div>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {filteredDayTransactions.map((transaction) => (
                          <div key={transaction.id} className="px-4 py-4 hover:bg-gray-50 transition-colors">
                            <div className="flex justify-between items-start">
                              <div className="flex items-start space-x-3">
                                <div className="mt-1">
                                  <ArrowDownRight className="w-5 h-5 text-red-500" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-medium text-gray-900">{transaction.fromUser}</span>
                                  <span className="text-sm text-gray-500 mt-1">{transaction.toUser}</span>
                                  {transaction.waybillNumber && (
                                    <button
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleWaybillClick(transaction);
                                      }}
                                      className="flex items-center text-xs text-blue-600 hover:text-blue-700 mt-1 group"
                                    >
                                      <FileText className="w-3 h-3 mr-1 group-hover:scale-110 transition-transform" />
                                      Накладная №{transaction.waybillNumber}
                                    </button>
                                  )}
                                  <span className="text-xs text-gray-400 mt-1">
                                    {formatTime(transaction.date)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="font-medium text-base text-red-600">
                                  -{Math.round(Math.abs(transaction.amount)).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₸
                                </span>
                                <span className="text-sm text-gray-500 mt-1 text-right">
                                  {transaction.description}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="px-4 py-3 bg-gray-50 border-t">
                        <div className="flex justify-end">
                          <span className="text-sm font-medium text-gray-500">
                            Итого за день: {Math.round(filteredTotal).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₸
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {/* Кнопка загрузки дополнительных данных */}
                {hasMore && (
                  <div className="flex justify-center py-4 bg-white rounded-lg shadow-sm">
                    <button
                      onClick={loadMore}
                      disabled={paginatedLoading}
                      className="px-6 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                      {paginatedLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Загрузка...</span>
                        </>
                      ) : (
                        <span>Загрузить ещё</span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {!paginatedLoading && filteredTransactions.length === 0 && (
          <div className="text-center py-12 px-4">
            {searchQuery ? (
              <>
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <Search className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">Ничего не найдено</h3>
                <p className="text-gray-500">Попробуйте изменить параметры поиска</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <ArrowDownRight className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">История операций пуста</h3>
                <p className="text-gray-500">Здесь будут отображаться все операции</p>
              </>
            )}
          </div>
        )}

        {showWaybill && selectedWaybill && createPortal(
          <WaybillModal
            isOpen={showWaybill}
            onClose={() => {
              setShowWaybill(false);
              setSelectedWaybill(null);
            }}
            data={selectedWaybill}
            type={waybillType}
          />,
          document.body
        )}

        {/* Предупреждение о большом объёме экспорта (> 20000 записей) */}
        {pendingLargeExport && createPortal(
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]"
            onClick={() => setPendingLargeExport(null)}
          >
            <div
              className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Большой объём данных</h2>
              <p className="text-sm text-gray-600 mb-4">
                Загружено записей: <strong>{pendingLargeExport.transactions.length.toLocaleString('ru-RU')}</strong>.
                Экспорт такого объёма может занять время и замедлить приложение. Продолжить?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setPendingLargeExport(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Отмена
                </button>
                <button
                  onClick={handleConfirmLargeExport}
                  disabled={exportLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-md hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-2"
                >
                  {exportLoading && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />}
                  Продолжить
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Модальное окно экспорта */}
        {showExportModal && createPortal(
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={handleExportCancel}
          >
            <div 
              className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">Экспорт ленты в Excel</h2>
                  <button
                    onClick={handleExportCancel}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {exportError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{exportError}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportAllPeriod}
                        onChange={(e) => {
                          setExportAllPeriod(e.target.checked);
                          setExportError('');
                        }}
                        className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Выгрузить все операции (без ограничения по датам)
                      </span>
                    </label>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        С какой даты
                      </label>
                      <input
                        type="date"
                        value={exportFromDate}
                        onChange={(e) => {
                          setExportFromDate(e.target.value);
                          setExportError('');
                        }}
                        disabled={exportAllPeriod}
                        className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                          exportAllPeriod ? 'bg-gray-100 cursor-not-allowed' : ''
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        По какую дату
                      </label>
                      <input
                        type="date"
                        value={exportToDate}
                        onChange={(e) => {
                          setExportToDate(e.target.value);
                          setExportError('');
                        }}
                        disabled={exportAllPeriod}
                        className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                          exportAllPeriod ? 'bg-gray-100 cursor-not-allowed' : ''
                        }`}
                      />
                      {!exportAllPeriod && !exportToDate && (
                        <p className="mt-1 text-xs text-gray-500">
                          Если не указано, будет использована сегодняшняя дата
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {exportLoading && (
                  <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-emerald-500 border-t-transparent" />
                    <span className="text-sm text-emerald-800">
                      Загрузка данных… {exportProgress > 0 && `Загружено записей: ${exportProgress.toLocaleString('ru-RU')}`}
                    </span>
                  </div>
                )}

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={handleExportCancel}
                    disabled={exportLoading}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleExportSubmit}
                    disabled={exportLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-md hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {exportLoading && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />}
                    Скачать
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
};