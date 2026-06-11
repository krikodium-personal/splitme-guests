
export type AppView = 
  | 'INIT'
  | 'SCAN' 
  | 'GUEST_INFO' 
  | 'MENU' 
  | 'ORDER_SUMMARY' 
  | 'PROGRESS' 
  | 'SPLIT_BILL' 
  | 'SPLIT_STATUS'
  | 'GUEST_SELECTION'
  | 'INDIVIDUAL_SHARE' 
  | 'MP_PAYMENT'
  | 'TRANSFER_PAYMENT'
  | 'CASH_PAYMENT'
  | 'CHECKOUT'
  | 'TIP'
  | 'FEEDBACK'
  | 'CONFIRMATION';

export interface Guest {
  id: string;
  name: string;
  isHost?: boolean;
  avatar?: string;
  status?: string;
  table_id?: string;
  individualAmount?: number | null;
  paid?: boolean;
  payment_id?: string | null;
  payment_method?: string | null;
  payment_created_at?: string | null;
  payment_total?: number | null;
}

export interface OrderGuestCharge {
  id: string;
  order_id: string;
  guest_id: string;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  payment_method?: string | null;
  payment_id?: string | null;
  split_round_id?: string | null;
  created_at?: string;
  paid_at?: string | null;
}

export interface VariantOption {
  id: string;
  name: string;
  description?: string;
  price_type: 'replace' | 'add';
  price_amount: number;
}

export interface VariantGroup {
  id: string;
  name: string;
  /** individual=dropdown (una opción), multiple=lista con checkboxes (varias opciones) */
  selection?: 'individual' | 'multiple';
  /** Límite de selección cuando selection=multiple (ej. 2 = hasta 2 opciones) */
  max_selection?: number | null;
  /** Si true, el usuario debe seleccionar una opción antes de agregar (ej. Tamaño) */
  required?: boolean;
  variant_options: VariantOption[];
}

/** Subtítulo para agrupar productos en la lista (menu_section_headers) */
export interface MenuSectionHeader {
  id: string;
  restaurant_id: string;
  category_id: string;
  subcategory_id?: string | null;
  title: string;
  sort_order: number;
}

export interface MenuItem {
  id: string;
  restaurant_id: string;
  name: string;
  price: number;
  description: string;
  image_url: string; 
  category_id: string;
  subcategory_id?: string;
  /** Sección/subtítulo al que pertenece (menu_section_headers). NULL = sin sección. */
  section_id?: string | null;
  average_rating?: number; 
  is_featured?: boolean;
  is_new?: boolean;
  dietary_tags?: string[]; 
  calories?: number;
  protein_g?: number;
  total_fat_g?: number;
  sat_fat_g?: number;
  carbs_g?: number;
  sugars_g?: number;
  fiber_g?: number;
  sodium_mg?: number;
  sort_order?: number;
  /** Si false, el producto no está disponible (mostrar AGOTADO). */
  availability?: boolean;
  /** Cantidad en stock. Si < 5, mostrar "Últimas unidades! X disponibles". */
  stock_quantity?: number | null;
  /** Número de veces que fue pedido. Usado para ordenar "Los más pedidos". */
  times_ordered?: number;
  customer_customization?: {
    ingredientsToAdd?: string[];
    ingredientsToRemove?: string[];
  };
  variant_groups?: VariantGroup[];
}

export interface OrderBatch {
  id: string;
  order_id: string;
  batch_number: number;
  status: string;
  created_at?: string;
  served_at?: string;
}

export interface OrderItem {
  id: string;
  itemId: string;
  guestId: string;
  quantity: number;
  extras?: string[];
  removedIngredients?: string[];
  order_id?: string;
  batch_id?: string | null;
  isConfirmed?: boolean;
  status?: 'elegido' | 'pedido'; // Estado del item: elegido (sin enviar) o pedido (enviado a cocina)
  /** Precio unitario cuando hay variantes (reemplaza menuItem.price) */
  unitPrice?: number;
  /** Opción replace seleccionada (id de variant_option) */
  selectedReplaceOptionId?: string | null;
  /** Opciones add seleccionadas (ids de variant_options) */
  selectedAddOptionIds?: string[];
  /** IDs de variant_options seleccionados (persistido en DB como variant_selections) */
  variant_selections?: string[];
}

export interface BillSplit {
  method: 'EQUAL' | 'BY_ITEM' | 'CUSTOM';
}
