// API Configuration
// Автоматическое определение backend URL
const getBackendUrl = (): string => {
  // В development используем localhost
  if (import.meta.env.DEV) {
    return 'http://localhost:3000';
  }
  
  // В production используем same-origin через nginx proxy (/api/*)
  // Это устраняет CORS проблемы и Service Worker ошибки
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 
                     import.meta.env.VITE_API_URL ||
                     ''; // Пустая строка = same-origin (используется /api/*)
  
  return backendUrl;
};

export const API_CONFIG = {
  BASE_URL: getBackendUrl(),
  ENDPOINTS: {
    health: '/health',
    whatsapp: {
      status: '/whatsapp/status',
      logout: '/whatsapp/logout',
    },
    chats: '/chats',
    chat: '/chat',
    contacts: '/contacts',
    readStatus: '/read-status',
  },
} as const;

// Socket.IO Configuration  
export const SOCKET_CONFIG = {
  url: getBackendUrl(),
  options: {
    transports: ['websocket', 'polling'],
    cors: {
      origin: window.location.origin,
      methods: ['GET', 'POST']
    },
    // Увеличиваем таймауты для стабильности
    timeout: 10000,
    reconnectionDelay: 2000,
    reconnectionAttempts: 5,
  }
} as const;

// Для отладки - показываем текущий URL
console.log('🔗 Backend URL:', API_CONFIG.BASE_URL);
console.log('🔌 Socket URL:', SOCKET_CONFIG.url); 