import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Calendar, Clock, User, Shield } from 'lucide-react';

interface Booking {
  _id: string;
  lawyerId: { _id: string; firstName: string; lastName: string } | string;
  userId: { _id: string; firstName: string; lastName: string } | string;
  date: string;
  start: string;
  end: string;
  durationMins: number;
  status: string;
  meetingType?: string;
  meetingLink?: string;
  clientNotes?: string;
}

const BookingDetails = () => {
  const { id } = useParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBooking = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/bookings/${id}`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        });
        if (!res.ok) throw new Error('Failed to load booking');
        const data = await res.json();
        setBooking(data.data);
      } catch (e) {
        setError('Failed to load booking');
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchBooking();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen py-16 bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading booking...</p>
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen py-16 bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Booking not found'}</p>
          <Button asChild>
            <Link to="/">Go Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const lawyer = booking.lawyerId as any;
  const client = booking.userId as any;

  return (
    <div className="min-h-screen py-16 bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="shadow-soft border-0">
          <CardHeader>
            <CardTitle className="text-xl text-navy">Appointment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center space-x-2 text-gray-700">
                <Calendar className="h-4 w-4" />
                <span>{booking.date}</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-700">
                <Clock className="h-4 w-4" />
                <span>{booking.start} - {booking.end} ({booking.durationMins} mins)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center space-x-2 text-gray-700">
                <User className="h-4 w-4" />
                <span>Lawyer: {lawyer?.firstName ? `${lawyer.firstName} ${lawyer.lastName}` : String(lawyer)}</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-700">
                <User className="h-4 w-4" />
                <span>Client: {client?.firstName ? `${client.firstName} ${client.lastName}` : String(client)}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-gray-700">
              <Shield className="h-4 w-4" />
              <span>Status: <b className="text-navy capitalize">{booking.status}</b></span>
            </div>

            {booking.meetingLink && (
              <div>
                <p className="text-gray-600 text-sm mb-1">Meeting Link</p>
                <a className="text-teal hover:underline break-all" href={booking.meetingLink} target="_blank" rel="noreferrer">
                  {booking.meetingLink}
                </a>
              </div>
            )}

            {booking.clientNotes && (
              <div>
                <p className="text-gray-600 text-sm mb-1">Your Notes</p>
                <p className="text-gray-800 whitespace-pre-line">{booking.clientNotes}</p>
              </div>
            )}

            <div className="pt-2">
              <Button asChild variant="outline" className="border-teal text-teal hover:bg-teal hover:text-white">
                <Link to={`/chat/${typeof lawyer === 'string' ? lawyer : lawyer?._id}`}>Open Chat</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BookingDetails;


