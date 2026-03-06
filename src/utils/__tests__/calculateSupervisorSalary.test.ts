import { describe, expect, it } from 'vitest';
import { calculateSupervisorSalary } from '../calculateSupervisorSalary';

describe('calculateSupervisorSalary', () => {
  it('area=50 => 70_000 (контрольное значение)', () => {
    expect(calculateSupervisorSalary(50)).toBe(70_000);
  });

  it('area=100 => 80_000 (контрольное значение)', () => {
    expect(calculateSupervisorSalary(100)).toBe(80_000);
  });

  it('area=120 => 88_000 (обязательный якорь)', () => {
    expect(calculateSupervisorSalary(120)).toBe(88_000);
  });

  it('area=122 => больше 88_000 и отличается от результата для 120', () => {
    const pay120 = calculateSupervisorSalary(120)!;
    const pay122 = calculateSupervisorSalary(122)!;
    expect(pay120).toBe(88_000);
    expect(pay122).toBeGreaterThan(88_000);
    expect(pay122).not.toBe(pay120);
    // 120–150: t=(122-120)/(150-120)=2/30, pay=88000+(2/30)*7000≈88467
    expect(pay122).toBe(88_467);
  });

  it('area=1500 => 350_000 (обязательный якорь)', () => {
    expect(calculateSupervisorSalary(1500)).toBe(350_000);
  });

  it('area=30 => 60_000 (минимальный якорь)', () => {
    expect(calculateSupervisorSalary(30)).toBe(60_000);
  });

  it('area < минимального якоря => pay минимального якоря (60_000)', () => {
    expect(calculateSupervisorSalary(29)).toBe(60_000);
    expect(calculateSupervisorSalary(0)).toBe(60_000);
  });

  it('градиент 1500–2000: 1600 => 360_000, 1750 => 375_000, 2000 => 400_000', () => {
    expect(calculateSupervisorSalary(1600)).toBe(360_000);
    expect(calculateSupervisorSalary(1750)).toBe(375_000);
    expect(calculateSupervisorSalary(2000)).toBe(400_000);
  });

  it('1999 м² меньше 400_000 (интерполяция до 2000)', () => {
    const pay1999 = calculateSupervisorSalary(1999)!;
    expect(pay1999).toBeLessThan(400_000);
    expect(pay1999).toBe(399_900); // 350000 + (499/500)*50000
  });

  it('площадь больше 2000 ограничивается 2000 => 400_000', () => {
    expect(calculateSupervisorSalary(2001)).toBe(400_000);
    expect(calculateSupervisorSalary(3000)).toBe(400_000);
  });

  it('линейная интерполяция между якорями: 40 между 30 и 50 => 65_000', () => {
    expect(calculateSupervisorSalary(40)).toBe(65_000);
  });

  it('возвращает целое число (Math.round)', () => {
    const result = calculateSupervisorSalary(35);
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBe(62_500); // 60000 + (5/20)*10000
  });

  it('возвращает null только для NaN', () => {
    expect(calculateSupervisorSalary(NaN)).toBeNull();
  });
});
