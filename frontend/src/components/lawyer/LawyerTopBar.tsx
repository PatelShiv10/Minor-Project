import { useState, useEffect } from 'react';
import { ChevronDown, User, Settings, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export const LawyerTopBar = () => {
  const { user, logout } = useAuth();
  const [profileImage, setProfileImage] = useState<string | null>(null);

  useEffect(() => {
    const storedImage = localStorage.getItem('lawyerProfileImage');
    setProfileImage(storedImage);
    const handleStorageChange = () => {
      const updatedImage = localStorage.getItem('lawyerProfileImage');
      setProfileImage(updatedImage);
    };
    window.addEventListener('storage', handleStorageChange);
    return () => { window.removeEventListener('storage', handleStorageChange); };
  }, []);


  const handleLogout = () => { logout(); };

  const getInitials = () => {
    if (!user) return 'L';
    return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`;
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold text-navy">Welcome back, {user ? `${user.firstName} ${user.lastName}` : 'Lawyer'}</h2>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Profile Dropdown */}
          <Popover>
            <PopoverTrigger asChild>
              <div className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 rounded-lg p-2 transition-colors">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-teal flex items-center justify-center">
                  {profileImage ? (
                    <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-sm font-bold">{getInitials()}</span>
                  )}
                </div>
                <div className="hidden md:block">
                  <p className="text-sm font-medium text-navy">{user ? `${user.firstName} ${user.lastName}` : 'Lawyer'}</p>
                  <p className="text-xs text-gray-600">Legal Professional</p>
                </div>
                <ChevronDown className="h-4 w-4 text-gray-500" />
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="end">
              <div className="p-2">
                <Link to="/lawyer-profile" className="flex items-center space-x-3 px-3 py-2 text-sm hover:bg-gray-100 rounded-md transition-colors">
                  <User className="h-4 w-4" />
                  <span>Profile</span>
                </Link>
                <Link to="/lawyer-settings" className="flex items-center space-x-3 px-3 py-2 text-sm hover:bg-gray-100 rounded-md transition-colors">
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </Link>
                <hr className="my-2" />
                <button onClick={handleLogout} className="flex items-center space-x-3 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors">
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
};
