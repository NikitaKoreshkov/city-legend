import type { Pool } from 'pg';

type CheckboxDef = { name: string; type: 'checkbox'; sort_order: number; options: string[] };
type RangeDef = { name: string; type: 'range'; sort_order: number };
type FilterDef = CheckboxDef | RangeDef;

const COMMON: FilterDef[] = [
  {
    name: 'Материал',
    type: 'checkbox',
    sort_order: 1,
    options: ['Серебро 925', 'Латунь с позолотой', 'Медицинская сталь', 'Гипоаллергенный сплав'],
  },
  {
    name: 'Стиль',
    type: 'checkbox',
    sort_order: 2,
    options: ['Минимализм', 'Классика', 'Богемный', 'Вечерний'],
  },
  {
    name: 'Оттенок металла',
    type: 'checkbox',
    sort_order: 3,
    options: ['Серебристый', 'Золотой', 'Розовое золото', 'Чёрный родий'],
  },
];

const BY_SLUG: Record<string, FilterDef[]> = {
  kolye: [
    ...COMMON,
    {
      name: 'Длина по типу',
      type: 'checkbox',
      sort_order: 4,
      options: ['Чокер', 'Стандарт (до 45 см)', 'Миди', 'Длинное (опера)'],
    },
    {
      name: 'Вставки',
      type: 'checkbox',
      sort_order: 5,
      options: ['Без вставок', 'Фианит', 'Натуральный камень', 'Жемчуг'],
    },
    { name: 'Длина, см', type: 'range', sort_order: 6 },
  ],
  braslety: [
    ...COMMON,
    {
      name: 'Тип',
      type: 'checkbox',
      sort_order: 4,
      options: ['Цепочка', 'Жёсткий', 'Шармы', 'Кафф'],
    },
    { name: 'Обхват, см', type: 'range', sort_order: 5 },
  ],
  sergi: [
    ...COMMON,
    {
      name: 'Тип',
      type: 'checkbox',
      sort_order: 4,
      options: ['Гвоздики', 'Подвески', 'Длинные', 'Кафф'],
    },
    {
      name: 'Вставки',
      type: 'checkbox',
      sort_order: 5,
      options: ['Без вставок', 'Фианит', 'Натуральный камень', 'Жемчуг'],
    },
  ],
  koltsa: [
    ...COMMON,
    {
      name: 'Тип',
      type: 'checkbox',
      sort_order: 4,
      options: ['Печатки', 'Обручальные', 'С камнями', 'Геометрия'],
    },
    { name: 'Размер', type: 'range', sort_order: 5 },
  ],
};

/** Создаёт базовые фильтры для категории, если в БД их ещё нет. */
export async function ensureCategoryFilters(
  pool: Pool,
  categoryId: number,
  categorySlug: string
): Promise<boolean> {
  const existing = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM filters WHERE category_id = $1',
    [categoryId]
  );
  if (parseInt(existing.rows[0]?.count ?? '0', 10) > 0) return false;

  const defs = BY_SLUG[categorySlug] ?? COMMON;
  for (const def of defs) {
    const fr = await pool.query<{ id: number }>(
      `INSERT INTO filters (category_id, name, type, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id`,
      [categoryId, def.name, def.type, def.sort_order]
    );
    const filterId = fr.rows[0].id;
    if (def.type === 'checkbox') {
      let i = 0;
      for (const opt of def.options) {
        await pool.query(
          `INSERT INTO filter_options (filter_id, value, sort_order, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [filterId, opt, i++]
        );
      }
    }
  }
  return true;
}
