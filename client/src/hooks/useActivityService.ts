import { useState, useEffect, useCallback, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import {
  Activity,
  ActivityFilter,
  ActivityNotification,
  ActivitySummary,
  ActivityUpdateEvent,
  ActivityNotificationEvent,
  BulkActivityEvent,
} from '../types/activity.types';

interface UseActivityServiceProps {
  canvasId: string;
  userId: string;
  userName: string;
  userEmail: string;
  serverUrl?: string;
}

interface UseActivityServiceReturn {
  // Connection state
  isConnected: boolean;
  socket: typeof Socket | null;
  
  // Activities
  activities: Activity[];
  isLoading: boolean;
  error: string | null;
  
  // Notifications
  notifications: ActivityNotification[];
  unreadCount: number;
  
  // Summary data
  summary: ActivitySummary | null;
  
  // Actions
  fetchActivities: (filter?: ActivityFilter) => Promise<void>;
  fetchSummary: (hours?: number) => Promise<void>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  
  // Real-time listeners
  onActivityUpdate: (callback: (activity: Activity) => void) => void;
  onNotification: (callback: (notification: ActivityNotification) => void) => void;
}

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export const useActivityService = ({
  canvasId,
  userId,
  userName,
  userEmail,
  serverUrl = API_BASE_URL,
}: UseActivityServiceProps): UseActivityServiceReturn => {
  const [socket, setSocket] = useState<typeof Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  
  // Refs for callbacks to avoid dependency issues
  const activityCallbackRef = useRef<((activity: Activity) => void) | null>(null);
  const notificationCallbackRef = useRef<((notification: ActivityNotification) => void) | null>(null);

  // Initialize socket connection
  useEffect(() => {
    if (!canvasId || !userId) return;

    const socketInstance = io(`${serverUrl}/collaboration`, {
      query: {
        userId,
        userName,
        userEmail,
      },
      transports: ['websocket', 'polling'],
    });

    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      setIsConnected(true);
      setError(null);
      
      // Join the canvas
      socketInstance.emit('join_canvas', { canvasId });
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    socketInstance.on('connect_error', (err: any) => {
      setError(`Connection error: ${err.message}`);
      setIsConnected(false);
    });

    // Listen for activity updates
    socketInstance.on('activity_update', (event: ActivityUpdateEvent) => {
      const activity = {
        ...event.data,
        timestamp: new Date(event.data.timestamp),
      };
      
      setActivities(prev => [activity, ...prev].slice(0, 100)); // Keep last 100 activities
      
      if (activityCallbackRef.current) {
        activityCallbackRef.current(activity);
      }
    });

    // Listen for activity notifications
    socketInstance.on('activity_notification', (event: ActivityNotificationEvent) => {
      const notification = {
        ...event.data,
        timestamp: new Date(event.data.timestamp),
        read: false,
      };
      
      setNotifications(prev => [notification, ...prev]);
      
      if (notificationCallbackRef.current) {
        notificationCallbackRef.current(notification);
      }
    });

    // Listen for bulk activity updates
    socketInstance.on('bulk_activity_update', (event: BulkActivityEvent) => {
      const bulkActivities = event.data.activities.map(activity => ({
        ...activity,
        timestamp: new Date(activity.timestamp),
      }));
      
      setActivities(prev => [...bulkActivities, ...prev].slice(0, 100));
    });

    return () => {
      socketInstance.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [canvasId, userId, userName, userEmail, serverUrl]);

  // Fetch activities from API
  const fetchActivities = useCallback(async (filter?: ActivityFilter) => {
    if (!canvasId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      params.append('canvasId', canvasId);
      
      if (filter?.conversationId) params.append('conversationId', filter.conversationId);
      if (filter?.userId) params.append('userId', filter.userId);
      if (filter?.activityTypes) params.append('activityTypes', filter.activityTypes.join(','));
      if (filter?.startDate) params.append('startDate', filter.startDate.toISOString());
      if (filter?.endDate) params.append('endDate', filter.endDate.toISOString());
      if (filter?.limit) params.append('limit', filter.limit.toString());
      if (filter?.offset) params.append('offset', filter.offset.toString());
      
      const response = await fetch(`${serverUrl}/collaboration/activities/canvas/${canvasId}?${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch activities: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        const fetchedActivities = result.data.map((activity: any) => ({
          ...activity,
          timestamp: new Date(activity.timestamp),
        }));
        
        setActivities(filter?.offset ? prev => [...prev, ...fetchedActivities] : fetchedActivities);
      } else {
        throw new Error('Failed to fetch activities');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Error fetching activities:', err);
    } finally {
      setIsLoading(false);
    }
  }, [canvasId, serverUrl]);

  // Fetch activity summary
  const fetchSummary = useCallback(async (hours: number = 24) => {
    if (!canvasId) return;
    
    try {
      const response = await fetch(
        `${serverUrl}/collaboration/activities/canvas/${canvasId}/summary?hours=${hours}`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch summary: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        setSummary(result.data);
      } else {
        throw new Error('Failed to fetch summary');
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
    }
  }, [canvasId, serverUrl]);

  // Notification management
  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(notification =>
        notification.id === id ? { ...notification, read: true } : notification
      )
    );
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev =>
      prev.map(notification => ({ ...notification, read: true }))
    );
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Callback registration
  const onActivityUpdate = useCallback((callback: (activity: Activity) => void) => {
    activityCallbackRef.current = callback;
  }, []);

  const onNotification = useCallback((callback: (notification: ActivityNotification) => void) => {
    notificationCallbackRef.current = callback;
  }, []);

  // Computed values
  const unreadCount = notifications.filter(n => !n.read).length;

  // Initial data fetch
  useEffect(() => {
    if (canvasId && isConnected) {
      fetchActivities();
      fetchSummary();
    }
  }, [canvasId, isConnected, fetchActivities, fetchSummary]);

  return {
    isConnected,
    socket,
    activities,
    isLoading,
    error,
    notifications,
    unreadCount,
    summary,
    fetchActivities,
    fetchSummary,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotifications,
    onActivityUpdate,
    onNotification,
  };
};