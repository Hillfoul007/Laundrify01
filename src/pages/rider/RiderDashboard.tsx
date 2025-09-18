import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Activity,
  Package,
  MapPin,
  Clock,
  User,
  Phone,
  Navigation,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import RiderLayout from '@/components/rider/RiderLayout';
import RiderNotifications from '@/components/rider/RiderNotifications';
import { getRiderApiUrl } from '@/lib/riderApi';
import OrderCard from '@/components/rider/OrderCard';
import EarningsDashboard from '@/components/rider/EarningsDashboard';
import TrainingVideo from '@/components/rider/TrainingVideo';

export default function RiderDashboard() {
  const navigate = useNavigate();
  const [rider, setRider] = useState<any>(null);
  const [isActive, setIsActive] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [assignedOrders, setAssignedOrders] = useState<any[]>([]);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [locationWatcher, setLocationWatcher] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastFetchError, setLastFetchError] = useState<string | null>(null);
  const [beeping, setBeeping] = useState(false);
  const audioRef = React.useRef<{ stop: () => void } | null>(null);
  const [earnings, setEarnings] = useState<{ daily: number; weekly: number }>({ daily: 0, weekly: 0 });

  useEffect(() => {
    // Load rider data
    const riderData = localStorage.getItem('riderAuth');
    if (riderData) {
      const riderInfo = JSON.parse(riderData);
      setRider(riderInfo);
      setIsActive(riderInfo.isActive || false);
    }
    
    // Load assigned orders
    fetchAssignedOrders();

    // Load earnings summary (demo or real if API available)
    fetchEarningsSummary();

    // Network status listeners
    const handleOnline = () => {
      setIsOnline(true);
      setLastFetchError(null);
      // Retry fetching data when coming back online
      fetchAssignedOrders();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isActive) {
      startLocationTracking();
    } else {
      stopLocationTracking();
    }
    
    return () => {
      if (locationWatcher) {
        navigator.geolocation.clearWatch(locationWatcher);
      }
    };
  }, [isActive]);

  const startLocationTracking = () => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setCurrentLocation(location);
          
          // Send location to backend
          updateLocationOnServer(location);
        },
        (error) => {
          console.error('Location error:', error);
          toast.error('Location access required for active status');
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000
        }
      );
      setLocationWatcher(watchId);
    }
  };

  const stopLocationTracking = () => {
    if (locationWatcher) {
      navigator.geolocation.clearWatch(locationWatcher);
      setLocationWatcher(null);
    }
  };

  // Play a synthetic beep loop using WebAudio until stopped (no asset required)
  const startBeepLoop = () => {
    if (audioRef.current) return;
    try {
      const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = 0.05; // low volume
      master.connect(ctx.destination);

      const play = () => {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        osc.connect(env);
        env.connect(master);
        env.gain.value = 0;
        const now = ctx.currentTime;
        env.gain.linearRampToValueAtTime(0.05, now + 0.01);
        env.gain.linearRampToValueAtTime(0.0, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.4);
      };

      const interval = window.setInterval(play, 600);
      audioRef.current = {
        stop: () => {
          clearInterval(interval);
          try { ctx.close(); } catch (e) {}
          audioRef.current = null;
        }
      };
      setBeeping(true);
    } catch (e) {
      console.warn('Beep unavailable', e);
    }
  };

  const stopBeepLoop = () => {
    if (audioRef.current) {
      audioRef.current.stop();
      setBeeping(false);
    }
  };

  const updateLocationOnServer = async (location: {lat: number, lng: number}) => {
    try {
      const token = localStorage.getItem('riderToken');

      if (!token || !rider) {
        console.log('No token or rider data, skipping location update');
        return;
      }

      // Skip if offline
      if (!navigator.onLine) {
        console.log('Offline - location update will be retried when online');
        return;
      }

      const apiUrl = getRiderApiUrl('/location');
      console.log('🔍 Updating location:', apiUrl);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          riderId: rider._id,
          location,
          timestamp: new Date().toISOString()
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn('Location update failed:', response.status, response.statusText);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('Location update timed out');
      } else {
        console.error('Failed to update location:', error);
      }
      // Don't show error to user for location updates as they're background operations
    }
  };

  const toggleActiveStatus = async () => {
    if (!isActive && !currentLocation) {
      // Request location permission first
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        
        setCurrentLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      } catch (error) {
        toast.error('Location access is required to go active');
        return;
      }
    }

    try {
      const token = localStorage.getItem('riderToken');
      const apiUrl = getRiderApiUrl('/toggle-status');
      console.log('🔍 Toggling status:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          riderId: rider?._id,
          isActive: !isActive,
          location: currentLocation
        })
      });

      if (response.ok) {
        setIsActive(!isActive);
        const updatedRider = { ...rider, isActive: !isActive };
        setRider(updatedRider);
        localStorage.setItem('riderAuth', JSON.stringify(updatedRider));
        
        toast.success(`You are now ${!isActive ? 'active' : 'inactive'}`);
      } else {
        toast.error('Failed to update status');
      }
    } catch (error) {
      toast.error('Network error. Please try again.');
    }
  };

  const fetchAssignedOrders = async () => {
    try {
      const token = localStorage.getItem('riderToken');

      if (!token) {
        console.log('No rider token, using demo orders');
        setDemoOrders();
        return;
      }

      const apiUrl = getRiderApiUrl('/orders');
      console.log('🔍 Fetching assigned orders from:', apiUrl);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const orders = await response.json();
        setAssignedOrders(Array.isArray(orders) ? orders : []);
        setLastFetchError(null); // Clear any previous errors

        // If there are new assigned orders that are not yet accepted, start the beep reminder
        const shouldBeep = (Array.isArray(orders) ? orders : []).some((o: any) => o.riderStatus === 'assigned');
        if (shouldBeep) startBeepLoop();
      } else {
        console.warn('Failed to fetch assigned orders:', response.status, response.statusText);
        setLastFetchError(`Server error: ${response.status}`);
        setDemoOrders();
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('Order fetch timed out');
        setLastFetchError('Request timed out - please check your connection');
      } else {
        console.error('Failed to fetch assigned orders:', error);
        setLastFetchError('Unable to connect to server');
      }
      setDemoOrders();
    }
  };

  const setDemoOrders = () => {
    const demoOrders = [
      {
        _id: 'demo_order_1',
        bookingId: 'LAU-001',
        customerName: 'John Doe',
        customerPhone: '+91 9876543210',
        address: 'D62, Extension, Chhawla, New Delhi, Delhi, 122101',
        pickupTime: '2:00 PM - 4:00 PM',
        type: 'Regular',
        riderStatus: 'assigned',
        assignedAt: new Date().toISOString()
      },
      {
        _id: 'quick_pickup_demo',
        bookingId: 'QP-002',
        customerName: 'Sarah Johnson',
        customerPhone: '+91 9876543211',
        address: 'A-45, Sector 12, Noida, Uttar Pradesh, 201301',
        pickupTime: '3:00 PM - 5:00 PM',
        type: 'Quick Pickup',
        riderStatus: 'assigned',
        assignedAt: new Date().toISOString()
      }
    ];
    setAssignedOrders(demoOrders);
  };

  const openGoogleMapsNavigation = (order: any) => {
    if (!currentLocation) {
      toast.error('Current location not available. Please enable location services.');
      return;
    }

    const destination = encodeURIComponent(order.address);
    const origin = `${currentLocation.lat},${currentLocation.lng}`;

    // Create Google Maps URL for navigation with driving directions
    const mapsUrl = `https://www.google.com/maps/dir/${origin}/${destination}/@${currentLocation.lat},${currentLocation.lng},15z/data=!3m1!4b1!4m2!4m1!3e0`;

    // Show loading toast
    toast.loading('Opening navigation...', { id: 'navigation' });

    // Open in new tab/window
    window.open(mapsUrl, '_blank');

    // Success feedback
    setTimeout(() => {
      toast.dismiss('navigation');
      toast.success(`🗺️ Navigation opened to ${order.customerName}'s location`, {
        description: order.address,
        duration: 4000
      });
    }, 500);
  };

  const handleOrderAction = async (orderId: string, action: 'accept' | 'start' | 'complete') => {
    try {
      // Validate rider status first
      if (!rider) {
        toast.error('Rider information not found. Please login again.');
        return;
      }

      if (rider.status !== 'approved') {
        toast.error('Only approved riders can accept orders. Your status: ' + rider.status);
        return;
      }

      if (!isActive && action === 'accept') {
        toast.error('Please go active to accept orders.');
        return;
      }

      const token = localStorage.getItem('riderToken');
      if (!token) {
        toast.error('Authentication token not found. Please login again.');
        return;
      }

      const apiUrl = getRiderApiUrl('/order-action');
      console.log('🔍 Order action:', action, 'for order:', orderId, 'API URL:', apiUrl);

      // Show loading state
      toast.loading(`${action.charAt(0).toUpperCase() + action.slice(1)}ing order...`, {
        id: `order-action-${orderId}`
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          orderId,
          action,
          riderId: rider?._id,
          location: currentLocation,
          timestamp: new Date().toISOString()
        })
      });

      const responseData = await response.json().catch(() => ({}));

      // Dismiss loading toast
      toast.dismiss(`order-action-${orderId}`);

      if (response.ok) {
        toast.success(`Order ${action}ed successfully!`);

        // If accepting an order, navigate to the order detail screen so rider can edit items and start navigation there
        if (action === 'accept') {
          // navigate to rider order detail page
          navigate(`/rider/orders/${orderId}`, { state: { fromAccept: true } });
        } else if (action === 'start') {
          // For start action, open navigation if order is present
          const currentOrder = assignedOrders.find(order => order._id === orderId);
          if (currentOrder) {
            setTimeout(() => {
              openGoogleMapsNavigation(currentOrder);
            }, 500);
          }
        }

        // Refresh orders immediately
        await fetchAssignedOrders();
      } else {
        console.error('Order action failed:', response.status, responseData);
        toast.error(responseData.message || `Failed to ${action} order. Please try again.`);
      }
    } catch (error) {
      console.error('Order action error:', error);
      toast.dismiss(`order-action-${orderId}`);
      toast.error('Network error. Please check your connection and try again.');
    }
  };

  if (!rider) {
    return <div>Loading...</div>;
  }

  return (
    <RiderLayout>
      <div className="space-y-6 rider-mobile-layout">
        {/* Network Status Indicator */}
        {!isOnline && (
          <Card className="rider-card-mobile rider-alert-mobile rider-alert-error-mobile">
            <CardContent className="pt-4">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <p className="text-red-800 font-medium rider-text-body-mobile">You're offline</p>
                <p className="text-red-600 text-sm rider-text-small-mobile">Some features may not work properly</p>
              </div>
            </CardContent>
          </Card>
        )}


        {/* Rider Status Alert */}
        {rider?.status !== 'approved' && (
          <Card className="rider-card-mobile rider-alert-mobile rider-alert-warning-mobile">
            <CardContent className="pt-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-1">
                  {rider?.status === 'pending' ? (
                    <Clock className="h-5 w-5 text-orange-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-orange-800 rider-text-body-mobile">
                    {rider?.status === 'pending' ? 'Account Pending Approval' : 'Account Rejected'}
                  </h3>
                  <p className="text-sm text-orange-700 mt-1 rider-text-small-mobile leading-relaxed">
                    {rider?.status === 'pending'
                      ? 'Your account is currently under review by our admin team. You will be notified once approved.'
                      : `Your account has been rejected. ${rider?.rejectionReason ? 'Reason: ' + rider.rejectionReason : 'Please contact admin for more details.'}`
                    }
                  </p>
                  {rider?.status === 'rejected' && (
                    <p className="text-sm text-orange-700 mt-2 rider-text-small-mobile">
                      <strong>Next Steps:</strong> Contact our support team to resubmit your application.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status Card */}
        <Card className="rider-card-mobile rider-status-card-mobile">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 rider-heading-small-mobile">
              <Activity className="h-5 w-5" />
              <span>Rider Status</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rider-status-toggle-mobile">
              <div className="rider-status-info-mobile">
                <div className="flex items-center justify-center space-x-2 mb-2">
                  <Label htmlFor="active-toggle" className="status-label">Active Status</Label>
                  <Badge variant={isActive ? 'default' : 'secondary'} className={`rider-badge-mobile ${isActive ? 'rider-badge-active-mobile' : 'rider-badge-inactive-mobile'}`}>
                    {isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <p className="status-description rider-text-body-mobile">
                  Toggle to start receiving order assignments
                </p>
                {currentLocation && (
                  <div className="rider-location-status-mobile">
                    <MapPin className="h-3 w-3" />
                    <span>Location tracking active</span>
                  </div>
                )}
              </div>
              <div className="flex justify-center">
                <Switch
                  id="active-toggle"
                  checked={isActive}
                  onCheckedChange={toggleActiveStatus}
                  disabled={rider?.status !== 'approved'}
                  className="rider-toggle-mobile"
                />
              </div>
              {rider?.status !== 'approved' && (
                <p className="text-xs text-gray-500 text-center mt-2 rider-text-small-mobile">
                  Only approved riders can go active
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rider-card-mobile">
          <CardContent>
            {assignedOrders.length === 0 ? (
              <div className="text-xs text-gray-500">No orders assigned. Go active to receive orders.</div>
            ) : (
              <div className="space-y-2">
                {assignedOrders.map(order => (
                  <div key={order._id} className="flex items-center justify-between bg-white border rounded p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{order.customerName || 'Order'}</div>
                      <div className="text-xs text-gray-500 truncate">{order.address}</div>
                      <div className="text-xs text-gray-500 mt-1">{order.pickupTime || order.scheduled_time}</div>
                    </div>
                    <div className="flex flex-col items-end ml-3 space-y-2">
                      {order.riderStatus === 'assigned' ? (
                        <button onClick={() => handleOrderAction(order._id, 'accept')} className="bg-laundrify-mint text-white px-3 py-1 rounded text-xs">Accept</button>
                      ) : order.riderStatus === 'accepted' ? (
                        <button onClick={() => handleOrderAction(order._id, 'start')} className="border px-3 py-1 rounded text-xs">Start</button>
                      ) : order.riderStatus === 'picked_up' ? (
                        <button onClick={() => handleOrderAction(order._id, 'complete')} className="bg-green-600 text-white px-3 py-1 rounded text-xs">Complete</button>
                      ) : (
                        <button onClick={() => openGoogleMapsNavigation(order)} className="border px-2 py-1 rounded text-xs">Nav</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </RiderLayout>
  );
}
