
export type AppView = 
  | 'SCAN' 
  | 'GUEST_INFO' 
  | 'MENU' 
  | 'ORDER_SUMMARY' 
  | 'PROGRESS' 
  | 'SPLIT_BILL' 
  | 'INDIVIDUAL_SHARE' 
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
  dietary_tags?: string[]; 
  calories?: number;
  protein_g?: number;
  total_fat_g?: number;
  sat_fat_g?: number;
  carbs_g?: number;
  sugar_g?: number;
  fiber_g?: number;
  sodium_mg?: number;
  sort_order?: number;
  customer_customization?: {
    ingredientsToAdd?: string[];
    ingredientsToRemove?: string[];
  };
}

export interface OrderItem {
  id: string;
  itemId: string;
  guestId: string;
  quantity: number;
  extras?: string[];
  removedIngredients?: string[];
}

export interface BillSplit {
  method: 'EQUAL' | 'BY_ITEM' | 'CUSTOM';
}
