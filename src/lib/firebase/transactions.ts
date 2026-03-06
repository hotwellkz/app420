import { collection, doc, runTransaction, serverTimestamp, query, where, getDocs, writeBatch, getDoc, Timestamp, addDoc } from 'firebase/firestore';
import { db } from './config';
import { CategoryCardType } from '../../types';
import { formatAmount, parseAmount } from './categories';
import { sendTelegramNotification, formatTransactionMessage } from '../../services/telegramService';
import { Transaction } from '../../components/transactions/types';
import { deleteFileFromSupabase } from '../../utils/supabaseStorageUtils';
import { updateClientAggregatesOnTransaction, updateClientAggregatesOnDelete } from '../../utils/clientAggregates';
import { incrementExpenseCategoryUsage } from './expenseCategories';

interface TransactionPhoto {
  name: string;
  url: string;
  type: string;
  size: number;
  path: string;
}

interface TransferOptions {
  isSalary?: boolean;
  isCashless?: boolean;
  waybillNumber?: string;
  waybillData?: Transaction['waybillData'];
  expenseCategoryId?: string;
  skipTelegram?: boolean;
  metadata?: {
    editType?: 'reversal' | 'correction';
    reversalOf?: string;
    correctedFrom?: string;
  };
}

export const transferFunds = async ({
  sourceCategory,
  targetCategory,
  amount,
  description,
  attachments = [],
  waybillNumber,
  waybillData,
  isSalary,
  isCashless,
  expenseCategoryId,
  skipTelegram,
  metadata
}: {
  sourceCategory: CategoryCardType;
  targetCategory: CategoryCardType;
  amount: number;
  description: string;
  attachments?: TransactionPhoto[];
  waybillNumber?: string;
  waybillData?: Transaction['waybillData'];
  isSalary?: boolean;
  isCashless?: boolean;
  expenseCategoryId?: string;
  skipTelegram?: boolean;
  metadata?: {
    editType?: 'reversal' | 'correction';
    reversalOf?: string;
    correctedFrom?: string;
  };
}): Promise<void> => {
  if (!amount || amount <= 0) {
    throw new Error('Сумма перевода должна быть больше нуля');
  }

  if (!description.trim()) {
    throw new Error('Необходимо указать комментарий к переводу');
  }

  try {
    await runTransaction(db, async (transaction) => {
      const sourceRef = doc(db, 'categories', sourceCategory.id);
      const targetRef = doc(db, 'categories', targetCategory.id);
      
      const sourceDoc = await transaction.get(sourceRef);
      const targetDoc = await transaction.get(targetRef);

      if (!sourceDoc.exists()) {
        throw new Error('Категория отправителя не найдена');
      }

      if (!targetDoc.exists()) {
        throw new Error('Категория получателя не найдена');
      }

      const sourceBalance = parseAmount(sourceDoc.data().amount);
      const targetBalance = parseAmount(targetDoc.data().amount);

      // Создаем ID для транзакции заранее
      const withdrawalId = doc(collection(db, 'transactions')).id;
      const depositId = doc(collection(db, 'transactions')).id;

      const timestamp = serverTimestamp();
      
      const withdrawalData: Record<string, unknown> = {
        categoryId: sourceCategory.id,
        fromUser: sourceCategory.title,
        toUser: targetCategory.title,
        amount: -amount,
        description,
        type: 'expense',
        date: timestamp,
        relatedTransactionId: depositId,
        attachments,
        waybillNumber,
        waybillData,
        isSalary,
        isCashless
      };
      if (expenseCategoryId) {
        withdrawalData.expenseCategoryId = expenseCategoryId;
      }

      if (metadata) {
        if (metadata.editType) {
          withdrawalData.editType = metadata.editType;
        }
        if (metadata.reversalOf) {
          withdrawalData.reversalOf = metadata.reversalOf;
        }
        if (metadata.correctedFrom) {
          withdrawalData.correctedFrom = metadata.correctedFrom;
        }
      }

      // Данные для пополнения средств
      const depositData = {
        ...withdrawalData,
        categoryId: targetCategory.id,
        amount: amount,
        type: 'income',
        relatedTransactionId: withdrawalId,
      };
      
      transaction.set(doc(db, 'transactions', withdrawalId), withdrawalData);
      transaction.set(doc(db, 'transactions', depositId), depositData);

      transaction.update(sourceRef, {
        amount: formatAmount(sourceBalance - amount)
      });

      transaction.update(targetRef, {
        amount: formatAmount(targetBalance + amount)
      });

      if (!skipTelegram) {
        try {
          const message = formatTransactionMessage(
            sourceCategory.title,
            targetCategory.title,
            amount,
            description,
            'expense',
            waybillNumber
          );
          await sendTelegramNotification(message);
        } catch (error) {
          console.error('Error sending Telegram notification:', error);
        }
      }
    });

    // Обновляем агрегаты для клиентов (если транзакция связана с клиентом)
    // Используем текущую дату для агрегатов
    const transactionDate = Timestamp.now();
    
    // Обновляем агрегаты для sourceCategory (расход)
    try {
      await updateClientAggregatesOnTransaction(
        sourceCategory.id,
        -amount, // Отрицательная сумма для расхода
        transactionDate
      );
    } catch (error) {
      console.error('Error updating client aggregates for source:', error);
      // Не прерываем выполнение, если обновление агрегатов не удалось
    }

    // Обновляем агрегаты для targetCategory (приход)
    try {
      await updateClientAggregatesOnTransaction(
        targetCategory.id,
        amount, // Положительная сумма для прихода
        transactionDate
      );
    } catch (error) {
      console.error('Error updating client aggregates for target:', error);
      // Не прерываем выполнение, если обновление агрегатов не удалось
    }

    // Увеличиваем счётчик использований категории расхода (для сортировки по популярности)
    if (expenseCategoryId) {
      try {
        await incrementExpenseCategoryUsage(expenseCategoryId);
      } catch (error) {
        console.error('Error incrementing expense category usage:', error);
      }
    }
  } catch (error) {
    console.error('Error in transferFunds:', error);
    throw error;
  }
};

interface TransactionEditLogPayload {
  transactionId: string;
  before: {
    from: string;
    to: string;
    amount: number;
    comment: string;
    category: string | null;
  };
  after: {
    from: string;
    to: string;
    amount: number;
    comment: string;
    category: string | null;
  };
}

export const createTransactionEditLog = async ({
  transactionId,
  before,
  after
}: TransactionEditLogPayload): Promise<void> => {
  const logsRef = collection(db, 'transaction_edit_logs');
  await addDoc(logsRef, {
    transactionId,
    editedAt: serverTimestamp(),
    editedBy: 'feed-password-mode',
    before,
    after
  });
};

export const createReversalTransaction = async (transactionId: string): Promise<void> => {
  const transactionRef = doc(db, 'transactions', transactionId);
  const transactionSnap = await getDoc(transactionRef);

  if (!transactionSnap.exists()) {
    throw new Error('Исходная транзакция не найдена');
  }

  const original = transactionSnap.data() as Transaction & { relatedTransactionId?: string };

  if (original.type !== 'expense') {
    throw new Error('Отменять можно только расходные транзакции');
  }

  if (!original.relatedTransactionId) {
    throw new Error('У транзакции нет связанной операции для отмены');
  }

  const relatedRef = doc(db, 'transactions', original.relatedTransactionId);
  const relatedSnap = await getDoc(relatedRef);

  if (!relatedSnap.exists()) {
    throw new Error('Связанная транзакция не найдена');
  }

  const related = relatedSnap.data() as Transaction;

  const amount = Math.abs(original.amount);

  const sourceCategory: CategoryCardType = {
    id: related.categoryId,
    title: related.fromUser,
    amount: '0 ₸',
    iconName: '',
    color: '#000000'
  };

  const targetCategory: CategoryCardType = {
    id: original.categoryId,
    title: original.fromUser,
    amount: '0 ₸',
    iconName: '',
    color: '#000000'
  };

  await transferFunds({
    sourceCategory,
    targetCategory,
    amount,
    description: `Отмена транзакции: ${original.description}`,
    attachments: [],
    waybillNumber: original.waybillNumber,
    waybillData: original.waybillData,
    isSalary: original.isSalary,
    isCashless: original.isCashless,
    expenseCategoryId: original.expenseCategoryId,
    skipTelegram: true,
    metadata: {
      editType: 'reversal',
      reversalOf: transactionId
    }
  });
};

export const createCorrectionTransaction = async (
  sourceCategory: CategoryCardType,
  targetCategory: CategoryCardType,
  amount: number,
  description: string,
  originalTransactionId: string,
  expenseCategoryId?: string
): Promise<void> => {
  await transferFunds({
    sourceCategory,
    targetCategory,
    amount,
    description,
    attachments: [],
    waybillNumber: undefined,
    waybillData: undefined,
    isSalary: false,
    isCashless: false,
    expenseCategoryId,
    skipTelegram: true,
    metadata: {
      editType: 'correction',
      correctedFrom: originalTransactionId
    }
  });
};

export const editFeedTransaction = async (params: {
  originalTransactionId: string;
  newFromCategory: CategoryCardType;
  newToCategory: CategoryCardType;
  newAmount: number;
  newDescription: string;
  audit: TransactionEditLogPayload;
}): Promise<void> => {
  const {
    originalTransactionId,
    newFromCategory,
    newToCategory,
    newAmount,
    newDescription,
    audit
  } = params;

  if (!newAmount || newAmount <= 0) {
    throw new Error('Сумма перевода должна быть больше нуля');
  }
  if (!newDescription.trim()) {
    throw new Error('Необходимо указать комментарий к переводу');
  }

  const nowForAggregates = Timestamp.now();

  // Для агрегатов клиентов (row === 1) обновляем как при создании транзакций (4 события: reversal+correction)
  const postCommitAggregateUpdates: Array<Promise<void>> = [];

  await runTransaction(db, async (tx) => {
    // ====================
    // 1. READ PHASE
    // ====================

    const originalRef = doc(db, 'transactions', originalTransactionId);
    const originalSnap = await tx.get(originalRef);
    if (!originalSnap.exists()) {
      throw new Error('Исходная транзакция не найдена');
    }

    const original = originalSnap.data() as Transaction & { relatedTransactionId?: string; categoryId: string };
    if (original.type !== 'expense') {
      throw new Error('Редактировать можно только расходные транзакции');
    }
    if (!original.relatedTransactionId) {
      throw new Error('У транзакции нет связанной операции');
    }

    const relatedRef = doc(db, 'transactions', original.relatedTransactionId);
    const relatedSnap = await tx.get(relatedRef);
    if (!relatedSnap.exists()) {
      throw new Error('Связанная транзакция не найдена');
    }
    const related = relatedSnap.data() as Transaction & { categoryId: string };

    const oldFromCategoryId = original.categoryId;
    const oldToCategoryId = related.categoryId;

    const oldAmount = Math.abs(Number(original.amount));
    const oldFromTitle = original.fromUser;
    const oldToTitle = original.toUser;

    // Готовим изменения балансов по categoryId
    const balanceDeltaByCategoryId = new Map<string, number>();
    const addDelta = (categoryId: string, delta: number) => {
      balanceDeltaByCategoryId.set(categoryId, (balanceDeltaByCategoryId.get(categoryId) ?? 0) + delta);
    };

    // reversal: oldTo -> oldFrom (undo old transfer)
    addDelta(oldToCategoryId, -oldAmount);
    addDelta(oldFromCategoryId, +oldAmount);

    // correction: newFrom -> newTo
    addDelta(newFromCategory.id, -newAmount);
    addDelta(newToCategory.id, +newAmount);

    // Читаем текущие балансы всех затронутых категорий
    const currentAmounts = new Map<string, number>();
    const categoryIdsToRead = Array.from(balanceDeltaByCategoryId.keys());
    for (const categoryId of categoryIdsToRead) {
      const categoryRef = doc(db, 'categories', categoryId);
      const categorySnap = await tx.get(categoryRef);
      if (!categorySnap.exists()) {
        throw new Error('Категория не найдена');
      }
      currentAmounts.set(categoryId, parseAmount(categorySnap.data().amount));
    }

    // ====================
    // 2. WRITE PHASE
    // ====================

    const timestamp = serverTimestamp();

    // 1) Помечаем старую пару отменённой
    const cancelPatch: Record<string, unknown> = {
      status: 'cancelled',
      cancelledAt: timestamp,
      cancelledBy: 'feed-password-mode',
      cancelledReason: 'edited'
    };
    tx.update(originalRef, cancelPatch);
    tx.update(relatedRef, cancelPatch);

    // 2) Создаём reversal транзакции (2 записи)
    const reversalWithdrawalId = doc(collection(db, 'transactions')).id;
    const reversalDepositId = doc(collection(db, 'transactions')).id;

    const reversalBase: Record<string, unknown> = {
      fromUser: oldToTitle,
      toUser: oldFromTitle,
      description: `Отмена транзакции: ${original.description}`,
      date: timestamp,
      editType: 'reversal',
      reversalOf: originalTransactionId
    };

    tx.set(doc(db, 'transactions', reversalWithdrawalId), {
      ...reversalBase,
      categoryId: oldToCategoryId,
      amount: -oldAmount,
      type: 'expense',
      relatedTransactionId: reversalDepositId,
      attachments: []
    });
    tx.set(doc(db, 'transactions', reversalDepositId), {
      ...reversalBase,
      categoryId: oldFromCategoryId,
      amount: oldAmount,
      type: 'income',
      relatedTransactionId: reversalWithdrawalId,
      attachments: []
    });

    // 3) Создаём correction транзакции (2 записи)
    const correctionWithdrawalId = doc(collection(db, 'transactions')).id;
    const correctionDepositId = doc(collection(db, 'transactions')).id;

    const correctionBase: Record<string, unknown> = {
      fromUser: newFromCategory.title,
      toUser: newToCategory.title,
      description: newDescription.trim(),
      date: timestamp,
      editType: 'correction',
      correctedFrom: originalTransactionId
    };

    tx.set(doc(db, 'transactions', correctionWithdrawalId), {
      ...correctionBase,
      categoryId: newFromCategory.id,
      amount: -newAmount,
      type: 'expense',
      relatedTransactionId: correctionDepositId,
      attachments: []
    });
    tx.set(doc(db, 'transactions', correctionDepositId), {
      ...correctionBase,
      categoryId: newToCategory.id,
      amount: newAmount,
      type: 'income',
      relatedTransactionId: correctionWithdrawalId,
      attachments: []
    });

    // 4) Audit log (в той же транзакции)
    const logRef = doc(collection(db, 'transaction_edit_logs'));
    tx.set(logRef, {
      transactionId: audit.transactionId,
      editedAt: timestamp,
      editedBy: 'feed-password-mode',
      before: audit.before,
      after: audit.after
    });

    // 5) Обновляем балансы всех затронутых категорий
    for (const [categoryId, delta] of balanceDeltaByCategoryId.entries()) {
      const categoryRef = doc(db, 'categories', categoryId);
      const current = currentAmounts.get(categoryId) ?? 0;
      tx.update(categoryRef, {
        amount: formatAmount(current + delta),
        updatedAt: timestamp
      });
    }

    // Пост-коммит обновления агрегатов (сохраняем промисы, выполним после транзакции)
    // reversal events:
    postCommitAggregateUpdates.push(updateClientAggregatesOnTransaction(oldToCategoryId, -oldAmount, nowForAggregates));
    postCommitAggregateUpdates.push(updateClientAggregatesOnTransaction(oldFromCategoryId, oldAmount, nowForAggregates));
    // correction events:
    postCommitAggregateUpdates.push(updateClientAggregatesOnTransaction(newFromCategory.id, -newAmount, nowForAggregates));
    postCommitAggregateUpdates.push(updateClientAggregatesOnTransaction(newToCategory.id, newAmount, nowForAggregates));
  });

  // Не блокируем UX на агрегатах — они best-effort
  await Promise.allSettled(postCommitAggregateUpdates);
};

export const deleteTransaction = async (transactionId: string, userId: string): Promise<void> => {
  if (!transactionId) {
    throw new Error('ID транзакции обязателен');
  }

  if (!userId) {
    throw new Error('ID пользователя обязателен');
  }

  try {
    // Проверяем роль пользователя
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      throw new Error('Пользователь не найден');
    }

    const userRole = userDoc.data().role;
    if (userRole !== 'admin') {
      throw new Error('Только администратор может удалять транзакции');
    }

    const batch = writeBatch(db);
    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);

    if (!transactionSnap.exists()) {
      throw new Error('Транзакция не найдена');
    }

    const transactionData = transactionSnap.data();
    const relatedTransactionId = transactionData.relatedTransactionId;
    const categoryId = transactionData.categoryId;
    const amount = Number(transactionData.amount);

    // Удаляем прикрепленные файлы из Supabase
    if (transactionData.attachments && transactionData.attachments.length > 0) {
      for (const attachment of transactionData.attachments) {
        try {
          await deleteFileFromSupabase(attachment.path);
        } catch (error) {
          console.error('Error deleting file from Supabase:', error);
          // Продолжаем удаление других файлов даже если один не удалился
        }
      }
    }

    batch.delete(transactionRef);

    // Обновляем агрегаты для клиента перед удалением транзакции
    try {
      await updateClientAggregatesOnDelete(categoryId, amount);
    } catch (error) {
      console.error('Error updating client aggregates on delete:', error);
      // Не прерываем выполнение, если обновление агрегатов не удалось
    }

    // Получаем текущий баланс категории
    const categoryRef = doc(db, 'categories', categoryId);
    const categorySnap = await getDoc(categoryRef);

    if (categorySnap.exists()) {
      const currentAmount = parseAmount(categorySnap.data().amount);
      // При удалении:
      // Для расхода (amount отрицательный) - прибавляем модуль суммы
      // Для дохода (amount положительный) - вычитаем сумму
      const newAmount = currentAmount + (amount * -1);

      batch.update(categoryRef, {
        amount: formatAmount(newAmount),
        updatedAt: serverTimestamp()
      });
    }

    // Ищем связанные транзакции двумя способами:
    // 1. Транзакции, на которые ссылается текущая
    // 2. Транзакции, которые ссылаются на текущую
    let relatedTransaction = null;

    // 1. Проверяем транзакцию, на которую ссылается текущая
    if (relatedTransactionId) {
      const relatedRef = doc(db, 'transactions', relatedTransactionId);
      const relatedSnap = await getDoc(relatedRef);
      if (relatedSnap.exists()) {
        relatedTransaction = { ...relatedSnap.data(), id: relatedSnap.id };
      }
    }

    // 2. Ищем транзакции, которые ссылаются на текущую
    if (!relatedTransaction) {
      const relatedQuery = query(
        collection(db, 'transactions'),
        where('relatedTransactionId', '==', transactionId)
      );
      const relatedQuerySnap = await getDocs(relatedQuery);
      if (!relatedQuerySnap.empty) {
        const doc = relatedQuerySnap.docs[0];
        relatedTransaction = { ...doc.data(), id: doc.id };
      }
    }

    // Если нашли связанную транзакцию, удаляем её и обновляем баланс её категории
    if (relatedTransaction) {
      const relatedRef = doc(db, 'transactions', relatedTransaction.id);

      // Удаляем прикрепленные файлы связанной транзакции
      if (relatedTransaction.attachments && relatedTransaction.attachments.length > 0) {
        for (const attachment of relatedTransaction.attachments) {
          try {
            await deleteFileFromSupabase(attachment.path);
          } catch (error) {
            console.error('Error deleting related transaction file from Supabase:', error);
            // Продолжаем удаление других файлов даже если один не удалился
          }
        }
      }

      batch.delete(relatedRef);

      // Обновляем агрегаты для клиента связанной транзакции
      try {
        await updateClientAggregatesOnDelete(
          relatedTransaction.categoryId,
          relatedTransaction.amount
        );
      } catch (error) {
        console.error('Error updating client aggregates for related transaction:', error);
      }

      const relatedCategoryRef = doc(db, 'categories', relatedTransaction.categoryId);
      const relatedCategorySnap = await getDoc(relatedCategoryRef);

      if (relatedCategorySnap.exists()) {
        const currentAmount = parseAmount(relatedCategorySnap.data().amount);
        const relatedAmount = Number(relatedTransaction.amount);
        const newAmount = currentAmount + (relatedAmount * -1);

        batch.update(relatedCategoryRef, {
          amount: formatAmount(newAmount),
          updatedAt: serverTimestamp()
        });
      }
    }

    await batch.commit();
  } catch (error) {
    console.error('Error in deleteTransaction:', error);
    throw error;
  }
};