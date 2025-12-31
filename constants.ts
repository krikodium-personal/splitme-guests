
import { MenuItem } from './types';

export const MOCK_MENU: MenuItem[] = [
  // --- ENTRADAS ---
  {
    id: 's1',
    restaurant_id: 'r1',
    name: 'Alitas Trufadas al Parmesano',
    price: 12.50,
    description: 'Alitas crujientes bañadas en aceite de trufa y parmesano curado, servidas con alioli de ajo.',
    image_url: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_entradas',
    is_featured: true,
    dietary_tags: ['Popular']
  },
  {
    id: 's2',
    restaurant_id: 'r1',
    name: 'Calamares Crujientes',
    price: 14.00,
    description: 'Aros de calamar ligeramente empanizados con salsa marinara picante y una rodaja de limón.',
    image_url: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_entradas',
    dietary_tags: []
  },
  {
    id: 's3',
    restaurant_id: 'r1',
    name: 'Bruschetta de Aguacate',
    price: 11.00,
    description: 'Pan de masa madre tostado, aguacate machacado, tomates cherry y glaseado balsámico.',
    image_url: 'https://images.unsplash.com/photo-1572656631137-7935297eff55?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_entradas',
    dietary_tags: ['Saludable']
  },
  {
    id: 's4',
    restaurant_id: 'r1',
    name: 'Nachos Nachos Grandes',
    price: 15.50,
    description: 'Tortillas de maíz, queso cheddar fundido, jalapeños, pico de gallo y guacamole.',
    image_url: 'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_entradas',
    dietary_tags: []
  },
  {
    id: 's5',
    restaurant_id: 'r1',
    name: 'Sliders de Pulled Pork',
    price: 13.00,
    description: 'Tres mini panes brioche con cerdo deshebrado a fuego lento y ensalada de col.',
    image_url: 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_entradas',
    dietary_tags: []
  },
  {
    id: 's6',
    restaurant_id: 'r1',
    name: 'Ensalada del Huerto',
    price: 10.00,
    description: 'Mezcla de lechugas locales, rábano, pepino y vinagreta de miel y mostaza.',
    image_url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_entradas',
    dietary_tags: ['Vegano']
  },
  {
    id: 's7',
    restaurant_id: 'r1',
    name: 'Sopa de Tomate y Albahaca',
    price: 8.50,
    description: 'Sopa cremosa de tomate asado con albahaca fresca y crotones.',
    image_url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_entradas',
    dietary_tags: []
  },
  {
    id: 's8',
    restaurant_id: 'r1',
    name: 'Gyozas Japonesas',
    price: 11.50,
    description: 'Dumplings de cerdo y col sellados a la sartén con salsa de soya y jengibre.',
    image_url: 'https://images.unsplash.com/photo-1563245339-dfc201046d14?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_entradas',
    is_featured: true,
    dietary_tags: []
  },
  {
    id: 's9',
    restaurant_id: 'r1',
    name: 'Burrata con Durazno',
    price: 14.50,
    description: 'Queso burrata cremoso, duraznos a la parrilla, rúcula y miel pura.',
    image_url: 'https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_entradas',
    dietary_tags: []
  },
  {
    id: 's10',
    restaurant_id: 'r1',
    name: 'Camarones al Ajillo',
    price: 13.50,
    description: 'Camarones salteados en una rica mantequilla de ajos y hierbas frescas.',
    image_url: 'https://images.unsplash.com/photo-1559742811-822873691df0?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_entradas',
    dietary_tags: []
  },

  // --- FUERTES ---
  {
    id: 'm1',
    restaurant_id: 'r1',
    name: 'Doble Trufa Smash',
    price: 18.00,
    description: 'Dos carnes smash, aderezo de trufa negra, queso suizo y cebolla caramelizada.',
    image_url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_fuertes',
    is_featured: true,
    dietary_tags: ['Firma']
  },
  {
    id: 'm2',
    restaurant_id: 'r1',
    name: 'Pollo Crujiente Picante',
    price: 16.50,
    description: 'Pechuga de pollo frita, ensalada sriracha, pepinillos y mayonesa picante en pan brioche.',
    image_url: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_fuertes',
    dietary_tags: ['Picante']
  },
  {
    id: 'm3',
    restaurant_id: 'r1',
    name: 'Ribeye Wagyu',
    price: 42.00,
    description: '12oz de Ribeye Wagyu, mantequilla de ajo, servido con reducción de vino tinto.',
    image_url: 'https://images.unsplash.com/photo-1600891964599-f61ba0e24092?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_fuertes',
    is_featured: true,
    dietary_tags: []
  },
  {
    id: 'm4',
    restaurant_id: 'r1',
    name: 'Salmón del Atlántico',
    price: 28.00,
    description: 'Salmón sellado con salsa de eneldo y limón, acompañado de verduras de temporada.',
    image_url: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_fuertes',
    dietary_tags: ['Saludable']
  },
  {
    id: 'm5',
    restaurant_id: 'r1',
    name: 'Pasta de Hongos Silvestres',
    price: 22.00,
    description: 'Pasta pappardelle con salsa cremosa de hongos silvestres y tomillo.',
    image_url: 'https://images.unsplash.com/photo-1473093226795-af9932fe5855?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_fuertes',
    dietary_tags: []
  },
  {
    id: 'm6',
    restaurant_id: 'r1',
    name: 'Tacos de Pescado Baja',
    price: 19.50,
    description: 'Tres tacos de bacalao capeado en cerveza, crema de aguacate y ensalada de col.',
    image_url: 'https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_fuertes',
    dietary_tags: []
  },
  {
    id: 'm7',
    restaurant_id: 'r1',
    name: 'Tonkotsu Ramen',
    price: 17.50,
    description: 'Caldo de hueso de cerdo, chashu, huevo marinado, brotes de bambú y alga nori.',
    image_url: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_fuertes',
    is_featured: true,
    dietary_tags: []
  },
  {
    id: 'm8',
    restaurant_id: 'r1',
    name: 'Curry Rojo de Verduras',
    price: 18.50,
    description: 'Curry rojo tailandés picante con verduras de temporada, tofu y arroz jazmín.',
    image_url: 'https://images.unsplash.com/photo-1455619411447-224202ca1ad7?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_fuertes',
    dietary_tags: []
  },
  {
    id: 'm9',
    restaurant_id: 'r1',
    name: 'Pizza Napolitana',
    price: 16.00,
    description: 'Clásica Margherita con salsa de tomate, mozzarella fresca y albahaca.',
    image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_fuertes',
    dietary_tags: []
  },
  {
    id: 'm10',
    restaurant_id: 'r1',
    name: 'Costillas BBQ',
    price: 26.00,
    description: 'Medio costillar de cerdo a fuego lento con glaseado de barbacoa y miel casero.',
    image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_fuertes',
    dietary_tags: []
  },

  // --- GUARNICIONES ---
  {
    id: 'si1',
    restaurant_id: 'r1',
    name: 'Papas Fritas Clásicas',
    price: 6.00,
    description: 'Doraditas, crujientes y perfectamente saladas.',
    image_url: 'https://images.unsplash.com/photo-1630384066252-4237be704e21?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_guarniciones',
    dietary_tags: []
  },
  {
    id: 'si2',
    restaurant_id: 'r1',
    name: 'Camote Frito',
    price: 7.50,
    description: 'Bastones de camote cortados a mano con un toque de azúcar y canela.',
    image_url: 'https://images.unsplash.com/photo-1526230427044-d092040d48dc?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_guarniciones',
    dietary_tags: []
  },
  {
    id: 'si3',
    restaurant_id: 'r1',
    name: 'Mac & Cheese Trufado',
    price: 9.50,
    description: 'Mezcla de cuatro quesos con un toque de aceite de trufa y pan molido.',
    image_url: 'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_guarniciones',
    is_featured: true,
    dietary_tags: []
  },
  {
    id: 'si4',
    restaurant_id: 'r1',
    name: 'Puré de Papa al Ajo',
    price: 6.50,
    description: 'Papas cremosas batidas con ajo asado y mantequilla de verdad.',
    image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_guarniciones',
    dietary_tags: []
  },
  {
    id: 'si5',
    restaurant_id: 'r1',
    name: 'Brócoli al Vapor',
    price: 5.50,
    description: 'Floretes de brócoli frescos con ralladura de limón y sal de mar.',
    image_url: 'https://images.unsplash.com/photo-1452967712862-0cca1839ff27?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_guarniciones',
    dietary_tags: ['Saludable']
  },

  // --- BEBIDAS ---
  {
    id: 'so1',
    restaurant_id: 'r1',
    name: 'Cola Artesanal',
    price: 4.50,
    description: 'Sabor clásico de cola hecho con azúcar de caña orgánica.',
    image_url: 'https://images.unsplash.com/photo-1581639055403-911961423456?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_gaseosas',
    dietary_tags: []
  },
  {
    id: 'so10',
    restaurant_id: 'r1',
    name: 'Limonada Matcha',
    price: 6.00,
    description: 'Limonada refrescante con matcha de grado ceremonial.',
    image_url: 'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_gaseosas',
    is_featured: true,
    dietary_tags: []
  },

  // --- ALCOHOL ---
  {
    id: 'al1',
    restaurant_id: 'r1',
    name: 'Midnight Old Fashioned',
    price: 15.00,
    description: 'Bourbon, azúcar, amargos y piel de naranja.',
    image_url: 'https://images.unsplash.com/photo-1470333732907-0516ca8d08fe?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_alcohol',
    is_featured: true,
    dietary_tags: []
  },

  // --- POSTRES ---
  {
    id: 'd1',
    restaurant_id: 'r1',
    name: 'Cheesecake NY',
    price: 9.50,
    description: 'Pay de queso cremoso con base de galleta y frutos rojos.',
    image_url: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?q=80&w=800&auto=format&fit=crop',
    category_id: 'cat_postres',
    is_featured: true,
    dietary_tags: []
  }
];
