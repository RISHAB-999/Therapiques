import { useState, useEffect, createContext, useMemo, useCallback } from "react";
import axios from 'axios'
import { toast } from "react-toastify";
import { useDoctorSocket } from "../hooks/useDoctorSocket";

export const DoctorContext = createContext();

const DoctorContextProvider = (props) => {
  
  const envBackendUrl = import.meta.env.VITE_BACKEND_URL
  const backendUrl = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? (envBackendUrl && !envBackendUrl.includes('trycloudflare.com') ? envBackendUrl : 'http://localhost:4000')
    : (envBackendUrl || 'http://localhost:4000')

  const [dToken, setDToken] = useState(localStorage.getItem('dToken') ? localStorage.getItem('dToken') : '')
  const [appointments, setAppointments] = useState([])
  const [dashData, setDashData] = useState(false)
  const [profileData, setProfileData] = useState(false)

  const doctorSocket = useDoctorSocket(backendUrl, dToken)

  // Getting Doctor appointment data from Database using API
  const getAppointments = useCallback(async () => {
    try {

      const { data } = await axios.get(backendUrl + '/api/doctor/appointments', { headers: { dToken } })

      if (data.success) {
        setAppointments(data.appointments.reverse())
      } else {
        toast.error(data.message)
        setDToken('')
        localStorage.removeItem('dToken')
      }

    } catch (error) {
      console.log(error)
      toast.error(error.message)
    }
  }, [backendUrl, dToken])

  // Getting Doctor dashboard data using API
  const getDashData = useCallback(async () => {
    try {

      const { data } = await axios.get(backendUrl + '/api/doctor/dashboard', { headers: { dToken } })

      if (data.success) {
        setDashData(data.dashData)
      } else {
        toast.error(data.message)
        setDToken('')
        localStorage.removeItem('dToken')
      }

    } catch (error) {
      console.log(error)
      toast.error(error.message)
    }

  }, [backendUrl, dToken])

  // Function to cancel doctor appointment using API
  const cancelAppointment = useCallback(async (appointmentId) => {

    try {

      const { data } = await axios.post(backendUrl + '/api/doctor/cancel-appointment', { appointmentId }, { headers: { dToken } })

      if (data.success) {
        toast.success(data.message)
        getAppointments()
        getDashData()
      } else {
        toast.error(data.message)
      }

    } catch (error) {
      toast.error(error.message)
      console.log(error)
    }

  }, [backendUrl, dToken, getAppointments, getDashData])

  // Function to Mark appointment completed using API
  const completeAppointment = useCallback(async (appointmentId) => {

    try {

      const { data } = await axios.post(backendUrl + '/api/doctor/complete-appointment', { appointmentId }, { headers: { dToken } })

      if (data.success) {
        toast.success(data.message)
        getAppointments()
        getDashData()
      } else {
        toast.error(data.message)
      }

    } catch (error) {
      toast.error(error.message)
      console.log(error)
    }

  }, [backendUrl, dToken, getAppointments, getDashData])

  // Getting Doctor profile data from Database using API
  const getProfileData = useCallback(async () => {
    try {

      const { data } = await axios.get(backendUrl + '/api/doctor/profile', { headers: { dToken } })
      if (data.success) {
        setProfileData(data.profileData)
      } else {
        toast.error(data.message)
        setDToken('')
        localStorage.removeItem('dToken')
      }

    } catch (error) {
      console.log(error)
      toast.error(error.message)
    }
  }, [backendUrl, dToken])

  useEffect(() => {
    if (dToken) {
      getProfileData()
    }
  }, [dToken, getProfileData])

  const value = useMemo(() => ({
    backendUrl,
    dToken,
    setDToken,
    appointments,
    setAppointments,
    dashData,
    setDashData,
    profileData,
    setProfileData,
    getAppointments,
    getProfileData,
    cancelAppointment,
    completeAppointment,
    getDashData,
    doctorSocket
  }), [backendUrl, dToken, appointments, dashData, profileData, getAppointments, getProfileData, cancelAppointment, completeAppointment, getDashData, doctorSocket])

  return (
    <DoctorContext.Provider value={value}>
      {props.children}
    </DoctorContext.Provider>
  );
};

export default DoctorContextProvider;
