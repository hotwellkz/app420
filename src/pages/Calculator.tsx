import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Calculator as CalcIcon, Home, Ruler, Settings, UserCog } from 'lucide-react';
import { CalculatorForm } from '../components/calculator/CalculatorForm';
import { PriceSummary } from '../components/calculator/PriceSummary';
import { CommercialProposal } from '../components/calculator/CommercialProposal';
import { CalculatorAdminPanel } from '../components/calculator/CalculatorAdminPanel';
import { SupervisorSalaryModal } from '../components/calculator/SupervisorSalaryModal';
import { CalculationResult } from '../types/calculator';
import { useAuth } from '../hooks/useAuth';

export const Calculator: React.FC = () => {
  const { isAdmin } = useAuth();
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isSupervisorSalaryOpen, setIsSupervisorSalaryOpen] = useState(false);
  const [calculationResult, setCalculationResult] = useState<CalculationResult>({
    fundamentCost: 0,
    kitCost: 0,
    assemblyCost: 0,
    total: 0,
    pricePerSqm: 0
  });
  const [area, setArea] = useState<number>(0);
  const [options, setOptions] = useState({ 
    isVatIncluded: false, 
    isInstallment: false, 
    installmentAmount: 0,
    hideFundamentCost: false,
    hideKitCost: false,
    hideAssemblyCost: false,
    hideDeliveryCost: false
  });
  const [parameters, setParameters] = useState({
    foundation: '',
    floors: '',
    firstFloorType: '',
    secondFloorType: '',
    thirdFloorType: '',
    firstFloorHeight: '',
    secondFloorHeight: '',
    thirdFloorHeight: '',
    firstFloorThickness: '',
    secondFloorThickness: '',
    thirdFloorThickness: '',
    partitionType: '',
    ceiling: '',
    roofType: '',
    houseShape: '',
    additionalWorks: '',
    useCustomWorks: false,
    customWorks: [{ name: '', price: 0 }],
    deliveryCity: '',
  });

  // Состояние режима калькулятора
  const [isAdvancedMode, setIsAdvancedMode] = useState(() => {
    const saved = localStorage.getItem('calculatorMode');
    return saved === 'advanced';
  });

  // Сохранение режима в localStorage
  const toggleMode = () => {
    const newMode = !isAdvancedMode;
    setIsAdvancedMode(newMode);
    localStorage.setItem('calculatorMode', newMode ? 'advanced' : 'basic');
  };

  // Функция определения мобильного устройства
  const isMobileDevice = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    const mobileKeywords = ['android', 'iphone', 'ipad', 'ipod', 'blackberry', 'windows phone', 'mobile'];
    const isMobileUserAgent = mobileKeywords.some(keyword => userAgent.includes(keyword));
    const isMobileWidth = window.innerWidth <= 768;
    
    return isMobileUserAgent || isMobileWidth;
  };

  const [isMobile, setIsMobile] = useState(false);

  // Проверка мобильного устройства при загрузке и изменении размера окна
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(isMobileDevice());
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleCalculationChange = useCallback((result: CalculationResult, newArea: number) => {
    setCalculationResult(result);
    setArea(newArea);
  }, []);

  const handleOptionsChange = useCallback((newOptions: { 
    isVatIncluded: boolean; 
    isInstallment: boolean; 
    installmentAmount: number;
    hideFundamentCost: boolean;
    hideKitCost: boolean;
    hideAssemblyCost: boolean;
    hideDeliveryCost: boolean;
  }) => {
    setOptions(newOptions);
  }, []);

  const handleParametersChange = useCallback((newParameters: any) => {
    setParameters(newParameters);
  }, []);

  // Функция для применения НДС и рассрочки к базовому расчету
  const applyAdditionalCharges = (baseResult: CalculationResult, options: { isVatIncluded: boolean; isInstallment: boolean; installmentAmount: number }) => {
    let total = baseResult.total;
    
    // НДС (16% от всей суммы)
    if (options.isVatIncluded) {
      total += total * 0.16;
    }
    
    // Рассрочка (17%)
    if (options.isInstallment) {
      if (options.installmentAmount && options.installmentAmount > 0) {
        // 17% только от введенной суммы рассрочки
        total += options.installmentAmount * 0.17;
      } else {
        // 17% от всей суммы
        total += total * 0.17;
      }
    }
    
    return {
      ...baseResult,
      total: Math.round(total)
    };
  };

  // Получаем итоговый результат с учетом НДС и рассрочки
  const finalResult = applyAdditionalCharges(calculationResult, options);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={`flex justify-between items-center ${isMobile ? 'py-2' : 'py-4'}`}>
            <div className="flex items-center">
              <button 
                onClick={() => window.history.back()} 
                className="mr-4 p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className={`${isMobile ? 'w-5 h-5' : 'w-6 h-6'} text-gray-600`} />
              </button>
              <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-3'}`}>
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <CalcIcon className={`${isMobile ? 'w-5 h-5' : 'w-6 h-6'} text-emerald-600`} />
                </div>
                <div>
                  <h1 className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold text-gray-900`}>
                    {isMobile ? 'Калькулятор СИП' : 'Калькулятор стоимости строительства'}
                  </h1>
                  <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-500`}>
                    {isMobile ? 'Расчет СИП дома' : 'Расчет стоимости СИП дома в черновую'}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Admin Settings Button */}
            {isAdmin && (
              <button
                onClick={() => setIsAdminPanelOpen(true)}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Настройки калькулятора"
              >
                <Settings className={`${isMobile ? 'w-5 h-5' : 'w-6 h-6'}`} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${isMobile ? 'py-4' : 'py-8'}`}>
        {!isMobile && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Home className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Технология</p>
                  <p className="text-xs text-gray-500">СИП панели</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Ruler className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Площадь</p>
                  <p className="text-xs text-gray-500">От 10 до 1500 м²</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <CalcIcon className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Расчет</p>
                  <p className="text-xs text-gray-500">Точный до тенге</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Calculator Content */}
        <div className={`grid grid-cols-1 xl:grid-cols-3 ${isMobile ? 'gap-4' : 'gap-8'}`}>
          {/* Form Section */}
          <div className="xl:col-span-2">
            <div className="bg-white rounded-lg shadow-lg border border-gray-200">
              <div className={`${isMobile ? 'p-4' : 'p-6'} border-b border-gray-200`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-semibold text-gray-900 ${isMobile ? 'mb-1' : 'mb-2'}`}>
                      {isMobile ? 'Параметры дома' : 'Параметры строительства'}
                    </h2>
                    <p className={`text-gray-600 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                      {isMobile ? 'Выберите характеристики' : 'Выберите характеристики дома для точного расчета стоимости'}
                    </p>
                  </div>
                  
                  {/* Mode Toggle */}
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-gray-500 hidden sm:block">
                      {isAdvancedMode ? '⚙️ Профессиональный' : '🔘 Обычный'}
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isAdvancedMode}
                        onChange={toggleMode}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      <span className="ml-2 text-sm font-medium text-gray-700 hidden sm:inline" title="Переключить между обычным и профессиональным режимом">
                        {isAdvancedMode ? 'Проф.' : 'Обычный'}
                      </span>
                      <span className="ml-2 text-xs text-gray-500 sm:hidden">
                        {isAdvancedMode ? '⚙️' : '🔘'}
                      </span>
                    </label>
                  </div>
                </div>
                
                {/* Mode Description */}
                <div className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-500 bg-gray-50 p-3 rounded-lg mb-4`}>
                  {isAdvancedMode ? (
                    <span>⚙️ <strong>Профессиональный режим:</strong> Доступны все параметры для детальной настройки</span>
                  ) : (
                    <span>🔘 <strong>Обычный режим:</strong> Основные параметры для быстрого расчета</span>
                  )}
                </div>
              </div>
              
              <div className={`${isMobile ? 'p-4' : 'p-6'}`}>
                <CalculatorForm 
                  onCalculationChange={handleCalculationChange} 
                  onOptionsChange={handleOptionsChange}
                  onParametersChange={handleParametersChange}
                  isAdvancedMode={isAdvancedMode}
                />
              </div>
            </div>
          </div>

          {/* Summary Section */}
          <div className="xl:col-span-1">
            <div className={`${isMobile ? '' : 'sticky top-4'}`}>
              <PriceSummary result={finalResult} area={area} options={options} />

              {/* Калькулятор ЗП руководителя строительства */}
              <div className="mt-4 bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                <button
                  type="button"
                  onClick={() => setIsSupervisorSalaryOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg hover:bg-amber-100 focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 transition-colors font-medium text-sm"
                >
                  <UserCog className="w-4 h-4 flex-shrink-0" />
                  Рассчитать ЗП руководителя строительства
                </button>
              </div>
              
              {/* Additional Info */}
              {finalResult.total > 0 && !isMobile && (
                <div className="mt-6 bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                  <h4 className="font-medium text-gray-900 mb-3">ℹ️ Информация</h4>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>• Цены указаны в тенге <span className="text-red-600 font-bold">{options.isVatIncluded ? 'С НДС' : 'БЕЗ НДС'}</span></p>
                    <p>• Сроки строительства: 30-45 дней</p>
                    <p>• Гарантия на дом: 3 года</p>
                    <p>• {options.isInstallment ? (
                      options.installmentAmount > 0 
                        ? `Рассрочка применяется к: ${new Intl.NumberFormat('ru-RU').format(options.installmentAmount)} ₸`
                        : 'Оплата возможна в рассрочку (от всей суммы)'
                    ) : 'Без рассрочки'}</p>
                    <p>• Включает все материалы и работы</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Commercial Proposal */}
        <CommercialProposal
          area={area}
          parameters={parameters}
          result={finalResult}
          options={options}
        />

        {/* Help Text */}
        {!isMobile && (
          <div className="mt-12 bg-emerald-50 border border-emerald-200 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg mt-1">
                <CalcIcon className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-emerald-900 mb-2">
                  Как пользоваться калькулятором
                </h3>
                <div className="text-emerald-700 text-sm space-y-1">
                  <p>1. Введите площадь дома (от 10 до 1500 м²)</p>
                  <p>2. Выберите тип фундамента и количество этажей</p>
                  <p>3. Настройте высоту этажей и тип перегородок</p>
                  <p>4. Выберите тип крыши, потолка и дополнительные работы</p>
                  <p>5. Получите точный расчет с разбивкой по статьям</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Admin Panel */}
      <CalculatorAdminPanel 
        isOpen={isAdminPanelOpen} 
        onClose={() => setIsAdminPanelOpen(false)} 
      />

      {/* Калькулятор ЗП руководителя (технадзор): modal на desktop, bottom sheet на mobile */}
      <SupervisorSalaryModal
        isOpen={isSupervisorSalaryOpen}
        onClose={() => setIsSupervisorSalaryOpen(false)}
        isMobile={isMobile}
      />
    </div>
  );
}; 