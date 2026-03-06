import React, { useState, useEffect, useRef } from 'react';
import { useChat } from '../context/ChatContext';
import WhatsAppConnect from './WhatsAppConnect';
import { MdArrowBack, MdQrCode2, MdLogout } from 'react-icons/md';
import toast from 'react-hot-toast';
import { API_CONFIG } from '../config/api';
import axios from 'axios';

const WhatsAppContent: React.FC = () => {
    const { qrCode, whatsappStatus, logoutWhatsApp, isAdmin } = useChat();
    const [showQR, setShowQR] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const hasStartedRef = useRef(false); // Guard для предотвращения повторных вызовов
    
    // Модалка открыта если WhatsApp не готов
    const shouldShowModal = whatsappStatus !== 'ready';

    // Ленивая инициализация WhatsApp клиента при открытии страницы
    useEffect(() => {
        // Вызываем только один раз при монтировании компонента
        if (hasStartedRef.current) return;
        
        const startWhatsAppClient = async () => {
            try {
                console.log('[WhatsAppContent] Starting WhatsApp client via /api/whatsapp/start');
                hasStartedRef.current = true;
                
                const response = await axios.post(`${API_CONFIG.BASE_URL}/api/whatsapp/start`);
                
                if (response.data.success) {
                    console.log('[WhatsAppContent] WhatsApp client start response:', response.data);
                } else {
                    console.error('[WhatsAppContent] Failed to start WhatsApp client:', response.data);
                }
            } catch (error: any) {
                console.error('[WhatsAppContent] Error starting WhatsApp client:', error);
                // Не показываем toast, так как это может быть нормально (клиент уже запущен)
            }
        };
        
        startWhatsAppClient();
    }, []); // Пустой массив зависимостей - выполняется только при монтировании

    // Определяем, является ли устройство мобильным
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        
        checkMobile();
        window.addEventListener('resize', checkMobile);
        
        return () => {
            window.removeEventListener('resize', checkMobile);
        };
    }, []);

    // Автоматически показываем модалку когда нужно (не ready)
    // Модалка закрывается ТОЛЬКО когда whatsappStatus === 'ready'
    useEffect(() => {
        if (whatsappStatus === 'ready') {
            // Закрываем модалку только на READY
            setShowQR(false);
        } else if (whatsappStatus !== 'ready' && !showQR) {
            // Показываем модалку для всех других состояний (qr, authenticated, disconnected, idle)
            setShowQR(true);
        }
    }, [whatsappStatus, showQR]);

    // Функция обработки отключения WhatsApp
    const handleLogout = async () => {
        if (!isAdmin) {
            toast.error('У вас нет прав для выполнения этого действия');
            return;
        }

        const confirmLogout = window.confirm(
            'Вы уверены, что хотите отключиться от WhatsApp? Потребуется повторное сканирование QR-кода.'
        );

        if (!confirmLogout) return;

        setIsLoggingOut(true);
        toast.loading('Отключение от WhatsApp...');

        try {
            const success = await logoutWhatsApp();
            if (success) {
                toast.dismiss();
                toast.success('WhatsApp отключен. Ожидаем сканирования нового QR-кода.');
            } else {
                toast.dismiss();
                toast.error('Ошибка при отключении от WhatsApp');
            }
        } catch (error) {
            console.error('Logout error:', error);
            toast.dismiss();
            toast.error('Произошла ошибка при отключении');
        } finally {
            setIsLoggingOut(false);
        }
    };

    // Функция получения текста статуса
    const getStatusText = () => {
        switch (whatsappStatus) {
            case 'ready':
                return 'WhatsApp подключен';
            case 'qr_pending':
                return 'Ожидается сканирование QR-кода';
            case 'restarting':
                return 'Перезапуск WhatsApp клиента...';
            case 'blocked':
                return 'Блокируются запросы к доменам WhatsApp';
            case 'disconnected':
            default:
                return 'WhatsApp не подключен';
        }
    };

    // Функция получения цвета статуса
    const getStatusColor = () => {
        switch (whatsappStatus) {
            case 'ready':
                return 'bg-green-500';
            case 'authenticated':
                return 'bg-blue-500';
            case 'qr_pending':
                return 'bg-yellow-500';
            case 'restarting':
                return 'bg-blue-500';
            case 'blocked':
                return 'bg-orange-500';
            case 'disconnected':
            default:
                return 'bg-red-500';
        }
    };
    
    // Функция для ручного reset сессии
    const handleResetSession = async () => {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}/api/whatsapp/reset`, {
                method: 'POST',
                credentials: 'include'
            });
            
            if (response.ok) {
                toast.success('Сессия сброшена. Ожидаем новый QR-код...');
            } else {
                toast.error('Ошибка при сбросе сессии');
            }
        } catch (error) {
            console.error('Reset session error:', error);
            toast.error('Ошибка при сбросе сессии');
        }
    };

    return (
        <div className="flex flex-col h-full w-full">
            {/* Верхняя панель */}
            <div className={`${getStatusColor()} text-white px-4 py-2 flex items-center justify-between shadow-sm flex-shrink-0`}>
                {/* Левая часть */}
                <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                        <span className="text-lg font-semibold">{getStatusText()}</span>
                    </div>
                </div>

                {/* Правая часть */}
                <div className="flex items-center space-x-2">
                    {/* Кнопка для повторного открытия модалки */}
                    {whatsappStatus !== 'ready' && !showQR && (
                        <button
                            onClick={() => setShowQR(true)}
                            className="flex items-center space-x-2 hover:bg-black hover:bg-opacity-20 px-3 py-1 rounded transition-colors"
                        >
                            <MdQrCode2 className="w-5 h-5" />
                            <span className="text-sm hidden md:inline">Показать QR-код</span>
                        </button>
                    )}
                    {whatsappStatus === 'ready' && (
                        <button
                            onClick={() => setShowQR(true)}
                            className="flex items-center space-x-2 hover:bg-black hover:bg-opacity-20 px-3 py-1 rounded transition-colors"
                            title="Подключить WhatsApp"
                        >
                            <MdQrCode2 className="w-5 h-5" />
                            <span className="text-sm hidden md:inline">Подключить WhatsApp</span>
                        </button>
                    )}
                    
                    {/* Кнопка отключения (только для админов) */}
                    {isAdmin && whatsappStatus === 'ready' && (
                        <button
                            onClick={handleLogout}
                            disabled={isLoggingOut}
                            className="flex items-center space-x-2 hover:bg-red-600 hover:bg-opacity-30 px-3 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Отключить WhatsApp"
                        >
                            <MdLogout className="w-5 h-5" />
                            <span className="text-sm hidden md:inline">
                                {isLoggingOut ? 'Отключение...' : 'Отключить'}
                            </span>
                        </button>
                    )}
                </div>
            </div>

            {/* Модальное окно с QR-кодом */}
            {showQR && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold">
                                {(whatsappStatus === 'authenticated' || (whatsappStatus === 'qr_pending' && !qrCode))
                                    ? 'Подключение...'
                                    : 'Сканируйте QR-код'}
                            </h2>
                            {/* Крестик закрывает модалку только если WhatsApp ready, иначе скрывает (не рвет socket) */}
                            <button
                                onClick={() => {
                                    // Закрываем модалку только если WhatsApp готов
                                    // Для других состояний модалка вернется автоматически через useEffect
                                    if (whatsappStatus === 'ready') {
                                        setShowQR(false);
                                    } else {
                                        // Временно скрываем, но модалка вернется автоматически при следующем рендере
                                        setShowQR(false);
                                    }
                                }}
                                className="text-gray-500 hover:text-gray-700 transition-colors"
                                title={whatsappStatus === 'ready' ? 'Закрыть' : 'Соединение сохраняется, модалка вернется автоматически'}
                            >
                                <svg
                                    className="w-6 h-6"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>
                        <div className="flex justify-center">
                            {whatsappStatus === 'authenticated' ? (
                                <div className="flex items-center justify-center w-64 h-64 bg-gray-100 rounded-lg">
                                    <div className="text-center">
                                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                                        <span className="text-gray-600 font-medium">Аутентификация успешна</span>
                                        <p className="text-xs text-gray-500 mt-2">Ожидаем готовности WhatsApp...</p>
                                        <p className="text-xs text-gray-400 mt-1">Это может занять до 90 секунд</p>
                                    </div>
                                </div>
                            ) : (whatsappStatus === 'qr_pending' && !qrCode) ? (
                                <div className="flex items-center justify-center w-64 h-64 bg-gray-100 rounded-lg">
                                    <div className="text-center">
                                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto mb-4"></div>
                                        <span className="text-gray-600">Генерируем QR-код...</span>
                                    </div>
                                </div>
                            ) : qrCode ? (
                                <img 
                                    src={qrCode}
                                    alt="WhatsApp QR Code"
                                    className="mx-auto"
                                    width={256}
                                    height={256}
                                />
                            ) : (
                                <div className="flex items-center justify-center w-64 h-64 bg-gray-100 rounded-lg">
                                    <span className="text-gray-500">QR-код загружается...</span>
                                </div>
                            )}
                        </div>
                        <p className="mt-4 text-center text-gray-600">
                            {whatsappStatus === 'authenticated'
                                ? 'Аутентификация успешна. WhatsApp загружает данные и готовится к работе. Это может занять до 90 секунд.'
                                : (whatsappStatus === 'qr_pending' && !qrCode)
                                ? 'Генерируем QR-код для подключения...'
                                : 'Откройте WhatsApp на вашем телефоне и отсканируйте QR-код'}
                        </p>
                        {whatsappStatus === 'restarting' && (
                            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <p className="text-blue-800 text-sm text-center">
                                    ⏳ Ожидаем сканирования нового QR-кода после перезапуска
                                </p>
                            </div>
                        )}
                        {whatsappStatus === 'blocked' && (
                            <div className="mt-4 p-4 bg-red-50 border-2 border-red-300 rounded-lg">
                                <div className="text-red-800 text-sm text-center mb-4">
                                    <p className="font-semibold mb-2 text-base">
                                        ⚠️ Блокируются запросы к критичным доменам WhatsApp
                                    </p>
                                    <p className="text-xs mb-2">
                                        Системная защита (Windows Defender Network Protection, роутер, DNS фильтр) блокирует доступ к web.whatsapp.com
                                    </p>
                                    <p className="text-xs text-red-600 font-medium mb-3">
                                        Это системная проблема, не браузерная. Решение: изолировать WhatsApp сервис в Docker или на отдельном сервере.
                                    </p>
                                    <div className="text-left text-xs bg-white p-2 rounded border border-red-200 mb-3">
                                        <p className="font-semibold mb-1">Быстрое решение:</p>
                                        <ol className="list-decimal list-inside space-y-1 text-gray-700">
                                            <li>Используйте Docker: <code className="bg-gray-100 px-1 rounded">docker-compose up</code></li>
                                            <li>Или измените DNS на 8.8.8.8 в настройках сети</li>
                                            <li>Или добавьте исключения в Windows Defender</li>
                                        </ol>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleResetSession}
                                        className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm font-medium"
                                    >
                                        Попробовать снова
                                    </button>
                                    <button
                                        onClick={() => {
                                            window.open('https://github.com/hotwellkz/app401/blob/main/whatsapp-server/BLOCKING_DIAGNOSIS.md', '_blank');
                                        }}
                                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-medium"
                                    >
                                        Инструкция
                                    </button>
                                </div>
                            </div>
                        )}
                        {whatsappStatus === 'disconnected' && (
                            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <p className="text-yellow-800 text-sm text-center">
                                    ⚠️ WhatsApp отключен. Ожидаем нового QR-кода...
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Основной контент - займет всю оставшуюся высоту */}
            <div className="flex-1 min-h-0 overflow-hidden">
                <WhatsAppConnect serverUrl={API_CONFIG.BASE_URL} isMobile={isMobile} />
            </div>
        </div>
    );
};

export default WhatsAppContent;
