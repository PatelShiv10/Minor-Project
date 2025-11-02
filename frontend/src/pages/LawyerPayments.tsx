
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, Download, Calendar, TrendingUp } from 'lucide-react';
import { LawyerSidebar } from '@/components/lawyer/LawyerSidebar';
import { LawyerTopBar } from '@/components/lawyer/LawyerTopBar';

const LawyerPayments = () => {
  const [currentPage, setCurrentPage] = useState('payments');
  const [payments, setPayments] = useState<Array<{
    id: string;
    clientName: string;
    amount: number;
    date: string;
    status: string;
    transactionId: string;
  }>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}`;

  const fetchPayments = async () => {
    try {
      setError(null);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/payments`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Failed to fetch payments (${res.status})`);
      }
      const data = await res.json().catch(() => ({}));
      // Normalize backend payloads into the shape the table expects
      const list: Array<{
        id: string;
        clientName: string;
        amount: number;
        date: string;
        status: string;
        transactionId: string;
      }> = (data?.data || data?.payments || data || []).map((p: any) => ({
        id: String(p._id || p.id || p.razorpay_order_id || p.razorpay_payment_id || cryptoRandomId()),
        clientName: p.clientName
          || [p.user?.firstName, p.user?.lastName].filter(Boolean).join(' ')
          || p.user?.name
          || p.client?.name
          || 'Unknown',
        amount: typeof p.amount === 'number' ? p.amount : (typeof p.amount_paid === 'number' ? p.amount_paid : (typeof p.amountDue === 'number' ? p.amountDue : 0)),
        date: p.date || p.createdAt || p.paymentDate || new Date().toISOString(),
        status: p.status || p.paymentStatus || p.razorpay_status || 'pending',
        transactionId: p.transactionId || p.razorpay_payment_id || p.paymentId || p.txnId || '-'
      }));
      setPayments(list);
    } catch (e: any) {
      setError(e?.message || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    const interval = setInterval(fetchPayments, 15000); // poll every 15s
    return () => clearInterval(interval);
  }, []);

  function cryptoRandomId() {
    try {
      return Math.random().toString(36).slice(2);
    } catch {
      return String(Date.now());
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const totalEarnings = useMemo(() => {
    return payments.reduce((sum, p) => {
      const isCompleted = ['completed', 'captured', 'success', 'paid'].includes(String(p.status).toLowerCase());
      return isCompleted ? sum + (Number(p.amount) || 0) : sum;
    }, 0);
  }, [payments]);

  const thisMonthTotal = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return payments.reduce((sum, p) => {
      const d = new Date(p.date);
      const isSameMonth = d.getFullYear() === y && d.getMonth() === m;
      const isCompleted = ['completed', 'captured', 'success', 'paid'].includes(String(p.status).toLowerCase());
      return isSameMonth && isCompleted ? sum + (Number(p.amount) || 0) : sum;
    }, 0);
  }, [payments]);

  const formatCurrency = (amount: number) => {
    const num = Number(amount) || 0;
    return `Rs${num.toLocaleString('en-IN')}`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <LawyerSidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      
      <div className="flex-1 flex flex-col">
        <LawyerTopBar />
        
        <main className="flex-1 p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-2xl lg:text-3xl font-bold text-navy mb-6">Payments</h1>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <Card className="shadow-soft border-0">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Total Earnings</p>
                      <p className="text-2xl font-bold text-navy">{formatCurrency(totalEarnings)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-green-50">
                      <DollarSign className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-soft border-0">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">This Month</p>
                      <p className="text-2xl font-bold text-navy">{formatCurrency(thisMonthTotal)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-50">
                      <Calendar className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-soft border-0">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Growth</p>
                      <p className="text-2xl font-bold text-navy">+15%</p>
                    </div>
                    <div className="p-3 rounded-lg bg-teal-50">
                      <TrendingUp className="h-6 w-6 text-teal-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Payments Table */}
            <Card className="shadow-soft border-0">
              <CardHeader>
                <CardTitle>Recent Payments</CardTitle>
              </CardHeader>
              <CardContent>
                {loading && (
                  <div className="py-8 text-center text-gray-600">Loading payments…</div>
                )}
                {error && !loading && (
                  <div className="py-3 mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3">{error}</div>
                )}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client Name</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Payment Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Transaction ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!loading && payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-medium">{payment.clientName}</TableCell>
                          <TableCell>{formatCurrency(payment.amount)}</TableCell>
                          <TableCell>{formatDate(payment.date)}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(payment.status)}>
                              {payment.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{payment.transactionId}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile View */}
                <div className="md:hidden space-y-4">
                  {!loading && payments.map((payment) => (
                    <Card key={payment.id} className="border border-gray-200">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold">{payment.clientName}</h3>
                          <Badge className={getStatusColor(payment.status)}>
                            {payment.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-2 font-mono">Txn: {payment.transactionId}</p>
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-bold text-lg">{formatCurrency(payment.amount)}</p>
                            <p className="text-sm text-gray-500">{formatDate(payment.date)}</p>
                          </div>
                          <Button size="sm" variant="outline">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
};

export default LawyerPayments;
