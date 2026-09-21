import React, { useContext, useEffect, useState, lazy, Suspense } from 'react'
import Login from './pages/Login';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AdminContext } from './context/AdminContext';
import Navbar from './components/Navbar';
import { Route, Routes, useLocation, useNavigate, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { DoctorContext } from './context/DoctorContext';
import { useDoctorSocket } from './hooks/useDoctorSocket';
import IncomingCallModal from './components/IncomingCallModal';

// Lazy-load all page components for smaller initial bundle
const Dashboard = lazy(() => import('./pages/Admin/Dashboard'));
const AllAppointments = lazy(() => import('./pages/Admin/AllAppointments'));
const AddDoctor = lazy(() => import('./pages/Admin/AddDoctor'));
const DoctorsList = lazy(() => import('./pages/Admin/DoctorsList'));
const AddBook = lazy(() => import('./pages/Admin/AddBook'));
const BookList = lazy(() => import('./pages/Admin/BookList'));
const BookOrders = lazy(() => import('./pages/Admin/BookOrders'));
const DoctorDashboard = lazy(() => import('./pages/Doctor/DoctorDashboard'));
const DoctorAppointments = lazy(() => import('./pages/Doctor/DoctorAppointments'));
const DoctorProfile = lazy(() => import('./pages/Doctor/DoctorProfile'));
const DoctorVideoCallPage = lazy(() => import('./components/videocall/DoctorVideoCallPage'));

// Minimal loading fallback matching admin theme
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[40vh]">
    <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
  </div>
)

const App = () => {
  const { dToken, doctorSocket } = useContext(DoctorContext)
  const { aToken } = useContext(AdminContext)
  const location = useLocation()
  const navigate = useNavigate()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // Auto-close mobile drawer on route change
  useEffect(() => {
    setIsSidebarOpen(false)
  }, [location.pathname])

  const handleAcceptIncomingCall = (callData) => {
    if (doctorSocket) {
      doctorSocket.acceptCall(callData)
    }
    navigate(`/doctor-video-call/${callData.appointmentId}`)
  }

  const isVideoCallRoute = 
    location.pathname.startsWith('/doctor-video-call/') || 
    location.pathname.startsWith('/doctor_video_call/') || 
    location.pathname.startsWith('/doctor%20video%20call/')

  if (isVideoCallRoute) {
    return (
      <>
        <ToastContainer />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path='/doctor-video-call/:appointmentId' element={<DoctorVideoCallPage />} />
            <Route path='/doctor_video_call/:appointmentId' element={<DoctorVideoCallPage />} />
            <Route path='/doctor%20video%20call/:appointmentId' element={<DoctorVideoCallPage />} />
            <Route path='*' element={<Navigate to='/doctor-appointments' replace />} />
          </Routes>
        </Suspense>
      </>
    )
  }

  return dToken || aToken ? (
    <div className='bg-[#F8F9FD] min-h-screen flex flex-col'>
      <ToastContainer />
      <Navbar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
      <div className='flex-1 flex items-start w-full relative min-h-[calc(100vh-60px)]'>
        <Sidebar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
        <main className='flex-1 w-full min-w-0 bg-[#F8F9FD] p-3 sm:p-6 lg:p-8 pb-20 min-h-[calc(100vh-60px)] overflow-x-clip'>
          <Suspense fallback={<PageLoader />}>
            <Routes>
            {/* Space & Underscore URL Normalization Redirects */}
            <Route path='/doctor%20appointments' element={<Navigate to='/doctor-appointments' replace />} />
            <Route path='/doctor_appointments' element={<Navigate to='/doctor-appointments' replace />} />
            <Route path='/doctor%20profile' element={<Navigate to='/doctor-profile' replace />} />
            <Route path='/doctor_profile' element={<Navigate to='/doctor-profile' replace />} />
            <Route path='/doctor%20dashboard' element={<Navigate to='/doctor-dashboard' replace />} />
            <Route path='/doctor_dashboard' element={<Navigate to='/doctor-dashboard' replace />} />
            <Route path='/admin%20dashboard' element={<Navigate to='/admin-dashboard' replace />} />
            <Route path='/admin_dashboard' element={<Navigate to='/admin-dashboard' replace />} />
            <Route path='/all_appointments' element={<Navigate to='/all-appointments' replace />} />

            {/* Admin Routes */}
            <Route path='/admin-dashboard' element={<Dashboard />} />
            <Route path='/all-appointments' element={<AllAppointments />} />
            <Route path='/add-doctor' element={<AddDoctor />} />
            <Route path='/doctor-list' element={<DoctorsList />} />

            {/* Library / Book Store Admin Routes */}
            <Route path='/add-book' element={<AddBook />} />
            <Route path='/book-list' element={<BookList />} />
            <Route path='/book-orders' element={<BookOrders />} />
            
            {/* Doctor Routes */}
            <Route path='/doctor-dashboard' element={<DoctorDashboard />} />
            <Route path='/doctor-appointments' element={<DoctorAppointments />} />
            <Route path='/doctor-profile' element={<DoctorProfile />} />
            <Route path='/doctor-video-call/:appointmentId' element={<DoctorVideoCallPage />} />
            <Route path='/doctor_video_call/:appointmentId' element={<DoctorVideoCallPage />} />

            {/* Wildcard Fallback */}
            <Route path='*' element={<Navigate to={dToken ? '/doctor-dashboard' : aToken ? '/admin-dashboard' : '/'} replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  ) : (
    <Login />
  );
}

export default App