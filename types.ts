
export type AppView = 
  | 'INIT'
  | 'SCAN' 
  | 'GUEST_INFO' 
  | 'MENU' 
  | 'ORDER_SUMMARY' 
  | 'PROGRESS' 
  | 'SPLIT_BILL' 
  | 'GUEST_SELECTION'
  | 'INDIVIDUAL_SHARE' 
  | 'TRANSFER_PAYMENT'
  | 'CASH_PAYMENT'
  | 'CHECKOUT' 
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
  customer_customization?: {
    ingredientsToAdd?: string[];
    ingredientsToRemove?: string[];
  };
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
}

export interface BillSplit {
  method: 'EQUAL' | 'BY_ITEM' | 'CUSTOM';
}
