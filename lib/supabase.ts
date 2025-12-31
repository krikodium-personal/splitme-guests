
import { createClient } from '@supabase/supabase-js';

// Reemplaza con tus credenciales de Supabase -> Settings -> API
const supabaseUrl = 'https://hqaiuywzklrwywdhmqxw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxYWl1eXd6a2xyd3l3ZGhtcXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjI1ODksImV4cCI6MjA4MjU5ODU4OX0.H5lttp_1C0G9DwR8bk9mg-VgvdaOKubyH82Jn8MsgxY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
