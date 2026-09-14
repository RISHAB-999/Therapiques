import React, { useContext, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import axios from 'axios'
import { toast } from 'react-toastify'
import { Camera, Check, ArrowRight, ArrowLeft, Heart, Sparkles, User, ShieldCheck, ChevronDown, X, MapPin } from 'lucide-react'
import DateInput from '../components/ui/DateInput'

const COUNTRY_LIST = [
  { code: 'IN', name: 'India', flag: '🇮🇳', dial_code: '+91', maxLength: 10, placeholder: '9876543210' },
  { code: 'US', name: 'United States', flag: '🇺🇸', dial_code: '+1', maxLength: 10, placeholder: '2025550123' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', dial_code: '+44', maxLength: 11, placeholder: '7911123456' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', dial_code: '+1', maxLength: 10, placeholder: '4165550199' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', dial_code: '+61', maxLength: 9, placeholder: '412345678' },
  { code: 'AE', name: 'UAE', flag: '🇦🇪', dial_code: '+971', maxLength: 9, placeholder: '501234567' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', dial_code: '+65', maxLength: 8, placeholder: '81234567' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', dial_code: '+49', maxLength: 11, placeholder: '15123456789' },
]

const SUPPORT_AREAS_OPTIONS = [
  'Anxiety',
  'Stress',
  'Sleep',
  'Relationships',
  'Career',
  'Personal Growth',
  'Other'
]

const THERAPY_GOALS_OPTIONS = [
  'Managing emotions',
  'Building healthier habits',
  'Improving relationships',
  'Coping with stress',
  'Personal growth',
  'Better understanding myself'
]

const THERAPY_PREFERENCE_OPTIONS = [
  'Individual',
  'Couples',
  'Teen',
  'Family'
]

const GENDER_OPTIONS = [
  'Male',
  'Female',
  'Non-binary',
  'Prefer not to say'
]

const CompleteProfile = () => {
  const navigate = useNavigate()
  const { backendUrl, token, userData, loadUserProfileData } = useContext(AppContext)

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  // Step 1: About You fields
  const [name, setName] = useState('')
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_LIST[0])
  const [phoneDigits, setPhoneDigits] = useState('')
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false)
  const countryDropdownRef = useRef(null)

  const [dob, setDob] = useState('')
  const [gender, setGender] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')

  // Address fields
  const [addressType, setAddressType] = useState('Home')
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zipcode, setZipcode] = useState('')
  const [country, setCountry] = useState('India')

  // Step 2: Wellness Journey fields
  const [supportAreas, setSupportAreas] = useState([])
  const [wellnessGoal, setWellnessGoal] = useState('')
  const [therapyPreference, setTherapyPreference] = useState('')

  // Close country dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(e.target)) {
        setIsCountryDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  // Pre-fill existing data from signup or user profile
  useEffect(() => {
    if (userData) {
      if (userData.name && !name) {
        setName(userData.name)
      }
      if (userData.phone && userData.phone !== '000000000000' && !phoneDigits) {
        const rawPhone = String(userData.phone).trim()
        const matched = COUNTRY_LIST.find((c) => rawPhone.startsWith(c.dial_code))
        if (matched) {
          setSelectedCountry(matched)
          setPhoneDigits(rawPhone.slice(matched.dial_code.length).replace(/\D/g, ''))
        } else {
          setPhoneDigits(rawPhone.replace(/\D/g, ''))
        }
      }
      if (userData.dob && userData.dob !== 'Not specified' && !dob) {
        setDob(userData.dob)
      }
      if (userData.gender && userData.gender !== 'Not specified' && !gender) {
        setGender(userData.gender)
      }
      if (userData.image && !imagePreview) {
        setImagePreview(userData.image)
      }
      // Pre-fill address if available
      let addr = userData.address
      if (typeof addr === 'string') {
        try { addr = JSON.parse(addr) } catch (e) {}
      }
      if (!addr && userData._id) {
        try {
          const stored = localStorage.getItem(`saved_addresses_${userData._id}`)
          if (stored) {
            const parsed = JSON.parse(stored)
            if (Array.isArray(parsed) && parsed.length > 0) addr = parsed[0]
          }
        } catch (e) {}
      }
      if (addr) {
        if (addr.type && !addressType) setAddressType(addr.type)
        if ((addr.street || addr.line1) && !street) setStreet(addr.street || addr.line1)
        if ((addr.city || addr.line2) && !city) setCity(addr.city || addr.line2)
        if (addr.state && !state) setState(addr.state)
        if (addr.country && !country) setCountry(addr.country)
        if (addr.zipcode && !zipcode) setZipcode(addr.zipcode)
      }
      if (userData.wellnessGoal && !wellnessGoal) {
        setWellnessGoal(userData.wellnessGoal)
      }
      if (Array.isArray(userData.supportAreas) && userData.supportAreas.length > 0 && supportAreas.length === 0) {
        setSupportAreas(userData.supportAreas)
      }
      if (userData.therapyPreference && !therapyPreference) {
        setTherapyPreference(userData.therapyPreference)
      }
    }
  }, [userData])

  // If email is not verified, redirect to /verify-email; if already completed, redirect to Home
  useEffect(() => {
    if (userData) {
      const isEmailVerified = userData.emailVerified !== undefined ? userData.emailVerified : true
      if (isEmailVerified === false) {
        navigate('/verify-email', { replace: true })
      } else if (userData.profileCompleted === true) {
        navigate('/', { replace: true })
      }
    }
  }, [userData, navigate])

  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  const toggleSupportArea = (area) => {
    setSupportAreas((prev) =>
      prev.includes(area) ? prev.filter((item) => item !== area) : [...prev, area]
    )
  }

  // Core save helper
  const handleSaveProfile = async (isSkip = false) => {
    if (!token) {
      toast.error('Session expired. Please log in again.')
      return navigate('/login')
    }

    const trimmedName = name.trim()
    if (!isSkip && !trimmedName) {
      toast.error('Please enter your full name')
      setStep(1)
      return
    }

    try {
      setLoading(true)
      const formData = new FormData()

      const formattedPhone = phoneDigits ? `${selectedCountry.dial_code} ${phoneDigits}` : ''
      const nameParts = (trimmedName || userData?.name || 'User').split(' ')

      formData.append('name', trimmedName || userData?.name || 'User')
      formData.append('phone', formattedPhone)
      formData.append('dob', dob || '')
      formData.append('gender', gender || 'Not specified')
      formData.append('profileCompleted', 'true')

      // Process and attach Address object
      let addressObj = null
      if (street.trim() || city.trim() || zipcode.trim() || state.trim()) {
        addressObj = {
          type: addressType || 'Home',
          firstName: nameParts[0] || '',
          lastName: nameParts.slice(1).join(' ') || '',
          email: userData?.email || '',
          phone: formattedPhone || (userData?.phone && userData.phone !== '000000000000' ? userData.phone : ''),
          street: street.trim(),
          line1: street.trim(),
          city: city.trim(),
          line2: city.trim(),
          state: state.trim(),
          country: country.trim() || 'India',
          zipcode: zipcode.trim()
        }
      } else if (userData?.address) {
        addressObj = userData.address
      }

      if (addressObj) {
        formData.append('address', JSON.stringify(addressObj))
        if (userData?._id) {
          try {
            let currentSaved = []
            const stored = localStorage.getItem(`saved_addresses_${userData._id}`)
            if (stored) currentSaved = JSON.parse(stored)
            const updatedSaved = [addressObj, ...currentSaved.filter(a => (a.street || a.line1) !== (addressObj.street || addressObj.line1))].slice(0, 2)
            localStorage.setItem(`saved_addresses_${userData._id}`, JSON.stringify(updatedSaved))
          } catch (err) {}
        }
      }

      if (!isSkip) {
        formData.append('wellnessGoal', wellnessGoal || '')
        formData.append('supportAreas', JSON.stringify(supportAreas))
        formData.append('therapyPreference', therapyPreference || '')
      } else {
        formData.append('wellnessGoal', userData?.wellnessGoal || '')
        formData.append('supportAreas', JSON.stringify(userData?.supportAreas || []))
        formData.append('therapyPreference', userData?.therapyPreference || '')
      }

      if (imageFile) {
        formData.append('image', imageFile)
      }

      const { data } = await axios.post(
        `${backendUrl}/api/user/update-profile`,
        formData,
        { headers: { token } }
      )

      if (data.success) {
        toast.success('Welcome to Therapique! Your profile is ready.')
        await loadUserProfileData()
        navigate('/', { replace: true })
      } else {
        toast.error(data.message || 'Failed to save profile')
      }
    } catch (error) {
      console.error('Error saving profile onboarding:', error)
      toast.error(error.response?.data?.message || error.message || 'An error occurred while saving')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl bg-white rounded-3xl border border-[#EADBCE]/70 shadow-[0_10px_35px_rgba(0,0,0,0.05)] p-6 sm:p-10 transition-all">
        
        {/* Minimal Progress Indicator */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-500 mb-2 tracking-wide uppercase">
            <span>Profile setup · Step {step} of 2</span>
            <span>{step === 1 ? '50%' : '100%'}</span>
          </div>
          <div className="w-full h-1.5 bg-[#FAF5EE] rounded-full overflow-hidden border border-[#EADBCE]/40">
            <div
              className="h-full bg-black rounded-full transition-all duration-500 ease-out"
              style={{ width: step === 1 ? '50%' : '100%' }}
            />
          </div>
        </div>

        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="font-therapique text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
            Let's get to know you
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 mt-2 font-medium max-w-md mx-auto leading-relaxed">
            Complete your profile to help us personalize your Therapique experience.
          </p>
        </div>

        {/* STEP 1: ABOUT YOU */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 border-b border-[#EADBCE]/50 pb-3">
              <User className="w-4 h-4 text-gray-700" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-800">
                Step 1: About You
              </h2>
            </div>

            {/* Profile Photo Upload (Optional) */}
            <div className="flex flex-col sm:flex-row items-center gap-5 p-4 bg-[#FAF5EE]/50 rounded-2xl border border-[#EADBCE]/60">
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-white border-2 border-[#EADBCE] shadow-2xs shrink-0 flex items-center justify-center group">
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Profile Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-8 h-8 text-gray-400" />
                )}
                <label
                  htmlFor="onboarding-photo"
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity text-white"
                >
                  <Camera className="w-5 h-5" />
                </label>
              </div>

              <div className="flex-1 text-center sm:text-left">
                <label
                  htmlFor="onboarding-photo"
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border border-[#EADBCE] rounded-full text-xs font-semibold text-gray-800 hover:bg-black hover:text-white transition-colors cursor-pointer shadow-2xs"
                >
                  <Camera className="w-3.5 h-3.5" />
                  {imagePreview ? 'Change Photo' : 'Upload Profile Photo'}
                </label>
                <input
                  id="onboarding-photo"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Optional · PNG, JPG or WebP up to 5MB
                </p>
              </div>
            </div>

            {/* Full Name (Required, Pre-filled) */}
            <div>
              <label className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center justify-between">
                <span>Full Name <span className="text-red-500">*</span></span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="mt-1.5 w-full px-4 py-2.5 bg-[#FAF5EE]/40 border border-[#EADBCE] rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black focus:ring-1 focus:ring-black outline-none transition-all"
              />
            </div>

            {/* Phone Number & Date of Birth */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Phone Number with [ 🇮🇳 India ▼ ][ +91 ][ 9876543210 ] */}
              <div>
                <label className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center justify-between mb-1.5">
                  <span>Phone Number</span>
                  <span className="text-[11px] font-normal text-gray-400">Optional</span>
                </label>

                <div className="flex items-center gap-1.5 w-full">
                  {/* Country Selector Dropdown */}
                  <div className="relative shrink-0" ref={countryDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                      className="h-10 px-2 sm:px-2.5 bg-[#FAF5EE]/50 border border-[#EADBCE] rounded-xl text-xs font-semibold text-gray-800 hover:bg-white hover:border-gray-400 flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                      title={`Country: ${selectedCountry.name}`}
                    >
                      <span className="text-sm leading-none">{selectedCountry.flag}</span>
                      <span className="text-[11px] sm:text-xs font-semibold text-gray-700 max-w-[45px] sm:max-w-[55px] truncate">
                        {selectedCountry.name}
                      </span>
                      <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${isCountryDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isCountryDropdownOpen && (
                      <div className="absolute left-0 top-full mt-1.5 w-52 max-h-60 overflow-y-auto bg-white border border-[#EADBCE] rounded-2xl shadow-xl z-50 p-1.5 space-y-0.5 animate-in fade-in-50 zoom-in-95">
                        {COUNTRY_LIST.map((country) => (
                          <button
                            key={country.code}
                            type="button"
                            onClick={() => {
                              setSelectedCountry(country)
                              setIsCountryDropdownOpen(false)
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                              selectedCountry.code === country.code
                                ? 'bg-black text-white font-bold'
                                : 'text-gray-700 hover:bg-[#FAF5EE]'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className="text-sm">{country.flag}</span>
                              <span className="truncate">{country.name}</span>
                            </div>
                            <span className={`text-[11px] font-semibold ${selectedCountry.code === country.code ? 'text-gray-300' : 'text-gray-400'}`}>
                              {country.dial_code}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Dial Code Badge */}
                  <div className="h-10 px-2 sm:px-2.5 bg-[#FAF5EE]/70 border border-[#EADBCE] rounded-xl text-xs font-bold text-gray-700 flex items-center justify-center shrink-0 select-none shadow-2xs">
                    {selectedCountry.dial_code}
                  </div>

                  {/* Phone Number Numeric Input */}
                  <div className="relative flex-1 min-w-0">
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={selectedCountry.maxLength}
                      value={phoneDigits}
                      onChange={(e) => {
                        const rawDigits = e.target.value.replace(/\D/g, '').slice(0, selectedCountry.maxLength)
                        setPhoneDigits(rawDigits)
                      }}
                      placeholder={selectedCountry.placeholder}
                      className="w-full h-10 px-3 pr-7 bg-[#FAF5EE]/40 border border-[#EADBCE] rounded-xl text-xs sm:text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black focus:ring-1 focus:ring-black outline-none transition-all"
                    />
                    {phoneDigits && (
                      <button
                        type="button"
                        onClick={() => setPhoneDigits('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded-full transition-colors cursor-pointer"
                        title="Clear phone number"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Date of Birth [ dd-mm-yyyy 📅 ] */}
              <div>
                <label className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center justify-between mb-1.5">
                  <span>Date of Birth</span>
                  <span className="text-[11px] font-normal text-gray-400">Optional</span>
                </label>
                <DateInput
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  onClear={() => setDob('')}
                  className="w-full"
                />
              </div>
            </div>

            {/* Gender Selection (Optional) */}
            <div>
              <label className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center justify-between mb-2">
                <span>Gender</span>
                <span className="text-[11px] font-normal text-gray-400">Optional</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {GENDER_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setGender(option)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all text-center ${
                      gender === option
                        ? 'bg-black text-white border-black shadow-xs'
                        : 'bg-[#FAF5EE]/40 text-gray-700 border-[#EADBCE] hover:bg-white hover:border-gray-400'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {/* Delivery / Shipping Address (Optional) */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-gray-500" />
                  <span>Delivery & Shipping Address</span>
                </label>
                <span className="text-[11px] font-normal text-gray-400">Optional · For orders</span>
              </div>

              {/* Address Type Selector */}
              <div className="flex items-center gap-2 mb-3">
                {['Home', 'Office', 'Other'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setAddressType(type)}
                    className={`py-1.5 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      addressType === type
                        ? 'bg-black text-white border-black shadow-xs'
                        : 'bg-[#FAF5EE]/40 text-gray-700 border-[#EADBCE] hover:bg-white hover:border-gray-400'
                    }`}
                  >
                    {type === 'Home' ? '🏠 Home' : type === 'Office' ? '🏢 Office' : '📍 Other'}
                  </button>
                ))}
              </div>

              {/* Street Address Input */}
              <div className="space-y-2.5">
                <input
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Street Address / Flat / Building No."
                  className="w-full h-10 px-3 bg-[#FAF5EE]/40 border border-[#EADBCE] rounded-xl text-xs sm:text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black focus:ring-1 focus:ring-black outline-none transition-all"
                />

                {/* City & State */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City / District"
                    className="w-full h-10 px-3 bg-[#FAF5EE]/40 border border-[#EADBCE] rounded-xl text-xs sm:text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black focus:ring-1 focus:ring-black outline-none transition-all"
                  />
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="State / Province"
                    className="w-full h-10 px-3 bg-[#FAF5EE]/40 border border-[#EADBCE] rounded-xl text-xs sm:text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black focus:ring-1 focus:ring-black outline-none transition-all"
                  />
                </div>

                {/* Zipcode & Country */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={zipcode}
                    onChange={(e) => setZipcode(e.target.value)}
                    placeholder="PIN / Postal Code"
                    className="w-full h-10 px-3 bg-[#FAF5EE]/40 border border-[#EADBCE] rounded-xl text-xs sm:text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black focus:ring-1 focus:ring-black outline-none transition-all"
                  />
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Country"
                    className="w-full h-10 px-3 bg-[#FAF5EE]/40 border border-[#EADBCE] rounded-xl text-xs sm:text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black focus:ring-1 focus:ring-black outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Step 1 Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[#EADBCE]/50">
              <button
                type="button"
                onClick={() => handleSaveProfile(true)}
                disabled={loading}
                className="w-full sm:w-auto text-xs font-semibold text-gray-500 hover:text-gray-900 py-2.5 px-4 transition-colors cursor-pointer order-2 sm:order-1"
              >
                Skip for now
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!name.trim()) {
                    return toast.error('Please enter your full name')
                  }
                  setStep(2)
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-black text-white text-xs sm:text-sm font-bold py-3 px-6 rounded-full hover:bg-gray-800 transition-all active:scale-98 shadow-sm cursor-pointer order-1 sm:order-2"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: YOUR WELLNESS JOURNEY */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 border-b border-[#EADBCE]/50 pb-3">
              <Heart className="w-4 h-4 text-emerald-700" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-800">
                Step 2: Your Wellness Journey
              </h2>
              <span className="ml-auto text-xs font-normal text-gray-400">Optional</span>
            </div>

            {/* Support Areas Chips */}
            <div>
              <label className="text-xs sm:text-sm font-semibold text-gray-800 block mb-2.5">
                What would you like support with?
              </label>
              <div className="flex flex-wrap gap-2">
                {SUPPORT_AREAS_OPTIONS.map((area) => {
                  const isSelected = supportAreas.includes(area)
                  return (
                    <button
                      key={area}
                      type="button"
                      onClick={() => toggleSupportArea(area)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                        isSelected
                          ? 'bg-secondary text-gray-900 border-secondary shadow-2xs font-bold'
                          : 'bg-[#FAF5EE]/50 text-gray-700 border-[#EADBCE] hover:bg-white hover:border-gray-400'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-gray-900" />}
                      <span>{area}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Therapy Goals */}
            <div>
              <label className="text-xs sm:text-sm font-semibold text-gray-800 block mb-2.5">
                What are you hoping to get from therapy?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {THERAPY_GOALS_OPTIONS.map((goal) => {
                  const isSelected = wellnessGoal === goal
                  return (
                    <button
                      key={goal}
                      type="button"
                      onClick={() => setWellnessGoal(goal)}
                      className={`text-left p-3 rounded-xl text-xs font-medium border transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-black text-white border-black shadow-xs font-semibold'
                          : 'bg-[#FAF5EE]/40 text-gray-700 border-[#EADBCE] hover:bg-white hover:border-gray-400'
                      }`}
                    >
                      <span>{goal}</span>
                      {isSelected && <Check className="w-4 h-4 text-white shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Therapy Preference */}
            <div>
              <label className="text-xs sm:text-sm font-semibold text-gray-800 block mb-2.5">
                Therapy preference
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {THERAPY_PREFERENCE_OPTIONS.map((pref) => {
                  const isSelected = therapyPreference === pref
                  return (
                    <button
                      key={pref}
                      type="button"
                      onClick={() => setTherapyPreference(pref)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all text-center ${
                        isSelected
                          ? 'bg-black text-white border-black shadow-xs'
                          : 'bg-[#FAF5EE]/40 text-gray-700 border-[#EADBCE] hover:bg-white hover:border-gray-400'
                      }`}
                    >
                      {pref}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Step 2 Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[#EADBCE]/50">
              <div className="flex items-center gap-3 w-full sm:w-auto order-2 sm:order-1">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 py-2.5 px-3 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveProfile(true)}
                  disabled={loading}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-900 py-2.5 px-3 transition-colors cursor-pointer"
                >
                  Skip for now
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleSaveProfile(false)}
                disabled={loading}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-black text-white text-xs sm:text-sm font-bold py-3 px-7 rounded-full hover:bg-gray-800 transition-all active:scale-98 shadow-sm cursor-pointer disabled:opacity-50 order-1 sm:order-2"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Complete Profile</span>
                    <Check className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default CompleteProfile
