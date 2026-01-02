
import { createClient } from '@supabase/supabase-js';

// Datos de conexión
const supabaseUrl = 'https://hqaiuywzklrwywdhmqxw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxYWl1eXd6a2xyd3l3ZGhtcXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjI1ODksImV4cCI6MjA4MjU5ODU4OX0.H5lttp_1C0G9DwR8bk9mg-VgvdaOKubyH82Jn8MsgxY';

console.log("[DineSplit] Intentando inicializar Supabase client...");

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("[DineSplit] Error crítico: Credenciales de Supabase ausentes.");
}

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null as any;

if (supabase) {
  console.log("[DineSplit] Cliente Supabase creado exitosamente.");
}
