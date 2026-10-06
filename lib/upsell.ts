import { MenuItem, OrderItem } from '../types';

export type MenuRole = 'drink' | 'side' | 'dessert' | 'starter' | 'main' | 'other';

type CategoryRow = {
  id: string;
  name?: string | null;
  parent_id?: string | null;
};

const ROLE_KEYWORDS: Record<Exclude<MenuRole, 'other'>, string[]> = {
  drink: [
    'bebida', 'bebidas', 'trago', 'tragos', 'cocktail', 'coctel', 'bar',
    'vino', 'vinos', 'cerveza', 'cervezas', 'gaseosa', 'gaseosas', 'soda',
    'jugo', 'jugos', 'agua', 'cafe', 'café', 'coffee', 'licuado', 'smoothie',
    'drinks', 'ipa', 'aperitivo', 'fernet', 'gin', 'copa',
  ],
  side: [
    'guarnicion', 'guarnición', 'guarniciones', 'acompanamiento', 'acompañamiento',
    'papas', 'fritas', 'nugget', 'nuggets', 'aros', 'side', 'sides', 'extra', 'extras',
    'nachos', 'bread', 'pan',
  ],
  dessert: [
    'postre', 'postres', 'dessert', 'helado', 'helados', 'torta', 'brownie',
    'churro', 'dulce', 'flan', 'mousse', 'tiramisu', 'tiramisú',
  ],
  starter: [
    'entrada', 'entradas', 'starter', 'starters', 'picada', 'picadas',
    'bruschetta', 'empanada', 'empanadas', 'provoleta',
  ],
  main: [
    'principal', 'principales', 'plato', 'platos', 'hamburguesa', 'hamburguesas',
    'burger', 'pizza', 'pizzas', 'pasta', 'pastas', 'parrilla', 'milanesa',
    'sandwich', 'sándwich', 'lomito', 'taco', 'tacos', 'risotto', 'wok',
    'minuta', 'minutas', 'carnes', 'pescado', 'ensalada', 'ensaladas',
  ],
};

/** Roles a ofrecer según lo que acaba de agregar. */
const COMPLEMENTS: Record<MenuRole, MenuRole[]> = {
  main: ['drink', 'side', 'starter', 'dessert'],
  starter: ['drink', 'main', 'side'],
  side: ['drink', 'main', 'dessert'],
  drink: ['starter', 'main', 'side', 'dessert'],
  dessert: ['drink', 'main'],
  other: ['drink', 'starter', 'side', 'dessert', 'main'],
};

const fold = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const matchesKeywords = (text: string, keywords: string[]) =>
  keywords.some(keyword => text.includes(fold(keyword)));

export function classifyMenuRole(item: MenuItem, categories: CategoryRow[]): MenuRole {
  const category = categories.find(c => c.id === item.category_id);
  const parent = category?.parent_id ? categories.find(c => c.id === category.parent_id) : undefined;
  const haystack = fold(
    [item.name, category?.name, parent?.name].filter(Boolean).join(' ')
  );

  const order: Exclude<MenuRole, 'other'>[] = ['drink', 'dessert', 'side', 'starter', 'main'];
  for (const role of order) {
    if (matchesKeywords(haystack, ROLE_KEYWORDS[role])) return role;
  }
  return 'other';
}

const isAvailable = (item: MenuItem) => item.availability !== false;

const scoreItem = (item: MenuItem) =>
  (item.is_featured ? 1000 : 0) +
  (Number(item.times_ordered) || 0) +
  (Number(item.average_rating) || 0) * 10;

/** Roles que este comensal ya cubrió (carrito + el plato ancla). */
export function getOwnedRoles(params: {
  source: MenuItem;
  menuItems: MenuItem[];
  cart: OrderItem[];
  categories: CategoryRow[];
  guestId?: string | null;
}): Set<MenuRole> {
  const { source, menuItems, cart, categories, guestId } = params;
  const owned = new Set<MenuRole>();
  owned.add(classifyMenuRole(source, categories));

  const guestCart = guestId ? cart.filter(item => item.guestId === guestId) : cart;
  for (const line of guestCart) {
    const menuItem = menuItems.find(m => m.id === line.itemId);
    if (!menuItem) continue;
    owned.add(classifyMenuRole(menuItem, categories));
  }
  return owned;
}

export function getUpsellSuggestions(params: {
  source: MenuItem;
  menuItems: MenuItem[];
  cart: OrderItem[];
  categories: CategoryRow[];
  /** Si viene, solo se mira el carrito de ese comensal. */
  guestId?: string | null;
  limit?: number;
}): MenuItem[] {
  const { source, menuItems, cart, categories, guestId, limit = 3 } = params;
  const guestCart = guestId ? cart.filter(item => item.guestId === guestId) : cart;
  const cartItemIds = new Set(guestCart.map(item => item.itemId));
  const ownedCategoryIds = new Set(
    guestCart
      .map(line => menuItems.find(m => m.id === line.itemId)?.category_id)
      .filter(Boolean) as string[]
  );
  if (source.category_id) ownedCategoryIds.add(source.category_id);

  const sourceRole = classifyMenuRole(source, categories);
  const ownedRoles = getOwnedRoles({ source, menuItems, cart, categories, guestId });

  const pool = menuItems.filter(item =>
    item.id !== source.id &&
    isAvailable(item) &&
    !cartItemIds.has(item.id)
  );

  const byRole = new Map<MenuRole, MenuItem[]>();
  for (const item of pool) {
    const role = classifyMenuRole(item, categories);
    // No sugerir roles que el comensal ya pidió (ej. ya tiene bebida → no otra bebida)
    if (ownedRoles.has(role) && role !== 'other') continue;
    const list = byRole.get(role) || [];
    list.push(item);
    byRole.set(role, list);
  }
  for (const list of byRole.values()) {
    list.sort((a, b) => scoreItem(b) - scoreItem(a));
  }

  const picked: MenuItem[] = [];
  const pickedIds = new Set<string>();

  for (const role of COMPLEMENTS[sourceRole]) {
    if (ownedRoles.has(role)) continue;
    const candidate = (byRole.get(role) || []).find(item => !pickedIds.has(item.id));
    if (candidate) {
      picked.push(candidate);
      pickedIds.add(candidate.id);
    }
    if (picked.length >= limit) return picked;
  }

  // Fallback: otra categoría / otro rol que todavía no pidió
  const fallback = pool
    .filter(item => {
      if (pickedIds.has(item.id)) return false;
      if (item.category_id && ownedCategoryIds.has(item.category_id)) return false;
      const role = classifyMenuRole(item, categories);
      if (role !== 'other' && ownedRoles.has(role)) return false;
      return true;
    })
    .sort((a, b) => scoreItem(b) - scoreItem(a));

  for (const item of fallback) {
    picked.push(item);
    if (picked.length >= limit) break;
  }

  return picked;
}
