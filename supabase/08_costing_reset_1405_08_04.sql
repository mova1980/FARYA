-- FARYA | Full costing refresh from the user's 1405/08/04 purchase sheet and pizza BOM.
-- Existing data are first preserved in restricted schema farya_archive.
-- This is a one-time destructive reset of ACTIVE costing data; do not run twice.
-- Monetary values are Toman. Prices used by recipes are normalized to Toman/gram.

begin;

-- Protective snapshot, in addition to the separately recorded pre-reset archive.
create schema if not exists farya_archive;
revoke all on schema farya_archive from public, anon, authenticated;
create table farya_archive.costing_snapshot_before_pizza_reset_1405_08_04 as
select now() as archived_at,
       jsonb_build_object(
         'app_state', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.app_state t),
         'app_state_history', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.app_state_history t),
         'settings', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.settings t),
         'menu_items', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.menu_items t),
         'ingredients', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.ingredients t),
         'price_points', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.price_points t),
         'recipe_steps', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.recipe_steps t),
         'overheads', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.overheads t),
         'item_overheads', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.item_overheads t)
       ) as payload;
revoke all on table farya_archive.costing_snapshot_before_pizza_reset_1405_08_04 from public, anon, authenticated;

-- Keep all nine overhead rows and replace the stale 6,000-per-portion input.
-- Monthly costs are spread over the user's current 1,000 pizzas/month.
update public.overheads set amount=0, active=false, note='قدیمی و فاقد اعتبار؛ با ریزهزینه‌های ثبت‌شدهٔ 1405/08/04 جایگزین شد.', updated_at=now() where id='ovh-001';
update public.overheads set amount=70000000, volume=1000, active=true, note='اجاره ماهانه بر اساس اعلام کاربر؛ تقسیم بر ۱۰۰۰ پیتزا در ماه.', updated_at=now() where id='ovh-002';
update public.overheads set amount=120000000, volume=1000, active=true, note='حقوق ماهانه اعلامی کاربر؛ بیمه و هزینه کارفرما در مبلغ اعلام‌شده روشن نیست.', updated_at=now() where id='ovh-003';
update public.overheads set amount=9000000, volume=1000, active=true, note='آب، برق و گاز ماهانه بر اساس اعلام کاربر.', updated_at=now() where id='ovh-004';
update public.overheads set amount=26000, active=true, note='هزینه جعبه پیتزا به‌ازای هر عدد بر اساس برگه خرید؛ فرض یک جعبه برای هر پیتزا.', updated_at=now() where id='ovh-005';
update public.overheads set amount=3000000, volume=1000, active=true, note='استهلاک ماهانه بر اساس اعلام کاربر.', updated_at=now() where id='ovh-006';
update public.overheads set amount=60000000, volume=1000, active=true, note='تبلیغات ماهانه بر اساس اعلام کاربر.', updated_at=now() where id='ovh-007';
update public.overheads set amount=7000000, volume=1000, active=true, note='تعمیر و نگهداری ماهانه بر اساس اعلام کاربر.', updated_at=now() where id='ovh-008';
update public.overheads set amount=3.5, active=true, note='برآورد موقتِ میانهٔ بازهٔ ۲٪ تا ۵٪ اعلام‌شده؛ درصد از مواد مستقیم محاسبه می‌شود و باید با دادهٔ واقعی پرت جایگزین شود.', updated_at=now() where id='ovh-009';

-- Remove old active products, ingredient catalog, cost history, recipes and assignments.
delete from public.item_overheads;
delete from public.recipe_steps;
delete from public.price_points;
delete from public.ingredients;
delete from public.menu_items;
delete from public.app_state_history;

-- Eight app items: seven sellable pizzas plus one hidden semi-finished dough recipe.
insert into public.menu_items
  (id,code,name,category,image,container_cost,coef,yield_qty,yield_unit,
   overhead_extra_coef,overhead_fixed,unit_label,old_price,price,active,note,sort_order)
values
 ('pizza-flora','FARYA-FLORA','Flora','پیتزا','pizza.jpg',0,1,null,null,null,null,'پرس',null,null,true,'قیمت فروش و سربار تا دریافت مقادیر تأییدشده خالی است.',0),
 ('pizza-fortuna','FARYA-FORTUNA','Fortuna','پیتزا','pizza.jpg',0,1,null,null,null,null,'پرس',null,null,true,'قیمت فروش و سربار تا دریافت مقادیر تأییدشده خالی است.',1),
 ('pizza-fama','FARYA-FAMA','Fama','پیتزا','pizza.jpg',0,1,null,null,null,null,'پرس',null,null,true,'قیمت فروش و سربار تا دریافت مقادیر تأییدشده خالی است.',2),
 ('pizza-fides','FARYA-FIDES','Fides','پیتزا','pizza.jpg',0,1,null,null,null,null,'پرس',null,null,true,'قیمت فروش و سربار تا دریافت مقادیر تأییدشده خالی است.',3),
 ('pizza-farya','FARYA-FARYA','Farya','پیتزا','pizza.jpg',0,1,null,null,null,null,'پرس',null,null,true,'قیمت فروش و سربار تا دریافت مقادیر تأییدشده خالی است.',4),
 ('pizza-feronia','FARYA-FERONIA','Feronia','پیتزا','pizza.jpg',0,1,null,null,null,null,'پرس',null,null,true,'قیمت فروش و سربار تا دریافت مقادیر تأییدشده خالی است.',5),
 ('pizza-faenna','FARYA-FAENNA','Faenna','پیتزا','pizza.jpg',0,1,null,null,null,null,'پرس',null,null,true,'قیمت فروش و سربار تا دریافت مقادیر تأییدشده خالی است.',6),
 ('semi-dough-300g','FARYA-DOUGH-300G','خمیر پیتزا — دستور برآوردی ۳۰۰ گرم','نیمه‌ساخته','',0,1,300,'گرم',null,null,'گرم',null,null,true,'برآورد اولیه: ۱۸۰ گرم آرد سمولینا + ۱۱۵٫۷ گرم آب + ۴ گرم نمک + ۰٫۳ گرم مخمر. نیازمند تأیید سرآشپز؛ قیمت نمک/مخمر/آب خالی است.',7);

-- Full purchase list from image 1. Stock/package details are retained in notes.
-- Blank prices are intentional where the image has a red question mark, a shared total,
-- a conflicting total, or an unknown package weight/unit.
insert into public.ingredients (id,name,unit,note,sub_recipe_id,created_jdate,sort_order) values
 ('ing-dough','خمیر پیتزا','گرم','برای هر پیتزا ۳۰۰ گرم؛ زیررسپی semi-dough-300g.', 'semi-dough-300g','1405/08/04',0),
 ('ing-semolina','آرد سمولینا','گرم','موجودی تصویر: ۲۰ کیلوگرم؛ مبلغ کل ۴٬۵۰۰٬۰۰۰ تومان؛ ۲۲۵ تومان/گرم از تقسیم کل بر موجودی. انتخاب این آرد برای خمیر برآوردی است.',null,'1405/08/04',1),
 ('ing-water','آب','گرم','خمیر برآوردی: ۱۱۵٫۷ گرم؛ در برگه قیمت آبِ مصرفی درج نشده است.',null,'1405/08/04',2),
 ('ing-salt','نمک','گرم','موجودی ۲ بسته و قیمت ۳۵٬۰۰۰ تومان/بسته؛ وزن بسته مشخص نیست، بنابراین بهای هر گرم خالی مانده است.',null,'1405/08/04',3),
 ('ing-yeast','مخمر','گرم','موجودی ۱۰ واحد؛ قیمت ۸۰٬۰۰۰ درج شده اما واحد خرید با علامت سؤال مشخص است؛ قیمت هر گرم خالی مانده است.',null,'1405/08/04',4),
 ('ing-mozzarella','پنیر موزارلا','گرم','موجودی ۱ کیلوگرم؛ قیمت ۸۹۰٬۰۰۰ تومان/کیلوگرم؛ نرمال‌شده به ۸۹۰ تومان/گرم.',null,'1405/08/04',5),
 ('ing-sauce-pizza','سس پیتزا','گرم','مقدار دستور فلورا ۸۰ گرم؛ نام در تصویر دستور کمی ناخواناست و مطابق نام منوی سایت ثبت شد؛ قیمت خرید در برگه روشن نیست.',null,'1405/08/04',6),
 ('ing-chicken','مرغ / سینه مرغ','گرم','موجودی ۱۵ کیلوگرم سینه مرغ؛ قیمت ۸۰۰٬۰۰۰ تومان/کیلوگرم؛ نرمال‌شده به ۸۰۰ تومان/گرم.',null,'1405/08/04',7),
 ('ing-mushroom','قارچ','گرم','موجودی ۱۰ کیلوگرم؛ قیمت ۳۸۰٬۰۰۰ تومان/کیلوگرم؛ نرمال‌شده به ۳۸۰ تومان/گرم.',null,'1405/08/04',8),
 ('ing-onion','پیاز','گرم','موجودی ۱۰ کیلوگرم؛ قیمت ۹۵٬۰۰۰ تومان/کیلوگرم؛ نرمال‌شده به ۹۵ تومان/گرم.',null,'1405/08/04',9),
 ('ing-basil-sauce','سس ریحان','گرم','موجودی/قیمت این سس در فهرست خرید مشخص نیست؛ قیمت خالی.',null,'1405/08/04',10),
 ('ing-parmesan','پنیر پارمزان','گرم','موجودی ۲ بسته؛ قیمت ۲٬۱۷۵٬۰۰۰ تومان/بسته، اما وزن بسته درج نشده؛ بهای هر گرم خالی.',null,'1405/08/04',11),
 ('ing-garnish','سبزیجات گارنیش','گرم','مقدار BOM درج شده؛ ترکیب و قیمت خرید نامشخص، خالی.',null,'1405/08/04',12),
 ('ing-sauce-alfredo','سس آلفردو','گرم','مقدار BOM فورتونا ۷۰ گرم؛ قیمت خرید/رسپی سس در تصویر مشخص نیست.',null,'1405/08/04',13),
 ('ing-shredded-beef','بولاد بیف / گوشت ریش‌ریش','گرم','مقدار BOM ثبت شد؛ قیمت گوشت خامِ گوساله مستقیماً معادل گوشت پخته و افت‌خورده نیست؛ قیمت خالی تا ثبت بازده پخت.',null,'1405/08/04',14),
 ('ing-pepperoni','پپرونی','گرم','موجودی ۲ واحد و مبلغ ۱٬۶۹۰٬۰۰۰ درج شده؛ واحد/وزن بسته با علامت سؤال است، قیمت هر گرم خالی.',null,'1405/08/04',15),
 ('ing-finishing-baluna','فینیشینگ بلونا','گرم','مقدار BOM ثبت شد؛ قیمت خرید/رسپی نامشخص، خالی.',null,'1405/08/04',16),
 ('ing-gouda','پنیر گودا','گرم','مقدار BOM ثبت شد؛ در برگهٔ خرید قیمت روشن و قابل‌تبدیل به گرم پیدا نشد.',null,'1405/08/04',17),
 ('ing-sauce-puna','سس پونا / لونا','گرم','نام سس در تصویر BOM مبهم است؛ مطابق نام سایت «سس پونا» ثبت شد؛ قیمت خالی.',null,'1405/08/04',18),
 ('ing-zucchini','کدو سبز','گرم','موجودی ۴ کیلوگرم؛ قیمت ۱۰۰٬۰۰۰ تومان/کیلوگرم؛ ۱۰۰ تومان/گرم.',null,'1405/08/04',19),
 ('ing-eggplant','بادمجان','گرم','موجودی ۶ کیلوگرم؛ قیمت ۱۳۰٬۰۰۰ تومان/کیلوگرم؛ ۱۳۰ تومان/گرم.',null,'1405/08/04',20),
 ('ing-tomato-chips','چیپس گوجه / گوجه خشک','گرم','برآورد اتصال به ردیف «گوجه خشک»: ۱ کیلوگرم با قیمت ۱٬۹۰۰٬۰۰۰ تومان؛ ۱٬۹۰۰ تومان/گرم. اگر چیپس گوجه محصول متفاوتی است، قیمت را اصلاح کنید.',null,'1405/08/04',21),
 ('ing-finishing-basil','فینیشینگ ریحان','گرم','قیمت خرید/فرمول آماده‌سازی نامشخص، خالی.',null,'1405/08/04',22),
 ('ing-balsamic-dressing','درسنینگ بالزامیک','گرم','سرکه بالزامیکِ خریداری‌شده با درسنینگ آماده یکسان فرض نشده؛ قیمت خالی.',null,'1405/08/04',23),
 ('ing-jalapeno','فلفل هالوپینو','گرم','موجودی ۱ شیشه با قیمت ۱۳۰٬۰۰۰ تومان؛ وزن خالص شیشه مشخص نیست، قیمت هر گرم خالی.',null,'1405/08/04',24),
 ('ing-finishing-kaki','فینیشینگ کاپی','گرم','مقدار BOM ثبت شد؛ قیمت خرید/فرمول آماده‌سازی نامشخص، خالی.',null,'1405/08/04',25),
 ('ing-sauce-medusa','سس مدوسا','گرم','قیمت خرید/رسپی مشخص نیست، خالی.',null,'1405/08/04',26),
 ('ing-steak','استیک گوشت گوساله','گرم','برآورد موقت از ردیف گوشت گوساله: ۱۰ کیلوگرم، ۲٬۰۰۰٬۰۰۰ تومان/کیلوگرم = ۲٬۰۰۰ تومان/گرم؛ برش و افت پخت تأیید نشده.',null,'1405/08/04',27),
 ('ing-sauce-beluna','سس بلونا','گرم','قیمت خرید/رسپی مشخص نیست، خالی.',null,'1405/08/04',28),
 ('ing-caramelized-onion','پیاز کاراملی / مزه‌دار','گرم','BOM مقدار ۲۰ گرم را نشان می‌دهد؛ نسبت پخت/افت برای تبدیل به پیاز خام داده نشده؛ قیمت خالی.',null,'1405/08/04',29),
 ('ing-sauce-papona','سس پاپونا','گرم','قیمت خرید/رسپی مشخص نیست، خالی.',null,'1405/08/04',30),
 ('ing-meatball','میت‌بال','گرم','مقدار BOM ثبت شد؛ گوشت چرخ‌کردهٔ خام را بدون رسپی و بازده معادل میت‌بال فرض نکردم؛ قیمت خالی.',null,'1405/08/04',31),
 ('ing-cherry-tomato','گوجه گیلاسی','گرم','موجودی ۳ کیلوگرم؛ قیمت ۱۸۵٬۰۰۰ تومان/کیلوگرم؛ ۱۸۵ تومان/گرم.',null,'1405/08/04',32),
 ('inv-walnut','گردو','کیلو','موجودی ۱ کیلوگرم؛ قیمت ۲٬۰۰۰٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',33),
 ('inv-vinegar-date','سرکه خرما','شیشه','موجودی ۳ شیشه؛ مبلغ کل ۱۰٬۵۰۰٬۰۰۰ برای سه ردیف سرکه/روغن به‌صورت تجمیعی درج شده؛ تفکیک قیمت ممکن نیست، خالی.',null,'1405/08/04',34),
 ('inv-vinegar-balsamic','سرکه بالزامیک','شیشه','موجودی ۳ شیشه؛ مبلغ کل تجمیعی گروهی، قیمت واحد نامشخص، خالی.',null,'1405/08/04',35),
 ('inv-olive-oil','روغن زیتون','شیشه','موجودی ۳ شیشه؛ مبلغ کل تجمیعی گروهی، قیمت واحد نامشخص، خالی.',null,'1405/08/04',36),
 ('inv-cooking-oil','روغن پخت و پز','بطری ۸۰۰ گرمی','قیمت واحد ۳۳۴٬۰۰۰ درج شده اما مبلغ کل ۴٬۰۰۸٬۰۰۰ با موجودی ۱ بطری سازگار نیست؛ قیمت برای جلوگیری از ثبت ناسازگار خالی.',null,'1405/08/04',37),
 ('inv-labneh','پنیر لبنه','بسته ۸۰۰ گرمی','موجودی ۸ بسته؛ قیمت واحد ۴۰۴٬۰۰۰ تومان/بسته.',null,'1405/08/04',38),
 ('inv-cream-cheese','پنیر خامه‌ای','بسته ۸۰۰ گرمی','موجودی ۶ بسته؛ مبلغ/قیمت واحد در تصویر قابل‌تفکیک نیست، خالی.',null,'1405/08/04',39),
 ('inv-cream','خامه','بسته ۸۰۰ گرمی','موجودی ۸ بسته؛ قیمت واحد با علامت سؤال؛ مبلغ کل تجمیعی/مبهم، خالی.',null,'1405/08/04',40),
 ('inv-orange-flour','آرد نارنجی','کیلو','موجودی ۲۰ کیلوگرم؛ مبلغ کل ۲٬۶۵۰٬۰۰۰ تومان؛ ۱۳۲٬۵۰۰ تومان/کیلو از تقسیم کل بر موجودی.',null,'1405/08/04',41),
 ('inv-sour-cherry','آلبالو','کیلو','موجودی ۱ کیلوگرم؛ قیمت ۴۵۰٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',42),
 ('inv-corn','ذرت','کیلو','موجودی ۵ کیلوگرم؛ قیمت ۹۶۰٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',43),
 ('inv-lemon','لیموترش','کیلو','موجودی ۲ کیلوگرم؛ قیمت ۴۰۰٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',44),
 ('inv-sugar','شکر','کیلو','موجودی ۲ کیلوگرم؛ قیمت ۱۸۰٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',45),
 ('inv-poneh','پونه','کیلو','جزو گروه ادویه با مبلغ کل ۴٬۰۰۰٬۰۰۰ تومان برای ۸ قلم؛ تفکیک قیمت/موجودی ممکن نیست، خالی.',null,'1405/08/04',46),
 ('inv-oregano','اوریگانو','کیلو','جزو گروه ادویه با مبلغ کل ۴٬۰۰۰٬۰۰۰ تومان برای ۸ قلم؛ تفکیک قیمت/موجودی ممکن نیست، خالی.',null,'1405/08/04',47),
 ('inv-black-pepper','فلفل سیاه','کیلو','جزو گروه ادویه با مبلغ کل مشترک؛ مقدار و سهم هر قلم نامشخص، خالی.',null,'1405/08/04',47),
 ('inv-white-pepper','فلفل سفید','کیلو','جزو گروه ادویه با مبلغ کل مشترک؛ مقدار و سهم هر قلم نامشخص، خالی.',null,'1405/08/04',48),
 ('inv-paprika','پاپریکا','کیلو','جزو گروه ادویه با مبلغ کل مشترک؛ مقدار و سهم هر قلم نامشخص، خالی.',null,'1405/08/04',49),
 ('inv-chili-flake','پرک فلفل قرمز','کیلو','جزو گروه ادویه با مبلغ کل مشترک؛ مقدار و سهم هر قلم نامشخص، خالی.',null,'1405/08/04',50),
 ('inv-pul-biber','پول بیبر','کیلو','جزو گروه ادویه با مبلغ کل مشترک؛ مقدار و سهم هر قلم نامشخص، خالی.',null,'1405/08/04',51),
 ('inv-thyme','آویشن','کیلو','جزو گروه ادویه با مبلغ کل مشترک؛ مقدار و سهم هر قلم نامشخص، خالی.',null,'1405/08/04',52),
 ('inv-worcestershire','ورچستر','لیتر','موجودی ۴ لیتر؛ مبلغ کل ۱٬۶۵۰٬۰۰۰ تومان؛ ۴۱۲٬۵۰۰ تومان/لیتر از تقسیم مبلغ کل بر موجودی.',null,'1405/08/04',53),
 ('inv-chicken-stock','عصاره مرغ','کیلو','موجودی ۶ کیلوگرم؛ قیمت ۹۰۰٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',54),
 ('inv-beef-stock','عصاره گوشت','کیلو','موجودی ۶ کیلوگرم؛ قیمت ۷۰۰٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',55),
 ('inv-cornstarch','نشاسته ذرت','بسته','موجودی ۱ بسته؛ قیمت ۲۰۰٬۰۰۰ تومان/بسته؛ وزن بسته در تصویر نیست.',null,'1405/08/04',56),
 ('inv-ginger','زنجبیل','کیلو','موجودی ۰٫۲ کیلوگرم؛ قیمت با علامت سؤال، خالی.',null,'1405/08/04',57),
 ('inv-coriander-seed','تخم گشنیز','کیلو','موجودی ۰٫۲ کیلوگرم؛ قیمت واحد ۳۴۰٬۰۰۰ تومان/کیلوگرم؛ مبلغ کل با علامت سؤال.',null,'1405/08/04',58),
 ('inv-cinnamon','دارچین','کیلو','موجودی ۰٫۲ کیلوگرم؛ قیمت واحد ۳۴۰٬۰۰۰ تومان/کیلوگرم؛ مبلغ کل با علامت سؤال.',null,'1405/08/04',59),
 ('inv-honey','عسل','کیلو','موجودی ۱ کیلوگرم؛ قیمت ۱٬۲۰۰٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',60),
 ('inv-dried-date','خرما خشک','کیلو','موجودی ۰٫۵ کیلوگرم؛ قیمت ۲۲۵٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',61),
 ('inv-water-small','آب معدنی کوچک','باکس ۶ عددی','موجودی ۶ باکس؛ قیمت ۱۱٬۵۰۰ تومان/باکس.',null,'1405/08/04',62),
 ('inv-water-large','آب معدنی بزرگ','باکس ۶ عددی','موجودی ۶ باکس؛ قیمت ۲۳٬۰۰۰ تومان/باکس.',null,'1405/08/04',63),
 ('inv-coca-cola','نوشابه کوکا کولا قوطی','عدد','موجودی ۲۴ عدد؛ قیمت ۷۸٬۰۰۰ تومان/عدد.',null,'1405/08/04',64),
 ('inv-fanta','نوشابه فانتا قوطی','عدد','موجودی ۲۴ عدد؛ قیمت ۷۸٬۰۰۰ تومان/عدد.',null,'1405/08/04',65),
 ('inv-dessert','دسر کلاسیک','عدد','موجودی ۲۴ عدد؛ قیمت ۸۲٬۰۰۰ تومان/عدد.',null,'1405/08/04',66),
 ('inv-italian-basil','ریحان ایتالیایی','کیلو','موجودی ۱ کیلوگرم؛ قیمت ۷۵۰٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',67),
 ('inv-arugula','روکولا','کیلو','موجودی ۰٫۵ کیلوگرم؛ قیمت ۷۵۰٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',68),
 ('inv-beef','گوشت گوساله','کیلو','موجودی ۱۰ کیلوگرم؛ قیمت ۲٬۰۰۰٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',69),
 ('inv-ground-beef','گوشت چرخ‌کرده','کیلو','موجودی ۳ کیلوگرم؛ قیمت ۲٬۰۰۰٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',70),
 ('inv-carrot','هویج','کیلو','موجودی ۳ کیلوگرم؛ قیمت ۷۰٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',71),
 ('inv-spinach','اسفناج','کیلو','موجودی ۵ کیلوگرم؛ قیمت ۱۳۰٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',72),
 ('inv-celery','کرفس','کیلو','موجودی ۴ کیلوگرم؛ قیمت ۱۲۰٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',73),
 ('inv-bell-pepper','فلفل دلمه','کیلو','موجودی ۶ کیلوگرم؛ قیمت ۱۰۰٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',74),
 ('inv-garlic','سیر','کیلو','موجودی ۲ کیلوگرم؛ قیمت ۲۶۵٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',75),
 ('inv-scallion','پیازچه','کیلو','موجودی ۱ کیلوگرم؛ قیمت ۱۲۰٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',76),
 ('inv-tomato','گوجه‌فرنگی','کیلو','موجودی ۱۰ کیلوگرم؛ قیمت ۶۰٬۰۰۰ تومان/کیلوگرم.',null,'1405/08/04',77),
 ('inv-disinfectant','دستکش لاتکس','بسته ۱۰۰ عددی','موجودی ۱ بسته؛ قیمت ۱٬۰۵۰٬۰۰۰ تومان/بسته.',null,'1405/08/04',78),
 ('inv-hairnet','کلاه یکبارمصرف','بسته ۱۰۰ عددی','موجودی ۱ بسته؛ قیمت ۱٬۹۰۰٬۰۰۰ تومان/بسته.',null,'1405/08/04',79),
 ('inv-gloves','دستکش یکبارمصرف','بسته ۱۰۰۰ عددی','موجودی ۱ بسته؛ قیمت ۵۵۰٬۰۰۰ تومان/بسته.',null,'1405/08/04',80),
 ('inv-straw','نی یکبارمصرف','عدد','موجودی ۲۵۰۰ عدد؛ مبلغ ۲٬۲۵۰٬۰۰۰ در تصویر دیده می‌شود اما ستون مبلغ واحد/کل روشن نیست؛ قیمت هر عدد خالی مانده.',null,'1405/08/04',81),
 ('inv-pizza-box','جعبه پیتزا','عدد','قیمت ۲۶٬۰۰۰ تومان/عدد؛ موجودی با علامت سؤال.',null,'1405/08/04',82),
 ('inv-sandwich-box','جعبه ساندویچ','عدد','قیمت ۱۸٬۲۰۰ تومان/عدد؛ موجودی با علامت سؤال.',null,'1405/08/04',83),
 ('inv-single-cup','سینگل','عدد','قیمت ۷٬۰۰۰ تومان/عدد؛ موجودی با علامت سؤال؛ نام دقیق قلم در تصویر نیازمند بازبینی.',null,'1405/08/04',84),
 ('inv-sandwich-paper','کاغذ ساندویچ','کیلو','قیمت ۳۱۰٬۰۰۰ تومان/کیلوگرم؛ موجودی با علامت سؤال.',null,'1405/08/04',85),
 ('inv-takeout-bag','بگ بیرون‌بر','کیلو','قیمت ۱۲۰٬۰۰۰ تومان/کیلوگرم؛ موجودی با علامت سؤال.',null,'1405/08/04',86),
 ('inv-cleaning-towel','دستمال تنظیف','رول','موجودی ۱ رول؛ قیمت ۱٬۸۰۰٬۰۰۰ تومان/رول.',null,'1405/08/04',87),
 ('inv-trash-bag','کیسه زباله','کیلو','قیمت ۲۶۰٬۰۰۰ تومان/کیلوگرم؛ موجودی با علامت سؤال.',null,'1405/08/04',88),
 ('inv-freezer-bag','کیسه فریزر','رول','موجودی ۱ رول؛ قیمت ۱۸۰٬۰۰۰ تومان/رول.',null,'1405/08/04',89),
 ('inv-napkin','سلفون','رول','موجودی ۱ رول؛ مبلغ ۵٬۱۰۰٬۰۰۰ تومان/رول.',null,'1405/08/04',90),
 ('inv-foil','فویل','رول','موجودی ۱ رول؛ قیمت با علامت سؤال، خالی.',null,'1405/08/04',91),
 ('inv-fork','چنگال یکبارمصرف','عدد','قیمت ۱٬۶۰۰ تومان/عدد؛ موجودی با علامت سؤال.',null,'1405/08/04',92),
 ('inv-knife','چاقو یکبارمصرف','عدد','قیمت ۱٬۴۰۰ تومان/عدد؛ موجودی با علامت سؤال.',null,'1405/08/04',93),
 ('inv-nozzle','ماسوره','عدد','موجودی ۴ عدد؛ مبلغ کل ۳۰۰٬۰۰۰ تومان؛ ۷۵٬۰۰۰ تومان/عدد از تقسیم کل بر تعداد.',null,'1405/08/04',94),
 ('inv-nozzle-bag','کیسه ماسوره','عدد','موجودی ۵۰ عدد؛ مبلغ کل ۲۷۰٬۰۰۰ تومان؛ ۵٬۴۰۰ تومان/عدد از تقسیم کل بر تعداد.',null,'1405/08/04',95),
 ('inv-paper-towel','دستمال کاغذی','بسته ۶ رول؟','موجودی ۱۲؛ مبلغ ۵۳۰٬۰۰۰ و نوع واحد در تصویر مبهم است؛ قیمت خالی.',null,'1405/08/04',96),
 ('inv-dish-soap','مایع ظرفشویی','عدد','موجودی ۱ عدد؛ قیمت ۶۷۰٬۰۰۰ تومان/عدد.',null,'1405/08/04',97);

-- Current purchase prices. Only clear, compatible unit prices are inserted.
-- Recipe-linked values are Toman per gram; other items retain their purchase unit.
insert into public.price_points (ingredient_id,price,jdate,note) values
 ('ing-semolina',225,'1405/08/04','۲۲۵٬۰۰۰ تومان/کیلو؛ مشتق از مبلغ کل ۴٬۵۰۰٬۰۰۰ ÷ موجودی ۲۰ کیلو.'),
 ('ing-mozzarella',890,'1405/08/04','۸۹۰٬۰۰۰ تومان/کیلو؛ نرمال‌شده به تومان/گرم.'),
 ('ing-chicken',800,'1405/08/04','سینه مرغ ۸۰۰٬۰۰۰ تومان/کیلو؛ نرمال‌شده به تومان/گرم.'),
 ('ing-mushroom',380,'1405/08/04','۳۸۰٬۰۰۰ تومان/کیلو؛ نرمال‌شده به تومان/گرم.'),
 ('ing-onion',95,'1405/08/04','۹۵٬۰۰۰ تومان/کیلو؛ نرمال‌شده به تومان/گرم.'),
 ('ing-zucchini',100,'1405/08/04','۱۰۰٬۰۰۰ تومان/کیلو؛ نرمال‌شده به تومان/گرم.'),
 ('ing-eggplant',130,'1405/08/04','۱۳۰٬۰۰۰ تومان/کیلو؛ نرمال‌شده به تومان/گرم.'),
 ('ing-tomato-chips',1900,'1405/08/04','برآورد از گوجه خشک ۱٬۹۰۰٬۰۰۰ تومان/کیلو؛ معادل چیپس گوجه تأیید نشده.'),
 ('ing-steak',2000,'1405/08/04','برآورد از گوشت گوساله ۲٬۰۰۰٬۰۰۰ تومان/کیلو؛ برش و افت پخت تأیید نشده.'),
 ('ing-cherry-tomato',185,'1405/08/04','۱۸۵٬۰۰۰ تومان/کیلو؛ نرمال‌شده به تومان/گرم.'),
 ('inv-walnut',2000000,'1405/08/04','۲٬۰۰۰٬۰۰۰ تومان/کیلو.'),
 ('inv-labneh',404000,'1405/08/04','۴۰۴٬۰۰۰ تومان/بسته ۸۰۰ گرمی.'),
 ('inv-orange-flour',132500,'1405/08/04','مشتق از ۲٬۶۵۰٬۰۰۰ تومان ÷ ۲۰ کیلو.'),
 ('inv-sour-cherry',450000,'1405/08/04','تومان/کیلو.'),
 ('inv-corn',960000,'1405/08/04','تومان/کیلو.'),
 ('inv-lemon',400000,'1405/08/04','تومان/کیلو.'),
 ('inv-sugar',180000,'1405/08/04','تومان/کیلو.'),
 ('inv-worcestershire',412500,'1405/08/04','مشتق از ۱٬۶۵۰٬۰۰۰ تومان ÷ ۴ لیتر.'),
 ('inv-chicken-stock',900000,'1405/08/04','تومان/کیلو.'),
 ('inv-beef-stock',700000,'1405/08/04','تومان/کیلو.'),
 ('inv-cornstarch',200000,'1405/08/04','تومان/بسته؛ وزن بسته مشخص نیست.'),
 ('inv-coriander-seed',340000,'1405/08/04','قیمت واحدِ خوانا: تومان/کیلو.'),
 ('inv-cinnamon',340000,'1405/08/04','قیمت واحدِ خوانا: تومان/کیلو.'),
 ('inv-honey',1200000,'1405/08/04','تومان/کیلو.'),
 ('inv-dried-date',225000,'1405/08/04','تومان/کیلو.'),
 ('inv-water-small',11500,'1405/08/04','تومان/باکس ۶ عددی.'),
 ('inv-water-large',23000,'1405/08/04','تومان/باکس ۶ عددی.'),
 ('inv-coca-cola',78000,'1405/08/04','تومان/عدد.'),
 ('inv-fanta',78000,'1405/08/04','تومان/عدد.'),
 ('inv-dessert',82000,'1405/08/04','تومان/عدد.'),
 ('inv-italian-basil',750000,'1405/08/04','تومان/کیلو.'),
 ('inv-arugula',750000,'1405/08/04','تومان/کیلو.'),
 ('inv-beef',2000000,'1405/08/04','تومان/کیلو.'),
 ('inv-ground-beef',2000000,'1405/08/04','تومان/کیلو.'),
 ('inv-carrot',70000,'1405/08/04','تومان/کیلو.'),
 ('inv-spinach',130000,'1405/08/04','تومان/کیلو.'),
 ('inv-celery',120000,'1405/08/04','تومان/کیلو.'),
 ('inv-bell-pepper',100000,'1405/08/04','تومان/کیلو.'),
 ('inv-garlic',265000,'1405/08/04','تومان/کیلو.'),
 ('inv-scallion',120000,'1405/08/04','تومان/کیلو.'),
 ('inv-tomato',60000,'1405/08/04','تومان/کیلو.'),
 ('inv-disinfectant',1050000,'1405/08/04','تومان/بسته ۱۰۰ عددی.'),
 ('inv-hairnet',1900000,'1405/08/04','تومان/بسته ۱۰۰ عددی.'),
 ('inv-gloves',550000,'1405/08/04','تومان/بسته ۱۰۰۰ عددی.'),
 ('inv-pizza-box',26000,'1405/08/04','تومان/عدد؛ موجودی نامشخص.'),
 ('inv-sandwich-box',18200,'1405/08/04','تومان/عدد؛ موجودی نامشخص.'),
 ('inv-single-cup',7000,'1405/08/04','تومان/عدد؛ نام قلم نیازمند بازبینی.'),
 ('inv-sandwich-paper',310000,'1405/08/04','تومان/کیلو؛ موجودی نامشخص.'),
 ('inv-takeout-bag',120000,'1405/08/04','تومان/کیلو؛ موجودی نامشخص.'),
 ('inv-cleaning-towel',1800000,'1405/08/04','تومان/رول.'),
 ('inv-trash-bag',260000,'1405/08/04','تومان/کیلو؛ موجودی نامشخص.'),
 ('inv-freezer-bag',180000,'1405/08/04','تومان/رول.'),
 ('inv-napkin',5100000,'1405/08/04','تومان/رول.'),
 ('inv-fork',1600,'1405/08/04','تومان/عدد؛ موجودی نامشخص.'),
 ('inv-knife',1400,'1405/08/04','تومان/عدد؛ موجودی نامشخص.'),
 ('inv-nozzle',75000,'1405/08/04','مشتق از مبلغ کل ۳۰۰٬۰۰۰ ÷ ۴ عدد.'),
 ('inv-nozzle-bag',5400,'1405/08/04','مشتق از مبلغ کل ۲۷۰٬۰۰۰ ÷ ۵۰ عدد.'),
 ('inv-dish-soap',670000,'1405/08/04','تومان/عدد.');

-- Dough sub-recipe is an explicit estimate only; 300g total as requested.
insert into public.recipe_steps (item_id,ingredient_id,qty,position) values
 ('semi-dough-300g','ing-semolina',180,0),('semi-dough-300g','ing-water',115.7,1),
 ('semi-dough-300g','ing-salt',4,2),('semi-dough-300g','ing-yeast',0.3,3),
 ('pizza-flora','ing-dough',300,0),('pizza-flora','ing-mozzarella',120,1),('pizza-flora','ing-sauce-pizza',80,2),('pizza-flora','ing-chicken',200,3),('pizza-flora','ing-mushroom',30,4),('pizza-flora','ing-onion',20,5),('pizza-flora','ing-basil-sauce',50,6),('pizza-flora','ing-parmesan',5,7),('pizza-flora','ing-garnish',15,8),
 ('pizza-fortuna','ing-dough',300,0),('pizza-fortuna','ing-mozzarella',120,1),('pizza-fortuna','ing-sauce-alfredo',70,2),('pizza-fortuna','ing-shredded-beef',100,3),('pizza-fortuna','ing-pepperoni',30,4),('pizza-fortuna','ing-mushroom',30,5),('pizza-fortuna','ing-finishing-baluna',30,6),('pizza-fortuna','ing-gouda',30,7),('pizza-fortuna','ing-parmesan',5,8),
 ('pizza-fama','ing-dough',300,0),('pizza-fama','ing-mozzarella',120,1),('pizza-fama','ing-sauce-puna',100,2),('pizza-fama','ing-zucchini',40,3),('pizza-fama','ing-eggplant',40,4),('pizza-fama','ing-mushroom',30,5),('pizza-fama','ing-onion',20,6),('pizza-fama','ing-tomato-chips',30,7),('pizza-fama','ing-finishing-basil',50,8),('pizza-fama','ing-balsamic-dressing',20,9),('pizza-fama','ing-parmesan',5,10),
 ('pizza-faenna','ing-dough',300,0),('pizza-faenna','ing-mozzarella',120,1),('pizza-faenna','ing-sauce-puna',100,2),('pizza-faenna','ing-pepperoni',45,3),('pizza-faenna','ing-jalapeno',20,4),('pizza-faenna','ing-garnish',15,5),('pizza-faenna','ing-finishing-kaki',50,6),('pizza-faenna','ing-balsamic-dressing',30,7),('pizza-faenna','ing-parmesan',5,8),
 ('pizza-fides','ing-dough',300,0),('pizza-fides','ing-mozzarella',120,1),('pizza-fides','ing-sauce-medusa',90,2),('pizza-fides','ing-steak',120,3),('pizza-fides','ing-mushroom',30,4),('pizza-fides','ing-tomato-chips',40,5),('pizza-fides','ing-finishing-kaki',50,6),('pizza-fides','ing-sauce-beluna',30,7),('pizza-fides','ing-balsamic-dressing',20,8),('pizza-fides','ing-parmesan',5,9),('pizza-fides','ing-garnish',15,10),
 ('pizza-farya','ing-dough',300,0),('pizza-farya','ing-mozzarella',120,1),('pizza-farya','ing-sauce-beluna',80,2),('pizza-farya','ing-shredded-beef',100,3),('pizza-farya','ing-mushroom',30,4),('pizza-farya','ing-caramelized-onion',20,5),('pizza-farya','ing-tomato-chips',40,6),('pizza-farya','ing-finishing-kaki',50,7),('pizza-farya','ing-balsamic-dressing',20,8),('pizza-farya','ing-parmesan',5,9),('pizza-farya','ing-garnish',15,10),
 ('pizza-feronia','ing-dough',300,0),('pizza-feronia','ing-mozzarella',120,1),('pizza-feronia','ing-sauce-papona',80,2),('pizza-feronia','ing-meatball',120,3),('pizza-feronia','ing-cherry-tomato',20,4),('pizza-feronia','ing-onion',20,5),('pizza-feronia','ing-mushroom',30,6),('pizza-feronia','ing-finishing-kaki',50,7),('pizza-feronia','ing-balsamic-dressing',20,8);

-- Apply the same fixed overheads, packaging, and provisional waste rate to each pizza.
insert into public.item_overheads(item_id,overhead_id)
select m.id, x.overhead_id
  from public.menu_items m
 cross join unnest(array['ovh-002','ovh-003','ovh-004','ovh-005','ovh-006','ovh-007','ovh-008','ovh-009']::text[]) as x(overhead_id)
 where m.category='پیتزا'
on conflict do nothing;

update public.settings
   set monthly_portions=1000,
       price_source='خرید مواد و BOM منوی فریا · 1405/08/04',
       updated_at=now()
 where id=1;

-- Rebuild the canonical app_state from the relational rows, and start a fresh history.
update public.app_state
   set data=public.load_state(), rev=rev+1, updated_at=now(), updated_by='costing-reset-1405-08-04'
 where id=1;
insert into public.app_state_history(rev,data,reason,actor)
select rev,data,'بازنشانیِ بهای تمام‌شده بر اساس فایل‌های 1405/08/04','costing-reset-1405-08-04'
  from public.app_state where id=1;

-- Keep the live catalog allowlisted so an old browser cache cannot restore the retired products.
alter table public.menu_items add constraint farya_current_menu_allowlist check (
  (category='پیتزا' and code in ('FARYA-FLORA','FARYA-FORTUNA','FARYA-FAMA','FARYA-FIDES','FARYA-FARYA','FARYA-FERONIA','FARYA-FAENNA'))
  or (id='semi-dough-300g' and code='FARYA-DOUGH-300G' and category='نیمه‌ساخته')
);

-- Fail the whole transaction if a required row, overhead, or product code is missing.
do $$
begin
  if (select count(*) from public.menu_items where category='پیتزا' and active) <> 7 then
    raise exception 'Expected exactly seven active sellable pizzas';
  end if;
  if (select count(*) from public.menu_items where id='semi-dough-300g') <> 1 then
    raise exception 'Missing dough sub-recipe';
  end if;
  if (select count(*) from public.overheads) <> 9 then
    raise exception 'Expected all nine overhead rows to remain';
  end if;
  if (select amount from public.overheads where id='ovh-001') <> 0 or (select active from public.overheads where id='ovh-001') then
    raise exception 'Legacy general overhead must be disabled';
  end if;
  if (select sum(amount) from public.overheads where id in ('ovh-002','ovh-003','ovh-004','ovh-006','ovh-007','ovh-008')) <> 269000000 then
    raise exception 'Monthly fixed overhead total does not equal 269,000,000';
  end if;
  if (select amount from public.overheads where id='ovh-005') <> 26000 or (select amount from public.overheads where id='ovh-009') <> 3.5 then
    raise exception 'Per-pizza packaging or provisional waste percentage is incorrect';
  end if;
  if (select count(*) from public.item_overheads) <> 56 then
    raise exception 'Expected eight current overhead links per pizza';
  end if;
  if (select count(*) from public.recipe_steps where item_id like 'pizza-%') < 65 then
    raise exception 'Pizza BOM rows are incomplete';
  end if;
  if (select count(*) from public.app_state_history) <> 1 then
    raise exception 'App-state history should contain only the new baseline';
  end if;
end $$;

commit;
