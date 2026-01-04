import { createClient } from '@supabase/supabase-js';

// Usamos valores fijos como respaldo para que AI Studio no de error
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://hqaiuywzklrwywdhmqxw.supabase.co';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxYWl1eXd6a2xyd3l3ZGhtcXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjI1ODksImV4cCI6MjA4MjU5ODU4OX0.H5lttp_1C0G9DwR8bk9mg-VgvdaOKubyH82Jn8MsgxY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);