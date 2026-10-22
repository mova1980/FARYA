export type OverheadKind = 'per-portion' | 'monthly' | 'percent';

export interface PricePoint {
  id: string;
  price: number;
  date: string; // 1400/04/16
  note?: string;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  prices: PricePoint[];
  note?: string;
  createdAt?: string;
  /** if set, the price of this ingredient is computed from a semi-finished recipe */
  subRecipeId?: string | null;
}

export interface RecipeStep {
  ingredientId: string;
  qty: number;
}

export interface MenuItem {
  id: string;
  code: string;
  name: string;
  category: string;
  image?: string;
  recipe: RecipeStep[];
  /** هزینه ظرف */
  containerCost: number;
  /** ضریب تبدیل / افت و پخت */
  coef: number;
  /** نیمه‌ساخته: بازدهی دستور */
  yieldQty?: number | null;
  yieldUnit?: string | null;
  overheadIds: string[];
  /** اگر مقدار داشته باشد، جمعِ سربارهای تخصیصی نادیده گرفته می‌شود */
  overheadFixed?: number | null;
  /** ضریب اضافیِ اختصاصیِ سربار (اگر null باشه از تنظیمات سراسری استفاده می‌شود) */
  overheadExtraCoef?: number | null;
  unitLabel: string;
  oldPrice?: number | null;
  price?: number | null;
  active: boolean;
  note?: string;
}

export interface Overhead {
  id: string;
  name: string;
  kind: OverheadKind;
  amount: number;
  /** تعداد پرس ماهانه برای تسهیم سربارهای ماهانه */
  volume?: number;
  active: boolean;
  note?: string;
}

export interface Settings {
  restaurant: string;
  restaurantFa: string;
  chef: string;
  currency: string;
  /** ضریب اضافی سراسری که روی سربار اعمال می‌شود */
  overheadExtraCoef: number;
  targetMargin: number;
  monthlyPortions: number;
  priceSource: string;
}

export interface Computed {
  material: number;      // بهای مواد
  coefValue: number;     // عددِ ضریب
  afterCoef: number;     // بهای مواد × ضریب
  overheadBase: number;  // جمع سربار تخصیصی
  overhead: number;      // بعد از ضریب اضافی
  container: number;     // هزینه ظرف
  total: number;         // بهای تمام شده
  unitCost: number;      // بهای تمام شدهٔ هر واحد (برای نیمه‌ساخته)
  price: number | null;
  oldPrice: number | null;
  profit: number | null;
  margin: number | null;      // ۰ تا ۱
  foodCost: number | null;    // ۰ تا ۱
  suggested: number;
  extraCoef: number;
}

export interface AppState {
  ingredients: Ingredient[];
  items: MenuItem[];
  overheads: Overhead[];
  settings: Settings;
  updatedAt: string;
}
