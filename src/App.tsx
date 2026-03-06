import React, { useEffect, useState, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthGuard } from './components/auth/AuthGuard';
import { AdminRoute } from './components/auth/AdminRoute';
import { ApprovalGuard } from './components/auth/ApprovalGuard';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { LoadingSpinner } from './components/LoadingSpinner';
import { Toaster } from 'react-hot-toast';
import './styles/animations.css';
import { MenuVisibilityProvider } from './contexts/MenuVisibilityContext';
import { ErrorBoundary } from './components/ErrorBoundary';

// Типы для безопасного lazy loading
type LazyComponent<T> = React.LazyExoticComponent<React.ComponentType<T>>;

// Вспомогательная функция для безопасного lazy import с именованным экспортом
function lazyNamed<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ [key: string]: T }>,
  exportName: string
): LazyComponent<any> {
  return lazy(async () => {
    try {
      const module = await importFn();
      if (!module[exportName]) {
        console.error(`[LazyImport] Export ${exportName} not found in module`, Object.keys(module));
        throw new Error(`Export ${exportName} not found`);
      }
      return { default: module[exportName] };
    } catch (error) {
      console.error(`[LazyImport] Error loading ${exportName}:`, error);
      throw error;
    }
  });
}

// Lazy loading для тяжелых страниц
const Feed = lazy(() => import('./pages/Feed').then(module => ({ default: module.Feed })));
const DailyReport = lazy(() => import('./pages/DailyReport'));
const Clients = lazy(() => import('./pages/Clients').then(module => ({ default: module.Clients })));
const Admin = lazy(() => import('./pages/Admin').then(module => ({ default: module.Admin })));
const ContractTemplates = lazy(() => import('./pages/ContractTemplates').then(module => ({ default: module.ContractTemplates })));
const Products = lazy(() => import('./pages/Products').then(module => ({ default: module.Products })));
const Transactions = lazy(() => import('./pages/Transactions').then(module => ({ default: module.Transactions })));
const WarehouseProducts = lazy(() => import('./pages/warehouse/products/WarehouseProducts').then(module => ({ default: module.WarehouseProducts })));
const Employees = lazy(() => import('./pages/Employees').then(module => ({ default: module.Employees })));
const FolderProducts = lazy(() => import('./pages/warehouse/products/FolderProducts').then(module => ({ default: module.FolderProducts })));
const ProductDetails = lazy(() => import('./pages/warehouse/products/ProductDetails').then(module => ({ default: module.ProductDetails })));
const Calculator = lazy(() => import('./pages/Calculator').then(module => ({ default: module.Calculator })));
const Documents = lazy(() => import('./pages/warehouse/Documents').then(module => ({ default: module.Documents })));
// Используем безопасный lazy import для именованных экспортов
const ClientFiles = lazyNamed(() => import('./pages/ClientFiles'), 'ClientFiles');
const AllClientFiles = lazyNamed(() => import('./pages/AllClientFiles'), 'AllClientFiles');
const Warehouse = lazy(() => import('./pages/Warehouse').then(module => ({ default: module.Warehouse })));
// Используем безопасный lazy import для именованных экспортов
const NewIncome = lazyNamed(() => import('./pages/warehouse/NewIncome'), 'NewIncome');
const NewExpense = lazyNamed(() => import('./pages/warehouse/NewExpense'), 'NewExpense');
const TransactionHistoryPage = lazy(() => import('./pages/TransactionHistoryPage'));
const OptimizedTransactionHistoryPage = lazy(() => import('./pages/OptimizedTransactionHistoryPage').then(module => ({ default: module.OptimizedTransactionHistoryPage })));
const Profile = lazy(() => import('./pages/Profile'));
const WhatsApp = lazy(() => import('./pages/WhatsApp'));
const CreateTemplate = lazy(() => import('./pages/CreateTemplate'));
const EditTemplate = lazy(() => import('./pages/EditTemplate'));
const CreateContractWithAdditionalWorks = lazy(() => import('./pages/CreateContractWithAdditionalWorks'));
const FinishingMaterialsManager = lazy(() => import('./components/materials/FinishingMaterialsManager').then(module => ({ default: module.FinishingMaterialsManager })));

// Fallback компонент для Suspense
const PageLoader = () => (
  <div className="flex items-center justify-center h-full">
    <LoadingSpinner />
  </div>
);

type Page = 'dashboard' | 'transactions' | 'feed' | 'daily-report' | 'clients' | 'templates' | 
  'products' | 'employees' | 'projects' | 'calculator' | 'warehouse' | 'chat' | 'finishing-materials';

const AppContent: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('transactions');
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });
  const navigate = useNavigate();

  // Логирование времени загрузки приложения
  useEffect(() => {
    console.time('app-bootstrap');
    console.log('[PERF] App started loading');
    
    return () => {
      console.timeEnd('app-bootstrap');
      console.log('[PERF] App finished loading');
    };
  }, []);

  // Слушаем изменения в localStorage для синхронизации состояния collapsed
  useEffect(() => {
    const handleStorageChange = () => {
      setCollapsed(localStorage.getItem('sidebar-collapsed') === 'true');
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Также слушаем изменения внутри того же окна
    const checkCollapsedState = () => {
      const currentState = localStorage.getItem('sidebar-collapsed') === 'true';
      if (currentState !== collapsed) {
        setCollapsed(currentState);
      }
    };

    const interval = setInterval(checkCollapsedState, 100);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [collapsed]);

  return (
    <div className="flex w-full h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <Sidebar onPageChange={setCurrentPage} currentPage={currentPage} />
      
      {/* Основной контент */}
      <main className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        <Header 
          onPageChange={(page) => {
            navigate(`/${page}`);
            setCurrentPage(page as Page);
          }} 
        />
        <div className="flex-1 overflow-auto">
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
            <Route path="/" element={<Navigate to="/transactions" replace />} />
            <Route path="/admin" element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            } />
            <Route path="/daily-report" element={<DailyReport />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/client-files" element={<AllClientFiles />} />
            <Route path="/clients/:clientId/files" element={<ClientFiles />} />
            <Route path="/transactions" element={
              <ApprovalGuard>
                <Transactions />
              </ApprovalGuard>
            } />
            <Route path="/transactions/history/:id" element={
              <ApprovalGuard>
                <OptimizedTransactionHistoryPage />
              </ApprovalGuard>
            } />
            <Route path="/feed" element={
              <ApprovalGuard>
                <Feed />
              </ApprovalGuard>
            } />
            <Route path="/templates" element={
              <ApprovalGuard>
                <ContractTemplates />
              </ApprovalGuard>
            } />
            <Route path="/templates/create" element={<CreateTemplate />} />
            <Route path="/templates/:id/edit" element={<EditTemplate />} />
            <Route path="/templates/:id/create-with-additional" element={<CreateContractWithAdditionalWorks />} />
            <Route path="/products" element={
              <ApprovalGuard>
                <Products />
              </ApprovalGuard>
            } />
            <Route path="/warehouse/products" element={
              <ApprovalGuard>
                <WarehouseProducts />
              </ApprovalGuard>
            } />
            <Route path="/warehouse/products/:folderId" element={
              <ApprovalGuard>
                <FolderProducts />
              </ApprovalGuard>
            } />
            <Route path="/warehouse/product/:id" element={
              <ApprovalGuard>
                <ProductDetails />
              </ApprovalGuard>
            } />
            <Route path="/warehouse/products/:folderId/:productId" element={
              <ApprovalGuard>
                <ProductDetails />
              </ApprovalGuard>
            } />
            <Route path="/employees" element={
              <ApprovalGuard>
                <Employees />
              </ApprovalGuard>
            } />
            <Route path="/calculator" element={
              <ApprovalGuard>
                <Calculator />
              </ApprovalGuard>
            } />
            <Route path="/warehouse" element={
              <ApprovalGuard>
                <Warehouse />
              </ApprovalGuard>
            } />
            <Route path="/warehouse/income/new" element={
              <ApprovalGuard>
                <NewIncome />
              </ApprovalGuard>
            } />
            <Route path="/warehouse/expense/new" element={
              <ApprovalGuard>
                <NewExpense />
              </ApprovalGuard>
            } />
            <Route path="/warehouse/documents" element={
              <ApprovalGuard>
                <Documents />
              </ApprovalGuard>
            } />
            <Route path="/warehouse/transactions/:productId" element={
              <ApprovalGuard>
                <TransactionHistoryPage />
              </ApprovalGuard>
            } />
            <Route path="/whatsapp" element={
              <ApprovalGuard>
                <WhatsApp />
              </ApprovalGuard>
            } />
            <Route path="/finishing-materials" element={
              <ApprovalGuard>
                <FinishingMaterialsManager />
              </ApprovalGuard>
            } />
            <Route path="/profile" element={<Profile />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
};

const App = () => {
  return (
    <HelmetProvider>
      <Router>
        <AuthGuard>
          <Toaster 
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#ffffff',
                color: '#1f2937',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                padding: '0.75rem 1rem',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
                fontSize: '0.875rem',
              },
              success: {
                style: {
                  background: '#f0fdf4',
                  border: '1px solid #dcfce7',
                  color: '#166534',
                },
                iconTheme: {
                  primary: '#22c55e',
                  secondary: '#ffffff',
                },
              },
              error: {
                style: {
                  background: '#fef2f2',
                  border: '1px solid #fee2e2',
                  color: '#991b1b',
                },
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#ffffff',
                },
                duration: 4000,
              },
            }}
          />
          <MenuVisibilityProvider>
            <AppContent />
          </MenuVisibilityProvider>
        </AuthGuard>
      </Router>
    </HelmetProvider>
  );
};

export default App;