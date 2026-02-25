# Integración de Notificaciones para splitme-waiter

Este documento explica cómo integrar la recepción de notificaciones de solicitudes de comensales en la app `splitme-waiter`.

## Estructura de la Tabla `waiter_notifications`

```sql
waiter_notifications:
  - id: UUID (PK)
  - waiter_id: UUID (FK → waiters.id)
  - order_id: UUID (FK → orders.id)
  - table_number: INTEGER
  - message: TEXT
  - status: VARCHAR ('pending', 'read', 'completed')
  - created_at: TIMESTAMP
  - updated_at: TIMESTAMP
```

## Implementación en React

### 1. Componente de Notificaciones para el Mesero

```typescript
import { useEffect, useState, useRef } from 'react';
import { supabase } from './lib/supabase'; // Ajusta la ruta según tu estructura

interface WaiterNotification {
  id: string;
  waiter_id: string;
  order_id: string;
  table_number: number;
  message: string;
  status: 'pending' | 'read' | 'completed';
  created_at: string;
  updated_at: string;
}

interface UseWaiterNotificationsProps {
  waiterId: string | null;
  onNewNotification?: (notification: WaiterNotification) => void;
}

export const useWaiterNotifications = ({ 
  waiterId, 
  onNewNotification 
}: UseWaiterNotificationsProps) => {
  const [notifications, setNotifications] = useState<WaiterNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const channelRef = useRef<any>(null);

  // Cargar notificaciones iniciales
  useEffect(() => {
    if (!waiterId || !supabase) return;

    const loadNotifications = async () => {
      const { data, error } = await supabase
        .from('waiter_notifications')
        .select('*')
        .eq('waiter_id', waiterId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[WaiterNotifications] Error al cargar notificaciones:', error);
        return;
      }

      if (data) {
        setNotifications(data);
        const pending = data.filter(n => n.status === 'pending').length;
        setUnreadCount(pending);
      }
    };

    loadNotifications();
  }, [waiterId]);

  // Suscripción Realtime a nuevas notificaciones
  useEffect(() => {
    if (!waiterId || !supabase) return;

    // Limpiar canal anterior si existe
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Crear nuevo canal para este mesero
    const channel = supabase
      .channel(`waiter-notifications-${waiterId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'waiter_notifications',
          filter: `waiter_id=eq.${waiterId}`
        },
        (payload) => {
          console.log('[WaiterNotifications] Nueva notificación recibida:', payload.new);
          
          const newNotification = payload.new as WaiterNotification;
          
          // Agregar a la lista de notificaciones
          setNotifications(prev => [newNotification, ...prev]);
          
          // Incrementar contador de no leídas
          setUnreadCount(prev => prev + 1);
          
          // Reproducir sonido de notificación
          playNotificationSound();
          
          // Mostrar notificación del navegador (si está permitido)
          showBrowserNotification(newNotification);
          
          // Llamar callback si está definido
          if (onNewNotification) {
            onNewNotification(newNotification);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'waiter_notifications',
          filter: `waiter_id=eq.${waiterId}`
        },
        (payload) => {
          // Actualizar notificación si cambió su estado
          setNotifications(prev =>
            prev.map(n =>
              n.id === payload.new.id ? { ...n, ...payload.new } : n
            )
          );
          
          // Recalcular contador de no leídas
          setUnreadCount(prev => {
            const updated = payload.new as WaiterNotification;
            if (updated.status === 'pending' && payload.old.status !== 'pending') {
              return prev + 1;
            } else if (updated.status !== 'pending' && payload.old.status === 'pending') {
              return Math.max(0, prev - 1);
            }
            return prev;
          });
        }
      )
      .subscribe((status) => {
        console.log('[WaiterNotifications] Estado de suscripción:', status);
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [waiterId, onNewNotification]);

  // Función para marcar notificación como leída
  const markAsRead = async (notificationId: string) => {
    if (!supabase) return;

    const { error } = await supabase
      .from('waiter_notifications')
      .update({ status: 'read' })
      .eq('id', notificationId);

    if (error) {
      console.error('[WaiterNotifications] Error al marcar como leída:', error);
    }
  };

  // Función para marcar notificación como completada
  const markAsCompleted = async (notificationId: string) => {
    if (!supabase) return;

    const { error } = await supabase
      .from('waiter_notifications')
      .update({ status: 'completed' })
      .eq('id', notificationId);

    if (error) {
      console.error('[WaiterNotifications] Error al marcar como completada:', error);
    }
  };

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAsCompleted
  };
};

// Función helper para reproducir sonido
const playNotificationSound = () => {
  try {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play().catch(e => console.log('[WaiterNotifications] Error al reproducir sonido:', e));
  } catch (error) {
    console.error('[WaiterNotifications] Error al crear audio:', error);
  }
};

// Función helper para mostrar notificación del navegador
const showBrowserNotification = (notification: WaiterNotification) => {
  if (!('Notification' in window)) {
    console.log('[WaiterNotifications] Este navegador no soporta notificaciones');
    return;
  }

  if (Notification.permission === 'granted') {
    new Notification(`Mesa ${notification.table_number}`, {
      body: notification.message,
      icon: '/icon-192x192.png', // Ajusta la ruta del icono
      tag: notification.id,
      requireInteraction: false
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(`Mesa ${notification.table_number}`, {
          body: notification.message,
          icon: '/icon-192x192.png',
          tag: notification.id
        });
      }
    });
  }
};
```

### 2. Componente de UI para Mostrar Notificaciones

```typescript
import React, { useState } from 'react';
import { useWaiterNotifications } from './hooks/useWaiterNotifications';

interface WaiterNotificationsPanelProps {
  waiterId: string | null;
}

export const WaiterNotificationsPanel: React.FC<WaiterNotificationsPanelProps> = ({ waiterId }) => {
  const { notifications, unreadCount, markAsRead, markAsCompleted } = useWaiterNotifications({
    waiterId,
    onNewNotification: (notification) => {
      console.log('Nueva notificación:', notification);
      // Aquí puedes mostrar un toast, actualizar UI, etc.
    }
  });

  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      {/* Botón de notificaciones con badge */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <span className="material-symbols-outlined">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel de notificaciones */}
      {isOpen && (
        <div className="absolute right-0 top-12 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 max-h-96 overflow-y-auto z-50">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-bold text-lg">Notificaciones</h3>
            {unreadCount > 0 && (
              <p className="text-sm text-gray-500">{unreadCount} sin leer</p>
            )}
          </div>

          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No hay notificaciones
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    notification.status === 'pending' ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold">Mesa {notification.table_number}</span>
                        {notification.status === 'pending' && (
                          <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
                            Nueva
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(notification.created_at).toLocaleString('es-AR')}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-3">
                    {notification.status === 'pending' && (
                      <>
                        <button
                          onClick={() => markAsRead(notification.id)}
                          className="text-xs px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                          Marcar como leída
                        </button>
                        <button
                          onClick={() => markAsCompleted(notification.id)}
                          className="text-xs px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                        >
                          Completar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
```

### 3. Uso en el Componente Principal del Mesero

```typescript
import { WaiterNotificationsPanel } from './components/WaiterNotificationsPanel';

// En tu componente principal del mesero
const WaiterApp = () => {
  const [currentWaiter, setCurrentWaiter] = useState<any>(null);

  // ... código de autenticación y carga del mesero ...

  return (
    <div>
      {/* Header con panel de notificaciones */}
      <header>
        <WaiterNotificationsPanel waiterId={currentWaiter?.id} />
      </header>

      {/* Resto de tu app */}
    </div>
  );
};
```

## Configuración de Notificaciones del Navegador

Para habilitar notificaciones push del navegador, solicita permisos al inicio de la app:

```typescript
// En el componente principal o en un hook de inicialización
useEffect(() => {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      console.log('[WaiterApp] Permiso de notificaciones:', permission);
    });
  }
}, []);
```

## Notas Importantes

1. **Realtime debe estar habilitado** en Supabase para la tabla `waiter_notifications`
2. **RLS (Row Level Security)** ya está configurado en el script SQL
3. Las notificaciones se filtran automáticamente por `waiter_id`
4. El contador de no leídas se actualiza en tiempo real
5. Las notificaciones se ordenan por fecha (más recientes primero)

## Próximos Pasos

1. Copiar el hook `useWaiterNotifications` a tu proyecto splitme-waiter
2. Crear el componente `WaiterNotificationsPanel` 
3. Integrar en la UI principal del mesero
4. Solicitar permisos de notificaciones del navegador al iniciar la app
5. Probar enviando una solicitud desde la app de comensales
