# DineSplit - Aplicación para Comensales

**DineSplit** es una Single Page Application (SPA) construida con React 19 y TypeScript que digitaliza la experiencia de comensales en restaurantes. Permite escanear un QR, unirse a una mesa, realizar pedidos colaborativos, seguir el estado de la cocina en tiempo real y dividir la cuenta de forma granular.

## 🚀 Inicio Rápido

### Prerrequisitos

- **Node.js** 18+ 
- **npm** o **yarn**

### Instalación y Ejecución

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar variables de entorno (opcional):**
   
   Crea un archivo `.env.local` en la raíz del proyecto:
   ```env
   VITE_SUPABASE_URL=tu_url_de_supabase
   VITE_SUPABASE_ANON_KEY=tu_clave_anon_de_supabase
   ```
   
   **Nota**: Actualmente las credenciales están configuradas en `lib/supabase.ts`. Para producción, se recomienda usar variables de entorno.

3. **Ejecutar en modo desarrollo:**
   ```bash
   npm run dev
   ```

4. **Build para producción:**
   ```bash
   npm run build
   ```

5. **Preview del build:**
   ```bash
   npm run preview
   ```

## 📋 Características Principales

- ✅ Escaneo de códigos QR para acceso rápido
- 👥 Gestión de múltiples comensales
- 🍽️ Menú interactivo con personalización de platos
- 📦 Pedidos colaborativos en tiempo real
- 🔔 Seguimiento del estado de la cocina con notificaciones
- 💰 División de cuenta flexible (4 métodos diferentes)
- 💳 Integración con Mercado Pago
- ⭐ Sistema de feedback post-experiencia

## 🛠️ Stack Tecnológico

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Realtime)
- **Build Tool**: Vite
- **QR Scanner**: html5-qrcode
- **Pagos**: Mercado Pago SDK

## 📚 Documentación

Para documentación técnica detallada sobre arquitectura, modelo de datos, flujos de usuario y detalles de implementación, consulta:

**[📖 DOCUMENTACION_TECNICA.md](./DOCUMENTACION_TECNICA.md)**

La documentación técnica incluye:
- Arquitectura y gestión de estado
- Modelo de datos completo (esquema de Supabase)
- Flujos detallados de usuario
- Guías de desarrollo y mejores prácticas
- Estructura de archivos
- Recomendaciones de mejora

## 🏗️ Estructura del Proyecto

```
splitme-guests/
├── App.tsx                 # Componente principal y estado global
├── index.tsx              # Entry point
├── index.html             # HTML base con configuración de Tailwind
├── types.ts               # Definiciones de tipos TypeScript
├── lib/
│   └── supabase.ts        # Cliente de Supabase
└── views/                 # Componentes de vista
    ├── ScanView.tsx
    ├── GuestInfoView.tsx
    ├── MenuView.tsx
    ├── OrderSummaryView.tsx
    ├── OrderProgressView.tsx
    ├── SplitBillView.tsx
    ├── IndividualShareView.tsx
    ├── CheckoutView.tsx
    ├── FeedbackView.tsx
    └── ConfirmationView.tsx
```

## 🎯 Flujo de Usuario

1. **Escanear QR** o ingresar código de acceso manualmente
2. **Configurar comensales** de la mesa
3. **Explorar el menú** y agregar platos al carrito
4. **Enviar pedido** a la cocina
5. **Seguir el progreso** del pedido en tiempo real
6. **Dividir la cuenta** según preferencia
7. **Realizar el pago** individual o compartido
8. **Dejar feedback** sobre la experiencia

## 📝 Notas de Desarrollo

- El proyecto **no utiliza react-router**. La navegación se gestiona mediante estado en `App.tsx`
- El estado global se maneja en `App.tsx` (sin Context API ni Redux)
- Los estilos utilizan Tailwind CSS con tema oscuro por defecto
- La persistencia se realiza mediante localStorage y Supabase

## 🤝 Contribuir

Para contribuir al proyecto, consulta la documentación técnica para entender la arquitectura y las convenciones de código.

## 📄 Licencia

[Especificar licencia si aplica]

---

**Última actualización**: Diciembre 2024
