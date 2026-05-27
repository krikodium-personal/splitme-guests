import { MenuItem, OrderItem, VariantOption } from '../types';

export const getVariantGroups = (menuItem: MenuItem | undefined): Array<{ name?: string; variant_options?: VariantOption[] }> => {
  if (!menuItem) return [];
  const raw = (menuItem as any).variant_groups ?? (menuItem as any).variant_group;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return [raw];
  return [];
};

export const getReplaceVariantInfo = (menuItem: MenuItem | undefined, cartItem: OrderItem): { groupName: string; optionNames: string[] } | null => {
  const ids = cartItem.variant_selections?.length
    ? cartItem.variant_selections
    : (cartItem.selectedReplaceOptionId ? [cartItem.selectedReplaceOptionId] : []);
  if (!ids.length) return null;
  const groups = getVariantGroups(menuItem);
  for (const g of groups) {
    const opts = g.variant_options ?? (g as any).variant_option ?? [];
    const selected = (Array.isArray(opts) ? opts : []).filter((o: VariantOption) => (o.price_type || '').toLowerCase() === 'replace' && ids.includes(o.id));
    if (selected.length > 0) return { groupName: (g as any).name || 'Tamaño', optionNames: selected.map((o: VariantOption) => o.name) };
  }
  return null;
};

export const getAddVariantLabels = (menuItem: MenuItem | undefined, cartItem: OrderItem): string[] => {
  const ids = cartItem.variant_selections?.length
    ? cartItem.variant_selections
    : (cartItem.selectedAddOptionIds || []);
  if (!ids.length) return [];
  const groups = getVariantGroups(menuItem);
  const labels: string[] = [];
  groups.forEach(g => {
    const opts = g.variant_options ?? (g as any).variant_option ?? [];
    (Array.isArray(opts) ? opts : []).forEach((opt: VariantOption) => {
      if ((opt.price_type || '').toLowerCase() === 'add' && ids.includes(opt.id)) labels.push(`+${opt.name}`);
    });
  });
  return labels;
};
