import { isPreparationCategory, type AppState, type Computed, type Ingredient, type MenuItem, type Overhead } from './types';

export interface EngineResult {
  byItem: Record<string, Computed>;
  priceOf: Record<string, number>;
  sourceOf: Record<string, 'manual' | 'recipe'>;
  cycle: string[];
}

export const EMPTY_COMPUTED: Computed = {
  material: 0, coefValue: 1, afterCoef: 0, overheadBase: 0, overhead: 0,
  container: 0, total: 0, unitCost: 0, price: null, oldPrice: null,
  profit: null, margin: null, foodCost: null, suggested: 0, extraCoef: 0,
  missingCostInputs: [], costComplete: true,
};

export function manualPrice(ing: Ingredient | undefined): number {
  if (!ing || !ing.prices || !ing.prices.length) return 0;
  return Number(ing.prices[ing.prices.length - 1].price) || 0;
}

export function hasKnownPrice(ing: Ingredient | undefined): boolean {
  if (!ing?.prices?.length) return false;
  const latest = ing.prices[ing.prices.length - 1];
  const value = Number(latest.price);
  return value > 0 || /رایگان|بدون\s*هزینه|free/i.test(latest.note || '');
}

export function previousPrice(ing: Ingredient | undefined): number | null {
  if (!ing || !ing.prices || ing.prices.length < 2) return null;
  return Number(ing.prices[ing.prices.length - 2].price) || null;
}

/** Calculate recipe and overhead costs recursively; never call incomplete costs complete. */
export function computeAll(state: AppState): EngineResult {
  const ings: Record<string, Ingredient> = {};
  state.ingredients.forEach((i) => { ings[i.id] = i; });
  const items: Record<string, MenuItem> = {};
  state.items.forEach((i) => { items[i.id] = i; });
  const ovh: Record<string, Overhead> = {};
  state.overheads.forEach((o) => { ovh[o.id] = o; });

  const byItem: Record<string, Computed> = {};
  const priceOf: Record<string, number> = {};
  const sourceOf: Record<string, 'manual' | 'recipe'> = {};
  const missingByItem: Record<string, string[]> = {};
  const cycle: string[] = [];
  const memo: Record<string, number> = {};
  const stack: string[] = [];

  const unitCost = (itemId: string): number => {
    if (memo[itemId] !== undefined) return memo[itemId];
    if (stack.includes(itemId)) {
      cycle.push(itemId);
      return 0;
    }
    stack.push(itemId);
    const item = items[itemId];
    if (!item) { stack.pop(); return 0; }
    let material = 0;
    const missing = new Set<string>();
    if (!item.recipe?.length) missing.add('رسپی ثبت نشده');

    (item.recipe || []).forEach((step) => {
      const ing = ings[step.ingredientId];
      if (!ing) { missing.add(`شناسهٔ ماده پیدا نشد: ${step.ingredientId}`); return; }
      const qty = Number(step.qty) || 0;
      if (qty <= 0) missing.add(`مقدارِ ${ing.name} باید بیشتر از صفر باشد`);
      let p: number;
      if (ing.subRecipeId) {
        if (!items[ing.subRecipeId]) {
          missing.add(`دستورِ نیمه‌ساختهٔ «${ing.name}» پیدا نشد`);
          p = 0;
        } else if (stack.includes(ing.subRecipeId)) {
          missing.add(`چرخه در دستورِ «${ing.name}»`);
          cycle.push(ing.subRecipeId);
          p = 0;
        } else {
          p = unitCost(ing.subRecipeId);
          (missingByItem[ing.subRecipeId] || []).forEach((entry) => missing.add(entry));
        }
        sourceOf[ing.id] = 'recipe';
      } else {
        p = manualPrice(ing);
        if (!hasKnownPrice(ing)) missing.add(ing.name);
        sourceOf[ing.id] = 'manual';
      }
      priceOf[ing.id] = p;
      material += qty * p;
    });

    const coefValue = Number(item.coef) || 1;
    const afterCoef = material * coefValue;
    let overheadBase = 0;
    if (item.overheadFixed !== null && item.overheadFixed !== undefined) {
      overheadBase = Number(item.overheadFixed) || 0;
    } else {
      (item.overheadIds || []).forEach((id) => {
        const o = ovh[id];
        if (!o || !o.active) return;
        const amount = Number(o.amount) || 0;
        if (o.kind === 'per-portion') overheadBase += amount;
        else if (o.kind === 'monthly') {
          const vol = Number(o.volume) || Number(state.settings.monthlyPortions) || 1;
          overheadBase += amount / vol;
        } else if (o.kind === 'percent') overheadBase += (material * amount) / 100;
      });
    }
    const extraCoef = item.overheadExtraCoef !== null && item.overheadExtraCoef !== undefined
      ? Number(item.overheadExtraCoef)
      : Number(state.settings.overheadExtraCoef) || 0;
    const overhead = overheadBase * (1 + extraCoef);
    const container = Number(item.containerCost) || 0;
    const total = afterCoef + overhead + container;
    const yieldQty = Number(item.yieldQty) || 1;
    const isPreparation = isPreparationCategory(item.category);
    const unit = isPreparation ? total / yieldQty : total;
    const missingCostInputs = Array.from(missing);
    const costComplete = missingCostInputs.length === 0;

    memo[itemId] = unit;
    missingByItem[itemId] = missingCostInputs;
    stack.pop();

    const price = item.price === null || item.price === undefined ? null : Number(item.price);
    const oldPrice = item.oldPrice === null || item.oldPrice === undefined ? null : Number(item.oldPrice);
    const profit = !costComplete || price === null ? null : price - total;
    const margin = !costComplete || !price ? null : profit! / price;
    const foodCost = !costComplete || !price ? null : material / price;
    const target = Number(state.settings.targetMargin) || 0;
    const suggested = costComplete && total > 0 && target < 1
      ? Math.ceil(total / (1 - target) / 500) * 500 : 0;

    byItem[itemId] = {
      material, coefValue, afterCoef, overheadBase, overhead, container, total,
      unitCost: unit, price, oldPrice, profit, margin, foodCost, suggested, extraCoef,
      missingCostInputs, costComplete,
    };
    return unit;
  };

  state.items.forEach((it) => unitCost(it.id));
  return { byItem, priceOf, sourceOf, cycle };
}

/** Summary excludes unfinished recipes and products with incomplete ingredient prices. */
export function summarize(state: AppState, engine: EngineResult) {
  const menu = state.items.filter((i) =>
    i.category === 'پیتزا' && i.active && (i.price || 0) > 0 && engine.byItem[i.id]?.costComplete,
  );
  const comps = menu.map((i) => engine.byItem[i.id]).filter(Boolean);
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const totalCost = avg(comps.map((c) => c.total));
  const avgMargin = avg(comps.map((c) => (c.margin == null ? 0 : c.margin)));
  const avgFood = avg(comps.map((c) => (c.foodCost == null ? 0 : c.foodCost)));
  const avgProfit = avg(comps.map((c) => (c.profit == null ? 0 : c.profit)));
  const belowTarget = comps.filter((c) => c.margin != null && c.margin < (state.settings.targetMargin || 0)).length;
  const struct = {
    material: comps.reduce((a, c) => a + c.afterCoef, 0),
    overhead: comps.reduce((a, c) => a + c.overhead, 0),
    container: comps.reduce((a, c) => a + c.container, 0),
  };
  return {
    itemCount: menu.length,
    semiCount: state.items.filter((i) => isPreparationCategory(i.category)).length,
    ingredientCount: state.ingredients.filter((i) => !i.subRecipeId).length,
    incompleteCount: state.items.filter((i) => i.category === 'پیتزا' && i.active && !engine.byItem[i.id]?.costComplete).length,
    avgCost: totalCost,
    avgMargin,
    avgFood,
    avgProfit,
    belowTarget,
    struct,
    pricedCount: comps.filter((c) => c.price).length,
  };
}
