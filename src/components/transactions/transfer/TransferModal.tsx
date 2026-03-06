import React, { useState, useCallback, useEffect, useRef } from 'react';
import { CategoryCardType } from '../../../types';
import { transferFunds } from '../../../lib/firebase/transactions';
import {
  createExpenseCategory,
  updateExpenseCategory,
  ensureDefaultExpenseCategory,
  DEFAULT_EXPENSE_CATEGORY_NAME
} from '../../../lib/firebase/expenseCategories';
import { showErrorNotification, showSuccessNotification } from '../../../utils/notifications';
import { XMarkIcon, PencilIcon } from '@heroicons/react/24/outline';
import { useDropzone } from 'react-dropzone';
import { supabase } from '../../../lib/supabase/config';
import { PaperclipIcon, SendHorizontal } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { useExpenseCategories } from '../../../hooks/useExpenseCategories';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { ExpenseCategoryMobilePicker } from '../../ExpenseCategoryMobilePicker';
import { ExpenseCategoryManageModal } from '../../ExpenseCategoryManageModal';
import type { ExpenseCategory } from '../../../types/expenseCategory';

interface TransferModalProps {
  sourceCategory: CategoryCardType;
  targetCategory: CategoryCardType;
  isOpen: boolean;
  onClose: () => void;
}

interface FileUpload {
  file: File;
  progress: number;
  url?: string;
}

const CREATE_NEW_ID = '__create_new_expense_category__';

export const TransferModal: React.FC<TransferModalProps> = ({
  sourceCategory,
  targetCategory,
  isOpen,
  onClose
}) => {
  const { user } = useAuth();
  const { categories: expenseCategories } = useExpenseCategories(user?.uid);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSalary, setIsSalary] = useState(false);
  const [isCashless, setIsCashless] = useState(false);
  const [expenseCategoryId, setExpenseCategoryId] = useState<string>('');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [expenseDropdownOpen, setExpenseDropdownOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [updatingCategory, setUpdatingCategory] = useState(false);
  const [mobilePickerOpen, setMobilePickerOpen] = useState(false);
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const expenseDropdownRef = useRef<HTMLDivElement>(null);
  const hasSetDefaultCategoryForOpen = useRef(false);
  const isMobile = useIsMobile(768);

  const isFromTopRow =
    sourceCategory.type === 'employee' || sourceCategory.type === 'company' ||
    (sourceCategory.row === 1 || sourceCategory.row === 2);
  const isToGeneralExpense =
    targetCategory.type === 'general_expense' || targetCategory.title === 'Общ Расх';
  const showExpenseCategory = isFromTopRow && isToGeneralExpense;

  // Категория "Прочее" по умолчанию только при открытии модалки (не при каждом обновлении списка)
  useEffect(() => {
    if (!isOpen) {
      hasSetDefaultCategoryForOpen.current = false;
      return;
    }
    if (!showExpenseCategory || !user?.uid || expenseCategories.length === 0) return;
    if (hasSetDefaultCategoryForOpen.current) return;
    hasSetDefaultCategoryForOpen.current = true;
    const other = expenseCategories.find((c) => c.name === DEFAULT_EXPENSE_CATEGORY_NAME);
    if (other) {
      setExpenseCategoryId(other.id);
      return;
    }
    ensureDefaultExpenseCategory(user.uid).then((id) => {
      setExpenseCategoryId(id);
    }).catch((err) => {
      console.error('ensureDefaultExpenseCategory:', err);
    });
  }, [isOpen, showExpenseCategory, user?.uid, expenseCategories]);

  // Закрытие dropdown при клике снаружи
  useEffect(() => {
    if (!expenseDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (expenseDropdownRef.current && !expenseDropdownRef.current.contains(e.target as Node)) {
        setExpenseDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [expenseDropdownOpen]);

  const selectedExpenseCategory = expenseCategories.find((c) => c.id === expenseCategoryId);

  const handleStartEdit = (cat: ExpenseCategory) => {
    setEditingCategoryId(cat.id);
    setEditingName(cat.name);
  };

  const handleSaveEdit = async () => {
    if (editingCategoryId == null || !editingName.trim()) {
      setEditingCategoryId(null);
      return;
    }
    setUpdatingCategory(true);
    try {
      await updateExpenseCategory(editingCategoryId, editingName.trim());
      setEditingCategoryId(null);
      setEditingName('');
    } catch (err) {
      showErrorNotification(err instanceof Error ? err.message : 'Ошибка обновления категории');
    } finally {
      setUpdatingCategory(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingCategoryId(null);
    setEditingName('');
  };

  // Функция для форматирования числа с разделителями
  const formatNumber = (value: string) => {
    // Убираем все пробелы и буквы, оставляем только цифры и точку
    const numbers = value.replace(/[^\d.]/g, '');
    
    // Разделяем на целую и дробную части
    const parts = numbers.split('.');
    const wholePart = parts[0];
    const decimalPart = parts[1];

    // Форматируем целую часть, добавляя пробелы
    const formattedWholePart = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    // Возвращаем отформатированное число
    return decimalPart !== undefined 
      ? `${formattedWholePart}.${decimalPart}`
      : formattedWholePart;
  };

  // Функция для очистки форматирования перед отправкой
  const cleanNumber = (value: string) => {
    return value.replace(/\s/g, '');
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const formatted = formatNumber(value);
    setAmount(formatted);
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    console.log('Accepted files:', acceptedFiles);
    const newFiles = acceptedFiles.map(file => ({
      file,
      progress: 0
    }));
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg'],
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5
  });

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedAmount = cleanNumber(amount);
    if (!cleanedAmount || parseFloat(cleanedAmount) <= 0) {
      setError('Сумма должна быть больше нуля');
      return;
    }
    if (showExpenseCategory && !expenseCategoryId) {
      setError('Выберите категорию расхода');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Загружаем файлы в Supabase Storage
      const uploadedFiles = await Promise.all(
        files.map(async ({ file }, index) => {
          const timestamp = Date.now();
          const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const path = `transactions/${sourceCategory.id}/${timestamp}-${safeName}`;
          
          try {
            console.log('Uploading file:', { name: file.name, path });
            const { data, error } = await supabase.storage
              .from('transactions')
              .upload(path, file, {
                cacheControl: '3600',
                upsert: true
              });

            if (error) {
              console.error('Supabase upload error:', error);
              throw error;
            }

            if (!data?.path) {
              throw new Error('Upload successful but no path returned');
            }

            // Получаем публичный URL файла
            const { data: { publicUrl } } = supabase.storage
              .from('transactions')
              .getPublicUrl(data.path);

            console.log('File uploaded successfully:', publicUrl);
            
            // Обновляем прогресс
            setFiles(prev => 
              prev.map((f, i) => 
                i === index ? { ...f, progress: 100 } : f
              )
            );

            return {
              name: file.name,
              url: publicUrl,
              type: file.type,
              size: file.size,
              path: data.path
            };
          } catch (error) {
            console.error('Error uploading file:', error);
            showErrorNotification(`Ошибка при загрузке файла ${file.name}: ${error.message}`);
            throw error;
          }
        })
      );

      await transferFunds({
        sourceCategory,
        targetCategory,
        amount: parseFloat(cleanedAmount),
        description,
        attachments: uploadedFiles,
        waybillNumber: '',
        waybillData: {},
        isSalary,
        isCashless,
        expenseCategoryId: showExpenseCategory ? expenseCategoryId || undefined : undefined
      });

      showSuccessNotification('Перевод успешно выполнен');
      onClose();
    } catch (error) {
      console.error('Error in transfer:', error);
      setError(error instanceof Error ? error.message : 'Произошла ошибка при переводе');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start md:items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white rounded-lg w-full max-w-lg md:mt-0 mt-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-xl font-medium">Перевод средств</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="mb-6 space-y-1 sticky top-[72px] bg-white z-10 pb-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">От: {sourceCategory.title}</span>
              <span className="text-gray-600">Кому: {targetCategory.title}</span>
            </div>
            <div className="text-sm text-gray-500">
              Текущий баланс: {formatNumber(sourceCategory.amount.toString())}₸
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Сумма перевода
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={handleAmountChange}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="1 000 000"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Комментарий к переводу
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Укажите назначение перевода"
                rows={3}
              />
            </div>

            {showExpenseCategory && (
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Категория расхода
                </label>
                {!showNewCategoryInput ? (
                  <>
                    {/* Desktop: dropdown с редактированием */}
                    <div ref={expenseDropdownRef} className="hidden md:block relative">
                      <button
                        type="button"
                        onClick={() => setExpenseDropdownOpen((v) => !v)}
                        className="w-full px-3 py-2 border rounded-lg text-left bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex items-center justify-between"
                      >
                        <span className={expenseCategoryId ? 'text-gray-900' : 'text-gray-500'}>
                          {selectedExpenseCategory?.name ?? 'Выберите категорию'}
                        </span>
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {expenseDropdownOpen && (
                        <div className="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {expenseCategories.map((cat) => (
                            <div
                              key={cat.id}
                              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                            >
                              {editingCategoryId === cat.id ? (
                                <>
                                  <input
                                    type="text"
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveEdit();
                                      if (e.key === 'Escape') handleCancelEdit();
                                    }}
                                    className="flex-1 px-2 py-1 border rounded text-sm"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    disabled={updatingCategory}
                                    onClick={handleSaveEdit}
                                    className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                    title="Сохранить"
                                  >
                                    {updatingCategory ? '…' : '✓'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                                    title="Отмена"
                                  >
                                    ✕
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExpenseCategoryId(cat.id);
                                      setExpenseDropdownOpen(false);
                                    }}
                                    className="flex-1 text-left text-sm text-gray-900"
                                  >
                                    {cat.name}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartEdit(cat);
                                    }}
                                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                                    title="Редактировать"
                                  >
                                    <PencilIcon className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              setShowNewCategoryInput(true);
                              setExpenseDropdownOpen(false);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50"
                          >
                            + Создать новую категорию
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Mobile: кнопка-триггер → открывает bottom sheet picker */}
                    <div className="md:hidden">
                      <button
                        type="button"
                        onClick={() => setMobilePickerOpen(true)}
                        className="w-full px-4 py-3 border rounded-xl text-left bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex items-center justify-between min-h-[48px]"
                      >
                        <span className={expenseCategoryId ? 'text-gray-900 font-medium' : 'text-gray-500'}>
                          {selectedExpenseCategory?.name ?? 'Выберите категорию'}
                        </span>
                        <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    <ExpenseCategoryMobilePicker
                      isOpen={mobilePickerOpen}
                      onClose={() => setMobilePickerOpen(false)}
                      categories={expenseCategories}
                      selectedId={expenseCategoryId}
                      onSelect={setExpenseCategoryId}
                      onCreateNew={() => setShowNewCategoryInput(true)}
                      onManage={() => setManageModalOpen(true)}
                    />
                    <ExpenseCategoryManageModal
                      isOpen={manageModalOpen}
                      onClose={() => setManageModalOpen(false)}
                      categories={expenseCategories}
                    />
                  </>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Название категории"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={creatingCategory || !newCategoryName.trim()}
                        onClick={async () => {
                          if (!user?.uid || !newCategoryName.trim()) return;
                          setCreatingCategory(true);
                          try {
                            const id = await createExpenseCategory(newCategoryName.trim(), user.uid);
                            setExpenseCategoryId(id);
                            setShowNewCategoryInput(false);
                            setNewCategoryName('');
                          } catch (err) {
                            showErrorNotification(err instanceof Error ? err.message : 'Ошибка создания категории');
                          } finally {
                            setCreatingCategory(false);
                          }
                        }}
                        className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                      >
                        {creatingCategory ? 'Сохранение...' : 'Сохранить'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewCategoryInput(false);
                          setNewCategoryName('');
                        }}
                        className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-4">
              <label className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={isSalary}
                  onChange={(e) => setIsSalary(e.target.checked)}
                  className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                />
                <span className="text-gray-700">ЗП</span>
              </label>
              <label className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={isCashless}
                  onChange={(e) => setIsCashless(e.target.checked)}
                  className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                />
                <span className="text-gray-700">Безнал</span>
              </label>
              
              {/* Мобильные кнопки */}
              <div className="md:hidden flex items-center gap-4 ml-auto">
                <button
                  type="button"
                  {...getRootProps()}
                  className="p-2 text-gray-600 hover:text-gray-900 bg-gray-100 rounded-full"
                >
                  <PaperclipIcon className="h-5 w-5" />
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className={`p-2 text-white rounded-full
                    ${loading
                      ? 'bg-blue-400 cursor-not-allowed'
                      : 'bg-blue-500 hover:bg-blue-600'
                    }`}
                >
                  <SendHorizontal className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Десктопная версия кнопок */}
            <div className="hidden md:block">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Прикрепить файлы
                </label>
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg cursor-pointer transition-colors
                    ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
                    p-4`}
                >
                  <input {...getInputProps()} />
                  {/* Desktop и планшетная версия */}
                  <div className="hidden md:flex flex-col items-center justify-center">
                    <svg
                      className="mx-auto h-12 w-12 text-gray-400"
                      stroke="currentColor"
                      fill="none"
                      viewBox="0 0 48 48"
                    >
                      <path
                        d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <p className="mt-1 text-sm text-gray-600">
                      Перетащите файлы сюда или нажмите для выбора
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Поддерживаются изображения, PDF и документы Word (до 10MB)
                    </p>
                  </div>
                  {/* Мобильная версия */}
                  <div className="md:hidden flex items-center justify-center">
                    <svg
                      className="h-6 w-6 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Десктопная кнопка отправки */}
              <div className="hidden md:flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className={`px-4 py-2 text-white font-medium rounded-lg
                    ${loading
                      ? 'bg-blue-400 cursor-not-allowed'
                      : 'bg-blue-500 hover:bg-blue-600'
                    }`}
                >
                  {loading ? 'Выполняется...' : 'Выполнить перевод'}
                </button>
              </div>
            </div>

            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((file, index) => (
                  <div
                    key={file.file.name + index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {file.file.name}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="text-gray-400 hover:text-gray-500"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      </div>
                      <p className="text-xs text-gray-500">
                        {(file.file.size / 1024).toFixed(1)} KB
                      </p>
                      {file.progress > 0 && (
                        <div className="mt-1">
                          <div className="bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${file.progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {file.progress}%
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="text-sm text-red-500">{error}</div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
