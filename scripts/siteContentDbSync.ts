/**
 * Единые данные и upsert для homepage_content / about_content (актуальные тексты бренда).
 * Используются скриптами update-homepage-text, update-about-content и sync-homepage-about-db.
 */

import type { Pool } from 'pg';

export const HOMEPAGE_HERO = {
  videoUrl: '/ф.mp4',
  imageUrl: '',
  isVideo: true,
  line1: 'Бижутерия',
  line2: 'Искусство аксессуара',
  line3: 'Аксессуары, тщательно отобранные для тех, кто ценит изящество в каждой детали.',
};

export const HOMEPAGE_DESCRIPTION = {
  text: 'Коллекция, где каждая вещь — про безупречный вкус и внимание к детали. Серьги, браслеты, колье с характером.',
};

export const HOMEPAGE_PANELS = [
  {
    image: '/1.avif',
    subtitle: 'ИСКУССТВО ДЕТАЛИ',
    title: 'ИЗЯЩЕСТВО\nВ КАЖДОЙ ВЕЩИ',
    quote: '«Мы верим, что аксессуар — это не просто украшение. Это знак внимания к себе и к моменту».',
  },
  {
    image: '/2.jpeg',
    subtitle: 'КУРАТОРСКИЙ ВЫБОР',
    title: 'КОЛЛЕКЦИЯ\nС ХАРАКТЕРОМ',
    quote: '«Каждая вещь в нашей коллекции отобрана за безупречный вкус и умение говорить без слов».',
  },
  {
    image: '/3.png',
    subtitle: 'ДЛЯ ВАС',
    title: 'ИНДИВИДУАЛЬНОСТЬ\nИ СТИЛЬ',
    quote: '«Для тех, кто ценит изящество в мелочах и не боится подчёркивать свою индивидуальность».',
  },
];

export const HOMEPAGE_TEXT_IMAGE = {
  smallImage: '/5.png',
  bigImage: '/4.avif',
  title: 'Искусство аксессуара',
  text: 'Каждая вещь в нашей коллекции отобрана за безупречный вкус и внимание к детали. Для тех, кто ценит изящество.',
};

export const HOMEPAGE_IMPERIAL = {
  title: 'Знаковая коллекция',
  text: 'Классическая и вневременная подборка аксессуаров с характером. Для тех, кто ценит изящество в каждой детали и безупречный вкус.',
  image: '/знак.png',
};

export const ABOUT_HERO = {
  image: '/COLLECTION.mp4',
  subtitle: 'О бренде',
  title: 'CITY LEGEND',
  description:
    'Бижутерия и аксессуары, отобранные для тех, кто ценит изящество в каждой детали. Кураторский подход и вневременной стиль.',
};

export const ABOUT_PHILOSOPHY = {
  title: 'Наша философия',
  quote:
    '«Аксессуар — это не просто украшение. Это знак внимания к себе и к моменту. Мы выбираем вещи с характером, которые говорят без слов».',
  author: 'CITY LEGEND',
};

export const ABOUT_VALUES = {
  title: 'Наши ценности',
  subtitle: 'Принципы,\nкоторыми мы живём',
  image: '/1.avif',
  values: [
    {
      title: 'Кураторский выбор',
      description:
        'Каждая вещь в коллекции отобрана за безупречный вкус и качество. Мы не предлагаем массовый ассортимент — только то, что сами считаем достойным.',
      icon: '—',
    },
    {
      title: 'Качество',
      description:
        'Натуральные камни, гипоаллергенная фурнитура и внимание к детали. Мы за то, чтобы аксессуары служили долго и радовали каждый день.',
      icon: '—',
    },
    {
      title: 'Индивидуальность',
      description:
        'Для тех, кто не боится подчёркивать свой стиль. Наши вещи помогают выразить характер и вкус без лишних слов.',
      icon: '—',
    },
  ],
};

export async function upsertHomepageContent(pool: Pool): Promise<void> {
  const sections: [string, object][] = [
    ['hero', HOMEPAGE_HERO],
    ['description', HOMEPAGE_DESCRIPTION],
    ['panels', HOMEPAGE_PANELS],
    ['textImage', HOMEPAGE_TEXT_IMAGE],
    ['imperial', HOMEPAGE_IMPERIAL],
  ];
  for (const [section, data] of sections) {
    await pool.query(
      `INSERT INTO homepage_content (section, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (section)
       DO UPDATE SET data = $2, updated_at = NOW()`,
      [section, JSON.stringify(data)]
    );
  }
}

export async function upsertAboutContent(pool: Pool): Promise<void> {
  const sections: [string, object][] = [
    ['hero', ABOUT_HERO],
    ['philosophy', ABOUT_PHILOSOPHY],
    ['values', ABOUT_VALUES],
  ];
  for (const [section, data] of sections) {
    await pool.query(
      `INSERT INTO about_content (section, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (section)
       DO UPDATE SET data = $2, updated_at = NOW()`,
      [section, JSON.stringify(data)]
    );
  }
}
