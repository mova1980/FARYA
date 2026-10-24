export type Pizza = {
  id: string;
  name: string;
  fa: string;
  meaning: string;
  image: string;
  ingredients: string;
  note: string;
  accent: string;
  code: string;
};

/** Single source of truth shared by the homepage and the public online menu. */
export const PIZZAS: Pizza[] = [
  {
    id: 'flora', code: 'FARYA-FLORA', name: 'Flora', fa: 'فلورا', meaning: 'شکوفایی', image: '/images/flora.webp',
    ingredients: 'خمیر پیتزا، پنیر موزارلا، سس پیتزا، مرغ، قارچ، پیاز، فینیشینگ ریحان، سس بالزامیک، پنیر پارمزان، سبزیجات گارنیش',
    note: 'مرغ، قارچ و پیاز؛ با فینیشینگ ریحان و سس بالزامیک.', accent: 'ریحان و بالزامیک',
  },
  {
    id: 'fortuna', code: 'FARYA-FORTUNA', name: 'Fortuna', fa: 'فورتونا', meaning: 'خوش‌اقبالی', image: '/images/fortuna.webp',
    ingredients: 'خمیر پیتزا، پنیر موزارلا، سس آلفردو، بولادیف (گوشت ریش‌ریش‌شده)، پپرونی تخمیری، قارچ، چیپس کدوچه، پیازچه، درسنینگ پرتقال، سبزیجات گارنیش',
    note: 'بولادیف، پپرونی تخمیری و درسنینگ پرتقال.', accent: 'بولادیف و درسنینگ پرتقال',
  },
  {
    id: 'fama', code: 'FARYA-FAMA', name: 'Fama', fa: 'فاما', meaning: 'شهرت و آوازه', image: '/images/fama.webp',
    ingredients: 'خمیر پیتزا، پنیر موزارلا، سس پونا، کدو سبز، بادمجان، قارچ، پیاز، چیپس گوجه، فینیشینگ ریحان، درسنینگ بالزامیک، پنیر پارمزان، سبزیجات گارنیش',
    note: 'کدو سبز و بادمجان با چیپس گوجه، ریحان و درسنینگ بالزامیک.', accent: 'چیپس گوجه و ریحان',
  },
  {
    id: 'fides', code: 'FARYA-FIDES', name: 'Fides', fa: 'فیدِس', meaning: 'اعتماد و وفاداری', image: '/images/fides.webp',
    ingredients: 'خمیر پیتزا، پنیر موزارلا، سس مدوسا، استیک، قارچ، چیپس گوجه، سس بلونا، فینیشینگ کاپی، درسنینگ بالزامیک، پنیر پارمزان، سبزیجات گارنیش',
    note: 'استیک و قارچ با سس مدوسا و فینیشینگ کاپی.', accent: 'استیک و سس مدوسا',
  },
  {
    id: 'farya', code: 'FARYA-FARYA', name: 'Farya', fa: 'فریا', meaning: 'عشق', image: '/images/farya.webp',
    ingredients: 'خمیر پیتزا، پنیر موزارلا، سس بلونا، بولادیف، قارچ، پیاز، چیپس گوجه، درسنینگ بالزامیک، فینیشینگ کاپی، پارمزان، سبزیجات گارنیش',
    note: 'بولادیف، قارچ و چیپس گوجه با فینیشینگ کاپی.', accent: 'بولادیف و چیپس گوجه',
  },
  {
    id: 'feronia', code: 'FARYA-FERONIA', name: 'Feronia', fa: 'فرونیا', meaning: 'آزادی و رهایی', image: '/images/feronia.webp',
    ingredients: 'خمیر پیتزا، پنیر موزارلا، سس پاپونا، میت‌بال (گوشت چرخ‌کرده)، گوجه گیلاسی، پیاز، قارچ، فینیشینگ کاپی، درسنینگ بالزامیک',
    note: 'میت‌بال و گوجهٔ گیلاسی با فینیشینگ کاپی.', accent: 'میت‌بال و گوجهٔ گیلاسی',
  },
  {
    id: 'faenna', code: 'FARYA-FAENNA', name: 'Faenna', fa: 'فائنا', meaning: 'درخشندگی', image: '/images/faenna.webp',
    ingredients: 'خمیر پیتزا، پنیر موزارلا، سس پونا، پپرونی تخمیری، هالوپینو، سبزیجات گارنیش، فینیشینگ کاپی، درسنینگ بالزامیک، پارمزان',
    note: 'پپرونی تخمیری و هالوپینو با فینیشینگ کاپی.', accent: 'پپرونی و هالوپینو',
  },
];
