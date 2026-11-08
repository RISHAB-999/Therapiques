import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import AdminContextProvider from './context/AdminContext.jsx'
import DoctorContextProvider from './context/DoctorContext.jsx'
import AppContextProvider from './context/AppContext.jsx'
import axios from 'axios'

// Surface the server's own message for 4xx responses (e.g. rate limiting) instead of
// a generic "Request failed with status code 429" in toasts.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const serverMessage = error?.response?.data?.message
    if (typeof serverMessage === 'string' && serverMessage) error.message = serverMessage
    return Promise.reject(error)
  }
)

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AdminContextProvider>
      <DoctorContextProvider>
        <AppContextProvider>
          <App />
        </AppContextProvider>
      </DoctorContextProvider>
    </AdminContextProvider>
  </BrowserRouter>,
)
