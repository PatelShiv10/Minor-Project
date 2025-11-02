import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { ArrowLeft, Clock, CreditCard, CheckCircle, Loader2 } from 'lucide-react';
import { paymentService } from '@/services/paymentService';

interface PublicLawyer {
  _id: string;
  firstName: string;
  lastName: string;
  specialization?: string;
  consultationFee?: number;
}

interface SlotsByDate { date: string; slots: string[] }

const fmtDate = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const AppointmentBooking = () => {
  const { lawyerId } = useParams();
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState('');
  const [caseDescription, setCaseDescription] = useState('');
  const [isBooked, setIsBooked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLawyer, setLoadingLawyer] = useState(true);
  const [lawyer, setLawyer] = useState<PublicLawyer | null>(null);
  const [month, setMonth] = useState<Date>(new Date());
  const [slots, setSlots] = useState<SlotsByDate[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadLawyer = async () => {
      try {
        setLoadingLawyer(true);
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/lawyers/${lawyerId}/public`);
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setLawyer(data.data);
      } catch (e) {
        setLawyer(null);
      } finally {
        setLoadingLawyer(false);
      }
    };
    if (lawyerId) loadLawyer();
  }, [lawyerId]);

  const loadSlots = useMemo(() => async () => {
    try {
      setLoadingSlots(true);
      setError(null);
      const start = new Date(month.getFullYear(), month.getMonth(), 1);
      const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
      const qs = `start=${fmtDate(start)}&end=${fmtDate(end)}`;
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/bookings/lawyers/${lawyerId}/slots?${qs}`);
      if (!res.ok) throw new Error('Failed to load slots');
      const data = await res.json();
      setSlots(data.data);
    } catch (e) {
      setSlots([]);
      setError('Failed to load availability');
    } finally {
      setLoadingSlots(false);
    }
  }, [lawyerId, month]);

  useEffect(() => {
    if (lawyerId) {
      loadSlots();
    }
  }, [loadSlots, lawyerId]);

  const availableTimeSlots = useMemo(() => {
    if (!selectedDate) return [] as string[];
    const entry = slots.find(s => s.date === fmtDate(selectedDate));
    let list = entry ? entry.slots.map(s => `${s}`) : [];

    // If no custom availability, generate default slots 09:00-17:00 (30-min)
    if (list.length === 0) {
      for (let h = 9; h < 17; h++) {
        for (let m = 0; m < 60; m += 30) {
          const hh = String(h).padStart(2, '0');
          const mm = String(m).padStart(2, '0');
          list.push(`${hh}:${mm}`);
        }
      }
    }

    // For today, hide past slots
    const todayStr = fmtDate(new Date());
    if (fmtDate(selectedDate) === todayStr) {
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      list = list.filter(t => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m >= nowMins;
      });
    }

    return list;
  }, [selectedDate, slots]);

  const disabled = useMemo(() => {
    const activeDates = new Set(slots.filter(s => s.slots.length > 0).map(s => s.date));
    return (date: Date) => !activeDates.has(fmtDate(date));
  }, [slots]);

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) return resolve(true);
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleBookAppointment = async () => {
    if (!selectedDate || !selectedTime || !lawyerId) {
      alert('Please select a date and time.');
      return;
    }

    try {
      setIsLoading(true);

      const ok = await loadRazorpayScript();
      if (!ok) throw new Error('Failed to load payment gateway. Disable ad blockers and try again.');

      // Amount in paise based on lawyer's consultation fee (fallback to 250 if not set)
      const feeInr = typeof lawyer.consultationFee === 'number' && lawyer.consultationFee >= 0
        ? lawyer.consultationFee
        : 250;
      const order = await paymentService.createOrder({ amount: Math.round(feeInr * 100), notes: { lawyerId, purpose: 'appointment' } });
      if (!order?.orderId || !order?.key) {
        throw new Error('Payment initialization failed. Please check server keys.');
      }

      const user = JSON.parse(localStorage.getItem('user') || 'null');
      const options = {
        key: order.key,
        amount: order.amount,
        currency: order.currency,
        name: 'LawMate',
        description: 'Consultation Booking',
        order_id: order.orderId,
        prefill: user ? {
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          email: user.email || ''
        } : undefined,
        // Restrict to domestic-friendly methods (India): allow UPI, Netbanking, Cards; disable EMI/Paylater/Wallets
        method: {
          upi: true,
          netbanking: true,
          card: true,
          wallet: false,
          emi: false,
          paylater: false
        },
        notes: {
          purpose: 'appointment',
          locale: 'IN'
        },
        config: {
          display: {
            // Prioritize UPI and Netbanking for domestic payments
            sequence: [ 'upi', 'netbanking', 'card' ],
          }
        },
        handler: async function (response: any) {
          const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = response || {};
          // On successful payment, verify and create booking on server
          const token = localStorage.getItem('token');
          const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/payments/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              razorpay_order_id,
              razorpay_payment_id,
              razorpay_signature,
              booking: {
                lawyerId,
                date: fmtDate(selectedDate),
                start: selectedTime.split(' ')[0],
                durationMins: 30,
                notes: caseDescription
              }
            })
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.message || 'Payment verification failed');
            return;
          }
          setIsBooked(true);
        },
        modal: {
          ondismiss: function () {
            // User closed checkout
          }
        },
        theme: { color: '#14b8a6' }
      } as any;

      const rz = new (window as any).Razorpay(options);
      rz.on('payment.failed', function (response: any) {
        alert(response?.error?.description || 'Payment failed. Please try again.');
      });
      rz.open();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  if (loadingLawyer) {
    return (
      <main className="flex-1">
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-teal" />
            <p className="text-gray-600">Loading lawyer information...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!lawyer) {
    return (
      <main className="flex-1">
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600 mb-4">Lawyer not found</p>
            <Link to="/find-lawyer" className="text-teal hover:underline">
              Find another lawyer
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (isBooked) {
    return (
      <main className="flex-1">
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center max-w-md mx-auto">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-navy mb-2">Appointment Booked!</h2>
            <p className="text-gray-600 mb-6">
              Your appointment has been successfully scheduled. You will receive a confirmation email shortly.
            </p>
            <div className="space-y-3">
              <Link to="/">
                <Button className="w-full bg-teal hover:bg-teal-light text-white">
                  Go to Home
                </Button>
              </Link>
              <Link to="/find-lawyer">
                <Button variant="outline" className="w-full border-teal text-teal hover:bg-teal hover:text-white">
                  Book Another Appointment
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <Link 
              to={`/lawyer/${lawyerId}`} 
              className="inline-flex items-center text-teal hover:text-teal-light mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Lawyer Profile
            </Link>
            <h1 className="text-3xl font-bold text-navy">Book Appointment</h1>
            <p className="text-gray-600 mt-2">
              Schedule a consultation with {lawyer.firstName} {lawyer.lastName}
            </p>
          </div>

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Appointment Form */}
            <div className="lg:col-span-2">
              <Card className="shadow-soft border-0">
                <CardHeader>
                  <CardTitle className="text-xl text-navy">Select Date & Time</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Calendar */}
                  <div>
                    <h3 className="text-lg font-semibold text-navy mb-3">Choose a Date</h3>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={(date) => {
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        const d = new Date(date);
                        d.setHours(0,0,0,0);
                        return d < today; // disable past dates
                      }}
                      month={month}
                      onMonthChange={setMonth}
                      className="rounded-md border border-gray-300"
                    />
                  </div>

                  {/* Time Slots */}
                  {selectedDate && (
                    <div>
                      <h3 className="text-lg font-semibold text-navy mb-3">Available Time Slots</h3>
                      {loadingSlots ? (
                        <div className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto text-teal" />
                          <p className="text-gray-500 mt-2">Loading available slots...</p>
                        </div>
                      ) : error ? (
                        <div className="text-center py-8 text-red-500">
                          <p>{error}</p>
                        </div>
                      ) : availableTimeSlots.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {availableTimeSlots.map((time) => (
                            <Button
                              key={time}
                              variant={selectedTime === time ? 'default' : 'outline'}
                              onClick={() => setSelectedTime(time)}
                              className={selectedTime === time 
                                ? 'bg-teal hover:bg-teal-light text-white' 
                                : 'border-teal text-teal hover:bg-teal hover:text-white'
                              }
                            >
                              <Clock className="h-4 w-4 mr-2" />
                              {time}
                            </Button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          <p>No available time slots for this date.</p>
                          <p className="text-sm">Please pick another date, or contact the lawyer if no dates are available.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Case Description */}
                  <div>
                    <h3 className="text-lg font-semibold text-navy mb-3">Describe Your Legal Matter</h3>
                    <Textarea
                      value={caseDescription}
                      onChange={(e) => setCaseDescription(e.target.value)}
                      placeholder="Please provide a brief description of your legal matter. This will help the lawyer prepare for your consultation."
                      className="min-h-[120px] border-gray-300 focus:border-teal focus:ring-teal"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Booking Summary */}
            <div className="lg:col-span-1">
              <Card className="shadow-soft border-0 sticky top-8">
                <CardHeader>
                  <CardTitle className="text-lg text-navy">Booking Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Lawyer Info */}
                  <div className="flex items-center space-x-3 pb-4 border-b">
                    <div className="w-12 h-12 bg-teal text-white rounded-full flex items-center justify-center font-semibold">
                      {lawyer.firstName?.[0]}{lawyer.lastName?.[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-navy">{lawyer.firstName} {lawyer.lastName}</p>
                      <p className="text-sm text-teal">{lawyer.specialization || 'General Practice'}</p>
                    </div>
                  </div>

                  {/* Appointment Details */}
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Date:</span>
                      <span className="font-medium">
                        {selectedDate ? selectedDate.toLocaleDateString() : 'Not selected'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Time:</span>
                      <span className="font-medium">{selectedTime || 'Not selected'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Duration:</span>
                      <span className="font-medium">1 hour</span>
                    </div>
                    <div className="flex justify-between text-lg font-semibold border-t pt-3">
                      <span>Consultation Fee:</span>
                      <span className="text-navy">
                        {typeof lawyer.consultationFee === 'number' && lawyer.consultationFee >= 0 
                          ? `₹${lawyer.consultationFee}` 
                          : 'Fee not specified'}
                      </span>
                    </div>
                  </div>

                  {/* Payment & Booking */}
                  <div className="space-y-3 pt-4">
                    <Button
                      onClick={handleBookAppointment}
                      disabled={!selectedDate || !selectedTime || isLoading}
                      className="w-full bg-teal hover:bg-teal-light text-white"
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      {isLoading ? 'Processing...' : 'Book & Pay'}
                    </Button>
                    <p className="text-xs text-gray-500 text-center">
                      Payment will be processed securely via Razorpay
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default AppointmentBooking;
