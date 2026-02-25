/**
 * Agrupación de platos para envío a cocina.
 * Los platos se agrupan en 3 categorías para enviar por separado:
 * 1. Entradas y bebidas con y sin alcohol
 * 2. Principales y guarniciones
 * 3. Postres y cafetería
 */

export type OrderGroupKey = 'entradas_bebidas' | 'principales_guarniciones' | 'postres_cafeteria';

export const ORDER_GROUP_LABELS: Record<OrderGroupKey, string> = {
  entradas_bebidas: 'Entradas y bebidas',
  principales_guarniciones: 'Principales y guarniciones',
  postres_cafeteria: 'Postres y cafetería',
};

/** Keywords para mapear cada grupo (case-insensitive, partial match) */
const GROUP_KEYWORDS: Record<OrderGroupKey, string[]> = {
  entradas_bebidas: [
    'entrada', 'bebida', 'gaseosa', 'alcohol', 'aperitivo', 'vino', 'cerveza',
    'cocktail', 'cóctel', 'refresco', 'soda', 'agua', 'jugo', 'infusion',
    'starter', 'appetizer',
  ],
  principales_guarniciones: [
    'principal', 'fuerte', 'plato', 'guarn', 'main', 'entrada fuerte',
    'fuertes', 'guarniciones', 'acompañamiento',
  ],
  postres_cafeteria: [
    'postre', 'café', 'cafeteria', 'cafetería', 'dulce', 'dessert',
    'torta', 'helado', 'flan', 'brownie', 'té', 'te',
  ],
};

/**
 * Determina a qué grupo pertenece una categoría según su nombre.
 * Usa el nombre de la categoría (o subcategoría) para hacer el match.
 */
export function getCategoryGroupKey(categoryName: string | null | undefined): OrderGroupKey | null {
  if (!categoryName || typeof categoryName !== 'string') return null;
  const name = categoryName.toLowerCase().trim();

  for (const [groupKey, keywords] of Object.entries(GROUP_KEYWORDS)) {
    if (keywords.some(kw => name.includes(kw))) {
      return groupKey as OrderGroupKey;
    }
  }

  // Si no hay match, intentar por defecto según patrones comunes
  if (name.includes('entrada') || name.includes('bebida')) return 'entradas_bebidas';
  if (name.includes('postre') || name.includes('café')) return 'postres_cafeteria';
  return 'principales_guarniciones'; // fallback
}

export interface CategoryLike {
  id: string;
  name: string;
  parent_id?: string | null;
}

/**
 * Obtiene el grupo para un item dado su category_id y la lista de categorías.
 */
export function getGroupKeyForCategoryId(
  categoryId: string,
  categories: CategoryLike[]
): OrderGroupKey {
  const category = categories.find(c => c.id === categoryId);
  if (!category) return 'principales_guarniciones'; // fallback
  // Si es subcategoría, usar el parent para el nombre si ayuda
  const parent = category.parent_id
    ? categories.find(c => c.id === category.parent_id)
    : null;
  const nameToCheck = category.name;
  const group = getCategoryGroupKey(nameToCheck);
  if (group) return group;
  // Si no hay match con el nombre, intentar con el parent
  if (parent) {
    const parentGroup = getCategoryGroupKey(parent.name);
    if (parentGroup) return parentGroup;
  }
  return 'principales_guarniciones';
}
