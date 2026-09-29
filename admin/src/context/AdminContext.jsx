import axios from "axios";
import { createContext, useState, useMemo, useCallback } from "react";
import { toast } from "react-toastify";

export const AdminContext = createContext();


const AdminContextProvider = (props) => {
  const envBackendUrl = import.meta.env.VITE_BACKEND_URL
  const backendUrl = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? (envBackendUrl && !envBackendUrl.includes('trycloudflare.com') ? envBackendUrl : 'http://localhost:4000')
    : (envBackendUrl || 'http://localhost:4000');
  const [aToken, setAToken] = useState(localStorage.getItem('aToken') || null);

  const [appointments, setAppointments] = useState([])
  const [doctors, setDoctors] = useState([]);
  const [dashData, setDashData] = useState(false)

  const getAllDoctors = useCallback(async () => {
    try {
      const { data } = await axios.post(backendUrl + '/api/admin/all-doctors', {}, {
        headers: {
          aToken
        }
      });
      if (data.success) {
        setDoctors(data.doctors || data.data || []);
      } else {
        toast.error(data.message);
        setAToken(null);
        localStorage.removeItem('aToken');
      }
    } catch (error) {
      toast.error(error.message);
    }
  }, [backendUrl, aToken]);

  const changeAvailability = useCallback(async (docId) => {
    try {
      const { data } = await axios.post(backendUrl + '/api/admin/change-availability', { docId }, {
        headers: {
          aToken
        }
      });
      if (data.success) {
        toast.success(data.message);
        getAllDoctors();
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error.message);
    }
  }, [backendUrl, aToken, getAllDoctors]);

  const updateDoctorCredentials = useCallback(async (docId, { email, password }) => {
    try {
      const { data } = await axios.post(
        backendUrl + '/api/admin/update-doctor-credentials',
        { docId, email, password },
        { headers: { aToken } }
      );
      if (data.success) {
        toast.success(data.message);
        getAllDoctors();
        return { success: true };
      } else {
        toast.error(data.message);
        return { success: false, message: data.message };
      }
    } catch (error) {
      toast.error(error.message);
      return { success: false, error: error.message };
    }
  }, [backendUrl, aToken, getAllDoctors]);

  const updateDoctorEmail = useCallback(async (docId, email) => {
    return updateDoctorCredentials(docId, { email });
  }, [updateDoctorCredentials]);

  // Getting all appointment data from Database using API
  const getAllAppointments = useCallback(async () => {

    try {

      const { data } = await axios.get(backendUrl + '/api/admin/appointments', { headers: { aToken } })
      if (data.success) {
        setAppointments(data.appointments)
      } else {
        toast.error(data.message)
        setAToken(null)
        localStorage.removeItem('aToken')
      }

    } catch (error) {
      toast.error(error.message)
      console.log(error)
    }

  }, [backendUrl, aToken])

  // Function to cancel appointment using API
  const cancelAppointment = useCallback(async (appointmentId) => {

    try {

      const { data } = await axios.post(backendUrl + '/api/admin/cancel-appointment', { appointmentId }, { headers: { aToken } })

      if (data.success) {
        toast.success(data.message)
        getAllAppointments()
      } else {
        toast.error(data.message)
      }

    } catch (error) {
      toast.error(error.message)
      console.log(error)
    }

  }, [backendUrl, aToken, getAllAppointments])

  // Getting Admin Dashboard data from Database using API
  const getDashData = useCallback(async () => {
    try {

      const { data } = await axios.get(backendUrl + '/api/admin/dashboard', { headers: { aToken } })

      if (data.success) {
        setDashData(data.dashData)
      } else {
        toast.error(data.message)
        setAToken(null)
        localStorage.removeItem('aToken')
      }

    } catch (error) {
      console.log(error)
      toast.error(error.message)
    }

  }, [backendUrl, aToken])

  const value = useMemo(() => ({
    backendUrl,
    aToken, setAToken,
    doctors,
    getAllDoctors,
    changeAvailability,
    updateDoctorEmail,
    updateDoctorCredentials,
    appointments,
    getAllAppointments,
    getDashData,
    cancelAppointment,
    dashData
  }), [backendUrl, aToken, doctors, appointments, dashData, getAllDoctors, changeAvailability, updateDoctorEmail, updateDoctorCredentials, getAllAppointments, getDashData, cancelAppointment]);

  return (
    <AdminContext.Provider value={value}>
      {props.children}
    </AdminContext.Provider>
  );
};

export default AdminContextProvider;
