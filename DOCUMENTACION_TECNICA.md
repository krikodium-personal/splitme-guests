# Documentación Técnica del Proyecto: DineSplit

## 1. Visión General del Proyecto

**DineSplit** es una Single Page Application (SPA) construida con React 19 y TypeScript diseñada para digitalizar la experiencia de comensales en un restaurante. Permite a los usuarios escanear un QR, unirse a una mesa, realizar pedidos colaborativos, seguir el estado de la cocina en tiempo real y dividir la cuenta de forma granular.

El backend se basa en **Supabase (PostgreSQL)** aprovechando sus capacidades de Realtime para la sincronización de estados de pedidos.

### Características Principales
- Escaneo de códigos QR para acceso rápido a la mesa
- Gestión de comensales (host + invitados)
- Menú interactivo con personalización de platos
- Pedidos colaborativos en tiempo real
- Seguimiento del estado de la cocina con notificaciones
- División de cuenta flexible (4 métodos diferentes)
- Integración con Mercado Pago para pagos
- Sistema de feedback post-experiencia

---

## 2. Stack Tecnológico

### Frontend
- **React 19.2.3**: Framework principal de UI
- **TypeScript 5.8.2**: Tipado estático
- **Tailwind CSS**: Framework de estilos (via CDN)
- **Vite 6.2.0**: Build tool y dev server

### Backend / Base de Datos
- **Supabase**: 
  - PostgreSQL como base de datos
  - Autenticación (Auth)
  - Realtime subscriptions para sincronización en tiempo real
  - REST API automática

### Librerías Externas
- **html5-qrcode**: Escaneo de códigos QR desde la cámara del dispositivo
- **Material Symbols**: Iconografía

### Pagos
- **Mercado Pago SDK**: Integración para procesamiento de pagos

### Estilos
- **Tailwind CSS** con configuración personalizada inyectada en el HTML
- Fuentes: Spline Sans, Manrope, Be Vietnam Pro, Noto Sans
- Tema oscuro por defecto
- Animaciones CSS personalizadas

---

## 3. Arquitectura y Gestión de Estado

### 3.1 Enrutamiento Manual (State-Based Router)

**No se utiliza react-router**. La navegación es gestionada enteramente en `App.tsx` mediante una variable de estado:

```typescript
const [currentView, setCurrentView] = useState<AppView>('INIT');
```

Los valores posibles del tipo `AppView` son:
- `'INIT'`: Estado inicial (cargando)
- `'SCAN'`: Vista de escaneo QR
- `'GUEST_INFO'`: Configuración de comensales
- `'MENU'`: Catálogo de platos
- `'ORDER_SUMMARY'`: Resumen del pedido pendiente
- `'PROGRESS'`: Seguimiento del estado de la cocina
- `'SPLIT_BILL'`: División de la cuenta
- `'INDIVIDUAL_SHARE'`: Vista individual de pago
- `'CHECKOUT'`: Proceso de checkout
- `'FEEDBACK'`: Sistema de reseñas
- `'CONFIRMATION'`: Confirmación final

La navegación se realiza mediante renderizado condicional:

```typescript
{currentView === 'SCAN' && <ScanView ... />}
{currentView === 'MENU' && <MenuView ... />}
// etc.
```

### 3.2 Estado Global (App.tsx)

`App.tsx` actúa como el contenedor principal y **"Single Source of Truth"**. Gestiona:

#### Estado de Sesión
```typescript
const [restaurant, setRestaurant] = useState<any>(null);
const [currentTable, setCurrentTable] = useState<any>(null);
const [currentWaiter, setCurrentWaiter] = useState<any>(null);
```

#### Estado del Carrito
```typescript
const [cart, setCart] = useState<OrderItem[]>([]);
const [editingCartItem, setEditingCartItem] = useState<OrderItem | null>(null);
```

#### Estado de la Orden
```typescript
const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
```

#### Estado de Comensales
```typescript
const [guests, setGuests] = useState<Guest[]>([
  { id: '1', name: 'Invitado 1 (Tú)', isHost: true }
]);
const [activeGuestId, setActiveGuestId] = useState<string>('1');
```

#### Estado del Menú
```typescript
const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
const [categories, setCategories] = useState<any[]>([]);
const [activeCategory, setActiveCategory] = useState<string>('Destacados');
```

### 3.3 Persistencia y Recuperación

#### LocalStorage Keys
```typescript
const SESSION_KEY = 'dinesplit_active_session';
const ACTIVE_ORDER_KEY = 'dinesplit_active_order_id';
```

#### Flujo de Inicialización (`handleStartSession`)

1. **Verificación de Parámetros URL**: Si hay `?res=XXX&table=Y`, se guarda en localStorage
2. **Validación de Restaurante**: Busca en `restaurants` por `access_code`
3. **Validación de Mesa**: Busca en `tables` por `restaurant_id` y `table_number`
4. **Carga de Datos**:
   - Waiter (mozo asignado)
   - Categories (categorías del menú)
   - Menu Items (platos disponibles)
5. **Recuperación de Orden Activa**:
   - Verifica si existe una orden con `status != 'PAGADO'` en localStorage
   - Si existe, recupera los `order_items` desde la DB
   - Restaura el carrito y redirige a `'MENU'`
6. **Si no hay orden activa**: Limpia localStorage y redirige a `'GUEST_INFO'`

---

## 4. Modelo de Datos (Esquema de Supabase)

Basado en las consultas en `App.tsx` y las interfaces en `types.ts`, el esquema relacional es:

### 4.1 Tablas Principales

#### `restaurants`
```sql
id: uuid (PK)
name: text
access_code: text (unique, usado para QR)
logo_url: text
```

#### `tables`
```sql
id: uuid (PK)
restaurant_id: uuid (FK → restaurants.id)
table_number: integer
capacity: integer
```

#### `waiters`
```sql
id: uuid (PK)
restaurant_id: uuid (FK → restaurants.id)
name: text
```

#### `categories`
```sql
id: uuid (PK)
restaurant_id: uuid (FK → restaurants.id)
name: text
sort_order: integer
```

#### `menu_items`
```sql
id: uuid (PK)
restaurant_id: uuid (FK → restaurants.id)
name: text
price: decimal
description: text
image_url: text
category_id: uuid (FK → categories.id)
subcategory_id: uuid (nullable)
average_rating: decimal (nullable)
is_featured: boolean (default: false)
dietary_tags: text[] (nullable)
customer_customization: jsonb (nullable) -- {ingredientsToAdd: [], ingredientsToRemove: []}
calories: integer (nullable)
protein_g: decimal (nullable)
total_fat_g: decimal (nullable)
sat_fat_g: decimal (nullable)
carbs_g: decimal (nullable)
sugars_g: decimal (nullable)
fiber_g: decimal (nullable)
sodium_mg: integer (nullable)
sort_order: integer
```

#### `orders`
```sql
id: uuid (PK)
restaurant_id: uuid (FK → restaurants.id)
table_id: uuid (FK → tables.id)
status: text ('open', 'PREPARANDO', 'LISTO', 'closed', 'PAGADO', 'paid')
total_amount: decimal
guest_count: integer
guest_name: text
created_at: timestamp
updated_at: timestamp
```

#### `order_items`
```sql
id: uuid (PK)
order_id: uuid (FK → orders.id)
menu_item_id: uuid (FK → menu_items.id)
guest_id: text (ID del comensal local, no FK)
quantity: integer
unit_price: decimal
notes: text (nullable) -- Formato: "EXTRAS: item1,item2 | SIN: item3,item4"
batch_id: uuid (nullable, FK → order_batches.id)
```

#### `order_batches`
```sql
id: uuid (PK)
order_id: uuid (FK → orders.id)
batch_number: integer
status: text ('PREPARANDO', 'LISTO', 'SERVIDO')
created_at: timestamp
```

**Nota**: Los `batch_id` agrupan items que se enviaron juntos a la cocina. Esto permite trackear múltiples "oleadas" de pedidos.

#### `reviews`
```sql
id: uuid (PK)
order_id: uuid (FK → orders.id)
waiter_rating: integer (nullable)
item_rating: integer (nullable)
comments: text (nullable)
```

### 4.2 Relaciones Clave

- `restaurants` → `tables` (1:N)
- `restaurants` → `menu_items` (1:N)
- `restaurants` → `categories` (1:N)
- `orders` → `order_items` (1:N)
- `orders` → `order_batches` (1:N)
- `order_items` → `menu_items` (N:1)
- `order_batches` → `order_items` (1:N)

---

## 5. Flujo Detallado de Usuario

### A. Onboarding (ScanView)

1. **Acceso Inicial**:
   - El usuario escanea un QR que contiene: `?res=XXX&table=Y`
   - Alternativamente, puede ingresar `access_code` y `table_number` manualmente

2. **Validación**:
   - Se ejecuta `handleStartSession(accessCode, tableNum)`
   - Se guarda la sesión en localStorage bajo `SESSION_KEY`

3. **Recuperación de Sesión**:
   - Si el usuario regresa, `useEffect` en `App.tsx` detecta la sesión guardada
   - Intenta recuperar la orden activa si existe

### B. Configuración de Mesa (GuestInfoView)

1. **Definición de Comensales**:
   - El host (usuario principal) define cuántas personas hay
   - Cada comensal tiene un `id` único y un `name`
   - Por defecto, el primer comensal es el host (`isHost: true`)

2. **Estado Local**:
   - Los `guests` se almacenan solo en memoria (React state)
   - No se persisten en Supabase hasta que se hace un pedido

3. **Propósito**:
   - Los `guest_id` se usan para asignar items en `order_items`
   - Permite trackear quién pidió qué para la división de cuenta

### C. Menú y Pedido (MenuView y OrderSummaryView)

#### MenuView

1. **Visualización**:
   - Muestra items filtrados por categoría (`activeCategory`)
   - Cada item muestra: imagen, nombre, precio, descripción

2. **Lógica Visual "Social"**:
   - Calcula totales "sociales": cuántos pidió la mesa completa vs. el usuario actual
   - Muestra badges como "3 en la mesa" o "Tú pediste 1"

3. **Personalización**:
   - Permite agregar extras (`extras: string[]`)
   - Permite remover ingredientes (`removedIngredients: string[]`)
   - Los extras se guardan en `order_items.notes` con formato:
     ```
     "EXTRAS: queso, tomate | SIN: cebolla"
     ```

4. **Agregar al Carrito**:
   - Crea un `OrderItem` con `isConfirmed: false`
   - Asocia el item al `activeGuestId`
   - Actualiza el estado local del carrito

#### OrderSummaryView

1. **Visualización del Carrito**:
   - Muestra items pendientes (`isConfirmed: false`)
   - Muestra batches ya confirmados (items con `isConfirmed: true`)

2. **Envío a Cocina** (`handleSendOrder`):
   
   **Transacción Completa**:
   
   a. **Resolución de Orden**:
      - Si `activeOrderId` existe, la reutiliza
      - Si no existe, crea una nueva orden con `status: 'PREPARANDO'`
   
   b. **Inserción de Items**:
      - Solo inserta items con `isConfirmed: false`
      - Calcula `unit_price` desde `menu_items.price`
      - Formatea `notes` con extras e ingredientes removidos
   
   c. **Actualización de Total**:
      - Suma los nuevos items al `total_amount` existente
      - Actualiza `status: 'PREPARANDO'` en la orden
   
   d. **Sincronización Local**:
      - Guarda `activeOrderId` en localStorage
      - Llama a `fetchOrderItemsFromDB` para recargar el estado
      - Marca los items como `isConfirmed: true`
   
   e. **Navegación**:
      - Redirige a `'PROGRESS'` para seguimiento

### D. Seguimiento Realtime (OrderProgressView)

1. **Suscripción a Cambios**:
   ```typescript
   const channel = supabase
     .channel(`order-${activeOrderId}`)
     .on('postgres_changes', {
       event: 'UPDATE',
       schema: 'public',
       table: 'order_batches',
       filter: `order_id=eq.${activeOrderId}`
     }, (payload) => {
       // Actualiza el estado local del batch
     })
     .subscribe();
   ```

2. **Estados del Batch**:
   - `'PREPARANDO'`: Cocina está trabajando
   - `'LISTO'`: Listo para servir
   - `'SERVIDO'`: Ya fue servido

3. **Notificaciones**:
   - Si un batch cambia a `'LISTO'`:
     - Reproduce un sonido (usando Web Audio API o HTML audio)
     - Vibra el dispositivo (si está disponible)
     - Muestra una notificación visual

4. **Transición a Pago**:
   - Si la orden cambia a `'PAGADO'`, redirige a `'FEEDBACK'`

### E. División de Cuenta (SplitBillView)

Esta es la vista con **lógica más compleja**. Maneja 4 estrategias de división en memoria:

#### 1. Equitativo (`'EQUAL'`)
- Divide el `total_amount` entre N comensales seleccionados
- Cada uno paga: `total / selectedGuests.length`

#### 2. Por Item (`'BY_ITEM'`)
- Permite asignar platos específicos a comensales específicos
- Soporta compartidos (un plato entre múltiples personas)
- Calcula proporciones: si 2 personas comparten un plato, cada uno paga 50%

#### 3. Por Comensal (`'BY_GUEST'`)
- Calcula basado en `guest_id` de `order_items`
- Suma los `unit_price * quantity` de cada item asociado a cada comensal
- Más preciso: refleja exactamente quién pidió qué

#### 4. Manual (`'CUSTOM'`)
- Inputs directos de montos por comensal
- Lógica `onFocus` para UX rápida: al enfocar un input, puede autocompletar
- Validación: suma total debe igualar `total_amount`

#### Estado de División
```typescript
const [splitData, setSplitData] = useState<any[] | null>(null);
// Estructura: [{ guestId: '1', name: 'Juan', amount: 1500 }, ...]
```

Al confirmar, llama a `handleSplitConfirm(shares)` que navega a `'CHECKOUT'`.

### F. Pago (CheckoutView & IndividualShareView)

#### CheckoutView
1. **Resumen**:
   - Muestra cuánto debe cada comensal según `splitData`
   - Muestra total general

2. **QR para Compartir**:
   - Genera un link único por comensal
   - Formato: `https://app.dinesplit.com/share?order=XXX&guest=YYY`
   - Permite que otros comensales accedan a su cuota individual

#### IndividualShareView
1. **Vista Individual**:
   - Muestra solo la cuota de un comensal específico
   - Opciones de pago:
     - **Mercado Pago**: Crea una preferencia de pago
     - **Transferencia**: Muestra datos bancarios
     - **Efectivo**: Marca como pagado manualmente

2. **Integración Mercado Pago**:
   ```typescript
   // Llamada al backend (API Route o Edge Function)
   const response = await fetch('/api/create-payment-preference', {
     method: 'POST',
     body: JSON.stringify({
       orderId: activeOrderId,
       guestId: guestId,
       amount: splitAmount
     })
   });
   const { init_point } = await response.json();
   window.location.href = init_point; // Redirección a MP
   ```

3. **Callback de Pago**:
   - Mercado Pago redirige de vuelta con `?status=approved`
   - Se actualiza el estado del pago en la orden
   - Se redirige a `'CONFIRMATION'`

### G. Feedback (FeedbackView)

1. **Reseñas**:
   - Rating del mozo (1-5 estrellas)
   - Rating general de los platos (1-5 estrellas)
   - Comentarios opcionales

2. **Persistencia**:
   - Inserta un registro en `reviews` vinculado a `order_id`
   - Actualiza `average_rating` en `menu_items` si aplica

### H. Confirmación (ConfirmationView)

- Muestra mensaje de agradecimiento
- Opción de generar recibo/boleta
- Link para volver a escanear otra mesa

---

## 6. Detalles Importantes para Desarrollo

### 6.1 Props Drilling

Al no usar Context API o Redux, notarás que `guests`, `cart`, y funciones como `onUpdateCartItem` se pasan a través de múltiples niveles de componentes:

```
App.tsx
  → MenuView (recibe: cart, guests, onUpdateCartItem, ...)
    → MenuItemCard (recibe: onAddToCart, ...)
  → OrderSummaryView (recibe: cart, onUpdateCartItem, ...)
    → CartItemRow (recibe: item, onUpdate, ...)
  → SplitBillView (recibe: cart, guests, ...)
```

**Consideración**: Para proyectos más grandes, considerar Context API o Zustand para evitar props drilling excesivo.

### 6.2 Tipos TypeScript

`types.ts` es la fuente de verdad para las interfaces:

- `AppView`: Union type de todas las vistas posibles
- `Guest`: Estructura de comensal
- `MenuItem`: Estructura completa de un plato
- `OrderItem`: Item en el carrito/pedido
- `BillSplit`: Método de división de cuenta

### 6.3 Estilos y Diseño

#### Mobile First
- Diseño agresivamente "Mobile First"
- Zonas táctiles grandes: `size-14`, `h-16`, `p-4`
- Backdrops borrosos (`backdrop-blur-md`)
- Animaciones CSS personalizadas definidas en `index.html`

#### Configuración de Tailwind
- Tema oscuro por defecto (`class="dark"` en `<html>`)
- Colores personalizados:
  - `primary: #13ec6a` (verde neón)
  - `background-dark: #102217`
  - `surface-dark: #1A2E22`
  - `text-secondary: #9db9a8`

#### Animaciones
- `fade-in-up`: Entrada suave desde abajo
- `pulse-ring`: Anillo pulsante (usado en botones)
- `scan`: Animación de escaneo QR

### 6.4 Manejo de Errores

- Errores de conexión se muestran con `setError()` en `App.tsx`
- Errores de validación se muestran con `alert()` en funciones críticas
- Logs de debug: Prefijo `[DineSplit]` en console.log

### 6.5 Optimizaciones

- **Memoización**: `useMemo` para cálculos costosos (totales, filtros)
- **Callbacks**: `useCallback` para funciones pasadas como props
- **Lazy Loading**: Considerar `React.lazy()` para vistas pesadas si el bundle crece

### 6.6 Seguridad

- **Supabase RLS (Row Level Security)**: Asegurar que las políticas permitan solo lectura/escritura autorizada
- **Validación de Inputs**: Validar `access_code` y `table_number` antes de consultas
- **Sanitización**: Los `notes` en `order_items` deben ser sanitizados antes de insertar

### 6.7 Testing (Recomendaciones)

- **Unit Tests**: Funciones de cálculo (división de cuenta, totales)
- **Integration Tests**: Flujo completo de pedido (Scan → Menu → Order → Progress)
- **E2E Tests**: Cypress o Playwright para flujos críticos

---

## 7. Estructura de Archivos

```
splitme-guests/
├── App.tsx                 # Componente principal, estado global, routing
├── index.tsx              # Entry point, ReactDOM.render
├── index.html             # HTML base con Tailwind config y scripts
├── types.ts               # Definiciones de tipos TypeScript
├── constants.ts           # Constantes de la aplicación
├── lib/
│   └── supabase.ts        # Cliente de Supabase
├── views/                 # Componentes de vista (una por AppView)
│   ├── ScanView.tsx
│   ├── GuestInfoView.tsx
│   ├── MenuView.tsx
│   ├── OrderSummaryView.tsx
│   ├── OrderProgressView.tsx
│   ├── SplitBillView.tsx
│   ├── IndividualShareView.tsx
│   ├── CheckoutView.tsx
│   ├── FeedbackView.tsx
│   └── ConfirmationView.tsx
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 8. Configuración del Entorno

### Variables de Entorno

El proyecto actualmente tiene las credenciales de Supabase hardcodeadas en `lib/supabase.ts`. Para producción, usar variables de entorno:

```typescript
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
```

Archivo `.env.local`:
```
VITE_SUPABASE_URL=https://hqaiuywzklrwywdhmqxw.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Scripts Disponibles

```bash
npm run dev      # Inicia servidor de desarrollo (Vite)
npm run build    # Build de producción
npm run preview  # Preview del build de producción
```

---

## 9. Próximos Pasos y Mejoras Sugeridas

1. **Context API**: Refactorizar estado global a Context para reducir props drilling
2. **Error Boundaries**: Implementar React Error Boundaries para manejo de errores
3. **Loading States**: Mejorar estados de carga con skeletons
4. **Offline Support**: Implementar service workers para funcionar offline
5. **Push Notifications**: Notificaciones push cuando un batch está listo
6. **Analytics**: Integrar analytics para tracking de conversión
7. **Testing**: Agregar suite completa de tests
8. **Documentación de API**: Documentar endpoints de Supabase/Edge Functions
9. **Internacionalización**: Soporte multi-idioma
10. **Accesibilidad**: Mejorar ARIA labels y navegación por teclado

---

## 10. Contacto y Soporte

Para preguntas técnicas o issues, consultar el repositorio o contactar al equipo de desarrollo.

---

**Última actualización**: Diciembre 2024  
**Versión del Proyecto**: 0.0.0

